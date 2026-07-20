import { describe, expect, it } from 'vitest';
import { catalogDefinitions } from './catalog-definitions';

describe('módulos de catálogos', () => {
  it('declara los cuatro catálogos CRUD sin confundir acrónimo y código', () => {
    expect(Object.keys(catalogDefinitions)).toEqual(['sociedades', 'centros', 'cuentas', 'ordenes-co']);
    const societyFields = catalogDefinitions.sociedades.fields.map(field => field.key);
    expect(societyFields).toContain('acronimo');
    expect(societyFields).toContain('codigo');
    expect(societyFields).toContain('nit');
  });

  it('respeta las capacidades máximas acordadas', () => {
    expect(catalogDefinitions.sociedades.fields.find(field => field.key === 'codigo')?.maxLength).toBe(4);
    expect(catalogDefinitions.centros.fields.find(field => field.key === 'codigo')?.maxLength).toBe(10);
    expect(catalogDefinitions.cuentas.fields.find(field => field.key === 'codigo')?.maxLength).toBe(10);
  });
});
