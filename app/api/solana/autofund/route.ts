import { NextResponse } from "next/server";
import { z } from "zod";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getMint,
  getOrCreateAssociatedTokenAccount,
  transferChecked,
} from "@solana/spl-token";

const SOLANA_MAINNET_CHAIN_ID = 900;
const SOLANA_DEVNET_CHAIN_ID = 901;
const DEFAULT_MINT_PROGRAM_ID = "HaJ8CaGUJ1w8CjqM2cvaMtTNXSZFhwtmKHeRkYBvEGjj";
const MINT_DISCRIMINATOR = Buffer.from([59, 132, 24, 246, 122, 39, 8, 243]);
const DEFAULT_MINT_SEED = "rUSD";
const DEFAULT_DECIMALS = 6;

const requestSchema = z.object({
  recipientAddress: z.string().min(32),
  amountDollars: z.number().positive().max(100),
  chainId: z.union([z.literal(SOLANA_MAINNET_CHAIN_ID), z.literal(SOLANA_DEVNET_CHAIN_ID)]).nullable().optional(),
});

function toErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "solana autofund failed";
}

function resolveRpcUrl(chainId: number) {
  if (process.env.SOLANA_RPC_URL) {
    return process.env.SOLANA_RPC_URL;
  }
  return chainId === SOLANA_MAINNET_CHAIN_ID
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

function resolveSignerSecret() {
  return (
    process.env.SOLANA_AUTOFUND_SECRET_KEY_BASE58 ??
    process.env.SOLANA_MULTISIG_COLLATERAL_ADMIN_PK ??
    ""
  );
}

function amountToBaseUnits(amountDollars: number, decimals: number): bigint {
  const scaled = amountDollars * 10 ** decimals;
  const rounded = Math.round(scaled);
  if (!Number.isFinite(rounded) || rounded <= 0) {
    throw new Error("amount must be greater than zero");
  }
  return BigInt(rounded);
}

function buildMintInstruction(input: {
  programId: PublicKey;
  mintAddress: PublicKey;
  payer: PublicKey;
  destinationTokenAccount: PublicKey;
  amount: bigint;
}) {
  if (input.amount < 0n) {
    throw new Error("amount must be non-negative");
  }
  if (input.amount > 18_446_744_073_709_551_615n) {
    throw new Error("amount exceeds u64");
  }

  const data = Buffer.alloc(16);
  MINT_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(input.amount, 8);

  return new TransactionInstruction({
    programId: input.programId,
    keys: [
      { pubkey: input.mintAddress, isSigner: false, isWritable: true },
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: input.destinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);
    const chainId = parsed.chainId ?? SOLANA_DEVNET_CHAIN_ID;
    const signerSecret = resolveSignerSecret();
    if (!signerSecret) {
      return NextResponse.json(
        {
          ok: false,
          summary: "missing signer",
          errors: [
            {
              code: "missing_signer",
              message:
                "Set SOLANA_AUTOFUND_SECRET_KEY_BASE58 (or SOLANA_MULTISIG_COLLATERAL_ADMIN_PK) for Solana sandbox autofund.",
            },
          ],
        },
        { status: 400 },
      );
    }

    const signer = Keypair.fromSecretKey(bs58.decode(signerSecret));
    const connection = new Connection(resolveRpcUrl(chainId), {
      commitment: "confirmed",
    });

    const programAddress =
      process.env.SOLANA_RUSD_MINT_PROGRAM_ADDRESS ?? DEFAULT_MINT_PROGRAM_ID;
    const programId = new PublicKey(programAddress);
    const mintSeed = Buffer.from(
      process.env.SOLANA_RUSD_MINT_SEED ?? DEFAULT_MINT_SEED,
      "utf8",
    );
    const [mintAddress] = PublicKey.findProgramAddressSync([mintSeed], programId);

    const recipientOwner = new PublicKey(parsed.recipientAddress);
    const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      signer,
      mintAddress,
      signer.publicKey,
      false,
      "confirmed",
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      signer,
      mintAddress,
      recipientOwner,
      true,
      "confirmed",
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    let decimals = DEFAULT_DECIMALS;
    try {
      const mint = await getMint(
        connection,
        mintAddress,
        "confirmed",
        TOKEN_PROGRAM_ID,
      );
      decimals = mint.decimals;
    } catch {
      decimals = DEFAULT_DECIMALS;
    }

    const amountBaseUnits = amountToBaseUnits(parsed.amountDollars, decimals);
    const mintInstruction = buildMintInstruction({
      programId,
      mintAddress,
      payer: signer.publicKey,
      destinationTokenAccount: payerTokenAccount.address,
      amount: amountBaseUnits,
    });

    const mintTxHash = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(mintInstruction),
      [signer],
      { commitment: "confirmed" },
    );

    let transferTxHash = mintTxHash;
    if (!payerTokenAccount.address.equals(recipientTokenAccount.address)) {
      transferTxHash = await transferChecked(
        connection,
        signer,
        payerTokenAccount.address,
        mintAddress,
        recipientTokenAccount.address,
        signer,
        amountBaseUnits,
        decimals,
        [],
        { commitment: "confirmed" },
        TOKEN_PROGRAM_ID,
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        chainId,
        recipientAddress: parsed.recipientAddress,
        tokenAddress: mintAddress.toBase58(),
        amountDollars: parsed.amountDollars,
        mintTxHash,
        transferTxHash,
      },
      summary: "solana autofund completed",
      errors: [],
    });
  } catch (cause) {
    return NextResponse.json(
      {
        ok: false,
        summary: "solana autofund failed",
        errors: [
          {
            code: "autofund_failed",
            message: toErrorMessage(cause),
          },
        ],
      },
      { status: 400 },
    );
  }
}
