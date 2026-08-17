import { Outlet } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthContext.jsx';

export default function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <>
      <header>
        <strong>Colvin</strong>
        <div>
          <span>{user?.email}</span>
          <button className="secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
