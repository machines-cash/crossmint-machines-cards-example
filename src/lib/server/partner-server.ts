import { z } from "zod";
import type { PartnerResponse, PartnerWallet, SessionPayload } from "@/types/partner";

const resolveInputSchema = z.object({
  externalUserId: z.string().min(1),
  wallet: z.object({
    chain: z.enum(["evm", "solana"]),
    address: z.string().min(1),
  }),
  scopes: z.array(z.string().min(1)).optional(),
});

const KYC_BOOTSTRAP_SCOPES = ["kyc.read", "kyc.write"] as const;

export class PartnerServerError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly summary?: string;

  constructor(message: string, status: number, options?: { code?: string; summary?: string }) {
    super(message);
    this.name = "PartnerServerError";
    this.status = status;
    this.code = options?.code;
    this.summary = options?.summary;
  }
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseScopes(scopes?: string[]) {
  if (scopes && scopes.length > 0) {
    return scopes;
  }

  const defaults = process.env.MACHINES_PARTNER_DEFAULT_SCOPES;
  if (!defaults) {
    return [
      "users.read",
      "users.write",
      "kyc.read",
      "kyc.write",
      "cards.read",
      "cards.write",
      "cards.secrets.read",
      "deposits.read",
      "deposits.write",
      "balances.read",
      "transactions.read",
      "withdrawals.write",
    ];
  }

  return defaults
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function resolvePartnerUrl(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (
    normalizedBase.endsWith("/partner/v1") &&
    normalizedPath.startsWith("/partner/v1/")
  ) {
    return `${normalizedBase}${normalizedPath.slice("/partner/v1".length)}`;
  }

  return `${normalizedBase}${normalizedPath}`;
}

async function requestPartnerApi<T>(path: string, options: {
  method?: "GET" | "POST";
  body?: unknown;
  sessionToken?: string;
}): Promise<T> {
  const baseUrl = requiredEnv("MACHINES_PARTNER_BASE_URL").replace(/\/$/, "");
  const partnerKey = requiredEnv("MACHINES_PARTNER_API_KEY");

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Partner-Key": partnerKey,
  };

  if (options.sessionToken) {
    headers.Authorization = `Bearer ${options.sessionToken}`;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(resolvePartnerUrl(baseUrl, path), {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  const text = await response.text();
  let json: PartnerResponse<T> | null = null;

  if (text) {
    try {
      json = JSON.parse(text) as PartnerResponse<T>;
    } catch {
      throw new PartnerServerError(`invalid partner json (${response.status})`, response.status);
    }
  }

  if (!response.ok || !json?.ok || json.data === undefined) {
    const summary = json?.summary ?? `partner request failed (${response.status})`;
    const details = json?.errors?.map((error) => error.message).join("; ");
    throw new PartnerServerError(details ? `${summary}: ${details}` : summary, response.status, {
      code: json?.errors?.[0]?.code,
      summary: json?.summary,
    });
  }

  return json.data;
}

export async function bootstrapMachinesSession(input: {
  externalUserId: string;
  wallet: PartnerWallet;
  scopes?: string[];
}): Promise<SessionPayload> {
  const parsed = resolveInputSchema.parse(input);

  await requestPartnerApi<{
    userId: string;
    walletAddress: string | null;
    wallet: PartnerWallet | null;
    kycStatus: string;
    createdAt: string;
  }>("/partner/v1/users/resolve", {
    method: "POST",
    body: {
      externalUserId: parsed.externalUserId,
      wallet: parsed.wallet,
    },
  });

  const requestedScopes = parseScopes(parsed.scopes);

  try {
    return await requestPartnerApi<SessionPayload>("/partner/v1/sessions", {
      method: "POST",
      body: {
        externalUserId: parsed.externalUserId,
        wallet: parsed.wallet,
        scopes: requestedScopes,
        ttlSeconds: 60 * 30,
      },
    });
  } catch (error) {
    if (
      error instanceof PartnerServerError &&
      error.status === 409 &&
      /kyc required/i.test(error.message)
    ) {
      return requestPartnerApi<SessionPayload>("/partner/v1/sessions", {
        method: "POST",
        body: {
          externalUserId: parsed.externalUserId,
          wallet: parsed.wallet,
          scopes: [...KYC_BOOTSTRAP_SCOPES],
          ttlSeconds: 60 * 30,
        },
      });
    }
    throw error;
  }
}
