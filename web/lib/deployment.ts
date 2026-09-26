import type { Address } from "viem";
import { type UsdContracts } from "@usd-names/sdk";
import mainnetFile from "../../deployments/arc-mainnet.json";
import testnetFile from "../../deployments/arc-testnet.json";

function addr(value: string | null): Address | null {
  return value ? (value as Address) : null;
}

function fromFile(file: {
  chainId: number;
  deployed: boolean;
  registrar: string | null;
  name: string | null;
  resolver: string | null;
  reverse: string | null;
  usdc: string;
  startBlock: number | null;
}): UsdContracts {
  return {
    chainId: file.chainId,
    deployed: file.deployed,
    registrar: addr(file.registrar),
    name: addr(file.name),
    resolver: addr(file.resolver),
    reverse: addr(file.reverse),
    usdc: file.usdc as Address,
    startBlock: file.startBlock == null ? null : BigInt(file.startBlock),
  };
}

export const testnetDeployment = fromFile(testnetFile);
export const mainnetDeployment = fromFile(mainnetFile);

export type NetworkKind = "testnet" | "mainnet" | "other";

export function deploymentFor(chainId: number | undefined): UsdContracts & { network: NetworkKind } {
  if (chainId === 5042002) return { ...testnetDeployment, network: "testnet" };
  if (chainId === 5042 || chainId == null) return { ...mainnetDeployment, network: "mainnet" };
  return { ...mainnetDeployment, chainId, deployed: false, network: "other" };
}
