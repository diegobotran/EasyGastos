const test = require('node:test');
const assert = require('node:assert/strict');

const contracts = require('../../contracts/fiscal-contracts');
const canonical = require('../../../contracts/fiscal-validation.contract.json');

test('el contrato fiscal tiene una versión estable', () => {
  assert.equal(contracts.CONTRACT_VERSION, 'mvp2-ep01-v1');
  assert.equal(contracts.CONTRACT_VERSION, canonical.version);
});

test('los estados backend coinciden con el contrato canónico', () => {
  assert.deepEqual(Object.values(contracts.SAT_STATUS), canonical.satStatuses);
  assert.deepEqual(
    Object.values(contracts.SAT_VALIDATION_CAUSE),
    canonical.satValidationCauses
  );
  assert.deepEqual(Object.values(contracts.FISCAL_STATUS), canonical.fiscalStatuses);
});

test('los contratos exportados son inmutables', () => {
  assert.equal(Object.isFrozen(contracts), true);
  assert.equal(Object.isFrozen(contracts.SAT_STATUS), true);
  assert.equal(Object.isFrozen(contracts.ERROR_CODE), true);
  assert.equal(Object.isFrozen(contracts.SAT_INTERNAL_VALIDATION_CONTRACT), true);
});

test('todos los códigos funcionales son únicos', () => {
  const codes = Object.values(canonical.errorCodes).flat();
  assert.equal(new Set(codes).size, codes.length);
  assert.deepEqual(Object.keys(contracts.ERROR_CODE), codes);
});
