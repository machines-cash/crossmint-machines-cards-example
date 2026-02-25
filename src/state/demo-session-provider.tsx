"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth, useWallet } from "@crossmint/client-sdk-react-ui";
import {
  bootstrapPartnerSession,
  MachinesPartnerClient,
  MachinesPartnerError,
} from "@/lib/machines-partner-client";
import { resolvePrimaryEvmChain } from "@/lib/crossmint/chains";
import {
  buildExternalUserId,
  extractCrossmintEmail,
} from "@/lib/crossmint/session-identity";
import type { SessionPayload } from "@/types/partner";

type DemoSessionContextValue = {
  loading: boolean;
  error: string | null;
  session: SessionPayload | null;
  client: MachinesPartnerClient | null;
  refreshSession: () => Promise<void>;
  authStatus: string;
  walletAddress: string | null;
  crossmintConfigured: boolean;
  crossmintError: string | null;
  logout: () => Promise<void>;
  onboarding: {
    loading: boolean;
    step: "kyc" | "verification" | "agreements" | "ready";
    kycStatus: string | null;
    agreementsAccepted: boolean | null;
    error: string | null;
  };
  refreshOnboarding: () => Promise<void>;
  acceptAgreements: () => Promise<void>;
};

const DemoSessionContext = createContext<DemoSessionContextValue | null>(null);
const PARTNER_PROXY_BASE_URL = "/api/partner/proxy";

function extractWalletAddress(wallet: unknown): string | null {
  if (!wallet || typeof wallet !== "object") return null;
  const record = wallet as Record<string, unknown>;
  const address = record.address;
  return typeof address === "string" && address.trim() ? address : null;
}

function DisabledDemoSessionProvider(
  props: { children: React.ReactNode; reason: string },
) {
  const value = useMemo<DemoSessionContextValue>(
    () => ({
      loading: false,
      error: null,
      session: null,
      client: null,
      refreshSession: async () => undefined,
      authStatus: "not-configured",
      walletAddress: null,
      crossmintConfigured: false,
      crossmintError: props.reason,
      logout: async () => undefined,
      onboarding: {
        loading: false,
        step: "kyc",
        kycStatus: null,
        agreementsAccepted: null,
        error: null,
      },
      refreshOnboarding: async () => undefined,
      acceptAgreements: async () => undefined,
    }),
    [props.reason],
  );

  return (
    <DemoSessionContext.Provider value={value}>
      {props.children}
    </DemoSessionContext.Provider>
  );
}

