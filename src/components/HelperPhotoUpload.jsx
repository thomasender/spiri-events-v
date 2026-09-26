import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { uploadHelperImage, MAX_INPUT_SIZE_BYTES } from '../lib/imageUpload';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Upload control for the helper edit dialog. Mirrors ProfilePhotoUpload but
// stores the image under helpers/photos/ (the admin-only storage path; the
// per-user avatar bucket is owner-only and cannot be written by an admin on
// someone else's behalf).
export default function HelperPhotoUpload({ photoURL, onUploaded, onRemoved, disabled }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleSelect = async (file) => {
    if (!file) return;
    setError('');
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Nur JPEG, PNG und WebP sind erlaubt.');
      return;
    }
    if (file.size > MAX_INPUT_SIZE_BYTES) {
      setError(`Bild ist zu groß (max. ${Math.round(MAX_INPUT_SIZE_BYTES / 1024 / 1024)} MB).`);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadHelperImage(file);
      onUploaded?.(url);
    } catch (err) {
      console.error('Helper photo upload failed:', err);
      setError('Foto konnte nicht hochgeladen werden. Bitte versuche es erneut.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    onRemoved?.();
  };

  return (
    <div className="helper-photo-upload" data-testid="helper-photo-upload">
      <div className="helper-photo-preview">
        {photoURL ? (
          <img src={photoURL} alt="Helfer-Foto" data-testid="helper-photo-preview" />
        ) : (
          <span className="helper-photo-preview-empty" data-testid="helper-photo-placeholder-empty">
            Kein Foto
          </span>
        )}
      </div>
      <div className="helper-photo-controls">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          data-testid="helper-photo-upload-btn"
        >
          <Upload size={16} aria-hidden="true" />
          <span>
            {uploading ? 'Wird hochgeladen…' : photoURL ? 'Foto ersetzen' : 'Foto hochladen'}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => handleSelect(e.target.files?.[0])}
          style={{ display: 'none' }}
          data-testid="helper-photo-upload-input"
        />
        {photoURL && !uploading && (
          <button
            type="button"
            className="btn-link"
            onClick={handleRemove}
            disabled={disabled}
            data-testid="helper-photo-remove"
          >
            Foto entfernen
          </button>
        )}
        {error && (
          <span className="helper-photo-error" role="alert" data-testid="helper-photo-error">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
