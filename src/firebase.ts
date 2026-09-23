import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

import fallbackConfig from '../firebase-applet-config.json';

/**
 * Firebase wiring.
 *
 * Values come from the environment first (`VITE_FIREBASE_*`, set in `.env`),
 * falling back to `firebase-applet-config.json`. The committed JSON is an
 * empty template on purpose — this repository carries no project credentials,
 * so connecting a new Firebase project only means filling in `.env`.
 *
 * See README.md → "Connecting Firebase".
 */
const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || fallbackConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || fallbackConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || fallbackConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || fallbackConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || fallbackConfig.appId,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || fallbackConfig.measurementId,
};

const firestoreDatabaseId =
  env.VITE_FIREBASE_DATABASE_ID || fallbackConfig.firestoreDatabaseId || '(default)';

// A missing key surfaces later as an opaque `auth/invalid-api-key`; say so plainly.
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error(
    'Firebase is not configured. Copy .env.example to .env and set the ' +
      'VITE_FIREBASE_* values from your Firebase project settings. ' +
      'Sign-in, profiles and leaderboards stay unavailable until then.',
  );
}

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);
