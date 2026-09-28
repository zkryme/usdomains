"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { registrarAbi } from "@usd-names/sdk";
import Link from "next/link";
import { zeroAddress, type Address } from "viem";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { deploymentFor } from "@/lib/deployment";

export function Shell({ children }: { children: React.ReactNode }) {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const deployment = deploymentFor(isConnected ? chainId : 5042);
  const wrongNetwork = isConnected && deployment.network !== "mainnet";
  const registrar = (deployment.registrar ?? zeroAddress) as Address;
  const live = Boolean(isConnected && deployment.deployed && deployment.registrar && !wrongNetwork);
  const role = useReadContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "TREASURY_ROLE",
    query: { enabled: live },
  });
  const treasurer = useReadContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "hasRole",
    args: [role.data ?? `0x${"0".repeat(64)}`, address ?? zeroAddress],
    query: { enabled: live && role.data != null && Boolean(address) },
  });

  return (
    <div className="sky">
      <header className="top">
        <div className="top-inner">
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
            {treasurer.data ? <Link href="/withdraw">Funds</Link> : null}
            <ConnectButton showBalance={false} />
          </nav>
        </div>
      </header>
      <div className="shell">
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
