"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useDemoSession } from "@/state/demo-session-provider";

const EmbeddedAuthForm = dynamic(
  async () => {
    const module = await import("@crossmint/client-sdk-react-ui");
    return module.EmbeddedAuthForm;
  },
  {
    ssr: false,
    loading: () => <div className="muted">loading crossmint sign-in...</div>,
  },
);

export function AuthGate(props: { children: React.ReactNode }) {
  const session = useDemoSession();
  const [selectedWalletType, setSelectedWalletType] = useState<"evm" | "sol">(
    "evm",
  );

  if (!session.crossmintConfigured) {
    return (
      <div className="page-shell" style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <div className="surface stack" style={{ width: "min(640px, 100%)", padding: 20 }}>
          <h1 style={{ margin: 0, fontSize: 30 }}>Crossmint + Machines</h1>
          <p className="muted" style={{ margin: 0 }}>
            Crossmint is not configured for this environment.
          </p>
          <div className="surface stack" style={{ padding: 14, gap: 8 }}>
            <strong style={{ fontSize: 14 }}>Required environment variable</strong>
            <code style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
              NEXT_PUBLIC_CROSSMINT_API_KEY=ck_staging_...
            </code>
            {session.crossmintError ? (
              <p className="muted" style={{ margin: 0 }}>{session.crossmintError}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (session.authStatus !== "logged-in") {
    return (
      <div className="page-shell" style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <div className="surface stack" style={{ width: "min(460px, 100%)", padding: 12, gap: 12 }}>
          <div className="row-wrap">
            <button
              type="button"
              className="btn"
              onClick={() => setSelectedWalletType("evm")}
              style={{
                color: selectedWalletType === "evm" ? "white" : "#333333",
                background:
                  selectedWalletType === "evm"
                    ? "linear-gradient(130deg, #ff4500, #7b2fff)"
                    : "rgba(0,0,0,0.06)",
                minWidth: 96,
              }}
            >
              EVM
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSelectedWalletType("sol")}
              style={{
                color: selectedWalletType === "sol" ? "#8f5d06" : "#333333",
                background:
                  selectedWalletType === "sol"
                    ? "rgba(255, 166, 0, 0.2)"
                    : "rgba(0,0,0,0.05)",
                minWidth: 96,
              }}
            >
              SOL soon
            </button>
          </div>

          {selectedWalletType === "evm" ? (
            <EmbeddedAuthForm />
          ) : (
            <div className="surface stack" style={{ padding: 14, gap: 8 }}>
              <strong style={{ fontSize: 16 }}>SOL support is coming soon.</strong>
              <p className="muted" style={{ margin: 0 }}>
                Select EVM to continue.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (session.loading && !session.session) {
    return (
      <div className="page-shell" style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <div className="surface" style={{ padding: 20 }}>
          <strong>Loading...</strong>
        </div>
      </div>
    );
  }

  if (session.error) {
    return (
      <div className="page-shell" style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <div className="surface stack" style={{ padding: 20, width: "min(600px, 100%)" }}>
          <strong>Unable to start session</strong>
          <p className="muted" style={{ margin: 0 }}>{session.error}</p>
          <button type="button" className="btn btn-primary" onClick={() => void session.refreshSession()}>
            retry
          </button>
        </div>
      </div>
    );
  }

  return <>{props.children}</>;
}
