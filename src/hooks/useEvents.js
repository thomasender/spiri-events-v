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
  serverTimestamp,
  Timestamp,
  getFirestore
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { findUniqueSlug } from '../lib/slug'
import { useAuth } from './useAuth'
import { auth } from '../lib/firebase'
import { getApp } from 'firebase/app'

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
    bezirk: event.bezirk || '',
    status: event.status || 'pending'
  }))
}

export function useEvents(user) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
        console.error('useEvents error:', err)
        setError(err.message)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [user])

  const addEvent = async (eventData, status = 'pending') => {
    const slug = await findUniqueSlug(eventData.title, eventData.place, eventData.date)
    return addDoc(collection(db, 'events'), {
      ...eventData,
      slug,
      status,
      createdBy: user.uid,
      createdAt: serverTimestamp()
    })
  }

  const updateEvent = async (id, eventData) => {
    const ref = doc(db, 'events', id)
    return updateDoc(ref, {
      ...eventData,
      updatedAt: serverTimestamp()
    })
  }

  const deleteEvent = async (id) => {
    const ref = doc(db, 'events', id)
    return deleteDoc(ref)
  }

  return { events, loading, addEvent, updateEvent, deleteEvent }
}

export function usePendingEvents() {
  const { user, role } = useAuth()
  const [pendingEvents, setPendingEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setPendingEvents([])

    let q
    if (role === 'Admin') {
      q = query(
        collection(db, 'events'),
        where('status', '==', 'pending')
      )
    } else {
      q = query(
        collection(db, 'events'),
        where('status', '==', 'pending'),
        where('createdBy', '==', user.uid)
      )
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const eventData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        const normalized = normalizeEvents(eventData)
        normalized.sort((a, b) => (a.date > b.date ? 1 : -1))
        setPendingEvents(normalized)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('usePendingEvents error:', err)
        setError(err.message)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [user, role])

  const approveEvent = async (eventId) => {
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true)
    }
    const freshDb = getFirestore(getApp())
    const ref = doc(freshDb, 'events', eventId)
    return updateDoc(ref, {
      status: 'approved',
      approvedBy: user.uid,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  }

  return { pendingEvents, loading, approveEvent }
}

export function useAllEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const q = query(
      collection(db, 'events'),
      where('status', '==', 'approved')
    )

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
