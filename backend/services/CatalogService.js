const mongoose = require('mongoose');
const Sociedad = require('../models/Sociedad');
const Centro = require('../models/Centro');
const Cuenta = require('../models/Cuenta');
const OrdenCO = require('../models/OrdenCO');
const SystemParameter = require('../models/SystemParameter');
const { models } = require('../database/init');

class CatalogError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const definitions = Object.freeze({
  sociedades: {
    model: Sociedad,
    activeField: 'activa',
    fields: ['acronimo', 'codigo', 'nit', 'nombre', 'razonSocial', 'pais', 'configuracion'],
    required: ['codigo', 'nit'],
    search: ['acronimo', 'codigo', 'nit', 'nombre', 'razonSocial'],
    filters: ['codigo', 'nit', 'pais']
  },
  centros: {
    model: Centro,
    activeField: 'activo',
    fields: ['acronimo', 'codigo', 'ownerEmail'],
    required: ['acronimo', 'codigo', 'ownerEmail'],
    search: ['acronimo', 'codigo', 'ownerEmail'],
    filters: ['codigo', 'ownerEmail']
  },
  cuentas: {
    model: Cuenta,
    activeField: 'activo',
    fields: ['acronimo', 'codigo'],
    required: ['acronimo', 'codigo'],
    search: ['acronimo', 'codigo'],
    filters: ['codigo']
  },
  ordenesCO: {
    model: OrdenCO,
    activeField: 'activo',
    fields: ['acronimo', 'codigo'],
    required: ['acronimo', 'codigo'],
    search: ['acronimo', 'codigo'],
    filters: ['codigo']
  }
});

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeText = value => typeof value === 'string' ? value.trim() : value;

const getDefinition = catalog => {
  const definition = definitions[catalog];
  if (!definition) throw new CatalogError(404, 'CATALOG_NOT_FOUND', 'Catálogo no reconocido.');
  return definition;
};

const validateCode = (catalog, codigo) => {
  if (!/^\d+$/.test(String(codigo || ''))) {
    throw new CatalogError(422, 'INVALID_CATALOG_CODE', 'El código debe contener únicamente dígitos.');
  }
  if (catalog === 'sociedades' && String(codigo).length > 4) {
    throw new CatalogError(422, 'INVALID_CATALOG_CODE', 'El código de sociedad admite como máximo 4 dígitos.');
  }
};

const validateOwner = async ownerEmail => {
  const normalized = String(ownerEmail || '').trim().toLowerCase();
  const owner = await models.User.findOne({ email: normalized, isActive: true }).select('_id').lean();
  if (!owner) {
    throw new CatalogError(422, 'CENTER_OWNER_NOT_ACTIVE', 'El propietario del centro debe ser un usuario activo.');
  }
  return normalized;
};

const buildPayload = async (catalog, input, updatedBy) => {
  const definition = getDefinition(catalog);
  const payload = {};
  for (const field of definition.fields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) payload[field] = normalizeText(input[field]);
  }
  for (const field of definition.required) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      throw new CatalogError(422, 'REQUIRED_FIELD', `El campo ${field} es obligatorio.`, { field });
    }
  }
  if (payload.codigo !== undefined) validateCode(catalog, payload.codigo);
  if (catalog === 'centros' && payload.ownerEmail !== undefined) {
    payload.ownerEmail = await validateOwner(payload.ownerEmail);
  }
  payload.updatedBy = updatedBy;
  return payload;
};

const translatePersistenceError = error => {
  if (error instanceof CatalogError) return error;
  if (error?.code === 11000) {
    return new CatalogError(409, 'CATALOG_DUPLICATE', 'Ya existe un registro con el mismo código o NIT.', error.keyValue);
  }
  if (error?.name === 'ValidationError') {
    return new CatalogError(422, 'CATALOG_VALIDATION_FAILED', error.message);
  }
  return error;
};

