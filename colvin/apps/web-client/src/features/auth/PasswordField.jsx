import { useState } from 'react';

export default function PasswordField({ id, label, children, ...inputProps }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input-wrap">
        <input {...inputProps} id={id} type={visible ? 'text' : 'password'} />
        <button
          type="button"
          className="password-visibility"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((previous) => !previous)}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {children}
    </div>
  );
}
