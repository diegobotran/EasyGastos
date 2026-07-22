const test = require('node:test');
const assert = require('node:assert/strict');

const Fingerprint = require('../../services/FiscalFingerprintService');
const Validity = require('../../services/InvoiceValidityService');
const SAT = require('../../services/SATInternalValidationService');
const ExpenseFiscal = require('../../services/ExpenseFiscalValidationService');
const CatalogService = require('../../services/CatalogService');
const FiscalEligibility = require('../../services/FiscalEligibilityService');
const SatFactura = require('../../models/SatFactura');
const LiquidationFiscal = require('../../services/LiquidationFiscalValidationService');
const liquidationRouter = require('../../routes/liquidations');

test('día 55 está vigente y día 56 está vencido en America/Guatemala', () => {
  const policy = { enabled: true, allowedDays: 55 };
  const day55 = Validity.validateInvoiceAge('2026-05-27', '2026-07-21', policy);
  const day56 = Validity.validateInvoiceAge('2026-05-26', '2026-07-21', policy);
  assert.equal(day55.elapsedDays, 55);
  assert.equal(day55.valid, true);
  assert.equal(day56.elapsedDays, 56);
  assert.equal(day56.valid, false);
  assert.equal(day55.timeZone, 'America/Guatemala');
});

test('una política inactiva omite la restricción de antigüedad', () => {
  assert.deepEqual(
    Validity.validateInvoiceAge('2020-01-01', '2026-07-21', { enabled: false, allowedDays: 55 }),
    { enabled: false, valid: true, reason: 'POLICY_DISABLED' }
  );
});

test('el fingerprint cambia con imagen y no cambia con nota o descripción', () => {
  const base = {
    serie: 'A', noinvoice: '1', uuid: 'U', vat_number: '123', supplier: 'P',
    date: '2026-07-21', amount: 10, currency: 'GTQ', sociedad: '4000',
    category: 'Gasolina', imageuri: 'file://uno.jpg', notes: 'uno', description: 'uno'
  };
  assert.equal(Fingerprint.build(base), Fingerprint.build({ ...base, notes: 'dos', description: 'dos' }));
  assert.notEqual(Fingerprint.build(base), Fingerprint.build({ ...base, imageuri: 'file://dos.jpg' }));
  assert.notEqual(Fingerprint.build(base), Fingerprint.build({ ...base, sociedad: '5000' }));
});

test('la búsqueda SAT oficial no incorpora NIT receptor', () => {
  assert.deepEqual(SAT.buildCriteria({ serie: ' A ', noinvoice: ' 99 ', nitEmisor: '12-3 K' }), {
    serie: 'A', numeroDTE: '99', nitEmisor: '123K'
  });
  assert.equal(Object.hasOwn(SAT.buildCriteria({ serie: 'A', noinvoice: '99' }), 'idReceptor'), false);
});

test('la comparación SAT separa complementos y correcciones', () => {
  const result = SAT.compare({
    serie: 'A', numeroDTE: '1', nitEmisor: '123', nombreEmisor: 'Proveedor SAT',
    fechaEmision: '2026-07-21', granTotal: 15, numeroAutorizacion: 'UUID', moneda: 'GTQ', iva: 1
  }, { serie: 'A', noinvoice: '1', supplier: 'Proveedor OCR', amount: 15 });
  assert.ok(result.complementados.some(item => item.field === 'vat_number'));
  assert.ok(result.corregidos.some(item => item.field === 'supplier'));
  assert.equal(result.corregidos.some(item => item.field === 'amount'), false);
});

