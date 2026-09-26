"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseUsdName, registrarAbi, usdcAbi } from "@usd-names/sdk";
import Link from "next/link";
import { useMemo, useState } from "react";
import { zeroAddress, type Address } from "viem";
import { useAccount, useChainId, useReadContract, useSwitchChain } from "wagmi";
import { deploymentFor } from "@/lib/deployment";
import { formatUsdc } from "@/lib/format";
import { annualUnits } from "@/lib/pricing";
import { reservedReason } from "@/lib/reserved";

export function SearchForm() {
  const [value, setValue] = useState("");
  const parsed = useMemo(() => (value.trim() ? parseUsdName(value) : null), [value]);
  const label = parsed?.ok ? parsed.label : "";
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain, isPending: switching } = useSwitchChain();
  const deployment = deploymentFor(isConnected ? chainId : 5042);
  const wrongNetwork = isConnected && deployment.network !== "mainnet";
  const live = Boolean(parsed?.ok && deployment.deployed && deployment.registrar && !wrongNetwork);

  const inspect = useReadContract({
    address: (deployment.registrar ?? zeroAddress) as Address,
    abi: registrarAbi,
    functionName: "inspect",
    args: [label],
    query: { enabled: live },
  });
  const quote = useReadContract({
    address: (deployment.registrar ?? zeroAddress) as Address,
    abi: registrarAbi,
    functionName: "quote",
    args: [label, 1],
    query: { enabled: live },
  });
  const balance = useReadContract({
    address: deployment.usdc,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    query: { enabled: Boolean(address) && isConnected && !wrongNetwork },
  });

  const listed = label ? annualUnits(label.length) : 0n;
  const perYear = quote.data ?? listed;
  const availability = inspect.data ? Number(inspect.data[0]) : null;
  const chainReserved = Boolean(inspect.data?.[2]);
  const seedReserved = label ? reservedReason(label) != null : false;
  const reserved = chainReserved || (!deployment.deployed && seedReserved);
  const checking = live && (inspect.isLoading || inspect.isFetching);
  const taken = availability === 3 || availability === 4;
  const registrable = deployment.deployed && (availability === 1 || availability === 5) && !reserved;
  const shortBalance = balance.data != null && balance.data < perYear;

  return (
    <form
      className="search"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <div className="searchbar">
        <input
          aria-label="Name"
          placeholder="alice"
          value={value}
          onChange={(event) => {
            const next = event.target.value.replace(/\.usd$/i, "");
            setValue(next);
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <span className="suffix">.usd</span>
      </div>
      {parsed ? (
        <div className="preview" aria-live="polite">
          <p className="preview-name">{parsed.ok ? parsed.name : value.trim().toLowerCase() || "—"}</p>
          {!parsed.ok ? (
            <p className="error">{parsed.reason}</p>
          ) : (
            <>
              <p className="preview-meta">
                <Status
                  checking={checking}
                  reserved={reserved}
                  taken={taken}
                  registrable={registrable}
                  deployed={deployment.deployed}
                  lapsed={availability === 5}
                />
                <span>{formatUsdc(perYear)} USDC/year</span>
              </p>
              <PreviewNote
                checking={checking}
                reserved={reserved}
                taken={taken}
                registrable={registrable}
                deployed={deployment.deployed}
                disconnected={!isConnected}
                wrongNetwork={wrongNetwork}
                shortBalance={shortBalance && registrable}
                name={parsed.name}
              />
              <div className="preview-actions">
                {registrable && !isConnected ? (
                  <button className="primary" type="button" onClick={() => openConnectModal?.()}>
                    Connect a wallet
                  </button>
                ) : null}
                {registrable && wrongNetwork ? (
                  <button className="primary" type="button" disabled={switching} onClick={() => switchChain({ chainId: 5042 })}>
                    Switch to Arc
                  </button>
                ) : null}
                {registrable && isConnected && !wrongNetwork && !shortBalance ? (
                  <Link className="primary" href={`/name/${parsed.label}`}>
                    Register {parsed.name}
                  </Link>
                ) : null}
                {parsed.ok && !(registrable && isConnected && !wrongNetwork && !shortBalance) ? (
                  <Link className="quiet" href={`/name/${parsed.label}`}>
                    View {parsed.name}
                  </Link>
                ) : null}
              </div>
              <p className="fine">
                {parsed.name} resolves only in apps that read this registry. Wallets, browsers, and ENS do not turn it into an address.
              </p>
            </>
          )}
        </div>
      ) : null}
    </form>
  );
}

function Status({
  checking,
  reserved,
  taken,
  registrable,
  deployed,
  lapsed,
}: {
  checking: boolean;
  reserved: boolean;
  taken: boolean;
  registrable: boolean;
  deployed: boolean;
  lapsed: boolean;
}) {
  if (reserved) return <span className="pill bad">Reserved</span>;
  if (checking) return <span className="pill">Checking</span>;
  if (!deployed) return <span className="pill">Not on-chain yet</span>;
  if (taken) return <span className="pill bad">Taken</span>;
  if (lapsed) return <span className="pill warn">Lapsed</span>;
  if (registrable) return <span className="pill good">Available</span>;
  return <span className="pill">Unavailable</span>;
}

function PreviewNote({
  checking,
  reserved,
  taken,
  registrable,
  deployed,
  disconnected,
  wrongNetwork,
  shortBalance,
  name,
}: {
  checking: boolean;
  reserved: boolean;
  taken: boolean;
  registrable: boolean;
  deployed: boolean;
  disconnected: boolean;
  wrongNetwork: boolean;
  shortBalance: boolean;
  name: string;
}) {
  if (reserved) return <p>This label is reserved. It cannot be registered.</p>;
  if (checking) return <p>Checking this name on Arc.</p>;
  if (!deployed) {
    return <p>The label is valid. The contracts are not deployed on Arc yet, so this page will not ask for a payment.</p>;
  }
  if (taken) return <p>{name} is already registered. It is not available.</p>;
  if (!registrable) return <p>This name cannot be registered right now.</p>;
  if (disconnected) return <p>Connect an Arc wallet to register {name}.</p>;
  if (wrongNetwork) return <p>This wallet is not on Arc. Names are registered on chain id 5042.</p>;
  if (shortBalance) return <p>This wallet does not have enough USDC for one year of {name}.</p>;
  return <p>Available for one to ten years. Payment happens when you reveal the name, not when you commit it.</p>;
}
