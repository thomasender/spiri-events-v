import { AlertTriangle } from 'lucide-react';
import FocalPointPicker from './FocalPointPicker';
import {
  INSTAGRAM_CROP_ASPECT,
  MAX_INSTAGRAM_ZOOM,
  MIN_INSTAGRAM_ZOOM,
} from '../utils/instagramImageChoice';
import './InstagramImagePicker.css';

/**
 * Lets the organizer pick which of their photos is used for the Instagram
 * post and the 4:5 crop (focal point + zoom). Controlled: `value` is
 * `{ source, focalPoint, zoom }`, `candidates` comes from
 * buildInstagramImageCandidates().
 */
export default function InstagramImagePicker({ candidates, value, onChange }) {
  if (!candidates || candidates.length === 0) {
    return (
      <p className="instagram-image-picker-empty" data-testid="instagram-image-picker-empty">
        Du hast kein Foto hochgeladen. Für den Instagram-Beitrag verwenden wir dann ein passendes
        Stimmungsbild.
      </p>
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
