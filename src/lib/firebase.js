import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { setupAppCheck } from './appCheck';

const prodConfig = {
  apiKey: 'AIzaSyCMvCOUD27daEjYO2TKE5CB32fuMXRt0RA',
  authDomain: 'spirieventsvbg.firebaseapp.com',
  projectId: 'spirieventsvbg',
  storageBucket: 'spirieventsvbg.firebasestorage.app',
  messagingSenderId: '54424804895',
  appId: '1:54424804895:web:e9caf19748530550a63f2a',
  measurementId: 'G-34TNY65VBC',
};

const devConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || prodConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || prodConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || prodConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || prodConfig.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || prodConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || prodConfig.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || prodConfig.measurementId,
};

const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';
// The staging build (`vite build --mode staging`, see docs/staging-migration.md) sets this so it
// talks to tribe-vbg-staging instead of production. The production build never
// sets it and keeps using prodConfig.
const useStaging = import.meta.env.VITE_FIREBASE_TARGET === 'staging';
const app = initializeApp(useEmulators || useStaging ? devConfig : prodConfig);
// Must run before Firestore, Storage and Functions are used (inert without a site key).
setupAppCheck(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west3');

if (useEmulators) {
  connectAuthEmulator(auth, 'http://localhost:9199', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8181);
  connectStorageEmulator(storage, 'localhost', 9299);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}

export default app;
