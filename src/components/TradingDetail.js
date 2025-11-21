import React, { useState } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';

const TradingDetail = ({ asset, onBack }) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState('1h');

  const timeframes = ['1m', '5m', '15m', '1h', '4h'];

  // Mock stats data
  const stats = [
    { label: 'Volume (24h)', value: '$2.45B' },
    { label: 'Market Cap', value: '$1.28T' },
    { label: 'Open Interest', value: '$456.7M' },
  ];

  return (
    <div className="min-h-screen bg-background text-white">
      {/* Top Bar */}
      <div className="bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-background rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="text-lg font-semibold">{asset.name}</h2>
          <div className="w-10" /> {/* Spacer for alignment */}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Asset Icon */}
            <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-lg font-bold">
              {asset.ticker.charAt(0)}
            </div>
            <div>
              <h3 className="font-semibold text-xl">{asset.ticker}</h3>
              <p className="font-mono text-2xl font-bold">${asset.price}</p>
            </div>
          </div>
          <div className={`flex items-center space-x-1 ${
            asset.isPositive ? 'text-green-500' : 'text-red-500'
          }`}>
            {asset.isPositive ? (
              <TrendingUp className="w-5 h-5" />
            ) : (
              <TrendingDown className="w-5 h-5" />
            )}
            <span className="font-mono font-semibold">{asset.changePercent}</span>
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="p-4">
        <div className="bg-card rounded-xl p-6 mb-4" style={{ height: '300px' }}>
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-textGrey mb-2">
                <svg className="w-16 h-16 mx-auto opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-textGrey">Chart Placeholder</p>
              <p className="text-textGrey text-sm mt-1">TradingView Integration</p>
            </div>
          </div>
        </div>

        {/* Timeframe Selectors */}
        <div className="flex space-x-2 mb-6">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf)}
              className={`flex-1 py-2 rounded-lg font-semibold transition-all ${
                selectedTimeframe === tf
                  ? 'bg-primary text-white'
                  : 'bg-card text-textGrey hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-3">
          {stats.map((stat, index) => (
            <div key={index} className="bg-card p-4 rounded-xl">
              <p className="text-textGrey text-sm mb-1">{stat.label}</p>
              <p className="font-mono text-xl font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TradingDetail;
