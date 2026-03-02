import { z } from "zod";
import { requiredEnv, resolvePartnerUrl } from "@/lib/server/partner-http";

const partnerDepositSchema = z.object({
  contractId: z.string().optional().nullable(),
  chainId: z.number().optional().nullable(),
  depositAddress: z.string().optional().nullable(),
  updatedAt: z.string().optional().nullable(),
});

const partnerDepositsResponseSchema = z.object({
  ok: z.boolean(),
  data: z
    .object({
      deposits: z.array(partnerDepositSchema),
    })
    .optional(),
});

function normalizeAddress(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

async function getPartnerDepositsForExecution(input: { authorization: string }) {
  const upstreamBase = requiredEnv("MACHINES_PARTNER_BASE_URL");
  const partnerKey = requiredEnv("MACHINES_PARTNER_API_KEY");

  const response = await fetch(
    resolvePartnerUrl(upstreamBase, "/partner/v1/deposits?scope=all"),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Partner-Key": partnerKey,
        Authorization: input.authorization,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return [];
  }

  const text = await response.text();
  if (!text) {
    return [];
  }

  const parsed = partnerDepositsResponseSchema.safeParse(JSON.parse(text));
  if (!parsed.success || !parsed.data.ok || !parsed.data.data) {
    return [];
  }

  return parsed.data.data.deposits;
}

export async function resolveExecutionDepositAddress(input: {
  chainId: number;
  depositAddress: string;
  contractId?: string | null;
  ownerAddress?: string | null;
  collateralProxyAddress?: string | null;
  authorization?: string | null;
}): Promise<string> {
  const fallback = input.depositAddress;
  const proxyAddress = input.collateralProxyAddress ?? null;

  const shouldResolve =
    !fallback ||
    (proxyAddress !== null &&
      normalizeAddress(fallback) === normalizeAddress(proxyAddress));

  if (!shouldResolve) {
    return fallback;
  }

  if (!input.authorization) {
    return fallback;
  }

  try {
    const deposits = await getPartnerDepositsForExecution({
      authorization: input.authorization,
    });

    const withAddress = deposits
      .filter((deposit) => {
        if (!deposit.depositAddress) return false;
        if (input.contractId && deposit.contractId !== input.contractId) return false;
        if (deposit.chainId && deposit.chainId !== input.chainId) return false;
        if (
          proxyAddress !== null &&
          normalizeAddress(deposit.depositAddress) === normalizeAddress(proxyAddress)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aTs = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const bTs = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        return bTs - aTs;
      });

    if (withAddress.length === 0) {
      return fallback;
    }

    return withAddress[0].depositAddress ?? fallback;
  } catch {
    return fallback;
  }
}
