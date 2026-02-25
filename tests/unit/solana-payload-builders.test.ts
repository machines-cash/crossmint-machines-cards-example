import { describe, expect, it } from "vitest";
import {
  buildSingleSignerInput,
  buildSolanaExecutionBundle,
  decodeExecutionParameters,
  parsePartnerWithdrawalParameters,
} from "@/chains/solana/v202/payload-builders";

describe("solana v2.02 payload builders", () => {
  const readyWithdrawal = {
    status: "ready" as const,
    retryAfterSeconds: null,
    parameters: [
      "CollatProxy1111111111111111111111111111111",
      "AssetMint111111111111111111111111111111111",
      "1000",
      "Recipient11111111111111111111111111111111",
      "1700000000",
      Buffer.from("salt").toString("base64"),
      Buffer.from("signature").toString("base64"),
    ],
    signature: null,
    expiresAt: 1700000000,
    execution: {
      contractId: "contract_1",
      contractVersion: 2,
      chainId: 901,
      collateralProxyAddress: "CollatProxy1111111111111111111111111111111",
      controllerAddress: null,
      coordinatorAddress: "Coordinator111111111111111111111111111111",
      callTarget: "Program111111111111111111111111111111111",
      callPath: "solana_v2_02" as const,
    },
    relay: null,
  };

  it("parses partner parameter arrays", () => {
    const parsed = parsePartnerWithdrawalParameters(readyWithdrawal.parameters);
    expect(parsed[2]).toBe("1000");
    expect(parsed).toHaveLength(7);
  });

  it("builds a normalized solana execution bundle", () => {
    const bundle = buildSolanaExecutionBundle({
      withdrawal: readyWithdrawal,
      chainId: 901,
      programAddress: "Program111111111111111111111111111111111",
      depositAddress: "Deposit111111111111111111111111111111111",
      contractId: "contract_1",
      ownerAddress: "Owner11111111111111111111111111111111111",
    });

    const decoded = decodeExecutionParameters(bundle);
    expect(bundle.chainId).toBe(901);
    expect(decoded.amountInCents).toBe(1000);
    expect(decoded.expiresAt).toBe(1700000000);
  });

  it("requires v2.02 execution hints", () => {
    expect(() =>
      buildSolanaExecutionBundle({
        withdrawal: {
          ...readyWithdrawal,
          execution: {
            ...readyWithdrawal.execution,
            callPath: "coordinator_v2",
          },
        },
        chainId: 901,
        programAddress: "Program111111111111111111111111111111111",
        depositAddress: "Deposit111111111111111111111111111111111",
      }),
    ).toThrow(/solana_v2_02/);
  });

  it("builds single signer input", () => {
    const bundle = buildSolanaExecutionBundle({
      withdrawal: readyWithdrawal,
      chainId: 901,
      programAddress: "Program111111111111111111111111111111111",
      depositAddress: "Deposit111111111111111111111111111111111",
    });

    const singleSignerInput = buildSingleSignerInput({
      bundle,
      ownerSecretKeyBase58: "owner-secret-key",
    });

    expect(singleSignerInput.ownerSecretKeyBase58).toBe("owner-secret-key");
    expect(singleSignerInput.parameters).toEqual(bundle.parameters);
  });
});
