export function extractCrossmintEmail(user: unknown): string | null {
  if (!user || typeof user !== "object") return null;

  const record = user as Record<string, unknown>;

  const directEmail = typeof record.email === "string" ? record.email : null;
  if (directEmail && directEmail.includes("@")) return directEmail.toLowerCase();

  const embeddedUser = record.user;
  if (embeddedUser && typeof embeddedUser === "object") {
    const nestedEmail = (embeddedUser as Record<string, unknown>).email;
    if (typeof nestedEmail === "string" && nestedEmail.includes("@")) {
      return nestedEmail.toLowerCase();
    }
  }

  const emails = record.emails;
  if (Array.isArray(emails)) {
    for (const entry of emails) {
      if (typeof entry === "string" && entry.includes("@")) {
        return entry.toLowerCase();
      }
      if (entry && typeof entry === "object") {
        const candidate = (entry as Record<string, unknown>).email;
        if (typeof candidate === "string" && candidate.includes("@")) {
          return candidate.toLowerCase();
        }
      }
    }
  }

  return null;
}

export function buildExternalUserId(input: {
  email: string | null;
  walletAddress: string;
  prefix?: string;
}): string {
  const prefix = (input.prefix ?? "crossmint-demo").trim() || "crossmint-demo";
  if (input.email) {
    const normalized = input.email.trim().toLowerCase();
    return `${prefix}:${normalized}`;
  }

  const normalizedWallet = input.walletAddress.trim();
  return `${prefix}:wallet:${normalizedWallet}`;
}
