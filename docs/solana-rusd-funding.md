# Solana Devnet rUSD Funding Runbook (mint-rusd-solana)

This runbook funds a Solana collateral flow for the Crossmint + Machines demo.

It uses the required mint helper repo:
[SignifyHQ/mint-rusd-solana](https://github.com/SignifyHQ/mint-rusd-solana)

## Scope

- Network: Solana devnet (`901`)
- Goal: mint devnet rUSD, then transfer it to the user contract `depositAddress`
- Outcome: user can run Solana withdrawal tests in this demo

## Prerequisites

1. Node.js installed.
2. A devnet Solana wallet with some SOL for gas.
3. User has completed KYC and has a Solana collateral contract.
4. You can read the user contract/deposit address from your issuer backend APIs.

## 1) Mint rUSD to your signer wallet

```bash
git clone https://github.com/SignifyHQ/mint-rusd-solana.git
cd mint-rusd-solana
npm i
```

Create `.env` in that repo:

```bash
RPC_URL=https://api.devnet.solana.com
SECRET_KEY=<base58_secret_key_for_devnet_wallet>
AMOUNT=1000000000
```

Notes:

- `AMOUNT` is in token base units (6 decimals).
- `1000000000` means `1000` rUSD.

Run mint script:

```bash
npm run airdrop:rusd
```

If you need SOL for gas first, follow the optional SOL-airdrop helper in that repo README.

## 2) Resolve target `depositAddress`

Use your backend flow to fetch the approved user's Solana collateral contract and copy `depositAddress`.

Minimum required fields:

- `chainId = 901`
- `depositAddress`
- `token mint` you are funding

## 3) Transfer minted rUSD into collateral

Transfer from your devnet wallet to the contract `depositAddress`.

Options:

1. Use your existing internal transfer tool/wallet flow.
2. Use a small script with `@solana/web3.js` + `@solana/spl-token`.

Safety checks before transfer:

- Wallet network is devnet.
- Recipient is the exact contract `depositAddress` for this user.
- Mint address matches the intended devnet rUSD token.

## 4) Verify funding landed

In demo app (`/accounts`):

1. Click `refresh`.
2. Confirm spending power / balances moved.
3. Continue with `/withdrawals` quote + create + execute flows.

## 5) Troubleshooting

- `insufficient funds`: top up SOL in signer wallet.
- `invalid account owner` / token account errors: ensure recipient token account setup is correct.
- No balance change in app: verify correct user contract and chain (`901`).
- Signature pending in withdrawals: retry after `retryAfterSeconds`.

## Security

- Use dedicated sandbox keys only.
- Never commit private keys.
- Never reuse this runbook directly for production signing flows.
