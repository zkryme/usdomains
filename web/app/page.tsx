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
          <h2>A name you can own and manage</h2>
          <p>
            Register a .usd name on Arc for 1–10 years. Your name is an NFT that lets you set an Arc payment address,
            renew, or transfer it. Apps must integrate the US Domains registry to resolve .usd names. None do yet, and a
            wallet, browser, or ENS will not resolve one on its own.
          </p>
          <Link href="/docs#register">Read the docs</Link>
        </div>
        <figure className="nft-sample">
          <figcaption className="nft-tag">Example NFT</figcaption>
          <div className="nft-art">
            <strong>alice.usd</strong>
            <span>US Domains</span>
          </div>
          <dl>
            <dt>Arc payment address</dt>
            <dd className="mono">0xA11CE000…0000A11C</dd>
          </dl>
        </figure>
      </section>
      <section className="welcome">
        <h2>Built for what&apos;s next on Arc</h2>
        <p>
          Your .usd name gives you a recognizable identity and an Arc payment address you control. We&apos;re building
          tools and integrations so more apps can use .usd names over time.
        </p>
        <Link href="/docs">Explore the docs →</Link>
      </section>
    </main>
  );
}
