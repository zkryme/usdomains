import Link from "next/link";
import { SearchForm } from "@/components/search-form";

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <h1>Find a .usd name</h1>
        <p className="lede">Register it on Arc and point it at an address. You pay the yearly price in USDC.</p>
        <SearchForm />
        <p className="price-strip">
          3 characters: 30 USDC/year · 4 characters: 20 USDC/year · 5–32 characters: 10 USDC/year
        </p>
      </section>
      <section className="how" aria-label="How it works">
        <article>
          <span>1</span>
          <h2>Search a name</h2>
          <p>Check the label, the yearly price, and whether it can be registered.</p>
        </article>
        <article>
          <span>2</span>
          <h2>Register for 1–10 years</h2>
          <p>Commit the name, wait at least 60 seconds, then pay the exact USDC quote.</p>
        </article>
        <article>
          <span>3</span>
          <h2>Set its Arc payment address</h2>
          <p>The NFT controls the name. Apps that read this registry can then resolve it.</p>
        </article>
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
