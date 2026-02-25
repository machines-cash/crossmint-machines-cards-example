import { NextResponse } from "next/server";
import { z } from "zod";
import { bootstrapMachinesSession, PartnerServerError } from "@/lib/server/partner-server";

const requestSchema = z.object({
  externalUserId: z.string().min(1),
  wallet: z.object({
    chain: z.enum(["evm", "solana"]),
    address: z.string().min(1),
  }),
  scopes: z.array(z.string().min(1)).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);
    const session = await bootstrapMachinesSession(parsed);

    return NextResponse.json({
      ok: true,
      data: session,
      summary: "session created",
      errors: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "session bootstrap failed";
    const status = error instanceof PartnerServerError ? error.status : 400;
    return NextResponse.json(
      {
        ok: false,
        summary: "session bootstrap failed",
        errors: [{ code: "session_bootstrap_failed", message }],
      },
      { status },
    );
  }
}
