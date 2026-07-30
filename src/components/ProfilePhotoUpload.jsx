import { useRef, useState } from 'react';
import { User } from 'lucide-react';
import { uploadProfileImage, MAX_INPUT_SIZE_BYTES } from '../lib/imageUpload';
import './ProfileForm.css';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function ProfilePhotoUpload({ uid, photoURL, onUploaded, onRemoved }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
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
    setProgress(0);
    try {
      const url = await uploadProfileImage(file, uid, { onProgress: setProgress });
      onUploaded?.(url);
    } catch (err) {
      console.error('Profile photo upload failed:', err);
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
    <div className="profile-photo-upload" data-testid="profile-photo-upload">
      <div className="profile-photo-preview">
        {photoURL ? <img src={photoURL} alt="Profilfoto" /> : <User size={40} aria-hidden="true" />}
      </div>

      <div className="profile-photo-controls">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {photoURL ? 'Foto ändern' : 'Foto hochladen'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => handleSelect(e.target.files?.[0])}
          data-testid="profile-photo-input"
        />
        {photoURL && !uploading && (
          <button
            type="button"
            className="btn-link"
            onClick={handleRemove}
            data-testid="profile-photo-remove"
          >
            Foto entfernen
          </button>
        )}
        {uploading && (
          <span className="photo-progress" data-testid="profile-photo-progress">
            Wird hochgeladen… {progress}%
          </span>
        )}
        {error && (
          <span className="photo-error" data-testid="profile-photo-error">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
