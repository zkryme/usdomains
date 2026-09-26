"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useAccount, useChainId } from "wagmi";
import { deploymentFor } from "@/lib/deployment";

export function Shell({ children }: { children: React.ReactNode }) {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const deployment = deploymentFor(isConnected ? chainId : 5042);
  const wrongNetwork = isConnected && deployment.network !== "mainnet";

  return (
    <div className="sky">
      <svg className="arcs" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d="M-40 760C220 620 380 180 760 120" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.4" />
        <path d="M980 -40C860 220 1120 420 1500 520" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.4" />
        <path d="M-80 80C180 40 260 280 140 460" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
        <circle cx="760" cy="120" r="3" fill="white" />
        <circle cx="1120" cy="300" r="3" fill="white" />
      </svg>
      <div className="shell">
        <header className="top">
          <Link href="/" className="brand">
            <span className="mark">U</span>
            <span className="word">
              <strong>US Domains</strong>
              <span>usdomains.xyz</span>
            </span>
          </Link>
          <nav className="nav">
            <Link href="/portfolio">Portfolio</Link>
            <Link href="/about">Where names work</Link>
            <ConnectButton />
          </nav>
        </header>
        {wrongNetwork ? (
          <div className="banner">
            <strong>Switch to Arc.</strong> .usd names are registered on Arc mainnet, chain id 5042.
          </div>
        ) : deployment.network === "testnet" ? (
          <div className="banner">
            <strong>Arc Testnet.</strong> This wallet is not on Arc mainnet.
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
