# Crossmint + Machines Cards Demo

Minimal reference app for integrators that use Crossmint wallets/auth and want to enable Machines cards through `/partner/v1` APIs.

This example is intentionally small and self-contained (outside `/apps`) and uses a single embedded wallet flow.

## What this demo covers

- Crossmint email auth and embedded wallet creation.
- Partner session bootstrap through a minimal server route (`/api/partner/session`).
- KYC schema + sample-fill + submit flow.
- Card lifecycle: list, create, lock/unlock, reveal, delete.
- Funding: deposits (`assets`, `range`, `estimate`, `create`).
- Withdrawals with a simplified 3-input flow.
- Activity and identity views.

## Directory map

```text
examples/crossmint-machines-cards
├── app/
│   ├── api/
│   │   └── partner/session/route.ts
│   ├── {accounts,activity,identity,kyc,withdrawals}/page.tsx
│   └── providers-client.tsx
├── src/
│   ├── components/machines/*
│   ├── lib/{crossmint,server}/*
│   ├── lib/machines-partner-client.ts
│   └── state/demo-session-provider.tsx
└── tests/{unit,integration}/*
```

## Environment

Copy `.env.example` to `.env.local`.

### Client vars

- `NEXT_PUBLIC_CROSSMINT_API_KEY`
- `NEXT_PUBLIC_CROSSMINT_EVM_CHAIN` (default `base-sepolia`)
- `NEXT_PUBLIC_MACHINES_PARTNER_BASE_URL` (optional override; default is same-origin `/api/partner/proxy`)
- `NEXT_PUBLIC_EVM_SOURCE_CHAIN_ID` (default `84532`)
- `NEXT_PUBLIC_EVM_RUSD_TOKEN` (default sandbox rUSD on Base Sepolia)
- `NEXT_PUBLIC_DEMO_AUTOFUND_TESTNET` (`true` enables testnet autofund on create deposit)
- `NEXT_PUBLIC_DEMO_AUTOFUND_SERVER_FALLBACK` (`true` enables server fallback if embedded autofund fails; default `false`)

### Server vars

- `MACHINES_PARTNER_BASE_URL`
- `MACHINES_PARTNER_API_KEY`
- `MACHINES_PARTNER_DEFAULT_SCOPES`
- `MACHINES_PARTNER_EXTERNAL_USER_PREFIX` (optional)
- `DEV_RUSD_AUTOFUND_ENABLED` (`true` to enable deposit autofund in development)
- `DEV_RUSD_CHAIN_ID` (default `84532`)
- `DEV_RUSD_RPC_URL` (Base Sepolia RPC)
- `DEV_RUSD_TOKEN_ADDRESS` (sandbox rUSD token)
- `DEV_RUSD_MINTER_PRIVATE_KEY` (dev-only key used to mint + transfer rUSD)

### Development autofund behavior

When all of these are true:

- `NEXT_PUBLIC_DEMO_AUTOFUND_TESTNET=true`
- deposit network is `base`
- source chain is Base Sepolia (`84532`)

then clicking `create deposit` will also:

1. call `mint(100)` on the sandbox rUSD contract from the user's Crossmint embedded EVM wallet
2. transfer `100 rUSD` to the current user's EVM wallet (if needed)

Optional server fallback:

- If you set `NEXT_PUBLIC_DEMO_AUTOFUND_SERVER_FALLBACK=true`, the app can fallback to `/api/dev/autofund-rusd`.
- That route requires:
  - `DEV_RUSD_AUTOFUND_ENABLED=true`
  - `DEV_RUSD_MINTER_PRIVATE_KEY`
  - Base Sepolia RPC + token config (`DEV_RUSD_RPC_URL`, `DEV_RUSD_TOKEN_ADDRESS`).

This is development-only and is blocked in production.

## Run

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Build and tests

```bash
npm run build
npm test
```

## Security notes

- Never expose partner API keys in browser code.
- Never use production private keys for any local demo autofund flow.
- For production, move all privileged signing/funding flows behind hardened backend services with strict auth/audit controls.

## Related docs

- Crossmint integration guide draft: `docs/b2b/crossmint-wallet-extension-credit-cards.md`
- AI companion spec: `docs/b2b/crossmint-wallet-extension-credit-cards.ai.yaml`
