import React, { useState, useEffect } from 'react';
import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { sepolia } from '@reown/appkit/networks';
import { BrowserProvider, Contract, MaxUint256 } from 'ethers';

// ============================================================================
// PLACEHOLDER CONSTANTS - REPLACE WITH ACTUAL VALUES
// ============================================================================
const WALLETCONNECT_PROJECT_ID = 'YOUR_REOWN_PROJECT_ID';
const TOKEN_CONTRACT_ADDRESS = '0x1234567890123456789012345678901234567890';
const SPENDER_ADDRESS = '0xRecipientWalletAddress';
const TOKEN_SYMBOL = 'USDC'; // Update based on your token

// Minimal ERC-20 Permit ABI
const TOKEN_ABI = [
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function nonces(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)',
];

// ============================================================================
// REOWN APPKIT CONFIGURATION
// ============================================================================
const metadata = {
  name: 'EIP-2612 Permit Demo',
  description: 'Educational DApp demonstrating gasless approvals with EIP-2612',
  url: 'https://permit-demo.example.com',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

// Initialize AppKit
const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [sepolia],
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
You are about to sign a gas-free message that cryptographically authorizes the Spender Contract Address (${SPENDER_ADDRESS}) to move ALL of your ${TOKEN_SYMBOL} assets, now and permanently, until you manually revoke this permission.

If this DApp were malicious or hacked, your entire balance of this token could be drained without any further wallet prompts.

⚠️ THIS IS AN UNLIMITED, PERMANENT APPROVAL ⚠️

Only proceed if you fully understand and accept this permanent risk.

Click OK to continue with signing, or Cancel to abort.`;

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

      // ========================================================================
      // TOKEN CONTRACT INTERACTION
      // ========================================================================
      const tokenContract = new Contract(TOKEN_CONTRACT_ADDRESS, TOKEN_ABI, provider);

      // Fetch required data for EIP-712 signature
      const [tokenName, nonce, chainId] = await Promise.all([
        tokenContract.name(),
        tokenContract.nonces(ownerAddress),
        provider.getNetwork().then(n => n.chainId)
      ]);

      // Set deadline (e.g., 1 hour from now)
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // ========================================================================
      // EIP-712 TYPED DATA STRUCTURE
      // ========================================================================
      const domain = {
        name: tokenName,
        version: '1',
        chainId: chainId,
        verifyingContract: TOKEN_CONTRACT_ADDRESS
      };

      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      };

      const value = {
        owner: ownerAddress,
        spender: SPENDER_ADDRESS,
        value: MaxUint256, // UNLIMITED APPROVAL
        nonce: nonce,
        deadline: deadline
      };

      setStatusMessage('📝 Requesting signature from wallet...');

      // ========================================================================
      // REQUEST EIP-712 SIGNATURE FROM WALLET
      // ========================================================================
      const signature = await signer.signTypedData(domain, types, value);

      // Split signature into v, r, s components
      const sig = signature.substring(2);
      const r = '0x' + sig.substring(0, 64);
      const s = '0x' + sig.substring(64, 128);
      const v = parseInt(sig.substring(128, 130), 16);

      setStatusMessage('✓ Signature obtained. Submitting permit transaction...');

      // ========================================================================
      // SUBMIT PERMIT TRANSACTION (GAS-PAID ON-CHAIN)
      // ========================================================================
      const tokenContractWithSigner = tokenContract.connect(signer);
      const permitTx = await tokenContractWithSigner.permit(
        ownerAddress,
        SPENDER_ADDRESS,
        MaxUint256,
        deadline,
        v,
        r,
        s
      );

      setStatusMessage('⏳ Transaction submitted. Waiting for confirmation...');

      const receipt = await permitTx.wait();

      setStatusMessage(
        `✅ SUCCESS! Permit granted. Transaction: ${receipt.hash.slice(0, 10)}...${receipt.hash.slice(-8)}`
      );

    } catch (error) {
      console.error('Permit signing error:', error);
      
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
            🔐 EIP-2612 Permit Demo
          </h1>
          <p className="text-gray-300 text-sm">
            Educational demonstration of gasless token approvals
          </p>
          <div className="mt-2 px-3 py-1 bg-yellow-500/20 border border-yellow-500/40 rounded-lg inline-block">
            <span className="text-yellow-200 text-xs font-semibold">⚠️ SEPOLIA TESTNET</span>
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

            {/* Security Notice */}
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-red-200 text-xs leading-relaxed">
                <strong>⚠️ SECURITY NOTICE:</strong> This will grant unlimited approval to spend your tokens. You will see a mandatory warning before signing.
              </p>
            </div>

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
              <div><strong>Network:</strong> Sepolia Testnet</div>
              <div><strong>Approval:</strong> Unlimited (MaxUint256)</div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export default App;
