import Link from "next/link";
import { mainnetDeployment } from "@/lib/deployment";

const openSea = mainnetDeployment.name ? `https://opensea.io/assets/arc/${mainnetDeployment.name}` : null;

export default function AboutPage() {
  return (
    <main className="about-page">
      <p className="docs-kicker">About</p>
      <h1>Built for what&apos;s next on Arc</h1>
      <p>
        Your .usd name gives you a recognizable identity and an Arc payment address you control. We&apos;re building
        tools and integrations so more apps can use .usd names over time.
      </p>
      <Link href="/docs">Explore the docs →</Link>
      <div className="about-places" aria-label="Places for links">
        <div>
          <strong>X</strong>
          <a href="https://x.com/usd_domains" target="_blank" rel="noopener noreferrer">
            @usd_domains
          </a>
        </div>
        <div>
          <strong>OpenSea</strong>
          {openSea ? <a href={openSea}>View the name NFTs</a> : <span>Link coming soon</span>}
        </div>
      </div>
    </main>
  );
}
