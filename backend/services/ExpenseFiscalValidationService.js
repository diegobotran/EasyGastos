const mongoose = require('mongoose');
const SatFactura = require('../models/SatFactura');
const CatalogService = require('./CatalogService');
const FiscalEligibilityService = require('./FiscalEligibilityService');
const Fingerprint = require('./FiscalFingerprintService');
const SATInternalValidationService = require('./SATInternalValidationService');

class ExpenseFiscalError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.status = 422;
    this.details = details;
  }
}

const findSatInvoice = async expense => {
  if (expense.satFacturaId && mongoose.isValidObjectId(expense.satFacturaId)) {
    const byId = await SatFactura.findById(expense.satFacturaId).lean();
    if (byId) return byId;
  }
  const criteria = SATInternalValidationService.buildCriteria({
    uuid: expense.uuid,
    serie: expense.serie,
    noinvoice: expense.noinvoice,
    nitEmisor: expense.vat_number
  });
  return SatFactura.findOne(criteria).sort({ fechaEmision: -1 }).lean();
};

const normalizePending = expense => ({
  ...expense,
  satStatus: 'PENDIENTE_VALIDACION_SAT',
  satValidationCause: expense.satValidationCause === 'NO_ENCONTRADO_D_PLUS_1'
    ? 'NO_ENCONTRADO_D_PLUS_1'
    : 'NINGUNA',
  fiscalStatus: 'PENDIENTE',
  satValidatedAt: null,
  satValidationSource: null,
  satValidationFingerprint: null,
  satFacturaId: null,
  satInvoiceSnapshot: null,
  fiscalValidatedAt: null,
  fiscalValidityDaysApplied: null,
  imageValidationFingerprint: null
});

const validateAndNormalize = async expense => {
  await CatalogService.assertActiveReferences(expense);
  if (expense.satStatus !== 'VALIDADO_SAT') return normalizePending(expense);

  const factura = await findSatInvoice(expense);
  if (!factura) {
    throw new ExpenseFiscalError('SAT_CORRECTIONS_REQUIRED', 'La evidencia SAT ya no puede resolverse. Consulta SAT nuevamente.');
  }
  const expectedFingerprint = Fingerprint.build(expense);
  if (expense.satValidationFingerprint !== expectedFingerprint) {
    throw new ExpenseFiscalError('SAT_CORRECTIONS_REQUIRED', 'Los datos fiscales cambiaron después de consultar SAT.', {
      expectedFingerprint
    });
  }

  const snapshot = SATInternalValidationService.buildSnapshot(factura);
  const eligibility = await FiscalEligibilityService.evaluate({
    sociedad: expense.sociedad,
    receiverNit: snapshot.idReceptor,
    issueDate: snapshot.fechaEmision
  });
  if (!eligibility.valid) {
    const actual = eligibility.actualSociety;
    const messages = {
      SOCIETY_NOT_FOUND: `La sociedad ${expense.sociedad} no existe o está inactiva.`,
      SOCIETY_WITHOUT_NIT: `La sociedad ${expense.sociedad} no tiene NIT configurado.`,
      RECEIVER_NIT_WITHOUT_SOCIETY: `El NIT receptor ${snapshot.idReceptor} no está vinculado con ninguna sociedad.`,
      EXPENSE_NIT_SOCIETY_MISMATCH: `La factura fue emitida para la sociedad ${actual?.codigo || 'no identificada'}, no para ${expense.sociedad}.`,
      EXPENSE_EXPIRED_AT_CAPTURE: `La factura tiene ${eligibility.validity?.elapsedDays} días y supera la vigencia de ${eligibility.validity?.allowedDays} días.`
    };
    throw new ExpenseFiscalError(eligibility.code, messages[eligibility.code] || 'El gasto no supera la validación fiscal.', {
      ...eligibility,
      receiverNit: snapshot.idReceptor
    });
  }

  return {
    ...expense,
    satStatus: 'VALIDADO_SAT',
    satValidationCause: 'NINGUNA',
    fiscalStatus: 'APTO_PARA_LIQUIDAR',
    satValidatedAt: expense.satValidatedAt || new Date().toISOString(),
    satValidationSource: 'SAT_INTERNO',
    satValidationFingerprint: expectedFingerprint,
    satFacturaId: String(factura._id),
    satInvoiceSnapshot: snapshot,
    fiscalValidatedAt: new Date().toISOString(),
    fiscalValidityDaysApplied: eligibility.validity.enabled ? eligibility.validity.allowedDays : null,
    imageValidationFingerprint: expense.imageValidationFingerprint || Fingerprint.normalize(expense.imageuri)
  };
};

module.exports = { ExpenseFiscalError, findSatInvoice, normalizePending, validateAndNormalize };
