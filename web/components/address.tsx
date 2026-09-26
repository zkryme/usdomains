"use client";

import { isAddress, type Address, type Hex } from "viem";

export function FullAddress({ value }: { value: string }) {
  return <code className="full mono">{value}</code>;
}

export function ConfirmAddress({
  title,
  address,
  checked,
  onChecked,
  note,
}: {
  title: string;
  address: string;
  checked: boolean;
  onChecked: (value: boolean) => void;
  note: string;
}) {
  return (
    <div className="stack">
      <div>
        <span className="muted">{title}</span>
        <FullAddress value={address || "Enter an address"} />
      </div>
      <label className="confirm">
        <input type="checkbox" checked={checked} onChange={(event) => onChecked(event.target.checked)} />
        <span>{note}</span>
      </label>
    </div>
  );
}

export function isHexAddress(value: string): value is Address {
  return isAddress(value);
}

export function isBytes32(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}
