import Link from "next/link";
import { SearchForm } from "@/components/search-form";

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <p className="pill">US Domains</p>
        <h1>A .usd name for an Arc address.</h1>
        <p className="lede">
          Search <span className="mono">name.usd</span>, see whether it can be registered, and pay USDC for one to ten
          years. The NFT is control of the name. The payment address is whatever the current owner sets.
        </p>
        <SearchForm />
      </section>
      <section className="grid">
        <article className="card">
          <h2>What you are buying</h2>
          <ul className="list">
            <li>A lowercase label, an ERC-721, and a fixed term.</li>
            <li>The right to point that name at an Arc address, renew it, transfer it, or set it as primary.</li>
            <li>After the term and the grace period, someone else can register the same label.</li>
          </ul>
          <p className="muted">
            Example prices: 88 USDC/year for 3 characters, 18 for 4, and 8 for 5 to 32. A scheduled change is shown
            on the name page before you commit. One- and two-character names are not for sale. 32 characters is the longest name.
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
