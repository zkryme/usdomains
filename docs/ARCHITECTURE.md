# Architecture and threat model

`.usd` is an independent naming service on Arc. A name such as `alice.usd` is an ERC-721 registration with an optional Arc payment address. It is not a DNS domain, not an ENS name, and not a Circle product. Wallets, browsers, and other apps do not resolve it unless they integrate the contracts or the SDK.

Checked against Arc documentation on 2026-09-26: testnet chain id `5042002`, RPC `https://rpc.testnet.arc.io`, explorer `https://explorer.testnet.arc.io`; mainnet chain id `5042`, RPC `https://rpc.mainnet.arc.io`. USDC on both networks is `0x3600000000000000000000000000000000000000`. `decimals()` is 6. The same balance is also the native gas token, and native `msg.value` uses 18 decimals. The difference is `1e12`. These contracts charge only through the ERC-20 interface, in 6-decimal base units. `receive` and `fallback` revert, so native value is not a payment. Gas is separate and is paid from the same USDC balance in native units. Do not convert between the two precisions in payment math.

## Contracts

The contracts are immutable. There is no proxy.

| Contract | Role |
| --- | --- |
| `USDName` | ERC-721. Token id is `uint256(keccak256(bytes(label)))`, so one label has one token id. Only the registrar mints or burns. A transfer clears the previous owner's primary name immediately. |
| `USDRegistrar` | Availability, commit-and-reveal registration, renewal, grace, pricing, exact USDC collection, reservations, and pause. |
| `USDResolver` | Forward address and optional text. Live reads (`addrIfActive`, `textIfActive`) are empty unless the name is active. |
| `USDReverse` | Preferred name. `reverse` returns a label only when the name is active, the wallet owns it, and the forward address is that wallet. |
| `ReservedNames` | Label hashes that public registration must reject. |
| `USDMetadata` | On-chain `tokenURI`. It describes the label and phase. It is not the source of truth for ownership or expiry. |

Registration starts paused. The deploy script seeds the reserved list, confirms every label on-chain, closes the seed operator, and does not unpause.

## Choices that permanently affect buyers

**Normalization.** The contract accepts only lowercase `a-z`, digits, and a single hyphen between characters. It rejects uppercase, emoji, empty labels, leading, trailing, or repeated hyphens, and any other byte. Public length is 3 to 32. One- and two-character names cannot be minted in v1. The UI lowercases before submission; the contract still rejects uppercase, emoji, and other characters if they are sent directly. There is no Unicode and no confusable folding. `alice.eth`, `a.b.usd`, and mixed case are unsupported. Because the contracts are immutable, these rules cannot be widened later on this deployment.

**Expiry.** A year is 365 days. A registration is 1 to 10 years, and the resulting expiry cannot be more than 10 years from the current time.

- Active while `block.timestamp < expiry`. The name resolves and the owner can manage records.
- Grace while `block.timestamp < expiry + grace`. Default grace is 30 days, and an administrator can schedule a new grace between 7 and 90 days with at least 7 days of notice. The name does not resolve. The NFT owner can still renew and edit stored records. A third party may also pay to renew. Renewal during grace starts from the current time, not from the old expiry, so leftover grace is not prepaid time.
- After grace, the owner loses management even if the NFT still exists. Transfer of that NFT does not restore control. Anyone may `finalizeExpiry`, which burns the NFT and increments the resolver version. The next `reveal` does the same burn if it has not happened yet, then mints the same token id to the new recipient.

**Administrator powers that remain.** `DEFAULT_ADMIN_ROLE` and `ADMIN_ROLE` can pause new registrations, schedule prices, schedule grace, reserve or release unregistered labels, change the treasury address, and grant or revoke roles. `TREASURY_ROLE` can withdraw accounted fees, and any donated ERC-20 surplus above that balance, only to the treasury address. Prices cannot be zero and cannot exceed 100,000 USDC per year. A price change needs at least one day of delay. There is no free, allowlisted, or promotional mint. `reveal` is the only mint path, and it checks reservations.

