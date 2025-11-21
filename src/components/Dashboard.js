import React from 'react';
import { Menu } from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import { useAccount, useDisconnect, useBalance } from 'wagmi';

const Dashboard = ({ onAssetClick, onAuthClick }) => {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({
    address: address,
  });
  // Mock data for crypto assets matching the screenshot
  const markets = [
    {
      id: 'BTC',
      name: 'BTC',
      ticker: 'BTC',
      leverage: '50x',
      price: '87,173',
      marketCap: '$1.74T',
      changePercent: '-5.43%',
      isPositive: false,
      color: '#F7931A',
      icon: '₿'
    },
    {
      id: 'ETH',
      name: 'ETH',
      ticker: 'ETH',
      leverage: '50x',
      price: '2,862.9',
      marketCap: '$344B',
      changePercent: '-5.71%',
      isPositive: false,
      color: '#627EEA',
      icon: 'Ξ'
    },
    {
      id: 'XRP',
      name: 'XRP',
      ticker: 'XRP',
      leverage: '10x',
      price: '2.0901',
      marketCap: '$122B',
      changePercent: '-4.05%',
      isPositive: false,
      color: '#23292F',
      icon: 'X'
    },
    {
      id: 'BNB',
      name: 'BNB',
      ticker: 'BNB',
      leverage: '10x',
      price: '869.8',
      marketCap: '$120B',
      changePercent: '',
      isPositive: null,
      color: '#F3BA2F',
      icon: 'B'
    },
    {
      id: 'SOL',
      name: 'SOL',
      ticker: 'SOL',
      leverage: '20x',
      price: '134.16',
      marketCap: '$75.2B',
      changePercent: '-3.33%',
      isPositive: false,
      color: '#14F195',
      icon: 'S'
    },
    {
      id: 'TRX',
      name: 'TRX',
      ticker: 'TRX',
      leverage: '10x',
      price: '0.28089',
      marketCap: '',
      changePercent: '',
      isPositive: null,
      color: '#EB0029',
      icon: 'T'
    },
  ];

  const formatPrice = (price) => {
    if (price.includes('.')) {
      return `$${price}`;
    }
    return `$${price}`;
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const portfolioValue = balance 
    ? `$${(parseFloat(balance.formatted) * 2000).toFixed(2)}` // Mock conversion
    : '$0.00';

  return (
    <div className="min-h-screen bg-background text-white">
      {/* Header */}
      <div className="flex items-start justify-between p-4 mb-4">
        <div>
          <h1 className="text-3xl font-semibold mb-1">{portfolioValue}</h1>
          <p className="text-sm" style={{ color: '#00D395' }}>0.00%</p>
        </div>
        <button 
          onClick={() => isConnected ? open() : null}
          className="p-2 hover:bg-card rounded-lg transition-colors"
        >
          {isConnected ? (
            <div className="flex items-center gap-2 bg-card px-3 py-2 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-sm">{formatAddress(address)}</span>
            </div>
          ) : (
            <Menu className="w-6 h-6" />
          )}
        </button>
      </div>

      <div className="px-4">
        <p className="text-textGrey text-sm text-center mb-4">
          {isConnected ? 'You have no funds on dYdX.' : 'You have no funds on dYdX.'}
        </p>

        {/* Get Started Button */}
        <button
          onClick={isConnected ? () => open() : onAuthClick}
          className="w-full bg-primary text-white py-3.5 rounded-lg font-medium text-base mb-6 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          {isConnected ? 'Manage Wallet' : 'Get started'}
          <span>→</span>
        </button>

        {/* Markets Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Markets</h3>
            <div className="flex items-center gap-2 text-sm text-textGrey">
              <span>Market Cap</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          <div className="space-y-0 divide-y divide-gray-800">
            {markets.map((asset) => (
              <div
                key={asset.id}
                onClick={() => onAssetClick(asset)}
                className="py-3 cursor-pointer hover:bg-card hover:bg-opacity-30 transition-all px-2 -mx-2 rounded"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Asset Icon */}
                    <div 
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-lg"
                      style={{ backgroundColor: asset.color }}
                    >
                      {asset.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{asset.name}</span>
                        <span className="text-xs px-1.5 py-0.5 bg-gray-700 rounded text-textGrey">{asset.leverage}</span>
                      </div>
                      <p className="text-textGrey text-xs mt-0.5">Market {asset.marketCap}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-white">{formatPrice(asset.price)}</p>
                    {asset.changePercent && (
                      <p className={`text-xs mt-0.5 ${
                        asset.isPositive ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {asset.changePercent}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search Footer */}
        <div className="mt-6 mb-4">
          <div className="flex items-center gap-2 text-textGrey bg-card rounded-lg px-4 py-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Search..." 
              className="bg-transparent outline-none flex-1 text-white placeholder-textGrey"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
