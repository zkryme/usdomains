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
            <Link href="/docs">Docs</Link>
            <Link href="/about">About</Link>
            {isConnected ? <Link href="/portfolio">My names</Link> : null}
            <ConnectButton showBalance={false} />
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
