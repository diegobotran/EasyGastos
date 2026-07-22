const normalize = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toFixed(2);
  return String(value).trim().toUpperCase();
};

const buildSource = expense => [
  expense.serie,
  expense.noinvoice,
  expense.uuid,
  expense.vat_number || expense.nitEmisor,
  expense.supplier,
  expense.date,
  expense.amount,
  expense.currency,
  expense.sociedad,
  expense.category,
  expense.imageValidationFingerprint || expense.imageuri
].map(normalize).join('|');

const build = expense => buildSource(expense);

module.exports = { normalize, buildSource, build };
