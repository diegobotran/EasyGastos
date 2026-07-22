const SystemParameter = require('../models/SystemParameter');

const TIME_ZONE = 'America/Guatemala';
const DAY_MS = 24 * 60 * 60 * 1000;

const dateOnly = (value, timeZone = TIME_ZONE) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const toDayNumber = value => {
  const normalized = dateOnly(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
};

const calculateCalendarAge = (issueDate, referenceDate = new Date(), timeZone = TIME_ZONE) => {
  const issue = dateOnly(issueDate, timeZone);
  const reference = dateOnly(referenceDate, timeZone);
  if (!issue || !reference) {
    const error = new Error('La fecha de emisión no es válida.');
    error.code = 'INVALID_INVOICE_DATE';
    error.status = 422;
    throw error;
  }
  return {
    issueDate: issue,
    referenceDate: reference,
    elapsedDays: toDayNumber(reference) - toDayNumber(issue),
    timeZone
  };
};

const getActiveValidityPolicy = async () => {
  const parameter = await SystemParameter.findOne({ key: 'INVOICE_VALIDITY_DAYS' }).lean();
  if (!parameter) {
    const error = new Error('El parámetro de vigencia no está configurado.');
    error.code = 'INVOICE_VALIDITY_POLICY_NOT_FOUND';
    error.status = 422;
    throw error;
  }
  return { enabled: parameter.active !== false, allowedDays: parameter.value };
};

const validateInvoiceAge = (issueDate, referenceDate, policy) => {
  if (!policy.enabled) return { enabled: false, valid: true, reason: 'POLICY_DISABLED' };
  const age = calculateCalendarAge(issueDate, referenceDate);
  return {
    enabled: true,
    valid: age.elapsedDays <= policy.allowedDays,
    ...age,
    allowedDays: policy.allowedDays,
    reason: age.elapsedDays <= policy.allowedDays ? 'NINGUNA' : 'INVOICE_EXPIRED'
  };
};

const validateWithActivePolicy = async (issueDate, referenceDate = new Date()) =>
  validateInvoiceAge(issueDate, referenceDate, await getActiveValidityPolicy());

module.exports = {
  TIME_ZONE,
  dateOnly,
  calculateCalendarAge,
  getActiveValidityPolicy,
  validateInvoiceAge,
  validateWithActivePolicy
};
