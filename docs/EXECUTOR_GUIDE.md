# Executor/Admin System Architecture

## Overview
The executor system is fully configured for **Sepolia Testnet** and works in sync with the frontend.

## How It Works

### 1. Frontend → Signature Generation (Testnet)
```
User's Browser (Sepolia Testnet)
    ↓
Connects Wallet (MetaMask, WalletConnect, etc.)
    ↓
Checks Balance: ETH + USDT on Sepolia
    ↓
Signs Permit2 Message
    ↓
Saves to Firestore: {
    owner: "0xUser...",
    token: "0xaA8E23Fb...", // Sepolia USDT
    amount: "10000000000",
    deadline: 1234567890,
    nonce: 0,
    r: "0x...",
    s: "0x...",
    v: 27,
    processed: false
}
```

### 2. Firestore → Database Storage
```
Firestore Collection: "permit2_signatures"
    │
    ├─ Document 1: { owner, token, amount, r, s, v, processed: false }
    ├─ Document 2: { ... }
    └─ Document 3: { ... }
```

### 3. Backend Worker → Monitoring (Testnet)
```
Backend Worker Process (Node.js)
    ↓
1. Initialize:
   - Connect to Firestore
   - Load executor private key
   - Connect to Sepolia RPC: https://rpc.sepolia.org
   - Initialize Sepolia contracts:
     * Permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3
     * Universal Router: 0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD
    ↓
2. Poll Firestore (every few seconds):
   - Query: WHERE processed == false
   - Limit: 10 documents per batch
    ↓
3. Validate Each Signature:
   - Check required fields exist
   - Verify deadline not expired
   - Check executor has ETH for gas (min 0.001 ETH)
   - Check user's token balance
    ↓
4. Build Transaction:
   - Command 0x02: PERMIT2_PERMIT (validates signature)
   - Command 0x08: V3_SWAP_EXACT_IN (swap tokens)
   - Path: USDT → WETH (Sepolia addresses)
   - Recipient: Executor address
    ↓
5. Execute on Sepolia:
   - Sign transaction with executor private key
   - Submit to Sepolia network
   - Wait for confirmation
    ↓
6. Update Firestore:
   - Set processed: true
   - Add txHash, timestamp
   - Log any errors
```

### 4. Admin Dashboard → Monitoring UI
```
Admin Panel (/admin)
    ↓
Displays:
├─ All Signatures (grouped by wallet)
├─ Executor Balance (Sepolia ETH)
├─ Token Balances (Sepolia tokens)
├─ Processing Status
└─ Manual Execute Button

Real-time Updates via Firestore Listeners
```

## Testnet Configuration Details

### Frontend (User-facing)
- **Network**: Sepolia (Chain ID: 11155111)
- **Connects via**: Reown AppKit
- **USDT Address**: `0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0`
- **Checks Balance**: ETH + USDT on Sepolia
- **Minimum**: $50 USD equivalent

### Backend (Executor)
- **Network**: Sepolia (Chain ID: 11155111)
- **RPC URL**: `https://rpc.sepolia.org`
- **Universal Router**: `0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD`
- **Output Token (WETH)**: `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`
- **Executor Wallet**: Must have Sepolia ETH for gas

## Security Model

### Executor Wallet
```
Executor Private Key (Stored in functions/.env)
    ↓
Controls Wallet: 0xb1f02c288ae...  (testnet)
    ↓
Needs: Sepolia ETH for gas fees only
    ↓
Does NOT need: User's tokens
    ↓
Why? Permit2 allows executor to transfer on behalf of user
```

### Permission Flow
```
User Signs Permit2
    ↓
Gives permission to Executor address
    ↓
Executor can call Permit2.permitTransferFrom()
    ↓
Transfers user's tokens using valid signature
    ↓
No pre-approval needed!
```

## Getting Testnet Funds

### For Users (Frontend Testing):
1. Get Sepolia ETH: https://sepoliafaucet.com/
2. Get Sepolia USDT: 
   - Use a DEX/faucet
   - Or send from another wallet

### For Executor (Backend):
1. Get Sepolia ETH: https://sepoliafaucet.com/
2. Need at least 0.001 ETH for gas
3. Recommend 0.1 ETH for multiple transactions

## Common Issues & Solutions

### Issue: "Insufficient Balance" on Frontend
- **Cause**: User wallet doesn't have $50 worth of ETH + USDT on Sepolia
- **Solution**: Get more testnet funds from faucet

### Issue: "Insufficient ETH in executor wallet"
- **Cause**: Executor wallet ran out of gas fees
- **Solution**: Send more Sepolia ETH to executor address

### Issue: "Signature deadline expired"
- **Cause**: Too much time passed between signing and execution
- **Solution**: Signatures are valid for 30 days, re-sign if expired

### Issue: "Transaction failed on-chain"
- **Cause**: Various (gas price, nonce, contract revert)
- **Solution**: Check transaction hash on Sepolia Etherscan

## Monitoring & Debugging

### Check Executor Status:
```bash
# In backend directory
cd functions

# Check if worker is running
ps aux | grep worker.js

# View logs
npm start
```

### Check Firestore:
- Go to Firebase Console
- Navigate to Firestore Database
- Check `permit2_signatures` collection
- Look for `processed: false` documents

### Check On-Chain (Sepolia):
- Etherscan: https://sepolia.etherscan.io/
- Check executor address for transactions
- Verify token balances
- Check gas usage

## Production Checklist

Before deploying to mainnet:

- [ ] Test thoroughly on Sepolia testnet
- [ ] Frontend: Change network to `mainnet`
- [ ] Frontend: Update USDT address to mainnet
- [ ] Backend: Update RPC to mainnet endpoint
- [ ] Backend: Update executor address/key to mainnet wallet
- [ ] Backend: Update Universal Router to mainnet address
- [ ] Backend: Update output token to mainnet WETH
- [ ] Secure all private keys (use secrets manager)
- [ ] Fund executor with mainnet ETH
- [ ] Set up monitoring and alerts
- [ ] Test with small amounts first
- [ ] Have emergency stop mechanism ready
