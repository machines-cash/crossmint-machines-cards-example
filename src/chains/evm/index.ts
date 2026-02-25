export type EvmWithdrawalExecutionInput = {
  chainId: number;
  tokenAddress: string;
  amountCents: number;
  recipientAddress: string;
  adminAddress: string;
};

export async function executeEvmWithdrawalStub(_input: EvmWithdrawalExecutionInput) {
  throw new Error(
    "EVM onchain execution is scaffolded for a follow-up phase. This demo uses partner API withdrawals only.",
  );
}