const list = async (catalog, query = {}, options = {}) => {
  const definition = getDefinition(catalog);
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  const filter = {};
  if (!options.allowInactive || query.active === 'true') filter[definition.activeField] = true;
  if (options.allowInactive && query.active === 'false') filter[definition.activeField] = false;
  if (query.search?.trim()) {
    const pattern = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = definition.search.map(field => ({ [field]: pattern }));
  }
  for (const field of definition.filters) {
    if (query[field]?.trim()) {
      filter[field] = field === 'ownerEmail'
        ? query[field].trim().toLowerCase()
        : query[field].trim().toUpperCase();
    }
  }
  const [items, total] = await Promise.all([
    definition.model.find(filter).sort({ codigo: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    definition.model.countDocuments(filter)
  ]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

const getById = async (catalog, id) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new CatalogError(422, 'INVALID_CATALOG_ID', 'El identificador del registro no es válido.');
  }
  const item = await getDefinition(catalog).model.findById(id).lean();
  if (!item) throw new CatalogError(404, 'CATALOG_ITEM_NOT_FOUND', 'Registro no encontrado.');
  return item;
};

const create = async (catalog, input, updatedBy) => {
  try {
    const definition = getDefinition(catalog);
    const payload = await buildPayload(catalog, input, updatedBy);
    payload[definition.activeField] = typeof input.active === 'boolean'
      ? input.active
      : input[definition.activeField] !== false;
    return (await definition.model.create(payload)).toObject();
  } catch (error) {
    throw translatePersistenceError(error);
  }
};

const assertVersion = (document, expectedUpdatedAt) => {
  if (!expectedUpdatedAt) {
    throw new CatalogError(422, 'UPDATED_AT_REQUIRED', 'updatedAt es obligatorio para controlar ediciones concurrentes.');
  }
  if (Number.isNaN(new Date(expectedUpdatedAt).getTime())) {
    throw new CatalogError(422, 'INVALID_UPDATED_AT', 'updatedAt debe contener una fecha válida.');
  }
  if (new Date(document.updatedAt).getTime() !== new Date(expectedUpdatedAt).getTime()) {
    throw new CatalogError(409, 'CATALOG_VERSION_CONFLICT', 'El registro fue modificado por otro usuario.', {
      current: document.toObject()
    });
  }
};

const update = async (catalog, id, input, updatedBy) => {
  try {
    const definition = getDefinition(catalog);
    if (!mongoose.isValidObjectId(id)) {
      throw new CatalogError(422, 'INVALID_CATALOG_ID', 'El identificador del registro no es válido.');
    }
    const document = await definition.model.findById(id);
    if (!document) throw new CatalogError(404, 'CATALOG_ITEM_NOT_FOUND', 'Registro no encontrado.');
    assertVersion(document, input.updatedAt);
    const merged = Object.fromEntries(definition.fields.map(field => [field,
      Object.prototype.hasOwnProperty.call(input, field) ? input[field] : document[field]
    ]));
    const payload = await buildPayload(catalog, merged, updatedBy);
    const updated = await definition.model.findOneAndUpdate(
      { _id: document._id, updatedAt: document.updatedAt },
      { $set: payload },
      { new: true, runValidators: true }
    );
    if (!updated) {
      throw new CatalogError(409, 'CATALOG_VERSION_CONFLICT', 'El registro fue modificado por otro usuario.');
    }
    return updated.toObject();
  } catch (error) {
    throw translatePersistenceError(error);
  }
};

const setActive = async (catalog, id, active, expectedUpdatedAt, updatedBy) => {
  const definition = getDefinition(catalog);
  if (!mongoose.isValidObjectId(id)) {
    throw new CatalogError(422, 'INVALID_CATALOG_ID', 'El identificador del registro no es válido.');
  }
  const document = await definition.model.findById(id);
  if (!document) throw new CatalogError(404, 'CATALOG_ITEM_NOT_FOUND', 'Registro no encontrado.');
  assertVersion(document, expectedUpdatedAt);
  const updated = await definition.model.findOneAndUpdate(
    { _id: document._id, updatedAt: document.updatedAt },
    { $set: { [definition.activeField]: Boolean(active), updatedBy } },
    { new: true, runValidators: true }
  );
  if (!updated) {
    throw new CatalogError(409, 'CATALOG_VERSION_CONFLICT', 'El registro fue modificado por otro usuario.');
  }
  return updated.toObject();
};

const getInvoiceValidity = async () => {
  const parameter = await SystemParameter.findOne({ key: 'INVOICE_VALIDITY_DAYS' }).lean();
  if (!parameter) throw new CatalogError(404, 'PARAMETER_NOT_FOUND', 'El parámetro de vigencia no ha sido inicializado.');
  return parameter;
};

const updateInvoiceValidity = async (input, updatedBy) => {
  const document = await SystemParameter.findOne({ key: 'INVOICE_VALIDITY_DAYS' });
  if (!document) throw new CatalogError(404, 'PARAMETER_NOT_FOUND', 'El parámetro de vigencia no ha sido inicializado.');
  assertVersion(document, input.updatedAt);
  if (!Number.isInteger(input.value) || input.value < 1) {
    throw new CatalogError(422, 'INVALID_PARAMETER_VALUE', 'La vigencia debe ser un número entero positivo.');
  }
  const values = { value: input.value, updatedBy };
  if (typeof input.active === 'boolean') values.active = input.active;
  const updated = await SystemParameter.findOneAndUpdate(
    { _id: document._id, updatedAt: document.updatedAt },
    { $set: values },
    { new: true, runValidators: true }
  );
  if (!updated) {
    throw new CatalogError(409, 'CATALOG_VERSION_CONFLICT', 'El parámetro fue modificado por otro usuario.');
  }
  return updated.toObject();
};

const assertActiveReferences = async references => {
  const checks = [
    ['sociedades', references.sociedad, 'Sociedad'],
    ['centros', references.centro, 'Centro'],
    ['cuentas', references.cuenta, 'Cuenta'],
    ['ordenesCO', references.ordenco, 'Orden CO']
  ];
  const results = await Promise.all(checks.map(async ([catalog, rawCode, label]) => {
    const codigo = String(rawCode || '').trim();
    if (!codigo) return { catalog, codigo, label, active: false };
    const definition = getDefinition(catalog);
    const active = Boolean(await definition.model.exists({ codigo, [definition.activeField]: true }));
    return { catalog, codigo, label, active };
  }));
  const invalid = results.filter(result => !result.active);
  if (invalid.length) {
    throw new CatalogError(
      422,
      'INACTIVE_CATALOG_REFERENCE',
      'La categoría contiene referencias contables inexistentes o inactivas.',
      { invalid: invalid.map(({ catalog, codigo, label }) => ({ catalog, codigo, label })) }
    );
  }
  return true;
};

module.exports = {
  CatalogError,
  definitions,
  list,
  getById,
  create,
  update,
  setActive,
  getInvoiceValidity,
  updateInvoiceValidity,
  assertActiveReferences,
  validateOwner,
  validateCode
};
