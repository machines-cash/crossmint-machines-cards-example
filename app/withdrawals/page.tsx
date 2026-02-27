"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/machines/auth-gate";
import { AppShell } from "@/components/machines/app-shell";
import { Panel } from "@/components/machines/panel";
import { SetupBlockingPanel } from "@/components/machines/setup-blocking-panel";
import {
  isNetworkSupportedForWallet,
  preferredNetworkForWalletChain,
} from "@/lib/networks";
import { useDemoSession } from "@/state/demo-session-provider";
import type {
  WalletChain,
  WithdrawalAsset,
  WithdrawalEstimate,
  WithdrawalSignatureResponse,
} from "@/types/partner";

const DEFAULT_WITHDRAWAL_AMOUNT_CENTS = 1_000;
const MAX_WITHDRAWAL_RETRIES = 6;

function resolveSolanaSourceChainId() {
  const parsed = Number(process.env.NEXT_PUBLIC_SOLANA_SOURCE_CHAIN_ID ?? 901);
  return parsed === 900 ? 900 : 901;
}

const SOLANA_SOURCE_CHAIN_ID = resolveSolanaSourceChainId();

type DestinationOption = {
  currency: string;
  network: string;
};

function toDestinationOptions(
  assets: WithdrawalAsset[],
  walletChain: WalletChain,
): DestinationOption[] {
  const options = assets.flatMap((asset) =>
    asset.networks
      .filter((network) => isNetworkSupportedForWallet(network.id, walletChain))
      .map((network) => ({
        currency: asset.ticker.toLowerCase(),
        network: network.id.toLowerCase(),
      })),
  );

  if (options.length > 0) {
    return options;
  }

  return [
    {
      currency: "rusd",
      network: preferredNetworkForWalletChain(walletChain),
    },
  ];
}

