# EIP-2612 Permit Demo DApp

A highly secure, educational React DApp demonstrating the EIP-2612 permit function flow with mandatory security warnings before cryptographic signature requests.

## 🎯 Project Overview

This single-file React application showcases gasless token approvals using the EIP-2612 standard, with a strong emphasis on user consent and security education.

## ✨ Features

- **EIP-2612 Permit Implementation** - Gasless token approval signatures
- **Reown AppKit Integration** - WalletConnect v2 protocol for wallet connections
- **Mandatory Security Warnings** - Critical alerts before signature requests
- **Unlimited Approval Demo** - Uses `MaxUint256` for educational purposes
- **Sepolia Testnet** - Safe testing environment
- **Modern UI** - Tailwind CSS with gradient designs

## 🔒 Security Flow

1. **User clicks "Sign Unlimited Permit"**
2. **Custom JavaScript `confirm()` warning displays:**
   - Shows exact spender address
   - Explains unlimited approval risks
   - Requires explicit user consent
3. **EIP-712 signature request** - Only proceeds if user accepts warning
4. **Permit transaction submission** - Final on-chain transaction

## 🛠️ Tech Stack

- **React 19** - Functional components with Hooks
- **Ethers.js v6** - Blockchain interactions and EIP-712 signing
- **Reown AppKit** - Wallet connection (WalletConnect v2)
- **Tailwind CSS 3** - Responsive, modern styling
- **React Scripts** - Create React App tooling

## 📋 Configuration Required

Before running, update these constants in `src/App.jsx`:

```javascript
const WALLETCONNECT_PROJECT_ID = 'YOUR_REOWN_PROJECT_ID'; // Get from reown.com
const TOKEN_CONTRACT_ADDRESS = '0x1234...'; // ERC-20 Permit token on Sepolia
const SPENDER_ADDRESS = '0xRecipient...'; // Address receiving approval
const TOKEN_SYMBOL = 'USDC'; // Your token symbol
```

## 🚀 Getting Started

### Installation

```bash
npm install
```

### Run Development Server

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm build
```

## 📁 Project Structure

```
dydx/
├── public/
│   ├── index.html
│   ├── manifest.json
│   └── robots.txt
├── src/
│   ├── App.jsx          # Main single-file DApp component
│   ├── index.js         # React entry point
│   └── index.css        # Tailwind CSS imports
├── package.json
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

## 🧪 How It Works

### EIP-2612 Permit Flow

1. **Connect Wallet** - User connects via Reown AppKit
2. **Fetch Token Data** - Retrieves token name, nonce, chainId
3. **Create EIP-712 Typed Data:**
   ```javascript
   {
     domain: { name, version, chainId, verifyingContract },
     types: { Permit: [...] },
     value: { owner, spender, value: MaxUint256, nonce, deadline }
   }
   ```
4. **Sign Typed Data** - `signer.signTypedData(domain, types, value)`
5. **Split Signature** - Extract `v`, `r`, `s` components
6. **Submit Permit** - Call `token.permit(owner, spender, value, deadline, v, r, s)`

## ⚠️ Security Warnings

This DApp demonstrates **UNLIMITED approvals** for educational purposes. In production:

- ✅ Use specific approval amounts instead of `MaxUint256`
- ✅ Implement approval expiry deadlines
- ✅ Add revocation functionality
- ✅ Display current allowances to users
- ✅ Audit all smart contracts

## 📚 Resources

- [EIP-2612: Permit Extension for EIP-20](https://eips.ethereum.org/EIPS/eip-2612)
- [EIP-712: Typed Structured Data](https://eips.ethereum.org/EIPS/eip-712)
- [Reown AppKit Documentation](https://docs.reown.com/appkit/overview)
- [Ethers.js Documentation](https://docs.ethers.org/)

## 📄 License

MIT License - Educational purposes only

## ⚠️ Disclaimer

This is an educational demonstration. Always audit smart contracts and understand the security implications of token approvals before using in production.
