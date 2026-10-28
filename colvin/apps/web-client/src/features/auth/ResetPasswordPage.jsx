import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import PasswordInput from './PasswordInput.jsx';

import { confirmPasswordReset } from './auth.api.js';
import { clearAccountActionUrl, readAccountActionToken } from './account-action-link.js';

export default function ResetPasswordPage() {
  const location = useLocation();
  const token = readAccountActionToken(location);

  useEffect(() => {
    clearAccountActionUrl(window.history, '/reset-password');
  }, [location.search, location.hash]);

  return <ResetPasswordForm key={token} token={token} />;
}

function ResetPasswordForm({ token }) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await confirmPasswordReset({ token, newPassword: password });
      setMessage('Password changed. You can now sign in with the new password.');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Reset link is invalid or expired.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section>
        <h1>Choose a new password</h1>
        <form className="card form" onSubmit={submit}>
          <div>
            <label htmlFor="reset-password">New password</label>
            <PasswordInput
              id="reset-password"
              name="newPassword"
              aria-describedby="reset-password-help"
              autoComplete="new-password"
              minLength={12}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <span id="reset-password-help">Use at least 12 characters.</span>
          </div>
          {!token && <p className="error">This reset link is missing its token.</p>}
          {message && <p>{message}</p>}
          {error && <p className="error">{error}</p>}
          <button disabled={submitting || !token}>
            {submitting ? 'Please wait…' : 'Reset password'}
          </button>
        </form>
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
