const Sociedad = require('../models/Sociedad');

const normalize = value => String(value || '').trim().toUpperCase();
const normalizeNit = value => normalize(value).replace(/[-\s]/g, '');

const findActiveByCode = codigo => Sociedad.findOne({ codigo: normalize(codigo), activa: true }).lean();
const findActiveByNit = nit => Sociedad.findOne({ nit: normalizeNit(nit), activa: true }).lean();

const validate = async (codigo, nit) => {
  const society = await findActiveByCode(codigo);
  if (!society) return { valid: false, reason: 'SOCIEDAD_NO_CONFIGURADA', society: null };
  return {
    valid: normalizeNit(society.nit) === normalizeNit(nit),
    reason: normalizeNit(society.nit) === normalizeNit(nit) ? 'NINGUNA' : 'NIT_SOCIEDAD_NO_COINCIDE',
    society
  };
};

module.exports = { normalizeNit, findActiveByCode, findActiveByNit, validate };
