import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Select from 'react-select'
import { useEvents, KATEGORIEN, BEZIRKE } from '../hooks/useEvents'
import { useAuth } from '../hooks/useAuth'
import { uploadImage, getImageDimensions, validateAspectRatio } from '../lib/imageUpload'
import { ArrowLeft, Save, Image, X } from 'lucide-react'
import ConfirmDialog from './ConfirmDialog'
import './EventForm.css'

const INITIAL_STATE = {
  title: '',
  date: '',
  time: '',
  endTime: '',
  endDate: '',
  place: '',
  contribution: 'free',
  fee: '',
  description: '',
  link: '',
  recurrence: 'none',
  recurrenceEndDate: '',
  categories: [],
  bezirk: ''
}

const kategorieOptions = KATEGORIEN.map(k => ({ value: k, label: k }))

export default function EventForm({ event }) {
  const [formData, setFormData] = useState(event ? {
    title: event.title || '',
    date: event.date || '',
    time: event.time || '',
    endTime: event.endTime || '',
    endDate: event.endDate || '',
    place: event.place || '',
    contribution: event.contribution || 'free',
    fee: event.fee || '',
    description: event.description || '',
    link: event.link || '',
    recurrence: event.recurrence || 'none',
    recurrenceEndDate: event.recurrenceEndDate || '',
    categories: event.categories && event.categories.length > 0 ? event.categories : [],
    bezirk: event.bezirk || ''
  } : INITIAL_STATE)

  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(event?.imageUrl || '')
  const [imageRemoved, setImageRemoved] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [resubmitWarning, setResubmitWarning] = useState(false)
  const fileInputRef = useRef(null)
  const { user } = useAuth()
  const { role } = useAuth()
  const { addEvent, updateEvent } = useEvents(user)
  const navigate = useNavigate()

  const isAdmin = role === 'Admin'
  const isEdit = Boolean(event)
  const wasApproved = event?.status === 'approved'

  const getFormTitle = () => {
    if (isEdit) return 'Event bearbeiten'
    return isAdmin ? 'Neues Event erstellen' : 'Event zur Genehmigung einreichen'
  }

  const getSubmitButtonText = () => {
    if (loading || imageUploading) return 'Speichern...'
    if (isEdit) return wasApproved && !isAdmin ? 'Erneut einreichen' : 'Änderungen speichern'
    return isAdmin ? 'Event erstellen' : 'Einreichen zur Genehmigung'
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.title.trim()) newErrors.title = 'Titel ist erforderlich'
    if (!formData.date) newErrors.date = 'Datum ist erforderlich'
    if (!formData.place.trim()) newErrors.place = 'Ort ist erforderlich'
    if (!formData.bezirk) newErrors.bezirk = 'Bezirk ist erforderlich'
    if (formData.categories.length === 0) {
      newErrors.categories = 'Mindestens eine Kategorie ist erforderlich'
    }
    if (formData.contribution === 'fee' && (!formData.fee || formData.fee <= 0)) {
      newErrors.fee = 'Bitte gib einen gültigen Betrag ein'
    }
    return newErrors
  }

  const handleImageSelect = async (file) => {
    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrors(prev => ({ ...prev, image: 'Nur JPEG, PNG und WebP erlaubt' }))
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, image: 'Bild ist zu groß (max. 5MB)' }))
      return
    }

    const dimensions = await getImageDimensions(file)
    if (!validateAspectRatio(dimensions.width, dimensions.height)) {
      setErrors(prev => ({ ...prev, image: 'Das Bild muss ein Seitenverhältnis von 16:9 haben (z.B. 1600x900px oder 1920x1080px). Bitte wähle ein anderes Bild oder beschnitte es vor dem Upload.' }))
      return
    }

    setErrors(prev => ({ ...prev, image: null }))
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setImageRemoved(false)
  }

  const handleImageSelectFromInput = (e) => {
    handleImageSelect(e.target.files[0])
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleImageSelect(file)
    }
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

  const handleCategoriesChange = (selectedOptions) => {
    setFormData(prev => ({
      ...prev,
      categories: selectedOptions ? selectedOptions.map(opt => opt.value) : []
    }))
    if (errors.categories) {
      setErrors(prev => ({ ...prev, categories: null }))
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

    const eventData = {
      title: formData.title.trim(),
      date: formData.date,
      time: formData.time || '',
      endTime: formData.endTime || '',
      endDate: formData.endDate || '',
      place: formData.place.trim(),
      contribution: formData.contribution,
      fee: formData.contribution === 'fee' ? parseFloat(formData.fee) : null,
      description: formData.description.trim(),
      link: formData.link.trim(),
      recurrence: formData.recurrence || 'none',
      recurrenceEndDate: formData.recurrence === 'none' ? '' : (formData.recurrenceEndDate || ''),
      categories: formData.categories.length > 0 ? formData.categories : ['Sonstiges'],
      bezirk: formData.bezirk,
      imageUrl: null
    }

    if (!isAdmin) {
      if (isEdit && wasApproved) {
        setResubmitWarning(true)
        eventData.status = 'pending'
      } else if (!isEdit) {
        setShowConfirmModal(true)
        return
      } else {
        eventData.status = 'pending'
      }
    } else {
      eventData.status = 'approved'
    }

    await saveEvent(eventData)
  }

  const saveEvent = async (eventData) => {
    setLoading(true)
    setShowConfirmModal(false)
    setResubmitWarning(false)

    try {
      let docRef
      if (event) {
        await updateEvent(event.id, eventData)
        docRef = { id: event.id }
      } else {
        docRef = await addEvent(eventData, eventData.status || 'pending')
      }

      if (imageFile) {
        const newImageUrl = await handleImageUpload()
        await updateEvent(docRef.id, { imageUrl: newImageUrl })
      } else if (imageRemoved && event?.imageUrl) {
        await updateEvent(event.id, { imageUrl: null })
      }
      navigate('/admin')
    } catch (err) {
      console.error('Event save failed:', err.code, err.message)
      setSubmitError('Event konnte nicht gespeichert werden. Bitte versuche es erneut.')
      setLoading(false)
    }
  }

  const confirmSubmit = () => {
    const eventData = {
      title: formData.title.trim(),
      date: formData.date,
      time: formData.time || '',
      endTime: formData.endTime || '',
      endDate: formData.endDate || '',
      place: formData.place.trim(),
      contribution: formData.contribution,
      fee: formData.contribution === 'fee' ? parseFloat(formData.fee) : null,
      description: formData.description.trim(),
      link: formData.link.trim(),
      recurrence: formData.recurrence || 'none',
      recurrenceEndDate: formData.recurrence === 'none' ? '' : (formData.recurrenceEndDate || ''),
      categories: formData.categories.length > 0 ? formData.categories : ['Sonstiges'],
      bezirk: formData.bezirk,
      imageUrl: null,
      status: 'pending'
    }
    saveEvent(eventData)
  }

   return (
    <div className="event-form-page">
      <div className="event-form-container">
        <div className="event-form-header">
          <button onClick={() => navigate('/admin')} className="btn btn-secondary back-btn">
            <ArrowLeft size={18} />
            <span>Zurück</span>
          </button>
          <h1>{getFormTitle()}</h1>
        </div>

        <form onSubmit={handleSubmit} className="event-form">
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
                className={`image-upload-area ${isDraggingOver ? 'drag-over' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Image size={24} />
                <span>{isDraggingOver ? 'Datei hier ablegen' : 'Bild auswählen oder Datei hierher ziehen (JPEG, PNG, WebP, max. 500KB)'}</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageSelectFromInput}
              style={{ display: 'none' }}
            />
            {errors.image && <span className="error-text">{errors.image}</span>}
            {imageUploading && <span className="uploading-text">Bild wird komprimiert und hochgeladen...</span>}
          </div>

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

          <div className="form-group">
            <label htmlFor="categories">Kategorien</label>
            <Select
              id="categories"
              isMulti
              options={kategorieOptions}
              value={kategorieOptions.filter(opt => formData.categories.includes(opt.value))}
              onChange={handleCategoriesChange}
              placeholder="Kategorie auswählen..."
              className="kategorie-select"
              classNamePrefix="kategorie"
            />
            {errors.categories && <span className="error-text">{errors.categories}</span>}
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

            <div className="form-group">
              <label htmlFor="endTime">Bis (optional)</label>
              <input
                id="endTime"
                name="endTime"
                type="time"
                value={formData.endTime}
                onChange={handleChange}
              />
            </div>
          </div>

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

          <div className="form-group">
            <label>Wiederholung</label>
            <div className="radio-group">
              <label className={`radio-label ${formData.recurrence === 'none' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="recurrence"
                  value="none"
                  checked={formData.recurrence === 'none'}
                  onChange={handleChange}
                />
                <span>Keine</span>
              </label>
              <label className={`radio-label ${formData.recurrence === 'weekly' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="recurrence"
                  value="weekly"
                  checked={formData.recurrence === 'weekly'}
                  onChange={handleChange}
                />
                <span>Wöchentlich</span>
              </label>
              <label className={`radio-label ${formData.recurrence === 'biweekly' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="recurrence"
                  value="biweekly"
                  checked={formData.recurrence === 'biweekly'}
                  onChange={handleChange}
                />
                <span>Zweiwöchentlich</span>
              </label>
              <label className={`radio-label ${formData.recurrence === 'monthly' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="recurrence"
                  value="monthly"
                  checked={formData.recurrence === 'monthly'}
                  onChange={handleChange}
                />
                <span>Monatlich</span>
              </label>
            </div>
          </div>

          {formData.recurrence !== 'none' && (
            <div className="form-group">
              <label htmlFor="recurrenceEndDate">Wiederholung bis (optional)</label>
              <input
                id="recurrenceEndDate"
                name="recurrenceEndDate"
                type="date"
                value={formData.recurrenceEndDate}
                onChange={handleChange}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="bezirk">Bezirk *</label>
            <select
              id="bezirk"
              name="bezirk"
              value={formData.bezirk}
              onChange={handleChange}
              className={errors.bezirk ? 'input-error' : ''}
            >
              <option value="">Bezirk auswählen...</option>
              {BEZIRKE.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            {errors.bezirk && <span className="error-text">{errors.bezirk}</span>}
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

          {resubmitWarning && (
            <div className="resubmit-warning">
              <p><strong>Hinweis:</strong> Durch das erneute Einreichen wird das Event wieder auf "Ausstehend" gesetzt und muss erneut durch einen Admin genehmigt werden, bevor es öffentlich angezeigt wird.</p>
            </div>
          )}

          <div className="form-actions">
            <button type="button" onClick={() => navigate('/admin')} className="btn btn-secondary">
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || imageUploading}>
              <Save size={18} />
              <span>{getSubmitButtonText()}</span>
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        isOpen={showConfirmModal}
        title="Event zur Genehmigung einreichen"
        message="Ihr Event wird zur Prüfung eingereicht. Erst nach Genehmigung durch einen Admin wird es öffentlich angezeigt."
        confirmLabel="Einreichen"
        cancelLabel="Abbrechen"
        onConfirm={confirmSubmit}
        onCancel={() => setShowConfirmModal(false)}
        loading={loading}
      />
    </div>
  )
}
