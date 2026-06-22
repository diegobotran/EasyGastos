const { models } = require('../database/init');

const { Liquidation, Expense, User } = models;

const FIXED_PAYMENT_TERM = 'K001';
const FIXED_TAX_CODE = '02';
const HKONT_LENGTH = 10;
const KOSTL_LENGTH = 10;
const AUFNR_LENGTH = 12;
const LIFNR_LENGTH = 10;
const ZSERFAC_LENGTH = 15;
const ZNUMFAC_LENGTH = 25;
const STCD1_LENGTH = 16;
const NAME1_LENGTH = 50;
const SGTXT_LENGTH = 50;
const BUKRS_LENGTH = 4;
const XBLNR_SUFFIX_LENGTH = 5;

const asTrimmedString = (value) => String(value ?? '').trim();

const padLeft = (value, length) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  return String(value).trim().padStart(length, '0');
};

const truncateRight = (value, length) => {
  const normalized = asTrimmedString(value);
  if (!normalized) {
    return '';
  }

  return normalized.slice(0, length);
};

const parseDateParts = (dateValue) => {
  if (!dateValue) {
    return null;
  }

  const normalized = String(dateValue).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-');
    return { year, month, day };
  }

  const slashMatch = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return { year, month, day };
  }

  const parsedDate = new Date(normalized);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return {
    day: String(parsedDate.getUTCDate()).padStart(2, '0'),
    month: String(parsedDate.getUTCMonth() + 1).padStart(2, '0'),
    year: String(parsedDate.getUTCFullYear()),
  };
};

const formatDateForSAP = (dateValue) => {
  const parsed = parseDateParts(dateValue);
  if (!parsed) {
    return '';
  }

  return `${parsed.year}-${parsed.month}-${parsed.day}`;
};

const formatDateForReference = (dateValue) => {
  const parsed = parseDateParts(dateValue);
  if (!parsed) {
    return '';
  }

  return `${parsed.day}${parsed.month}${parsed.year}`;
};

const formatAmountForSAP = (value) => Number(value || 0).toFixed(2);

const formatOptionalAmountForSAP = (value) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toFixed(2) : '';
};

const normalizeSociedadForSAP = (value) => {
  if (!value) {
    return '';
  }

  return asTrimmedString(value).padStart(BUKRS_LENGTH, '0');
};

const getOrderedExpenses = (liquidation, expenses) => {
  const expenseMap = new Map(expenses.map((expense) => [expense.id, expense]));
  const orderedExpenses = (liquidation.expenseIds || [])
    .map((expenseId) => expenseMap.get(expenseId))
    .filter(Boolean);

  const missingExpenseIds = (liquidation.expenseIds || []).filter((expenseId) => !expenseMap.has(expenseId));

  return {
    orderedExpenses,
    missingExpenseIds,
  };
};

const buildLiquidationReference = (liquidation) => {
  const createdDate = liquidation.createdDate || liquidation.submittedDate || liquidation.approvedDate;
  const formattedDate = formatDateForReference(createdDate);
  const suffix = String(liquidation.id || '').trim().slice(-XBLNR_SUFFIX_LENGTH);

  if (!formattedDate) {
    return `LIQ${suffix}`;
  }

  return `LIQ${formattedDate}${suffix}`;
};

const buildHeaderWarnings = (liquidation, user, expenses, missingExpenseIds = []) => {
  const warnings = [];

  if (!user) {
    warnings.push({ field: 'user', message: 'No se encontrÃ³ el usuario de la liquidaciÃ³n; la cabecera usarÃ¡ valores vacÃ­os.' });
  }

  if (!user?.lifnr) {
    warnings.push({ field: 'LIFNR', message: 'El usuario no tiene LIFNR configurado.' });
  }

  if (!liquidation.sociedad) {
    warnings.push({ field: 'BUKRS', message: 'La liquidaciÃ³n no tiene sociedad capturada.' });
  }

  if (!liquidation.currency) {
    warnings.push({ field: 'WAERS', message: 'La liquidaciÃ³n no tiene moneda capturada.' });
  }

  if (!liquidation.id) {
    warnings.push({ field: 'XBLNR', message: 'La liquidaciÃ³n no tiene identificador para construir la referencia SAP.' });
  }

  if (!expenses.length) {
    warnings.push({ field: 'expenses', message: 'La liquidaciÃ³n no tiene gastos asociados para construir el payload SAP.' });
  }

  const totalAmount = Number(liquidation.totalAmount || expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0));
  if (!(totalAmount > 0)) {
    warnings.push({ field: 'DMBTR', message: 'La liquidaciÃ³n no tiene un monto total válido para SAP.' });
  }

  if (missingExpenseIds.length > 0) {
    warnings.push({
      field: 'expenses',
      message: `No se encontraron ${missingExpenseIds.length} gasto(s) asociados a la liquidaciÃ³n en backend.`,
      expenseIds: missingExpenseIds,
    });
  }

  return warnings;
};

