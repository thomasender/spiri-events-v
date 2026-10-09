import { useRef } from 'react';
import { AlertTriangle, ImagePlus, X } from 'lucide-react';
import FocalPointPicker from './FocalPointPicker';
import {
  INSTAGRAM_CROP_ASPECT,
  INSTAGRAM_UPLOAD_SOURCE,
  MAX_INSTAGRAM_ZOOM,
  MIN_INSTAGRAM_ZOOM,
} from '../utils/instagramImageChoice';
import './InstagramImagePicker.css';

/**
 * Lets the organizer pick which of their photos is used for the Instagram
 * post and the 4:5 crop (focal point + zoom). Controlled: `value` is
 * `{ source, focalPoint, zoom }`, `candidates` comes from
 * buildInstagramImageCandidates(). `onUpload(file)` / `onRemoveUpload()`
 * manage an extra photo uploaded only for Instagram (e.g. portrait format).
 */
export default function InstagramImagePicker({
  candidates,
  value,
  onChange,
  onUpload,
  onRemoveUpload,
  uploadError,
}) {
  const fileInputRef = useRef(null);
  const hasUpload = candidates?.some((c) => c.source === INSTAGRAM_UPLOAD_SOURCE);

  const uploadControl = onUpload && (
    <div className="instagram-image-picker-upload">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
        data-testid="instagram-upload-input"
      />
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => fileInputRef.current?.click()}
        data-testid="instagram-upload-button"
      >
        <ImagePlus size={16} aria-hidden="true" />
        <span>
          {hasUpload ? 'Anderes Extra-Foto wählen' : 'Extra-Foto für Instagram hochladen'}
        </span>
      </button>
      {hasUpload && onRemoveUpload && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onRemoveUpload}
          data-testid="instagram-upload-remove"
        >
          <X size={16} aria-hidden="true" />
          <span>Extra-Foto entfernen</span>
        </button>
      )}
      <p className="instagram-image-picker-hint">
        Optional: Hier kannst du ein zusätzliches Foto nur für Instagram hochladen, am besten im
        Hochformat (4:5).
      </p>
      {uploadError && (
        <p className="error-text" data-testid="instagram-upload-error">
          {uploadError}
        </p>
      )}
    </div>
  );

  if (!candidates || candidates.length === 0) {
    return (
      <div className="instagram-image-picker" data-testid="instagram-image-picker">
        <p className="instagram-image-picker-empty" data-testid="instagram-image-picker-empty">
          Du hast kein Foto hochgeladen. Für den Instagram-Beitrag verwenden wir dann ein passendes
          Stimmungsbild.
        </p>
        {uploadControl}
      </div>
    );
  }

  const selected = candidates.find((c) => c.source === value?.source) ?? candidates[0];
  const zoom = value?.zoom ?? 1;
  const update = (patch) => onChange({ ...value, source: selected.source, ...patch });

  return (
    <div className="instagram-image-picker" data-testid="instagram-image-picker">
      <p className="instagram-image-picker-warning" role="note">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>
          Dein Foto wird auf Instagram potenziell sehr vielen Menschen gezeigt. Wähle deshalb ein
          möglichst aussagekräftiges Foto und einen Ausschnitt, der dein Event auf einen Blick
          zeigt.
        </span>
      </p>

      {uploadControl}

      {candidates.length > 1 && (
        <fieldset className="instagram-image-picker-choices">
          <legend>Welches Foto soll verwendet werden?</legend>
          <div className="instagram-image-picker-options">
            {candidates.map((c) => {
              const isSelected = c.source === selected.source;
              return (
                <button
                  key={c.source}
                  type="button"
                  className={`instagram-image-picker-option${isSelected ? ' is-selected' : ''}`}
                  aria-pressed={isSelected}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() =>
                    onChange({ source: c.source, focalPoint: { x: 0.5, y: 0.5 }, zoom: 1 })
                  }
                  data-testid="instagram-image-option"
                >
                  <img src={c.previewUrl} alt="" draggable={false} />
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="instagram-image-picker-zoom">
        <label htmlFor="instagram-image-zoom">Hineinzoomen</label>
        <input
          id="instagram-image-zoom"
          type="range"
          min={MIN_INSTAGRAM_ZOOM}
          max={MAX_INSTAGRAM_ZOOM}
          step={0.05}
          value={zoom}
          onChange={(e) => update({ zoom: Number(e.target.value) })}
          data-testid="instagram-image-zoom"
        />
        <output htmlFor="instagram-image-zoom">{Math.round(zoom * 100)} %</output>
      </div>

      <FocalPointPicker
        key={selected.source}
        imageUrl={selected.previewUrl}
        value={value?.focalPoint}
        onChange={(focalPoint) => update({ focalPoint })}
        cropAspect={INSTAGRAM_CROP_ASPECT}
        zoom={zoom}
        onZoomChange={(z) => update({ zoom: z })}
        minZoom={MIN_INSTAGRAM_ZOOM}
        maxZoom={MAX_INSTAGRAM_ZOOM}
        ariaLabel="Bildausschnitt für Instagram festlegen"
        testId="instagram-focal-picker"
        info="Tippe oder ziehe auf das Foto, um den wichtigsten Bereich zu wählen, und zoome bei Bedarf hinein. Die Vorschau zeigt genau den Ausschnitt (Hochformat 4:5), der auf Instagram erscheint."
      />
    </div>
  );
}
