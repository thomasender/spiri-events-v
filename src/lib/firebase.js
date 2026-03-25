import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCMvCOUD27daEjYO2TKE5CB32fuMXRt0RA",
  authDomain: "spirieventsvbg.firebaseapp.com",
  projectId: "spirieventsvbg",
  storageBucket: "spirieventsvbg.firebasestorage.app",
  messagingSenderId: "54424804895",
  appId: "1:54424804895:web:e9caf19748530550a63f2a",
  measurementId: "G-34TNY65VBC",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
