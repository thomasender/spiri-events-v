import { useState, useEffect } from 'react'
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export function useEvents(user) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setEvents([])

    if (!user) {
      setLoading(false)
      return
    }

    const q = query(
      collection(db, 'events'),
      where('createdBy', '==', user.uid)
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const eventData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      // Sort client-side to avoid needing a composite index
      eventData.sort((a, b) => (a.date > b.date ? 1 : -1))
      setEvents(eventData)
      setLoading(false)
    })

    return unsubscribe
  }, [user])

  const addEvent = async (eventData) => {
    return addDoc(collection(db, 'events'), {
      ...eventData,
      createdBy: user.uid,
      createdAt: serverTimestamp()
    })
  }

  const updateEvent = async (id, eventData) => {
    const ref = doc(db, 'events', id)
    return updateDoc(ref, eventData)
  }

  const deleteEvent = async (id) => {
    const ref = doc(db, 'events', id)
    return deleteDoc(ref)
  }

  return { events, loading, addEvent, updateEvent, deleteEvent }
}

export function useAllEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // No orderBy - sort client-side to avoid needing a composite index
    const q = query(collection(db, 'events'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const eventData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        // Sort client-side
        eventData.sort((a, b) => (a.date > b.date ? 1 : -1))
        console.log('[useAllEvents] Received', eventData.length, 'events:', eventData.map(e => e.title))
        setEvents(eventData)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('[useAllEvents] Firestore error:', err.code, err.message)
        setError(err.message)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [])

  return { events, loading, error }
}
