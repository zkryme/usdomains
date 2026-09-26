export function annualUnits(length: number): bigint {
  if (length <= 3) return 30_000_000n;
  if (length === 4) return 20_000_000n;
  return 10_000_000n;
}
