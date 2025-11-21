import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './WalletConnect.css';

interface WalletConnectProps {
  onConnect: (provider: ethers.providers.Web3Provider, address: string) => void;
  onDisconnect: () => void;
}

const WalletConnect: React.FC<WalletConnectProps> = ({ onConnect, onDisconnect }) => {
  const [address, setAddress] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const checkIfWalletIsConnected = async () => {
      try {
        const { ethereum } = window;
        if (!ethereum) {
          console.log('Make sure you have MetaMask installed!');
          return;
        }

        const accounts = await ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          const provider = new ethers.providers.Web3Provider(ethereum);
          setAddress(accounts[0]);
          onConnect(provider, accounts[0]);
        }
      } catch (err) {
        console.error(err);
      }
    };

    checkIfWalletIsConnected();
  }, [onConnect]);

  const connectWallet = async () => {
    try {
      setIsConnecting(true);
      setError('');
      
      const { ethereum } = window;
      if (!ethereum) {
        setError('Please install MetaMask!');
        setIsConnecting(false);
        return;
      }

      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.providers.Web3Provider(ethereum);
      
      setAddress(accounts[0]);
      onConnect(provider, accounts[0]);
      setIsConnecting(false);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAddress('');
    onDisconnect();
  };

  const formatAddress = (addr: string) => {
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  return (
    <div className="wallet-connect">
      {!address ? (
        <button 
          onClick={connectWallet} 
          disabled={isConnecting}
          className="connect-button"
        >
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      ) : (
        <div className="wallet-info">
          <span className="address">{formatAddress(address)}</span>
          <button onClick={disconnectWallet} className="disconnect-button">
            Disconnect
          </button>
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
};

export default WalletConnect;
