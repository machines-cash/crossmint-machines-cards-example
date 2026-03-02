import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveExecutionDepositAddress } from "@/lib/server/deposit-address-resolver";

const originalPartnerBaseUrl = process.env.MACHINES_PARTNER_BASE_URL;
const originalPartnerApiKey = process.env.MACHINES_PARTNER_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  process.env.MACHINES_PARTNER_BASE_URL = originalPartnerBaseUrl;
  process.env.MACHINES_PARTNER_API_KEY = originalPartnerApiKey;
});

describe("resolveExecutionDepositAddress", () => {
  it("returns fallback deposit address when authorization header is missing", async () => {
    process.env.MACHINES_PARTNER_BASE_URL = "https://partner.test";
    process.env.MACHINES_PARTNER_API_KEY = "partner-key";

    const result = await resolveExecutionDepositAddress({
      chainId: 901,
      contractId: "contract-1",
      ownerAddress: "owner-address",
      depositAddress: "deposit-address",
      collateralProxyAddress: "deposit-address",
    });

    expect(result).toBe("deposit-address");
  });

  it("resolves deposit address from partner deposits when input uses proxy address", async () => {
    process.env.MACHINES_PARTNER_BASE_URL = "https://partner.test";
    process.env.MACHINES_PARTNER_API_KEY = "partner-key";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            deposits: [
              {
                id: "deposit-old",
                contractId: "contract-1",
                chainId: 901,
                depositAddress: "old-deposit-address",
                updatedAt: "2026-03-01T10:00:00.000Z",
              },
              {
                id: "deposit-new",
                contractId: "contract-1",
                chainId: 901,
                depositAddress: "resolved-deposit-address",
                updatedAt: "2026-03-02T10:00:00.000Z",
              },
            ],
          },
          summary: "deposits",
          errors: [],
        }),
        { status: 200 },
      ),
    );

    const result = await resolveExecutionDepositAddress({
      chainId: 901,
      contractId: "contract-1",
      ownerAddress: "owner-address",
      depositAddress: "proxy-address",
      collateralProxyAddress: "proxy-address",
      authorization: "Bearer test-session-token",
    });

    expect(result).toBe("resolved-deposit-address");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://partner.test/partner/v1/deposits?scope=all",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-session-token",
          "X-Partner-Key": "partner-key",
        }),
      }),
    );
  });
});
