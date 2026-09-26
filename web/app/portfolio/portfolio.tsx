"use client";

import { nameAbi, registrarAbi, reverseAbi } from "@usd-names/sdk";
import Link from "next/link";
import { useEffect, useState } from "react";
import { parseAbiItem } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { deploymentFor } from "@/lib/deployment";
import { formatWhen } from "@/lib/format";

type Holding = {
  tokenId: bigint;
  label: string;
  phase: string;
  expiry: bigint;
};

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");

export function Portfolio() {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const deployment = deploymentFor(isConnected ? chainId : 5042002);
  const client = usePublicClient({ chainId: deployment.chainId });
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [primary, setPrimary] = useState("none");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address || !client || !deployment.deployed || !deployment.name || !deployment.registrar || !deployment.reverse || deployment.startBlock == null) {
      return;
    }
    const chain = client;
    const wallet = address;
    const name = deployment.name;
    const registrar = deployment.registrar;
    const reverse = deployment.reverse;
    const startBlock = deployment.startBlock;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const latest = await chain.getBlockNumber();
        const ids = new Set<bigint>();
        const page = 9000n;
        for (let from = startBlock; from <= latest; from += page) {
          const to = from + page - 1n > latest ? latest : from + page - 1n;
          const logs = await chain.getLogs({
            address: name,
            event: transferEvent,
            args: { to: wallet },
            fromBlock: from,
            toBlock: to,
          });
          for (const log of logs) {
            if (log.args.tokenId != null) ids.add(log.args.tokenId);
          }
        }

        const next: Holding[] = [];
        for (const tokenId of ids) {
          try {
            const owner = await chain.readContract({ address: name, abi: nameAbi, functionName: "ownerOf", args: [tokenId] });
            if (owner.toLowerCase() !== wallet.toLowerCase()) continue;
            const [label, phase, expiry] = await Promise.all([
              chain.readContract({ address: name, abi: nameAbi, functionName: "labelOf", args: [tokenId] }),
              chain.readContract({ address: registrar, abi: registrarAbi, functionName: "phase", args: [tokenId] }),
              chain.readContract({ address: registrar, abi: registrarAbi, functionName: "expiryOf", args: [tokenId] }),
            ]);
            const phaseText = phase === 1 ? "active" : phase === 2 ? "grace" : phase === 3 ? "lapsed" : "unknown";
            next.push({ tokenId, label, phase: phaseText, expiry });
          } catch {
            continue;
          }
        }
        const lookedUp = await chain.readContract({
          address: reverse,
          abi: reverseAbi,
          functionName: "reverse",
          args: [wallet],
        });
        if (!cancelled) {
          setHoldings(next);
          setPrimary(lookedUp[1] ? `${lookedUp[0]}.usd` : "none");
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not read the portfolio.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [address, client, deployment.deployed, deployment.name, deployment.registrar, deployment.reverse, deployment.startBlock, deployment.network]);

  if (!isConnected || !address) {
    return (
      <article className="card">
        <h2>Portfolio</h2>
        <p>Connect an Arc Testnet wallet to see names it currently holds.</p>
      </article>
    );
  }

  return (
    <article className="card stack">
      <h2>Portfolio</h2>
      <p>
        Connected wallet <code className="full mono">{address}</code>
      </p>
      <p className="muted">Verified primary name: {primary}. This is empty unless the name still forward-resolves to this wallet.</p>
      {!deployment.deployed || deployment.network === "mainnet" ? (
        <p>No .usd contracts are deployed for this network, so there is nothing to list and nothing to pay.</p>
      ) : null}
      {loading ? <p>Reading registrations…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {deployment.deployed && holdings.length === 0 && !loading ? <p>This wallet does not currently hold a .usd name.</p> : null}
      {holdings.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phase</th>
              <th>Expiry</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((holding) => (
              <tr key={holding.tokenId.toString()}>
                <td>
                  <Link href={`/manage/${holding.label}`}>{holding.label}.usd</Link>
                </td>
                <td>{holding.phase}</td>
                <td>{formatWhen(holding.expiry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </article>
  );
}
