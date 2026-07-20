const test = require('node:test');
const assert = require('node:assert/strict');

const { models } = require('../../database/init');
const Sociedad = require('../../models/Sociedad');
const Centro = require('../../models/Centro');
const Cuenta = require('../../models/Cuenta');
const OrdenCO = require('../../models/OrdenCO');
const SystemParameter = require('../../models/SystemParameter');

test('User separa isAdmin de isManager', () => {
  const user = new models.User({
    email: 'admin@example.test',
    firstName: 'Admin',
    lastName: 'Demo',
    pin: '0000'
  });

  assert.equal(user.isManager, false);
  assert.equal(user.isAdmin, false);
});

test('Expense usa los estados fiscales MVP2 y defaults conservadores', () => {
  const expense = new models.Expense({
    id: 'EXP-TEST',
    userEmail: 'user@example.test',
    description: 'Gasto sintético',
    amount: 1,
    date: '2026-07-17',
    category: 'Prueba'
  });

  assert.equal(expense.satStatus, 'PENDIENTE_VALIDACION_SAT');
  assert.equal(expense.satValidationCause, 'NINGUNA');
  assert.equal(expense.fiscalStatus, 'PENDIENTE');
  assert.ok(models.Expense.schema.path('satFacturaId'));
  assert.ok(models.Expense.schema.path('imageValidationFingerprint'));
});

test('Liquidation admite fiscal_blocked', () => {
  const allowed = models.Liquidation.schema.path('status').enumValues;
  assert.ok(allowed.includes('fiscal_blocked'));
});

test('los modelos maestros usan las colecciones y capacidades acordadas', () => {
  assert.equal(Sociedad.collection.collectionName, 'sociedades');
  assert.equal(Centro.collection.collectionName, 'centros');
  assert.equal(Cuenta.collection.collectionName, 'cuentas');
  assert.equal(OrdenCO.collection.collectionName, 'ordenes_co');
  assert.equal(SystemParameter.collection.collectionName, 'system_parameters');

  assert.equal(Sociedad.schema.path('codigo').options.maxlength, 4);
  assert.equal(Sociedad.schema.path('nit').options.maxlength, 15);
  assert.equal(Centro.schema.path('codigo').options.maxlength, 10);
  assert.equal(Cuenta.schema.path('codigo').options.maxlength, 10);
  assert.equal(OrdenCO.schema.path('codigo').options.maxlength, 10);
});

test('el parámetro de vigencia exige enteros positivos', () => {
  const valid = new SystemParameter({
    key: 'INVOICE_VALIDITY_DAYS',
    name: 'Número de días de vigencia de factura',
    value: 55
  });
  const invalid = new SystemParameter({
    key: 'INVOICE_VALIDITY_DAYS',
    name: 'Número de días de vigencia de factura',
    value: 1.5
  });

  assert.equal(valid.validateSync(), undefined);
  assert.ok(invalid.validateSync().errors.value);
});

test('los modelos maestros rechazan códigos no numéricos', () => {
  const sociedad = new Sociedad({ codigo: 'ATESA', nit: '820781K' });
  const centro = new Centro({ acronimo: 'TEMP', codigo: 'C-1', ownerEmail: 'owner@example.test' });
  const cuenta = new Cuenta({ acronimo: 'TEMP', codigo: 'CUENTA' });
  const orden = new OrdenCO({ acronimo: 'TEMP', codigo: 'ORDEN' });

  assert.ok(sociedad.validateSync().errors.codigo);
  assert.ok(centro.validateSync().errors.codigo);
  assert.ok(cuenta.validateSync().errors.codigo);
  assert.ok(orden.validateSync().errors.codigo);
});
