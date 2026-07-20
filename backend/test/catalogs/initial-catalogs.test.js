const test = require('node:test');
const assert = require('node:assert/strict');

const { buildInitialCatalogs } = require('../../data/initial-catalogs');
const { analyzeRecords } = require('../../scripts/migrate-initial-catalogs');
const CatalogService = require('../../services/CatalogService');

test('la carga inicial conserva los códigos conciliados sin agregar ceros', () => {
  const catalogs = buildInitialCatalogs();
  assert.equal(catalogs.sociedades.length, 20);
  assert.equal(catalogs.centros[0].codigo, '50004');
  assert.deepEqual(catalogs.cuentas.map(item => item.codigo), [
    '71311901', '71311501', '71311401', '71310503'
  ]);
  assert.equal(catalogs.ordenesCO.length, 7);
});

test('la carga usa el propietario de centros confirmado', () => {
  const catalogs = buildInitialCatalogs();
  assert.equal(catalogs.centros[0].ownerEmail, 'manager@ronesdeguatemala.com');
});

test('las siete contradicciones aceptadas se reportan y no se cargan', () => {
  const catalogs = buildInitialCatalogs();
  assert.equal(catalogs.sourceConflicts.length, 7);
  const excluded = new Set(catalogs.sourceConflicts.map(item => item.codigo));
  for (const code of ['AGRICOLA', 'ATESA', 'BLSA', 'BYSA', 'LOMAS', '4500', '7000']) {
    assert.ok(excluded.has(code));
    assert.equal(catalogs.sociedades.some(item => item.codigo === code), false);
  }
});

test('el análisis no sobrescribe registros existentes contradictorios', () => {
  const desired = [{ codigo: '1000', nit: '336963' }];
  const result = analyzeRecords({
    catalog: 'sociedades',
    desired,
    existing: [{ codigo: '1000', nit: 'OTRO' }],
    fields: ['codigo', 'nit'],
    secondaryUniqueField: 'nit'
  });
  assert.equal(result.inserts.length, 0);
  assert.equal(result.conflicts.length, 1);
});

test('los códigos de sociedad son exclusivamente numéricos y de máximo cuatro dígitos', () => {
  assert.doesNotThrow(() => CatalogService.validateCode('sociedades', '1000'));
  assert.throws(() => CatalogService.validateCode('sociedades', 'ATESA'), { code: 'INVALID_CATALOG_CODE' });
  assert.throws(() => CatalogService.validateCode('sociedades', '10000'), { code: 'INVALID_CATALOG_CODE' });
});
