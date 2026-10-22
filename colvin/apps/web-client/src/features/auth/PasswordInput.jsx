import { forwardRef, useState } from 'react';

const PasswordInput = forwardRef(function PasswordInput({ id, ...props }, ref) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input">
      <input {...props} id={id} ref={ref} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="secondary"
        aria-controls={id}
        aria-label="Show password"
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
});

export default PasswordInput;
