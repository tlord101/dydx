import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import { useAccount } from 'wagmi';
import TradingViewChart from './TradingViewChart';

const TradingDetail = ({ asset, onBack }) => {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const [selectedTimeframe, setSelectedTimeframe] = useState('1h');
  const [activeTab, setActiveTab] = useState('position');
  const [showOrderLines, setShowOrderLines] = useState(true);
  const [showBuySell, setShowBuySell] = useState(true);

  const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

  // Mock stats data
  const stats = [
    { label: 'Volume', value: '$383M' },
    { label: 'Market Cap', value: '$1.74T' },
    { label: 'Open Interest', value: '$31.5M' },
  ];

  return (
    <div className="min-h-screen bg-background text-white">
      {/* Top Bar */}
      <div className="bg-card px-3 py-2">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="p-1 hover:bg-background rounded transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 flex items-center justify-center gap-2">
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: asset.color || '#F7931A' }}
            >
              {asset.icon || '₿'}
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold">{asset.ticker}</div>
              <div className="text-xs text-textGrey">/ USDT MC</div>
            </div>
          </div>
          <div className="w-5" />
        </div>
      </div>

      {/* Price Section */}
      <div className="bg-card px-4 py-3 border-t border-gray-800">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">${asset.price}</span>
          {asset.changePercent && (
            <span className={asset.isPositive === false ? 'text-red-500 text-sm' : 'text-green-500 text-sm'}>
              {asset.changePercent}
            </span>
          )}
        </div>
      </div>

      {/* Chart Controls */}
      <div className="bg-card px-4 py-2 border-t border-gray-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-1 text-textGrey hover:text-white">
            <div className="w-3 h-3 border border-current" />
            <span>Order Lines</span>
            <input 
              type="checkbox" 
              checked={showOrderLines}
              onChange={(e) => setShowOrderLines(e.target.checked)}
              className="ml-1"
            />
          </button>
          <button className="flex items-center gap-1 text-textGrey hover:text-white">
            <span>Buy/Sell</span>
            <input 
              type="checkbox" 
              checked={showBuySell}
              onChange={(e) => setShowBuySell(e.target.checked)}
              className="ml-1"
            />
          </button>
        </div>
        <button className="text-textGrey hover:text-white">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>

      {/* Chart Area with candlestick placeholder */}
      <div className="bg-background relative" style={{ height: '280px' }}>
        <TradingViewChart symbol={asset.ticker} />
      </div>

      {/* Timeframe Selectors */}
      <div className="bg-card px-4 py-2 border-t border-gray-800 flex gap-1 overflow-x-auto">
        {timeframes.map((tf) => (
          <button
            key={tf}
            onClick={() => setSelectedTimeframe(tf)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-all whitespace-nowrap ${
              selectedTimeframe === tf
                ? 'bg-background text-white'
                : 'text-textGrey hover:text-white'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Position/Orders Tabs */}
      <div className="bg-card border-t border-gray-800">
        <div className="flex border-b border-gray-800">
          <button
            onClick={() => setActiveTab('position')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'position'
                ? 'text-white border-b-2 border-white'
                : 'text-textGrey'
            }`}
          >
            Position <span className="ml-1 text-textGrey">None</span>
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'orders'
                ? 'text-white border-b-2 border-white'
                : 'text-textGrey'
            }`}
          >
            Orders
          </button>
        </div>
      </div>

      {/* Details Section */}
      <div className="bg-card px-4 py-4 border-t border-gray-800">
        <h3 className="text-sm font-semibold mb-3">Details</h3>
        <div className="space-y-3">
          {stats.map((stat, index) => (
            <div key={index} className="flex items-center justify-between">
              <span className="text-textGrey text-sm">{stat.label}</span>
              <span className="text-white text-sm font-medium">{stat.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sign in Button */}
      <div className="bg-card px-4 py-4 border-t border-gray-800">
        {isConnected ? (
          <div className="space-y-2">
            <button
              className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Buy {asset.ticker}
            </button>
            <button
              className="w-full bg-red-600 text-white py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Sell {asset.ticker}
            </button>
          </div>
        ) : (
          <button
            onClick={() => open()}
            className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Sign in
          </button>
        )}
      </div>
    </div>
  );
};

export default TradingDetail;
