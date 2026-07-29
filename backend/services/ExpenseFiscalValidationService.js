const mongoose = require('mongoose');
const SatFactura = require('../models/SatFactura');
const CatalogService = require('./CatalogService');
const FiscalEligibilityService = require('./FiscalEligibilityService');
const Fingerprint = require('./FiscalFingerprintService');
const InvoiceValidityService = require('./InvoiceValidityService');
const SATInternalValidationService = require('./SATInternalValidationService');
const SocietyNitValidationService = require('./SocietyNitValidationService');

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

const getMissingDraftFields = expense => {
  const missing = [];
  if (!String(expense.noinvoice || '').trim()) missing.push('No. de Factura');
  if (!String(expense.serie || '').trim()) missing.push('Serie');
  if (!String(expense.vat_number || '').trim()) missing.push('NIT del Emisor');
  if (!String(expense.receiver_vat_number || '').trim()) missing.push('NIT del Receptor');
  if (!(Number(expense.amount) > 0)) missing.push('Monto');
  if (!String(expense.category || '').trim()) missing.push('Categoría');
  if (!String(expense.department || '').trim()) missing.push('Departamento');
  return missing;
};

const assertCategoryMatchesReceiverNit = async expense => {
  await CatalogService.assertActiveReferences(expense);
  const society = await SocietyNitValidationService.findActiveByCode(expense.sociedad);
  if (!society) {
    throw new ExpenseFiscalError(
      'SOCIETY_NOT_FOUND',
      `La sociedad ${expense.sociedad} no existe o está inactiva.`
    );
  }
  if (!society.nit) {
    throw new ExpenseFiscalError(
      'SOCIETY_WITHOUT_NIT',
      `La sociedad ${expense.sociedad} no tiene NIT configurado.`
    );
  }
  if (
    SocietyNitValidationService.normalizeNit(society.nit) ===
    SocietyNitValidationService.normalizeNit(expense.receiver_vat_number)
  ) {
    return;
  }
  const actualSociety = await SocietyNitValidationService.findActiveByNit(expense.receiver_vat_number);
  if (!actualSociety) {
    throw new ExpenseFiscalError(
      'RECEIVER_NIT_WITHOUT_SOCIETY',
      `El NIT receptor ${expense.receiver_vat_number} no está vinculado con ninguna sociedad. Seleccione una categoría correcta o solicite la configuración de la sociedad.`
    );
  }
  if (actualSociety.codigo !== society.codigo) {
    throw new ExpenseFiscalError(
      'EXPENSE_NIT_SOCIETY_MISMATCH',
      `El NIT receptor ${expense.receiver_vat_number} corresponde a la sociedad ${actualSociety.codigo}, no a la sociedad ${society.codigo} (NIT ${society.nit}) asociada a la categoría. Seleccione la categoría correcta antes de guardar.`,
      { society, actualSociety, receiverNit: expense.receiver_vat_number }
    );
  }
};

const messageForEligibility = (expense, snapshot, eligibility) => {
  const actual = eligibility.actualSociety;
  const messages = {
    SOCIETY_NOT_FOUND: `La sociedad ${expense.sociedad} no existe o está inactiva.`,
    SOCIETY_WITHOUT_NIT: `La sociedad ${expense.sociedad} no tiene NIT configurado.`,
    RECEIVER_NIT_WITHOUT_SOCIETY: `El NIT receptor ${snapshot.idReceptor} de la factura no está vinculado con ninguna sociedad. Seleccione una categoría correcta o solicite la configuración de la sociedad.`,
    EXPENSE_NIT_SOCIETY_MISMATCH: `La factura fue emitida para la sociedad ${actual?.codigo || 'no identificada'} (NIT ${snapshot.idReceptor}), no para la sociedad ${expense.sociedad} (NIT ${eligibility.society?.nit || 'no configurado'}) asociada a la categoría. Seleccione la categoría correcta antes de guardar.`,
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

  if (expense.fiscalValidationStage !== 'SAT_QUERY' && isDraft(expense)) {
    const missingDraftFields = getMissingDraftFields(expense);
    if (missingDraftFields.length > 0) {
      throw new ExpenseFiscalError(
        'EXPENSE_DRAFT_REQUIRED_FIELDS',
        `Para guardar el borrador debe completar: ${missingDraftFields.join(', ')}.`,
        { missingFields: missingDraftFields }
      );
    }
    if (!hasAccountingSnapshot(expense)) {
      throw new ExpenseFiscalError(
        'CATEGORY_WITHOUT_SOCIETY',
        'La categoría debe contener Sociedad, Centro, Cuenta y Orden CO antes de guardar el borrador.'
      );
    }
    await assertCategoryMatchesReceiverNit(expense);
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
  if (
    SATInternalValidationService.normalizeNit(expense.receiver_vat_number) !==
    SATInternalValidationService.normalizeNit(snapshot.idReceptor)
  ) {
    throw new ExpenseFiscalError(
      'SAT_CORRECTIONS_REQUIRED',
      'El NIT del receptor cambió o no coincide con SAT. Consulta SAT nuevamente.',
      { expectedReceiverNit: snapshot.idReceptor }
    );
  }
  const validity = await InvoiceValidityService.validateWithActivePolicy(snapshot.fechaEmision);
  const validatedSatFields = {
    satStatus: 'VALIDADO_SAT',
    satValidationCause: 'NINGUNA',
    satValidatedAt: expense.satValidatedAt || new Date().toISOString(),
    satValidationSource: 'SAT_INTERNO',
    satValidationFingerprint: expectedFingerprint,
    satFacturaId: String(factura._id),
    satInvoiceSnapshot: snapshot,
    receiver_vat_number: snapshot.idReceptor,
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
    receiverNit: expense.receiver_vat_number,
    issueDate: snapshot.fechaEmision
  });
  if (!eligibility.valid) {
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
    receiver_vat_number: snapshot.idReceptor,
    fiscalValidatedAt: new Date().toISOString(),
    fiscalValidityDaysApplied: validity.enabled ? validity.allowedDays : null,
    imageValidationFingerprint: expense.imageValidationFingerprint || Fingerprint.normalize(expense.imageuri)
  };
};

module.exports = { ExpenseFiscalError, findSatInvoice, normalizePending, validateAndNormalize };
