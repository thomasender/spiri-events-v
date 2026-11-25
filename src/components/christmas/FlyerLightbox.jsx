import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Slim lightbox on the native <dialog>: Esc, focus trap and backdrop come for free.
// A tap on the backdrop or the image closes it; the image can be pinch-zoomed.
export default function FlyerLightbox({ src, alt, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.documentElement.classList.add('xmas-no-scroll');
    return () => document.documentElement.classList.remove('xmas-no-scroll');
  }, []);

  return (
    <dialog
      ref={ref}
      className="xmas-lightbox"
      aria-label={alt}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current.close?.()}
      data-testid="xmas-lightbox"
    >
      <button
        type="button"
        className="xmas-lightbox-close"
        aria-label="Schließen"
        onClick={() => (ref.current?.close ? ref.current.close() : onClose())}
      >
        <X size={22} aria-hidden="true" />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={() => (ref.current?.close ? ref.current.close() : onClose())}
      />
    </dialog>
  );
}
