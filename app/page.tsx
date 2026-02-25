"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/machines/auth-gate";
import { AppShell } from "@/components/machines/app-shell";
import { Panel } from "@/components/machines/panel";
import { useDemoSession } from "@/state/demo-session-provider";

export default function HomePage() {
  const router = useRouter();
  const { onboarding } = useDemoSession();

  useEffect(() => {
    if (onboarding.loading) return;
    router.replace(onboarding.step === "ready" ? "/accounts" : "/kyc");
  }, [onboarding.loading, onboarding.step, router]);

  return (
    <AuthGate>
      <AppShell>
        <Panel
          title="Loading"
          subtitle="Taking you to the next step"
        >
          <p className="muted" style={{ margin: 0 }}>
            opening {onboarding.step === "ready" ? "/accounts" : "/kyc"}...
          </p>
        </Panel>
      </AppShell>
    </AuthGate>
  );
}
