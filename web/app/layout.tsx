import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Serif, Outfit } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { Shell } from "@/components/shell";

const sans = Outfit({ subsets: ["latin"], variable: "--font-sans" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-serif" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL("https://usdomains.xyz"),
  title: {
    default: "US Domains",
    template: "%s · US Domains",
  },
  description: "US Domains at usdomains.xyz. Search, register, and manage a .usd name on Arc. Not DNS, not ENS, and not a Circle product.",
  alternates: { canonical: "/" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable} ${mono.variable} ${sans.className}`}>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
