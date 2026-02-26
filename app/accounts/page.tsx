"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EVMWallet, useWallet } from "@crossmint/client-sdk-react-ui";
import { getAddress, parseUnits } from "viem";
import { AuthGate } from "@/components/machines/auth-gate";
import { AppShell } from "@/components/machines/app-shell";
import { Panel } from "@/components/machines/panel";
import { SetupBlockingPanel } from "@/components/machines/setup-blocking-panel";
import { VirtualCard } from "@/components/machines/virtual-card";
import { formatUsdCents, titleCaseStatus } from "@/lib/format";
import { decryptCardSecrets } from "@/lib/card-secrets";
import { MachinesPartnerError } from "@/lib/machines-partner-client";
import { isUnsupportedDestinationNetwork } from "@/lib/networks";
import { useDemoSession } from "@/state/demo-session-provider";
import type { DepositAsset, DepositIntent, PartnerCard } from "@/types/partner";

type CardLimitFrequency =
  | "perAuthorization"
  | "per24HourPeriod"
  | "per7DayPeriod"
  | "per30DayPeriod"
  | "perYearPeriod"
  | "allTime";

const BASE_SEPOLIA_CHAIN_ID = 84532;
const RUSD_TOKEN_ADDRESS = (
  process.env.NEXT_PUBLIC_EVM_RUSD_TOKEN ??
  "0x10b5Be494C2962A7B318aFB63f0Ee30b959D000b"
) as `0x${string}`;
const CROSSMINT_EVM_CHAIN = (
  process.env.NEXT_PUBLIC_CROSSMINT_EVM_CHAIN ?? "base-sepolia"
)
  .trim()
  .toLowerCase();
const RUSD_TOKEN_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ name: "_amountDollars_Max100", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;
function limitFrequencyLabel(value: CardLimitFrequency) {
  if (value === "allTime") return "all time";
  if (value === "perAuthorization") return "per transaction";
  return value.replace("per", "per ").replace("Period", "").toLowerCase();
}

function toTitleLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function shortId(value: string) {
  if (!value) return value;
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function getPartnerErrorCodes(cause: unknown) {
  if (!(cause instanceof MachinesPartnerError)) return [];
  return cause.details?.errors?.map((error) => error.code) ?? [];
}

function isRetryableMissingContractError(cause: unknown) {
  if (!(cause instanceof MachinesPartnerError)) return false;
  const codes = getPartnerErrorCodes(cause);
  if (codes.includes("missing_contract")) return true;
  return /missing contract/i.test(cause.message);
}

function formatDepositError(cause: unknown) {
  if (!(cause instanceof MachinesPartnerError)) {
    return cause instanceof Error ? cause.message : "deposit failed";
  }
  const codes = getPartnerErrorCodes(cause);
  if (codes.includes("chain_not_supported")) {
    return "This network is not available for deposits yet.";
  }
  if (codes.includes("wallet_missing_for_chain")) {
    return "A wallet is required for the selected network.";
  }
  if (codes.includes("wallet_invalid_for_chain")) {
    return "The wallet address does not match the selected network.";
  }
  return cause.message;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldAttemptAutofund(input: { currency: string; network: string }) {
  return (
    CROSSMINT_EVM_CHAIN === "base-sepolia" &&
    input.currency.trim().toLowerCase() === "rusd" &&
    input.network.trim().toLowerCase() === "base"
  );
}

export default function AccountsPage() {
  const { client, loading: sessionLoading, onboarding } = useDemoSession();
  const { getOrCreateWallet } = useWallet();
  const setupLocked = onboarding.loading || onboarding.step !== "ready";

  const [cards, setCards] = useState<PartnerCard[]>([]);
  const [balances, setBalances] = useState<{ spendingPowerCents: number } | null>(null);
  const [kycStatus, setKycStatus] = useState<string>("not_submitted");
  const [cardBusy, setCardBusy] = useState(false);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, { pan: string; cvc: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  const [limitAmountUsd, setLimitAmountUsd] = useState(50);
  const [limitFrequency, setLimitFrequency] = useState<CardLimitFrequency>("allTime");

  const [depositAssets, setDepositAssets] = useState<DepositAsset[]>([]);
  const [depositCurrency, setDepositCurrency] = useState("rusd");
  const [depositNetwork, setDepositNetwork] = useState("base");
  const [depositAmount, setDepositAmount] = useState(10);
  const [deposits, setDeposits] = useState<DepositIntent[]>([]);
  const [depositBusy, setDepositBusy] = useState(false);

  const canCreateCard = useMemo(() => limitAmountUsd > 0, [limitAmountUsd]);
  const activeCard = cards[activeCardIndex] ?? null;
  const activeRevealed = activeCard ? revealedSecrets[activeCard.cardId] : null;
  const displayDepositAssets = useMemo(
    () =>
      depositAssets
        .map((asset) => ({
          ...asset,
          networks: asset.networks.filter(
            (network) => !isUnsupportedDestinationNetwork(network.id),
          ),
        }))
        .filter((asset) => asset.networks.length > 0),
    [depositAssets],
  );
  const depositCurrencyOptions = useMemo(
    () => [...new Set(displayDepositAssets.map((asset) => asset.ticker.toLowerCase()))],
    [displayDepositAssets],
  );
  const depositNetworkOptions = useMemo(() => {
    if (!displayDepositAssets.length) return [];
    return [
      ...new Set(
        displayDepositAssets
          .filter((asset) => asset.ticker.toLowerCase() === depositCurrency.toLowerCase())
          .flatMap((asset) => asset.networks.map((network) => network.id.toLowerCase())),
      ),
    ];
  }, [depositCurrency, displayDepositAssets]);
  const supportedAssetLabels = useMemo(
    () =>
      displayDepositAssets.flatMap((asset) =>
        asset.networks.map(
          (network) => `${asset.ticker.toUpperCase()} · ${network.label || network.id}`,
        ),
      ),
    [displayDepositAssets],
  );
  const depositsInProgress = useMemo(
    () =>
      deposits.map((deposit) => ({
        id: deposit.id,
        label: `Deposit ${shortId(deposit.id)}`,
        status: titleCaseStatus(deposit.status),
        statusClass: `status-${deposit.status.toLowerCase().replace(/\s+/g, "_")}`,
      })),
    [deposits],
  );

  const refresh = async () => {
    if (!client || setupLocked) return null;
    try {
      setError(null);
      const [nextCards, nextBalances, nextKyc, nextDeposits, assets] = await Promise.all([
        client.listCards(),
        client.getBalances(),
        client.getKycStatus(),
        client.listDeposits("active"),
        client.listDepositAssets(),
      ]);
      setCards(nextCards);
      setBalances({ spendingPowerCents: Math.round(nextBalances.spendingPower ?? 0) });
      setKycStatus(nextKyc.status);
      setDeposits(nextDeposits);
      setDepositAssets(assets);
      return nextCards;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "unable to load accounts");
      return null;
    }
  };

  useEffect(() => {
    if (!client || setupLocked) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, setupLocked]);

  useEffect(() => {
    if (!cards.length) {
      setActiveCardIndex(0);
      return;
    }
    setActiveCardIndex((current) => Math.min(current, cards.length - 1));
  }, [cards.length]);

  useEffect(() => {
    if (!depositCurrencyOptions.length) return;
    if (depositCurrencyOptions.includes(depositCurrency.toLowerCase())) return;
    const preferredCurrency = depositCurrencyOptions.find((value) => value === "rusd");
    setDepositCurrency(preferredCurrency ?? depositCurrencyOptions[0]);
  }, [depositCurrency, depositCurrencyOptions]);

  useEffect(() => {
    if (!depositNetworkOptions.length) return;
    if (depositNetworkOptions.includes(depositNetwork.toLowerCase())) return;
    const preferredNetwork = "base";
    if (depositNetworkOptions.includes(preferredNetwork)) {
      setDepositNetwork(preferredNetwork);
      return;
    }
    setDepositNetwork(depositNetworkOptions[0]);
  }, [depositNetwork, depositNetworkOptions]);

  const createCard = async () => {
    if (!client || setupLocked) return;
    setCardBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const amountCents = Math.round(limitAmountUsd * 100);
      await client.createCard({
        limit: {
          amountCents,
          frequency: limitFrequency,
        },
      });
      setSuccess("Card created.");
      const nextCards = await refresh();
      if (nextCards?.length) {
        setActiveCardIndex(nextCards.length - 1);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "card creation failed");
    } finally {
      setCardBusy(false);
    }
  };

  const reveal = async (cardId: string) => {
    if (!client || setupLocked) return;
    setBusyCardId(cardId);
    setError(null);
    try {
      const session = await client.createCardSecretsSession();
      const encrypted = await client.getCardSecrets(cardId, session.sessionId);
      const decrypted = await decryptCardSecrets({
        secretKey: session.secretKey,
        encryptedPan: encrypted.encryptedPan,
        encryptedCvc: encrypted.encryptedCvc,
      });
      setRevealedSecrets((prev) => ({
        ...prev,
        [cardId]: decrypted,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "failed to reveal card");
    } finally {
      setBusyCardId(null);
    }
  };

  const toggleCardStatus = async (card: PartnerCard) => {
    if (!client || setupLocked) return;
    setBusyCardId(card.cardId);
    setError(null);
    try {
      await client.updateCard(card.cardId, {
        status: card.status === "active" ? "locked" : "active",
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "failed to update card status");
    } finally {
      setBusyCardId(null);
    }
  };

  const removeCard = async (cardId: string) => {
    if (!client || setupLocked) return;
    setBusyCardId(cardId);
    setError(null);
    try {
      await client.deleteCard(cardId);
      setSuccess("Card deleted.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "failed to delete card");
    } finally {
      setBusyCardId(null);
    }
  };

  const createDeposit = async () => {
    if (!client || setupLocked) return;
    setDepositBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const submitDeposit = async () =>
        client.createDeposit({
          currency: depositCurrency,
          network: depositNetwork,
          amount: depositAmount,
        });

      let createdDeposit: DepositIntent;
      try {
        createdDeposit = await submitDeposit();
      } catch (cause) {
        if (!isRetryableMissingContractError(cause)) {
          throw cause;
        }
        // Contract provisioning can race the first deposit call in sandbox.
        // Retry once after a short wait instead of forcing the user to click again.
        setSuccess("Setting up your deposit account...");
        await sleep(1500);
        createdDeposit = await submitDeposit();
      }

      let autofundRecipientAddress: string | null = null;
      const shouldAutofund = shouldAttemptAutofund({
        currency: depositCurrency,
        network: depositNetwork,
      });

      if (shouldAutofund) {
        autofundRecipientAddress =
          createdDeposit.depositAddress ??
          (await waitForDepositAddress({
            client,
            depositId: createdDeposit.id,
          }));
      }

      if (shouldAutofund && autofundRecipientAddress) {
        try {
          await createEmbeddedWalletAutofund({
            getOrCreateWallet,
            recipientAddress: autofundRecipientAddress,
            amountDollars: 100,
          });
        } catch (cause) {
          void cause;
        }
      }

      setSuccess(
        `Deposit created.${shouldAutofund ? " Added 100 rUSD to your deposit address." : ""}`,
      );
      await refresh();
    } catch (cause) {
      setError(formatDepositError(cause));
    } finally {
      setDepositBusy(false);
    }
  };

  return (
    <AuthGate>
      <AppShell>
        {setupLocked ? <SetupBlockingPanel /> : (
          <>
        <Panel
          title="Cards and accounts"
          subtitle="Create cards and add funds"
          actions={<button type="button" className="btn btn-ghost" onClick={() => void refresh()} disabled={!client || sessionLoading || setupLocked}>refresh</button>}
        >
          <div className="stack">
            {error ? <p className="status-pill status-error" style={{ margin: 0 }}>{error}</p> : null}
            {success ? <p className="status-pill status-approved" style={{ margin: 0 }}>{success}</p> : null}

            <div className="kv-grid">
              <div className="kv-item">
                <strong>kyc status</strong>
                <span>{titleCaseStatus(kycStatus)}</span>
              </div>
              <div className="kv-item">
                <strong>spending power</strong>
                <span>{formatUsdCents(balances?.spendingPowerCents)}</span>
              </div>
              <div className="kv-item">
                <strong>active cards</strong>
                <span>{cards.length}</span>
              </div>
            </div>

            {kycStatus !== "approved" ? (
              <p className="muted" style={{ margin: 0 }}>
                Complete KYC on <Link href="/kyc" style={{ color: "var(--violet)" }}>/kyc</Link> before using cards or balances.
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel
          title="Create card"
          subtitle="Set a limit and create a card"
          actions={
            <button type="button" className="btn btn-primary" onClick={() => void createCard()} disabled={!client || !canCreateCard || cardBusy || kycStatus !== "approved"}>
              {cardBusy ? "creating..." : "create card"}
            </button>
          }
        >
          <div className="row-wrap">
            <label className="stack" style={{ gap: 6, minWidth: 220 }}>
              <span className="label">limit amount (USD)</span>
              <input className="input" type="number" min={1} step={1} value={limitAmountUsd} onChange={(event) => setLimitAmountUsd(Number(event.target.value || 0))} />
            </label>
            <label className="stack" style={{ gap: 6, minWidth: 220 }}>
              <span className="label">frequency</span>
              <select className="select" value={limitFrequency} onChange={(event) => setLimitFrequency(event.target.value as typeof limitFrequency)}>
                <option value="allTime">{toTitleLabel("allTime")}</option>
                <option value="perAuthorization">{toTitleLabel("perAuthorization")}</option>
                <option value="per24HourPeriod">{toTitleLabel("per24HourPeriod")}</option>
                <option value="per7DayPeriod">{toTitleLabel("per7DayPeriod")}</option>
                <option value="per30DayPeriod">{toTitleLabel("per30DayPeriod")}</option>
                <option value="perYearPeriod">{toTitleLabel("perYearPeriod")}</option>
              </select>
            </label>
          </div>
        </Panel>

        <Panel
          title={activeCard ? `Card ${activeCard.last4}` : "Cards"}
          subtitle={
            activeCard?.limit
              ? `Limit ${formatUsdCents(activeCard.limit.amountCents)} / ${limitFrequencyLabel(activeCard.limit.frequency as CardLimitFrequency)}`
              : cards.length
                ? "No limit set"
                : "Create your first card"
          }
          actions={
            activeCard ? (
              <div className="row-wrap">
                <button type="button" className="btn btn-ghost" onClick={() => void toggleCardStatus(activeCard)} disabled={busyCardId === activeCard.cardId}>
                  {activeCard.status === "active" ? "lock" : "activate"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => void reveal(activeCard.cardId)} disabled={busyCardId === activeCard.cardId}>
                  {busyCardId === activeCard.cardId ? "loading..." : "reveal"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void removeCard(activeCard.cardId)} disabled={busyCardId === activeCard.cardId}>
                  delete
                </button>
              </div>
            ) : null
          }
        >
          {!activeCard ? (
            <p className="muted" style={{ margin: 0 }}>no cards yet</p>
          ) : (
            <div className="stack" style={{ alignItems: "center" }}>
              <VirtualCard
                card={activeCard}
                revealedPan={activeRevealed?.pan}
                revealedCvc={activeRevealed?.cvc}
              />
              {cards.length > 1 ? (
                <div className="row-wrap">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setActiveCardIndex((current) => Math.max(current - 1, 0))}
                    disabled={activeCardIndex === 0}
                  >
                    prev
                  </button>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {activeCardIndex + 1} of {cards.length}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setActiveCardIndex((current) => Math.min(current + 1, cards.length - 1))}
                    disabled={activeCardIndex === cards.length - 1}
                  >
                    next
                  </button>
                </div>
              ) : null}
              {cards.length > 1 ? (
                <div className="row-wrap" style={{ gap: 8 }}>
                  {cards.map((card, index) => (
                    <button
                      key={card.cardId}
                      type="button"
                      className="btn"
                      style={{
                        width: 12,
                        height: 12,
                        padding: 0,
                        borderRadius: "50%",
                        background: index === activeCardIndex ? "var(--orange)" : "rgba(0,0,0,0.15)",
                      }}
                      onClick={() => setActiveCardIndex(index)}
                      aria-label={`Show card ${index + 1}`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </Panel>

        <Panel
          title="Add funds"
          subtitle="Choose token, network, and amount"
        >
          <div className="stack">
            <div className="row-wrap">
              <label className="stack" style={{ gap: 6, minWidth: 180 }}>
                <span className="label">token</span>
                <select
                  className="select"
                  value={depositCurrency}
                  onChange={(event) => setDepositCurrency(event.target.value.toLowerCase())}
                  disabled={depositBusy}
                >
                  {depositCurrencyOptions.length ? (
                    depositCurrencyOptions.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency.toUpperCase()}
                      </option>
                    ))
                  ) : (
                    <option value={depositCurrency}>{depositCurrency.toUpperCase()}</option>
                  )}
                </select>
              </label>
              <label className="stack" style={{ gap: 6, minWidth: 180 }}>
                <span className="label">network</span>
                <select
                  className="select"
                  value={depositNetwork}
                  onChange={(event) => setDepositNetwork(event.target.value.toLowerCase())}
                  disabled={depositBusy}
                >
                  {depositNetworkOptions.length ? (
                    depositNetworkOptions.map((network) => (
                      <option key={network} value={network}>
                        {network}
                      </option>
                    ))
                  ) : (
                    <option value={depositNetwork}>{depositNetwork}</option>
                  )}
                </select>
              </label>
              <label className="stack" style={{ gap: 6, minWidth: 180 }}>
                <span className="label">amount (USD)</span>
                <input className="input" type="number" min={0.01} step={0.01} value={depositAmount} onChange={(event) => setDepositAmount(Number(event.target.value || 0))} />
              </label>
              <button type="button" className="btn btn-primary" onClick={() => void createDeposit()} disabled={!client || kycStatus !== "approved" || depositBusy}>
                {depositBusy ? "processing..." : "create deposit"}
              </button>
            </div>

            <div className="kv-item">
              <strong>supported assets</strong>
              {supportedAssetLabels.length ? (
                <div className="chip-list">
                  {supportedAssetLabels.map((label) => (
                    <span key={label} className="chip">{label}</span>
                  ))}
                </div>
              ) : (
                <span>none</span>
              )}
            </div>

            <div className="kv-item">
              <strong>deposits in progress</strong>
              {depositsInProgress.length ? (
                <div className="info-list">
                  {depositsInProgress.map((deposit) => (
                    <div key={deposit.id} className="info-row">
                      <strong>{deposit.label}</strong>
                      <span className={`status-pill ${deposit.statusClass}`}>{deposit.status}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="info-empty" style={{ margin: 0 }}>No active deposits.</p>
              )}
            </div>
          </div>
        </Panel>
          </>
        )}
      </AppShell>
    </AuthGate>
  );
}

type AutofundResponse = {
  chainId: number;
  recipientAddress: string;
  tokenAddress: string;
  amountDollars: number;
  mintTxHash: string;
  transferTxHash: string;
};

async function waitForDepositAddress(input: {
  client: {
    listDeposits: (scope?: "active" | "all") => Promise<DepositIntent[]>;
  };
  depositId: string;
  attempts?: number;
  delayMs?: number;
}): Promise<string | null> {
  const attempts = input.attempts ?? 6;
  const delayMs = input.delayMs ?? 1500;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const deposits = await input.client.listDeposits("all");
    const match = deposits.find((deposit) => deposit.id === input.depositId);
    if (match?.depositAddress) {
      return match.depositAddress;
    }
    await sleep(delayMs);
  }

  return null;
}

async function createEmbeddedWalletAutofund(input: {
  getOrCreateWallet: (args: {
    chain: "base-sepolia";
    signer: { type: "email" };
  }) => Promise<unknown>;
  recipientAddress: string;
  amountDollars: number;
}): Promise<AutofundResponse> {
  const wallet = await input.getOrCreateWallet({
    chain: "base-sepolia",
    signer: { type: "email" },
  });
  if (!wallet) {
    throw new Error("embedded wallet unavailable");
  }

  const evmWallet = EVMWallet.from(wallet as Parameters<typeof EVMWallet.from>[0]);
  const viemClient = evmWallet.getViemClient();
  const decimals = await viemClient.readContract({
    address: RUSD_TOKEN_ADDRESS,
    abi: RUSD_TOKEN_ABI,
    functionName: "decimals",
  });

  const mintTransaction = await evmWallet.sendTransaction({
    to: RUSD_TOKEN_ADDRESS,
    abi: RUSD_TOKEN_ABI,
    functionName: "mint",
    args: [BigInt(input.amountDollars)],
  });
  const mintTxHash = mintTransaction.hash;
  if (!isHexHash(mintTxHash)) {
    throw new Error("embedded mint transaction hash missing");
  }
  await viemClient.waitForTransactionReceipt({ hash: mintTxHash });

  const walletAddress = getAddress(evmWallet.address);
  const recipientAddress = getAddress(input.recipientAddress);
  let transferTxHash: `0x${string}` = mintTxHash;
  if (walletAddress !== recipientAddress) {
    const transferAmount = parseUnits(String(input.amountDollars), Number(decimals));
    const transferTransaction = await evmWallet.sendTransaction({
      to: RUSD_TOKEN_ADDRESS,
      abi: RUSD_TOKEN_ABI,
      functionName: "transfer",
      args: [recipientAddress, transferAmount],
    });
    const nextTransferHash = transferTransaction.hash;
    if (!isHexHash(nextTransferHash)) {
      throw new Error("embedded transfer transaction hash missing");
    }
    transferTxHash = nextTransferHash;
    await viemClient.waitForTransactionReceipt({ hash: transferTxHash });
  }

  return {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    recipientAddress,
    tokenAddress: RUSD_TOKEN_ADDRESS,
    amountDollars: input.amountDollars,
    mintTxHash,
    transferTxHash,
  };
}

function isHexHash(value: string | null | undefined): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value);
}
