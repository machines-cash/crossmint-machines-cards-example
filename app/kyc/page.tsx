"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/machines/auth-gate";
import { AppShell } from "@/components/machines/app-shell";
import { Panel } from "@/components/machines/panel";
import { useDemoSession } from "@/state/demo-session-provider";
import { titleCaseStatus } from "@/lib/format";
import type { KycStatusPayload, PartnerAgreement } from "@/types/partner";

type KycFormState = {
  firstName: string;
  lastName: string;
  birthDate: string;
  nationalId: string;
  countryOfIssue: string;
  email: string;
  line1: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  phoneCountryCode: string;
  phoneNumber: string;
  occupation: string;
  annualSalary: string;
  accountPurpose: string;
  expectedMonthlyVolume: string;
};

const SAMPLE_FORM: KycFormState = {
  firstName: "Crossmint",
  lastName: "TestApproved",
  birthDate: "1994-01-19",
  nationalId: "123456789",
  countryOfIssue: "US",
  email: "crossmint+machines@example.com",
  line1: "1 Market St",
  city: "San Francisco",
  region: "CA",
  postalCode: "94105",
  countryCode: "US",
  phoneCountryCode: "1",
  phoneNumber: "4155550123",
  occupation: "11-1011",
  annualSalary: "50k–99k",
  accountPurpose: "everyday spend",
  expectedMonthlyVolume: "$1k–$5k",
};

function buildSampleForm(): KycFormState {
  return {
    ...SAMPLE_FORM,
    email: `crossmint+machines+${Date.now()}@example.com`,
  };
}

const EMPTY_FORM: KycFormState = {
  ...SAMPLE_FORM,
  lastName: "",
  email: "",
};

