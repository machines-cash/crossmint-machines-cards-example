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

const COLLATERAL_V2_DISCRIMINATOR = [165, 86, 67, 157, 199, 120, 39, 111];
const COLLATERAL_ADMIN_SIGNATURES_V2_DISCRIMINATOR = [
  194, 102, 185, 168, 0, 177, 70, 136,
];

function normalizeRainSolanaIdl(idl: typeof mainIdl) {
  const cloned = JSON.parse(JSON.stringify(idl)) as typeof mainIdl;
  const accounts = (cloned.accounts ?? []) as Array<{
    name: string;
    discriminator?: number[];
  }>;
  const types = (cloned.types ?? []) as Array<{
    name: string;
    type?: unknown;
  }>;

  const hasAccount = (name: string) => accounts.some((account) => account.name === name);
  const hasType = (name: string) => types.some((type) => type.name === name);

  if (!hasAccount("CollateralV2")) {
    accounts.push({
      name: "CollateralV2",
      discriminator: COLLATERAL_V2_DISCRIMINATOR,
    });
  }

  if (!hasType("CollateralV2")) {
    const collateralType = types.find((type) => type.name === "Collateral");
    if (collateralType) {
      types.push({
        ...collateralType,
        name: "CollateralV2",
      });
    }
  }

  if (!hasAccount("CollateralAdminSignaturesV2")) {
    accounts.push({
      name: "CollateralAdminSignaturesV2",
      discriminator: COLLATERAL_ADMIN_SIGNATURES_V2_DISCRIMINATOR,
    });
  }

  if (!hasType("CollateralAdminSignaturesV2")) {
    const collateralSignaturesType = types.find(
      (type) => type.name === "CollateralAdminSignatures",
    );
    if (collateralSignaturesType) {
      types.push({
        ...collateralSignaturesType,
        name: "CollateralAdminSignaturesV2",
      });
    }
  }

  return cloned;
}

export function getProgram(options: {
  programAddress: string;
  signer: Keypair;
  rpcUrl: string;
}): Program<Main> {
  const connection = new Connection(options.rpcUrl, { commitment: "confirmed" });
  const normalizedIdl = normalizeRainSolanaIdl(mainIdl);
  const idl = {
    ...normalizedIdl,
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

export function getProgramWithWalletPublicKey(options: {
  programAddress: string;
  walletPublicKey: PublicKey;
  rpcUrl: string;
}): Program<Main> {
  const connection = new Connection(options.rpcUrl, { commitment: "confirmed" });
  const normalizedIdl = normalizeRainSolanaIdl(mainIdl);
  const idl = {
    ...normalizedIdl,
    address: options.programAddress,
  };

  const wallet = {
    publicKey: options.walletPublicKey,
    async signTransaction(transaction: Transaction) {
      return transaction;
    },
    async signAllTransactions(transactions: Transaction[]) {
      return transactions;
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
