import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getInvoiceValidity, updateInvoiceValidity } from '../api/catalogs';
import { errorMessage } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { Notice } from '../components/Notice';
import type { InvoiceValidity } from '../types/catalogs';

export function InvoiceValidityPage() {
  const { token } = useAuth();
  const [parameter, setParameter] = useState<InvoiceValidity | null>(null);
  const [days, setDays] = useState('55');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const { data } = await getInvoiceValidity(token);
      setParameter(data); setDays(String(data.value)); setActive(data.active);
    } catch (error) { setMessage({ tone: 'error', text: errorMessage(error) }); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !parameter) return;
    setBusy(true); setMessage(null);
    try {
      const { data } = await updateInvoiceValidity({ value: Number(days), active, updatedAt: parameter.updatedAt }, token);
      setParameter(data); setDays(String(data.value)); setActive(data.active);
      setMessage({ tone: 'success', text: 'La política de vigencia fue actualizada correctamente.' });
    } catch (error) { setMessage({ tone: 'error', text: errorMessage(error) }); }
    finally { setBusy(false); }
  };

  return <section className="page">
    <header className="page-header"><div><span className="eyebrow">Política fiscal</span><h1>Vigencia de factura</h1><p>Define cuántos días calendario puede tener una factura para continuar en los flujos fiscales.</p></div></header>
    {message && <Notice tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Notice>}
    <div className="parameter-layout">
      <form className="parameter-card" onSubmit={save}>
        <div className="parameter-icon">55</div><div><span className="eyebrow">Configuración general</span><h2>Días máximos de vigencia</h2><p>El día indicado permanece vigente; el bloqueo comienza al día siguiente.</p></div>
        <label><span>Número de días</span><input type="number" min="1" step="1" required value={days} onChange={e => setDays(e.target.value)} /></label>
        <label className="switch-row"><div><strong>Aplicar restricción</strong><small>Al desactivarla no se bloqueará por antigüedad.</small></div><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /></label>
        <button className="button primary" disabled={busy || !parameter}>{busy ? 'Guardando…' : 'Guardar configuración'}</button>
      </form>
      <aside className="audit-card"><span className="eyebrow">Trazabilidad</span><h3>Última modificación</h3><strong>{parameter ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(parameter.updatedAt)) : 'Cargando…'}</strong><p>{parameter?.updatedBy || 'Sistema'}</p><hr /><small>Los cambios se aplicarán en captura, liquidación, aprobación y envío a SAP cuando esos flujos sean habilitados.</small></aside>
    </div>
  </section>;
}
