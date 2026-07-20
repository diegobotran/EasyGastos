const Sociedad = require('../models/Sociedad');

const normalize = value => String(value || '').trim().toUpperCase();

const findActiveByCode = codigo => Sociedad.findOne({ codigo: normalize(codigo), activa: true }).lean();
const findActiveByNit = nit => Sociedad.findOne({ nit: normalize(nit), activa: true }).lean();

const validate = async (codigo, nit) => {
  const society = await findActiveByCode(codigo);
  if (!society) return { valid: false, reason: 'SOCIEDAD_NO_CONFIGURADA', society: null };
  return {
    valid: society.nit === normalize(nit),
    reason: society.nit === normalize(nit) ? 'NINGUNA' : 'NIT_SOCIEDAD_NO_COINCIDE',
    society
  };
};

module.exports = { findActiveByCode, findActiveByNit, validate };
