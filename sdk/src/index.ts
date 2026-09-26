import {
  type Address,
  type Hex,
  type PublicClient,
  encodeAbiParameters,
  keccak256,
  zeroAddress,
} from "viem";
import { nameAbi, registrarAbi, resolverAbi, reverseAbi } from "./abi";
import { parseUsdName } from "./parse";

export { registrarAbi, resolverAbi, reverseAbi, nameAbi, usdcAbi } from "./abi";
export { diagnoseLabel, parseUsdName, labelProblem } from "./parse";

export const USDC_ERC20_DECIMALS = 6;
export const USDC_NATIVE_DECIMALS = 18;
export const ARC_USDC: Address = "0x3600000000000000000000000000000000000000";

/** Checked against docs.arc.io on 2026-09-26. Mainnet deployment of this service is disabled. */
export const arcNetworks = {
  testnet: {
    chainId: 5042002,
    name: "Arc Testnet",
    rpc: "https://rpc.testnet.arc.io",
    explorer: "https://explorer.testnet.arc.io",
  },
  mainnet: {
    chainId: 5042,
    name: "Arc",
    rpc: "https://rpc.mainnet.arc.io",
    explorer: "https://explorer.arc.io",
  },
} as const;

export type UsdContracts = {
  chainId: number;
  deployed: boolean;
  registrar: Address | null;
  name: Address | null;
  resolver: Address | null;
  reverse: Address | null;
  usdc: Address;
  startBlock: bigint | null;
};

export const undeployedTestnet: UsdContracts = {
  chainId: 5042002,
  deployed: false,
  registrar: null,
  name: null,
  resolver: null,
  reverse: null,
  usdc: ARC_USDC,
  startBlock: null,
};

export const undeployedMainnet: UsdContracts = {
  chainId: 5042,
  deployed: false,
  registrar: null,
  name: null,
  resolver: null,
  reverse: null,
  usdc: ARC_USDC,
  startBlock: null,
};

const NOT_DEPLOYED = "No .usd contracts are deployed for this chain. No address is returned.";

export type ResolveResult =
  | { status: "resolved"; name: string; address: Address }
  | { status: "unset"; name: string }
  | { status: "expired"; name: string }
  | { status: "unregistered"; name: string }
  | { status: "reserved"; name: string }
  | { status: "unsupported"; name: string; reason: string };

export type ReverseResult = { status: "verified"; name: string; address: Address } | { status: "none" };

export type RegistrationStatus =
  | { status: "unsupported"; name: string; reason: string }
  | {
      status: "available" | "reserved" | "active" | "grace" | "expired";
      name: string;
      owner: Address | null;
      expiry: bigint | null;
      graceEnds: bigint | null;
      annualPrice: bigint;
      registrationPaused: boolean;
      reserved: boolean;
    };

export type PriceResult =
  | { status: "priced"; name: string; years: number; amount: bigint; perYear: bigint; decimals: 6; token: Address }
  | { status: "unsupported"; name: string; reason: string };

export type CommitmentArgs = {
  label: string;
  recipient: Address;
  years: number;
  resolver: Address;
  payer: Address;
  secret: Hex;
  chainId: number;
  registrar: Address;
};

/** Same encoding as `USDRegistrar.commitmentHash`. */
export function makeCommitment(args: CommitmentArgs): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "address" },
        { type: "uint8" },
        { type: "address" },
        { type: "address" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
      ],
      [
        args.label,
        args.recipient,
        args.years,
        args.resolver,
        args.payer,
        args.secret,
        BigInt(args.chainId),
        args.registrar,
      ],
    ),
  );
}

function requireDeployed(contracts: UsdContracts): asserts contracts is UsdContracts & {
  registrar: Address;
  resolver: Address;
  name: Address;
  reverse: Address;
} {
  if (!contracts.deployed || !contracts.registrar || !contracts.resolver || !contracts.name || !contracts.reverse) {
    throw new Error(NOT_DEPLOYED);
  }
}

