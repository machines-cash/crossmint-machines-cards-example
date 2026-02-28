import { NextResponse } from "next/server";
import { requiredEnv, resolvePartnerUrl } from "@/lib/server/partner-http";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

function shouldForceServerSolanaAdmin(body: unknown) {
  if (!body || typeof body !== "object") {
    return false;
  }
  const payload = body as {
    source?: { chainId?: unknown };
    destination?: { network?: unknown };
  };
  const chainId = Number(payload.source?.chainId);
  if (chainId === 900 || chainId === 901) {
    return true;
  }
  const network =
    typeof payload.destination?.network === "string"
      ? payload.destination.network.trim().toLowerCase()
      : "";
  return network === "solana";
}

function sanitizeUpstreamBody(input: {
  method: string;
  pathSuffix: string;
  contentType: string | null;
  rawBody: string | undefined;
}) {
  const { method, pathSuffix, contentType, rawBody } = input;
  if (!rawBody) {
    return rawBody;
  }

  if (
    method === "POST" &&
    pathSuffix === "withdrawals" &&
    contentType?.toLowerCase().includes("application/json")
  ) {
    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      if (shouldForceServerSolanaAdmin(parsed) && "adminAddress" in parsed) {
        delete parsed.adminAddress;
        return JSON.stringify(parsed);
      }
    } catch {
      return rawBody;
    }
  }

  return rawBody;
}

async function proxy(request: Request, context: RouteContext) {
  try {
    const { path } = await context.params;
    const pathSuffix = (path ?? []).join("/");
    if (!pathSuffix) {
      return NextResponse.json(
        {
          ok: false,
          summary: "invalid partner path",
          errors: [{ code: "invalid_path", message: "missing partner path" }],
        },
        { status: 400 },
      );
    }

    // Browser calls stay same-origin and this route forwards to Machines Partner API.
    // This keeps partner keys server-side and avoids cross-origin preflight issues.
    const upstreamBase = requiredEnv("MACHINES_PARTNER_BASE_URL");
    const upstreamUrl = new URL(
      resolvePartnerUrl(upstreamBase, `/partner/v1/${pathSuffix}`),
    );
    const incomingUrl = new URL(request.url);
    upstreamUrl.search = incomingUrl.search;

    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Partner-Key": requiredEnv("MACHINES_PARTNER_API_KEY"),
    };

    const auth = request.headers.get("authorization");
    if (auth) {
      headers.Authorization = auth;
    }

    const idempotency = request.headers.get("idempotency-key");
    if (idempotency) {
      headers["Idempotency-Key"] = idempotency;
    }

    const contentType = request.headers.get("content-type");
    if (contentType) {
      headers["Content-Type"] = contentType;
    }

    const method = request.method.toUpperCase();
    const rawBody =
      method === "GET" || method === "HEAD" || method === "OPTIONS"
        ? undefined
        : await request.text();
    const body = sanitizeUpstreamBody({
      method,
      pathSuffix,
      contentType,
      rawBody,
    });

    const response = await fetch(upstreamUrl.toString(), {
      method,
      headers,
      body,
      cache: "no-store",
    });

    const responseText = await response.text();
    const responseContentType =
      response.headers.get("content-type") ?? "application/json";

    return new NextResponse(responseText, {
      status: response.status,
      headers: {
        "content-type": responseContentType,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "partner proxy failed";
    return NextResponse.json(
      {
        ok: false,
        summary: "partner proxy failed",
        errors: [{ code: "partner_proxy_failed", message }],
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxy(request, context);
}
