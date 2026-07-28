const mongoose = require('mongoose');
const SatFactura = require('../models/SatFactura');
const CatalogService = require('./CatalogService');
const FiscalEligibilityService = require('./FiscalEligibilityService');
const Fingerprint = require('./FiscalFingerprintService');
const InvoiceValidityService = require('./InvoiceValidityService');
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

const hasAttachment = expense => Boolean(String(expense.imageuri || '').trim());

const hasAccountingSnapshot = expense => Boolean(
  String(expense.category || '').trim() &&
  String(expense.sociedad || '').trim() &&
  String(expense.centro || '').trim() &&
  String(expense.cuenta || '').trim() &&
  String(expense.ordenco || '').trim()
);

const isDraft = expense => expense.status === 'BORRADOR';

const messageForEligibility = (expense, snapshot, eligibility) => {
  const actual = eligibility.actualSociety;
  const messages = {
    SOCIETY_NOT_FOUND: `La sociedad ${expense.sociedad} no existe o está inactiva.`,
    SOCIETY_WITHOUT_NIT: `La sociedad ${expense.sociedad} no tiene NIT configurado.`,
    RECEIVER_NIT_WITHOUT_SOCIETY: `El NIT receptor ${snapshot.idReceptor} no está vinculado con ninguna sociedad.`,
    EXPENSE_NIT_SOCIETY_MISMATCH: `La factura fue emitida para la sociedad ${actual?.codigo || 'no identificada'}, no para ${expense.sociedad}.`,
    EXPENSE_EXPIRED_AT_CAPTURE: `La factura tiene ${eligibility.validity?.elapsedDays} días y supera la vigencia de ${eligibility.validity?.allowedDays} días.`
  };
  return messages[eligibility.code] || 'El gasto no supera la validación fiscal.';
};

const applyValidity = (expense, validity, satFields = {}) => ({
  ...expense,
  ...satFields,
  fiscalStatus: validity.valid ? 'PENDIENTE' : 'BLOQUEADO_ANTIGUEDAD',
  fiscalValidatedAt: new Date().toISOString(),
  fiscalValidityDaysApplied: validity.enabled ? validity.allowedDays : null
});

const validateAndNormalize = async expense => {
  if (expense.fiscalValidationStage !== 'SAT_QUERY' && !hasAttachment(expense)) {
    throw new ExpenseFiscalError(
      'EXPENSE_DOCUMENT_REQUIRED',
      'Debe adjuntar un documento o imagen antes de guardar el borrador.'
    );
  }

  if (expense.satStatus !== 'VALIDADO_SAT') {
    const pending = normalizePending(expense);
    if (expense.satValidationCause === 'NO_ENCONTRADO_D_PLUS_1' && expense.date) {
      const validity = await InvoiceValidityService.validateWithActivePolicy(expense.date);
      const evaluated = applyValidity(pending, validity);
      if (!validity.valid && !isDraft(expense)) {
        throw new ExpenseFiscalError(
          'EXPENSE_EXPIRED_AT_CAPTURE',
          `La factura tiene ${validity.elapsedDays} días y supera la vigencia de ${validity.allowedDays} días.`,
          { validity }
        );
      }
      return evaluated;
    }
    if (!isDraft(expense)) {
      throw new ExpenseFiscalError(
        'EXPENSE_NOT_SAT_VALIDATED',
        'El gasto debe validarse por SAT antes de continuar.'
      );
    }
    return pending;
  }

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
  const validity = await InvoiceValidityService.validateWithActivePolicy(snapshot.fechaEmision);
  const validatedSatFields = {
    satStatus: 'VALIDADO_SAT',
    satValidationCause: 'NINGUNA',
    satValidatedAt: expense.satValidatedAt || new Date().toISOString(),
    satValidationSource: 'SAT_INTERNO',
    satValidationFingerprint: expectedFingerprint,
    satFacturaId: String(factura._id),
    satInvoiceSnapshot: snapshot,
    imageValidationFingerprint: expense.imageValidationFingerprint || Fingerprint.normalize(expense.imageuri)
  };

  if (!validity.valid) {
    const blocked = applyValidity(expense, validity, validatedSatFields);
    if (!isDraft(expense)) {
      throw new ExpenseFiscalError(
        'EXPENSE_EXPIRED_AT_CAPTURE',
        `La factura tiene ${validity.elapsedDays} días y supera la vigencia de ${validity.allowedDays} días.`,
        { validity }
      );
    }
    return blocked;
  }

  if (expense.fiscalValidationStage === 'SAT_QUERY') {
    return applyValidity(expense, validity, validatedSatFields);
  }

  if (!hasAccountingSnapshot(expense)) {
    if (!isDraft(expense)) {
      throw new ExpenseFiscalError(
        'CATEGORY_WITHOUT_SOCIETY',
        'Debe completar la categoría y sus referencias contables antes de continuar.'
      );
    }
    return applyValidity(expense, validity, validatedSatFields);
  }

  await CatalogService.assertActiveReferences(expense);
  const eligibility = await FiscalEligibilityService.evaluate({
    sociedad: expense.sociedad,
    receiverNit: snapshot.idReceptor,
    issueDate: snapshot.fechaEmision
  });
  if (!eligibility.valid) {
    if (isDraft(expense)) {
      return {
        ...applyValidity(expense, validity, validatedSatFields),
        fiscalStatus: eligibility.fiscalStatus,
        fiscalValidatedAt: new Date().toISOString()
      };
    }
    throw new ExpenseFiscalError(eligibility.code, messageForEligibility(expense, snapshot, eligibility), {
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
    fiscalValidityDaysApplied: validity.enabled ? validity.allowedDays : null,
    imageValidationFingerprint: expense.imageValidationFingerprint || Fingerprint.normalize(expense.imageuri)
  };
};

module.exports = { ExpenseFiscalError, findSatInvoice, normalizePending, validateAndNormalize };
