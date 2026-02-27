import type { WalletChain } from "@/types/partner";

export function isNetworkSupportedForWallet(
  networkId: string,
  walletChain: WalletChain,
) {
  const normalized = networkId.trim().toLowerCase();
  if (walletChain === "solana") {
    return normalized === "solana";
  }
  return normalized !== "solana" && normalized !== "stellar";
}

export function preferredNetworkForWalletChain(walletChain: WalletChain) {
  return walletChain === "solana" ? "solana" : "base";
}
