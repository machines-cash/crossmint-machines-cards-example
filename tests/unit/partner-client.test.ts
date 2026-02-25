import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MachinesPartnerClient,
  MachinesPartnerError,
} from "@/lib/machines-partner-client";

describe("MachinesPartnerClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses successful listCards payloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            cards: [
              {
                cardId: "card_1",
                status: "active",
                brand: "VISA",
                last4: "4242",
                expirationMonth: 12,
                expirationYear: 2030,
                limit: null,
                encryptedName: null,
                encryptedColor: null,
                encryptedEmoji: null,
                encryptedMemo: null,
                folderId: null,
                contractId: null,
                isPinned: false,
                sortOrder: 0,
                createdAt: new Date().toISOString(),
              },
            ],
          },
          summary: "card list",
        }),
        { status: 200 },
      ),
    );

    const client = new MachinesPartnerClient({
      baseUrl: "https://api-dev.machines.cash/partner/v1",
      sessionToken: "session-token",
    });

    const cards = await client.listCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]?.cardId).toBe("card_1");
  });

  it("throws MachinesPartnerError for partner envelope errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          summary: "invalid request",
          errors: [{ code: "invalid_request", message: "missing wallet" }],
        }),
        { status: 400 },
      ),
    );

    const client = new MachinesPartnerClient({
      baseUrl: "https://api-dev.machines.cash/partner/v1",
      sessionToken: "session-token",
    });

    let thrown: unknown;
    try {
      await client.listCards();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MachinesPartnerError);
    expect(thrown).toBeDefined();
    if (thrown instanceof Error) {
      expect(thrown.message).toMatch(/missing wallet/i);
    }
  });

  it("parses withdrawal signature ready payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            status: "ready",
            retryAfterSeconds: null,
            parameters: [
              "collateral",
              "asset",
              "1000",
              "recipient",
              "1700000000",
              "salt",
              "sig",
            ],
            signature: null,
            expiresAt: 1700000000,
            execution: {
              contractId: "contract_1",
              contractVersion: 2,
              chainId: 901,
              collateralProxyAddress: "collateral",
              controllerAddress: null,
              coordinatorAddress: "coordinator",
              callTarget: "program",
              callPath: "solana_v2_02",
            },
            relay: null,
          },
          summary: "withdrawal signature",
        }),
        { status: 200 },
      ),
    );

    const client = new MachinesPartnerClient({
      baseUrl: "https://api-dev.machines.cash/partner/v1",
      sessionToken: "session-token",
    });

    const withdrawal = await client.createWithdrawal({
      amountCents: 1000,
      source: {
        chainId: 901,
        tokenAddress: "mint",
      },
      destination: {
        currency: "rusd",
        network: "solana",
        address: "recipient",
      },
    });

    expect(withdrawal.status).toBe("ready");
    if (withdrawal.status === "ready") {
      expect(withdrawal.execution?.callPath).toBe("solana_v2_02");
      expect(withdrawal.parameters?.[0]).toBe("collateral");
    }
  });
});
