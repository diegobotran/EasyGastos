const contract = require('../../contracts/fiscal-validation.contract.json');

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

const SAT_STATUS = Object.freeze({
  PENDIENTE_VALIDACION_SAT: 'PENDIENTE_VALIDACION_SAT',
  VALIDADO_SAT: 'VALIDADO_SAT'
});

const SAT_VALIDATION_CAUSE = Object.freeze({
  NO_ENCONTRADO_D_PLUS_1: 'NO_ENCONTRADO_D_PLUS_1',
  DATOS_FISCALES_MODIFICADOS: 'DATOS_FISCALES_MODIFICADOS',
  NINGUNA: 'NINGUNA'
});

const FISCAL_STATUS = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  APTO_PARA_LIQUIDAR: 'APTO_PARA_LIQUIDAR',
  BLOQUEADO_NIT_SOCIEDAD: 'BLOQUEADO_NIT_SOCIEDAD',
  BLOQUEADO_ANTIGUEDAD: 'BLOQUEADO_ANTIGUEDAD'
});

const VALIDATION_SOURCE = Object.freeze({
  SAT_INTERNO: 'SAT_INTERNO'
});

const ERROR_CODE = deepFreeze(
  Object.values(contract.errorCodes)
    .flat()
    .reduce((codes, code) => ({ ...codes, [code]: code }), {})
);

module.exports = deepFreeze({
  CONTRACT_VERSION: contract.version,
  SAT_STATUS,
  SAT_VALIDATION_CAUSE,
  FISCAL_STATUS,
  VALIDATION_SOURCE,
  ERROR_CODE,
  SAT_INTERNAL_VALIDATION_CONTRACT: contract.satInternalValidation,
  ADMIN_CATALOG_CONTRACT: contract.adminCatalogs,
  rawContract: contract
});
