import { forwardRef, useState } from 'react';

const PasswordField = forwardRef(function PasswordField(
  { id, label, children, ...inputProps },
  ref,
) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input-wrap">
        <input {...inputProps} ref={ref} id={id} type={visible ? 'text' : 'password'} />
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
});

export default PasswordField;
