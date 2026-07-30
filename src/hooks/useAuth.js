import { useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updateEmail,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  getIdTokenResult,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { ref as storageRef, listAll, deleteObject } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';

const ADMIN_EMULATOR_USERS = ['admin@test.com', 'mathis.aut@gmail.com'];

const AUTH_ERROR_MESSAGES = {
  'auth/invalid-credential': 'E-Mail oder Passwort sind falsch.',
  'auth/wrong-password': 'Das Passwort ist falsch.',
  'auth/invalid-login-credentials': 'E-Mail oder Passwort sind falsch.',
  'auth/user-mismatch': 'Die Anmeldung passt nicht zum aktuellen Konto.',
  'auth/user-not-found': 'Kein Konto mit dieser E-Mail-Adresse gefunden.',
  'auth/requires-recent-login': 'Bitte melde dich erneut an, bevor du diese Aktion ausführst.',
  'auth/email-already-in-use': 'Diese E-Mail-Adresse wird bereits verwendet.',
  'auth/invalid-email': 'Bitte gib eine gültige E-Mail-Adresse ein.',
  'auth/weak-password': 'Das Passwort ist zu schwach.',
};

export function authErrorMessage(err) {
  if (!err) return 'Ein Fehler ist aufgetreten.';
  return AUTH_ERROR_MESSAGES[err.code] || 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.';
}

async function checkFirestoreAdminRole(user) {
  if (!user?.email) return null;
  try {
    const adminDocRef = doc(db, 'admin_users', user.uid);
    const adminDoc = await getDoc(adminDocRef);
    if (adminDoc.exists()) {
      return adminDoc.data().role || 'Admin';
    }
    if (ADMIN_EMULATOR_USERS.includes(user.email)) {
      return 'Admin';
    }
  } catch (err) {
    console.warn('Error checking Firestore admin role:', err);
  }
  return null;
}

async function seedProfileDoc(user, displayName) {
  try {
    const profileRef = doc(db, 'users', user.uid);
    await setDoc(
      profileRef,
      {
        displayName: displayName || '',
        bio: '',
        website: '',
        contact: user.email || '',
        photoURL: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Failed to seed profile doc:', err);
  }
}

export function useAuth() {
  const [user, setUser] = useState(() => auth.currentUser);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const tokenResult = await getIdTokenResult(firebaseUser, true);
          const tokenRole = tokenResult.claims.role ?? null;
          if (tokenRole) {
            setRole(tokenRole);
          } else {
            const firestoreRole = await checkFirestoreAdminRole(firebaseUser);
            setRole(firestoreRole);
          }
        } catch (err) {
          console.warn('Error getting ID token result:', err);
          const firestoreRole = await checkFirestoreAdminRole(firebaseUser);
          setRole(firestoreRole);
        }
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const register = async (email, password, displayName) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(credential.user, { displayName });
    }
    await seedProfileDoc(credential.user, displayName);
    return credential;
  };

  const login = async (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = () => signOut(auth);

  const reauthenticate = async (password) => {
    const current = auth.currentUser;
    if (!current?.email) {
      throw { code: 'auth/no-current-user', message: 'Kein angemeldeter Benutzer.' };
    }
    const credential = EmailAuthProvider.credential(current.email, password);
    return reauthenticateWithCredential(current, credential);
  };

  const changeEmail = async (newEmail, password) => {
    await reauthenticate(password);
    const current = auth.currentUser;
    if (!current) {
      throw { code: 'auth/no-current-user', message: 'Kein angemeldeter Benutzer.' };
    }
    await updateEmail(current, newEmail);
    return current;
  };

  const deleteAccount = async (password) => {
    const current = auth.currentUser;
    if (!current?.uid) {
      throw { code: 'auth/no-current-user', message: 'Kein angemeldeter Benutzer.' };
    }
    const uid = current.uid;

    await reauthenticate(password);

    try {
      const userFolder = storageRef(storage, `users/${uid}`);
      const listed = await listAll(userFolder);
      await Promise.all(listed.items.map((item) => deleteObject(item).catch(() => {})));
    } catch (err) {
      if (err?.code !== 'storage/object-not-found') {
        console.warn('Failed to delete profile storage:', err);
      }
    }

    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (err) {
      console.warn('Failed to delete profile doc:', err);
    }

    await deleteUser(current);
    await signOut(auth);
  };

  return {
    user,
    loading,
    role,
    register,
    login,
    logout,
    reauthenticate,
    changeEmail,
    deleteAccount,
  };
}
