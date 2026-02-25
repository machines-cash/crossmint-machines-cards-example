import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const BASE_SEPOLIA_CHAIN_ID = 84532;
const DEFAULT_RUSD_TOKEN = "0x10b5Be494C2962A7B318aFB63f0Ee30b959D000b";
const DEFAULT_RUSD_RPC_URL = "https://sepolia.base.org";
const DEFAULT_AUTOFUND_AMOUNT = 100;

const requestSchema = z.object({
  recipientAddress: z.string().min(1),
  amountDollars: z.number().int().min(1).max(100).optional(),
});

const RUSD_TOKEN_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ name: "_amountDollars_Max100", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
}

function getPrivateKey() {
  const privateKey = process.env.DEV_RUSD_MINTER_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error("DEV_RUSD_MINTER_PRIVATE_KEY is required");
  }
  return privateKey.startsWith("0x")
    ? privateKey
    : `0x${privateKey}`;
}

function getChainId() {
  const input = process.env.DEV_RUSD_CHAIN_ID?.trim();
  if (!input) return BASE_SEPOLIA_CHAIN_ID;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : BASE_SEPOLIA_CHAIN_ID;
}

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        {
          ok: false,
          summary: "forbidden",
          errors: [
            {
              code: "forbidden",
              message: "autofund is disabled in production",
            },
          ],
        },
        { status: 403 },
      );
    }

    const autofundEnabled = parseBoolean(
      process.env.DEV_RUSD_AUTOFUND_ENABLED,
      false,
    );
    if (!autofundEnabled) {
      return NextResponse.json(
        {
          ok: false,
          summary: "autofund disabled",
          errors: [
            {
              code: "autofund_disabled",
              message: "set DEV_RUSD_AUTOFUND_ENABLED=true to enable this route",
            },
          ],
        },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = requestSchema.parse(body);

    if (!isAddress(parsed.recipientAddress)) {
      return NextResponse.json(
        {
          ok: false,
          summary: "invalid request",
          errors: [
            {
              code: "invalid_request",
              message: "recipientAddress must be a valid EVM address",
            },
          ],
        },
        { status: 400 },
      );
    }

    const chainId = getChainId();
    if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
      return NextResponse.json(
        {
          ok: false,
          summary: "invalid chain",
          errors: [
            {
              code: "invalid_chain",
              message: `autofund only supports Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`,
            },
          ],
        },
        { status: 400 },
      );
    }

    const rpcUrl = process.env.DEV_RUSD_RPC_URL ?? DEFAULT_RUSD_RPC_URL;
    const tokenAddress = getAddress(
      process.env.DEV_RUSD_TOKEN_ADDRESS ?? DEFAULT_RUSD_TOKEN,
    );
    const recipientAddress = getAddress(parsed.recipientAddress);
    const amountDollars = parsed.amountDollars ?? DEFAULT_AUTOFUND_AMOUNT;
    const account = privateKeyToAccount(getPrivateKey() as `0x${string}`);

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl),
    });
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(rpcUrl),
    });

    const networkChainId = await publicClient.getChainId();
    if (networkChainId !== BASE_SEPOLIA_CHAIN_ID) {
      throw new Error(`rpc chain mismatch (${networkChainId})`);
    }

    const decimals = await publicClient.readContract({
      address: tokenAddress,
      abi: RUSD_TOKEN_ABI,
      functionName: "decimals",
    });

    const mintTxHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: RUSD_TOKEN_ABI,
      functionName: "mint",
      args: [BigInt(amountDollars)],
      account,
      chain: baseSepolia,
    });
    await publicClient.waitForTransactionReceipt({ hash: mintTxHash });

    const transferAmount = parseUnits(String(amountDollars), Number(decimals));
    const transferTxHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: RUSD_TOKEN_ABI,
      functionName: "transfer",
      args: [recipientAddress, transferAmount],
      account,
      chain: baseSepolia,
    });
    await publicClient.waitForTransactionReceipt({ hash: transferTxHash });

    return NextResponse.json({
      ok: true,
      data: {
        chainId: BASE_SEPOLIA_CHAIN_ID,
        recipientAddress,
        tokenAddress,
        amountDollars,
        mintTxHash,
        transferTxHash,
      },
      summary: "autofund completed",
      errors: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "autofund failed";
    return NextResponse.json(
      {
        ok: false,
        summary: "autofund failed",
        errors: [{ code: "autofund_failed", message }],
      },
      { status: 400 },
    );
  }
}
