"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { registrarAbi } from "@usd-names/sdk";
import { useState } from "react";
import { zeroAddress, type Address } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { deploymentFor } from "@/lib/deployment";
import { arcFees, formatUsdc, txError, txKind } from "@/lib/format";

export function WithdrawForm() {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain, isPending: switching } = useSwitchChain();
  const deployment = deploymentFor(isConnected ? chainId : 5042);
  const wrongNetwork = isConnected && deployment.network !== "mainnet";
  const live = Boolean(deployment.deployed && deployment.registrar && !wrongNetwork);
  const registrar = (deployment.registrar ?? zeroAddress) as Address;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "pending" | "success" | "rejected" | "failed"; detail: string } | null>(null);

  const publicClient = usePublicClient({ chainId: deployment.chainId });
  const { writeContractAsync } = useWriteContract();

  const treasury = useReadContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "treasury",
    query: { enabled: live },
  });
  const role = useReadContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "TREASURY_ROLE",
    query: { enabled: live },
  });
  const allowed = useReadContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "hasRole",
    args: [role.data ?? `0x${"0".repeat(64)}`, address ?? zeroAddress],
    query: { enabled: live && Boolean(address) && role.data != null },
  });
  const balance = useReadContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "accountedBalance",
    query: { enabled: live },
  });

  const held = balance.data ?? 0n;
  const canWithdraw = live && allowed.data === true && held > 0n;
  const destination = treasury.data ?? null;

  async function withdraw() {
    if (!publicClient || !canWithdraw) return;
    setBusy(true);
    setNotice({ kind: "pending", detail: "Confirm the withdrawal in your wallet." });
    try {
      const fees = await arcFees(publicClient);
      const hash = await writeContractAsync({
        address: registrar,
        abi: registrarAbi,
        functionName: "withdraw",
        args: [held],
        chainId: deployment.chainId,
        ...fees,
      });
      setNotice({ kind: "pending", detail: "Withdrawal sent. Waiting for Arc to confirm it." });
      await publicClient.waitForTransactionReceipt({ hash });
      await balance.refetch();
      setNotice({ kind: "success", detail: `${formatUsdc(held)} USDC was sent to ${destination}.` });
    } catch (cause) {
      const detail = txKind(cause) === "rejected" ? "You rejected the transaction. Nothing was sent." : txError(cause);
      setNotice({ kind: txKind(cause), detail });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="checkout">
      <div className="checkout-head">
        <h1>Withdraw</h1>
      </div>
      <article className="card stack withdraw-card">
        <p className="muted">
          Registration fees sit in the registrar until this wallet sends them to the treasury.
        </p>
        <dl className="withdraw-facts">
          <dt>Available</dt>
          <dd>{live ? `${formatUsdc(held)} USDC` : "—"}</dd>
          <dt>Sent to</dt>
          <dd className="mono">{destination ?? "—"}</dd>
          <dt>Registrar</dt>
          <dd className="mono">{live ? registrar : "—"}</dd>
        </dl>
        {!deployment.deployed ? <p className="notice">Registration contracts are not on this network yet.</p> : null}
        {deployment.deployed && !isConnected ? (
          <button className="primary" type="button" onClick={() => openConnectModal?.()}>
            Connect a wallet
          </button>
        ) : null}
        {wrongNetwork ? (
          <button className="primary" type="button" disabled={switching} onClick={() => switchChain({ chainId: 5042 })}>
            Switch to Arc
          </button>
        ) : null}
        {live && isConnected && allowed.data === false ? (
          <p className="notice">This wallet cannot withdraw. Connect {destination}.</p>
        ) : null}
        {live && isConnected && allowed.data === true && held === 0n ? (
          <p className="notice">The registrar has no USDC to withdraw.</p>
        ) : null}
        {canWithdraw ? (
          <button className="primary" type="button" disabled={busy} onClick={() => void withdraw()}>
            Withdraw {formatUsdc(held)} USDC
          </button>
        ) : null}
        {notice ? (
          <p className={`notice ${notice.kind}`} role="status">
            {notice.detail}
          </p>
        ) : null}
      </article>
    </main>
  );
}