const buildItemWarnings = (expense) => {
  const warnings = [];

  if (!expense.category) warnings.push({ field: 'category', message: 'El gasto no tiene categorÃ­a.' });
  if (!expense.sociedad) warnings.push({ field: 'sociedad', message: 'El gasto no tiene sociedad.' });
  if (!expense.cuenta) warnings.push({ field: 'HKONT', message: 'El gasto no tiene cuenta contable.' });
  if (!expense.centro) warnings.push({ field: 'KOSTL', message: 'El gasto no tiene centro de costo.' });
  if (!expense.ordenco) warnings.push({ field: 'AUFNR', message: 'El gasto no tiene orden CO.' });
  if (!expense.serie) warnings.push({ field: 'ZSERFAC', message: 'El gasto no tiene serie de factura.' });
  if (!expense.noinvoice) warnings.push({ field: 'ZNUMFAC', message: 'El gasto no tiene nÃºmero de factura.' });
  if (!expense.date || !formatDateForSAP(expense.date)) warnings.push({ field: 'BLDAT', message: 'El gasto no tiene fecha de documento vÃ¡lida.' });
  if (!expense.vat_number || !expense.vat_number.trim()) warnings.push({ field: 'STCD1', message: 'El gasto no tiene NIT del emisor.' });
  if (!expense.supplier || !expense.supplier.trim()) warnings.push({ field: 'NAME1', message: 'El gasto no tiene nombre del emisor.' });
  if (!expense.description) warnings.push({ field: 'SGTXT', message: 'El gasto no tiene descripciÃ³n final.' });
  if (expense.amount === null || expense.amount === undefined || expense.amount === '') warnings.push({ field: 'DMBTR', message: 'El gasto no tiene monto disponible.' });

  return warnings;
};

const buildPayload = (liquidation, user, expenses) => {
  const reference = buildLiquidationReference(liquidation);
  const today = new Date().toISOString().split('T')[0];
  const totalAmount = Number(liquidation.totalAmount || expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0));
  const currency = asTrimmedString(liquidation.currency).toUpperCase();

  return {
    header: {
      BLDAT: formatDateForSAP(today),
      BUDAT: formatDateForSAP(today),
      BUKRS: normalizeSociedadForSAP(liquidation.sociedad),
      LIFNR: user?.lifnr ? padLeft(user.lifnr, LIFNR_LENGTH) : '',
      XBLNR: reference,
      ZTERM: FIXED_PAYMENT_TERM,
      BKTXT: reference,
      WAERS: currency,
      DMBTR: totalAmount > 0 ? formatAmountForSAP(totalAmount) : '',
      DZLSPR: '',
    },
    items: expenses.map((expense) => ({
      HKONT: expense.cuenta ? padLeft(expense.cuenta, HKONT_LENGTH) : '',
      ZMWSKZ: FIXED_TAX_CODE,
      DMBTR: formatOptionalAmountForSAP(expense.amount),
      ZUMSK: '',
      KOSTL: expense.centro ? padLeft(expense.centro, KOSTL_LENGTH) : '',
      AUFNR: expense.ordenco ? padLeft(expense.ordenco, AUFNR_LENGTH) : '',
      ZSERFAC: truncateRight(expense.serie, ZSERFAC_LENGTH),
      ZNUMFAC: expense.noinvoice ? padLeft(expense.noinvoice, ZNUMFAC_LENGTH) : '',
      BLART: '',
      BLDAT: formatDateForSAP(expense.date),
      STCD1: truncateRight(expense.vat_number, STCD1_LENGTH),
      NAME1: truncateRight(expense.supplier, NAME1_LENGTH),
      SGTXT: truncateRight(expense.description, SGTXT_LENGTH),
    })),
  };
};

