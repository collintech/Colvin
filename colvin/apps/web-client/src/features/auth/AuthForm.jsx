import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import PasswordField from './PasswordField.jsx';
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
      <label>
        Email
        <input
          type="email"
          inputMode="email"
          autoComplete={label === 'Login' ? 'username' : 'email'}
          autoCapitalize="none"
          spellCheck={false}
          {...register('email')}
        />
        <span>{errors.email?.message}</span>
      </label>
      <PasswordField
        id="auth-password"
        label="Password"
        autoComplete={label === 'Register' ? 'new-password' : 'current-password'}
        {...register('password')}
      >
        <span>{errors.password?.message}</span>
      </PasswordField>
      {serverError && <p className="error">{serverError}</p>}
      <button disabled={isSubmitting}>{isSubmitting ? 'Please wait…' : label}</button>
    </form>
  );
}
