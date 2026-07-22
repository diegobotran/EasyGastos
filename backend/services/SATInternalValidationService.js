const SatFactura = require('../models/SatFactura');

const normalize = value => String(value ?? '').trim().toUpperCase();
const normalizeNit = value => normalize(value).replace(/[-\s]/g, '');
const normalizeComparable = value => typeof value === 'number' ? value.toFixed(2) : normalize(value);
const formatDate = value => value ? new Date(value).toISOString().slice(0, 10) : '';

const fieldMap = factura => [
  ['serie', 'Serie', factura.serie],
  ['noinvoice', 'No. Factura', factura.numeroDTE],
  ['vat_number', 'NIT del Emisor', factura.nitEmisor],
  ['supplier', 'Proveedor', factura.nombreEmisor],
  ['date', 'Fecha del Documento', formatDate(factura.fechaEmision)],
  ['amount', 'Monto', factura.granTotal],
  ['uuid', 'UUID', factura.numeroAutorizacion],
  ['currency', 'Moneda', factura.moneda || 'GTQ'],
  ['totiva', 'IVA', factura.iva || 0]
];

const compare = (factura, current = {}) => {
  const campos = {};
  const complementados = [];
  const corregidos = [];
  for (const [field, label, newValue] of fieldMap(factura)) {
    campos[field] = newValue;
    if (newValue === null || newValue === undefined || newValue === '') continue;
    const previousValue = current[field] ?? (field === 'vat_number' ? current.nitEmisor : undefined);
    if (!normalizeComparable(previousValue)) {
      complementados.push({ field, label, newValue });
    } else if (normalizeComparable(previousValue) !== normalizeComparable(newValue)) {
      corregidos.push({ field, label, previousValue, newValue });
    }
  }
  return { campos, complementados, corregidos };
};

const buildSnapshot = factura => ({
  numeroAutorizacion: factura.numeroAutorizacion,
  serie: factura.serie,
  numeroDTE: factura.numeroDTE,
  nitEmisor: factura.nitEmisor,
  nombreEmisor: factura.nombreEmisor,
  idReceptor: factura.idReceptor,
  nombreReceptor: factura.nombreReceptor,
  fechaEmision: formatDate(factura.fechaEmision),
  granTotal: factura.granTotal,
  moneda: factura.moneda || 'GTQ',
  iva: factura.iva || 0
});

const buildCriteria = input => {
  if (input.uuid?.trim()) return { numeroAutorizacion: input.uuid.trim() };
  const criteria = {
    serie: String(input.serie || '').trim(),
    numeroDTE: String(input.noinvoice || '').trim()
  };
  if (input.nitEmisor?.trim()) criteria.nitEmisor = normalizeNit(input.nitEmisor);
  return criteria;
};

const validate = async input => {
  if ((!input.serie || !input.noinvoice) && !input.uuid) {
    const error = new Error('Se requiere UUID o la combinación serie y noinvoice.');
    error.code = 'SAT_INVALID_REQUEST';
    error.status = 400;
    throw error;
  }
  const factura = await SatFactura.findOne(buildCriteria(input)).sort({ fechaEmision: -1 }).lean();
  if (!factura) {
    return {
      code: 'SAT_NOT_FOUND_D_PLUS_1',
      encontrada: false,
      mensaje: 'La factura aún no está disponible en la réplica SAT D+1. Puede guardar el gasto como pendiente.'
    };
  }
  const differences = compare(factura, input);
  return {
    code: 'SAT_INVOICE_FOUND',
    encontrada: true,
    validada: true,
    facturaId: String(factura._id),
    factura,
    ...differences,
    snapshot: buildSnapshot(factura),
    validatedAt: new Date().toISOString(),
    mensaje: 'Factura localizada en la réplica SAT interna.'
  };
};

module.exports = { normalizeNit, compare, buildSnapshot, buildCriteria, validate };