const buildFieldStatus = (field, label, value, required, section, source, extra = {}) => ({
  field,
  label,
  value: value ?? '',
  required,
  section,
  source,
  isMissing: String(value ?? '').trim() === '',
  originalValue: extra.originalValue ?? '',
  originalLength: String(extra.originalValue ?? '').trim().length,
  sentLength: String(value ?? '').trim().length,
  wasTrimmed: Boolean(extra.originalValue) && String(extra.originalValue).trim().length > String(value ?? '').trim().length,
  wasPadded: Boolean(extra.originalValue) && String(extra.originalValue).trim().length < String(value ?? '').trim().length,
  ...extra,
});

const formattedDateFromLiquidation = (liquidation) => {
  const createdDate = liquidation.createdDate || liquidation.submittedDate || liquidation.approvedDate;
  const formattedDate = formatDateForReference(createdDate);
  return formattedDate ? `LIQ-${formattedDate}-${liquidation.id || ''}` : String(liquidation.id || '').trim();
};

const buildPreviewSummary = (liquidation, user, orderedExpenses, payload, missingExpenseIds, headerWarnings, itemWarnings) => {
  const originalReference = formattedDateFromLiquidation(liquidation);
  const headerFields = [
    buildFieldStatus('BLDAT', 'Fecha de documento cabecera', payload.header.BLDAT, true, 'header', 'Fecha actual del env?o', { originalValue: new Date().toISOString().split('T')[0] }),
    buildFieldStatus('BUDAT', 'Fecha de contabilizaci?n', payload.header.BUDAT, true, 'header', 'Fecha actual del env?o', { originalValue: new Date().toISOString().split('T')[0] }),
    buildFieldStatus('BUKRS', 'Sociedad', payload.header.BUKRS, true, 'header', 'Liquidaci?n', { originalValue: liquidation.sociedad || '' }),
    buildFieldStatus('LIFNR', 'C?digo proveedor/usuario SAP', payload.header.LIFNR, true, 'header', 'Usuario', { originalValue: user?.lifnr || '' }),
    buildFieldStatus('XBLNR', 'Referencia SAP', payload.header.XBLNR, true, 'header', 'Liquidaci?n', { originalValue: originalReference }),
    buildFieldStatus('BKTXT', 'Texto de cabecera', payload.header.BKTXT, true, 'header', 'Liquidaci?n', { originalValue: originalReference }),
    buildFieldStatus('WAERS', 'Moneda', payload.header.WAERS, true, 'header', 'Liquidaci?n', { originalValue: liquidation.currency || '' }),
    buildFieldStatus('DMBTR', 'Monto total', payload.header.DMBTR, true, 'header', 'Liquidaci?n / gastos', { originalValue: liquidation.totalAmount ?? '' }),
    buildFieldStatus('ZTERM', 'Condici?n de pago', payload.header.ZTERM, false, 'header', 'Valor fijo', { emptyByDesign: false }),
    buildFieldStatus('DZLSPR', 'Bloqueo de pago', payload.header.DZLSPR, false, 'header', 'Vac?o por dise?o', { emptyByDesign: true }),
  ];
  const supplierFields = [
    buildFieldStatus('LIFNR', 'C?digo proveedor/usuario SAP', payload.header.LIFNR, true, 'supplier', 'Usuario', { originalValue: user?.lifnr || '' }),
    buildFieldStatus('USER_EMAIL', 'Correo del usuario', user?.email || liquidation.userId || '', false, 'supplier', 'Usuario', { originalValue: user?.email || liquidation.userId || '' }),
    buildFieldStatus('EMPLOYEE_NAME', 'Empleado', liquidation.employeeName || '', false, 'supplier', 'Liquidaci?n', { originalValue: liquidation.employeeName || '' }),
  ];
  const expenseFields = orderedExpenses.map((expense, index) => ({
    expenseId: expense.id,
    label: `Gasto ${index + 1}`,
    description: expense.description || '',
    fields: [
      buildFieldStatus('HKONT', 'Cuenta contable', payload.items[index]?.HKONT || '', true, 'expense', 'Categor?a / gasto', { expenseId: expense.id, originalValue: expense.cuenta || '' }),
      buildFieldStatus('DMBTR', 'Monto', payload.items[index]?.DMBTR || '', true, 'expense', 'Gasto', { expenseId: expense.id, originalValue: expense.amount ?? '' }),
      buildFieldStatus('KOSTL', 'Centro de costo', payload.items[index]?.KOSTL || '', true, 'expense', 'Categor?a / gasto', { expenseId: expense.id, originalValue: expense.centro || '' }),
      buildFieldStatus('AUFNR', 'Orden CO', payload.items[index]?.AUFNR || '', true, 'expense', 'Categor?a / gasto', { expenseId: expense.id, originalValue: expense.ordenco || '' }),
      buildFieldStatus('ZSERFAC', 'Serie factura', payload.items[index]?.ZSERFAC || '', true, 'expense', 'Gasto', { expenseId: expense.id, originalValue: expense.serie || '' }),
      buildFieldStatus('ZNUMFAC', 'N?mero factura', payload.items[index]?.ZNUMFAC || '', true, 'expense', 'Gasto', { expenseId: expense.id, originalValue: expense.noinvoice || '' }),
      buildFieldStatus('BLDAT', 'Fecha documento', payload.items[index]?.BLDAT || '', true, 'expense', 'Gasto', { expenseId: expense.id, originalValue: expense.date || '' }),
      buildFieldStatus('STCD1', 'NIT emisor', payload.items[index]?.STCD1 || '', true, 'expense', 'Gasto', { expenseId: expense.id, originalValue: expense.vat_number || '' }),
      buildFieldStatus('NAME1', 'Nombre emisor', payload.items[index]?.NAME1 || '', true, 'expense', 'Gasto', { expenseId: expense.id, originalValue: expense.supplier || '' }),
      buildFieldStatus('SGTXT', 'Descripci?n SAP', payload.items[index]?.SGTXT || '', true, 'expense', 'Gasto', { expenseId: expense.id, originalValue: expense.description || '' }),
      buildFieldStatus('ZMWSKZ', 'C?digo de impuesto', payload.items[index]?.ZMWSKZ || '', false, 'expense', 'Valor fijo', { expenseId: expense.id, emptyByDesign: false }),
      buildFieldStatus('ZUMSK', 'Indicador especial', payload.items[index]?.ZUMSK || '', false, 'expense', 'Vac?o por dise?o', { expenseId: expense.id, emptyByDesign: true }),
      buildFieldStatus('BLART', 'Clase de documento', payload.items[index]?.BLART || '', false, 'expense', 'Vac?o por dise?o', { expenseId: expense.id, emptyByDesign: true }),
    ],
  }));
  const allFields = [
    ...headerFields,
    ...supplierFields,
    ...expenseFields.flatMap((item) => item.fields),
  ];

  return {
    headerFields,
    supplierFields,
    expenseFields,
    missingRequired: allFields.filter((field) => field.required && field.isMissing),
    missingOptional: allFields.filter((field) => !field.required && field.isMissing && !field.emptyByDesign),
    emptyByDesign: allFields.filter((field) => field.emptyByDesign),
    missingExpenseIds,
    warningCount: headerWarnings.length + itemWarnings.reduce((total, item) => total + item.warnings.length, 0),
  };
};

