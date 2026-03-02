import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveExecutionDepositAddress } from "@/lib/server/rain-contracts";

const originalRainKey = process.env.RAIN_API_KEY;
const originalRainBaseUrl = process.env.RAIN_BASE_URL;

afterEach(() => {
  vi.restoreAllMocks();
  process.env.RAIN_API_KEY = originalRainKey;
  process.env.RAIN_BASE_URL = originalRainBaseUrl;
});

describe("resolveExecutionDepositAddress", () => {
  it("returns fallback deposit address when RAIN_API_KEY is missing", async () => {
    delete process.env.RAIN_API_KEY;

    const result = await resolveExecutionDepositAddress({
      chainId: 901,
      contractId: "contract-1",
      ownerAddress: "owner-address",
      depositAddress: "deposit-address",
      collateralProxyAddress: "deposit-address",
    });

    expect(result).toBe("deposit-address");
  });

  it("resolves deposit address from user contracts when input uses proxy address", async () => {
    process.env.RAIN_API_KEY = "test-key";
    process.env.RAIN_BASE_URL = "https://rain.test";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "user-1",
              solanaAddress: "owner-address",
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "contract-1",
              chainId: 901,
              proxyAddress: "proxy-address",
              depositAddress: "resolved-deposit-address",
            },
          ]),
          { status: 200 },
        ),
      );

    const result = await resolveExecutionDepositAddress({
      chainId: 901,
      contractId: "contract-1",
      ownerAddress: "owner-address",
      depositAddress: "proxy-address",
      collateralProxyAddress: "proxy-address",
    });

    expect(result).toBe("resolved-deposit-address");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

