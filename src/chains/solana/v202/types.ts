import type { BN } from "@coral-xyz/anchor";

export type WithdrawCollateralRequest = {
  amountOfAsset: BN;
  signatureExpirationTime: BN;
  coordinatorSignatureSalt: number[];
};

export type PartnerWithdrawalSignatureParameters = [
  collateralProxyAddress: string,
  assetAddress: string,
  amountInCents: string | number,
  recipientAddress: string,
  expiresAt: string | number,
  executorPublisherSalt: string | number[],
  executorPublisherSig: string,
];

export type SolanaExecutionBundle = {
  parameters: PartnerWithdrawalSignatureParameters;
  chainId: number;
  programAddress: string;
  depositAddress: string;
  contractId?: string | null;
  ownerAddress?: string | null;
};

export type MultisigExecuteInput = SolanaExecutionBundle & {
  collateralAdminSecretKeyBase58: string;
};

export type SingleSignerExecuteInput = SolanaExecutionBundle & {
  ownerSecretKeyBase58: string;
};
