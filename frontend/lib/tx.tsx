"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { erc20Abi, type Address } from "viem";
import { useConfig, useAccount } from "wagmi";
import { getPublicClient, getWalletClient, switchChain } from "wagmi/actions";
import { Toasts, type Toast } from "@/components/toasts";
import { chain, usdc } from "./contracts";
import { explain } from "./errors";

export type Call = {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
};

type Run = (label: string, call: Call, options?: { approve?: { spender: Address; amount: bigint } }) => Promise<boolean>;

const TxContext = createContext<{ run: Run; busy: string | null }>({ run: async () => false, busy: null });
export const useTx = () => useContext(TxContext);

export function TxProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const { address, chainId } = useAccount();
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const put = useCallback(
    (toast: Toast) => {
      setToasts((t) => [...t.filter((x) => x.id !== toast.id), toast]);
      if (toast.kind === "done") setTimeout(() => dismiss(toast.id), 8000);
    },
    [dismiss],
  );

  const run = useCallback<Run>(
    async (label, call, options) => {
      if (lock.current) return false;
      const id = nextId.current++;
      if (!address) {
        put({ id, kind: "error", title: label, body: "Connect a wallet first." });
        return false;
      }
      lock.current = true;
      setBusy(label);
      try {
        if (chainId !== chain.id) {
          put({ id, kind: "pending", title: label, body: "Switch your wallet to Unichain Sepolia." });
          await switchChain(config, { chainId: chain.id });
        }
        const client = getPublicClient(config, { chainId: chain.id })!;
        const wallet = await getWalletClient(config, { chainId: chain.id });

        const send = async (request: Call, step: string) => {
          // simulate first so contract errors surface before the wallet opens
          const sim = await client.simulateContract({ ...(request as any), account: wallet.account });
          put({ id, kind: "pending", title: label, body: `${step}: confirm in your wallet.` });
          const hash = await wallet.writeContract(sim.request as any);
          put({ id, kind: "pending", title: label, body: `${step}: waiting for the network.`, hash });
          const receipt = await client.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error("The transaction reverted onchain.");
          return hash;
        };

        if (options?.approve) {
          const { spender, amount } = options.approve;
          const allowance = await client.readContract({
            address: usdc.address, abi: erc20Abi, functionName: "allowance", args: [address, spender],
          });
          if (allowance < amount) {
            await send({ address: usdc.address, abi: erc20Abi, functionName: "approve", args: [spender, amount] }, "Approve mUSDC");
          }
        }
        const hash = await send(call, label);
        put({ id, kind: "done", title: label, body: "Confirmed.", hash });
        await queryClient.invalidateQueries();
        return true;
      } catch (error) {
        put({ id, kind: "error", title: label, body: explain(error) });
        return false;
      } finally {
        lock.current = false;
        setBusy(null);
      }
    },
    [address, chainId, config, put, queryClient],
  );

  return (
    <TxContext.Provider value={{ run, busy }}>
      {children}
      <Toasts toasts={toasts} dismiss={dismiss} />
    </TxContext.Provider>
  );
}
