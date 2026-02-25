export function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function resolvePartnerUrl(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (
    normalizedBase.endsWith("/partner/v1") &&
    normalizedPath.startsWith("/partner/v1/")
  ) {
    return `${normalizedBase}${normalizedPath.slice("/partner/v1".length)}`;
  }

  return `${normalizedBase}${normalizedPath}`;
}
