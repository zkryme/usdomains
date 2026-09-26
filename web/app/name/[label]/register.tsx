"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { registrarAbi, usdcAbi, parseUsdName } from "@usd-names/sdk";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { bytesToHex, getAddress, isAddress, zeroAddress, type Address, type Hex } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { ConfirmAddress, recipientIssue } from "@/components/address";
import { deploymentFor } from "@/lib/deployment";
import { arcFees, formatUsdc, formatWhen, txError, txKind } from "@/lib/format";
import { annualUnits } from "@/lib/pricing";
import { reservedReason } from "@/lib/reserved";

type Draft = {
  secret: Hex;
  recipient: Address;
  years: number;
  payer: Address;
  commitment: Hex;
};

const ZERO = zeroAddress;

type Notice = { kind: "pending" | "success" | "rejected" | "failed"; detail: string } | null;

function draftKey(chainId: number, label: string, payer: string) {
  return `usd-commit:${chainId}:${label}:${payer.toLowerCase()}`;
}

function shortAddress(value: string) {
  if (!isAddress(value)) return "Not set";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function sameAddress(left: string, right: string) {
  return isAddress(left) && isAddress(right) && getAddress(left) === getAddress(right);
}

export function RegisterFlow({ raw }: { raw: string }) {
  const parsed = useMemo(() => parseUsdName(raw.includes(".") ? raw : `${raw}.usd`), [raw]);
  const label = parsed.ok ? parsed.label : "";
  const chainId = useChainId();
  const { address: payer, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain, isPending: switching } = useSwitchChain();
  const deployment = deploymentFor(isConnected ? chainId : 5042);
  const wrongNetwork = isConnected && deployment.network !== "mainnet";
  const live = Boolean(parsed.ok && deployment.deployed && deployment.registrar && !wrongNetwork);
  const registrar = (deployment.registrar ?? ZERO) as Address;

  const [years, setYears] = useState(1);
  const [recipient, setRecipient] = useState("");
  const [recipientTouched, setRecipientTouched] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState(false);
  const [recipientConfirmed, setRecipientConfirmed] = useState(false);
  const [payConfirmed, setPayConfirmed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
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
  const balance = useReadContract({
    address: deployment.usdc,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [payer ?? ZERO],
    query: { enabled: live && Boolean(payer) },
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (payer && !recipientTouched) setRecipient(payer);
  }, [payer, recipientTouched]);

  useEffect(() => {
    setRecipientConfirmed(false);
  }, [recipient]);

  useEffect(() => {
    if (!payer || !parsed.ok || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(draftKey(deployment.chainId, parsed.label, payer));
    if (!stored) return;
    try {
      const next = JSON.parse(stored) as Draft;
      setDraft(next);
      setRecipient(next.recipient);
      setYears(next.years);
      setRecipientTouched(true);
    } catch {
      window.localStorage.removeItem(draftKey(deployment.chainId, parsed.label, payer));
    }
  }, [payer, parsed, deployment.chainId]);

  if (!parsed.ok) {
    return (
      <article className="card">
        <h2>This name cannot be registered</h2>
        <p>{parsed.reason}</p>
        <p>
          <Link className="rules-link" href="/docs#register">
            Registration rules
          </Link>
        </p>
      </article>
    );
  }

  const availability = inspect.data ? Number(inspect.data[0]) : null;
  const seedReason = reservedReason(parsed.label);
  const reserved = Boolean(inspect.data?.[2]) || (!deployment.deployed && seedReason != null);
  const paused = Boolean(inspect.data?.[7]);
  const amount = quote.data ?? 0n;
  const minWait = Number(minAge.data ?? 60n);
  const maxWait = Number(maxAge.data ?? 86400n);
  const committed = Number(committedAt.data ?? 0n);
  const ready = committed > 0 && now >= committed + minWait && now <= committed + maxWait;
  const expiredCommit = committed > 0 && now > committed + maxWait;
  const canRegister = availability === 1 || availability === 5;
  const checking = live && availability == null && (inspect.isLoading || inspect.isFetching);
  const writesDisabled = !live || paused || !canRegister || checking;
  const perYear = prices.data?.[0] ?? annualUnits(label.length);
  const estimated = perYear * BigInt(years);
  const total = quote.data ?? estimated;
  const quoteLive = live && quote.data != null;
  const shortBalance = live && canRegister && balance.data != null && balance.data < total;
  const issue = recipient.trim() ? recipientIssue(recipient) : isConnected ? "Enter an EVM address." : null;
  const customRecipient = Boolean(payer) && recipient.trim().length > 0 && payer != null && !sameAddress(recipient, payer);
  const recipientReady = issue == null && (!customRecipient || recipientConfirmed);
  const networkLabel = !isConnected ? "Not connected" : wrongNetwork ? "Wrong network" : "Arc · 5042";
  const showSteps = live && (canRegister || Boolean(draft));
  const priceChanges = Boolean(prices.data && prices.data[2] > 0n);

  async function commit() {
    if (!payer || !publicClient || issue || !recipientReady || !isAddress(recipient)) return;
    setBusy(true);
    setNotice({ kind: "pending", detail: "Confirm the commit in your wallet. The name is not registered yet." });
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
      setNotice({ kind: "pending", detail: "Commit sent. Waiting for Arc to confirm it. The name is not registered yet." });
      await publicClient.waitForTransactionReceipt({ hash });
      const next: Draft = { secret, recipient, years, payer, commitment };
      window.localStorage.setItem(draftKey(deployment.chainId, label, payer), JSON.stringify(next));
      setDraft(next);
      setEditingRecipient(false);
      setNotice({
        kind: "success",
        detail: "Commit confirmed. This name is not registered yet. The next step opens after a short wait.",
      });
    } catch (cause) {
      setNotice(noticeFrom(cause, "The commit did not land. The name was not registered."));
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    if (!draft || !payer || !publicClient || !payConfirmed) return;
    setBusy(true);
    setNotice({ kind: "pending", detail: "Confirm the next transaction in your wallet. The name is not registered yet." });
    try {
      const fees = await arcFees(publicClient);
      const allowance = await publicClient.readContract({
        address: deployment.usdc,
        abi: usdcAbi,
        functionName: "allowance",
        args: [payer, registrar],
      });
      if (allowance < amount) {
        setNotice({ kind: "pending", detail: "Approving the exact USDC amount. The name is not registered yet." });
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
      setNotice({ kind: "pending", detail: "Confirm the payment in your wallet. The name is not registered until Arc confirms it." });
      const hash = await writeContractAsync({
        address: registrar,
        abi: registrarAbi,
        functionName: "reveal",
        args: [label, draft.recipient, draft.years, draft.secret],
        chainId: deployment.chainId,
        ...fees,
      });
      setNotice({ kind: "pending", detail: "Payment sent. Waiting for Arc to confirm it. The name is not registered yet." });
      await publicClient.waitForTransactionReceipt({ hash });
      window.localStorage.removeItem(draftKey(deployment.chainId, label, payer));
      setDraft(null);
      setNotice({ kind: "success", detail: "Registered. Arc confirmed the payment, and the NFT is the current control of this name." });
    } catch (cause) {
      const base = noticeFrom(cause, "The payment did not complete. The name was not registered.");
      setNotice(
        base.kind === "failed"
          ? { kind: "failed", detail: `${base.detail} The reveal can be retried until the commitment expires. The secret is still in this browser.` }
          : base,
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyRecipient() {
    if (!isAddress(recipient)) return;
    await navigator.clipboard.writeText(getAddress(recipient));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="checkout">
      <div className="checkout-head">
        <h1>{parsed.name}</h1>
        <Status
          availability={availability}
          reserved={reserved}
          paused={paused}
          deployed={deployment.deployed && !wrongNetwork}
          checking={checking}
        />
      </div>

      {wrongNetwork ? (
        <p className="notice">This wallet is not on Arc. Registration uses chain id 5042.</p>
      ) : !deployment.deployed ? (
        <p className="notice">Preview only. Registration is not available on this network yet.</p>
      ) : checking ? (
        <p className="notice pending">Checking this name on Arc.</p>
      ) : reserved ? (
        <p className="notice">{seedReason ?? "This name is reserved."}</p>
      ) : paused ? (
        <p className="notice">New registrations are paused.</p>
      ) : availability === 3 ? (
        <p className="notice">
          This name is already registered. <Link href={`/manage/${parsed.label}`}>Manage it</Link>
        </p>
      ) : availability === 4 ? (
        <p className="notice">
          This name is in its grace period. <Link href={`/manage/${parsed.label}`}>Manage it</Link>
        </p>
      ) : shortBalance ? (
        <p className="notice failed">This wallet does not have enough USDC for this registration.</p>
      ) : null}

      <div className="checkout-grid">
        <article className="card stack">
          {showSteps ? (
            <div className="steps" aria-label="Registration steps">
              <span className={!draft ? "on" : ""}>Commit</span>
              <span className={draft && !ready ? "on" : ""}>Wait</span>
              <span className={ready ? "on" : ""}>Register</span>
            </div>
          ) : null}

          <label className="field">
            <span className="label-row">
              <span>Registration term</span>
              <Link href="/docs#register">Registration rules</Link>
            </span>
            <select value={years} onChange={(event) => setYears(Number(event.target.value))} disabled={Boolean(draft)}>
              {Array.from({ length: 10 }, (_, index) => index + 1).map((year) => (
                <option key={year} value={year}>
                  {year} year{year === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <span>NFT recipient</span>
            {editingRecipient && !draft ? (
              <input
                value={recipient}
                onChange={(event) => {
                  setRecipientTouched(true);
                  setRecipient(event.target.value.trim());
                }}
                placeholder="0x"
                spellCheck={false}
                aria-label="NFT recipient"
              />
            ) : (
              <div className="recipient-line">
                <code className="mono">{shortAddress(recipient)}</code>
                {draft ? null : (
                  <button className="quiet" type="button" onClick={() => setEditingRecipient(true)}>
                    Change
                  </button>
                )}
              </div>
            )}
            {issue && (editingRecipient || recipientTouched) ? <p className="error">{issue}</p> : null}
            {editingRecipient && !draft && recipient.trim() && !issue ? (
              <button className="quiet" type="button" onClick={() => setEditingRecipient(false)}>
                Use this address
              </button>
            ) : null}
          </div>

          {customRecipient && !draft ? (
            <ConfirmAddress
              title="Full recipient address"
              address={recipient}
              checked={recipientConfirmed}
              onChecked={setRecipientConfirmed}
              note="I have checked every character. The commit binds the NFT to this address."
            />
          ) : null}

          {draft && committed > 0 && now < committed + minWait ? (
            <p className="muted">
              Wait {committed + minWait - now}s. This commitment expires {formatWhen(committed + maxWait)}.
            </p>
          ) : null}
          {draft && ready ? <p className="muted">You can register now. This commitment expires {formatWhen(committed + maxWait)}.</p> : null}
          {expiredCommit ? <p className="error">This commitment has expired. Commit again. The old secret cannot be revealed.</p> : null}
          {draft && committed === 0 ? <p className="muted">Waiting for Arc to record the commit.</p> : null}

          {!isConnected ? (
            <button className="primary" type="button" onClick={() => openConnectModal?.()}>
              Connect a wallet
            </button>
          ) : wrongNetwork ? (
            <button className="primary" type="button" disabled={switching} onClick={() => switchChain({ chainId: 5042 })}>
              Switch to Arc
            </button>
          ) : (
            <button
              className="primary"
              type="button"
              disabled={busy || writesDisabled || !recipientReady || shortBalance || Boolean(draft && !expiredCommit)}
              onClick={() => void commit()}
            >
              {expiredCommit ? "Commit again" : "Commit"}
            </button>
          )}

          {draft && !wrongNetwork ? (
            <div className="stack">
              <ConfirmAddress
                title="USDC is pulled to this registrar"
                address={registrar}
                checked={payConfirmed}
                onChecked={setPayConfirmed}
                note={`I approve paying exactly ${formatUsdc(amount)} USDC to register ${parsed.name} for ${draft.recipient}.`}
              />
              <button className="primary" type="button" disabled={busy || !ready || !payConfirmed || writesDisabled || shortBalance} onClick={() => void reveal()}>
                Register
              </button>
            </div>
          ) : null}

          {notice ? (
            <p className={`notice ${notice.kind}`} role="status">
              {notice.detail}
            </p>
          ) : null}
        </article>

        <aside className="card summary order">
          <h2>Order summary</h2>
          <dl>
            <dt>Name</dt>
            <dd>{parsed.name}</dd>
            <dt>Registration term</dt>
            <dd>
              {years} year{years === 1 ? "" : "s"}
            </dd>
            <dt>Price per year</dt>
            <dd>{formatUsdc(perYear)} USDC</dd>
            <dt>{quoteLive ? "Total" : "Estimated total"}</dt>
            <dd>{formatUsdc(total)} USDC</dd>
            <dt>NFT recipient</dt>
            <dd className="recipient-line">
              <span className="mono">{shortAddress(recipient)}</span>
              {isAddress(recipient) ? (
                <button className="copy" type="button" onClick={() => void copyRecipient()}>
                  {copied ? "Copied" : "Copy"}
                </button>
              ) : null}
            </dd>
            <dt>Network</dt>
            <dd>{networkLabel}</dd>
          </dl>
          {quoteLive && priceChanges ? (
            <p className="muted">
              A price change is scheduled for {formatWhen(prices.data?.[2] ?? 0)}. The total updates from the registrar.{" "}
              <Link href="/docs#price">Price rules</Link>
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Status({
  availability,
  reserved,
  paused,
  deployed,
  checking,
}: {
  availability: number | null;
  reserved: boolean;
  paused: boolean;
  deployed: boolean;
  checking: boolean;
}) {
  if (reserved || availability === 2) return <span className="pill bad">Reserved</span>;
  if (!deployed) return <span className="pill">Preview</span>;
  if (checking || availability == null) return <span className="pill">Checking</span>;
  if (availability === 1) return <span className="pill good">{paused ? "Paused" : "Available"}</span>;
  if (availability === 3) return <span className="pill">Registered</span>;
  if (availability === 4) return <span className="pill warn">Grace</span>;
  if (availability === 5) return <span className="pill warn">Lapsed</span>;
  return <span className="pill bad">Unsupported</span>;
}

function noticeFrom(cause: unknown, fallback: string): { kind: "rejected" | "failed"; detail: string } {
  if (txKind(cause) === "rejected") {
    return { kind: "rejected", detail: "You rejected the transaction. Nothing was charged, and the name was not registered." };
  }
  const message = txError(cause);
  return { kind: "failed", detail: message && message !== "The transaction failed." ? `${message} ${fallback}` : fallback };
}
