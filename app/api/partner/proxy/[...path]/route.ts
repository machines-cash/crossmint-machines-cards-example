import { NextResponse } from "next/server";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function resolvePartnerUrl(baseUrl: string, path: string) {
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

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

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
    const body =
      method === "GET" || method === "HEAD" || method === "OPTIONS"
        ? undefined
        : await request.text();

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
