import dotenv from 'dotenv';
try { dotenv.config(); } catch (e) {}

import admin from 'firebase-admin';
import { ethers } from 'ethers';

// Lazy initialization to avoid module-load crashes in serverless envs
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

  // Validate required env vars early and return a helpful error
  const required = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'RPC_URL',
    'SPENDER_PRIVATE_KEY'
  ];

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error('Missing required env vars: ' + missing.join(', '));
  }

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  };

  try {
    if (!admin.apps || admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    db = admin.firestore();
  } catch (err) {
    throw new Error('Failed to initialize Firebase Admin: ' + String(err));
  }

  try {
    provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    spenderWallet = new ethers.Wallet(process.env.SPENDER_PRIVATE_KEY, provider);
    contract = new ethers.Contract(PERMIT2, ABI, spenderWallet);
  } catch (err) {
    throw new Error('Failed to initialize ethers provider/wallet/contract: ' + String(err));
  }

  initialized = true;
}

async function processPending(limit = 10) {
  const snaps = await db.collection("permit2_signatures")
    .where("processed", "==", false)
    .limit(limit)
    .get();

  if (snaps.empty) return { processed: 0 };

  let count = 0;

  for (const docSnap of snaps.docs) {
    const data = docSnap.data();
    try {
      // Rebuild signature bytes
      const fullSig = ethers.concat([
        data.r,
        data.s,
        ethers.toBeHex(data.v)
      ]);

      // Submit permit
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

      // Execute transferFrom
      const tx = await contract.transferFrom(
        data.token,
        data.owner,
        data.spender,
        BigInt(data.amount)
      );
      const receipt = await tx.wait();

      await docSnap.ref.update({
        processed: true,
        permitTx: permitReceipt.transactionHash,
        transferTx: receipt.transactionHash,
        processedAt: Date.now()
      });

      count++;
    } catch (err) {
      console.error('run-worker error:', err);
      try {
        await docSnap.ref.update({
          lastError: String(err),
          lastErrorAt: Date.now()
        });
      } catch (uErr) {
        console.error('failed to record error on doc:', uErr);
      }
    }
  }

  return { processed: count };
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    await init();
  } catch (err) {
    console.error('run-worker init error:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }

  try {
    const result = await processPending(10);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('run-worker handler error:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
