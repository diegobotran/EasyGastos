import { useEffect, useState, type FormEvent } from 'react';
import type { CatalogDefinition, CatalogItem } from '../types/catalogs';
import { Notice } from './Notice';

export function CatalogDialog({ definition, item, busy, error, onClose, onSubmit }: {
  definition: CatalogDefinition;
  item: CatalogItem | null;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues(Object.fromEntries(definition.fields.map(field => [
      field.key,
      item ? String((item as unknown as Record<string, unknown>)[field.key] ?? '') : ''
    ])));
  }, [definition, item]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({ ...values, ...(item ? { updatedAt: item.updatedAt } : {}) });
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header>
          <div><span className="eyebrow">{item ? 'Editar registro' : 'Nuevo registro'}</span><h2 id="dialog-title">{definition.singular}</h2></div>
          <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}>×</button>
        </header>
        <form onSubmit={submit}>
          {error && <Notice>{error}</Notice>}
          <div className="form-grid">
            {definition.fields.map(field => (
              <label key={field.key}>
                <span>{field.label}{field.required && ' *'}</span>
                <input
                  name={field.key}
                  type={field.type || 'text'}
                  required={field.required}
                  maxLength={field.maxLength}
                  placeholder={field.placeholder}
                  value={values[field.key] || ''}
                  onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <footer>
            <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="button primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
