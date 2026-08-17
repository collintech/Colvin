import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthForm from './AuthForm.jsx';
import { registerRequest } from './auth.api.js';
import { useAuth } from './useAuth.js';

export default function RegisterPage() {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { save } = useAuth();

  const submit = async (values) => {
    try {
      save(await registerRequest(values));
      navigate('/');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Registration failed');
    }
  };

  return (
    <main className="auth-page">
      <section>
        <h1>Create account</h1>
        <p>Use a unique password of at least 12 characters.</p>
        <AuthForm label="Register" onSubmit={submit} serverError={error} />
        <p>
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
