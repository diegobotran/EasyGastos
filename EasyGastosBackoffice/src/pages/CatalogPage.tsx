import { useCallback, useEffect, useState } from 'react';
import {
  createCatalogItem,
  listCatalog,
  setCatalogItemStatus,
  updateCatalogItem,
  type CatalogQuery
} from '../api/catalogs';
import { errorMessage } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { CatalogDialog } from '../components/CatalogDialog';
import { Notice } from '../components/Notice';
import type { CatalogDefinition, CatalogItem, Pagination } from '../types/catalogs';

const EMPTY_PAGINATION: Pagination = { page: 1, limit: 25, total: 0, pages: 0 };

const activeValue = (item: CatalogItem, definition: CatalogDefinition) =>
  Boolean((item as unknown as Record<string, unknown>)[definition.activeField]);

const displayValue = (item: CatalogItem, key: string) => {
  const value = (item as unknown as Record<string, unknown>)[key];
  return value === null || value === undefined || value === '' ? '—' : String(value);
};

export function CatalogPage({ definition }: { definition: CatalogDefinition }) {
  const { token } = useAuth();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [query, setQuery] = useState<CatalogQuery>({ page: 1, limit: 25, search: '', active: '' });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await listCatalog(definition.key, query, token);
      setItems(response.items);
      setPagination(response.pagination);
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [definition.key, query, token]);

  useEffect(() => { void load(); }, [load]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery(current => ({ ...current, search: search.trim(), page: 1 }));
  };

  const openCreate = () => { setSelected(null); setDialogError(''); setDialogOpen(true); setMessage(null); };
  const openEdit = (item: CatalogItem) => { setSelected(item); setDialogError(''); setDialogOpen(true); setMessage(null); };

  const save = async (values: Record<string, unknown>) => {
    if (!token) return;
    setBusy(true);
    try {
      if (selected) await updateCatalogItem(definition.key, selected._id, values, token);
      else await createCatalogItem(definition.key, values, token);
      setDialogOpen(false);
      setDialogError('');
      setMessage({ tone: 'success', text: `${definition.singular} ${selected ? 'actualizado' : 'creado'} correctamente.` });
      await load();
    } catch (error) {
      setDialogError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (item: CatalogItem) => {
    if (!token) return;
    const current = activeValue(item, definition);
    if (!window.confirm(`¿Deseas ${current ? 'inactivar' : 'activar'} el registro ${item.codigo}?`)) return;
    setBusy(true);
    try {
      await setCatalogItemStatus(definition.key, item._id, !current, item.updatedAt, token);
      setMessage({ tone: 'success', text: `Registro ${current ? 'inactivado' : 'activado'} correctamente.` });
      await load();
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page">
      <header className="page-header">
        <div><span className="eyebrow">Catálogo maestro</span><h1>{definition.title}</h1><p>{definition.description}</p></div>
        <button className="button primary" type="button" onClick={openCreate}>+ Nuevo registro</button>
      </header>

      {message && <Notice tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Notice>}

      <div className="toolbar">
        <form className="search" onSubmit={submitSearch}>
          <input aria-label="Buscar" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por código, acrónimo o descripción" />
          <button className="button secondary" type="submit">Buscar</button>
        </form>
        <label className="inline-field"><span>Estado</span><select value={query.active} onChange={event => setQuery(current => ({ ...current, active: event.target.value as CatalogQuery['active'], page: 1 }))}><option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select></label>
      </div>

      <div className="table-card">
        <div className="table-summary"><strong>{pagination.total}</strong> registros <span>•</span> Página {pagination.page} de {Math.max(1, pagination.pages)}</div>
        <div className="table-scroll">
          <table>
            <thead><tr>{definition.fields.map(field => <th key={field.key}>{field.label}</th>)}<th>Estado</th><th>Última modificación</th><th className="actions-column">Acciones</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={definition.fields.length + 3}><div className="empty-state">Cargando catálogo…</div></td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={definition.fields.length + 3}><div className="empty-state"><strong>No hay registros</strong><span>Ajusta los filtros o crea el primero.</span></div></td></tr>}
              {!loading && items.map(item => {
                const active = activeValue(item, definition);
                return <tr key={item._id}>
                  {definition.fields.map(field => <td key={field.key} data-label={field.label}>{field.key === 'codigo' ? <strong className="code">{displayValue(item, field.key)}</strong> : displayValue(item, field.key)}</td>)}
                  <td data-label="Estado"><span className={`status ${active ? 'active' : 'inactive'}`}>{active ? 'Activo' : 'Inactivo'}</span></td>
                  <td data-label="Última modificación"><span className="date">{new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.updatedAt))}</span><small>{item.updatedBy || 'Sistema'}</small></td>
                  <td className="actions" data-label="Acciones"><button type="button" className="table-action" onClick={() => openEdit(item)}>Editar</button><button type="button" disabled={busy} className="table-action" onClick={() => void toggleStatus(item)}>{active ? 'Inactivar' : 'Activar'}</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <footer className="pagination"><button className="button secondary" disabled={pagination.page <= 1 || loading} onClick={() => setQuery(current => ({ ...current, page: current.page - 1 }))}>Anterior</button><button className="button secondary" disabled={pagination.page >= pagination.pages || loading} onClick={() => setQuery(current => ({ ...current, page: current.page + 1 }))}>Siguiente</button></footer>
      </div>

      {dialogOpen && <CatalogDialog definition={definition} item={selected} busy={busy} error={dialogError} onClose={() => setDialogOpen(false)} onSubmit={save} />}
    </section>
  );
}
