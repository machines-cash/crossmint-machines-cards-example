import { BN } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import {
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import type { Program } from "@coral-xyz/anchor";
import type { Main } from "@/chains/solana/idl/main";
import type {
  SingleSignerExecuteInput,
  SolanaExecutionBundle,
  WithdrawCollateralRequest,
} from "./types";
import { createSignatureVerificationInstruction } from "./ed25519";
import {
  getDestinationTokenAccount,
  getProgram,
  getProgramWithWalletPublicKey,
  getSourceTokenAccount,
  parsePublicKey,
  resolveDomainChainId,
} from "./program";
import { CoordinatorMessage } from "./messages";
import { decodeExecutionParameters } from "./payload-builders";

type SingleSignerCollateralLike = {
  coordinator: PublicKey;
  nonce?: number;
  adminFundsNonce?: number;
};

type CoordinatorAccountLike = {
  executors?: PublicKey[];
};

function getInstructionAccountNames(program: Program<Main>, methodName: string): string[] {
  const idlInstruction = program.idl.instructions.find((instruction) => instruction.name === methodName);
  if (!idlInstruction) {
    throw new Error(`IDL is missing ${methodName} instruction`);
  }
  return idlInstruction.accounts.map((account) => account.name);
}

function pickInstructionAccounts(
  names: string[],
  source: Record<string, PublicKey | null | undefined>,
): Record<string, PublicKey> {
  const picked: Record<string, PublicKey> = {};
  for (const name of names) {
    const value = source[name];
    if (!value) {
      throw new Error(`missing required account for ${name}`);
    }
    picked[name] = value;
  }
  return picked;
}

async function fetchSingleSignerCollateral(
  program: Program<Main>,
  collateralAddress: PublicKey,
): Promise<SingleSignerCollateralLike> {
  const accounts = program.account as unknown as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
  if (accounts.singleSignerCollateral) {
    return accounts.singleSignerCollateral.fetch(collateralAddress) as Promise<SingleSignerCollateralLike>;
  }
  if (accounts.collateralV2) {
    return accounts.collateralV2.fetch(collateralAddress) as Promise<SingleSignerCollateralLike>;
  }
  throw new Error("IDL is missing singleSignerCollateral/collateralV2 account. Update to v2.02 IDL.");
}

export async function executeSolanaSingleSignerWithdrawalV202(input: SingleSignerExecuteInput & { rpcUrl?: string }) {
  const {
    collateralProxyAddress,
    assetAddress,
    amountInCents,
    recipientAddress,
    expiresAt,
    executorPublisherSalt,
    executorPublisherSig,
  } = decodeExecutionParameters(input);

  const rpcUrl = input.rpcUrl ?? process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL is required");
  }

  const ownerSecret = bs58.decode(input.ownerSecretKeyBase58);
  const owner = Keypair.fromSecretKey(ownerSecret);

  const collateralAddress = parsePublicKey(collateralProxyAddress, "collateralProxyAddress");
  const mintAddress = parsePublicKey(assetAddress, "assetAddress");
  const recipient = parsePublicKey(recipientAddress, "recipientAddress");

  const program = getProgram({
    programAddress: input.programAddress,
    signer: owner,
    rpcUrl,
  });

  const collateralAccount = await fetchSingleSignerCollateral(program, collateralAddress);
  const nonce = collateralAccount.nonce ?? collateralAccount.adminFundsNonce;
  if (typeof nonce !== "number") {
    throw new Error("single signer collateral nonce is missing");
  }

  const withdrawRequest: WithdrawCollateralRequest = {
    amountOfAsset: new BN(amountInCents),
    signatureExpirationTime: new BN(expiresAt),
    coordinatorSignatureSalt: Array.from(Buffer.from(executorPublisherSalt, "base64")).map(Number),
  };

  const isNativeAsset = mintAddress.equals(PublicKey.default);
  const sourceTokenAccount = isNativeAsset
    ? null
    : await getSourceTokenAccount({
        depositAddress: parsePublicKey(input.depositAddress, "depositAddress"),
        mintAddress,
      });
  const destinationTokenAccount = isNativeAsset
    ? null
    : await getDestinationTokenAccount({
        program,
        payer: owner,
        recipientAddress: recipient,
        mintAddress,
      });

  const coordinator = await (
    program.account as unknown as { coordinator: { fetch: (key: PublicKey) => Promise<CoordinatorAccountLike> } }
  ).coordinator.fetch(collateralAccount.coordinator);

  const executor = coordinator.executors?.[0];
  if (!executor) {
    throw new Error("coordinator has no executor");
  }

  const coordinatorVerifyIx = createSignatureVerificationInstruction({
    signer: executor,
    signature: Buffer.from(executorPublisherSig, "base64"),
    message: CoordinatorMessage.getWithdrawMessage({
      collateral: collateralAddress,
      coordinator: collateralAccount.coordinator,
      sender: owner.publicKey,
      receiver: recipient,
      asset: mintAddress,
      request: withdrawRequest,
      adminFundsNonce: nonce,
      domainChainId: resolveDomainChainId(input.chainId),
    }),
  });

  const methods = program.methods as unknown as Record<string, (...args: unknown[]) => {
    accounts: (accounts: Record<string, PublicKey>) => { instruction: () => Promise<ReturnType<typeof Transaction.prototype.add>["instructions"][number]> };
  }>;

  const withdrawSingleSigner = methods.withdrawSingleSignerCollateralAsset;
  if (!withdrawSingleSigner) {
    throw new Error("IDL is missing withdrawSingleSignerCollateralAsset. Update to v2.02 IDL.");
  }

  const accountNames = getInstructionAccountNames(program, "withdrawSingleSignerCollateralAsset");
  const accountMap = pickInstructionAccounts(accountNames, {
    owner: owner.publicKey,
    sender: owner.publicKey,
    receiver: recipient,
    destination: recipient,
    coordinator: collateralAccount.coordinator,
    collateral: collateralAddress,
    asset: isNativeAsset ? null : mintAddress,
    collateralTokenAccount: sourceTokenAccount,
    receiverTokenAccount: destinationTokenAccount?.address ?? null,
    destinationTokenAccount: destinationTokenAccount?.address ?? null,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const withdrawIx = await withdrawSingleSigner(withdrawRequest)
    .accounts(accountMap)
    .instruction();

  const signature = await sendAndConfirmTransaction(
    program.provider.connection,
    new Transaction().add(coordinatorVerifyIx, withdrawIx),
    [owner],
    { commitment: "confirmed" },
  );

  return {
    status: "confirmed" as const,
    transactionSignature: signature,
    sourceTokenAccount: sourceTokenAccount?.toBase58() ?? null,
    destinationTokenAccount: destinationTokenAccount?.address.toBase58() ?? null,
  };
}

export async function prepareSolanaSingleSignerWithdrawalTransactionV202(
  input: SolanaExecutionBundle & {
    ownerAddress: string;
    rpcUrl?: string;
  },
) {
  const {
    collateralProxyAddress,
    assetAddress,
    amountInCents,
    recipientAddress,
    expiresAt,
    executorPublisherSalt,
    executorPublisherSig,
  } = decodeExecutionParameters(input);

  const rpcUrl = input.rpcUrl ?? process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL is required");
  }

  const owner = parsePublicKey(input.ownerAddress, "ownerAddress");
  const collateralAddress = parsePublicKey(collateralProxyAddress, "collateralProxyAddress");
  const mintAddress = parsePublicKey(assetAddress, "assetAddress");
  const recipient = parsePublicKey(recipientAddress, "recipientAddress");

  const program = getProgramWithWalletPublicKey({
    programAddress: input.programAddress,
    walletPublicKey: owner,
    rpcUrl,
  });

  const collateralAccount = await fetchSingleSignerCollateral(program, collateralAddress);
  const nonce = collateralAccount.nonce ?? collateralAccount.adminFundsNonce;
  if (typeof nonce !== "number") {
    throw new Error("single signer collateral nonce is missing");
  }

  const withdrawRequest: WithdrawCollateralRequest = {
    amountOfAsset: new BN(amountInCents),
    signatureExpirationTime: new BN(expiresAt),
    coordinatorSignatureSalt: Array.from(Buffer.from(executorPublisherSalt, "base64")).map(Number),
  };

  const isNativeAsset = mintAddress.equals(PublicKey.default);
  const sourceTokenAccount = isNativeAsset
    ? null
    : await getSourceTokenAccount({
        depositAddress: parsePublicKey(input.depositAddress, "depositAddress"),
        mintAddress,
      });

  const destinationTokenAddress = isNativeAsset
    ? null
    : await getAssociatedTokenAddress(mintAddress, recipient, false, TOKEN_PROGRAM_ID);

  const setupInstructions: TransactionInstruction[] = [];
  if (destinationTokenAddress) {
    const destinationAccountInfo = await program.provider.connection.getAccountInfo(
      destinationTokenAddress,
      "confirmed",
    );
    if (!destinationAccountInfo) {
      setupInstructions.push(
        createAssociatedTokenAccountInstruction(
          owner,
          destinationTokenAddress,
          recipient,
          mintAddress,
          TOKEN_PROGRAM_ID,
        ),
      );
    }
  }

  const coordinator = await (
    program.account as unknown as { coordinator: { fetch: (key: PublicKey) => Promise<CoordinatorAccountLike> } }
  ).coordinator.fetch(collateralAccount.coordinator);

  const executor = coordinator.executors?.[0];
  if (!executor) {
    throw new Error("coordinator has no executor");
  }

  const coordinatorVerifyIx = createSignatureVerificationInstruction({
    signer: executor,
    signature: Buffer.from(executorPublisherSig, "base64"),
    message: CoordinatorMessage.getWithdrawMessage({
      collateral: collateralAddress,
      coordinator: collateralAccount.coordinator,
      sender: owner,
      receiver: recipient,
      asset: mintAddress,
      request: withdrawRequest,
      adminFundsNonce: nonce,
      domainChainId: resolveDomainChainId(input.chainId),
    }),
  });

  const methods = program.methods as unknown as Record<string, (...args: unknown[]) => {
    accounts: (accounts: Record<string, PublicKey>) => { instruction: () => Promise<ReturnType<typeof Transaction.prototype.add>["instructions"][number]> };
  }>;

  const withdrawSingleSigner = methods.withdrawSingleSignerCollateralAsset;
  if (!withdrawSingleSigner) {
    throw new Error("IDL is missing withdrawSingleSignerCollateralAsset. Update to v2.02 IDL.");
  }

  const accountNames = getInstructionAccountNames(program, "withdrawSingleSignerCollateralAsset");
  const accountMap = pickInstructionAccounts(accountNames, {
    owner,
    sender: owner,
    receiver: recipient,
    destination: recipient,
    coordinator: collateralAccount.coordinator,
    collateral: collateralAddress,
    asset: isNativeAsset ? null : mintAddress,
    collateralTokenAccount: sourceTokenAccount,
    receiverTokenAccount: destinationTokenAddress,
    destinationTokenAccount: destinationTokenAddress,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const withdrawIx = await withdrawSingleSigner(withdrawRequest)
    .accounts(accountMap)
    .instruction();

  const latestBlockhash = await program.provider.connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: owner,
    recentBlockhash: latestBlockhash.blockhash,
  });
  if (setupInstructions.length > 0) {
    transaction.add(...setupInstructions);
  }
  transaction.add(coordinatorVerifyIx, withdrawIx);

  return {
    serializedTransaction: bs58.encode(
      transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      }),
    ),
    sourceTokenAccount: sourceTokenAccount?.toBase58() ?? null,
    destinationTokenAccount: destinationTokenAddress?.toBase58() ?? null,
    recentBlockhash: latestBlockhash.blockhash,
  };
}
