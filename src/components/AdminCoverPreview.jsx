import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import FocalPointPicker from './FocalPointPicker';
import EventCoverImage from './EventCoverImage';
import {
  DEFAULT_FOCAL_POINT,
  MAX_IMAGE_ZOOM,
  MIN_IMAGE_ZOOM,
  isDefaultFocalPoint,
  normalizeFocalPoint,
  normalizeImageZoom,
} from '../lib/eventImage';
import './AdminCoverPreview.css';

/**
 * Admin editor for the cover crop (focal point + zoom), same controls as the
 * organizer has in the event form. Saves straight to the event, without a
 * status change. Default values are stored as null, like the event form does.
 */
function AdminCoverCropEditor({ event, onSaved, onCancel }) {
  const [focalPoint, setFocalPoint] = useState(
    normalizeFocalPoint(event.imageFocalPoint) ?? { ...DEFAULT_FOCAL_POINT }
  );
  const [zoom, setZoom] = useState(normalizeImageZoom(event.imageZoom));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    const patch = {
      imageFocalPoint: isDefaultFocalPoint(focalPoint) ? null : focalPoint,
      imageZoom: zoom <= MIN_IMAGE_ZOOM ? null : zoom,
    };
    try {
      await updateDoc(doc(db, 'events', event.id), patch);
      onSaved(patch);
    } catch {
      setError('Der Ausschnitt konnte nicht gespeichert werden. Bitte versuche es erneut.');
      setSaving(false);
    }
  };

  return (
    <div className="admin-cover-preview" data-testid="admin-cover-crop-editor">
      <FocalPointPicker
        imageUrl={event.imageUrl}
        value={focalPoint}
        onChange={setFocalPoint}
        zoom={zoom}
        onZoomChange={setZoom}
        showZoomSlider
        minZoom={MIN_IMAGE_ZOOM}
        maxZoom={MAX_IMAGE_ZOOM}
        ariaLabel="Ausschnitt des Titelbilds festlegen"
        testId="admin-cover-focal-picker"
        info="Tippe oder ziehe auf das Foto, um den wichtigsten Bereich zu wählen, und zoome bei Bedarf hinein."
      />
      {error && (
        <p className="error-text" data-testid="admin-cover-crop-error">
          {error}
        </p>
      )}
      <div className="admin-cover-preview-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={saving}
          data-testid="admin-cover-crop-save"
        >
          {saving ? 'Speichern…' : 'Ausschnitt speichern'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={saving}
          data-testid="admin-cover-crop-cancel"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

/**
 * Review aid: admins see the cover as the tile and the calendar show it, for
 * events in review (pending), and can move and zoom the crop right there.
 * `onCropSaved` receives `{ imageFocalPoint, imageZoom }` as stored.
 */
export default function AdminCoverPreview({ event, isAdmin, onCropSaved }) {
  const [editing, setEditing] = useState(false);
  if (!isAdmin || event?.status !== 'pending' || !event.imageUrl) return null;

  if (editing) {
    return (
      <AdminCoverCropEditor
        event={event}
        onSaved={(patch) => {
          onCropSaved?.(patch);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="admin-cover-preview" data-testid="admin-cover-preview">
      <div className="admin-cover-preview-tile">
        <EventCoverImage event={event} alt="" loading="eager" />
      </div>
      <p className="instagram-image-picker-hint">
        Titelbild-Ausschnitt wie in Kalender und Kachel.
      </p>
      <div className="admin-cover-preview-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setEditing(true)}
          data-testid="admin-cover-crop-edit"
        >
          Titelbild-Ausschnitt bearbeiten
        </button>
      </div>
    </div>
  );
}
