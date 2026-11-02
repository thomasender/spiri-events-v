import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
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

if (useEmulators) {
  connectAuthEmulator(auth, 'http://localhost:9199', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8181);
}

// Storage and the callable functions are not needed for the first page, so their SDKs are
// loaded on first use. Every call returns the same instance (one promise per service); a failed
// chunk load is forgotten so the next call tries again.
let storagePromise = null;
export function getStorageInstance() {
  storagePromise ??= import('firebase/storage').then(({ getStorage, connectStorageEmulator }) => {
    const storage = getStorage(app);
    if (useEmulators) connectStorageEmulator(storage, 'localhost', 9299);
    return storage;
  });
  storagePromise.catch(() => {
    storagePromise = null;
  });
  return storagePromise;
}

let functionsPromise = null;
export function getFunctionsInstance() {
  functionsPromise ??= import('firebase/functions').then(
    ({ getFunctions, connectFunctionsEmulator }) => {
      const functions = getFunctions(app, 'europe-west3');
      if (useEmulators) connectFunctionsEmulator(functions, 'localhost', 5001);
      return functions;
    }
  );
  functionsPromise.catch(() => {
    functionsPromise = null;
  });
  return functionsPromise;
}

/**
 * A callable Cloud Function, like `httpsCallable(functions, name, options)`, but the
 * Functions SDK is only loaded when it is first called: `await callable('name')(data)`.
 */
export function callable(name, options) {
  return async (data) => {
    const [{ httpsCallable }, functions] = await Promise.all([
      import('firebase/functions'),
      getFunctionsInstance(),
    ]);
    return httpsCallable(functions, name, options)(data);
  };
}

export default app;