Pause blocks only `commit` and `reveal`. It does not block transfer, record updates, or renewal. A pause can still cause an in-flight commitment to expire, because a commitment is valid for at most one day.

Shortening the grace period can, after the scheduled delay, make a name claimable sooner. Lengthening it gives the current registrant more time to renew. Buyers should read the posted grace schedule before relying on the default 30 days.

**What an administrator cannot do.** No role can seize, rewrite, transfer, or burn an active or in-grace name. Reserving a label that still has an NFT reverts until grace has ended and the NFT has been finalized. See [DISPUTES.md](DISPUTES.md).

**Reservations.** The seed list in `script/reserved-names.json` is version controlled, with a reason for each label. It covers the required brand, platform, and authority names plus practical concatenations and hyphenations. A blocklist cannot catch every variation or a future trademark. Reserved labels fail every public path because there is only one public path.

**Commit-and-reveal.** The commitment is `keccak256(abi.encode(label, recipient, years, resolver, payer, secret, chainId, registrar))`. The public `commitmentHash` fills in the wired resolver, `msg.sender` is checked at reveal as the payer, and the chain id and registrar address are included. A copied reveal cannot mint the name to someone else. Each commitment is deleted on reveal. A still-valid commitment cannot be overwritten; an expired one can, so a failed transaction can be retried with a new commit. Minimum age is 60 seconds and maximum age is one day.

The price is read at reveal, after any scheduled price has taken effect. Underpayment reverts. A fee-on-transfer or short transfer reverts with `PaymentMismatch`. Excess is not pulled: the registrar pulls the exact quote. Native value is rejected.

**Records and metadata.** Address and text writes require the current NFT owner or an approved operator, and only during the active or grace window. Text keys are at most 32 bytes and values at most 256 bytes. Burning increments the record version, so the next owner cannot read the old address or text. A reverse record is cleared on transfer and burn, and a read hides anything that no longer forward-resolves to the wallet. Metadata and any HTTP copy of it can be cached by a wallet after expiry or re-registration. The registrar and NFT are authoritative.

**Third-party renewal.** Anyone can pay to extend a name that is still renewable. That does not change the owner. It can delay expiry. That is intentional and is a griefing path: an outsider can spend USDC to keep a name out of the public pool.

## Threat model

| Threat | Response |
| --- | --- |
| Front-run a reveal and take the name | Reveal requires the committed payer. The secret is not useful to a different sender. |
| Replay a commitment | The commitment is deleted. A live commitment cannot be replaced. |
| Register a reserved or lookalike brand | Exact reserved labels revert. Other lookalikes are not caught. The UI says so. |
| Pay with 18-decimal native value or the wrong amount | Native value reverts. The ERC-20 pull is exact and checks the balance delta. |
| Reenter on USDC transfer | Registration and withdrawal use a reentrancy guard, and state is updated before the external call returns control. |
| Spoof a primary name | `reverse` checks ownership, activity, and the forward address. |
| Write another person's records | `canManage` requires the owner or operator and the renewal window. |
| Admin drains a user's name | No such function. Treasury withdrawal sends only the registrar's USDC to the treasury. |
| Metadata server lies about ownership | `tokenURI` is on-chain and still not authoritative. Clients must read the registrar. |
| Commitment expires during a pause or outage | The user commits again. The secret in local storage lets the same wallet retry until the commitment expires. |

Trust assumptions: the admin and treasury controller are honest about pause, pricing, grace, reservations of unregistered labels, and withdrawal of collected fees. The intended production holder of those roles is a multisig. The seed operator exists only during deployment and is closed before public use. USDC and Arc are trusted for transfers and finality. Arc timestamps are non-decreasing. There is no on-chain oracle for trademarks.

These contracts have not been audited.
