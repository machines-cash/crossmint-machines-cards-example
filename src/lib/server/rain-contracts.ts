import { z } from "zod";

const rainUserSchema = z.object({
  id: z.string().min(1),
  walletAddress: z.string().optional().nullable(),
  solanaAddress: z.string().optional().nullable(),
});

const rainContractSchema = z.object({
  id: z.string().min(1),
  chainId: z.number().optional().nullable(),
  proxyAddress: z.string().optional().nullable(),
  depositAddress: z.string().optional().nullable(),
});

function normalizeAddress(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function resolveRainBaseUrl() {
  return (process.env.RAIN_BASE_URL ?? "https://api-dev.raincards.xyz").replace(/\/$/, "");
}

async function rainRequest<T>(path: string): Promise<T> {
  const apiKey = process.env.RAIN_API_KEY;
  if (!apiKey) {
    throw new Error("RAIN_API_KEY is required");
  }

  const response = await fetch(`${resolveRainBaseUrl()}${path}`, {
    method: "GET",
    headers: {
      "Api-Key": apiKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`rain request failed (${response.status})`);
  }

  return JSON.parse(text) as T;
}

async function findRainUserIdByAddress(ownerAddress: string): Promise<string | null> {
  const users = await rainRequest<unknown>("/v1/issuing/users?limit=100");
  const parsedUsers = z.array(rainUserSchema).safeParse(users);
  if (!parsedUsers.success) {
    return null;
  }

  const target = normalizeAddress(ownerAddress);
  const match = parsedUsers.data.find((user) => {
    return (
      normalizeAddress(user.walletAddress) === target ||
      normalizeAddress(user.solanaAddress) === target
    );
  });

  return match?.id ?? null;
}

async function getRainContractsForUser(userId: string) {
  const contracts = await rainRequest<unknown>(`/v1/issuing/users/${userId}/contracts`);
  const parsedContracts = z.array(rainContractSchema).safeParse(contracts);
  if (!parsedContracts.success) {
    return [];
  }
  return parsedContracts.data;
}

export async function resolveExecutionDepositAddress(input: {
  chainId: number;
  depositAddress: string;
  contractId?: string | null;
  ownerAddress?: string | null;
  collateralProxyAddress?: string | null;
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

  if (!input.ownerAddress || !process.env.RAIN_API_KEY) {
    return fallback;
  }

  try {
    const userId = await findRainUserIdByAddress(input.ownerAddress);
    if (!userId) {
      return fallback;
    }

    const contracts = await getRainContractsForUser(userId);
    const match =
      contracts.find((contract) => contract.id === input.contractId) ??
      contracts.find((contract) => {
        if (contract.chainId && contract.chainId !== input.chainId) {
          return false;
        }
        return (
          proxyAddress !== null &&
          normalizeAddress(contract.proxyAddress) === normalizeAddress(proxyAddress)
        );
      });

    if (!match?.depositAddress) {
      return fallback;
    }

    return match.depositAddress;
  } catch {
    return fallback;
  }
}

