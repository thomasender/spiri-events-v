import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEvents } from '../hooks/useEvents'
import { useAuth } from '../hooks/useAuth'
import { uploadImage } from '../lib/imageUpload'
import { ArrowLeft, Save, Image, X } from 'lucide-react'
import './EventForm.css'

const INITIAL_STATE = {
  title: '',
  date: '',
  time: '',
  endDate: '',
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
    endDate: event.endDate || '',
    place: event.place || '',
    contribution: event.contribution || 'free',
    fee: event.fee || '',
    description: event.description || '',
    link: event.link || ''
  } : INITIAL_STATE)

  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(event?.imageUrl || '')
  const [imageRemoved, setImageRemoved] = useState(false) // Track if user explicitly removed image
  const [imageUploading, setImageUploading] = useState(false)
  const fileInputRef = useRef(null)
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

  const handleImageSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrors(prev => ({ ...prev, image: 'Nur JPEG, PNG und WebP erlaubt' }))
      return
    }

    // Validate file size (show error if over 5MB before compression)
    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, image: 'Bild ist zu groß (max. 5MB)' }))
      return
    }

    setErrors(prev => ({ ...prev, image: null }))
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setImageRemoved(false)
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview('')
    setImageRemoved(true)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleImageUpload = async () => {
    if (!imageFile) return null

    setImageUploading(true)
    try {
      return await uploadImage(imageFile)
    } catch (err) {
      console.error('Image upload failed:', err)
      throw new Error('Bild-Upload fehlgeschlagen')
    } finally {
      setImageUploading(false)
    }
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
      // First, create the event (without imageUrl) to get the real Firestore ID
      const eventData = {
        title: formData.title.trim(),
        date: formData.date,
        time: formData.time || '',
        endDate: formData.endDate || '',
        place: formData.place.trim(),
        contribution: formData.contribution,
        fee: formData.contribution === 'fee' ? parseFloat(formData.fee) : null,
        description: formData.description.trim(),
        link: formData.link.trim(),
        imageUrl: null
      }

      let docRef
      if (event) {
        await updateEvent(event.id, eventData)
        docRef = { id: event.id }
      } else {
        docRef = await addEvent(eventData)
      }

      // Handle image upload after we have the real document ID
      if (imageFile) {
        // Upload new image
        const newImageUrl = await handleImageUpload()
        // Update event with imageUrl
        await updateEvent(docRef.id, { imageUrl: newImageUrl })
      } else if (imageRemoved && event?.imageUrl) {
        // Image was explicitly removed by user
        await updateEvent(event.id, { imageUrl: null })
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

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="endDate">Enddatum (optional)</label>
              <input
                id="endDate"
                name="endDate"
                type="date"
                value={formData.endDate}
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

          <div className="form-group">
            <label>Bild (optional)</label>
            {imagePreview ? (
              <div className="image-preview-container">
                <img src={imagePreview} alt="Vorschau" className="image-preview" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="image-remove-btn"
                  aria-label="Bild entfernen"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div
                className="image-upload-area"
                onClick={() => fileInputRef.current?.click()}
              >
                <Image size={24} />
                <span>Bild auswählen (JPEG, PNG, WebP, max. 500KB)</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
            {errors.image && <span className="error-text">{errors.image}</span>}
            {imageUploading && <span className="uploading-text">Bild wird komprimiert und hochgeladen...</span>}
          </div>

          {submitError && <p className="error-text submit-error">{submitError}</p>}

          <div className="form-actions">
            <button type="button" onClick={() => navigate('/admin')} className="btn btn-secondary">
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || imageUploading}>
              <Save size={18} />
              <span>{loading || imageUploading ? 'Speichern...' : 'Event speichern'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
