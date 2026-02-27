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
import {
  resolvePrimaryEvmChain,
  resolvePrimarySolanaChain,
} from "@/lib/crossmint/chains";
import {
  buildExternalUserId,
  extractCrossmintEmail,
} from "@/lib/crossmint/session-identity";
import type { SessionPayload, WalletChain } from "@/types/partner";

const WALLET_CHAIN_STORAGE_KEY = "machines.crossmint.walletChain";
const MAX_WALLET_RESOLVE_ATTEMPTS = 6;
const WALLET_RESOLVE_RETRY_MS = 500;

type DemoSessionContextValue = {
  loading: boolean;
  error: string | null;
  session: SessionPayload | null;
  client: MachinesPartnerClient | null;
  refreshSession: () => Promise<void>;
  authStatus: string;
  walletChain: WalletChain;
  setWalletChain: (walletChain: WalletChain) => void;
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
  const candidates = [record.address, record.walletAddress, record.publicKey];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

function getErrorMessage(cause: unknown) {
  if (!cause) return "";
  if (typeof cause === "string") return cause;
  if (typeof cause === "object" && "message" in cause) {
    const message = (cause as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

function isTransientWalletCreationError(cause: unknown) {
  const message = getErrorMessage(cause).toLowerCase();
  if (!message) return false;
  return (
    message.includes("could not establish connection") ||
    message.includes("receiving end does not exist") ||
    message.includes("user rejected the request") ||
    message.includes("in-progress") ||
    message.includes("wallet is not loaded") ||
    message.includes("network") ||
    message.includes("timeout")
  );
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveWalletAddressWithRetries(input: {
  getOrCreateWallet: (args: unknown) => Promise<unknown>;
  walletArgs: unknown;
}) {
  let lastTransientError: unknown = null;

  for (let attempt = 0; attempt < MAX_WALLET_RESOLVE_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await sleep(WALLET_RESOLVE_RETRY_MS * attempt);
    }
    try {
      const wallet = await input.getOrCreateWallet(input.walletArgs);
      const resolvedAddress = extractWalletAddress(wallet);
      if (resolvedAddress) {
        return resolvedAddress;
      }
    } catch (cause) {
      if (!isTransientWalletCreationError(cause)) {
        throw cause;
      }
      lastTransientError = cause;
    }
  }

  if (lastTransientError) {
    throw new Error("wallet setup is still in progress; please retry");
  }
  throw new Error("failed to create wallet");
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
      walletChain: "evm",
      setWalletChain: () => undefined,
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

  const [walletChain, setWalletChainState] = useState<WalletChain>(() => {
    if (typeof window === "undefined") return "evm";
    const stored = window.localStorage.getItem(WALLET_CHAIN_STORAGE_KEY);
    return stored === "solana" ? "solana" : "evm";
  });
  const [walletAddresses, setWalletAddresses] = useState<Record<WalletChain, string | null>>({
    evm: null,
    solana: null,
  });
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
  const primarySolanaChain = resolvePrimarySolanaChain(
    process.env.NEXT_PUBLIC_CROSSMINT_SOLANA_CHAIN,
  );
  const primaryWalletAddress = walletAddresses[walletChain];

  const walletCreateInFlightRef = useRef<Record<WalletChain, boolean>>({
    evm: false,
    solana: false,
  });
  const lastBootstrapRef = useRef<string | null>(null);

  const setWalletChain = useCallback((nextChain: WalletChain) => {
    setWalletChainState(nextChain);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WALLET_CHAIN_STORAGE_KEY, nextChain);
    }
  }, []);

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
          chain: walletChain,
          address: primaryWalletAddress,
        },
      });
      setSession(nextSession);
      lastBootstrapRef.current = `${externalUserId}:${walletChain}:${primaryWalletAddress}`;
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
  }, [primaryWalletAddress, resolveExternalUserId, walletChain]);

  useEffect(() => {
    if (authStatus !== "logged-in") {
      walletCreateInFlightRef.current = {
        evm: false,
        solana: false,
      };
      setWalletAddresses({
        evm: null,
        solana: null,
      });
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
    if (walletCreateInFlightRef.current[walletChain]) {
      return;
    }

    // Crossmint can report "logged-in" before the embedded wallet is hydrated.
    // This ensures we request exactly one wallet creation call per login cycle.
    const requestedWalletChain = walletChain;
    const requestedCrossmintChain =
      requestedWalletChain === "evm" ? primaryEvmChain : primarySolanaChain;

    walletCreateInFlightRef.current[requestedWalletChain] = true;
    setError(null);
    const walletArgs = {
      chain: requestedCrossmintChain,
      signer: {
        type: "email",
      },
    } as Parameters<typeof getOrCreateWallet>[0];
    void resolveWalletAddressWithRetries({
      getOrCreateWallet: (args) =>
        getOrCreateWallet(args as Parameters<typeof getOrCreateWallet>[0]),
      walletArgs,
    })
      .then((resolvedAddress) => {
        setWalletAddresses((previous) => ({
          ...previous,
          [requestedWalletChain]: resolvedAddress,
        }));
      })
      .catch((cause) => {
        const message = getErrorMessage(cause) || "failed to create embedded wallet";
        setError(message);
      })
      .finally(() => {
        walletCreateInFlightRef.current[requestedWalletChain] = false;
      });
  }, [
    authStatus,
    getOrCreateWallet,
    primaryEvmChain,
    primarySolanaChain,
    primaryWalletAddress,
    walletChain,
  ]);

  useEffect(() => {
    if (authStatus !== "logged-in") return;
    if (!primaryWalletAddress) return;

    const externalUserId = resolveExternalUserId(primaryWalletAddress);
    const bootstrapKey = `${externalUserId}:${walletChain}:${primaryWalletAddress}`;
    if (session && lastBootstrapRef.current === bootstrapKey) return;
    if (loading && lastBootstrapRef.current === bootstrapKey) return;

    void refreshSession();
  }, [
    authStatus,
    loading,
    primaryWalletAddress,
    refreshSession,
    resolveExternalUserId,
    session,
    walletChain,
  ]);

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
      walletChain,
      setWalletChain,
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
      setWalletChain,
      session,
      walletChain,
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
