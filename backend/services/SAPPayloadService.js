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

const normalizeSociedadForSAP = (value) => asTrimmedString(value).padStart(BUKRS_LENGTH, '0');

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

const buildHeaderErrors = (liquidation, user, expenses, missingExpenseIds = []) => {
  const errors = [];

  if (!user) {
    errors.push({ field: 'user', message: 'No se encontró el usuario de la liquidación' });
    return errors;
  }

  if (!user.lifnr) {
    errors.push({ field: 'LIFNR', message: 'El usuario no tiene LIFNR configurado' });
  }

  if (!expenses.length) {
    errors.push({ field: 'expenses', message: 'La liquidación no tiene gastos asociados para construir el payload SAP' });
    return errors;
  }

  if (missingExpenseIds.length > 0) {
    errors.push({
      field: 'expenses',
      message: `No se encontraron ${missingExpenseIds.length} gasto(s) asociados a la liquidación en backend`,
      expenseIds: missingExpenseIds,
    });
  }

  const firstExpense = expenses[0];
  if (!firstExpense.sociedad) {
    errors.push({ field: 'BUKRS', message: 'El primer gasto no tiene sociedad para construir la cabecera SAP' });
  }

  if (!liquidation.id) {
    errors.push({ field: 'XBLNR', message: 'La liquidación no tiene identificador para construir la referencia SAP' });
  }

  const firstExpenseDate = firstExpense.date;
  if (!firstExpenseDate || !formatDateForSAP(firstExpenseDate)) {
    errors.push({ field: 'BLDAT', message: 'El primer gasto no tiene fecha de documento válida para la cabecera SAP' });
  }

  const totalAmount = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  if (!totalAmount || totalAmount <= 0) {
    errors.push({ field: 'DMBTR', message: 'La liquidación no tiene un total válido para la cabecera SAP' });
  }

  return errors;
};

const buildItemErrors = (expense) => {
  const errors = [];

  if (!expense.category) {
    errors.push({ field: 'category', message: 'El gasto no tiene categoría' });
  }
  if (!expense.sociedad) {
    errors.push({ field: 'sociedad', message: 'El gasto no tiene sociedad' });
  }
  if (!expense.cuenta) {
    errors.push({ field: 'HKONT', message: 'El gasto no tiene cuenta contable' });
  }
  if (!expense.centro) {
    errors.push({ field: 'KOSTL', message: 'El gasto no tiene centro de costo' });
  }
  if (!expense.ordenco) {
    errors.push({ field: 'AUFNR', message: 'El gasto no tiene orden CO' });
  }
  if (!expense.serie) {
    errors.push({ field: 'ZSERFAC', message: 'El gasto no tiene serie de factura' });
  }
  if (!expense.noinvoice) {
    errors.push({ field: 'ZNUMFAC', message: 'El gasto no tiene número de factura' });
  }
  if (!expense.date || !formatDateForSAP(expense.date)) {
    errors.push({ field: 'BLDAT', message: 'El gasto no tiene fecha de documento válida' });
  }
  if (!expense.vat_number) {
    errors.push({ field: 'STCD1', message: 'El gasto no tiene NIT del emisor' });
  }
  if (!expense.supplier) {
    errors.push({ field: 'NAME1', message: 'El gasto no tiene nombre del emisor' });
  }
  if (!expense.description) {
    errors.push({ field: 'SGTXT', message: 'El gasto no tiene descripción final' });
  }
  if (!expense.amount || Number(expense.amount) <= 0) {
    errors.push({ field: 'DMBTR', message: 'El gasto no tiene monto válido' });
  }

  if (!expense.supplier || !expense.supplier.trim()) {
    errors.push({ field: 'NAME1', message: 'El gasto no tiene nombre del emisor' });
  }

  if (!expense.vat_number || !expense.vat_number.trim()) {
    errors.push({ field: 'STCD1', message: 'El gasto no tiene NIT del emisor' });
  }

  return errors;
};

const buildPayload = (liquidation, user, expenses) => {
  const reference = buildLiquidationReference(liquidation);
  const firstExpense = expenses[0];
  const totalAmount = Number(liquidation.totalAmount || expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0));

  return {
    header: {
      BLDAT: formatDateForSAP(firstExpense.date),
      BUDAT: formatDateForSAP(new Date().toISOString()),
      BUKRS: normalizeSociedadForSAP(firstExpense.sociedad),
      LIFNR: padLeft(user.lifnr, LIFNR_LENGTH),
      XBLNR: reference,
      ZTERM: FIXED_PAYMENT_TERM,
      BKTXT: reference,
      WAERS: FIXED_CURRENCY,
      DMBTR: formatAmountForSAP(totalAmount),
      DZLSPR: '',
    },
    items: expenses.map((expense) => ({
      HKONT: padLeft(expense.cuenta, HKONT_LENGTH),
      ZMWSKZ: FIXED_TAX_CODE,
      DMBTR: formatAmountForSAP(expense.amount),
      ZUMSK: '',
      KOSTL: padLeft(expense.centro, KOSTL_LENGTH),
      AUFNR: padLeft(expense.ordenco, AUFNR_LENGTH),
      ZSERFAC: asTrimmedString(expense.serie),
      ZNUMFAC: padLeft(expense.noinvoice, ZNUMFAC_LENGTH),
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

  const headerErrors = buildHeaderErrors(liquidation, user, orderedExpenses, missingExpenseIds);
  const itemErrors = orderedExpenses
    .map((expense) => ({
      expenseId: expense.id,
      category: expense.category,
      errors: buildItemErrors(expense),
    }))
    .filter((item) => item.errors.length > 0);

  if (headerErrors.length > 0 || itemErrors.length > 0) {
    return {
      notFound: false,
      isValid: false,
      errors: {
        headerErrors,
        itemErrors,
      },
    };
  }

  return {
    notFound: false,
    isValid: true,
    payload: buildPayload(liquidation, user, orderedExpenses),
  };
};

module.exports = {
  buildLiquidationSAPPayloadPreview: buildPreview,
};
