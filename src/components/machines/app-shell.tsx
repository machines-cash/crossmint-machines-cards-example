"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDemoSession } from "@/state/demo-session-provider";

const NAV_LINKS = [
  { href: "/accounts", label: "cards" },
  { href: "/kyc", label: "setup" },
  { href: "/activity", label: "activity" },
  { href: "/identity", label: "profile" },
  { href: "/withdrawals", label: "withdraw" },
];

function getSetupStepLabel(step: "kyc" | "verification" | "agreements" | "ready") {
  if (step === "kyc") return "setup 1/4";
  if (step === "verification") return "setup 2/4";
  if (step === "agreements") return "setup 3/4";
  return "setup complete";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    walletAddress,
    logout,
    onboarding,
  } = useDemoSession();
  const navLinks =
    onboarding.step === "ready"
      ? NAV_LINKS
      : [{ href: "/kyc", label: "setup" }];

  return (
    <div className="page-shell stack">
      <header className="surface" style={{ padding: 16 }}>
        <div className="row-wrap" style={{ justifyContent: "space-between" }}>
          <div className="row" style={{ gap: 10 }}>
            <Image
              src="/brand/machines-mark-legibility-black.svg"
              alt="Machines"
              width={28}
              height={28}
            />
            <Image
              src="/brand/machines-wordmark.svg"
              alt="Machines Cash"
              width={124}
              height={24}
            />
            <span className={`status-pill ${onboarding.step === "ready" ? "status-approved" : "status-pending"}`}>
              {getSetupStepLabel(onboarding.step)}
            </span>
          </div>
          <div className="row-wrap">
            <span className="muted" style={{ fontSize: 12 }}>
              {walletAddress
                ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
                : "wallet not connected"}
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
              sign out
            </button>
          </div>
        </div>

        <nav className="row-wrap" style={{ marginTop: 14 }}>
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="btn"
                style={{
                  color: active ? "white" : "#333333",
                  background: active
                    ? "linear-gradient(130deg, #ff4500, #7b2fff)"
                    : "rgba(0,0,0,0.06)",
                  padding: "8px 14px",
                  fontSize: 13,
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {children}
    </div>
  );
}
