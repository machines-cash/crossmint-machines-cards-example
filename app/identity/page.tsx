"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthGate } from "@/components/machines/auth-gate";
import { AppShell } from "@/components/machines/app-shell";
import { Panel } from "@/components/machines/panel";
import { SetupBlockingPanel } from "@/components/machines/setup-blocking-panel";
import { shortAddress, titleCaseStatus } from "@/lib/format";
import { useDemoSession } from "@/state/demo-session-provider";
import type { KycStatusPayload } from "@/types/partner";

export default function IdentityPage() {
  const {
    client,
    walletAddress,
    onboarding,
  } = useDemoSession();
  const setupLocked = onboarding.loading || onboarding.step !== "ready";

  const [status, setStatus] = useState<KycStatusPayload | null>(null);
  const [agreementsAccepted, setAgreementsAccepted] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!client || setupLocked) return;
    setError(null);
    try {
      const [nextStatus, agreements] = await Promise.all([
        client.getKycStatus(),
        client.getAgreements().catch(() => ({ accepted: false, agreements: [], acceptedAt: null })),
      ]);
      setStatus(nextStatus);
      setAgreementsAccepted(agreements.accepted);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "unable to load identity");
    }
  };

  useEffect(() => {
    if (!client || setupLocked) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, setupLocked]);

  return (
    <AuthGate>
      <AppShell>
        {setupLocked ? <SetupBlockingPanel /> : (
        <Panel
          title="Profile"
          subtitle="Verification and account details"
          actions={<button type="button" className="btn btn-primary" onClick={() => void load()} disabled={!client}>refresh</button>}
        >
          <div className="stack">
            {error ? <p className="status-pill status-error" style={{ margin: 0 }}>{error}</p> : null}

            <div className="kv-grid">
              <div className="kv-item">
                <strong>verification</strong>
                <span>{status ? titleCaseStatus(status.status) : "-"}</span>
              </div>
              <div className="kv-item">
                <strong>agreements</strong>
                <span>{agreementsAccepted === null ? "-" : agreementsAccepted ? "Accepted" : "Pending"}</span>
              </div>
              <div className="kv-item">
                <strong>primary wallet</strong>
                <span>{shortAddress(walletAddress)}</span>
              </div>
            </div>

            {status?.completionLink ? (
              <p className="muted" style={{ margin: 0 }}>
                additional information required: <a href={status.completionLink} target="_blank" rel="noreferrer" style={{ color: "var(--violet)" }}>open completion link</a>
              </p>
            ) : null}

            {status?.externalVerificationLink ? (
              <p className="muted" style={{ margin: 0 }}>
                external verification required: <a href={status.externalVerificationLink} target="_blank" rel="noreferrer" style={{ color: "var(--violet)" }}>open verification link</a>
              </p>
            ) : null}

            {status?.status && status.status !== "approved" ? (
              <p className="muted" style={{ margin: 0 }}>
                to resubmit, go to <Link href="/kyc" style={{ color: "var(--violet)" }}>/kyc</Link> and submit updated details.
              </p>
            ) : null}
          </div>
        </Panel>
        )}
      </AppShell>
    </AuthGate>
  );
}
