import Link from "next/link";

const sample = `import { createPublicClient, http, parseUnits } from "viem";
import { resolveUsdName, type UsdContracts } from "@usd-names/sdk";

const contracts: UsdContracts = {
  chainId: 5042,
  deployed: false, // true only after deployments/arc-mainnet.json is filled in
  registrar: null,
  resolver: null,
  name: null,
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
  throw new Error(\`Not sending. alice.usd is \${result.status}.\`);
}

const destination = result.address;
const amount = parseUnits("1", 6); // ERC-20 USDC. Not msg.value.`;

export default function IntegratePage() {
  return (
    <main className="docs">
      <article className="card stack">
        <h2>Use a .usd name from an app</h2>
        <p className="muted">
          A wallet will not resolve <span className="mono">alice.usd</span> for you. Read this registry in your own app, and
          send USDC only when the result is a live address. The helpers are in <span className="mono">sdk/</span> in the
          repository. The package is not on npm.
        </p>
        <p className="muted">
          Arc mainnet is chain id 5042, RPC <span className="mono">https://rpc.mainnet.arc.io</span>. USDC is{" "}
          <span className="mono">0x3600000000000000000000000000000000000000</span>, 6 decimals for the transfer. Gas is
          native and uses 18 decimals. Do not put the payment in <span className="mono">msg.value</span>.
        </p>
        <p className="muted">
          Addresses come from <span className="mono">deployments/arc-mainnet.json</span>. Until that file says the
          contracts are deployed, there is nowhere to send.
        </p>
      </article>
      <article className="card stack">
        <h2>Send only on resolved</h2>
        <ul className="list">
          <li>
            <strong>resolved</strong> — the name is active and has a payment address. Send ERC-20 USDC there.
          </li>
          <li>
            <strong>unset</strong> — active, but the owner has not set an address. Stop.
          </li>
          <li>
            <strong>expired</strong> — the term ended, or the name is in grace. Grace does not resolve. Stop.
          </li>
          <li>
            <strong>unregistered</strong> or <strong>reserved</strong> — stop.
          </li>
          <li>
            <strong>unsupported</strong> — the label is invalid, or the contracts are not deployed. Stop.
          </li>
        </ul>
        <p className="muted">
          Do not fall back to the NFT owner, the token image, a text record, or an address you saved earlier.{" "}
          <Link href="/about">Names are not DNS and not ENS.</Link>
        </p>
        <pre>
          <code>{sample}</code>
        </pre>
      </article>
      <article className="card stack">
        <h2>The two reads underneath</h2>
        <p className="muted">
          <span className="mono">USDRegistrar.inspect(label)</span> returns availability. 3 is active, 4 is grace, 5 is
          lapsed, 2 is reserved, 1 is available, and 0 is invalid. Then{" "}
          <span className="mono">USDResolver.addrIfActive(label)</span> returns the payment address, or the zero address
          when the name is not active.
        </p>
        <p className="muted">
          <span className="mono">USDResolver.addr(tokenId)</span> still returns a stored record after expiry. Do not pay
          that address. A primary name from <span className="mono">reverseLookupUsdName</span> is shown only when the
          contract verifies that the name still points at the same wallet.
        </p>
        <p className="muted">
          A year is 30 USDC for 3 characters, 20 for 4, and 10 for 5 to 32, quoted in 6-decimal USDC for 1 to 10 years.
          The same text is in the repository at <span className="mono">docs/INTEGRATION.md</span>.
        </p>
      </article>
    </main>
  );
}