export default function KycPage() {
  const router = useRouter();
  const {
    client,
    refreshSession,
    onboarding,
    refreshOnboarding,
    acceptAgreements,
  } = useDemoSession();

  const [kycStatus, setKycStatus] = useState<KycStatusPayload | null>(null);
  const [form, setForm] = useState<KycFormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [acceptingAgreements, setAcceptingAgreements] = useState(false);
  const [loadingAgreements, setLoadingAgreements] = useState(false);
  const [agreements, setAgreements] = useState<PartnerAgreement[]>([]);
  const [agreementSelections, setAgreementSelections] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const status = kycStatus?.status ?? "not_submitted";
  const verificationLink =
    kycStatus?.completionLink ?? kycStatus?.externalVerificationLink ?? null;

  const canSubmit = useMemo(() => {
    return (
      form.firstName &&
      form.lastName &&
      form.birthDate &&
      form.countryOfIssue &&
      form.email &&
      form.line1 &&
      form.city &&
      form.region &&
      form.postalCode &&
      form.countryCode &&
      form.occupation &&
      form.annualSalary &&
      form.accountPurpose &&
      form.expectedMonthlyVolume
    );
  }, [form]);

  const selectedAgreementCount = useMemo(
    () => agreements.filter((agreement) => agreementSelections[agreement.id]).length,
    [agreements, agreementSelections],
  );

  const allAgreementsSelected =
    agreements.length > 0 && selectedAgreementCount === agreements.length;

  const loadKycStatus = useCallback(async () => {
    if (!client) return;
    try {
      const nextStatus = await client.getKycStatus();
      setKycStatus(nextStatus);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "unable to load kyc state");
    }
  }, [client]);

  useEffect(() => {
    void loadKycStatus();
  }, [loadKycStatus]);

  const loadAgreements = useCallback(async () => {
    if (!client) return;

    setLoadingAgreements(true);
    setError(null);

    try {
      const result = await client.getAgreements();
      setAgreements(result.agreements);
      setAgreementSelections((previous) => {
        const next: Record<string, boolean> = {};
        for (const agreement of result.agreements) {
          next[agreement.id] = previous[agreement.id] ?? Boolean(result.accepted);
        }
        return next;
      });

      if (result.accepted) {
        await refreshOnboarding().catch(() => null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "unable to load agreements");
    } finally {
      setLoadingAgreements(false);
    }
  }, [client, refreshOnboarding]);

  useEffect(() => {
    if (onboarding.loading || onboarding.step !== "agreements") {
      return;
    }
    void loadAgreements();
  }, [loadAgreements, onboarding.loading, onboarding.step]);

  const submit = async (nextForm: KycFormState) => {
    if (!client) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await client.submitKycApplication({
        firstName: nextForm.firstName,
        lastName: nextForm.lastName,
        birthDate: nextForm.birthDate,
        nationalId: nextForm.nationalId || undefined,
        countryOfIssue: nextForm.countryOfIssue,
        email: nextForm.email,
        address: {
          line1: nextForm.line1,
          city: nextForm.city,
          region: nextForm.region,
          postalCode: nextForm.postalCode,
          countryCode: nextForm.countryCode,
        },
        phoneCountryCode: nextForm.phoneCountryCode || undefined,
        phoneNumber: nextForm.phoneNumber || undefined,
        occupation: nextForm.occupation,
        annualSalary: nextForm.annualSalary,
        accountPurpose: nextForm.accountPurpose,
        expectedMonthlyVolume: nextForm.expectedMonthlyVolume,
      });

      setKycStatus(result);
      await refreshSession().catch(() => null);
      await refreshOnboarding().catch(() => null);
      setSuccess(
        result.status === "approved"
          ? "KYC approved. Continue to agreements."
          : "KYC submitted. Continue verification.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "kyc submission failed");
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptAgreements = async () => {
    if (!allAgreementsSelected) {
      setError("Select all agreements to continue.");
      return;
    }

    setAcceptingAgreements(true);
    setError(null);
    setSuccess(null);
    try {
      await acceptAgreements();
      await refreshSession().catch(() => null);
      setSuccess("Agreements accepted. Redirecting to /accounts...");
      setTimeout(() => {
        router.push("/accounts");
      }, 350);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "agreement acceptance failed");
    } finally {
      setAcceptingAgreements(false);
    }
  };

  return (
    <AuthGate>
      <AppShell>
        <Panel
          title="Setup"
          subtitle="Verify your identity, accept terms, and start using cards"
          actions={
            <div className="row-wrap">
              <span className={`status-pill status-${status}`}>
                {titleCaseStatus(status)}
              </span>
              {onboarding.step === "kyc" ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const sampleForm = buildSampleForm();
                    setForm(sampleForm);
                    void submit(sampleForm);
                  }}
                  disabled={busy || !client}
                >
                  fill sample
                </button>
              ) : null}
            </div>
          }
        >
          <div className="stack">
            {error ? <p className="status-pill status-error" style={{ margin: 0 }}>{error}</p> : null}
            {success ? <p className="status-pill status-approved" style={{ margin: 0 }}>{success}</p> : null}

            <div className="row-wrap">
              <span className={`status-pill ${onboarding.step === "kyc" ? "status-ready" : onboarding.step === "verification" || onboarding.step === "agreements" || onboarding.step === "ready" ? "status-approved" : "status-pending"}`}>1. Verify identity</span>
              <span className={`status-pill ${onboarding.step === "verification" ? "status-ready" : onboarding.step === "agreements" || onboarding.step === "ready" ? "status-approved" : "status-pending"}`}>2. Continue verification</span>
              <span className={`status-pill ${onboarding.step === "agreements" ? "status-ready" : onboarding.step === "ready" ? "status-approved" : "status-pending"}`}>3. Accept terms</span>
              <span className={`status-pill ${onboarding.step === "ready" ? "status-approved" : "status-pending"}`}>4. Open cards</span>
            </div>

            {onboarding.loading ? (
              <p className="muted" style={{ margin: 0 }}>checking setup status...</p>
            ) : null}

            {!onboarding.loading && onboarding.step === "agreements" ? (
              <div className="stack">
                <p className="muted" style={{ margin: 0 }}>
                  Review and accept all agreements to continue.
                </p>

                {loadingAgreements ? (
                  <p className="muted" style={{ margin: 0 }}>loading agreements...</p>
                ) : null}

                {!loadingAgreements && agreements.length > 0 ? (
                  <div className="stack">
                    {agreements.map((agreement) => (
                      <label
                        key={agreement.id}
                        className="surface stack"
                        style={{ gap: 8, padding: 12, cursor: "pointer" }}
                      >
                        <span className="row-wrap" style={{ alignItems: "flex-start" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(agreementSelections[agreement.id])}
                            onChange={(event) =>
                              setAgreementSelections((previous) => ({
                                ...previous,
                                [agreement.id]: event.target.checked,
                              }))}
                            disabled={acceptingAgreements}
                          />
                          <span style={{ flex: 1 }}>{agreement.text}</span>
                        </span>

                        {agreement.links.length > 0 ? (
                          <span className="row-wrap" style={{ paddingLeft: 24 }}>
                            {agreement.links.map((link) => (
                              <a
                                key={`${agreement.id}:${link.url}`}
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: "var(--violet)", textDecoration: "underline" }}
                              >
                                {link.label}
                              </a>
                            ))}
                          </span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                ) : null}

                {!loadingAgreements && agreements.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>No agreements found.</p>
                ) : null}

                <div className="kv-item">
                  <strong>selected</strong>
                  <span>{selectedAgreementCount}/{agreements.length}</span>
                </div>

                <div className="row-wrap">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={acceptingAgreements || !client || loadingAgreements || !allAgreementsSelected}
                    onClick={() => void handleAcceptAgreements()}
                  >
                    {acceptingAgreements ? "accepting..." : "accept agreements"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={acceptingAgreements}
                    onClick={() => {
                      void refreshOnboarding();
                      void loadAgreements();
                    }}
                  >
                    refresh status
                  </button>
                </div>
              </div>
            ) : null}

            {!onboarding.loading && onboarding.step === "ready" ? (
              <div className="stack">
                <p className="muted" style={{ margin: 0 }}>
                  Setup complete. Continue to cards and accounts.
                </p>
                <div className="row-wrap">
                  <Link href="/accounts" className="btn btn-primary">
                    open accounts
                  </Link>
                </div>
              </div>
            ) : null}

            {!onboarding.loading && onboarding.step === "kyc" ? (
              <>
                <div className="kv-grid">
                  <Input label="first name" value={form.firstName} onChange={(value) => setForm((prev) => ({ ...prev, firstName: value }))} />
                  <Input label="last name" value={form.lastName} onChange={(value) => setForm((prev) => ({ ...prev, lastName: value }))} />
                  <Input label="birth date" value={form.birthDate} onChange={(value) => setForm((prev) => ({ ...prev, birthDate: value }))} />
                  <Input label="national id" value={form.nationalId} onChange={(value) => setForm((prev) => ({ ...prev, nationalId: value }))} />
                  <Input label="country of issue" value={form.countryOfIssue} onChange={(value) => setForm((prev) => ({ ...prev, countryOfIssue: value.toUpperCase() }))} />
                  <Input label="email" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} />
                  <Input label="address line 1" value={form.line1} onChange={(value) => setForm((prev) => ({ ...prev, line1: value }))} />
                  <Input label="city" value={form.city} onChange={(value) => setForm((prev) => ({ ...prev, city: value }))} />
                  <Input label="region" value={form.region} onChange={(value) => setForm((prev) => ({ ...prev, region: value }))} />
                  <Input label="postal code" value={form.postalCode} onChange={(value) => setForm((prev) => ({ ...prev, postalCode: value }))} />
                  <Input label="country code" value={form.countryCode} onChange={(value) => setForm((prev) => ({ ...prev, countryCode: value.toUpperCase() }))} />
                  <Input label="phone country code" value={form.phoneCountryCode} onChange={(value) => setForm((prev) => ({ ...prev, phoneCountryCode: value }))} />
                  <Input label="phone number" value={form.phoneNumber} onChange={(value) => setForm((prev) => ({ ...prev, phoneNumber: value }))} />
                  <Input label="occupation code" value={form.occupation} onChange={(value) => setForm((prev) => ({ ...prev, occupation: value }))} />
                  <Input label="annual salary" value={form.annualSalary} onChange={(value) => setForm((prev) => ({ ...prev, annualSalary: value }))} />
                  <Input label="account purpose" value={form.accountPurpose} onChange={(value) => setForm((prev) => ({ ...prev, accountPurpose: value }))} />
                  <Input label="expected monthly volume" value={form.expectedMonthlyVolume} onChange={(value) => setForm((prev) => ({ ...prev, expectedMonthlyVolume: value }))} />
                </div>

                <div className="row-wrap">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canSubmit || busy || !client}
                    onClick={() => void submit(form)}
                  >
                    {busy ? "submitting..." : "submit KYC"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => setForm(buildSampleForm())}
                  >
                    load sample only
                  </button>
                </div>
              </>
            ) : null}

            {!onboarding.loading && onboarding.step === "verification" ? (
              <div className="stack">
                <p className="muted" style={{ margin: 0 }}>
                  Continue verification to complete identity checks.
                </p>
                <div className="row-wrap">
                  {verificationLink ? (
                    <a
                      className="btn btn-primary"
                      href={verificationLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      continue verification
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled
                    >
                      verification link unavailable
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      void loadKycStatus();
                      void refreshOnboarding();
                    }}
                  >
                    refresh status
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      </AppShell>
    </AuthGate>
  );
}

function Input(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="stack" style={{ gap: 6 }}>
      <span className="label">{props.label}</span>
      <input className="input" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}
