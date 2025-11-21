# DEX Wallet - Decentralized Exchange Web3 App

A mobile-responsive, high-fidelity UI for a decentralized exchange (DEX) wallet application built with React, Tailwind CSS, and Lucide React icons.

## Features

### 🎨 Design
- **Deep Dark Mode Theme**
  - Background: `#101014`
  - Cards/Elements: `#1C1C28`
  - Primary Action Color: `#6669FF` (Purple/Blue)
  - Text: White and Grey `#888888`
- **Typography**
  - Sans-serif for regular text
  - Monospace for price data (prevents layout shifts)

### 📱 Views

#### 1. Dashboard View
- Total Portfolio Value display
- "Get Started" CTA button (full-width, primary color)
- Markets list showing crypto assets:
  - Bitcoin (BTC)
  - Ethereum (ETH)
  - Solana (SOL)
- Real-time price and 24h percentage change (color-coded: green for positive, red for negative)

#### 2. Trading Detail View
- Asset information header with icon, ticker, price, and 24h change
- Chart area placeholder (ready for TradingView integration)
- Timeframe selectors: 1m, 5m, 15m, 1h, 4h
- Stats grid displaying:
  - Volume (24h)
  - Market Cap
  - Open Interest

#### 3. Auth Modal
- Sign In modal overlay
- **Web2 Options:**
  - Google Sign-In
  - Apple Sign-In
- **Web3 Options:**
  - MetaMask
  - Trust Wallet
  - WalletConnect

## Tech Stack

- **React 18** - UI framework with functional components and Hooks
- **Tailwind CSS 3** - Utility-first CSS framework
- **Lucide React** - Icon library
- **Create React App** - Build tooling

## Getting Started

### Prerequisites
- Node.js 14+ and npm

### Installation

1. Clone the repository:
\`\`\`bash
git clone https://github.com/tlord101/dydx.git
cd dydx
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Start the development server:
\`\`\`bash
npm start
\`\`\`

The app will open at [http://localhost:3000](http://localhost:3000)

### Available Scripts

- \`npm start\` - Runs the app in development mode
- \`npm test\` - Launches the test runner
- \`npm run build\` - Builds the app for production
- \`npm run eject\` - Ejects from Create React App (one-way operation)

## Project Structure

\`\`\`
dydx/
├── public/
│   ├── index.html
│   └── ...
├── src/
│   ├── components/
│   │   ├── Dashboard.js       # Main dashboard view
│   │   ├── TradingDetail.js   # Asset trading detail view
│   │   └── AuthModal.js       # Authentication modal
│   ├── App.js                 # Main app component with routing
│   ├── App.test.js            # App tests
│   ├── index.js               # Entry point
│   └── index.css              # Global styles with Tailwind
├── tailwind.config.js         # Tailwind configuration
├── postcss.config.js          # PostCSS configuration
└── package.json
\`\`\`

## Component Overview

### Dashboard Component
Displays the main portfolio view with market listings. Handles navigation to trading detail views and authentication modal.

### TradingDetail Component
Shows detailed information for a selected cryptocurrency asset with chart placeholder and statistical data.

### AuthModal Component
Provides authentication options through Web2 social logins and Web3 wallet connections.

## Responsive Design

The application is fully responsive and optimized for:
- 📱 Mobile devices (375px width)
- 📱 Tablets (768px width)
- 💻 Desktop screens

## Mock Data

The application uses mock data for demonstration purposes:
- Cryptocurrency prices
- 24h price changes
- Volume, Market Cap, and Open Interest statistics

In a production environment, these would be replaced with real-time data from cryptocurrency APIs.

## Future Enhancements

- [ ] Integrate real cryptocurrency price APIs
- [ ] Add TradingView chart integration
- [ ] Implement actual Web2/Web3 authentication flows
- [ ] Add trading functionality
- [ ] Implement wallet connection logic
- [ ] Add transaction history
- [ ] Support for more cryptocurrencies

## License

This project is open source and available under the MIT License.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
