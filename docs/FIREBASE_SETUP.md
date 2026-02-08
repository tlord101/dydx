# Firebase Web SDK Setup Guide

This project uses **Firebase Web SDK** for both frontend and backend (no Admin SDK).

## Why Web SDK Only?

✅ **Benefits:**
- Same configuration for frontend and backend
- Simpler setup - no service account needed
- Same Firebase credentials everywhere
- Easier to manage and deploy

## Configuration Steps

### 1. Create Firebase Project

1. Go to https://console.firebase.google.com
2. Create a new project (or use existing)
3. Enable **Firestore Database**
4. Go to Project Settings → General
5. Scroll to "Your apps" → Add Web App
6. Copy the Firebase configuration

### 2. Setup Environment Variables

Your Firebase config will look like this:

```javascript
{
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
}
```

#### Frontend `.env`:
```bash
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

#### Backend `functions/.env`:
```bash
# Copy the SAME values from frontend!
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# Plus executor-specific config
EXECUTOR_ADDRESS=0xYourExecutorAddress
EXECUTOR_PRIVATE_KEY=0xYourPrivateKey
RPC_URL=https://cloudflare-eth.com
```

### 3. Setup Firestore Security Rules

The backend needs permission to read and write to Firestore.

1. **Install Firebase CLI** (if not installed):
```bash
npm install -g firebase-tools
```

2. **Login to Firebase**:
```bash
firebase login
```

3. **Initialize Firebase** (in project root):
```bash
firebase init
```
- Select "Firestore"
- Choose your project
- Use default filenames

4. **Deploy Security Rules**:
```bash
firebase deploy --only firestore:rules
```

The [firestore.rules](../firestore.rules) file is already configured to allow:
- ✅ Anyone can read/write `permit2_signatures` collection
- ✅ Anyone can read/write `admin_config` collection

### 4. Firestore Collections Structure

#### `permit2_signatures` Collection
Documents created by users when signing permits:
```javascript
{
  owner: "0xUserAddress...",
  token: "0xTokenAddress...",
  amount: "10000000000",
  deadline: 1234567890,
  nonce: 0,
  r: "0x...",
  s: "0x...",
  v: 27,
  processed: false,
  spender: "0xExecutorAddress..."
}
```

After backend processes:
```javascript
{
  // ... original fields ...
  processed: true,
  routerTx: "0xTransactionHash...",
  processedAt: 1234567890,
  withdrawAmount: "10000000000"
}
```

#### `admin_config` Collection
Settings document (`admin_config/settings`):
```javascript
{
  executorAddress: "0x...",
  executorPrivateKey: "0x...",  // Optional override
  tokenAddress: "0x..."
}
```

## Security Considerations

### Development (Current Setup)
The current `firestore.rules` allows **open read/write** for testing:
```javascript
allow read, write: if true;
```

⚠️ This is **NOT secure** for production!

### Production Recommendations

1. **Add Firebase Authentication:**
```javascript
match /permit2_signatures/{signature} {
  // Users can only create their own signatures
  allow create: if request.auth != null && 
                request.resource.data.owner == request.auth.uid;
  
  // Anyone can read (backend needs this)
  allow read: if true;
  
  // Only allow backend to update 'processed' field
  allow update: if request.resource.data.diff(resource.data).affectedKeys()
                  .hasOnly(['processed', 'routerTx', 'processedAt', 'withdrawAmount']);
}
```

2. **Restrict Admin Config:**
```javascript
match /admin_config/{document} {
  // Only specific authenticated users can modify
  allow read: if true;
  allow write: if request.auth != null && 
               request.auth.token.admin == true;
}
```

3. **Add Rate Limiting:**
```javascript
match /permit2_signatures/{signature} {
  allow create: if request.auth != null &&
                request.time > resource.data.lastSignature + duration.value(1, 'm');
}
```

## How Backend Accesses Firestore

The backend worker (`functions/worker.js`) uses Firebase Web SDK:

```javascript
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

// Initialize with same config as frontend
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  // ... other config
};

const app = initializeApp(firebaseConfig, 'worker-app');
const db = getFirestore(app);

// Query unprocessed signatures
const q = query(
  collection(db, 'permit2_signatures'),
  where('processed', '==', false)
);
const docs = await getDocs(q);
```

## Troubleshooting

### "Missing or insufficient permissions"
- Check Firestore security rules are deployed
- Ensure rules allow read/write access
- Deploy rules: `firebase deploy --only firestore:rules`

### "Firebase app named 'worker-app' already exists"
- The worker initializes with a unique name to avoid conflicts
- This is normal and prevents duplicate initialization

### Backend can't read Firestore
- Verify all `VITE_FIREBASE_*` env vars are set in `functions/.env`
- Check `firestore.rules` allows read access
- Ensure Firebase project has Firestore enabled

### Frontend works but backend doesn't
- Both must use **exact same** Firebase credentials
- Copy all env vars from frontend to backend
- Check backend is connecting to correct Firebase project

## Testing

1. **Test Frontend**: Sign a permit and check Firestore
```bash
npm run dev
# Visit http://localhost:5173
# Connect wallet and sign
# Check Firebase Console → Firestore → permit2_signatures
```

2. **Test Backend**: Run worker and check processing
```bash
cd functions
npm start
# Should see: "worker running..."
# Check Firestore for `processed: true` updates
```

3. **Check Firestore Console**:
- Go to Firebase Console → Firestore Database
- Should see `permit2_signatures` collection
- Documents should have `processed` field updating

## Migration from Admin SDK

If you previously used Firebase Admin SDK:

1. ❌ **Remove**: Service account JSON files
2. ❌ **Remove**: `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`
3. ✅ **Add**: All `VITE_FIREBASE_*` variables
4. ✅ **Update**: Security rules to allow backend access
5. ✅ **Deploy**: New security rules

Benefits:
- No more service account management
- Simpler configuration
- Same setup as frontend
- Easier to debug and test
