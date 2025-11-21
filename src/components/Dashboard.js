import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const Dashboard = ({ onAssetClick, onAuthClick }) => {
  // Mock data for crypto assets
  const markets = [
    {
      id: 'BTC',
      name: 'Bitcoin',
      ticker: 'BTC',
      price: '67,234.50',
      change: '+2.45',
      changePercent: '+3.78%',
      isPositive: true,
    },
    {
      id: 'ETH',
      name: 'Ethereum',
      ticker: 'ETH',
      price: '3,456.78',
      change: '-45.23',
      changePercent: '-1.29%',
      isPositive: false,
    },
    {
      id: 'SOL',
      name: 'Solana',
      ticker: 'SOL',
      price: '98.45',
      change: '+5.67',
      changePercent: '+6.11%',
      isPositive: true,
    },
  ];

  return (
    <div className="min-h-screen bg-background text-white">
      {/* Header */}
      <div className="p-6">
        <div className="mb-8">
          <h2 className="text-textGrey text-sm mb-2">Total Portfolio Value</h2>
          <h1 className="text-4xl font-mono">$0.00</h1>
        </div>

        {/* Get Started Button */}
        <button
          onClick={onAuthClick}
          className="w-full bg-primary text-white py-4 rounded-xl font-semibold text-lg mb-8 hover:opacity-90 transition-opacity"
        >
          Get Started
        </button>

        {/* Markets Section */}
        <div>
          <h3 className="text-xl font-semibold mb-4">Markets</h3>
          <div className="space-y-3">
            {markets.map((asset) => (
              <div
                key={asset.id}
                onClick={() => onAssetClick(asset)}
                className="bg-card p-4 rounded-xl cursor-pointer hover:bg-opacity-80 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {/* Asset Icon Placeholder */}
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-sm font-bold">
                      {asset.ticker.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-semibold">{asset.name}</h4>
                      <p className="text-textGrey text-sm">{asset.ticker}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold">${asset.price}</p>
                    <div className={`flex items-center justify-end space-x-1 text-sm ${
                      asset.isPositive ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {asset.isPositive ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                      <span className="font-mono">{asset.changePercent}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
