import { NextResponse } from "next/server";
import { z } from "zod";
import { executeSolanaSingleSignerWithdrawalV202 } from "@/chains/solana";

const requestSchema = z.object({
  chainId: z.union([z.literal(900), z.literal(901)]),
  programAddress: z.string().min(32),
  depositAddress: z.string().min(32),
  parameters: z.array(z.string()).length(7),
  contractId: z.string().optional().nullable(),
  ownerAddress: z.string().optional().nullable(),
  ownerSecretKeyBase58: z.string().min(10),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);

    const result = await executeSolanaSingleSignerWithdrawalV202({
      chainId: parsed.chainId,
      programAddress: parsed.programAddress,
      depositAddress: parsed.depositAddress,
      parameters: parsed.parameters as [string, string, number, string, number, string, string],
      contractId: parsed.contractId,
      ownerAddress: parsed.ownerAddress,
      ownerSecretKeyBase58: parsed.ownerSecretKeyBase58,
      rpcUrl: process.env.SOLANA_RPC_URL,
    });

    return NextResponse.json({
      ok: true,
      data: result,
      summary: "single-signer withdrawal confirmed",
      errors: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "single-signer execution failed";
    return NextResponse.json(
      {
        ok: false,
        summary: "single-signer execution failed",
        errors: [
          {
            code: "execution_failed",
            message,
          },
        ],
      },
      { status: 400 },
    );
  }
}
