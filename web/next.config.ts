import type { NextConfig } from "next";
import path from "path";

const x402Stub = path.join(process.cwd(), "lib", "x402-stub.js");
const emptyModule = path.join(process.cwd(), "lib", "empty-module.js");

const nextConfig: NextConfig = {
  transpilePackages: ["@usd-names/sdk"],
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/evm$": x402Stub,
      "@x402/evm/exact/client$": x402Stub,
      "@x402/evm/upto/client$": x402Stub,
      "@x402/evm/exact/server$": x402Stub,
      "@x402/evm/upto/server$": x402Stub,
      "@x402/evm/auth-capture/client$": x402Stub,
      "@x402/evm/batch-settlement/client$": x402Stub,
      "@x402/evm/exact/v1/client$": x402Stub,
      "@x402/core$": x402Stub,
      "@x402/core/client$": x402Stub,
      "@x402/core/server$": x402Stub,
      "@x402/core/schemas$": x402Stub,
      "@x402/svm$": x402Stub,
      "@x402/svm/exact/client$": x402Stub,
      "@x402/svm/exact/server$": x402Stub,
      "@x402/svm/exact/v1/client$": x402Stub,
      "@x402/svm/upto/client$": x402Stub,
      "@x402/svm/upto/server$": x402Stub,
      "@x402/extensions/bazaar$": x402Stub,
      "@x402/extensions/builder-code$": x402Stub,
      "@react-native-async-storage/async-storage": emptyModule,
      "pino-pretty": emptyModule,
    };
    return config;
  },
};

export default nextConfig;
