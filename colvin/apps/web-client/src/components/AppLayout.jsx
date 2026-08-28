import { Link, Outlet } from 'react-router-dom';

import { useAuth } from '../features/auth/useAuth.js';

export default function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <>
      <header>
        <strong>
          <Link to="/">Colvin</Link>
        </strong>
        <div>
          <span>{user?.email}</span>
          <Link to="/account">Account</Link>
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
