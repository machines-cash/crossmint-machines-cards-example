export const SOLANA_MAINNET_CHAIN_ID = 900;
export const SOLANA_DEVNET_CHAIN_ID = 901;

export const SOLANA_CHAIN_LABELS: Record<number, string> = {
  [SOLANA_MAINNET_CHAIN_ID]: "mainnet-beta",
  [SOLANA_DEVNET_CHAIN_ID]: "devnet",
};

export function isSolanaChainId(value: number) {
  return value === SOLANA_MAINNET_CHAIN_ID || value === SOLANA_DEVNET_CHAIN_ID;
}
