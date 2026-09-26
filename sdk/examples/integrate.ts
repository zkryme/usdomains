/**
 * Example: resolve a .usd name before sending USDC on Arc.
 *
 * This does not make MetaMask, browsers, or ENS understand `.usd`.
 * Call it from your own Arc app. If the result is not `resolved`, stop.
 * Do not fall back to a guessed address.
 *
 * Prices and transfers in this service use the USDC ERC-20 interface
 * (6 decimals) at 0x3600000000000000000000000000000000000000.
 * Native gas uses 18 decimals. Do not pass a native `value` as the payment.
 */
import { createPublicClient, http, parseUnits, type Address } from "viem";
import { resolveUsdName, undeployedTestnet, type UsdContracts } from "../src/index";

const contracts: UsdContracts = undeployedTestnet;

async function payName(input: string, amountUsdc: string) {
  const client = createPublicClient({
    chain: {
      id: 5042002,
      name: "Arc Testnet",
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
      rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
    },
    transport: http("https://rpc.testnet.arc.io"),
  });

  const resolved = await resolveUsdName(client, contracts, input);
  if (resolved.status !== "resolved") {
    throw new Error(`Refusing to send. ${input} is ${resolved.status}.`);
  }

  const destination: Address = resolved.address;
  const erc20Amount = parseUnits(amountUsdc, 6);
  return { destination, erc20Amount };
}

export { payName };
