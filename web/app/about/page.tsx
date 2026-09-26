import Link from "next/link";

export default function AboutPage() {
  return (
    <main>
      <section className="welcome">
        <h1>Built for what&apos;s next on Arc</h1>
        <p>
          Your .usd name gives you a recognizable identity and an Arc payment address you control. We&apos;re building
          tools and integrations so more apps can use .usd names over time.
        </p>
        <Link href="/docs">Explore the docs →</Link>
      </section>
    </main>
  );
}
