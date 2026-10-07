import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { session } from '../lib/session';

interface RequireRoleProps {
  role: 'dancer' | 'admin';
  children?: React.ReactNode;
}

export const RequireRole: React.FC<RequireRoleProps> = ({ role, children }) => {
  const location = useLocation();
  // A request refused as "not signed in" (expired or outdated login) clears the session; redraw at
  // once so the user goes to the login page instead of watching requests fail
  const [expired, setExpired] = useState(false);
  useEffect(() => session.onUnauthorized(() => setExpired(true)), []);
  const current = session.get();

  if (!current) {
    const loginTarget = role === 'admin' ? '/admin/login' : '/login';
    return <Navigate to={loginTarget} state={{ from: location, expired }} replace />;
  }

  // If page requires admin but user is dancer, redirect to dancer home
  if (role === 'admin' && current.claims.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  if (children) {
    return <>{children}</>;
  }

  return <Outlet />;
};