export async function getRegistrationStatus(
  client: PublicClient,
  contracts: UsdContracts,
  input: string,
): Promise<RegistrationStatus> {
  const parsed = parseUsdName(input);
  const display = input.trim().toLowerCase();
  if (!parsed.ok) return { status: "unsupported", name: display, reason: parsed.reason };
  if (!contracts.deployed || !contracts.registrar) {
    return { status: "unsupported", name: parsed.name, reason: NOT_DEPLOYED };
  }

  const info = await client.readContract({
    address: contracts.registrar,
    abi: registrarAbi,
    functionName: "inspect",
    args: [parsed.label],
  });

  const availability = Number(info[0]);
  const reserved = info[2];
  const owner = info[3];
  const expiry = info[4];
  const graceEnds = info[5];
  const annualPrice = info[6];
  const registrationPaused = info[7];
  const base = {
    name: parsed.name,
    owner: owner === zeroAddress ? null : owner,
    expiry: expiry === 0n ? null : expiry,
    graceEnds: graceEnds === 0n ? null : graceEnds,
    annualPrice,
    registrationPaused,
    reserved,
  };

  if (availability === 1) return { status: "available", ...base, owner: null, expiry: null, graceEnds: null };
  if (availability === 2) return { status: "reserved", ...base };
  if (availability === 3) return { status: "active", ...base };
  if (availability === 4) return { status: "grace", ...base };
  if (availability === 5) return { status: "expired", ...base };
  return { status: "unsupported", name: parsed.name, reason: "The registrar rejected this label." };
}

export async function getPrice(
  client: PublicClient,
  contracts: UsdContracts,
  input: string,
  years: number,
): Promise<PriceResult> {
  const parsed = parseUsdName(input);
  const display = input.trim().toLowerCase();
  if (!parsed.ok) return { status: "unsupported", name: display, reason: parsed.reason };
  if (!contracts.deployed || !contracts.registrar) {
    return { status: "unsupported", name: parsed.name, reason: NOT_DEPLOYED };
  }
  if (!Number.isInteger(years) || years < 1 || years > 10) {
    return { status: "unsupported", name: parsed.name, reason: "A registration term is 1 to 10 years." };
  }

  try {
    const [amount, perYear] = await Promise.all([
      client.readContract({
        address: contracts.registrar,
        abi: registrarAbi,
        functionName: "quote",
        args: [parsed.label, years],
      }),
      client.readContract({
        address: contracts.registrar,
        abi: registrarAbi,
        functionName: "annualPrice",
        args: [BigInt(parsed.label.length)],
      }),
    ]);
    return {
      status: "priced",
      name: parsed.name,
      years,
      amount,
      perYear,
      decimals: USDC_ERC20_DECIMALS,
      token: contracts.usdc,
    };
  } catch {
    return { status: "unsupported", name: parsed.name, reason: "The registrar could not price this name." };
  }
}

/**
 * Resolves `name.usd` to an Arc address.
 * Expired, grace-period, reserved, and unset names do not return an address.
 */
export async function resolveUsdName(
  client: PublicClient,
  contracts: UsdContracts,
  input: string,
): Promise<ResolveResult> {
  const parsed = parseUsdName(input);
  const display = input.trim().toLowerCase();
  if (!parsed.ok) return { status: "unsupported", name: display, reason: parsed.reason };

  const status = await getRegistrationStatus(client, contracts, parsed.name);
  if (status.status === "unsupported") return status;
  if (status.status === "reserved") return { status: "reserved", name: parsed.name };
  if (status.status === "available") return { status: "unregistered", name: parsed.name };
  if (status.status === "grace" || status.status === "expired") return { status: "expired", name: parsed.name };

  requireDeployed(contracts);
  const address = await client.readContract({
    address: contracts.resolver,
    abi: resolverAbi,
    functionName: "addrIfActive",
    args: [parsed.label],
  });
  if (address === zeroAddress) return { status: "unset", name: parsed.name };
  return { status: "resolved", name: parsed.name, address };
}

/**
 * Reverse lookup. A stored preference is returned only when the contract verifies it.
 * Stale or spoofed settings come back as `{ status: "none" }`.
 */
export async function reverseLookupUsdName(
  client: PublicClient,
  contracts: UsdContracts,
  wallet: Address,
): Promise<ReverseResult> {
  if (!contracts.deployed || !contracts.reverse) return { status: "none" };
  const [label, verified] = await client.readContract({
    address: contracts.reverse,
    abi: reverseAbi,
    functionName: "reverse",
    args: [wallet],
  });
  if (!verified || label.length === 0) return { status: "none" };
  return { status: "verified", name: `${label}.usd`, address: wallet };
}

export async function readNftLabel(client: PublicClient, contracts: UsdContracts, tokenId: bigint): Promise<string> {
  requireDeployed(contracts);
  return client.readContract({
    address: contracts.name,
    abi: nameAbi,
    functionName: "labelOf",
    args: [tokenId],
  });
}
