# dydx server

Small Express backend to read saved Permit2 signatures from Firebase Realtime Database and submit on‑chain transactions.

Prereqs
- Node 18+
- A Firebase project with the Realtime Database used by the frontend
- An RPC URL (Infura/Alchemy/other) and the private key for the spender account (this account pays gas and receives funds)

Setup

1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies and start:

```bash
cd server
npm install
npm start
```

Endpoints
- `GET /permit/:owner` — read permit JSON saved by the frontend
- `POST /submit/:owner` — verify signature and submit Permit2 `permit(...)` + `transferFrom(...)` using the configured spender wallet

Notes
- Verify the Permit2 ABI and method names match the deployment you target. Adjust `server/index.js` if method names or argument shapes differ.
- Keep `SPENDER_PRIVATE_KEY` secret; prefer using a secret manager in production.
