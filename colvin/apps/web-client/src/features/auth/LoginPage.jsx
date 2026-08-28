import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthForm from './AuthForm.jsx';
import { loginRequest } from './auth.api.js';
import { useAuth } from './useAuth.js';

export default function LoginPage() {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { save } = useAuth();

  const submit = async (values) => {
    try {
      save(await loginRequest(values));
      navigate('/');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Login failed');
    }
  };

  return (
    <main className="auth-page">
      <section>
        <h1>Colvin</h1>
        <p>Sign in to access secure vehicle reports.</p>
        <AuthForm label="Login" onSubmit={submit} serverError={error} />
        <p>
          New user? <Link to="/register">Create account</Link>
          {' · '}
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
      </section>
    </main>
  );
}
