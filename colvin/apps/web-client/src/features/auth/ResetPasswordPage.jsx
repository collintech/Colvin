import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { confirmPasswordReset } from './auth.api.js';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') || '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (token) window.history.replaceState({}, '', '/reset-password');
  }, [token]);

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
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <span>Use at least 12 characters.</span>
          </label>
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
