import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './PasswordInput.css';

/**
 * Password input with a show/hide toggle button inside the field.
 * All props are passed through to the <input>; `className` is applied to the input.
 */
export default function PasswordInput({ className = '', ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const label = visible ? 'Passwort verbergen' : 'Passwort anzeigen';

  return (
    <div className="password-input">
      <input
        {...inputProps}
        type={visible ? 'text' : 'password'}
        className={`password-input__field ${className}`.trim()}
      />
      <button
        type="button"
        className="password-input__toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}
