import { NextResponse } from "next/server";
import { z } from "zod";
import { executeSolanaMultisigWithdrawalV202 } from "@/chains/solana";

const requestSchema = z.object({
  chainId: z.union([z.literal(900), z.literal(901)]),
  programAddress: z.string().min(32),
  depositAddress: z.string().min(32),
  parameters: z.array(z.string()).length(7),
  contractId: z.string().optional().nullable(),
  ownerAddress: z.string().optional().nullable(),
  collateralAdminSecretKeyBase58: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);

    const secretKey =
      parsed.collateralAdminSecretKeyBase58 ??
      process.env.SOLANA_MULTISIG_COLLATERAL_ADMIN_PK;

    if (!secretKey) {
      return NextResponse.json(
        {
          ok: false,
          summary: "missing signer",
          errors: [
            {
              code: "missing_signer",
              message: "SOLANA_MULTISIG_COLLATERAL_ADMIN_PK is required for multisig execution",
            },
          ],
        },
        { status: 400 },
      );
    }

    const result = await executeSolanaMultisigWithdrawalV202({
      chainId: parsed.chainId,
      programAddress: parsed.programAddress,
      depositAddress: parsed.depositAddress,
      parameters: parsed.parameters as [string, string, number, string, number, string, string],
      contractId: parsed.contractId,
      ownerAddress: parsed.ownerAddress,
      collateralAdminSecretKeyBase58: secretKey,
      rpcUrl: process.env.SOLANA_RPC_URL,
    });

    return NextResponse.json({
      ok: true,
      data: result,
      summary: "multisig withdrawal confirmed",
      errors: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "multisig execution failed";
    return NextResponse.json(
      {
        ok: false,
        summary: "multisig execution failed",
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
