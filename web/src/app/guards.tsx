import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { session } from '../lib/session';

interface RequireRoleProps {
  role: 'dancer' | 'admin';
  children?: React.ReactNode;
}

export const RequireRole: React.FC<RequireRoleProps> = ({ role, children }) => {
  const location = useLocation();
  const current = session.get();

  if (!current) {
    const loginTarget = role === 'admin' ? '/admin/login' : '/login';
    return <Navigate to={loginTarget} state={{ from: location }} replace />;
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
