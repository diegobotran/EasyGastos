const {
  SAT_STATUS,
  SAT_VALIDATION_CAUSE,
  FISCAL_STATUS
} = require('../contracts/fiscal-contracts');
const Fingerprint = require('../services/FiscalFingerprintService');

const hasValidSatEvidence = (expense = {}) => Boolean(
  expense.satValidatedAt &&
  expense.satValidationSource === 'SAT_INTERNO' &&
  expense.satValidationFingerprint
);

const normalizeLegacyExpense = (expense = {}) => {
  const hasValidatedState = expense.satStatus === SAT_STATUS.VALIDADO_SAT &&
    hasValidSatEvidence(expense);
  const receiverVatNumber = expense.receiver_vat_number ||
    expense.satInvoiceSnapshot?.idReceptor ||
    null;
  const keepValidated = hasValidatedState && Boolean(receiverVatNumber);
  const expenseWithReceiver = {
    ...expense,
    receiver_vat_number: receiverVatNumber
  };

  return {
    ...expenseWithReceiver,
    satStatus: keepValidated
      ? SAT_STATUS.VALIDADO_SAT
      : SAT_STATUS.PENDIENTE_VALIDACION_SAT,
    satValidationCause: keepValidated
      ? SAT_VALIDATION_CAUSE.NINGUNA
      : (expense.satValidationCause || SAT_VALIDATION_CAUSE.NINGUNA),
    fiscalStatus: Object.values(FISCAL_STATUS).includes(expense.fiscalStatus)
      ? expense.fiscalStatus
      : FISCAL_STATUS.PENDIENTE,
    satValidatedAt: keepValidated ? expense.satValidatedAt : null,
    satValidationSource: keepValidated ? expense.satValidationSource : null,
    satValidationFingerprint: keepValidated
      ? Fingerprint.build(expenseWithReceiver)
      : null,
    satFacturaId: keepValidated ? (expense.satFacturaId || null) : null,
    satInvoiceSnapshot: keepValidated ? (expense.satInvoiceSnapshot || null) : null,
    fiscalValidatedAt: expense.fiscalValidatedAt || null,
    fiscalValidityDaysApplied: Number.isInteger(expense.fiscalValidityDaysApplied)
      ? expense.fiscalValidityDaysApplied
      : null,
    imageValidationFingerprint: expense.imageValidationFingerprint || null
  };
};

module.exports = {
  hasValidSatEvidence,
  normalizeLegacyExpense
};
