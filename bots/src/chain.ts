import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";

export const chain = defineChain({
  id: config.chainId,
  name: "Unichain Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});

export const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

export function walletFor(pk: Hex) {
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
  return { account, wallet };
}
export type Signer = ReturnType<typeof walletFor>;

export const log = (tag: string, msg: string) =>
  console.log(`${new Date().toISOString()} [${tag}] ${msg}`);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
