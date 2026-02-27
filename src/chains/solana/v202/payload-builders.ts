import { z } from "zod";
import { SOLANA_DEVNET_CHAIN_ID, SOLANA_MAINNET_CHAIN_ID } from "@/chains/solana/constants";
import type {
  PartnerWithdrawalSignatureParameters,
  SingleSignerExecuteInput,
  SolanaExecutionBundle,
} from "./types";
import type { WithdrawalSignatureReady } from "@/types/partner";

const parametersSchema = z
  .array(z.string())
  .length(7)
  .transform((value) => value as PartnerWithdrawalSignatureParameters);

const bundleSchema = z.object({
  chainId: z.union([z.literal(SOLANA_MAINNET_CHAIN_ID), z.literal(SOLANA_DEVNET_CHAIN_ID)]),
  programAddress: z.string().min(32),
  depositAddress: z.string().min(32),
  contractId: z.string().optional().nullable(),
  ownerAddress: z.string().optional().nullable(),
});

export function parsePartnerWithdrawalParameters(
  rawParameters: string[] | null | undefined,
): PartnerWithdrawalSignatureParameters {
  if (!rawParameters) {
    throw new Error("withdrawal signature parameters are required");
  }

  const parsed = parametersSchema.safeParse(rawParameters);
  if (!parsed.success) {
    throw new Error("invalid withdrawal signature parameters");
  }

  return parsed.data;
}

export function buildSolanaExecutionBundle(input: {
  withdrawal: WithdrawalSignatureReady;
  chainId: number;
  programAddress: string;
  depositAddress: string;
  contractId?: string | null;
  ownerAddress?: string | null;
}): SolanaExecutionBundle {
  const parsedMeta = bundleSchema.safeParse({
    chainId: input.chainId,
    programAddress: input.programAddress,
    depositAddress: input.depositAddress,
    contractId: input.contractId ?? null,
    ownerAddress: input.ownerAddress ?? null,
  });
  if (!parsedMeta.success) {
    throw new Error(parsedMeta.error.issues.map((issue) => issue.message).join(", "));
  }

  if (input.withdrawal.status !== "ready") {
    throw new Error("withdrawal signature is not ready yet");
  }

  if (input.withdrawal.execution?.callPath !== "solana_v2_02") {
    throw new Error("withdrawal execution is not marked as solana_v2_02");
  }

  const parameters = parsePartnerWithdrawalParameters(input.withdrawal.parameters);
  return {
    parameters,
    chainId: parsedMeta.data.chainId,
    programAddress: parsedMeta.data.programAddress,
    depositAddress: parsedMeta.data.depositAddress,
    contractId: parsedMeta.data.contractId,
    ownerAddress: parsedMeta.data.ownerAddress,
  };
}

export function buildSingleSignerInput(input: {
  bundle: SolanaExecutionBundle;
  ownerSecretKeyBase58: string;
}): SingleSignerExecuteInput {
  if (!input.ownerSecretKeyBase58.trim()) {
    throw new Error("ownerSecretKeyBase58 is required");
  }

  return {
    ...input.bundle,
    ownerSecretKeyBase58: input.ownerSecretKeyBase58.trim(),
  };
}

export function decodeExecutionParameters(bundle: SolanaExecutionBundle) {
  const [
    collateralProxyAddress,
    assetAddress,
    amountInCents,
    recipientAddress,
    expiresAt,
    executorPublisherSalt,
    executorPublisherSig,
  ] = bundle.parameters;

  return {
    collateralProxyAddress,
    assetAddress,
    amountInCents: Number(amountInCents),
    recipientAddress,
    expiresAt: Number(expiresAt),
    executorPublisherSalt:
      typeof executorPublisherSalt === "string"
        ? executorPublisherSalt
        : Buffer.from(Uint8Array.from(executorPublisherSalt)).toString("base64"),
    executorPublisherSig,
  };
}
