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
import { findUniqueSlug } from '../lib/slug'

export const KATEGORIEN = [
  'Yoga',
  'Meditation',
  'Tanz',
  'Singen',
  'Atemarbeit',
  'Sonstiges'
]

export const BEZIRKE = [
  'Bregenz',
  'Dornbirn',
  'Feldkirch',
  'Bludenz'
]

function normalizeEvents(events) {
  return events.map(event => ({
    ...event,
    categories: event.categories && event.categories.length > 0
      ? event.categories
      : ['Sonstiges'],
    bezirk: event.bezirk || ''
  }))
}

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
      const normalized = normalizeEvents(eventData)
      normalized.sort((a, b) => (a.date > b.date ? 1 : -1))
      setEvents(normalized)
      setLoading(false)
    })

    return unsubscribe
  }, [user])

  const addEvent = async (eventData) => {
    const slug = await findUniqueSlug(eventData.title, eventData.place, eventData.date)
    return addDoc(collection(db, 'events'), {
      ...eventData,
      slug,
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
        const normalized = normalizeEvents(eventData)
        normalized.sort((a, b) => (a.date > b.date ? 1 : -1))
        setEvents(normalized)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [])

  return { events, loading, error }
}
