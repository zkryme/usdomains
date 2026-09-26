import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import { arcMainnet, arcTestnet } from "./chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000";

export const wagmiConfig = getDefaultConfig({
  appName: "US Domains",
  projectId,
  chains: [arcMainnet, arcTestnet],
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.io"),
    [arcMainnet.id]: http("https://rpc.mainnet.arc.io"),
  },
  ssr: true,
});
