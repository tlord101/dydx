# dYdX Clone - Functional Trading Platform

A functional clone of the dYdX trading platform with WalletConnect integration via Reown AppKit and TradingView charts.

## Features

- ✅ WalletConnect integration via Reown AppKit
- ✅ Support for MetaMask, Trust Wallet, OKX Wallet, WalletConnect
- ✅ Email & Social login (Google, Apple)
- ✅ Real-time TradingView charts with candlesticks and volume
- ✅ Dark theme matching dYdX design
- ✅ Responsive mobile-first layout
- ✅ Multiple crypto markets (BTC, ETH, XRP, BNB, SOL, TRX)
- ✅ Wallet balance display
- ✅ Trading interface with Buy/Sell options

## Setup

### 1. Install Dependencies

```bash
npm install --legacy-peer-deps
```

### 2. Get Reown Project ID

1. Visit [https://cloud.reown.com](https://cloud.reown.com)
2. Create a new project
3. Copy your Project ID

### 3. Configure Environment

Create a `.env` file in the root directory:

```bash
REACT_APP_REOWN_PROJECT_ID=your_project_id_here
```

Or update the existing `.env` file with your Project ID.

### 4. Run the App

```bash
npm start
```

The app will open at `http://localhost:3000`

## Technologies Used

- **React 19** - UI framework
- **Reown AppKit** (formerly WalletConnect AppKit) - Wallet connection
- **Wagmi** - Ethereum hooks and utilities
- **Viem** - Ethereum library
- **TanStack Query** - Data fetching and caching
- **Lightweight Charts** - TradingView-style charts
- **Tailwind CSS** - Styling
- **Lucide React** - Icons

## Project Structure

```
src/
├── components/
│   ├── Dashboard.js          # Main dashboard with markets
│   ├── TradingDetail.js      # Trading view with charts
│   ├── AuthModal.js          # Authentication modal
│   └── TradingViewChart.js   # Chart component
├── config/
│   └── wagmi.js             # WalletConnect configuration
├── App.js                   # Main app component
└── index.js                 # Entry point
```

## Features Breakdown

### Wallet Connection
- Multiple wallet options (MetaMask, Trust Wallet, OKX, WalletConnect)
- Email and social authentication
- Connected wallet address display
- Balance tracking

### Trading Interface
- Real-time candlestick charts
- Volume indicators
- Multiple timeframes (1m, 5m, 15m, 30m, 1h, 4h, 1d)
- Buy/Sell buttons (when connected)
- Market statistics (Volume, Market Cap, Open Interest)

### Markets
- BTC, ETH, XRP, BNB, SOL, TRX
- Live prices and changes
- Leverage indicators
- Market cap display

## Development

### Adding New Markets

Edit `src/components/Dashboard.js` and add new market objects to the `markets` array:

```javascript
{
  id: 'TOKEN',
  name: 'TOKEN',
  ticker: 'TOKEN',
  leverage: '20x',
  price: '123.45',
  marketCap: '$100M',
  changePercent: '-2.34%',
  isPositive: false,
  color: '#HEXCOLOR',
  icon: 'T'
}
```

### Customizing Appearance

Update `tailwind.config.js` to modify colors:

```javascript
colors: {
  primary: '#6669FF',      // Primary button color
  background: '#101014',   // App background
  card: '#1C1C28',        // Card background
  textGrey: '#888888',    // Secondary text
}
```

## License

MIT
