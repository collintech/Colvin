import { Navigate, Route, Routes } from 'react-router-dom';

import AppLayout from '../components/AppLayout.jsx';
import AccountSecurityPage from '../features/auth/AccountSecurityPage.jsx';
import ForgotPasswordPage from '../features/auth/ForgotPasswordPage.jsx';
import LoginPage from '../features/auth/LoginPage.jsx';
import RegisterPage from '../features/auth/RegisterPage.jsx';
import ResetPasswordPage from '../features/auth/ResetPasswordPage.jsx';
import { useAuth } from '../features/auth/useAuth.js';
import VerifyEmailPage from '../features/auth/VerifyEmailPage.jsx';
import DashboardPage from '../features/vehicle/DashboardPage.jsx';

function Protected({ children }) {
  const { isAuthenticated, isBootstrapping } = useAuth();
  if (isBootstrapping) return <main className="auth-page">Restoring secure session…</main>;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/account" element={<AccountSecurityPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
