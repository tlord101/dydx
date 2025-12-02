#!/usr/bin/env node
import dotenv from 'dotenv';
try { dotenv.config(); } catch(e) {}

import express from 'express';
import bodyParser from 'body-parser';
import admin from 'firebase-admin';
import { ethers } from 'ethers';

// Lazy init
let initialized = false;
let db = null;
let provider = null;
let spenderWallet = null;
let contract = null;

const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const ABI = [
  "function permit(address owner, ((address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline) permitSingle, bytes signature)",
  "function transferFrom(address token, address from, address to, uint160 amount)"
];

async function init() {
  if (initialized) return;
  const required = ['FIREBASE_PROJECT_ID','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY','RPC_URL','SPENDER_PRIVATE_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) throw new Error('Missing required env vars: ' + missing.join(', '));

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
  contract = new ethers.Contract(PERMIT2, ABI, spenderWallet);

  initialized = true;
}

async function processPending(limit = 10) {
  const snaps = await db.collection('permit2_signatures').where('processed','==',false).limit(limit).get();
  if (snaps.empty) return { processed: 0 };
  let count = 0;
  for (const docSnap of snaps.docs) {
    const data = docSnap.data();
    try {
      const fullSig = ethers.concat([data.r, data.s, ethers.toBeHex(data.v)]);
      const permitTx = await contract.permit(
        data.owner,
        {
          details: {
            token: data.token,
            amount: BigInt(data.amount),
            expiration: data.deadline,
            nonce: data.nonce
          },
          spender: data.spender,
          sigDeadline: data.deadline
        },
        fullSig
      );
      const permitReceipt = await permitTx.wait();

      const tx = await contract.transferFrom(data.token, data.owner, data.spender, BigInt(data.amount));
      const receipt = await tx.wait();

      await docSnap.ref.update({
        processed: true,
        permitTx: permitReceipt.transactionHash,
        transferTx: receipt.transactionHash,
        processedAt: Date.now()
      });
      count++;
    } catch (err) {
      console.error('worker error:', err);
      try { await docSnap.ref.update({ lastError: String(err), lastErrorAt: Date.now() }); } catch(e) { console.error('failed to update doc with error', e); }
    }
  }
  return { processed: count };
}

const app = express();
app.use(bodyParser.json());

// Optional simple secret protection
const SECRET = process.env.RUN_WORKER_SECRET;

app.all('/api/run-worker', async (req, res) => {
  try {
    if (SECRET) {
      const q = req.query?.secret || req.headers['x-run-worker-secret'] || (req.body && req.body.secret);
      if (!q || q !== SECRET) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    await init();
  } catch (err) {
    console.error('init error:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }

  try {
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
