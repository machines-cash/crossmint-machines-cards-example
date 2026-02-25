export type SupportedEvmChain = "base-sepolia" | "base";

const SUPPORTED_EVM_CHAINS = new Set<SupportedEvmChain>([
  "base-sepolia",
  "base",
]);

export function resolvePrimaryEvmChain(
  input: string | undefined,
): SupportedEvmChain {
  const normalized = input?.trim().toLowerCase();
  if (
    normalized &&
    SUPPORTED_EVM_CHAINS.has(normalized as SupportedEvmChain)
  ) {
    return normalized as SupportedEvmChain;
  }
  return "base-sepolia";
}
