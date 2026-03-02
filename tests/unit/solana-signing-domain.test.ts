import { describe, expect, it } from "vitest";
import { resolveSolanaSigningDomainChainId } from "@/chains/solana/constants";

describe("resolveSolanaSigningDomainChainId", () => {
  it("uses the v2.02 Solana signing domain for devnet and mainnet execution inputs", () => {
    expect(resolveSolanaSigningDomainChainId(900)).toBe(900n);
    expect(resolveSolanaSigningDomainChainId(901)).toBe(900n);
  });
});

