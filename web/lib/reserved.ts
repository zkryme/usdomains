import reservedFile from "../../script/reserved-names.json";

const reasons = new Map(reservedFile.entries.map((entry) => [entry.label, entry.reason]));

export function reservedReason(label: string): string | null {
  return reasons.get(label) ?? null;
}

export const reservationDisclosure = reservedFile.disclosure;
