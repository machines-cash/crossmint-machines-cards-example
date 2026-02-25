"use client";

import Link from "next/link";
import { Panel } from "@/components/machines/panel";
import { useDemoSession } from "@/state/demo-session-provider";

export function SetupBlockingPanel() {
  const { onboarding } = useDemoSession();

  if (onboarding.loading) {
    return (
      <Panel title="Loading" subtitle="Checking your setup status">
        <p className="muted" style={{ margin: 0 }}>
          one moment...
        </p>
      </Panel>
    );
  }

  if (onboarding.step === "ready") {
    return null;
  }

  return (
    <Panel
      title="Finish setup first"
      subtitle={
        onboarding.step === "kyc"
          ? "Step 1 of 4: complete KYC."
          : onboarding.step === "verification"
            ? "Step 2 of 4: continue verification."
            : "Step 3 of 4: accept agreements."
      }
      actions={
        <Link href="/kyc" className="btn btn-primary">
          continue setup
        </Link>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        {onboarding.error ? onboarding.error : "Complete setup to continue."}
      </p>
    </Panel>
  );
}