function clampAmountCents(
  amountCents: number,
  minAmountCents: number | null,
  maxAmountCents: number | null,
) {
  let nextAmount = amountCents;
  if (typeof minAmountCents === "number" && minAmountCents > 0) {
    nextAmount = Math.max(nextAmount, minAmountCents);
  }
  if (typeof maxAmountCents === "number" && maxAmountCents > 0) {
    nextAmount = Math.min(nextAmount, maxAmountCents);
  }
  return Math.max(1, nextAmount);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function createReadyWithdrawalWithRetry(input: {
  create: () => Promise<WithdrawalSignatureResponse>;
}) {
  let attempt = 0;
  while (attempt < MAX_WITHDRAWAL_RETRIES) {
    const response = await input.create();
    if (response.status === "ready") {
      return response;
    }
    const retryAfterMs = Math.max(
      1_000,
      (response.retryAfterSeconds ?? 5) * 1_000,
    );
    await sleep(retryAfterMs);
    attempt += 1;
  }

  throw new Error("Withdrawal is still preparing. Please try again.");
}

export default function WithdrawalsPage() {
  const { client, walletAddress, walletChain, onboarding } = useDemoSession();
  const setupLocked = onboarding.loading || onboarding.step !== "ready";

  const [assets, setAssets] = useState<WithdrawalAsset[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState("rusd");
  const [selectedNetwork, setSelectedNetwork] = useState(
    preferredNetworkForWalletChain(walletChain),
  );
  const [destinationAddress, setDestinationAddress] = useState(walletAddress ?? "");
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastEstimate, setLastEstimate] = useState<WithdrawalEstimate | null>(null);
  const sourceFilter = useMemo(
    () =>
      walletChain === "solana"
        ? { sourceChainId: SOLANA_SOURCE_CHAIN_ID }
        : undefined,
    [walletChain],
  );
  const source = useMemo(
    () =>
      walletChain === "solana"
        ? { chainId: SOLANA_SOURCE_CHAIN_ID }
        : undefined,
    [walletChain],
  );

  const destinationOptions = useMemo(
    () => toDestinationOptions(assets, walletChain),
    [assets, walletChain],
  );

  const availableCurrencies = useMemo(() => {
    return [...new Set(destinationOptions.map((item) => item.currency))];
  }, [destinationOptions]);

  const availableNetworks = useMemo(() => {
    return destinationOptions
      .filter((item) => item.currency === selectedCurrency)
      .map((item) => item.network);
  }, [destinationOptions, selectedCurrency]);

  const canSubmit = Boolean(
    client &&
    walletAddress &&
    selectedCurrency.trim() &&
    selectedNetwork.trim() &&
    destinationAddress.trim(),
  );

  useEffect(() => {
    if (!walletAddress) return;
    setDestinationAddress((current) => current || walletAddress || "");
  }, [walletAddress]);

  useEffect(() => {
    if (!client || setupLocked) return;
    const sessionClient = client;
    let cancelled = false;

    async function loadAssets() {
      setLoadingAssets(true);
      try {
        const nextAssets = await sessionClient.listWithdrawalAssets(sourceFilter);
        if (cancelled) return;
        setAssets(nextAssets);
      } catch {
        if (cancelled) return;
        setAssets([]);
      } finally {
        if (!cancelled) {
          setLoadingAssets(false);
        }
      }
    }

    void loadAssets();
    return () => {
      cancelled = true;
    };
  }, [client, setupLocked, sourceFilter]);

  useEffect(() => {
    if (!availableCurrencies.length) return;
    if (availableCurrencies.includes(selectedCurrency)) return;
    setSelectedCurrency(availableCurrencies[0]);
  }, [availableCurrencies, selectedCurrency]);

  useEffect(() => {
    if (!availableNetworks.length) return;
    if (availableNetworks.includes(selectedNetwork)) return;
    const preferredNetwork = preferredNetworkForWalletChain(walletChain);
    if (availableNetworks.includes(preferredNetwork)) {
      setSelectedNetwork(preferredNetwork);
      return;
    }
    setSelectedNetwork(availableNetworks[0]);
  }, [availableNetworks, selectedNetwork, walletChain]);

  useEffect(() => {
    setSelectedNetwork(preferredNetworkForWalletChain(walletChain));
  }, [walletChain]);

  const submitWithdrawal = async () => {
    if (!client || !walletAddress || setupLocked) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const range = await client.getWithdrawalRange({
        source,
        destination: {
          currency: selectedCurrency,
          network: selectedNetwork,
        },
      });

      const amountCents = clampAmountCents(
        DEFAULT_WITHDRAWAL_AMOUNT_CENTS,
        range.minAmountCents,
        range.maxAmountCents,
      );

      const estimate = await client.getWithdrawalEstimate({
        source,
        destination: {
          currency: selectedCurrency,
          network: selectedNetwork,
        },
        amountCents,
      });
      setLastEstimate(estimate);

      const readyWithdrawal = await createReadyWithdrawalWithRetry({
        create: () =>
          client.createWithdrawal({
            amountCents,
            source: source ?? {},
            destination: {
              currency: selectedCurrency,
              network: selectedNetwork,
              address: destinationAddress.trim(),
            },
            adminAddress: walletAddress ?? undefined,
          }),
      });

      void readyWithdrawal;
      setSuccess("Withdrawal submitted. Funds are now being processed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create withdrawal.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthGate>
      <AppShell>
        {setupLocked ? (
          <SetupBlockingPanel />
        ) : (
          <Panel title="Withdraw" subtitle="Send funds in three quick steps.">
            <div className="stack">
              {error ? (
                <p className="status-pill status-error" style={{ margin: 0 }}>
                  {error}
                </p>
              ) : null}
              {success ? (
                <p className="status-pill status-approved" style={{ margin: 0 }}>
                  {success}
                </p>
              ) : null}

              <div className="kv-grid">
                <label className="stack" style={{ gap: 6 }}>
                  <span className="label">token</span>
                  <select
                    className="select"
                    value={selectedCurrency}
                    onChange={(event) =>
                      setSelectedCurrency(event.target.value.toLowerCase())}
                    disabled={loadingAssets || submitting}
                  >
                    {availableCurrencies.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="stack" style={{ gap: 6 }}>
                  <span className="label">network</span>
                  <select
                    className="select"
                    value={selectedNetwork}
                    onChange={(event) =>
                      setSelectedNetwork(event.target.value.toLowerCase())}
                    disabled={loadingAssets || submitting}
                  >
                    {availableNetworks.map((network) => (
                      <option key={network} value={network}>
                        {network}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="stack" style={{ gap: 6 }}>
                  <span className="label">withdrawal address</span>
                  <input
                    className="input"
                    value={destinationAddress}
                    onChange={(event) => setDestinationAddress(event.target.value)}
                    disabled={submitting}
                    placeholder="Enter destination address"
                  />
                </label>
              </div>

              <div className="row-wrap">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void submitWithdrawal()}
                  disabled={!canSubmit || submitting}
                >
                  {submitting ? "processing..." : "confirm withdrawal"}
                </button>
              </div>

              <p className="muted" style={{ margin: 0 }}>
                Demo amount: $10 per withdrawal.
              </p>

              {lastEstimate ? (
                <div className="kv-grid">
                  <div className="kv-item">
                    <strong>amount</strong>
                    <span>${(lastEstimate.fromAmountCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="kv-item">
                    <strong>you receive</strong>
                    <span>{lastEstimate.estimatedToAmount ?? "-"}</span>
                  </div>
                  <div className="kv-item">
                    <strong>status</strong>
                    <span>{success ? "submitted" : "ready"}</span>
                  </div>
                </div>
              ) : null}

            </div>
          </Panel>
        )}
      </AppShell>
    </AuthGate>
  );
}