test('un estado VALIDADO_SAT forjado por el cliente es rechazado', async () => {
  const originalCatalogValidation = CatalogService.assertActiveReferences;
  const originalFindOne = SatFactura.findOne;
  const originalEligibility = FiscalEligibility.evaluate;
  try {
    CatalogService.assertActiveReferences = async () => true;
    SatFactura.findOne = () => ({ sort: () => ({ lean: async () => ({
      _id: '507f1f77bcf86cd799439011', serie: 'A', numeroDTE: '1', numeroAutorizacion: 'U',
      nitEmisor: '123', nombreEmisor: 'P', idReceptor: '345377', nombreReceptor: 'R',
      fechaEmision: '2026-07-21', granTotal: 10, moneda: 'GTQ', iva: 1
    }) }) });
    FiscalEligibility.evaluate = async () => ({
      valid: true, fiscalStatus: 'APTO_PARA_LIQUIDAR', validity: { enabled: true, allowedDays: 55 }
    });
    await assert.rejects(() => ExpenseFiscal.validateAndNormalize({
      satStatus: 'VALIDADO_SAT', satValidationFingerprint: 'FORJADO', serie: 'A', noinvoice: '1',
      uuid: 'U', vat_number: '123', supplier: 'P', date: '2026-07-21', amount: 10,
      currency: 'GTQ', sociedad: '4000', category: 'C', centro: '1', cuenta: '2', ordenco: '3', imageuri: 'img'
    }), error => error.code === 'SAT_CORRECTIONS_REQUIRED');
  } finally {
    CatalogService.assertActiveReferences = originalCatalogValidation;
    SatFactura.findOne = originalFindOne;
    FiscalEligibility.evaluate = originalEligibility;
  }
});

test('D+1 permanece pendiente y elimina metadata fiscal previa', () => {
  const normalized = ExpenseFiscal.normalizePending({
    satStatus: 'PENDIENTE_VALIDACION_SAT', satValidationCause: 'NO_ENCONTRADO_D_PLUS_1',
    fiscalStatus: 'APTO_PARA_LIQUIDAR', satFacturaId: 'anterior', satValidatedAt: 'anterior'
  });
  assert.equal(normalized.satValidationCause, 'NO_ENCONTRADO_D_PLUS_1');
  assert.equal(normalized.fiscalStatus, 'PENDIENTE');
  assert.equal(normalized.satFacturaId, null);
  assert.equal(normalized.satValidatedAt, null);
});

test('el control previo a SAP identifica gastos vencidos sin consultar SAT ni catálogos', async () => {
  const originalValidity = Validity.validateWithActivePolicy;
  try {
    Validity.validateWithActivePolicy = async issueDate => ({
      enabled: true,
      valid: issueDate !== '2026-05-26',
      issueDate,
      referenceDate: '2026-07-21',
      elapsedDays: issueDate === '2026-05-26' ? 56 : 55,
      allowedDays: 55,
      reason: issueDate === '2026-05-26' ? 'INVOICE_EXPIRED' : 'NINGUNA'
    });
    const expired = await LiquidationFiscal.findExpiredExpenses([
      { id: 'VIGENTE', date: '2026-05-27' },
      { id: 'VENCIDO', description: 'Factura vencida', satInvoiceSnapshot: { fechaEmision: '2026-05-26' } }
    ], '2026-07-21');
    assert.equal(expired.length, 1);
    assert.equal(expired[0].id, 'VENCIDO');
    assert.equal(expired[0].elapsedDays, 56);
  } finally {
    Validity.validateWithActivePolicy = originalValidity;
  }
});

test('el envío a aprobación exige VALIDADO_SAT y después recalcula antigüedad', async () => {
  await assert.rejects(
    () => LiquidationFiscal.assertSubmit([{ id: 'PENDIENTE', satStatus: 'PENDIENTE_VALIDACION_SAT' }]),
    error => error.code === 'LIQUIDATION_EXPENSE_NOT_SAT_VALIDATED'
  );
});

test('el Hard Stop se ejecuta antes de la llamada externa a SAP y existe retorno a borrador', () => {
  const sapRoute = liquidationRouter.stack.find(layer => layer.route?.path === '/:id/send-to-sap');
  const returnRoute = liquidationRouter.stack.find(layer => layer.route?.path === '/:id/return-to-draft');
  assert.ok(sapRoute?.route?.methods?.post);
  assert.ok(returnRoute?.route?.methods?.put);
  const handlerSource = sapRoute.route.stack.at(-1).handle.toString();
  assert.ok(handlerSource.indexOf('findExpiredExpenses') >= 0);
  assert.ok(handlerSource.indexOf('findExpiredExpenses') < handlerSource.indexOf('fetch(SAP_EA_DOCUMENT_URL'));
});
