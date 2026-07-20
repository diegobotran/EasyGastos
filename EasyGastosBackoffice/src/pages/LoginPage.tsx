import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { Notice } from '../components/Notice';

export function LoginPage() {
  const { token, user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (token && user?.isAdmin) return <Navigate to="/sociedades" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, pin);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from || '/sociedades', { replace: true });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand"><span className="brand-mark">EG</span><strong>EasyGastos</strong></div>
        <span className="eyebrow">Acceso restringido</span>
        <h1>Administración fiscal,<br />sin fricción.</h1>
        <p>Gestiona sociedades, centros, cuentas, órdenes CO y la vigencia de facturas desde una sola vista.</p>
        <form onSubmit={submit}>
          {error && <Notice>{error}</Notice>}
          <label><span>Correo corporativo</span><input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@empresa.com" /></label>
          <label><span>PIN</span><input type="password" inputMode="numeric" autoComplete="current-password" required pattern="\d{4}" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" /></label>
          <button className="button primary wide" disabled={busy}>{busy ? 'Verificando…' : 'Ingresar al backoffice'}</button>
        </form>
      </section>
      <aside className="login-art"><div><span>Control y trazabilidad</span><h2>Catálogos confiables para cada gasto.</h2><p>Los cambios quedan protegidos, versionados y listos para sincronizar con la aplicación móvil.</p></div></aside>
    </main>
  );
}
