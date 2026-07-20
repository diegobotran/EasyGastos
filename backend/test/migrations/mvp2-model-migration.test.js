const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasValidSatEvidence,
  normalizeLegacyExpense
} = require('../../migrations/mvp2-ep01-model-migration');

test('conserva VALIDADO_SAT únicamente con evidencia completa', () => {
  const source = {
    satStatus: 'VALIDADO_SAT',
    satValidatedAt: '2026-07-17T12:00:00.000Z',
    satValidationSource: 'SAT_INTERNO',
    satValidationFingerprint: 'fingerprint'
  };
  const result = normalizeLegacyExpense(source);

  assert.equal(hasValidSatEvidence(source), true);
  assert.equal(result.satStatus, 'VALIDADO_SAT');
  assert.equal(result.satValidationCause, 'NINGUNA');
  assert.equal(result.fiscalStatus, 'PENDIENTE');
});

test('degrada VALIDADO_SAT sin evidencia a pendiente', () => {
  const result = normalizeLegacyExpense({ satStatus: 'VALIDADO_SAT' });

  assert.equal(result.satStatus, 'PENDIENTE_VALIDACION_SAT');
  assert.equal(result.satValidatedAt, null);
  assert.equal(result.satValidationSource, null);
  assert.equal(result.satValidationFingerprint, null);
});

test('migra NO_VALIDADO_SAT a pendiente sin inventar una causal', () => {
  const result = normalizeLegacyExpense({ satStatus: 'NO_VALIDADO_SAT' });

  assert.equal(result.satStatus, 'PENDIENTE_VALIDACION_SAT');
  assert.equal(result.satValidationCause, 'NINGUNA');
  assert.equal(result.fiscalStatus, 'PENDIENTE');
});

test('la normalización es idempotente', () => {
  const once = normalizeLegacyExpense({ satStatus: 'NO_VALIDADO_SAT' });
  const twice = normalizeLegacyExpense(once);

  assert.deepEqual(twice, once);
});
