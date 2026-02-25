# Crossmint Wallets + Machines Quickstart

Minimal reference app for teams using Crossmint wallets/auth and adding Machines cards through `/partner/v1`.

## Introduction

This quickstart shows a complete end-user flow:

- Sign in with Crossmint email auth
- Create a Machines partner session
- Complete KYC + terms
- Create and manage virtual cards
- Add funds and submit withdrawals

The app is intentionally compact so integrators can copy patterns quickly.

## Deploy

Deploy to Vercel and configure environment variables in the project settings.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmachines-cash%2Fcrossmint-machines-cards-example)

## Setup

1. Clone and install:

```bash
git clone https://github.com/machines-cash/crossmint-machines-cards-example.git
cd crossmint-machines-cards-example
npm install
```

2. Create local env file:

```bash
cp .env.example .env.local
```

3. Fill required variables:

- `NEXT_PUBLIC_CROSSMINT_API_KEY`
- `MACHINES_PARTNER_BASE_URL`
- `MACHINES_PARTNER_API_KEY`

4. Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Reference

### Client

- `NEXT_PUBLIC_CROSSMINT_API_KEY`
- `NEXT_PUBLIC_CROSSMINT_EVM_CHAIN` (default: `base-sepolia`)
- `NEXT_PUBLIC_MACHINES_PARTNER_BASE_URL` (optional override; default: `/api/partner/proxy`)
- `NEXT_PUBLIC_EVM_SOURCE_CHAIN_ID` (default: `84532`)
- `NEXT_PUBLIC_EVM_RUSD_TOKEN` (default: sandbox rUSD on Base Sepolia)
- `NEXT_PUBLIC_DEMO_AUTOFUND_TESTNET` (`true` enables dev autofund on create deposit)
- `NEXT_PUBLIC_DEMO_AUTOFUND_SERVER_FALLBACK` (`true` enables server fallback autofund route)

### Server

- `MACHINES_PARTNER_BASE_URL`
- `MACHINES_PARTNER_API_KEY`
- `MACHINES_PARTNER_DEFAULT_SCOPES`
- `MACHINES_PARTNER_EXTERNAL_USER_PREFIX` (optional)
- `DEV_RUSD_AUTOFUND_ENABLED`
- `DEV_RUSD_CHAIN_ID`
- `DEV_RUSD_RPC_URL`
- `DEV_RUSD_TOKEN_ADDRESS`
- `DEV_RUSD_MINTER_PRIVATE_KEY`

## Build and Tests

```bash
npm run build
npm test
```

## Security Notes

- Keep partner keys server-side only.
- Do not commit live keys.
- Do not use production private keys in dev autofund.
- Use staging/dev first, then production rollout.

## Related Docs

- `docs/b2b/crossmint-wallet-extension-credit-cards.md`
- `docs/b2b/crossmint-wallet-extension-credit-cards.ai.yaml`
