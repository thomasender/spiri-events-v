export const auth = {
  currentUser: null,
};

export const db = {};

export const signInWithEmailAndPassword = async () => ({ user: { uid: 'test-uid' } });
export const createUserWithEmailAndPassword = async () => ({ user: { uid: 'test-uid' } });
export const signOut = async () => {};
export const onAuthStateChanged = (auth, callback) => {
  callback(null);
  return () => {};
};
export const updateProfile = async () => {};

export const collection = () => ({ type: 'collection' });
export const addDoc = async () => ({ id: 'new-doc-id' });
export const updateDoc = async () => {};
export const deleteDoc = async () => {};
export const doc = () => ({ type: 'doc' });
export const query = () => ({ type: 'query' });
export const where = () => ({ type: 'where' });
export const orderBy = () => ({ type: 'orderBy' });
export const onSnapshot = (q, callback) => {
  callback({ docs: [] });
  return () => {};
};
export const serverTimestamp = () => new Date();
