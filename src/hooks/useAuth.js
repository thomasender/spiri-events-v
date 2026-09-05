import { useState, useEffect, useMemo } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updateEmail,
  verifyBeforeUpdateEmail,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  getIdTokenResult,
  sendEmailVerification,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { ref as storageRef, listAll, deleteObject } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';

const ADMIN_EMULATOR_USERS = ['admin@test.com', 'mathis.aut@gmail.com'];
const GOOGLE_PROVIDER_ID = 'google.com';

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
  'auth/too-many-requests': 'Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.',
  'auth/network-request-failed': 'Netzwerkfehler. Bitte überprüfe deine Internetverbindung.',
  'auth/user-disabled': 'Dieses Konto wurde deaktiviert.',
  'auth/user-token-expired': 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  'auth/user-token-revoked': 'Deine Sitzung wurde ungültig gemacht. Bitte melde dich erneut an.',
  'auth/popup-closed-by-user': 'Anmeldung abgebrochen.',
  'auth/popup-blocked':
    'Das Anmeldefenster wurde vom Browser blockiert. Bitte erlaube Pop-ups für diese Seite.',
  'auth/cancelled-popup-request': 'Anmeldung abgebrochen.',
  'auth/account-exists-with-different-credential':
    'Für diese E-Mail-Adresse ist bereits eine andere Anmeldemethode registriert.',
  'auth/unauthorized-domain':
    'Diese Domain ist für die Google-Anmeldung nicht freigegeben. Bitte informiere den Seitenbetreiber.',
  'auth/operation-not-allowed':
    'Die Google-Anmeldung ist derzeit nicht verfügbar. Bitte versuche es später erneut.',
  'auth/internal-error':
    'Ein interner Fehler ist aufgetreten. Bitte versuche es in einem Moment erneut.',
  'auth/app-not-authorized':
    'Diese App ist nicht für die Google-Anmeldung autorisiert. Bitte informiere den Seitenbetreiber.',
  'auth/invalid-api-key':
    'Es liegt ein Konfigurationsproblem vor. Bitte informiere den Seitenbetreiber.',
  'auth/invalid-oauth-client-id':
    'Es liegt ein Konfigurationsproblem vor. Bitte informiere den Seitenbetreiber.',
  'auth/invalid-tenant-id':
    'Es liegt ein Konfigurationsproblem vor. Bitte informiere den Seitenbetreiber.',
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

async function seedProfileDoc(user, displayName, photoURL) {
  try {
    const profileRef = doc(db, 'users', user.uid);
    const fallbackName =
      displayName || user.displayName || (user.email ? user.email.split('@')[0] : '');
    const fallbackPhoto = photoURL || user.photoURL || null;
    await setDoc(
      profileRef,
      {
        displayName: fallbackName,
        bio: '',
        website: '',
        contact: user.email || '',
        photoURL: fallbackPhoto,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Failed to seed profile doc:', err);
  }
}

export function isGoogleProviderUser(user) {
  if (!user?.providerData) return false;
  return user.providerData.some((p) => p?.providerId === GOOGLE_PROVIDER_ID);
}

export function isPasswordProviderUser(user) {
  if (!user?.providerData || user.providerData.length === 0) {
    return Boolean(user?.email);
  }
  return user.providerData.some((p) => p?.providerId === 'password');
}

export function useAuth() {
  const [user, setUser] = useState(() => auth.currentUser);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [emailVerified, setEmailVerified] = useState(() =>
    Boolean(auth.currentUser?.emailVerified)
  );

  const refreshEmailVerified = async () => {
    const current = auth.currentUser;
    if (!current) return;
    try {
      await current.reload();
      setEmailVerified(Boolean(current.emailVerified));
    } catch (err) {
      console.warn('Error reloading user to refresh emailVerified:', err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setEmailVerified(Boolean(firebaseUser?.emailVerified));
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

  const canCreateEvents = useMemo(
    () => Boolean(user) && (role === 'Admin' || Boolean(user?.emailVerified)),
    [user, role]
  );

  const register = async (email, password, displayName) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(credential.user, { displayName });
    }
    await seedProfileDoc(credential.user, displayName);
    try {
      await sendEmailVerification(credential.user);
    } catch (err) {
      console.warn('Failed to send initial verification email:', err);
    }
    setEmailVerified(Boolean(credential.user?.emailVerified));
    return credential;
  };

  const resendVerificationEmail = async () => {
    const current = auth.currentUser;
    if (!current) {
      throw { code: 'auth/no-current-user', message: 'Kein angemeldeter Benutzer.' };
    }
    await sendEmailVerification(current);
  };

  const login = async (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(auth, provider);
    await seedProfileDoc(credential.user, credential.user.displayName, credential.user.photoURL);
    return credential;
  };

  const logout = () => signOut(auth);

  const resetPassword = async (email) => {
    await sendPasswordResetEmail(auth, email);
  };

  const reauthenticate = async (password) => {
    const current = auth.currentUser;
    if (!current?.email) {
      throw { code: 'auth/no-current-user', message: 'Kein angemeldeter Benutzer.' };
    }
    const credential = EmailAuthProvider.credential(current.email, password);
    return reauthenticateWithCredential(current, credential);
  };

  const reauthenticateWithGoogle = async () => {
    const current = auth.currentUser;
    if (!current) {
      throw { code: 'auth/no-current-user', message: 'Kein angemeldeter Benutzer.' };
    }
    return reauthenticateWithPopup(current, new GoogleAuthProvider());
  };

  const reauthenticateCurrent = async (password) => {
    if (password) {
      await reauthenticate(password);
      return;
    }
    if (isGoogleProviderUser(auth.currentUser)) {
      await reauthenticateWithGoogle();
      return;
    }
    throw {
      code: 'auth/missing-password',
      message: 'Bitte gib dein Passwort ein, um fortzufahren.',
    };
  };

  const changeEmail = async (newEmail, password) => {
    await reauthenticateCurrent(password);
    const current = auth.currentUser;
    if (!current) {
      throw { code: 'auth/no-current-user', message: 'Kein angemeldeter Benutzer.' };
    }
    await verifyBeforeUpdateEmail(current, newEmail);
    return current;
  };

  const deleteAccount = async (password) => {
    const current = auth.currentUser;
    if (!current?.uid) {
      throw { code: 'auth/no-current-user', message: 'Kein angemeldeter Benutzer.' };
    }
    const uid = current.uid;

    await reauthenticateCurrent(password);

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
    emailVerified,
    canCreateEvents,
    register,
    login,
    loginWithGoogle,
    logout,
    resetPassword,
    reauthenticate,
    reauthenticateWithGoogle,
    changeEmail,
    deleteAccount,
    resendVerificationEmail,
    refreshEmailVerified,
    isGoogleUser: isGoogleProviderUser(user),
  };
}
