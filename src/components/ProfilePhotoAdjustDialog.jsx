import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import FocalPointPicker from './FocalPointPicker';
import { MAX_PHOTO_ZOOM, MIN_PHOTO_ZOOM } from './AvatarImage';
import './ProfilePhotoAdjustDialog.css';

// Modal editor for the profile photo's focal point and zoom. Works on a draft
// copy: nothing changes on the profile form until "Übernehmen" is pressed.
// Uses the native <dialog> element, which gives a focus trap, Esc-to-close and
// an inert background for free.
export default function ProfilePhotoAdjustDialog({
  open,
  photoURL,
  focalPoint,
  zoom,
  onApply,
  onClose,
}) {
  const dialogRef = useRef(null);
  const [draftFocal, setDraftFocal] = useState(focalPoint);
  const [draftZoom, setDraftZoom] = useState(zoom || 1);

  useEffect(() => {
    if (!open) return;
    setDraftFocal(focalPoint);
    setDraftZoom(zoom || 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  if (!photoURL) return null;

  return (
    <dialog
      ref={dialogRef}
      className="photo-adjust-dialog"
      aria-labelledby="photo-adjust-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose?.();
      }}
      data-testid="photo-adjust-dialog"
    >
      <div className="photo-adjust-header">
        <h3 id="photo-adjust-title">Foto anpassen</h3>
        <button
          type="button"
          className="photo-adjust-close"
          onClick={onClose}
          aria-label="Schließen"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="photo-adjust-body">
        <p className="photo-adjust-hint">
          Tippe oder ziehe auf das Foto, um den wichtigen Bereich (z. B. dein Gesicht) zu wählen,
          und zoome bei Bedarf hinein.
        </p>

        <div className="photo-adjust-zoom">
          <label htmlFor="profile-photo-zoom">Hineinzoomen</label>
          <input
            id="profile-photo-zoom"
            type="range"
            min={MIN_PHOTO_ZOOM}
            max={MAX_PHOTO_ZOOM}
            step={0.05}
            value={draftZoom}
            onChange={(e) => setDraftZoom(Number(e.target.value))}
            data-testid="profile-photo-zoom"
          />
          <output htmlFor="profile-photo-zoom">{Math.round(draftZoom * 100)} %</output>
        </div>

        <FocalPointPicker
          imageUrl={photoURL}
          value={draftFocal}
          onChange={setDraftFocal}
          cropAspect={1}
          zoom={draftZoom}
          onZoomChange={setDraftZoom}
          minZoom={MIN_PHOTO_ZOOM}
          maxZoom={MAX_PHOTO_ZOOM}
          round
          ariaLabel="Fokuspunkt des Profilfotos festlegen"
          testId="profile-focal-point-picker"
        />
      </div>

      <div className="photo-adjust-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Abbrechen
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onApply?.({ focalPoint: draftFocal, zoom: draftZoom })}
          data-testid="photo-adjust-apply"
        >
          Übernehmen
        </button>
      </div>
    </dialog>
  );
}
