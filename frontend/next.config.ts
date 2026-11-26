import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// RainbowKit pulls in the Coinbase / Base wallet SDK, which imports optional x402 payment packages.
const unused = ["@x402/core/client", "@x402/evm", "@x402/evm/exact/client", "@x402/evm/upto/client", "@x402/svm/exact/client"];

const config: NextConfig = {
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    resolveAlias: Object.fromEntries(unused.map((name) => [name, "./lib/empty.cjs"])),
  },
};

export default config;
