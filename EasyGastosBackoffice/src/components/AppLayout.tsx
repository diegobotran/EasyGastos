import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const navigation = [
  ['/sociedades', 'Sociedad – NIT', 'SO'],
  ['/centros', 'Centros', 'CE'],
  ['/cuentas', 'Cuentas', 'CU'],
  ['/ordenes-co', 'Órdenes CO', 'CO'],
  ['/vigencia', 'Vigencia de factura', 'VF']
] as const;

export function AppLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">EG</span>
          <div><strong>EasyGastos</strong><small>Administración fiscal</small></div>
        </div>
        <nav aria-label="Módulos administrativos">
          {navigation.map(([path, label, initials]) => (
            <NavLink key={path} to={path} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
              <span>{initials}</span>{label}
            </NavLink>
          ))}
        </nav>
        <div className="session-card">
          <span className="avatar">{user?.firstName?.slice(0, 1)}{user?.lastName?.slice(0, 1)}</span>
          <div><strong>{user?.firstName} {user?.lastName}</strong><small>{user?.email}</small></div>
          <button type="button" className="link-button" onClick={logout}>Salir</button>
        </div>
      </aside>
      <main className="main-content"><Outlet /></main>
    </div>
  );
}
