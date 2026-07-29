const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ERROR_CODE,
  SAT_INTERNAL_VALIDATION_CONTRACT,
  ADMIN_CATALOG_CONTRACT
} = require('../../contracts/fiscal-contracts');
const fixtures = require('../fixtures/fiscal-scenarios.json');

test('la validación SAT oficial usa la ruta y método acordados', () => {
  assert.equal(SAT_INTERNAL_VALIDATION_CONTRACT.method, 'POST');
  assert.equal(SAT_INTERNAL_VALIDATION_CONTRACT.path, '/api/sat/validar-interno');
  assert.deepEqual(
    SAT_INTERNAL_VALIDATION_CONTRACT.requiredRequestFields,
    ['serie', 'noinvoice']
  );
});

test('los fixtures cubren los cinco escenarios de línea base', () => {
  assert.deepEqual(
    Object.keys(fixtures),
    [
      'satInvoiceFound',
      'satInvoiceNotFoundDPlus1',
      'nitSocietyMismatch',
      'expiredInvoice',
      'approvedLiquidation'
    ]
  );
});

test('el escenario D+1 usa estado pendiente y no rechazo', () => {
  const expected = fixtures.satInvoiceNotFoundDPlus1.expected;
  assert.equal(expected.code, ERROR_CODE.SAT_NOT_FOUND_D_PLUS_1);
  assert.equal(expected.satStatus, 'PENDIENTE_VALIDACION_SAT');
  assert.equal(expected.canSaveDraft, true);
  assert.equal(expected.canLiquidate, false);
});

test('el escenario NIT incorrecto bloquea el guardado del borrador completo', () => {
  const expected = fixtures.nitSocietyMismatch.expected;
  assert.equal(expected.code, ERROR_CODE.EXPENSE_NIT_SOCIETY_MISMATCH);
  assert.equal(expected.canSaveDraft, false);
  assert.equal(expected.canAdvance, false);
});

test('el escenario previo a SAP bloquea sin llamar SAP', () => {
  const expected = fixtures.approvedLiquidation.expectedWhenExpenseExpires;
  assert.equal(expected.code, ERROR_CODE.LIQUIDATION_FISCAL_BLOCKED);
  assert.equal(expected.nextStatus, 'fiscal_blocked');
  assert.equal(expected.sapMustBeCalled, false);
  assert.equal(expected.requiresNewApproval, true);
});

test('el contrato administrativo declara los cinco módulos MVP2', () => {
  assert.deepEqual(ADMIN_CATALOG_CONTRACT.resources, [
    'sociedades',
    'centros',
    'cuentas',
    'ordenes-co'
  ]);
  assert.equal(
    ADMIN_CATALOG_CONTRACT.invoiceValidityPath,
    '/api/admin/parameters/invoice-validity'
  );
});
