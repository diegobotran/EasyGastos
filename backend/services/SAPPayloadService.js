const { models } = require('../database/init');

const { Liquidation, Expense, User } = models;

const FIXED_CURRENCY = 'GTQ';
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

  if (!liquidation.id) {
    warnings.push({ field: 'XBLNR', message: 'La liquidaciÃ³n no tiene identificador para construir la referencia SAP.' });
  }

  if (!expenses.length) {
    warnings.push({ field: 'expenses', message: 'La liquidaciÃ³n no tiene gastos asociados para construir el payload SAP.' });
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

  return {
    header: {
      BLDAT: formatDateForSAP(today),
      BUDAT: formatDateForSAP(today),
      BUKRS: normalizeSociedadForSAP(liquidation.sociedad),
      LIFNR: user?.lifnr ? padLeft(user.lifnr, LIFNR_LENGTH) : '',
      XBLNR: reference,
      ZTERM: FIXED_PAYMENT_TERM,
      BKTXT: reference,
      WAERS: FIXED_CURRENCY,
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

  return {
    notFound: false,
    isValid: true,
    payload: buildPayload(liquidation, user, orderedExpenses),
    warnings: {
      headerWarnings,
      itemWarnings,
    },
  };
};

module.exports = {
  buildLiquidationSAPPayloadPreview: buildPreview,
};
