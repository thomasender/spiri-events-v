import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useEventById } from '../hooks/useEvents'
import { useAuth } from '../hooks/useAuth'
import EventForm from '../components/EventForm'

export default function EventFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { event, loading: eventLoading, error } = useEventById(id)
  const [checkedAuth, setCheckedAuth] = useState(false)

  const isEdit = Boolean(id)

  useEffect(() => {
    if (!user && checkedAuth) {
      navigate('/login')
    } else if (user) {
      setCheckedAuth(true)
    } else {
      setCheckedAuth(true)
    }
  }, [user, checkedAuth, navigate])

  if (!checkedAuth || eventLoading) {
    return <div className="loading-spinner"></div>
  }

  if (!user) {
    return <div className="loading-spinner"></div>
  }

  if (isEdit && (error || !event)) {
    navigate('/admin')
    return null
  }

  return <EventForm event={event} />
}
