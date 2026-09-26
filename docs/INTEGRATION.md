# Use a .usd name from an app

A wallet, a browser, and ENS will not turn `alice.usd` into an address. The app that sends the payment has to read this registry and stop unless the result is a live address.

The helpers live in `sdk/`. The package is not published to npm. Copy `sdk/src` or depend on this repository. The same rules apply if you call the contracts with viem or ethers and skip the helper.

## Network

Use Arc mainnet.

| | |
| --- | --- |
| Chain id | `5042` |
| RPC | `https://rpc.mainnet.arc.io` |
| USDC | `0x3600000000000000000000000000000000000000` |
| USDC decimals for a transfer | 6 |
| Native gas decimals | 18 |

Name payments use the ERC-20 interface. Do not put the registration or the sent amount in `msg.value`. Gas is a separate native balance. The two units differ by `1e12`.

Contract addresses are in `deployments/arc-mainnet.json`. Until `deployed` is `true`, there is no registrar to call and no address to pay. Do not hard-code a guess.

## Resolve before you send

`resolveUsdName` is the call to use. Send only when `status` is `"resolved"`. Every other status means there is no payment address.

| Status | Meaning | What the app does |
| --- | --- | --- |
| `resolved` | The name is active and has a payment address | Send the ERC-20 USDC to `address` |
| `unset` | The name is active and the owner has not set an address | Stop |
| `expired` | The term has ended, or it is in the grace period | Stop. Grace does not resolve |
| `unregistered` | Nobody holds it | Stop |
| `reserved` | The label is blocked | Stop |
| `unsupported` | The label is not a valid `.usd` name, or the contracts are not deployed | Stop |

There is no fallback. Do not use the NFT owner, the metadata image, a text record, or a cached address from an earlier session.

```ts
import { createPublicClient, http, parseUnits } from "viem";
import { resolveUsdName, type UsdContracts } from "@usd-names/sdk";

const contracts: UsdContracts = {
  chainId: 5042,
  deployed: false,
  registrar: null,
  name: null,
  resolver: null,
  reverse: null,
  usdc: "0x3600000000000000000000000000000000000000",
  startBlock: null,
};

const client = createPublicClient({
  chain: {
    id: 5042,
    name: "Arc",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  },
  transport: http("https://rpc.mainnet.arc.io"),
});

const result = await resolveUsdName(client, contracts, "alice.usd");
if (result.status !== "resolved") {
  throw new Error(`Not sending. alice.usd is ${result.status}.`);
}

const destination = result.address;
const amount = parseUnits("1", 6);
```

Fill `contracts` from `deployments/arc-mainnet.json` after that file says `deployed: true`. `alice` and `alice.usd` are the same input. The helper lowercases. The contract does not. A direct call with uppercase, emoji, or a bad hyphen reverts.

Under the helper, a resolve is two reads:

1. `USDRegistrar.inspect(label)` — availability `3` means active. `4` is grace. `5` is lapsed. `2` is reserved. `1` is available. `0` is invalid.
2. `USDResolver.addrIfActive(label)` — the payment address. It returns `address(0)` unless the name is active.

Do not call `USDResolver.addr(tokenId)` for a payment. That returns a stored record even after the name has expired.

## Show a name for a wallet

`reverseLookupUsdName` returns `{ status: "verified", name, address }` only when the wallet's primary name still forward-resolves to that same wallet. Anything else is `{ status: "none" }`. Do not display a primary name from an event log or from the NFT alone.

## Quote a registration

`getPrice(client, contracts, "alice.usd", years)` returns a 6-decimal USDC amount. Years are 1 to 10. The annual price is 30 USDC for 3 characters, 20 for 4, and 10 for 5 to 32. Registration is a commit, a wait of at least 60 seconds, an ERC-20 approval for the exact quote, then `reveal`. The commitment binds the label, recipient, years, resolver, payer, secret, chain id, and registrar. The payer who reveals must be the payer in the commitment.

`sdk/examples/integrate.ts` is the send path. It refuses every status other than `resolved`.
