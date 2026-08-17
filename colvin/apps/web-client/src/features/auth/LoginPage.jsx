import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthForm from './AuthForm.jsx';
import { loginRequest } from './auth.api.js';
import { useAuth } from './AuthContext.jsx';
export default function LoginPage() {
  const [e, setE] = useState('');
  const nav = useNavigate();
  const { save } = useAuth();
  const submit = async (v) => {
    try {
      save(await loginRequest(v));
      nav('/');
    } catch (err) {
      setE(err.response?.data?.error?.message || 'Login failed');
    }
  };
  return (
    <main className="auth-page">
      <section>
        <h1>VIN Scanner</h1>
        <p>Sign in to access secure vehicle reports.</p>
        <AuthForm label="Login" onSubmit={submit} serverError={e} />
        <p>
          New user? <Link to="/register">Create account</Link>
        </p>
      </section>
    </main>
  );
}
