import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import TradingDetail from './components/TradingDetail';
import AuthModal from './components/AuthModal';

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
  );
}

export default App;
