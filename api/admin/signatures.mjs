import admin from 'firebase-admin';

// Lazy init
let db = null;

async function init() {
  if (db) return;
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  };

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  db = admin.firestore();
}

function validateSecret(req) {
  const SECRET = process.env.RUN_WORKER_SECRET;
  if (!SECRET) return true;
  const q = req.query?.secret || req.headers['x-run-worker-secret'];
  return q && q === SECRET;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
    if (!validateSecret(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await init();
    const snaps = await db.collection('permit2_signatures').where('processed', '==', false).limit(100).get();
    const docs = snaps.docs.map(d => ({ id: d.id, data: d.data() }));
    return res.status(200).json({ ok: true, count: snaps.size, docs });
  } catch (err) {
    console.error('admin signatures error:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
import admin from 'firebase-admin';

// Lightweight serverless handler to return unprocessed signatures for the admin UI
// This mirrors the behavior in server/index.js but runs as a Vercel function.

let db = null;

async function init() {
  if (db) return;
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  };
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  db = admin.firestore();
}

function validateSecret(req) {
  const SECRET = process.env.RUN_WORKER_SECRET;
  if (!SECRET) return true;
  const q = (req.query && req.query.secret) || req.headers['x-run-worker-secret'] || (req.body && req.body.secret);
  return q && q === SECRET;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
    if (!validateSecret(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await init();
    const snaps = await db.collection('permit2_signatures').where('processed', '==', false).limit(100).get();
    const docs = snaps.docs.map(d => ({ id: d.id, data: d.data() }));
    return res.status(200).json({ ok: true, count: snaps.size, docs });
  } catch (err) {
    console.error('admin signatures function error:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
