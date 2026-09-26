import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs",
  description: "How an Arc app resolves a .usd name and when it must refuse to send USDC.",
};

const sample = `import { createPublicClient, http, parseUnits } from "viem";
import { resolveUsdName, type UsdContracts } from "@usd-names/sdk";

const contracts: UsdContracts = {
  chainId: 5042,
  deployed: false, // set from deployments/arc-mainnet.json
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
const amount = parseUnits("1", 6);`;

export default function DocsPage() {
  return (
    <main className="docs">
      <nav className="docs-nav" aria-label="Docs">
        <p>Reference</p>
        <a href="#overview">Overview</a>
        <a href="#network">Network</a>
        <a href="#resolve">Resolve</a>
        <a href="#status">Status values</a>
        <a href="#reads">Contract reads</a>
        <a href="#reverse">Primary name</a>
        <a href="#price">Price</a>
      </nav>
      <article className="docs-body">
        <p className="docs-kicker">Docs</p>
        <h1>Integrate .usd</h1>
        <p className="lede">
          An app resolves a name by reading this registry. A wallet, a browser, and ENS will not do that lookup.
        </p>

        <h2 id="overview">Overview</h2>
        <p>
          Send USDC only when <code>resolveUsdName</code> returns <code>resolved</code>. Every other status means there
          is no payment address. Do not fall back to the NFT owner, the token image, a text record, or an address saved
          from an earlier session.
        </p>
        <p>
          The helpers are in <code>sdk/</code> in this repository. The package is not on npm. Copy that folder, or call
          the same contract reads with viem or ethers. <code>alice</code> and <code>alice.usd</code> are the same input
          to the helper. The helper lowercases. The contract does not.
        </p>

        <h2 id="network">Network</h2>
        <p>Use Arc mainnet. Name payments use the ERC-20 interface. Gas is a separate native balance.</p>
        <table>
          <tbody>
            <tr>
              <th>Chain id</th>
              <td><code>5042</code></td>
            </tr>
            <tr>
              <th>RPC</th>
              <td><code>https://rpc.mainnet.arc.io</code></td>
            </tr>
            <tr>
              <th>USDC</th>
              <td><code>0x3600000000000000000000000000000000000000</code></td>
            </tr>
            <tr>
              <th>Transfer decimals</th>
              <td>6</td>
            </tr>
            <tr>
              <th>Gas decimals</th>
              <td>18</td>
            </tr>
          </tbody>
        </table>
        <p>
          Do not put a name payment or a registration fee in <code>msg.value</code>. The two units differ by{" "}
          <code>1e12</code>. Contract addresses are in <code>deployments/arc-mainnet.json</code>. Until{" "}
          <code>deployed</code> is true, there is no registrar to call.
        </p>

        <h2 id="resolve">Resolve</h2>
        <p>This is the send path. Fill <code>contracts</code> from the deployment file after it is deployed.</p>
        <div className="snippet">
          <p className="docs-label">resolve.ts</p>
          <pre>
            <code>{sample}</code>
          </pre>
        </div>

        <h2 id="status">Status values</h2>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Meaning</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>resolved</code></td>
              <td>Active, and a payment address is set.</td>
              <td>Send ERC-20 USDC to <code>address</code>.</td>
            </tr>
            <tr>
              <td><code>unset</code></td>
              <td>Active, and no address is set.</td>
              <td>Stop.</td>
            </tr>
            <tr>
              <td><code>expired</code></td>
              <td>The term ended, or the name is in grace.</td>
              <td>Stop. Grace does not resolve.</td>
            </tr>
            <tr>
              <td><code>unregistered</code></td>
              <td>Nobody holds the label.</td>
              <td>Stop.</td>
            </tr>
            <tr>
              <td><code>reserved</code></td>
              <td>The label is blocked.</td>
              <td>Stop.</td>
            </tr>
            <tr>
              <td><code>unsupported</code></td>
              <td>The label is invalid, or the contracts are not deployed.</td>
              <td>Stop.</td>
            </tr>
          </tbody>
        </table>

        <h2 id="reads">Contract reads</h2>
        <p>A resolve is two reads.</p>
        <ol className="list">
          <li>
            <code>USDRegistrar.inspect(label)</code> returns availability. <code>3</code> is active, <code>4</code> is
            grace, <code>5</code> is lapsed, <code>2</code> is reserved, <code>1</code> is available, and <code>0</code>{" "}
            is invalid.
          </li>
          <li>
            <code>USDResolver.addrIfActive(label)</code> returns the payment address. It returns the zero address unless
            the name is active.
          </li>
        </ol>
        <p>
          <code>USDResolver.addr(tokenId)</code> still returns a stored record after expiry. Do not pay that address. A
          direct call with uppercase, emoji, or a bad hyphen reverts.
        </p>

        <h2 id="reverse">Primary name</h2>
        <p>
          <code>reverseLookupUsdName</code> returns <code>verified</code> only when that wallet’s primary name still
          forward-resolves to the same wallet. Anything else is <code>none</code>. Do not display a primary name from an
          event log or from the NFT alone.
        </p>

        <h2 id="price">Price</h2>
        <p>
          <code>getPrice(client, contracts, &quot;alice.usd&quot;, years)</code> returns a 6-decimal USDC amount. A term
          is 1 to 10 years.
        </p>
        <table>
          <thead>
            <tr>
              <th>Length</th>
              <th>Annual price</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>3 characters</td>
              <td>30 USDC</td>
            </tr>
            <tr>
              <td>4 characters</td>
              <td>20 USDC</td>
            </tr>
            <tr>
              <td>5 to 32</td>
              <td>10 USDC</td>
            </tr>
          </tbody>
        </table>
        <p>
          Registration is a commit, a wait of at least 60 seconds, an ERC-20 approval for the exact quote, then{" "}
          <code>reveal</code>. The commitment binds the label, recipient, years, resolver, payer, secret, chain id, and
          registrar. The payer who reveals must be the payer in the commitment.{" "}
          <code>sdk/examples/integrate.ts</code> refuses every status other than <code>resolved</code>.
        </p>
      </article>
    </main>
  );
}
