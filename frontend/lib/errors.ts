import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

/** Custom errors from the contracts, in the interface's words. */
const MESSAGES: Record<string, string> = {
  ZeroAmount: "Enter an amount above zero.",
  NotCurator: "Only this vault's curator can do that.",
  NotActiveManager: "Only Active managers can be added. Self-only managers need one settled epoch first.",
  AlreadyAdded: "This manager is already in the vault.",
  NotListed: "This manager is not listed in the vault.",
  TooManyManagers: "The manager limit is reached.",
  TooManyVaults: "The vault limit for this testnet is reached.",
  BadConfig: "Curator cut must be 0–50% and the first-loss ratio 0.01–100%.",
  NothingToClaim: "There is nothing to claim or cancel right now.",
  PendingUnclaimed: "Claim your earlier withdrawal before requesting a new one.",
  AlreadyRegistered: "This wallet is already registered as a manager.",
  NotRegistered: "This wallet is not an active manager.",
  StakeTooLow: "The stake is below the 1,000 mUSDC minimum.",
  BadTicks: "That price range is not valid.",
  RebalanceLimit: "You have used every rebalance for this epoch.",
  CannotRebalance: "Your current status does not allow rebalancing.",
  InsufficientInventory: "The position does not hold enough tokens for that swap.",
  EpochNotOver: "The epoch has not ended yet.",
  StalePrice: "The oracle price is stale. Try again after the feed updates.",
  PoolDeviation: "The pool price is too far from the oracle. Settlement waits until it is arbitraged back.",
  FaucetCooldown: "The faucet pays once per day. Come back tomorrow.",
};

export function explain(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "You rejected the request in your wallet.";
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && MESSAGES[name]) return MESSAGES[name];
      if (name) return `The contract rejected this: ${name}.`;
      if (revert.reason) return `The contract rejected this: ${revert.reason}.`;
    }
    if (/insufficient funds/i.test(error.message)) return "Not enough testnet ETH to pay gas.";
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
