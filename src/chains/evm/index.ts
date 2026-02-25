export type EvmWithdrawalExecutionInput = {
  chainId: number;
  tokenAddress: string;
  amountCents: number;
  recipientAddress: string;
  adminAddress: string;
};

export async function executeEvmWithdrawalStub(_input: EvmWithdrawalExecutionInput) {
  throw new Error(
    "EVM execution is intentionally scaffolded for phase 2. This Solana-first demo only executes Solana flows.",
  );
}
