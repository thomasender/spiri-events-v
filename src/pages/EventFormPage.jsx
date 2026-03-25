import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useEvents } from '../hooks/useEvents'
import { useAuth } from '../hooks/useAuth'
import EventForm from '../components/EventForm'

export default function EventFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { events, loading: eventsLoading } = useEvents(user)
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)

  const isEdit = Boolean(id)

  useEffect(() => {
    // Wait for auth and events to load before checking anything
    if (eventsLoading) return

    if (!user) {
      navigate('/login')
      return
    }

    if (isEdit) {
      const found = events.find(e => e.id === id)
      if (found) {
        setEvent(found)
      } else if (events.length > 0) {
        // Events loaded but this specific one wasn't found
        navigate('/admin')
      }
      // If events haven't loaded yet, keep waiting
      setLoading(false)
    } else {
      setLoading(false)
    }
  }, [id, user, events, eventsLoading, navigate, isEdit])

  if (loading || eventsLoading) {
    return <div className="loading-spinner"></div>
  }

  if (isEdit && !event) {
    return null
  }

  return <EventForm event={event} />
}
