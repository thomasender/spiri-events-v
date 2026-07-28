import { useState, useEffect } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  getIdTokenResult
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const ADMIN_EMULATOR_USERS = [
  'admin@test.com',
  'mathis.aut@gmail.com',
]

async function checkFirestoreAdminRole(user) {
  if (!user?.email) return null
  try {
    const adminDocRef = doc(db, 'admin_users', user.uid)
    const adminDoc = await getDoc(adminDocRef)
    if (adminDoc.exists()) {
      return adminDoc.data().role || 'Admin'
    }
    if (ADMIN_EMULATOR_USERS.includes(user.email)) {
      return 'Admin'
    }
  } catch (err) {
    console.warn('Error checking Firestore admin role:', err)
  }
  return null
}

export function useAuth() {
  const [user, setUser] = useState(() => auth.currentUser)
  const [loading, setLoading] = useState(false)
  const [role, setRole] = useState(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        try {
          const tokenResult = await getIdTokenResult(firebaseUser, true)
          const tokenRole = tokenResult.claims.role ?? null
          if (tokenRole) {
            setRole(tokenRole)
          } else {
            const firestoreRole = await checkFirestoreAdminRole(firebaseUser)
            setRole(firestoreRole)
          }
        } catch (err) {
          console.warn('Error getting ID token result:', err)
          const firestoreRole = await checkFirestoreAdminRole(firebaseUser)
          setRole(firestoreRole)
        }
      } else {
        setRole(null)
      }
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const register = async (email, password, displayName) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    if (displayName) {
      await updateProfile(credential.user, { displayName })
    }
    return credential
  }

  const login = async (email, password) => {
    return signInWithEmailAndPassword(auth, email, password)
  }

  const logout = () => signOut(auth)

  return { user, loading, role, register, login, logout }
}
