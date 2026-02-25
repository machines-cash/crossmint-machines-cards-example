"use client";

import { useEffect, useState } from "react";
import { AuthGate } from "@/components/machines/auth-gate";
import { AppShell } from "@/components/machines/app-shell";
import { Panel } from "@/components/machines/panel";
import { SetupBlockingPanel } from "@/components/machines/setup-blocking-panel";
import { formatUsdCents, titleCaseStatus } from "@/lib/format";
import { useDemoSession } from "@/state/demo-session-provider";
import type { PartnerTransaction } from "@/types/partner";

function transactionLabel(transaction: PartnerTransaction) {
  if (transaction.merchantName?.trim()) return transaction.merchantName.trim();
  if (transaction.type === "collateral") return "Balance movement";
  if (transaction.type === "payment") return "Payment";
  if (transaction.type === "fee") return "Fee";
  return "Card transaction";
}

function amountClassName(transaction: PartnerTransaction) {
  if (transaction.type === "spend" || transaction.type === "fee") {
    return "amount-negative";
  }
  return "amount-positive";
}

export default function ActivityPage() {
  const { client, onboarding } = useDemoSession();
  const setupLocked = onboarding.loading || onboarding.step !== "ready";

  const [transactions, setTransactions] = useState<PartnerTransaction[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!client || setupLocked) return;
    setBusy(true);
    setError(null);
    try {
      const next = await client.listTransactions({ limit: 50 });
      setTransactions(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "unable to load activity");
    } finally {
      setBusy(false);
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
          title="Activity"
          subtitle="Recent account activity"
          actions={<button type="button" className="btn btn-primary" onClick={() => void load()} disabled={!client || busy}>{busy ? "loading..." : "refresh"}</button>}
        >
          <div className="stack">
            {error ? <p className="status-pill status-error" style={{ margin: 0 }}>{error}</p> : null}
            {transactions.length ? (
              <div className="activity-list">
                {transactions.map((transaction) => (
                  <article key={transaction.transactionId} className="activity-item">
                    <div className="row-wrap" style={{ justifyContent: "space-between" }}>
                      <h3 className="activity-item-title">{transactionLabel(transaction)}</h3>
                      <span className={amountClassName(transaction)}>
                        {formatUsdCents(transaction.amountCents)}
                      </span>
                    </div>
                    <div className="row-wrap" style={{ justifyContent: "space-between" }}>
                      <p className="activity-item-meta">
                        {new Date(transaction.createdAt).toLocaleString()}
                      </p>
                      <span className={`status-pill status-${transaction.status.toLowerCase().replace(/\s+/g, "_")}`}>
                        {titleCaseStatus(transaction.status)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="info-empty" style={{ margin: 0 }}>
                No activity yet.
              </p>
            )}
          </div>
        </Panel>
        )}
      </AppShell>
    </AuthGate>
  );
}
