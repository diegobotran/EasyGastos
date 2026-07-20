const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Sociedad = require('../models/Sociedad');
const Centro = require('../models/Centro');
const Cuenta = require('../models/Cuenta');
const OrdenCO = require('../models/OrdenCO');
const SystemParameter = require('../models/SystemParameter');
const { models } = require('../database/init');
const { buildInitialCatalogs } = require('../data/initial-catalogs');

const APPLY = process.argv.includes('--apply');
const ownerArgument = process.argv.find(argument => argument.startsWith('--center-owner='));
const CENTER_OWNER = ownerArgument
  ? ownerArgument.slice('--center-owner='.length)
  : 'manager@ronesdeguatemala.com';

const resolveMongoUri = () => {
  const databaseName = process.env.DATABASE_NAME || 'easygastos';
  const configured = (process.env.MONGODB_URI || 'mongodb://localhost:27017').replace(/\/$/, '');
  return /mongodb(?:\+srv)?:\/\/[^/]+\/.+/.test(configured)
    ? configured
    : `${configured}/${databaseName}`;
};

const comparable = (value, fields) => Object.fromEntries(fields.map(field => [field, value[field] ?? null]));

const analyzeRecords = ({ catalog, desired, existing, fields, secondaryUniqueField }) => {
  const inserts = [];
  const unchanged = [];
  const conflicts = [];

  for (const record of desired) {
    const byCode = existing.find(item => item.codigo === record.codigo);
    const bySecondary = secondaryUniqueField
      ? existing.find(item => item[secondaryUniqueField] === record[secondaryUniqueField])
      : null;

    if (bySecondary && bySecondary.codigo !== record.codigo) {
      conflicts.push({
        catalog,
        codigo: record.codigo,
        reason: `${secondaryUniqueField} ya está asociado al código ${bySecondary.codigo}.`
      });
      continue;
    }
    if (!byCode) {
      inserts.push(record);
      continue;
    }
    const current = comparable(byCode, fields);
    const target = comparable(record, fields);
    if (JSON.stringify(current) === JSON.stringify(target)) {
      unchanged.push(record.codigo);
    } else {
      conflicts.push({
        catalog,
        codigo: record.codigo,
        reason: 'El registro existente difiere de la fuente inicial.',
        current,
        target
      });
    }
  }
  return { inserts, unchanged, conflicts };
};

const runMigration = async ({ apply = APPLY, centerOwner = CENTER_OWNER } = {}) => {
  await mongoose.connect(resolveMongoUri(), { serverSelectionTimeoutMS: 10000 });
  try {
    const initial = buildInitialCatalogs(centerOwner);
    const owner = await models.User.findOne({ email: centerOwner.toLowerCase(), isActive: true }).select('email').lean();
    const [sociedades, centros, cuentas, ordenesCO, invoiceValidity] = await Promise.all([
      Sociedad.find({}).lean(), Centro.find({}).lean(), Cuenta.find({}).lean(), OrdenCO.find({}).lean(),
      SystemParameter.findOne({ key: 'INVOICE_VALIDITY_DAYS' }).lean()
    ]);

    const analyses = [
      { model: Sociedad, result: analyzeRecords({ catalog: 'sociedades', desired: initial.sociedades, existing: sociedades, fields: ['codigo', 'nit'], secondaryUniqueField: 'nit' }) },
      { model: Centro, result: analyzeRecords({ catalog: 'centros', desired: initial.centros, existing: centros, fields: ['codigo', 'ownerEmail'] }) },
      { model: Cuenta, result: analyzeRecords({ catalog: 'cuentas', desired: initial.cuentas, existing: cuentas, fields: ['codigo'] }) },
      { model: OrdenCO, result: analyzeRecords({ catalog: 'ordenesCO', desired: initial.ordenesCO, existing: ordenesCO, fields: ['codigo'] }) }
    ];

    if (!owner) {
      analyses[1].result.conflicts.push({
        catalog: 'centros',
        codigo: '50004',
        reason: `El propietario ${centerOwner} no existe o no está activo.`
      });
      analyses[1].result.inserts = [];
    }

    if (apply) {
      for (const { model, result } of analyses) {
        if (result.inserts.length) {
          await model.insertMany(result.inserts.map(item => ({
            ...item,
            updatedBy: 'migration:initial-catalogs'
          })), { ordered: true });
        }
      }
      if (!invoiceValidity) {
        await SystemParameter.create({
          key: 'INVOICE_VALIDITY_DAYS',
          name: 'Número de días de vigencia de factura',
          value: 55,
          active: true,
          updatedBy: 'migration:initial-catalogs'
        });
      }
    }

    const report = {
      mode: apply ? 'apply' : 'dry-run',
      centerOwner: centerOwner.toLowerCase(),
      catalogs: {}
    };

    // Construir el resumen con claves estables aunque no haya inserciones.
    report.catalogs = {
      sociedades: analyses[0].result,
      centros: analyses[1].result,
      cuentas: analyses[2].result,
      ordenesCO: analyses[3].result
    };
    report.acceptedSourceConflicts = initial.sourceConflicts;
    report.summary = Object.fromEntries(Object.entries(report.catalogs).map(([name, result]) => [name, {
      inserted: apply ? result.inserts.length : 0,
      wouldInsert: result.inserts.length,
      unchanged: result.unchanged.length,
      conflicts: result.conflicts.length
    }]));
    report.summary.invoiceValidity = {
      inserted: apply && !invoiceValidity ? 1 : 0,
      wouldInsert: invoiceValidity ? 0 : 1,
      unchanged: invoiceValidity ? 1 : 0,
      conflicts: 0
    };

    return report;
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  runMigration()
    .then(report => console.log(JSON.stringify(report, null, 2)))
    .catch(error => {
      console.error(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', error: error.message }, null, 2));
      process.exitCode = 1;
    });
}

module.exports = { analyzeRecords, runMigration };
