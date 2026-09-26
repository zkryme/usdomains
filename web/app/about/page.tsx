import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="grid">
      <article className="card stack">
        <h2>Where .usd names work</h2>
        <p className="muted">
          This website is usdomains.xyz. A .usd name is separate from that address. The name works when another Arc
          application asks this registry who the current payment address is. That application must use the contracts, or
          the TypeScript helpers in this repository. The lookup returns a typed result. If the name is unsupported,
          expired, reserved, unregistered, or unset, there is no address to guess.
        </p>
        <p className="muted">
          MetaMask does not resolve .usd. ENS does not resolve .usd. Browsers do not resolve .usd. Sending tokens to a
          name inside a wallet that has not integrated this registry will not find the payment address for you. An app
          that wants to send to a name follows the <Link href="/integrate">integration guide</Link>.
        </p>
        <p className="muted">
          The NFT metadata describes the label. It is not proof of ownership or expiry. After a name expires, or after
          someone else registers it, a wallet may still show an old image. Read the registrar before you send.
        </p>
      </article>
      <article className="card stack">
        <h2>Rules that do not change</h2>
        <ul className="list">
          <li>Lowercase letters, digits, and single hyphens between characters. 3 to 32 characters. No emoji or other symbols.</li>
          <li>One to ten years. Grace starts at 30 days and can be scheduled between 7 and 90.</li>
          <li>30 USDC per year for 3 characters, 20 for 4, and 10 for 5 to 32. Payment is exact USDC, 6 decimals. Native value is rejected.</li>
          <li>No administrator can take a name that is still active or in grace.</li>
          <li>The reserved list cannot catch every lookalike.</li>
        </ul>
      </article>
    </main>
  );
}
