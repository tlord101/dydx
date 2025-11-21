import React, { useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './components/Dashboard';
import TradingDetail from './components/TradingDetail';
import AuthModal from './components/AuthModal';
import { wagmiAdapter, queryClient } from './config/wagmi';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleAssetClick = (asset) => {
    setSelectedAsset(asset);
    setCurrentView('trading');
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    setSelectedAsset(null);
  };

  const handleAuthClick = () => {
    setIsAuthModalOpen(true);
  };

  const handleCloseAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <div className="App">
          {currentView === 'dashboard' ? (
            <Dashboard 
              onAssetClick={handleAssetClick}
              onAuthClick={handleAuthClick}
            />
          ) : (
            <TradingDetail 
              asset={selectedAsset}
              onBack={handleBackToDashboard}
            />
          )}
          
          <AuthModal 
            isOpen={isAuthModalOpen}
            onClose={handleCloseAuthModal}
          />
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