function ActiveDemoSessionProvider({ children }: { children: React.ReactNode }) {
  const { user, status: authStatus, logout: crossmintLogout } = useAuth();
  const { getOrCreateWallet } = useWallet();

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<DemoSessionContextValue["onboarding"]>({
    loading: true,
    step: "kyc",
    kycStatus: null,
    agreementsAccepted: null,
    error: null,
  });

  const primaryEvmChain = resolvePrimaryEvmChain(
    process.env.NEXT_PUBLIC_CROSSMINT_EVM_CHAIN,
  );
  const primaryWalletAddress = walletAddress;

  const evmWalletCreateInFlightRef = useRef(false);
  const lastBootstrapRef = useRef<string | null>(null);

  const resolveExternalUserId = useCallback(
    (fallbackWalletAddress: string) => {
      const email = extractCrossmintEmail(user);
      return buildExternalUserId({
        email,
        walletAddress: fallbackWalletAddress,
        prefix: process.env.NEXT_PUBLIC_MACHINES_PARTNER_EXTERNAL_USER_PREFIX,
      });
    },
    [user],
  );

  const refreshSession = useCallback(async () => {
    if (!primaryWalletAddress) {
      setSession(null);
      return;
    }

    const externalUserId = resolveExternalUserId(primaryWalletAddress);

    setLoading(true);
    setError(null);

    try {
      const nextSession = await bootstrapPartnerSession({
        externalUserId,
        wallet: {
          chain: "evm",
          address: primaryWalletAddress,
        },
      });
      setSession(nextSession);
      lastBootstrapRef.current = `${externalUserId}:${primaryWalletAddress}`;
    } catch (cause) {
      const message =
        cause instanceof MachinesPartnerError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "failed to bootstrap partner session";
      setError(message);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [primaryWalletAddress, resolveExternalUserId]);

  useEffect(() => {
    if (authStatus !== "logged-in") {
      evmWalletCreateInFlightRef.current = false;
      setWalletAddress(null);
      setSession(null);
      setError(null);
      setLoading(false);
      setOnboarding({
        loading: false,
        step: "kyc",
        kycStatus: null,
        agreementsAccepted: null,
        error: null,
      });
      lastBootstrapRef.current = null;
      return;
    }

    if (primaryWalletAddress) {
      return;
    }
    if (evmWalletCreateInFlightRef.current) {
      return;
    }

    // Crossmint can report "logged-in" before the embedded wallet is hydrated.
    // This ensures we request exactly one wallet creation call per login cycle.
    evmWalletCreateInFlightRef.current = true;
    setError(null);
    void getOrCreateWallet({
      chain: primaryEvmChain,
      signer: {
        type: "email",
      },
    })
      .then((createdWallet) => {
        const evmAddress = extractWalletAddress(createdWallet);
        if (!evmAddress) {
          throw new Error("failed to create wallet");
        }
        setWalletAddress(evmAddress);
      })
      .catch((cause) => {
        const message =
          cause instanceof Error
            ? cause.message
            : "failed to create embedded wallet";
        setError(message);
      })
      .finally(() => {
        evmWalletCreateInFlightRef.current = false;
      });
  }, [authStatus, getOrCreateWallet, primaryEvmChain, primaryWalletAddress]);

  useEffect(() => {
    if (authStatus !== "logged-in") return;
    if (!primaryWalletAddress) return;

    const externalUserId = resolveExternalUserId(primaryWalletAddress);
    const bootstrapKey = `${externalUserId}:${primaryWalletAddress}`;
    if (session && lastBootstrapRef.current === bootstrapKey) return;
    if (loading && lastBootstrapRef.current === bootstrapKey) return;

    void refreshSession();
  }, [authStatus, loading, primaryWalletAddress, refreshSession, resolveExternalUserId, session]);

  const client = useMemo(() => {
    if (!session?.sessionToken) return null;
    return new MachinesPartnerClient({
      // Always call partner routes through same-origin proxy to avoid CORS drift
      // across Vercel deployment/preview URLs.
      baseUrl: PARTNER_PROXY_BASE_URL,
      sessionToken: session.sessionToken,
    });
  }, [session]);

  const refreshOnboarding = useCallback(async () => {
    if (!client) {
      setOnboarding({
        loading: false,
        step: "kyc",
        kycStatus: null,
        agreementsAccepted: null,
        error: null,
      });
      return;
    }

    setOnboarding((previous) => ({
      ...previous,
      loading: true,
      error: null,
    }));

    try {
      const kyc = await client.getKycStatus();

      if (kyc.status !== "approved") {
        // If the provider returned a completion URL, route the user to verification step.
        const hasVerificationLink = Boolean(
          kyc.completionLink || kyc.externalVerificationLink,
        );
        setOnboarding({
          loading: false,
          step: hasVerificationLink ? "verification" : "kyc",
          kycStatus: kyc.status,
          agreementsAccepted: null,
          error: null,
        });
        return;
      }

      try {
        const agreements = await client.getAgreements();
        const accepted = Boolean(agreements.accepted);
        // Ready means both identity and terms are complete.
        setOnboarding({
          loading: false,
          step: accepted ? "ready" : "agreements",
          kycStatus: kyc.status,
          agreementsAccepted: accepted,
          error: null,
        });
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "unable to read agreements";
        setOnboarding({
          loading: false,
          step: "agreements",
          kycStatus: kyc.status,
          agreementsAccepted: false,
          error: message,
        });
      }
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "unable to load onboarding state";
      setOnboarding({
        loading: false,
        step: "kyc",
        kycStatus: null,
        agreementsAccepted: null,
        error: message,
      });
    }
  }, [client]);

  const acceptAgreements = useCallback(async () => {
    if (!client) return;
    await client.acceptAgreements();
    await refreshOnboarding();
  }, [client, refreshOnboarding]);

  useEffect(() => {
    if (!client) return;
    void refreshOnboarding();
  }, [client, session?.sessionId, refreshOnboarding]);

  const logout = async () => {
    await Promise.resolve(crossmintLogout());
  };

  const value = useMemo<DemoSessionContextValue>(
    () => ({
      loading,
      error,
      session,
      client,
      refreshSession,
      authStatus,
      walletAddress: primaryWalletAddress,
      crossmintConfigured: true,
      crossmintError: null,
      logout,
      onboarding,
      refreshOnboarding,
      acceptAgreements,
    }),
    [
      acceptAgreements,
      authStatus,
      client,
      error,
      loading,
      onboarding,
      primaryWalletAddress,
      refreshOnboarding,
      refreshSession,
      session,
    ],
  );

  return (
    <DemoSessionContext.Provider value={value}>
      {children}
    </DemoSessionContext.Provider>
  );
}

export function DemoSessionProvider(props: {
  children: React.ReactNode;
  crossmintDisabledReason?: string;
}) {
  if (props.crossmintDisabledReason) {
    return (
      <DisabledDemoSessionProvider reason={props.crossmintDisabledReason}>
        {props.children}
      </DisabledDemoSessionProvider>
    );
  }

  return <ActiveDemoSessionProvider>{props.children}</ActiveDemoSessionProvider>;
}

export function useDemoSession() {
  const context = useContext(DemoSessionContext);
  if (!context) {
    throw new Error("useDemoSession must be used inside DemoSessionProvider");
  }
  return context;
}
