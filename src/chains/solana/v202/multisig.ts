import nacl from "tweetnacl";
import { randomBytes } from "crypto";
import { BN } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import {
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { Program } from "@coral-xyz/anchor";
import type { Main } from "@/chains/solana/idl/main";
import type { MultisigExecuteInput, WithdrawCollateralRequest } from "./types";
import { createSignatureVerificationInstruction } from "./ed25519";
import {
  getDestinationTokenAccount,
  getProgram,
  getSourceTokenAccount,
  parsePublicKey,
  resolveDomainChainId,
} from "./program";
import { CollateralMessage, CoordinatorMessage } from "./messages";
import { decodeExecutionParameters } from "./payload-builders";

type CollateralAccountLike = {
  coordinator: PublicKey;
  adminFundsNonce?: number;
  nonce?: number;
  admins?: PublicKey[];
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

async function fetchCollateralAccountV202(
  program: Program<Main>,
  collateralAddress: PublicKey,
): Promise<CollateralAccountLike> {
  const programAccounts = program.account as unknown as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;

  if (programAccounts.collateralV2) {
    return programAccounts.collateralV2.fetch(collateralAddress) as Promise<CollateralAccountLike>;
  }
  if (programAccounts.collateral) {
    return programAccounts.collateral.fetch(collateralAddress) as Promise<CollateralAccountLike>;
  }
  throw new Error("IDL is missing collateral/collateralV2 account. Update to Rain Solana v2.02 IDL.");
}

async function fetchCollateralSignatureAccount(
  program: Program<Main>,
  signatureAddress: PublicKey,
): Promise<{ signers: PublicKey[] } | null> {
  const programAccounts = program.account as unknown as Record<string, { fetchNullable?: (key: PublicKey) => Promise<unknown> }>;

  if (programAccounts.collateralAdminSignaturesV2?.fetchNullable) {
    return programAccounts.collateralAdminSignaturesV2.fetchNullable(signatureAddress) as Promise<{ signers: PublicKey[] } | null>;
  }
  if (programAccounts.collateralAdminSignatures?.fetchNullable) {
    return programAccounts.collateralAdminSignatures.fetchNullable(signatureAddress) as Promise<{ signers: PublicKey[] } | null>;
  }
  throw new Error("IDL is missing collateralAdminSignatures/collateralAdminSignaturesV2.");
}

async function submitCollateralSignatureV202(options: {
  program: Program<Main>;
  sender: Keypair;
  recipientAddress: PublicKey;
  mintAddress: PublicKey;
  collateralAddress: PublicKey;
  request: WithdrawCollateralRequest;
  adminFundsNonce: number;
  chainId: number;
}) {
  const collateralMessageSalt = Array.from(randomBytes(32)).map(Number);
  const collateralMessage = CollateralMessage.getWithdrawMessage({
    collateral: options.collateralAddress,
    sender: options.sender.publicKey,
    receiver: options.recipientAddress,
    asset: options.mintAddress,
    request: options.request,
    salt: collateralMessageSalt,
    adminFundsNonce: options.adminFundsNonce,
    domainChainId: resolveDomainChainId(options.chainId),
  });

  const collateralSignature = nacl.sign.detached(
    Uint8Array.from(collateralMessage),
    options.sender.secretKey,
  );

  const collateralSignatureAddress = CollateralMessage.generateWithdrawCollateralPda({
    collateral: options.collateralAddress,
    sender: options.sender.publicKey,
    receiver: options.recipientAddress,
    asset: options.mintAddress,
    request: options.request,
    adminFundsNonce: options.adminFundsNonce,
    programId: options.program.programId,
  });

  const existingAccount = await fetchCollateralSignatureAccount(options.program, collateralSignatureAddress);
  const alreadySubmitted =
    existingAccount?.signers?.some((signer) => signer.equals(options.sender.publicKey)) ?? false;

  if (!alreadySubmitted) {
    const verifyIx = createSignatureVerificationInstruction({
      signer: options.sender.publicKey,
      signature: Buffer.from(collateralSignature),
      message: collateralMessage,
    });

    const submitAccounts = pickInstructionAccounts(
      getInstructionAccountNames(options.program, "submitSignatures"),
      {
        collateral: options.collateralAddress,
        collateralAdminSignatures: collateralSignatureAddress,
        rentPayer: options.sender.publicKey,
        instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      },
    );

    const submitTransaction = await options.program.methods
      .submitSignatures({
        salts: [collateralMessageSalt],
        targetNonce: options.adminFundsNonce,
        signatureSubmissionType: {
          withdrawCollateralAsset: {
            sender: options.sender.publicKey,
            receiver: options.recipientAddress,
            asset: options.mintAddress,
            withdrawRequest: options.request,
          },
        },
      })
      .accounts(submitAccounts as never)
      .preInstructions([verifyIx])
      .transaction();

    await sendAndConfirmTransaction(
      options.program.provider.connection,
      submitTransaction,
      [options.sender],
      { commitment: "confirmed" },
    );
  }

  return collateralSignatureAddress;
}

export async function executeSolanaMultisigWithdrawalV202(input: MultisigExecuteInput & { rpcUrl?: string }) {
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

  const senderSecret = bs58.decode(input.collateralAdminSecretKeyBase58);
  const sender = Keypair.fromSecretKey(senderSecret);

  const collateralAddress = parsePublicKey(collateralProxyAddress, "collateralProxyAddress");
  const mintAddress = parsePublicKey(assetAddress, "assetAddress");
  const recipient = parsePublicKey(recipientAddress, "recipientAddress");
  const program = getProgram({
    programAddress: input.programAddress,
    signer: sender,
    rpcUrl,
  });

  const collateralAccount = await fetchCollateralAccountV202(program, collateralAddress);
  const nonce = collateralAccount.adminFundsNonce ?? collateralAccount.nonce;
  if (typeof nonce !== "number") {
    throw new Error("collateral nonce is missing");
  }
  if (
    Array.isArray(collateralAccount.admins) &&
    collateralAccount.admins.length > 0 &&
    !collateralAccount.admins.some((admin) => admin.equals(sender.publicKey))
  ) {
    throw new Error(
      `signer ${sender.publicKey.toBase58()} is not a collateral admin (admins: ${collateralAccount.admins
        .map((admin) => admin.toBase58())
        .join(", ")})`,
    );
  }

  const withdrawRequest: WithdrawCollateralRequest = {
    amountOfAsset: new BN(amountInCents),
    signatureExpirationTime: new BN(expiresAt),
    coordinatorSignatureSalt: Array.from(Buffer.from(executorPublisherSalt, "base64")).map(Number),
  };

  const sourceTokenAccount = await getSourceTokenAccount({
    depositAddress: parsePublicKey(input.depositAddress, "depositAddress"),
    mintAddress,
  });

  const destinationTokenAccount = await getDestinationTokenAccount({
    program,
    payer: sender,
    recipientAddress: recipient,
    mintAddress,
  });

  const collateralSignatureAddress = await submitCollateralSignatureV202({
    program,
    sender,
    recipientAddress: recipient,
    mintAddress,
    collateralAddress,
    request: withdrawRequest,
    adminFundsNonce: nonce,
    chainId: input.chainId,
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
      sender: sender.publicKey,
      receiver: recipient,
      asset: mintAddress,
      request: withdrawRequest,
      adminFundsNonce: nonce,
      domainChainId: resolveDomainChainId(input.chainId),
    }),
  });

  const withdrawAccounts = pickInstructionAccounts(
    getInstructionAccountNames(program, "withdrawCollateralAsset"),
    {
      rentReceiver: sender.publicKey,
      sender: sender.publicKey,
      receiver: recipient,
      asset: mintAddress,
      collateralTokenAccount: sourceTokenAccount,
      receiverTokenAccount: destinationTokenAccount.address,
      collateralAuthority: PublicKey.findProgramAddressSync(
        [Buffer.from("CollateralAuthority"), collateralAddress.toBuffer()],
        program.programId,
      )[0],
      coordinator: collateralAccount.coordinator,
      collateral: collateralAddress,
      collateralAdminSignatures: collateralSignatureAddress,
      tokenProgram: TOKEN_PROGRAM_ID,
      instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: SystemProgram.programId,
    },
  );

  const withdrawIx = await program.methods
    .withdrawCollateralAsset(withdrawRequest)
    .accounts(withdrawAccounts as never)
    .instruction();

  const transactionSignature = await sendAndConfirmTransaction(
    program.provider.connection,
    new Transaction().add(coordinatorVerifyIx, withdrawIx),
    [sender],
    { commitment: "confirmed" },
  );

  return {
    status: "confirmed" as const,
    transactionSignature,
    collateralSignatureAddress: collateralSignatureAddress.toBase58(),
    sourceTokenAccount: sourceTokenAccount.toBase58(),
    destinationTokenAccount: destinationTokenAccount.address.toBase58(),
  };
}
