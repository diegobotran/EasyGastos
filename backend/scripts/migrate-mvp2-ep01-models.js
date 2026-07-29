const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { models } = require('../database/init');
const SystemParameter = require('../models/SystemParameter');
const { normalizeLegacyExpense } = require('../migrations/mvp2-ep01-model-migration');

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;
const BATCH_SIZE = 500;

const resolveMongoUri = () => {
  const databaseName = process.env.DATABASE_NAME || 'easygastos';
  const configured = (process.env.MONGODB_URI || 'mongodb://localhost:27017').replace(/\/$/, '');
  return /mongodb(?:\+srv)?:\/\/[^/]+\/.+/.test(configured)
    ? configured
    : `${configured}/${databaseName}`;
};

const comparableFields = [
  'satStatus',
  'satValidationCause',
  'fiscalStatus',
  'satValidatedAt',
  'satValidationSource',
  'satValidationFingerprint',
  'satFacturaId',
  'satInvoiceSnapshot',
  'fiscalValidatedAt',
  'fiscalValidityDaysApplied',
  'imageValidationFingerprint',
  'receiver_vat_number'
];

const changed = (before, after) => comparableFields.some(
  field => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)
);

const run = async () => {
  await mongoose.connect(resolveMongoUri(), { serverSelectionTimeoutMS: 10000 });

  const cursor = models.Expense.find({}).lean().cursor();
  let scanned = 0;
  let affected = 0;
  let operations = [];

  for await (const expense of cursor) {
    scanned += 1;
    const normalized = normalizeLegacyExpense(expense);
    if (!changed(expense, normalized)) continue;

    affected += 1;
    if (!DRY_RUN) {
      operations.push({
        updateOne: {
          filter: { _id: expense._id },
          update: { $set: Object.fromEntries(
            comparableFields.map(field => [field, normalized[field]])
          ) }
        }
      });
    }

    if (operations.length >= BATCH_SIZE) {
      await models.Expense.bulkWrite(operations, { ordered: false });
      operations = [];
    }
  }

  if (operations.length > 0) {
    await models.Expense.bulkWrite(operations, { ordered: false });
  }

  if (!DRY_RUN) {
    await SystemParameter.updateOne(
      { key: 'INVOICE_VALIDITY_DAYS' },
      {
        $setOnInsert: {
          key: 'INVOICE_VALIDITY_DAYS',
          name: 'Número de días de vigencia de factura',
          value: 55,
          active: true,
          updatedBy: 'migration:mvp2-ep01'
        }
      },
      { upsert: true }
    );
  }

  console.log(JSON.stringify({
    mode: DRY_RUN ? 'dry-run' : 'apply',
    scanned,
    affected,
    parameterSeeded: !DRY_RUN
  }, null, 2));
};

run()
  .catch(error => {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
