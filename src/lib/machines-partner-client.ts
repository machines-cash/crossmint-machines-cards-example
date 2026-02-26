import {
  type BalancePayload,
  type CardSecrets,
  type CardSecretsSession,
  type DepositAsset,
  type DepositEstimate,
  type DepositIntent,
  type DepositRange,
  type PartnerAgreementsPayload,
  type KycField,
  type KycStatusPayload,
  type PartnerCard,
  type PartnerResponse,
  type PartnerTransaction,
  type PartnerWallet,
  type SessionPayload,
  type WithdrawalAsset,
  type WithdrawalEstimate,
  type WithdrawalRange,
  type WithdrawalSignatureResponse,
} from "@/types/partner";

export class MachinesPartnerError extends Error {
  readonly status: number;
  readonly details?: PartnerResponse<unknown>;

  constructor(message: string, status: number, details?: PartnerResponse<unknown>) {
    super(message);
    this.name = "MachinesPartnerError";
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
};

export class MachinesPartnerClient {
  private readonly baseUrl: string;
  private readonly sessionToken: string;

  constructor(options: { baseUrl: string; sessionToken: string }) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.sessionToken = options.sessionToken;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${this.sessionToken}`,
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
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
        throw new MachinesPartnerError(`Invalid JSON response (${response.status})`, response.status);
      }
    }

    if (!response.ok || !json?.ok) {
      const fallback = `request failed (${response.status})`;
      const summary = json?.summary ?? fallback;
      const details = json?.errors?.map((err) => err.message).join("; ");
      throw new MachinesPartnerError(details ? `${summary}: ${details}` : summary, response.status, json ?? undefined);
    }

    if (json.data === undefined) {
      throw new MachinesPartnerError("response missing data", response.status, json);
    }

    return json.data;
  }

  async getKycSchema(): Promise<KycField[]> {
    const data = await this.request<{ fields: KycField[] }>("/kyc/schema");
    return data.fields;
  }

  async getKycStatus(): Promise<KycStatusPayload> {
    return this.request<KycStatusPayload>("/kyc/status");
  }

  async submitKycApplication(payload: {
    firstName: string;
    lastName: string;
    birthDate: string;
    nationalId?: string;
    countryOfIssue: string;
    email: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      region: string;
      postalCode: string;
      countryCode: string;
    };
    phoneCountryCode?: string;
    phoneNumber?: string;
    occupation: string;
    annualSalary: string;
    accountPurpose: string;
    expectedMonthlyVolume: string;
  }): Promise<KycStatusPayload> {
    return this.request<KycStatusPayload>("/kyc/applications", {
      method: "POST",
      body: payload,
    });
  }

  async getAgreements(): Promise<PartnerAgreementsPayload> {
    return this.request<PartnerAgreementsPayload>("/agreements");
  }

  async acceptAgreements(): Promise<PartnerAgreementsPayload> {
    return this.request<PartnerAgreementsPayload>("/agreements", {
      method: "POST",
      body: { accepted: true },
    });
  }

  async listCards(): Promise<PartnerCard[]> {
    const data = await this.request<{ cards: PartnerCard[] }>("/cards");
    return data.cards;
  }

  async createCard(payload: {
    limit?: {
      amountCents: number;
      frequency:
        | "perAuthorization"
        | "per24HourPeriod"
        | "per7DayPeriod"
        | "per30DayPeriod"
        | "perYearPeriod"
        | "allTime";
    };
  }): Promise<PartnerCard> {
    return this.request<PartnerCard>("/cards", {
      method: "POST",
      body: payload,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  async updateCard(cardId: string, payload: {
    status?: "active" | "locked" | "canceled";
    limit?: { amountCents: number; frequency: "perAuthorization" | "per24HourPeriod" | "per7DayPeriod" | "per30DayPeriod" | "perYearPeriod" | "allTime" };
  }): Promise<PartnerCard> {
    return this.request<PartnerCard>(`/cards/${cardId}`, {
      method: "PATCH",
      body: payload,
    });
  }

  async deleteCard(cardId: string): Promise<{ cardId: string; status: string; deletedAt: string }> {
    return this.request<{ cardId: string; status: string; deletedAt: string }>(`/cards/${cardId}`, {
      method: "DELETE",
    });
  }

  async createCardSecretsSession(): Promise<CardSecretsSession> {
    return this.request<CardSecretsSession>("/cards/secrets/session", {
      method: "POST",
      body: {},
    });
  }

  async getCardSecrets(cardId: string, sessionId: string): Promise<CardSecrets> {
    return this.request<CardSecrets>(`/cards/${cardId}/secrets`, {
      method: "POST",
      body: { sessionId },
    });
  }

  async getBalances(): Promise<BalancePayload> {
    const data = await this.request<{ balances: BalancePayload }>("/balances");
    return data.balances;
  }

  async listDepositAssets(): Promise<DepositAsset[]> {
    const data = await this.request<{ assets: DepositAsset[] }>("/deposits/assets");
    return data.assets;
  }

  async getDepositRange(payload: { currency: string; network: string }): Promise<DepositRange> {
    const data = await this.request<{ range: DepositRange }>("/deposits/range", {
      method: "POST",
      body: payload,
    });
    return data.range;
  }

  async getDepositEstimate(payload: {
    currency: string;
    network: string;
    amount: number;
    amountCurrency?: "crypto" | "usd";
  }): Promise<DepositEstimate> {
    const data = await this.request<{ estimate: DepositEstimate }>("/deposits/estimate", {
      method: "POST",
      body: payload,
    });
    return data.estimate;
  }

  async createDeposit(payload: {
    currency: string;
    network: string;
    amount?: number;
  }): Promise<DepositIntent> {
    const data = await this.request<{ deposit: DepositIntent }>("/deposits", {
      method: "POST",
      body: payload,
      idempotencyKey: crypto.randomUUID(),
    });
    return data.deposit;
  }

  async listDeposits(scope: "active" | "all" = "active"): Promise<DepositIntent[]> {
    const data = await this.request<{ deposits: DepositIntent[] }>(`/deposits?scope=${scope}`);
    return data.deposits;
  }

  async listWithdrawalAssets(payload?: {
    sourceChainId?: number;
    sourceTokenAddress?: string;
  }): Promise<WithdrawalAsset[]> {
    const query = new URLSearchParams();
    if (typeof payload?.sourceChainId === "number") {
      query.set("sourceChainId", String(payload.sourceChainId));
    }
    if (payload?.sourceTokenAddress) {
      query.set("sourceTokenAddress", payload.sourceTokenAddress);
    }
    const path = query.size ? `/withdrawals/assets?${query.toString()}` : "/withdrawals/assets";
    const data = await this.request<{ assets: WithdrawalAsset[] }>(path);
    return data.assets;
  }

  async getWithdrawalRange(payload: {
    source?: { chainId?: number; tokenAddress?: string };
    destination: { currency: string; network: string };
  }): Promise<WithdrawalRange> {
    const data = await this.request<{ range: WithdrawalRange }>("/withdrawals/range", {
      method: "POST",
      body: payload,
    });
    return data.range;
  }

  async getWithdrawalEstimate(payload: {
    source?: { chainId?: number; tokenAddress?: string };
    destination: { currency: string; network: string; extraId?: string };
    amountCents: number;
  }): Promise<WithdrawalEstimate> {
    const data = await this.request<{ estimate: WithdrawalEstimate }>("/withdrawals/estimate", {
      method: "POST",
      body: payload,
    });
    return data.estimate;
  }

  async createWithdrawal(payload: {
    amountCents: number;
    source: { chainId?: number; tokenAddress?: string; contractId?: string };
    destination: { currency: string; network: string; address: string; extraId?: string };
    adminAddress?: string;
  }): Promise<WithdrawalSignatureResponse> {
    return this.request<WithdrawalSignatureResponse>("/withdrawals", {
      method: "POST",
      body: payload,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  async listTransactions(filters?: { type?: string; cardId?: string; limit?: number }): Promise<PartnerTransaction[]> {
    const query = new URLSearchParams();
    if (filters?.type) query.set("type", filters.type);
    if (filters?.cardId) query.set("cardId", filters.cardId);
    if (typeof filters?.limit === "number") query.set("limit", String(filters.limit));
    const queryString = query.toString();
    const data = await this.request<{ transactions: PartnerTransaction[] }>(
      queryString ? `/transactions?${queryString}` : "/transactions",
    );
    return data.transactions;
  }
}

export async function bootstrapPartnerSession(input: {
  externalUserId: string;
  wallet: PartnerWallet;
  scopes?: string[];
}): Promise<SessionPayload> {
  const response = await fetch("/api/partner/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  const text = await response.text();
  let json: PartnerResponse<SessionPayload> | null = null;

  if (text) {
    try {
      json = JSON.parse(text) as PartnerResponse<SessionPayload>;
    } catch {
      throw new MachinesPartnerError(`Invalid session bootstrap response (${response.status})`, response.status);
    }
  }

  if (!response.ok || !json?.ok || !json.data) {
    const summary = json?.summary ?? `session bootstrap failed (${response.status})`;
    const details = json?.errors?.map((err) => err.message).join("; ");
    throw new MachinesPartnerError(details ? `${summary}: ${details}` : summary, response.status, json ?? undefined);
  }

  return json.data;
}
