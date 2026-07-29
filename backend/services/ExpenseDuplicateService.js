const { models } = require('../database/init');

const { Expense } = models;

const normalizeInvoiceKey = value => String(value || '').trim().toUpperCase();

const buildActiveDuplicateFilter = ({ serie, noinvoice, excludeId }) => {
  const filters = [
    { expenseStatus: { $ne: 'voided' } },
    {
      $expr: {
        $and: [
          {
            $eq: [
              { $toUpper: { $trim: { input: { $ifNull: ['$serie', ''] } } } },
              normalizeInvoiceKey(serie)
            ]
          },
          {
            $eq: [
              { $toUpper: { $trim: { input: { $ifNull: ['$noinvoice', ''] } } } },
              normalizeInvoiceKey(noinvoice)
            ]
          }
        ]
      }
    }
  ];
  if (excludeId) filters.push({ id: { $ne: String(excludeId) } });
  return { $and: filters };
};

const findActiveDuplicate = ({ serie, noinvoice, excludeId }) => {
  if (!normalizeInvoiceKey(serie) || !normalizeInvoiceKey(noinvoice)) return null;
  return Expense.findOne(buildActiveDuplicateFilter({ serie, noinvoice, excludeId }));
};

module.exports = {
  buildActiveDuplicateFilter,
  findActiveDuplicate,
  normalizeInvoiceKey
};
