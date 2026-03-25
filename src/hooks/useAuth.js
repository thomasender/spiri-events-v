import { useState, useEffect } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth'
import { auth } from '../lib/firebase'

export function useAuth() {
  // Start with currentUser (restored synchronously from localStorage by Firebase)
  // This prevents the loading:true on first render causing redirect
  const [user, setUser] = useState(() => auth.currentUser)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Even if currentUser was null on init, listen for auth changes
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
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

  return { user, loading, register, login, logout }
}
