import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './Dashboard.css';

interface DashboardProps {
  provider: ethers.providers.Web3Provider | null;
  address: string;
}

const Dashboard: React.FC<DashboardProps> = ({ provider, address }) => {
  const [balance, setBalance] = useState<string>('0.0');
  const [network, setNetwork] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWalletData = async () => {
      if (!provider || !address) return;

      try {
        setLoading(true);
        
        // Get balance
        const balance = await provider.getBalance(address);
        setBalance(ethers.utils.formatEther(balance));

        // Get network
        const network = await provider.getNetwork();
        setNetwork(getNetworkName(network.chainId));

        setLoading(false);
      } catch (err) {
        console.error('Error fetching wallet data:', err);
        setLoading(false);
      }
    };

    if (provider && address) {
      fetchWalletData();
    }
  }, [provider, address]);

  const getNetworkName = (chainId: number): string => {
    const networks: { [key: number]: string } = {
      1: 'Ethereum Mainnet',
      3: 'Ropsten Testnet',
      4: 'Rinkeby Testnet',
      5: 'Goerli Testnet',
      11155111: 'Sepolia Testnet',
      137: 'Polygon Mainnet',
      80001: 'Mumbai Testnet',
      56: 'BSC Mainnet',
      97: 'BSC Testnet',
    };
    return networks[chainId] || `Chain ID: ${chainId}`;
  };

  if (!provider || !address) {
    return (
      <div className="dashboard">
        <div className="welcome-message">
          <h2>Welcome to DeFi Dashboard</h2>
          <p>Connect your wallet to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h2>Your DeFi Dashboard</h2>
      
      {loading ? (
        <div className="loading">Loading wallet data...</div>
      ) : (
        <div className="dashboard-grid">
          <div className="info-card">
            <div className="card-header">
              <span className="card-icon">💰</span>
              <h3>Balance</h3>
            </div>
            <div className="card-value">
              {parseFloat(balance).toFixed(4)} ETH
            </div>
          </div>

          <div className="info-card">
            <div className="card-header">
              <span className="card-icon">🌐</span>
              <h3>Network</h3>
            </div>
            <div className="card-value network">
              {network}
            </div>
          </div>

          <div className="info-card">
            <div className="card-header">
              <span className="card-icon">📍</span>
              <h3>Address</h3>
            </div>
            <div className="card-value address">
              {address.substring(0, 10)}...{address.substring(address.length - 8)}
            </div>
          </div>
        </div>
      )}

      <div className="features">
        <h3>DeFi Features</h3>
        <div className="feature-grid">
          <div className="feature-card">
            <span className="feature-icon">💱</span>
            <h4>Swap</h4>
            <p>Exchange tokens instantly</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">🏦</span>
            <h4>Stake</h4>
            <p>Earn rewards on your assets</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">📊</span>
            <h4>Pool</h4>
            <p>Provide liquidity and earn fees</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">💸</span>
            <h4>Lend</h4>
            <p>Lend assets and earn interest</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