const buildPreview = async (liquidationId) => {
  const liquidation = await Liquidation.findOne({ id: liquidationId }).lean();
  if (!liquidation) {
    return { notFound: true };
  }

  const user = await User.findOne({ email: liquidation.userId }).lean();
  const expenses = await Expense.find({ id: { $in: liquidation.expenseIds } }).lean();
  const { orderedExpenses, missingExpenseIds } = getOrderedExpenses(liquidation, expenses);

  const headerWarnings = buildHeaderWarnings(liquidation, user, orderedExpenses, missingExpenseIds);
  const itemWarnings = orderedExpenses
    .map((expense) => ({
      expenseId: expense.id,
      category: expense.category,
      warnings: buildItemWarnings(expense),
    }))
    .filter((item) => item.warnings.length > 0);

  const payload = buildPayload(liquidation, user, orderedExpenses);
  const summary = buildPreviewSummary(
    liquidation,
    user,
    orderedExpenses,
    payload,
    missingExpenseIds,
    headerWarnings,
    itemWarnings,
  );

  return {
    notFound: false,
    isValid: summary.missingRequired.length === 0,
    payload,
    warnings: {
      headerWarnings,
      itemWarnings,
    },
    summary,
  };
};

module.exports = {
  buildLiquidationSAPPayloadPreview: buildPreview,
};
