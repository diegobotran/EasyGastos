const CatalogService = require('./CatalogService');
const InvoiceValidityService = require('./InvoiceValidityService');

class LiquidationFiscalError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const expenseLabel = expense => ({
  id: expense.id,
  description: expense.description || expense.supplier || 'Gasto sin descripción',
  serie: expense.serie || '',
  noinvoice: expense.noinvoice || '',
  issueDate: expense.satInvoiceSnapshot?.fechaEmision || expense.date || null
});

const getIssueDate = expense => expense.satInvoiceSnapshot?.fechaEmision || expense.date;

const findExpiredExpenses = async (expenses, referenceDate = new Date()) => {
  const results = await Promise.all(expenses.map(async expense => {
    const validity = await InvoiceValidityService.validateWithActivePolicy(getIssueDate(expense), referenceDate);
    return validity.valid ? null : { ...expenseLabel(expense), ...validity };
  }));
  return results.filter(Boolean);
};

const assertFormation = async ({ expenses, sociedad, currency }) => {
  const notSatValidated = expenses.filter(expense => expense.satStatus !== 'VALIDADO_SAT');
  if (notSatValidated.length) {
    throw new LiquidationFiscalError(
      422,
      'LIQUIDATION_EXPENSE_NOT_SAT_VALIDATED',
      'Todos los gastos deben estar validados por SAT antes de incluirse en una liquidación.',
      { expenses: notSatValidated.map(expenseLabel) }
    );
  }

  const notEligible = expenses.filter(expense => expense.fiscalStatus !== 'APTO_PARA_LIQUIDAR');
  if (notEligible.length) {
    throw new LiquidationFiscalError(
      422,
      'LIQUIDATION_EXPENSE_NOT_FISCALLY_ELIGIBLE',
      'Todos los gastos deben estar aptos fiscalmente para formar una liquidación.',
      { expenses: notEligible.map(expense => ({ ...expenseLabel(expense), fiscalStatus: expense.fiscalStatus || 'PENDIENTE' })) }
    );
  }

  const expectedSociety = String(sociedad || '').trim();
  const expectedCurrency = String(currency || '').trim().toUpperCase();
  const expectedCenter = String(expenses[0]?.centro || '').trim();
  const inconsistent = expenses.filter(expense =>
    String(expense.sociedad || '').trim() !== expectedSociety ||
    String(expense.currency || '').trim().toUpperCase() !== expectedCurrency ||
    String(expense.centro || '').trim() !== expectedCenter
  );
  if (!expectedCenter || inconsistent.length) {
    throw new LiquidationFiscalError(
      422,
      'LIQUIDATION_ACCOUNTING_SCOPE_MISMATCH',
      'Todos los gastos deben pertenecer a la misma sociedad, centro y moneda.',
      { expected: { sociedad: expectedSociety, centro: expectedCenter, currency: expectedCurrency }, expenses: inconsistent.map(expenseLabel) }
    );
  }

  for (const expense of expenses) {
    await CatalogService.assertActiveReferences({
      sociedad: expense.sociedad,
      centro: expense.centro,
      cuenta: expense.cuenta,
      ordenco: expense.ordenco
    });
  }

  const expired = await findExpiredExpenses(expenses);
  if (expired.length) {
    throw new LiquidationFiscalError(
      422,
      'LIQUIDATION_HAS_EXPIRED_EXPENSES',
      'La liquidación contiene gastos cuya vigencia fiscal venció.',
      { expenses: expired }
    );
  }

  return { valid: true, centro: expectedCenter };
};

const assertSubmit = async expenses => {
  const notSatValidated = expenses.filter(expense => expense.satStatus !== 'VALIDADO_SAT');
  if (notSatValidated.length) {
    throw new LiquidationFiscalError(
      422,
      'LIQUIDATION_EXPENSE_NOT_SAT_VALIDATED',
      'La liquidación contiene gastos que perdieron su validación SAT.',
      { expenses: notSatValidated.map(expenseLabel) }
    );
  }
  const expired = await findExpiredExpenses(expenses);
  if (expired.length) {
    throw new LiquidationFiscalError(
      422,
      'LIQUIDATION_HAS_EXPIRED_EXPENSES',
      'No se puede enviar a aprobación porque uno o más gastos vencieron.',
      { expenses: expired }
    );
  }
  return { valid: true };
};

module.exports = {
  LiquidationFiscalError,
  assertFormation,
  assertSubmit,
  findExpiredExpenses
};
