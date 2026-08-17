import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthForm from './AuthForm.jsx';
import { registerRequest } from './auth.api.js';
import { useAuth } from './AuthContext.jsx';
export default function RegisterPage() {
  const [e, setE] = useState('');
  const nav = useNavigate();
  const { save } = useAuth();
  const submit = async (v) => {
    try {
      save(await registerRequest(v));
      nav('/');
    } catch (err) {
      setE(err.response?.data?.error?.message || 'Registration failed');
    }
  };
  return (
    <main className="auth-page">
      <section>
        <h1>Create account</h1>
        <p>Use a unique password of at least 12 characters.</p>
        <AuthForm label="Register" onSubmit={submit} serverError={e} />
        <p>
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
