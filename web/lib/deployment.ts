import type { Address } from "viem";
import { type UsdContracts } from "@usd-names/sdk";
import testnetFile from "../../deployments/arc-testnet.json";

function addr(value: string | null): Address | null {
  return value ? (value as Address) : null;
}

export const testnetDeployment: UsdContracts = {
  chainId: testnetFile.chainId,
  deployed: testnetFile.deployed,
  registrar: addr(testnetFile.registrar),
  name: addr(testnetFile.name),
  resolver: addr(testnetFile.resolver),
  reverse: addr(testnetFile.reverse),
  usdc: testnetFile.usdc as Address,
  startBlock: testnetFile.startBlock == null ? null : BigInt(testnetFile.startBlock),
};

export const mainnetDeployment: UsdContracts = {
  chainId: 5042,
  deployed: false,
  registrar: null,
  name: null,
  resolver: null,
  reverse: null,
  usdc: "0x3600000000000000000000000000000000000000",
  startBlock: null,
};

export type NetworkKind = "testnet" | "mainnet" | "other";

export function deploymentFor(chainId: number | undefined): UsdContracts & { network: NetworkKind } {
  if (chainId === 5042) return { ...mainnetDeployment, network: "mainnet" };
  if (chainId === 5042002 || chainId == null) return { ...testnetDeployment, network: "testnet" };
  return { ...testnetDeployment, chainId, deployed: false, network: "other" };
}
