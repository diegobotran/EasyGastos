const crypto = require('crypto');
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const CatalogService = require('../services/CatalogService');
const SystemParameter = require('../models/SystemParameter');

const router = express.Router();
router.use(authenticateToken);

const sendError = (res, error) => res.status(error.status || 500).json({
  success: false,
  code: error.code || 'INTERNAL_ERROR',
  error: error.status ? error.message : 'Error interno del servidor'
});

const registerReadCatalog = (path, catalog) => {
  router.get(path, async (req, res) => {
    try {
      const query = { ...req.query, active: 'true', limit: req.query.limit || '100' };
      res.json({ success: true, ...(await CatalogService.list(catalog, query)) });
    } catch (error) { sendError(res, error); }
  });
};

registerReadCatalog('/sociedades', 'sociedades');
registerReadCatalog('/centros', 'centros');
registerReadCatalog('/cuentas', 'cuentas');
registerReadCatalog('/ordenes-co', 'ordenesCO');

router.get('/version', async (_req, res) => {
  try {
    const entries = await Promise.all(Object.entries(CatalogService.definitions).map(async ([name, definition]) => {
      const latest = await definition.model.findOne({}).sort({ updatedAt: -1 }).select('updatedAt').lean();
      return [name, await definition.model.countDocuments(), latest?.updatedAt?.toISOString() || null];
    }));
    const parameter = await SystemParameter.findOne({ key: 'INVOICE_VALIDITY_DAYS' }).select('updatedAt').lean();
    const source = JSON.stringify([...entries, ['invoiceValidity', parameter?.updatedAt?.toISOString() || null]]);
    res.json({
      success: true,
      version: crypto.createHash('sha256').update(source).digest('hex'),
      generatedAt: new Date().toISOString()
    });
  } catch (error) { sendError(res, error); }
});

module.exports = router;
