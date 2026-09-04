export const auth = {
  currentUser: null,
};

export const db = {};

export const storage = {};

export const signInWithEmailAndPassword = async () => ({ user: { uid: 'test-uid' } });
export const createUserWithEmailAndPassword = async () => ({ user: { uid: 'test-uid' } });
export const signInWithPopup = async () => ({
  user: {
    uid: 'test-google-uid',
    email: 'googleuser@example.com',
    emailVerified: true,
    displayName: 'Google User',
    photoURL: 'https://example.com/avatar.png',
    providerData: [{ providerId: 'google.com', uid: 'google-sub-123' }],
  },
});
export const signOut = async () => {};
export const onAuthStateChanged = (_auth, callback) => {
  callback(null);
  return () => {};
};
export const updateProfile = async () => {};
export const updateEmail = async () => {};
export const verifyBeforeUpdateEmail = async () => {};
export const deleteUser = async () => {};
export const reauthenticateWithCredential = async () => {};
export const reauthenticateWithPopup = async () => ({ user: { uid: 'test-uid' } });
export const getIdTokenResult = async () => ({ claims: {} });
export const sendEmailVerification = async () => {};
export const sendPasswordResetEmail = async () => {};
export const GoogleAuthProvider = class {
  static credentialFromResult() {
    return { accessToken: 'fake-token' };
  }
  static credentialFromError() {
    return null;
  }
  setCustomParameters() {}
};
export const EmailAuthProvider = {
  credential: (email, password) => ({ providerId: 'password', email, password }),
};

export const collection = () => ({ type: 'collection' });
export const addDoc = async () => ({ id: 'new-doc-id' });
export const updateDoc = async () => {};
export const deleteDoc = async () => {};
export const setDoc = async () => {};
export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
export const doc = () => ({ type: 'doc' });
export const query = () => ({ type: 'query' });
export const where = () => ({ type: 'where' });
export const orderBy = () => ({ type: 'orderBy' });
export const onSnapshot = (q, callback) => {
  if (typeof callback === 'function') callback({ docs: [], exists: () => false, data: () => ({}) });
  return () => {};
};
export const serverTimestamp = () => new Date();

export const ref = () => ({ type: 'storage-ref' });
export const uploadBytesResumable = () => ({ type: 'upload-task' });
export const getDownloadURL = async () => 'https://example.com/test.jpg';
export const deleteObject = async () => {};
export const listAll = async () => ({ items: [], prefixes: [] });
