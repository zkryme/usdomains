"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useAccount, useChainId } from "wagmi";
import { deploymentFor } from "@/lib/deployment";

export function Shell({ children }: { children: React.ReactNode }) {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const deployment = deploymentFor(isConnected ? chainId : 5042002);
  const mainnet = deployment.network === "mainnet";

  return (
    <div className="shell">
      <header className="top">
        <Link href="/" className="brand">
          <strong>US Domains</strong>
          <span>usdomains.xyz</span>
        </Link>
        <nav className="nav">
          <Link href="/portfolio">Portfolio</Link>
          <Link href="/about">Where names work</Link>
          <ConnectButton />
        </nav>
      </header>
      <div className={mainnet ? "banner mainnet" : "banner"}>
        {mainnet ? (
          <>
            <strong>Arc mainnet.</strong> This deployment is not live. Do not send funds. Mainnet configuration exists
            only so the network is not confused with Arc Testnet.
          </>
        ) : (
          <>
            <strong>Arc Testnet.</strong> Chain id 5042002. Registration stays paused until a reviewed deploy.
            {deployment.deployed ? " Contracts are deployed and new registrations are still paused." : " Contracts are not deployed, so this site will not ask for a payment."}
          </>
        )}
      </div>
      {children}
    </div>
  );
}
