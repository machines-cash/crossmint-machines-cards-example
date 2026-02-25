import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapPartnerSession,
  MachinesPartnerClient,
} from "@/lib/machines-partner-client";

function okResponse(data: unknown, summary = "ok") {
  return new Response(
    JSON.stringify({
      ok: true,
      data,
      summary,
      errors: [],
    }),
    { status: 200 },
  );
}

describe("integration: partner flow contracts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("bootstraps a session and submits sample kyc", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        okResponse({
          sessionToken: "session-token",
          sessionId: "session-id",
          userId: "crossmint-demo:alice@example.com",
          expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          scopes: ["kyc.read", "kyc.write"],
          wallet: {
            chain: "solana",
            address: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          },
        }),
      )
      .mockResolvedValueOnce(
        okResponse({
          status: "approved",
          reason: null,
          completionLink: null,
          externalVerificationLink: null,
          isActive: true,
          isTermsOfServiceAccepted: true,
        }, "kyc submitted"),
      );

    const session = await bootstrapPartnerSession({
      externalUserId: "crossmint-demo:alice@example.com",
      wallet: {
        chain: "solana",
        address: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      },
    });

    const client = new MachinesPartnerClient({
      baseUrl: "https://api-dev.machines.cash/partner/v1",
      sessionToken: session.sessionToken,
    });

    const kyc = await client.submitKycApplication({
      firstName: "Alice",
      lastName: "TestApproved",
      birthDate: "1994-01-19",
      nationalId: "123456789",
      countryOfIssue: "US",
      email: "alice@example.com",
      address: {
        line1: "1 Market St",
        city: "San Francisco",
        region: "CA",
        postalCode: "94105",
        countryCode: "US",
      },
      occupation: "11-1011",
      annualSalary: "50000-75000",
      accountPurpose: "personalUse",
      expectedMonthlyVolume: "1000-5000",
    });

    expect(kyc.status).toBe("approved");
  });

  it("covers card lifecycle plus deposit and withdrawal quote calls", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        okResponse({
          cardId: "card_1",
          status: "active",
          brand: "VISA",
          last4: "4242",
          expirationMonth: 12,
          expirationYear: 2030,
          limit: { amountCents: 1000, frequency: "perAuthorization" },
          encryptedName: null,
          encryptedColor: null,
          encryptedEmoji: null,
          encryptedMemo: null,
          folderId: null,
          contractId: null,
          isPinned: false,
          sortOrder: 0,
          createdAt: new Date().toISOString(),
        }, "card created"),
      )
      .mockResolvedValueOnce(okResponse({ cards: [] }, "card list"))
      .mockResolvedValueOnce(okResponse({ cardId: "card_1", status: "canceled", deletedAt: new Date().toISOString() }, "card deleted"))
      .mockResolvedValueOnce(okResponse({
        assets: [
          {
            ticker: "RUSD",
            name: "rUSD",
            icon: null,
            networks: [
              {
                id: "base",
                label: "Base",
                chainId: 84532,
                tokenContract: "0x10b5Be494C2962A7B318aFB63f0Ee30b959D000b",
              },
            ],
          },
        ],
      }, "deposit assets"))
      .mockResolvedValueOnce(okResponse({
        range: {
          fromCurrency: "rusd",
          fromNetwork: "base",
          toCurrency: "rusd",
          toNetwork: "base",
          contractId: "contract_1",
          payoutAddress: "0xabc",
          payoutChainId: 84532,
          minAmount: 1,
          maxAmount: null,
        },
      }, "deposit range"))
      .mockResolvedValueOnce(okResponse({
        estimate: {
          fromCurrency: "rusd",
          fromNetwork: "base",
          toCurrency: "rusd",
          toNetwork: "base",
          contractId: "contract_1",
          payoutAddress: "0xabc",
          payoutChainId: 84532,
          quotedAmount: 10,
          quotedAmountCurrency: "crypto",
          estimatedToAmount: 10,
          minAmount: 1,
          maxAmount: null,
          rateId: null,
        },
      }, "deposit estimate"))
      .mockResolvedValueOnce(okResponse({
        estimate: {
          fromCurrency: "rusd",
          fromNetwork: "solana",
          toCurrency: "rusd",
          toNetwork: "solana",
          minAmount: 0.01,
          maxAmount: null,
          minAmountCents: 1,
          maxAmountCents: null,
          destinationSupportsExtraId: false,
          fromAmount: 10,
          fromAmountCents: 1000,
          estimatedToAmount: 10,
          rateId: null,
          destinationExtraId: null,
        },
      }, "withdrawal estimate"));

    const client = new MachinesPartnerClient({
      baseUrl: "https://api-dev.machines.cash/partner/v1",
      sessionToken: "session-token",
    });

    const card = await client.createCard({
      limit: {
        amountCents: 1000,
        frequency: "perAuthorization",
      },
    });
    expect(card.cardId).toBe("card_1");

    const cards = await client.listCards();
    expect(cards).toEqual([]);

    await client.deleteCard("card_1");
    const assets = await client.listDepositAssets();
    expect(assets[0]?.ticker).toBe("RUSD");

    const range = await client.getDepositRange({ currency: "rusd", network: "base" });
    expect(range.contractId).toBe("contract_1");

    const estimate = await client.getDepositEstimate({ currency: "rusd", network: "base", amount: 10 });
    expect(estimate.quotedAmount).toBe(10);

    const withdrawalEstimate = await client.getWithdrawalEstimate({
      source: { chainId: 901, tokenAddress: "mint" },
      destination: { currency: "rusd", network: "solana" },
      amountCents: 1000,
    });

    expect(withdrawalEstimate.fromAmountCents).toBe(1000);
  });
});
