import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import { arcMainnet } from "./chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000";

export const wagmiConfig = getDefaultConfig({
  appName: "US Domains",
  projectId,
  chains: [arcMainnet],
  transports: {
    [arcMainnet.id]: http("https://rpc.mainnet.arc.io"),
  },
  ssr: true,
});
