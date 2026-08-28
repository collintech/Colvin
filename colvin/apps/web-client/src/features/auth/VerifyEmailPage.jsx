import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { confirmEmailVerification } from './auth.api.js';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') || '');
  const [state, setState] = useState(token ? 'ready' : 'missing');

  useEffect(() => {
    if (token) window.history.replaceState({}, '', '/verify-email');
  }, [token]);

  const verify = async () => {
    setState('verifying');
    try {
      await confirmEmailVerification(token);
      setState('verified');
    } catch {
      setState('failed');
    }
  };

  return (
    <main className="auth-page">
      <section className="card">
        <h1>Email verification</h1>
        {state === 'ready' && <button onClick={verify}>Verify email</button>}
        {state === 'verifying' && <p>Verifying your email…</p>}
        {state === 'verified' && <p>Your email address has been verified.</p>}
        {state === 'failed' && (
          <p className="error">This verification link is invalid or expired.</p>
        )}
        {state === 'missing' && (
          <p className="error">This verification link is missing its token.</p>
        )}
        <p>
          <Link to="/">Return to Colvin</Link>
        </p>
      </section>
    </main>
  );
}
