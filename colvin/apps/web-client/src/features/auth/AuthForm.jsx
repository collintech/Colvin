import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import PasswordInput from './PasswordInput.jsx';
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(12, 'Use at least 12 characters'),
});
export default function AuthForm({ label, onSubmit, serverError }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });
  return (
    <form className="card form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <label htmlFor="auth-email">
        Email
        <input
          id="auth-email"
          type="email"
          autoComplete={label === 'Register' ? 'email' : 'username'}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={Boolean(errors.email)}
          aria-describedby="auth-email-error"
          {...register('email')}
        />
        <span id="auth-email-error">{errors.email?.message}</span>
      </label>
      <div>
        <label htmlFor="auth-password">Password</label>
        <PasswordInput
          id="auth-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby="auth-password-error"
          autoComplete={label === 'Register' ? 'new-password' : 'current-password'}
          {...register('password')}
        />
        <span id="auth-password-error">{errors.password?.message}</span>
      </div>
      {serverError && <p className="error">{serverError}</p>}
      <button disabled={isSubmitting}>{isSubmitting ? 'Please wait…' : label}</button>
    </form>
  );
}
