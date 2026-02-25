import {
  AnchorProvider,
  Program,
  type Idl,
} from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  type Account,
} from "@solana/spl-token";
import mainIdl from "@/chains/solana/idl/main.json";
import type { Main } from "@/chains/solana/idl/main";

export function getProgram(options: {
  programAddress: string;
  signer: Keypair;
  rpcUrl: string;
}): Program<Main> {
  const connection = new Connection(options.rpcUrl, { commitment: "confirmed" });
  const idl = {
    ...mainIdl,
    address: options.programAddress,
  };

  const wallet = {
    publicKey: options.signer.publicKey,
    async signTransaction(transaction: Transaction) {
      transaction.partialSign(options.signer);
      return transaction;
    },
    async signAllTransactions(transactions: Transaction[]) {
      return transactions.map((transaction) => {
        transaction.partialSign(options.signer);
        return transaction;
      });
    },
  };

  const provider = new AnchorProvider(
    connection,
    wallet as AnchorProvider["wallet"],
    AnchorProvider.defaultOptions(),
  );

  return new Program<Main>(idl as Idl, provider);
}

export async function getDestinationTokenAccount(options: {
  program: Program<Main>;
  payer: Keypair;
  recipientAddress: PublicKey;
  mintAddress: PublicKey;
}): Promise<Account> {
  return getOrCreateAssociatedTokenAccount(
    options.program.provider.connection,
    options.payer,
    options.mintAddress,
    options.recipientAddress,
    false,
    "confirmed",
    { commitment: "confirmed" },
    TOKEN_PROGRAM_ID,
  );
}

export async function getSourceTokenAccount(options: {
  depositAddress: PublicKey;
  mintAddress: PublicKey;
}) {
  return getAssociatedTokenAddress(
    options.mintAddress,
    options.depositAddress,
    true,
  );
}

export function parsePublicKey(value: string, fieldName: string) {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${fieldName} must be a valid Solana public key`);
  }
}

export function resolveDomainChainId(chainId: number) {
  return BigInt(chainId);
}
