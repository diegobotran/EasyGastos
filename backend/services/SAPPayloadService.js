const { models } = require('../database/init');

const { Liquidation, Expense, User } = models;

const FIXED_PAYMENT_TERM = 'K001';
const FIXED_TAX_CODE = '02';
const HKONT_LENGTH = 10;
const KOSTL_LENGTH = 10;
const AUFNR_LENGTH = 12;
const LIFNR_LENGTH = 10;
const ZNUMFAC_LENGTH = 11;
const BUKRS_LENGTH = 4;

const asTrimmedString = (value) => String(value ?? '').trim();

const padLeft = (value, length) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  return String(value).trim().padStart(length, '0');
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

  if (!formattedDate) {
    return `LIQ-${liquidation.id}`;
  }

  return `LIQ-${formattedDate}-${liquidation.id}`;
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
      ZSERFAC: asTrimmedString(expense.serie),
      ZNUMFAC: expense.noinvoice ? padLeft(expense.noinvoice, ZNUMFAC_LENGTH) : '',
      BLART: '',
      BLDAT: formatDateForSAP(expense.date),
      STCD1: asTrimmedString(expense.vat_number),
      NAME1: asTrimmedString(expense.supplier),
      SGTXT: asTrimmedString(expense.description),
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
  ...extra,
});

const buildPreviewSummary = (liquidation, user, orderedExpenses, payload, missingExpenseIds, headerWarnings, itemWarnings) => {
  const headerFields = [
    buildFieldStatus('BLDAT', 'Fecha de documento cabecera', payload.header.BLDAT, true, 'header', 'Fecha actual del envío'),
    buildFieldStatus('BUDAT', 'Fecha de contabilización', payload.header.BUDAT, true, 'header', 'Fecha actual del envío'),
    buildFieldStatus('BUKRS', 'Sociedad', payload.header.BUKRS, true, 'header', 'Liquidación'),
    buildFieldStatus('LIFNR', 'Código proveedor/usuario SAP', payload.header.LIFNR, true, 'header', 'Usuario'),
    buildFieldStatus('XBLNR', 'Referencia SAP', payload.header.XBLNR, true, 'header', 'Liquidación'),
    buildFieldStatus('BKTXT', 'Texto de cabecera', payload.header.BKTXT, true, 'header', 'Liquidación'),
    buildFieldStatus('WAERS', 'Moneda', payload.header.WAERS, true, 'header', 'Liquidación'),
    buildFieldStatus('DMBTR', 'Monto total', payload.header.DMBTR, true, 'header', 'Liquidación / gastos'),
    buildFieldStatus('ZTERM', 'Condición de pago', payload.header.ZTERM, false, 'header', 'Valor fijo', { emptyByDesign: false }),
    buildFieldStatus('DZLSPR', 'Bloqueo de pago', payload.header.DZLSPR, false, 'header', 'Vacío por diseño', { emptyByDesign: true }),
  ];

  const supplierFields = [
    buildFieldStatus('LIFNR', 'Código proveedor/usuario SAP', payload.header.LIFNR, true, 'supplier', 'Usuario'),
    buildFieldStatus('USER_EMAIL', 'Correo del usuario', user?.email || liquidation.userId || '', false, 'supplier', 'Usuario'),
    buildFieldStatus('EMPLOYEE_NAME', 'Empleado', liquidation.employeeName || '', false, 'supplier', 'Liquidación'),
  ];

  const expenseFields = orderedExpenses.map((expense, index) => ({
    expenseId: expense.id,
    label: `Gasto ${index + 1}`,
    description: expense.description || '',
    fields: [
      buildFieldStatus('HKONT', 'Cuenta contable', payload.items[index]?.HKONT || '', true, 'expense', 'Categoría / gasto', { expenseId: expense.id }),
      buildFieldStatus('DMBTR', 'Monto', payload.items[index]?.DMBTR || '', true, 'expense', 'Gasto', { expenseId: expense.id }),
      buildFieldStatus('KOSTL', 'Centro de costo', payload.items[index]?.KOSTL || '', true, 'expense', 'Categoría / gasto', { expenseId: expense.id }),
      buildFieldStatus('AUFNR', 'Orden CO', payload.items[index]?.AUFNR || '', true, 'expense', 'Categoría / gasto', { expenseId: expense.id }),
      buildFieldStatus('ZSERFAC', 'Serie factura', payload.items[index]?.ZSERFAC || '', true, 'expense', 'Gasto', { expenseId: expense.id }),
      buildFieldStatus('ZNUMFAC', 'Número factura', payload.items[index]?.ZNUMFAC || '', true, 'expense', 'Gasto', { expenseId: expense.id }),
      buildFieldStatus('BLDAT', 'Fecha documento', payload.items[index]?.BLDAT || '', true, 'expense', 'Gasto', { expenseId: expense.id }),
      buildFieldStatus('STCD1', 'NIT emisor', payload.items[index]?.STCD1 || '', true, 'expense', 'Gasto', { expenseId: expense.id }),
      buildFieldStatus('NAME1', 'Nombre emisor', payload.items[index]?.NAME1 || '', true, 'expense', 'Gasto', { expenseId: expense.id }),
      buildFieldStatus('SGTXT', 'Descripción SAP', payload.items[index]?.SGTXT || '', true, 'expense', 'Gasto', { expenseId: expense.id }),
      buildFieldStatus('ZMWSKZ', 'Código de impuesto', payload.items[index]?.ZMWSKZ || '', false, 'expense', 'Valor fijo', { expenseId: expense.id, emptyByDesign: false }),
      buildFieldStatus('ZUMSK', 'Indicador especial', payload.items[index]?.ZUMSK || '', false, 'expense', 'Vacío por diseño', { expenseId: expense.id, emptyByDesign: true }),
      buildFieldStatus('BLART', 'Clase de documento', payload.items[index]?.BLART || '', false, 'expense', 'Vacío por diseño', { expenseId: expense.id, emptyByDesign: true }),
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
