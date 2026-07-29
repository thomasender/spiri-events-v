import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

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
const app = initializeApp(useEmulators ? devConfig : prodConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

if (useEmulators) {
  connectAuthEmulator(auth, 'http://localhost:9199', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8181);
  connectStorageEmulator(storage, 'localhost', 9299);
}

export default app;
