import { formatUnits, parseGwei, type PublicClient } from "viem";

export function formatUsdc(amount: bigint): string {
  const [whole, fraction = ""] = formatUnits(amount, 6).split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
}

export function formatWhen(unixSeconds: bigint | number | null): string {
  if (unixSeconds == null) return "—";
  const value = typeof unixSeconds === "bigint" ? Number(unixSeconds) : unixSeconds;
  if (!Number.isFinite(value) || value <= 0) return "—";
  return new Date(value * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const MIN_FEE = parseGwei("20");

export async function arcFees(client: PublicClient) {
  const fees = await client.estimateFeesPerGas();
  const maxFeePerGas = fees.maxFeePerGas != null && fees.maxFeePerGas > MIN_FEE ? fees.maxFeePerGas : MIN_FEE;
  const maxPriorityFeePerGas =
    fees.maxPriorityFeePerGas != null && fees.maxPriorityFeePerGas > 0n ? fees.maxPriorityFeePerGas : parseGwei("1");
  return { maxFeePerGas, maxPriorityFeePerGas };
}

export function txError(error: unknown): string {
  if (error && typeof error === "object" && "shortMessage" in error && typeof error.shortMessage === "string") {
    return error.shortMessage;
  }
  if (error instanceof Error) return error.message;
  return "The transaction failed.";
}
