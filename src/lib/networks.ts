export function isUnsupportedDestinationNetwork(networkId: string) {
  const normalized = networkId.trim().toLowerCase();
  return normalized === "solana" || normalized === "stellar";
}
