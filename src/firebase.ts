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

const resolved = {
  apiKey: env.VITE_FIREBASE_API_KEY || fallbackConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || fallbackConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || fallbackConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || fallbackConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || fallbackConfig.appId,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || fallbackConfig.measurementId,
};

export const isFirebaseConfigured = Boolean(resolved.apiKey && resolved.projectId);

/*
 * `getAuth()` throws `auth/invalid-api-key` on an empty key, and it runs while
 * this module is being evaluated — so an unconfigured checkout would take the
 * whole app down with a blank page before anything rendered.
 *
 * When configuration is missing we therefore hand Firebase a structurally
 * valid placeholder instead. The SDK constructs normally, the UI renders, and
 * only the network calls fail — which the app already reports through its
 * existing error handling.
 */
const PLACEHOLDER_CONFIG = {
  apiKey: 'unconfigured-api-key',
  authDomain: 'unconfigured.firebaseapp.com',
  projectId: 'unconfigured',
  storageBucket: 'unconfigured.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000',
  measurementId: '',
};

if (!isFirebaseConfigured) {
  console.error(
    'Firebase is not configured. Copy .env.example to .env and set the ' +
      'VITE_FIREBASE_* values from your Firebase project settings. The app ' +
      'will run, but sign-in, profiles and leaderboards stay unavailable.',
  );
}

const firebaseConfig = isFirebaseConfigured ? resolved : PLACEHOLDER_CONFIG;

const firestoreDatabaseId =
  env.VITE_FIREBASE_DATABASE_ID || fallbackConfig.firestoreDatabaseId || '(default)';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);
