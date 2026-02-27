import { NextResponse } from "next/server";
import { z } from "zod";
import { executeSolanaMultisigWithdrawalV202 } from "@/chains/solana";

const parameterSchema = z.union([
  z.string(),
  z.number(),
  z.array(z.number().int().min(0).max(255)),
]);

const requestSchema = z.object({
  chainId: z.union([z.literal(900), z.literal(901)]),
  programAddress: z.string().min(32),
  depositAddress: z.string().min(32),
  parameters: z.array(parameterSchema).length(7),
  contractId: z.string().optional().nullable(),
  ownerAddress: z.string().optional().nullable(),
  collateralAdminSecretKeyBase58: z.string().optional(),
});

function normalizeParameters(
  parameters: Array<string | number | number[]>,
): [string, string, string, string, string, string, string] {
  const [collateralProxy, asset, amount, recipient, expiresAt, salt, signature] =
    parameters;
  const saltBase64 = Array.isArray(salt)
    ? Buffer.from(Uint8Array.from(salt)).toString("base64")
    : String(salt);

  return [
    String(collateralProxy),
    String(asset),
    String(amount),
    String(recipient),
    String(expiresAt),
    saltBase64,
    String(signature),
  ];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);
    const parameters = normalizeParameters(parsed.parameters);

    const secretKey =
      parsed.collateralAdminSecretKeyBase58 ??
      process.env.SOLANA_MULTISIG_COLLATERAL_ADMIN_PK ??
      process.env.SOLANA_AUTOFUND_SECRET_KEY_BASE58;

    if (!secretKey) {
      return NextResponse.json(
        {
          ok: false,
          summary: "missing signer",
          errors: [
            {
              code: "missing_signer",
              message:
                "Set SOLANA_MULTISIG_COLLATERAL_ADMIN_PK (or SOLANA_AUTOFUND_SECRET_KEY_BASE58) for Solana multisig execution.",
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
      parameters,
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
