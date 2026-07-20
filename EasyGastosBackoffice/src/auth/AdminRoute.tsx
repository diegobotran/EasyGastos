import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function AdminRoute() {
  const { token, user } = useAuth();
  const location = useLocation();

  if (!token || !user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!user.isAdmin) return <Navigate to="/login" replace state={{ denied: true }} />;
  return <Outlet />;
}
