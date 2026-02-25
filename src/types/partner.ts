export type PartnerErrorDetail = {
  code: string;
  message: string;
  field?: string;
};

export type PartnerResponse<T> = {
  ok: boolean;
  data?: T;
  summary?: string;
  errors?: PartnerErrorDetail[];
  next?: Record<string, unknown>;
};

export type WalletChain = "evm" | "solana";

export type PartnerWallet = {
  chain: WalletChain;
  address: string;
};

export type SessionPayload = {
  sessionToken: string;
  sessionId: string;
  userId: string;
  expiresAt: string;
  scopes: string[];
  wallet: PartnerWallet | null;
};

export type KycStatus =
  | "not_submitted"
  | "pending"
  | "approved"
  | "denied"
  | "manual_review"
  | "needs_information"
  | "needs_verification"
  | "locked"
  | "canceled";

export type KycStatusPayload = {
  status: KycStatus;
  reason: string | null;
  completionLink: string | null;
  externalVerificationLink: string | null;
  isActive: boolean | null;
  isTermsOfServiceAccepted: boolean;
};

export type KycField = {
  name: string;
  required: boolean;
  type: string;
  enum?: string[];
  regex?: string;
  maxLength?: number;
};

export type PartnerAgreementLink = {
  label: string;
  url: string;
};

export type PartnerAgreement = {
  id: string;
  text: string;
  links: PartnerAgreementLink[];
};

export type PartnerAgreementsPayload = {
  agreements: PartnerAgreement[];
  accepted: boolean;
  acceptedAt: string | null;
};

export type CardLimit = {
  amountCents: number;
  frequency:
    | "perAuthorization"
    | "per24HourPeriod"
    | "per7DayPeriod"
    | "per30DayPeriod"
    | "perYearPeriod"
    | "allTime";
};

export type EncryptedBlob = {
  v: number;
  iv: string;
  ct: string;
};

export type PartnerCard = {
  cardId: string;
  status: "active" | "locked" | "canceled" | "not_activated";
  brand: string;
  last4: string;
  expirationMonth: number;
  expirationYear: number;
  limit: CardLimit | null;
  encryptedName: EncryptedBlob | null;
  encryptedColor: EncryptedBlob | null;
  encryptedEmoji: EncryptedBlob | null;
  encryptedMemo: EncryptedBlob | null;
  folderId: string | null;
  contractId: string | null;
  isPinned: boolean;
  sortOrder: number;
  createdAt: string;
};

export type CardSecretsSession = {
  sessionId: string;
  secretKey: string;
};

export type CardSecrets = {
  encryptedPan: { data: string; iv: string };
  encryptedCvc: { data: string; iv: string };
  expirationMonth: number;
  expirationYear: number;
};

export type BalancePayload = {
  creditLimit: number;
  pendingCharges: number;
  postedCharges: number;
  balanceDue: number;
  spendingPower: number;
};

export type DepositAssetNetwork = {
  id: string;
  label: string;
  chainId: number | null;
  tokenContract: string | null;
  supportsExtraId?: boolean;
};

export type DepositAsset = {
  ticker: string;
  name: string;
  icon: string | null;
  networks: DepositAssetNetwork[];
};

export type DepositRange = {
  fromCurrency: string;
  fromNetwork: string;
  toCurrency: string;
  toNetwork: string;
  contractId: string;
  payoutAddress: string;
  payoutChainId: number | null;
  minAmount: number | null;
  maxAmount: number | null;
};

export type DepositEstimate = {
  fromCurrency: string;
  fromNetwork: string;
  toCurrency: string;
  toNetwork: string;
  contractId: string;
  payoutAddress: string;
  payoutChainId: number | null;
  quotedAmount: number;
  quotedAmountCurrency: "crypto" | "usd";
  estimatedToAmount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  rateId: string | null;
};

export type DepositIntent = {
  id: string;
  contractId: string;
  changeNowId: string | null;
  fromCurrency: string;
  fromNetwork: string;
  depositAddress: string | null;
  payinExtraId: string | null;
  chainId: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type WithdrawalAsset = {
  ticker: string;
  name: string;
  icon: string | null;
  networks: Array<{
    id: string;
    label: string;
    chainId: number | null;
    tokenContract: string | null;
    supportsExtraId?: boolean;
  }>;
};

export type WithdrawalRange = {
  fromCurrency: string;
  fromNetwork: string;
  toCurrency: string;
  toNetwork: string;
  minAmount: number | null;
  maxAmount: number | null;
  minAmountCents: number | null;
  maxAmountCents: number | null;
  destinationSupportsExtraId: boolean;
};

export type WithdrawalEstimate = WithdrawalRange & {
  fromAmount: number;
  fromAmountCents: number;
  estimatedToAmount: number | null;
  rateId: string | null;
  destinationExtraId: string | null;
};

export type WithdrawalExecutionHints = {
  contractId: string | null;
  contractVersion: number | null;
  chainId: number | null;
  collateralProxyAddress: string | null;
  controllerAddress: string | null;
  coordinatorAddress: string | null;
  callTarget: string | null;
  callPath: "coordinator_v2" | "solana_v2_02" | "unknown";
};

export type WithdrawalSignatureReady = {
  status: "ready";
  retryAfterSeconds: number | null;
  parameters: string[] | null;
  signature: {
    expiresAt?: number | string;
    parameters?: string[];
  } | null;
  expiresAt: number | string | null;
  execution: WithdrawalExecutionHints | null;
  relay: {
    changeNowId: string;
    payinAddress: string;
    payinExtraId: string | null;
    payoutAddress: string;
    payoutExtraId: string | null;
    fromCurrency: string;
    fromNetwork: string;
    toCurrency: string;
    toNetwork: string;
  } | null;
};

export type WithdrawalSignaturePending = {
  status: "pending";
  retryAfterSeconds: number | null;
  execution: WithdrawalExecutionHints | null;
  relay: WithdrawalSignatureReady["relay"];
};

export type WithdrawalSignatureResponse =
  | WithdrawalSignatureReady
  | WithdrawalSignaturePending;

export type PartnerTransaction = {
  transactionId: string;
  type: "spend" | "collateral" | "payment" | "fee";
  status: string;
  amountCents: number;
  currency: string;
  merchantName?: string;
  cardId?: string;
  createdAt: string;
};
