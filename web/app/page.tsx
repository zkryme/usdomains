import Link from "next/link";
import { SearchForm } from "@/components/search-form";

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <h1>Find your .usd name</h1>
        <p className="lede">
          Search a name, register it for one to ten years, and point it at an Arc address. You pay the yearly price in USDC.
        </p>
        <SearchForm />
        <div className="prices">
          <div className="price">
            <span className="muted">3 characters</span>
            <b>30 USDC</b>
            <span className="muted">per year</span>
          </div>
          <div className="price">
            <span className="muted">4 characters</span>
            <b>20 USDC</b>
            <span className="muted">per year</span>
          </div>
          <div className="price">
            <span className="muted">5 or more</span>
            <b>10 USDC</b>
            <span className="muted">per year, up to 32 characters</span>
          </div>
        </div>
      </section>
      <section className="grid">
        <article className="card">
          <h2>What you are buying</h2>
          <ul className="list">
            <li>A lowercase label, an ERC-721, and a term of one to ten years.</li>
            <li>The right to set the Arc payment address, renew, transfer, or choose a primary name.</li>
            <li>After the term and the grace period, someone else can register the same label.</li>
          </ul>
          <p className="muted">One- and two-character names are not for sale. A scheduled price change is shown before you commit.</p>
        </article>
        <article className="card">
          <h2>Where it resolves</h2>
          <p className="muted">
            Only in apps that read this registry. A wallet, a browser, or ENS will not turn <span className="mono">alice.usd</span> into
            an address on its own. <Link href="/docs">Read the docs.</Link> <Link href="/about">Read the plain-language explanation.</Link>
          </p>
        </article>
      </section>
    </main>
  );
}
