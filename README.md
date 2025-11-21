# DeFi Dashboard

A decentralized finance (DeFi) dashboard application built with React and TypeScript. This application allows users to connect their Ethereum wallets and view their portfolio information.

## Features

- 🔐 **Wallet Connection**: Connect to MetaMask or other Web3 wallets
- 💰 **Balance Display**: View your ETH balance in real-time
- 🌐 **Network Detection**: Automatically detects which Ethereum network you're connected to
- 📊 **DeFi Features Overview**: Interface showcasing DeFi capabilities (Swap, Stake, Pool, Lend)
- 🎨 **Modern UI**: Beautiful gradient design with smooth animations

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- MetaMask browser extension (for wallet connectivity)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/tlord101/dydx.git
cd dydx
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Connect Wallet**: Click the "Connect Wallet" button in the header
2. **Approve Connection**: Approve the connection request in your MetaMask extension
3. **View Dashboard**: Once connected, you'll see your wallet balance, network, and address
4. **Explore Features**: Browse the available DeFi features (currently for display)

## Technologies Used

- **React 19**: Frontend framework
- **TypeScript**: Type-safe JavaScript
- **ethers.js**: Ethereum wallet implementation and blockchain interaction
- **Create React App**: Project bootstrapping and build tooling

## Project Structure

```
dydx/
├── public/              # Static files
├── src/
│   ├── components/      # React components
│   │   ├── WalletConnect.tsx    # Wallet connection component
│   │   ├── WalletConnect.css
│   │   ├── Dashboard.tsx        # Main dashboard component
│   │   └── Dashboard.css
│   ├── App.tsx          # Main App component
│   ├── App.css
│   ├── index.tsx        # Application entry point
│   └── index.css
├── package.json
└── README.md
```

## Available Scripts

### `npm start`
Runs the app in development mode. Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### `npm test`
Launches the test runner in interactive watch mode.

### `npm run build`
Builds the app for production to the `build` folder.

## Supported Networks

- Ethereum Mainnet
- Ethereum Testnets (Goerli, Sepolia)
- Polygon Mainnet & Mumbai Testnet
- Binance Smart Chain Mainnet & Testnet
- And other EVM-compatible networks

## Future Enhancements

- Token swap functionality
- Staking interface
- Liquidity pool management
- Lending/borrowing features
- Transaction history
- Multi-token portfolio tracking
- Price charts and analytics

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
