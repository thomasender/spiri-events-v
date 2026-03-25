import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEvents } from '../hooks/useEvents'
import { useAuth } from '../hooks/useAuth'
import { ArrowLeft, Save } from 'lucide-react'
import './EventForm.css'

const INITIAL_STATE = {
  title: '',
  date: '',
  time: '',
  place: '',
  contribution: 'free',
  fee: '',
  description: '',
  link: ''
}

export default function EventForm({ event }) {
  const [formData, setFormData] = useState(event ? {
    title: event.title || '',
    date: event.date || '',
    time: event.time || '',
    place: event.place || '',
    contribution: event.contribution || 'free',
    fee: event.fee || '',
    description: event.description || '',
    link: event.link || ''
  } : INITIAL_STATE)

  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const { user } = useAuth()
  const { addEvent, updateEvent } = useEvents(user)
  const navigate = useNavigate()

  const validate = () => {
    const newErrors = {}
    if (!formData.title.trim()) newErrors.title = 'Titel ist erforderlich'
    if (!formData.date) newErrors.date = 'Datum ist erforderlich'
    if (!formData.place.trim()) newErrors.place = 'Ort ist erforderlich'
    if (formData.contribution === 'fee' && (!formData.fee || formData.fee <= 0)) {
      newErrors.fee = 'Bitte gib einen gültigen Betrag ein'
    }
    return newErrors
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')

    const newErrors = validate()
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setLoading(true)

    try {
      const eventData = {
        title: formData.title.trim(),
        date: formData.date,
        time: formData.time || '',
        place: formData.place.trim(),
        contribution: formData.contribution,
        fee: formData.contribution === 'fee' ? parseFloat(formData.fee) : null,
        description: formData.description.trim(),
        link: formData.link.trim()
      }

      if (event) {
        await updateEvent(event.id, eventData)
      } else {
        await addEvent(eventData)
      }
      navigate('/admin')
    } catch (err) {
      setSubmitError('Event konnte nicht gespeichert werden. Bitte versuche es erneut.')
    } finally {
      setLoading(false)
    }
  }

  const isEdit = Boolean(event)

  return (
    <div className="event-form-page">
      <div className="event-form-container">
        <div className="event-form-header">
          <button onClick={() => navigate('/admin')} className="btn btn-secondary back-btn">
            <ArrowLeft size={18} />
            <span>Zurück</span>
          </button>
          <h1>{isEdit ? 'Event bearbeiten' : 'Neues Event erstellen'}</h1>
        </div>

        <form onSubmit={handleSubmit} className="event-form">
          <div className="form-group">
            <label htmlFor="title">Titel *</label>
            <input
              id="title"
              name="title"
              type="text"
              value={formData.title}
              onChange={handleChange}
              placeholder="z.B. Morgen-Yoga im Park"
              className={errors.title ? 'input-error' : ''}
            />
            {errors.title && <span className="error-text">{errors.title}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="date">Datum *</label>
              <input
                id="date"
                name="date"
                type="date"
                value={formData.date}
                onChange={handleChange}
                className={errors.date ? 'input-error' : ''}
              />
              {errors.date && <span className="error-text">{errors.date}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="time">Uhrzeit</label>
              <input
                id="time"
                name="time"
                type="time"
                value={formData.time}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="place">Ort / Adresse *</label>
            <input
              id="place"
              name="place"
              type="text"
              value={formData.place}
              onChange={handleChange}
              placeholder="z.B. Yogastudio Mitte, Stadtstraße 12, 6900 Bregenz"
              className={errors.place ? 'input-error' : ''}
            />
            {errors.place && <span className="error-text">{errors.place}</span>}
          </div>

          <div className="form-group">
            <label>Beitrag</label>
            <div className="radio-group">
              <label className={`radio-label ${formData.contribution === 'free' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="contribution"
                  value="free"
                  checked={formData.contribution === 'free'}
                  onChange={handleChange}
                />
                <span>Kostenlos</span>
              </label>
              <label className={`radio-label ${formData.contribution === 'fee' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="contribution"
                  value="fee"
                  checked={formData.contribution === 'fee'}
                  onChange={handleChange}
                />
                <span>Gebühr</span>
              </label>
            </div>
          </div>

          {formData.contribution === 'fee' && (
            <div className="form-group">
              <label htmlFor="fee">Betrag (€) *</label>
              <input
                id="fee"
                name="fee"
                type="number"
                min="0"
                step="0.01"
                value={formData.fee}
                onChange={handleChange}
                placeholder="z.B. 15.00"
                className={errors.fee ? 'input-error' : ''}
              />
              {errors.fee && <span className="error-text">{errors.fee}</span>}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="description">Beschreibung</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Beschreibe das Event... (Was erwartet die Teilnehmer? Für wen ist es geeignet? Was sollte man mitbringen?)"
              rows={5}
            />
          </div>

          <div className="form-group">
            <label htmlFor="link">Link (optional)</label>
            <input
              id="link"
              name="link"
              type="url"
              value={formData.link}
              onChange={handleChange}
              placeholder="https://... (Anmeldung oder weitere Infos)"
            />
          </div>

          {submitError && <p className="error-text submit-error">{submitError}</p>}

          <div className="form-actions">
            <button type="button" onClick={() => navigate('/admin')} className="btn btn-secondary">
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Save size={18} />
              <span>{loading ? 'Speichern...' : 'Event speichern'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
