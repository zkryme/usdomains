import Link from "next/link";
import { SearchForm } from "@/components/search-form";

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">{"{ .USD ON ARC }"}</p>
        <h1>A name for an address on Arc.</h1>
        <p className="lede">
          Register <span className="mono">name.usd</span>, pay in USDC, and point it at an Arc address. The NFT is
          control of the name. Wallets do not resolve it unless they read this registry.
        </p>
        <SearchForm />
      </section>
      <section className="grid">
        <article className="card">
          <h2>What you are buying</h2>
          <ul className="list">
            <li>A lowercase label, an ERC-721, and a term of one to ten years.</li>
            <li>The right to set the Arc payment address, renew, transfer, or choose a primary name.</li>
            <li>After the term and the grace period, someone else can register the same label.</li>
          </ul>
          <p className="muted">
            88 USDC/year for 3 characters, 18 for 4, and 8 for 5 to 32. One- and two-character names are not for sale.
            A scheduled price change is shown before you commit.
          </p>
        </article>
        <article className="card">
          <h2>Where it resolves</h2>
          <p className="muted">
            Only in apps that read this registry. A wallet, a browser, or ENS will not turn <span className="mono">alice.usd</span> into
            an address on its own. <Link href="/about">Read the plain-language explanation.</Link>
          </p>
        </article>
      </section>
    </main>
  );
}
