import { useState } from 'react';
import { Link } from 'react-router-dom';

import { requestPasswordReset } from './auth.api.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      setMessage('If an account exists for that email, a reset link has been sent.');
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message || 'Unable to request a password reset.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section>
        <h1>Reset password</h1>
        <p>Enter the email address associated with the Colvin account.</p>
        <form className="card form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {message && <p>{message}</p>}
          {error && <p className="error">{error}</p>}
          <button disabled={submitting}>{submitting ? 'Please wait…' : 'Send reset link'}</button>
        </form>
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
