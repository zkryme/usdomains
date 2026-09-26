# US Domains

The website is [usdomains.xyz](https://usdomains.xyz). It is an independent Arc naming service for `.usd` names. `alice.usd` is an ERC-721 registration with an optional Arc payment address. It is not a DNS domain, not an ENS name, and not a Circle product. MetaMask, browsers, and other apps do not resolve `.usd` unless they call these contracts.

The contracts are immutable. Registration is paused. This repository does not deploy to Arc mainnet and does not open a public mint.

## Contracts

`USDName` is the NFT. The token id is the hash of the canonical label. `USDRegistrar` sells, renews, and expires names and pulls exact USDC. `USDResolver` stores the payment address and short text records. `USDReverse` stores a primary name and returns it only when it still forward-resolves to that wallet. `ReservedNames` blocks labels that must not be minted.

Public labels are lowercase `a-z`, digits, and single hyphens between characters, 3 to 32 characters. Emoji and every other character revert in the contract. A term is 1 to 10 years of 365 days. Prices are 30 USDC per year for 3 characters, 20 for 4, and 10 for 5 to 32. Prices are 6-decimal ERC-20 base units. Native `msg.value` is 18 decimals and is rejected.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before relying on a name. It covers expiry, grace, administrator powers, and normalization. Version 1 has no dispute process: [docs/DISPUTES.md](docs/DISPUTES.md). Apps that send funds to a name follow [docs/INTEGRATION.md](docs/INTEGRATION.md).

## Develop

```bash
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts --no-commit
forge test
npm install
npm run test:sdk
npm run dev
```

Foundry is expected at `%USERPROFILE%\.foundry\bin` if it is not on `PATH`. `lib/` is not committed.

## Website

Import this repository in Vercel and set the root directory to `web`. The Next.js app is an npm workspace that depends on `sdk/`, so the install must still see the repository root. Do not put a deployer key in the Vercel project. Contract deployment is separate and stays paused.

## Arc mainnet deploy

The product network is Arc mainnet, chain id `5042`, RPC `https://rpc.mainnet.arc.io`. This workspace had no `PRIVATE_KEY` and no funded deployer, so the contracts have not been broadcast. Registration cannot accept USDC until that deploy exists.

When a mainnet key is funded:

```bash
set USD_CONFIRM_MAINNET=YES
set USD_OPEN_MINT=YES
set PRIVATE_KEY=...
set USD_ADMIN=0x...
set USD_TREASURY=0x...
set USD_TREASURY_CONTROLLER=0x...
forge script script/DeployMainnet.s.sol --rpc-url arc_mainnet --broadcast --slow --with-gas-price 25000000000
```

Use a multisig for `USD_ADMIN` and `USD_TREASURY_CONTROLLER`. `USD_OPEN_MINT=YES` unpauses registration after the reserved names are confirmed. Gas is native USDC, and `maxFeePerGas` must be at least 20 gwei. Copy the addresses written to `deployments/arc-mainnet.json` into the app if the script is not run from this repository.

Arc Testnet remains available with `script/DeployTestnet.s.sol`, chain id `5042002`, and `USD_CONFIRM_TESTNET=YES`. That script leaves registration paused.

## Privileged roles

| Role | What it can do |
| --- | --- |
| `DEFAULT_ADMIN_ROLE` | Grant and revoke `ADMIN_ROLE` and `TREASURY_ROLE`. |
| `ADMIN_ROLE` | Pause new registrations, schedule prices and grace, reserve or release unregistered labels, set the treasury address. |
| `TREASURY_ROLE` | Withdraw collected USDC, and donated ERC-20 surplus, to the treasury address only. |
| Seed operator | Reserve the seed list during deploy, then `closeSeed` removes it. Only while registration is paused. |

None of these roles can seize, transfer, burn, or rewrite a name that is active or in grace. Pause does not block transfer, renewal, or record updates.

## Where a name works

Only software that reads this registrar and resolver. `resolveUsdName` in `sdk/` returns `unsupported`, `expired`, `reserved`, `unregistered`, or `unset` instead of guessing an address. See `sdk/examples/integrate.ts`.

## Status

These contracts have not been audited. The reserved list cannot catch every lookalike or future trademark. Metadata can be cached after expiry; the contract is authoritative.
