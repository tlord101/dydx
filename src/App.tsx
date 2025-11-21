import React, { useState } from 'react';
import { ethers } from 'ethers';
import WalletConnect from './components/WalletConnect';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [address, setAddress] = useState<string>('');

  const handleConnect = (provider: ethers.providers.Web3Provider, address: string) => {
    setProvider(provider);
    setAddress(address);
  };

  const handleDisconnect = () => {
    setProvider(null);
    setAddress('');
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1 className="app-title">DeFi Dashboard</h1>
        <WalletConnect onConnect={handleConnect} onDisconnect={handleDisconnect} />
      </header>
      
      <main className="App-main">
        <Dashboard provider={provider} address={address} />
      </main>

      <footer className="App-footer">
        <p>Powered by Ethereum & React</p>
      </footer>
    </div>
  );
}

export default App;
