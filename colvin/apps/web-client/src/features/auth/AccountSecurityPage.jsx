import { useState } from 'react';

import { changePasswordRequest, requestEmailVerification } from './auth.api.js';
import { useAuth } from './useAuth.js';

export default function AccountSecurityPage() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const changePassword = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await changePasswordRequest({ currentPassword, newPassword });
      await logout();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Password could not be changed.');
    }
  };

  const sendVerification = async () => {
    setError('');
    try {
      const result = await requestEmailVerification();
      setMessage(
        result.alreadyVerified
          ? 'Your email is already verified.'
          : 'A verification email has been sent.',
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message || 'Verification email could not be sent.',
      );
    }
  };

  return (
    <section className="results">
      <article className="card">
        <h1>Account security</h1>
        <p>{user?.email}</p>
        <p>Email status: {user?.email_verified_at ? 'Verified' : 'Not verified'}</p>
        {!user?.email_verified_at && (
          <button className="secondary" type="button" onClick={sendVerification}>
            Send verification email
          </button>
        )}
        {message && <p>{message}</p>}
      </article>

      <form className="card form" onSubmit={changePassword}>
        <h2>Change password</h2>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button>Change password and sign out all sessions</button>
      </form>
    </section>
  );
}
