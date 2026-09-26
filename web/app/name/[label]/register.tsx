"use client";

import {
  registrarAbi,
  usdcAbi,
  parseUsdName,
} from "@usd-names/sdk";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { bytesToHex, isAddress, zeroAddress, type Address, type Hex } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { ConfirmAddress } from "@/components/address";
import { deploymentFor } from "@/lib/deployment";
import { arcFees, formatUsdc, formatWhen, txError } from "@/lib/format";
import { reservationDisclosure, reservedReason } from "@/lib/reserved";

type Draft = {
  secret: Hex;
  recipient: Address;
  years: number;
  payer: Address;
  commitment: Hex;
};

const ZERO = zeroAddress;

function draftKey(chainId: number, label: string, payer: string) {
  return `usd-commit:${chainId}:${label}:${payer.toLowerCase()}`;
}

export function RegisterFlow({ raw }: { raw: string }) {
  const parsed = useMemo(() => parseUsdName(raw.includes(".") ? raw : `${raw}.usd`), [raw]);
  const label = parsed.ok ? parsed.label : "";
  const chainId = useChainId();
  const { address: payer, isConnected } = useAccount();
  const deployment = deploymentFor(isConnected ? chainId : 5042002);
  const live = Boolean(parsed.ok && deployment.deployed && deployment.registrar && deployment.network === "testnet");
  const registrar = (deployment.registrar ?? ZERO) as Address;

  const [years, setYears] = useState(1);
  const [recipient, setRecipient] = useState("");
  const [recipientConfirmed, setRecipientConfirmed] = useState(false);
  const [payConfirmed, setPayConfirmed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const publicClient = usePublicClient({ chainId: deployment.chainId });
  const { writeContractAsync } = useWriteContract();

  const inspect = useReadContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "inspect",
    args: [label],
    query: { enabled: live },
  });
  const quote = useReadContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "quote",
    args: [label, years],
    query: { enabled: live && years >= 1 && years <= 10 },
  });
  const prices = useReadContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "priceSchedule",
    args: [label.length <= 3 ? 3 : label.length === 4 ? 4 : 5],
    query: { enabled: live },
  });
  const grace = useReadContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "graceSchedule",
    query: { enabled: live },
  });
  const minAge = useReadContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "MIN_COMMITMENT_AGE",
    query: { enabled: live },
  });
  const maxAge = useReadContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "MAX_COMMITMENT_AGE",
    query: { enabled: live },
  });
  const committedAt = useReadContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "commitments",
    args: [draft?.commitment ?? `0x${"0".repeat(64)}`],
    query: { enabled: live && Boolean(draft) },
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setRecipientConfirmed(false);
  }, [recipient]);

  useEffect(() => {
    if (!payer || !parsed.ok || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(draftKey(deployment.chainId, parsed.label, payer));
    if (!stored) return;
    try {
      setDraft(JSON.parse(stored) as Draft);
    } catch {
      window.localStorage.removeItem(draftKey(deployment.chainId, parsed.label, payer));
    }
  }, [payer, parsed, deployment.chainId]);

  if (!parsed.ok) {
    return (
      <article className="card">
        <h2>This name cannot be registered</h2>
        <p>{parsed.reason}</p>
      </article>
    );
  }

  const availability = inspect.data ? Number(inspect.data[0]) : null;
  const seedReason = reservedReason(parsed.label);
  const reserved = Boolean(inspect.data?.[2]) || (!deployment.deployed && seedReason != null);
  const owner = inspect.data?.[3];
  const expiry = inspect.data?.[4] ?? 0n;
  const graceEnds = inspect.data?.[5] ?? 0n;
  const paused = Boolean(inspect.data?.[7]);
  const amount = quote.data ?? 0n;
  const minWait = Number(minAge.data ?? 60n);
  const maxWait = Number(maxAge.data ?? 86400n);
  const committed = Number(committedAt.data ?? 0n);
  const ready = committed > 0 && now >= committed + minWait && now <= committed + maxWait;
  const expiredCommit = committed > 0 && now > committed + maxWait;
  const canRegister = availability === 1 || availability === 5;
  const writesDisabled = !live || deployment.network !== "testnet" || paused || !canRegister;

  async function commit() {
    if (!payer || !publicClient || !isAddress(recipient) || !recipientConfirmed) return;
    setBusy(true);
    setError("");
    try {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const secret = bytesToHex(bytes);
      const commitment = await publicClient.readContract({
        address: registrar,
        abi: registrarAbi,
        functionName: "commitmentHash",
        args: [label, recipient, years, payer, secret],
      });
      const fees = await arcFees(publicClient);
      const hash = await writeContractAsync({
        address: registrar,
        abi: registrarAbi,
        functionName: "commit",
        args: [commitment],
        chainId: deployment.chainId,
        ...fees,
      });
      setStatus("Waiting for the commit to land.");
      await publicClient.waitForTransactionReceipt({ hash });
      const next: Draft = { secret, recipient, years, payer, commitment };
      window.localStorage.setItem(draftKey(deployment.chainId, label, payer), JSON.stringify(next));
      setDraft(next);
      setStatus("Commit saved in this browser. Wait 60 seconds, then reveal from this same wallet.");
    } catch (cause) {
      setError(txError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    if (!draft || !payer || !publicClient || !payConfirmed) return;
    setBusy(true);
    setError("");
    try {
      const fees = await arcFees(publicClient);
      const allowance = await publicClient.readContract({
        address: deployment.usdc,
        abi: usdcAbi,
        functionName: "allowance",
        args: [payer, registrar],
      });
      if (allowance < amount) {
        setStatus("Approving the exact USDC amount.");
        const approval = await writeContractAsync({
          address: deployment.usdc,
          abi: usdcAbi,
          functionName: "approve",
          args: [registrar, amount],
          chainId: deployment.chainId,
          ...fees,
        });
        await publicClient.waitForTransactionReceipt({ hash: approval });
      }
      setStatus("Revealing and paying.");
      const hash = await writeContractAsync({
        address: registrar,
        abi: registrarAbi,
        functionName: "reveal",
        args: [label, draft.recipient, draft.years, draft.secret],
        chainId: deployment.chainId,
        ...fees,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      window.localStorage.removeItem(draftKey(deployment.chainId, label, payer));
      setDraft(null);
      setStatus("Registered. The NFT is the current control of this name.");
    } catch (cause) {
      setError(txError(cause));
      setStatus("The reveal can be retried until the commitment expires. The secret is still in this browser.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      <article className="card stack">
        <div className="row">
          <h2 style={{ margin: 0 }}>{parsed.name}</h2>
          <Status availability={availability} reserved={reserved} paused={paused} deployed={deployment.deployed} />
        </div>
        <Explanation
          availability={availability}
          reserved={reserved}
          deployed={deployment.deployed}
          seedReason={seedReason}
        />
        {owner && owner !== ZERO ? (
          <p className="muted">
            Current NFT holder: <code className="mono">{owner}</code>
            {expiry > 0n ? `. Expiry ${formatWhen(expiry)}. Grace ends ${formatWhen(graceEnds)}.` : ""}
          </p>
        ) : null}
        {availability === 3 || availability === 4 ? <Link href={`/manage/${parsed.label}`}>Manage this name</Link> : null}

        <div className="steps">
          <span className={!draft ? "on" : ""}>1. Commit</span>
          <span className={draft && !ready ? "on" : ""}>2. Wait</span>
          <span className={ready ? "on" : ""}>3. Pay and reveal</span>
        </div>

        {!deployment.deployed ? (
          <p>Contracts are not deployed on this network, so availability is only a local format check and no payment is offered.</p>
        ) : null}
        {paused ? <p>New registrations are paused. A pause does not stop renewal, transfer, or record updates.</p> : null}

        <label className="field">
          <span>Term, 1 to 10 years</span>
          <select value={years} onChange={(event) => setYears(Number(event.target.value))} disabled={Boolean(draft)}>
            {Array.from({ length: 10 }, (_, index) => index + 1).map((year) => (
              <option key={year} value={year}>
                {year} year{year === 1 ? "" : "s"}
                {quote.data != null && year === years ? ` · ${formatUsdc(quote.data)} USDC` : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Price at reveal: {quote.data != null ? `${formatUsdc(amount)} USDC` : "—"}. That is a 6-decimal ERC-20 amount.
          If a scheduled price arrives before you reveal, the contract charges the new price and pulls that exact amount.
        </p>

        <label className="field">
          <span>NFT recipient</span>
          <input
            value={recipient}
            onChange={(event) => setRecipient(event.target.value.trim())}
            placeholder={payer ?? "0x"}
            spellCheck={false}
            disabled={Boolean(draft)}
          />
        </label>
        <ConfirmAddress
          title="Full recipient address"
          address={recipient}
          checked={recipientConfirmed}
          onChecked={setRecipientConfirmed}
          note="I have checked every character of this address. The commit binds the name to it."
        />
        <button
          className="primary"
          disabled={busy || writesDisabled || !isConnected || !isAddress(recipient) || !recipientConfirmed || Boolean(draft && !expiredCommit)}
          onClick={() => void commit()}
        >
          {expiredCommit ? "Commit again" : "Commit name"}
        </button>

        {draft ? (
          <div className="stack">
            <p className="muted">
              Committed for <code className="mono">{draft.recipient}</code> for {draft.years} year
              {draft.years === 1 ? "" : "s"}. {committed === 0 ? "Waiting for the chain." : `Committed at ${formatWhen(committed)}.`}
              {committed > 0 && now < committed + minWait ? ` Reveal opens in ${committed + minWait - now}s.` : ""}
              {expiredCommit ? " This commitment has expired. Commit again. The old secret cannot be revealed." : ""}
            </p>
            <ConfirmAddress
              title="USDC is pulled to this registrar"
              address={registrar}
              checked={payConfirmed}
              onChecked={setPayConfirmed}
              note={`I approve paying exactly ${formatUsdc(amount)} USDC (6 decimals) to register ${parsed.name} for ${draft.recipient}.`}
            />
            <button className="primary" disabled={busy || !ready || !payConfirmed || writesDisabled} onClick={() => void reveal()}>
              Approve and reveal
            </button>
          </div>
        ) : null}
        {status ? <p>{status}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </article>
      <aside className="card stack">
        <h3>Price and grace</h3>
        <p className="muted">
          Current annual price for this length: {prices.data ? `${formatUsdc(prices.data[0])} USDC` : "88, 18, or 8 USDC before deploy"}.
          {prices.data && prices.data[2] > 0n
            ? ` A change to ${formatUsdc(prices.data[1])} USDC is scheduled for ${formatWhen(prices.data[2])}.`
            : " No price change is scheduled."}
        </p>
        <p className="muted">
          Grace is {grace.data ? `${Number(grace.data[0]) / 86400} days` : "30 days"}.
          {grace.data && grace.data[2] > 0n
            ? ` A change to ${Number(grace.data[1]) / 86400} days is scheduled for ${formatWhen(grace.data[2])}.`
            : " No grace change is scheduled."}
        </p>
        <p className="muted">
          The commitment waits at least {minWait} seconds and expires after {Math.round(maxWait / 3600)} hours. Keep this
          browser tab; the secret is stored locally for a retry.
        </p>
        <PriceTable />
      </aside>
    </div>
  );
}

function Status({
  availability,
  reserved,
  paused,
  deployed,
}: {
  availability: number | null;
  reserved: boolean;
  paused: boolean;
  deployed: boolean;
}) {
  if (!deployed && !reserved) return <span className="pill">Format only</span>;
  if (reserved || availability === 2) return <span className="pill bad">Reserved</span>;
  if (!deployed || availability == null) return <span className="pill">Checking</span>;
  if (availability === 1) return <span className="pill good">{paused ? "Paused" : "Available"}</span>;
  if (availability === 3) return <span className="pill">Active</span>;
  if (availability === 4) return <span className="pill warn">Grace</span>;
  if (availability === 5) return <span className="pill warn">Lapsed</span>;
  return <span className="pill bad">Unsupported</span>;
}

function Explanation({
  availability,
  reserved,
  deployed,
  seedReason,
}: {
  availability: number | null;
  reserved: boolean;
  deployed: boolean;
  seedReason: string | null;
}) {
  if (reserved) {
    return (
      <div className="stack">
        <p>
          This label is reserved and cannot be registered. Public minting has one path, and that path checks the
          reservation list, so a discount or allowlist cannot bypass it.
        </p>
        {seedReason ? <p className="muted">{seedReason}</p> : null}
        <p className="muted">{reservationDisclosure}</p>
      </div>
    );
  }
  if (!deployed) {
    return <p className="muted">The label matches the v1 character rules. On-chain availability is unknown until a testnet deploy, and this page will not ask for a payment.</p>;
  }
  if (availability === 3) return <p className="muted">This name is active. It resolves only if the owner has set a payment address.</p>;
  if (availability === 4) {
    return (
      <p>
        Grace period. The name does not resolve. The current registrant can still renew. Anyone can pay the renewal; the
        owner does not change. After grace, a new registrant can take the label and the old NFT is burned.
      </p>
    );
  }
  if (availability === 5) {
    return (
      <p className="muted">
        The previous term has lapsed. Registering again burns the old NFT, clears its records, and mints the same token id
        to the new recipient.
      </p>
    );
  }
  if (availability === 1) return <p className="muted">Available for a public registration. Payment happens at reveal, not at commit.</p>;
  return <p className="muted">Checking the registrar.</p>;
}

function PriceTable() {
  return (
    <div className="prices">
      <div className="price">
        <span className="muted">3 characters</span>
        <b>88 USDC</b>
      </div>
      <div className="price">
        <span className="muted">4 characters</span>
        <b>18 USDC</b>
      </div>
      <div className="price">
        <span className="muted">5 to 32</span>
        <b>8 USDC</b>
      </div>
    </div>
  );
}
