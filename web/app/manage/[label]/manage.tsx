"use client";

import { nameAbi, registrarAbi, resolverAbi, reverseAbi, usdcAbi, parseUsdName } from "@usd-names/sdk";
import { useMemo, useState } from "react";
import { isAddress, keccak256, toBytes, zeroAddress, type Address } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { ConfirmAddress } from "@/components/address";
import { deploymentFor } from "@/lib/deployment";
import { arcFees, formatUsdc, formatWhen, txError } from "@/lib/format";

const ZERO = zeroAddress;

export function ManageFlow({ raw }: { raw: string }) {
  const parsed = useMemo(() => parseUsdName(raw.includes(".") ? raw : `${raw}.usd`), [raw]);
  const label = parsed.ok ? parsed.label : "";
  const tokenId = parsed.ok ? BigInt(keccak256(toBytes(parsed.label))) : 0n;
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const deployment = deploymentFor(isConnected ? chainId : 5042002);
  const live = Boolean(parsed.ok && deployment.deployed && deployment.registrar && deployment.resolver && deployment.name && deployment.reverse && deployment.network === "testnet");
  const registrar = (deployment.registrar ?? ZERO) as Address;
  const resolver = (deployment.resolver ?? ZERO) as Address;
  const reverse = (deployment.reverse ?? ZERO) as Address;
  const name = (deployment.name ?? ZERO) as Address;

  const [years, setYears] = useState(1);
  const [payment, setPayment] = useState("");
  const [paymentOk, setPaymentOk] = useState(false);
  const [textKey, setTextKey] = useState("url");
  const [textValue, setTextValue] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferOk, setTransferOk] = useState(false);
  const [renewOk, setRenewOk] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
    query: { enabled: live },
  });
  const storedAddress = useReadContract({
    address: resolver,
    abi: resolverAbi,
    functionName: "addr",
    args: [tokenId],
    query: { enabled: live },
  });
  const liveAddress = useReadContract({
    address: resolver,
    abi: resolverAbi,
    functionName: "addrIfActive",
    args: [label],
    query: { enabled: live },
  });
  const storedText = useReadContract({
    address: resolver,
    abi: resolverAbi,
    functionName: "text",
    args: [tokenId, textKey],
    query: { enabled: live && textKey.length > 0 && textKey.length <= 32 },
  });
  const primary = useReadContract({
    address: reverse,
    abi: reverseAbi,
    functionName: "reverse",
    args: [address ?? ZERO],
    query: { enabled: live && Boolean(address) },
  });

  if (!parsed.ok) {
    return (
      <article className="card">
        <h2>Unsupported name</h2>
        <p>{parsed.reason}</p>
      </article>
    );
  }

  const availability = inspect.data ? Number(inspect.data[0]) : null;
  const owner = inspect.data?.[3] ?? ZERO;
  const expiry = inspect.data?.[4] ?? 0n;
  const graceEnds = inspect.data?.[5] ?? 0n;
  const isOwner = Boolean(address && owner.toLowerCase() === address.toLowerCase());
  const renewable = availability === 3 || availability === 4;
  const active = availability === 3;
  const amount = quote.data ?? 0n;
  const forward = storedAddress.data ?? ZERO;
  const resolving = liveAddress.data ?? ZERO;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(txError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function send(parameters: Parameters<typeof writeContractAsync>[0]) {
    if (!publicClient) throw new Error("No Arc client");
    const fees = await arcFees(publicClient);
    const request = {
      ...parameters,
      chainId: deployment.chainId,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    } as Parameters<typeof writeContractAsync>[0];
    const hash = await writeContractAsync(request);
    setMessage("Waiting for confirmation.");
    await publicClient.waitForTransactionReceipt({ hash });
  }

  return (
    <div className="stack">
      <article className="card stack">
        <h2>{parsed.name}</h2>
        {!deployment.deployed ? <p>Contracts are not deployed, so records cannot be changed from this site.</p> : null}
        <p className="muted">
          Phase: {availability === 3 ? "active" : availability === 4 ? "grace, does not resolve" : availability === 5 ? "lapsed" : "not registered"}.
          Expiry {formatWhen(expiry)}. Grace ends {formatWhen(graceEnds)}.
        </p>
        <p>
          NFT holder <code className="full mono">{owner === ZERO ? "none" : owner}</code>
        </p>
        <p>
          Stored payment address <code className="full mono">{forward}</code>
        </p>
        <p className="muted">
          Address returned for payments: {resolving === ZERO ? "none. Expired and grace-period names do not resolve." : resolving}
        </p>
        {primary.data ? (
          <p className="muted">
            Your verified primary name: {primary.data[1] ? `${primary.data[0]}.usd` : "none"}. A reverse record is hidden unless this
            wallet owns the name and the forward address is this wallet.
          </p>
        ) : null}
      </article>

      <article className="card stack">
        <h3>Renew</h3>
        <p className="muted">
          Anyone can pay. The owner stays the same. During grace, the new term starts now rather than at the old expiry.
          After grace, renewal is impossible.
        </p>
        <label className="field">
          <span>Years</span>
          <select value={years} onChange={(event) => setYears(Number(event.target.value))}>
            {Array.from({ length: 10 }, (_, index) => index + 1).map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </label>
        <p>Exact charge: {quote.data != null ? `${formatUsdc(amount)} USDC` : "—"} on the 6-decimal ERC-20 interface.</p>
        <ConfirmAddress
          title="Renewal payment is pulled to the registrar"
          address={registrar}
          checked={renewOk}
          onChecked={setRenewOk}
          note={`I am paying exactly ${formatUsdc(amount)} USDC to extend ${parsed.name}. This does not change the NFT holder.`}
        />
        <button
          className="primary"
          disabled={!live || !renewable || !renewOk || busy || !isConnected}
          onClick={() =>
            void run(async () => {
              if (!address || !publicClient) return;
              const allowance = await publicClient.readContract({
                address: deployment.usdc,
                abi: usdcAbi,
                functionName: "allowance",
                args: [address, registrar],
              });
              if (allowance < amount) {
                await send({ address: deployment.usdc, abi: usdcAbi, functionName: "approve", args: [registrar, amount] });
              }
              await send({ address: registrar, abi: registrarAbi, functionName: "renew", args: [label, years] });
              setMessage("Renewed.");
            })
          }
        >
          Renew
        </button>
      </article>

      <article className="card stack">
        <h3>Payment address</h3>
        <label className="field">
          <span>Arc address this name should resolve to</span>
          <input value={payment} onChange={(event) => { setPayment(event.target.value.trim()); setPaymentOk(false); }} spellCheck={false} />
        </label>
        <ConfirmAddress
          title="Full payment address"
          address={payment}
          checked={paymentOk}
          onChecked={setPaymentOk}
          note="I have checked every character. Apps that integrate .usd will treat this as the destination while the name is active."
        />
        <button
          className="primary"
          disabled={!live || !isOwner || !renewable || !paymentOk || !isAddress(payment) || busy}
          onClick={() =>
            void run(async () => {
              await send({ address: resolver, abi: resolverAbi, functionName: "setAddress", args: [label, payment as Address] });
              setMessage("Payment address saved. It resolves only while the name is active.");
            })
          }
        >
          Save address
        </button>
        <button
          className="quiet"
          disabled={!live || !isOwner || !active || forward.toLowerCase() !== address?.toLowerCase() || busy}
          onClick={() =>
            void run(async () => {
              await send({ address: reverse, abi: reverseAbi, functionName: "setPrimary", args: [label] });
              setMessage("Primary name set.");
            })
          }
        >
          Set as primary name
        </button>
        <p className="muted">Primary requires an active name whose payment address is exactly the connected wallet.</p>
      </article>

      <article className="card stack">
        <h3>Text record</h3>
        <p className="muted">Keys up to 32 bytes. Values up to 256 bytes. An empty value clears the key. Text is hidden from live reads during grace and after expiry.</p>
        <label className="field">
          <span>Key</span>
          <input value={textKey} onChange={(event) => setTextKey(event.target.value)} maxLength={32} />
        </label>
        <label className="field">
          <span>Value {storedText.data ? `· current: ${storedText.data || "empty"}` : ""}</span>
          <input value={textValue} onChange={(event) => setTextValue(event.target.value)} maxLength={256} />
        </label>
        <button
          className="primary"
          disabled={!live || !isOwner || !renewable || textKey.length === 0 || textKey.length > 32 || busy}
          onClick={() =>
            void run(async () => {
              await send({ address: resolver, abi: resolverAbi, functionName: "setText", args: [label, textKey, textValue] });
              setMessage("Text record saved.");
            })
          }
        >
          Save text
        </button>
      </article>

      <article className="card stack">
        <h3>Transfer the NFT</h3>
        <p className="muted">
          Transfer moves management immediately. The previous primary name is cleared. A transfer after grace still moves
          the NFT, but that NFT no longer controls the name.
        </p>
        <label className="field">
          <span>New holder</span>
          <input value={transferTo} onChange={(event) => { setTransferTo(event.target.value.trim()); setTransferOk(false); }} spellCheck={false} />
        </label>
        <ConfirmAddress
          title="Full recipient address"
          address={transferTo}
          checked={transferOk}
          onChecked={setTransferOk}
          note="I have checked every character. This transfer cannot be reversed by the registry."
        />
        <button
          className="primary"
          disabled={!live || !isOwner || !address || !transferOk || !isAddress(transferTo) || busy}
          onClick={() =>
            void run(async () => {
              if (!address) return;
              await send({
                address: name,
                abi: nameAbi,
                functionName: "transferFrom",
                args: [address, transferTo as Address, tokenId],
              });
              setMessage("Transferred.");
            })
          }
        >
          Transfer
        </button>
      </article>
      {message ? <p>{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
