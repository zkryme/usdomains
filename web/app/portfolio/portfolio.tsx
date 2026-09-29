"use client";

import { nameAbi, registrarAbi, reverseAbi } from "@usd-names/sdk";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { deploymentFor } from "@/lib/deployment";
import { formatWhen } from "@/lib/format";

type Holding = {
  tokenId: bigint;
  label: string;
  phase: string;
  expiry: bigint;
};

type ExplorerPage = {
  items?: Array<{ id?: string; token?: { address_hash?: string } }>;
  next_page_params?: Record<string, unknown> | null;
};

async function indexedNameIds(wallet: string, name: string) {
  const ids = new Set<bigint>();
  let query = "type=ERC-721";
  for (let page = 0; page < 8; page++) {
    const response = await fetch(`https://explorer.arc.io/api/v2/addresses/${wallet}/nft?${query}`);
    if (!response.ok) throw new Error("index");
    const body = (await response.json()) as ExplorerPage;
    for (const item of body.items ?? []) {
      if (!item.id || item.token?.address_hash?.toLowerCase() !== name.toLowerCase()) continue;
      ids.add(BigInt(item.id));
    }
    const next = body.next_page_params;
    if (!next) break;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value == null || typeof value === "object") continue;
      params.set(key, String(value));
    }
    if (!params.has("type")) params.set("type", "ERC-721");
    query = params.toString();
  }
  return ids;
}

export function Portfolio() {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const deployment = deploymentFor(isConnected ? chainId : 5042);
  const client = usePublicClient({ chainId: deployment.chainId });
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [primary, setPrimary] = useState("none");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address || !client || !deployment.deployed || !deployment.name || !deployment.registrar || !deployment.reverse) {
      return;
    }
    const chain = client;
    const wallet = address;
    const name = deployment.name;
    const registrar = deployment.registrar;
    const reverse = deployment.reverse;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const ids = await indexedNameIds(wallet, name);
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
      } catch {
        if (!cancelled) setError("Could not load names just now. Reload this page.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [address, client, deployment.deployed, deployment.name, deployment.registrar, deployment.reverse, deployment.network]);

  if (!isConnected || !address) {
    return (
      <article className="card">
        <h2>My names</h2>
        <p>Connect an Arc wallet to see names it currently holds.</p>
      </article>
    );
  }

  return (
    <article className="card stack">
      <h2>My names</h2>
      <p>
        Connected wallet <code className="full mono">{address}</code>
      </p>
      <p className="muted">Verified primary name: {primary}. This is empty unless the name still forward-resolves to this wallet.</p>
      {!deployment.deployed ? (
        <p>No .usd contracts are on this network yet, so there is nothing to list and nothing to pay.</p>
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
