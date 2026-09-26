export const LABEL_OK = 0;
export const LABEL_EMPTY = 1;
export const LABEL_TOO_SHORT = 2;
export const LABEL_TOO_LONG = 3;
export const LABEL_BAD_CHAR = 4;
export const LABEL_BAD_HYPHEN = 5;

const MAX_LENGTH = 32;

/** Matches `LabelValidator.diagnose` in the contracts. Charset is checked before length. */
export function diagnoseLabel(label: string, minLength = 3): number {
  if (label.length === 0) return LABEL_EMPTY;

  let previousHyphen = false;
  for (let i = 0; i < label.length; i++) {
    const code = label.charCodeAt(i);
    const hyphen = code === 0x2d;
    const digit = code >= 0x30 && code <= 0x39;
    const lower = code >= 0x61 && code <= 0x7a;
    if (hyphen) {
      if (i === 0 || i + 1 === label.length || previousHyphen) return LABEL_BAD_HYPHEN;
    } else if (!digit && !lower) {
      return LABEL_BAD_CHAR;
    }
    previousHyphen = hyphen;
  }

  if (label.length < minLength) return LABEL_TOO_SHORT;
  if (label.length > MAX_LENGTH) return LABEL_TOO_LONG;
  return LABEL_OK;
}

export function labelProblem(code: number): string {
  switch (code) {
    case LABEL_EMPTY:
      return "Enter a name.";
    case LABEL_TOO_SHORT:
      return "Public registration starts at 3 characters. 1- and 2-character names are not available in v1.";
    case LABEL_TOO_LONG:
      return "Names can be at most 32 characters.";
    case LABEL_BAD_CHAR:
      return "Use only lowercase letters a-z, digits, and single hyphens. Uppercase, emoji, and any other character are rejected by the contract.";
    case LABEL_BAD_HYPHEN:
      return "Hyphens must sit between other characters and cannot be repeated.";
    default:
      return "This label cannot be registered.";
  }
}

export type ParsedName =
  | { ok: true; label: string; name: string }
  | { ok: false; status: "unsupported"; reason: string };

/**
 * Accepts `alice` or `alice.usd`. The returned label is the canonical lowercase form.
 * Mixed case is lowercased here for the UI; the contract still rejects uppercase if it is submitted.
 */
export function parseUsdName(input: string): ParsedName {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) {
    return { ok: false, status: "unsupported", reason: labelProblem(LABEL_EMPTY) };
  }

  let label = trimmed;
  if (trimmed.endsWith(".usd")) label = trimmed.slice(0, -4);
  if (label.includes(".")) {
    return {
      ok: false,
      status: "unsupported",
      reason: "Only a single label is supported, such as alice.usd. Subnames are not part of v1.",
    };
  }

  const code = diagnoseLabel(label, 3);
  if (code !== LABEL_OK) {
    return { ok: false, status: "unsupported", reason: labelProblem(code) };
  }
  return { ok: true, label, name: `${label}.usd` };
}
