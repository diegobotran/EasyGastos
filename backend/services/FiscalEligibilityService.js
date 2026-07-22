const SocietyNitValidationService = require('./SocietyNitValidationService');
const InvoiceValidityService = require('./InvoiceValidityService');

const evaluate = async ({ sociedad, receiverNit, issueDate, referenceDate = new Date() }) => {
  const society = await SocietyNitValidationService.findActiveByCode(sociedad);
  if (!society) return { valid: false, code: 'SOCIETY_NOT_FOUND', fiscalStatus: 'BLOQUEADO_NIT_SOCIEDAD' };
  if (!society.nit) return { valid: false, code: 'SOCIETY_WITHOUT_NIT', fiscalStatus: 'BLOQUEADO_NIT_SOCIEDAD', society };
  const actualSociety = await SocietyNitValidationService.findActiveByNit(receiverNit);
  if (!actualSociety) {
    return { valid: false, code: 'RECEIVER_NIT_WITHOUT_SOCIETY', fiscalStatus: 'BLOQUEADO_NIT_SOCIEDAD', society };
  }
  if (actualSociety.codigo !== society.codigo) {
    return {
      valid: false,
      code: 'EXPENSE_NIT_SOCIETY_MISMATCH',
      fiscalStatus: 'BLOQUEADO_NIT_SOCIEDAD',
      society,
      actualSociety,
      receiverNit
    };
  }
  const validity = await InvoiceValidityService.validateWithActivePolicy(issueDate, referenceDate);
  if (!validity.valid) {
    return { valid: false, code: 'EXPENSE_EXPIRED_AT_CAPTURE', fiscalStatus: 'BLOQUEADO_ANTIGUEDAD', society, validity };
  }
  return { valid: true, code: 'EXPENSE_FISCALLY_ELIGIBLE', fiscalStatus: 'APTO_PARA_LIQUIDAR', society, validity };
};

module.exports = { evaluate };
