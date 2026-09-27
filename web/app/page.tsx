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
      <section className="own">
        <div>
          <h2>Your name on Arc</h2>
          <p>
            Register a .usd name, manage it as an NFT, and choose the Arc payment address it points to. We&apos;re
            building integrations to bring .usd names into more apps.
          </p>
          <Link href="/docs">How .usd works →</Link>
        </div>
        <figure className="nft-sample">
          <div className="nft-art">
            <strong>jeremy.usd</strong>
            <span>US Domains</span>
          </div>
          <dl>
            <dt>Arc payment address</dt>
            <dd className="mono">0xA11CE000…0000A11C</dd>
          </dl>
        </figure>
      </section>
    </main>
  );
}
