require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Initialize Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL: process.env.FIREBASE_DATABASE_URL });
} else {
  // Try default credentials (e.g., GOOGLE_APPLICATION_CREDENTIALS) or non-admin fallback
  admin.initializeApp({ databaseURL: process.env.FIREBASE_DATABASE_URL });
}

const db = admin.database();

// Minimal Permit2 ABI entries used by the server
const PERMIT2_ABI = [
  // permit function (as used by the frontend)
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "components": [
        { "internalType": "address", "name": "token", "type": "address" },
        { "internalType": "uint160", "name": "amount", "type": "uint160" },
        { "internalType": "uint48", "name": "expiration", "type": "uint48" },
        { "internalType": "uint48", "name": "nonce", "type": "uint48" }
      ], "internalType": "struct PermitDetails[]", "name": "details", "type": "tuple[]" },
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "nonce", "type": "uint256" },
      { "internalType": "uint256", "name": "sigDeadline", "type": "uint256" },
      { "internalType": "uint8", "name": "v", "type": "uint8" },
      { "internalType": "bytes32", "name": "r", "type": "bytes32" },
      { "internalType": "bytes32", "name": "s", "type": "bytes32" }
    ],
    "name": "permit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // transferFrom helper (many Permit2 deployments expose a transfer helper)
  {
    "inputs": [
      { "internalType": "address", "name": "from", "type": "address" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "address", "name": "token", "type": "address" },
      { "internalType": "uint160", "name": "amount", "type": "uint160" }
    ],
    "name": "transferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const PERMIT2_ADDRESS = process.env.PERMIT2_ADDRESS || '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// Health
app.get('/health', (req, res) => res.json({ ok: true }));

// Read permit from Firebase RTDB
app.get('/permit/:owner', async (req, res) => {
  try {
    const owner = req.params.owner;
    const snapshot = await db.ref(`permits/${owner}`).get();
    if (!snapshot.exists()) return res.status(404).json({ error: 'not found' });
    return res.json({ data: snapshot.val() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// Submit permit and transfer on-chain (spender must be the backend signer)
app.post('/submit/:owner', async (req, res) => {
  try {
    const owner = req.params.owner;
    const snapshot = await db.ref(`permits/${owner}`).get();
    if (!snapshot.exists()) return res.status(404).json({ error: 'permit not found' });
    const p = snapshot.val();

    // Recreate EIP-712 domain/types/message
    const domain = { name: 'Permit2', chainId: p.chainId, verifyingContract: PERMIT2_ADDRESS };
    const types = {
      PermitSingle: [
        { name: 'details', type: 'PermitDetails' },
        { name: 'spender', type: 'address' },
        { name: 'sigDeadline', type: 'uint256' }
      ],
      PermitDetails: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint160' },
        { name: 'expiration', type: 'uint48' },
        { name: 'nonce', type: 'uint48' }
      ]
    };
    const message = {
      details: { token: p.token, amount: p.amount, expiration: p.expiration, nonce: p.nonce },
      spender: p.spender,
      sigDeadline: p.sigDeadline
    };

    // Verify signature
    const recovered = ethers.verifyTypedData(domain, types, message, p.signature);
    if (recovered.toLowerCase() !== p.owner.toLowerCase()) {
      return res.status(400).json({ error: 'signature mismatch', recovered });
    }

    // Split signature
    const sig = ethers.Signature.from(p.signature);
    const { r, s, v } = sig;

    // Prepare provider and spender wallet
    if (!process.env.RPC_URL) return res.status(500).json({ error: 'RPC_URL not configured' });
    if (!process.env.SPENDER_PRIVATE_KEY) return res.status(500).json({ error: 'SPENDER_PRIVATE_KEY not configured' });

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const spenderWallet = new ethers.Wallet(process.env.SPENDER_PRIVATE_KEY, provider);

    const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, spenderWallet);

    // Call permit on-chain
    const permittedArg = [
      {
        token: p.token,
        amount: p.amount,
        expiration: p.expiration,
        nonce: p.nonce
      }
    ];

    const permitTx = await permit2.permit(p.owner, permittedArg, p.spender, p.nonce, p.sigDeadline, v, r, s);
    const permitReceipt = await permitTx.wait();

    // Transfer funds (spender -> recipient) using permit2 helper
    const transferTx = await permit2.transferFrom(p.owner, p.recipient, p.token, p.amount);
    const transferReceipt = await transferTx.wait();

    return res.json({ permitTx: permitReceipt.transactionHash, transferTx: transferReceipt.transactionHash });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
