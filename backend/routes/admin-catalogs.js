const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const CatalogService = require('../services/CatalogService');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

const sendError = (res, error) => {
  const status = error.status || 500;
  if (status === 500) console.error('Admin catalog error:', error);
  return res.status(status).json({
    success: false,
    code: error.code || 'INTERNAL_ERROR',
    error: status === 500 ? 'Error interno del servidor' : error.message,
    ...(error.details ? { details: error.details } : {})
  });
};

const registerCatalog = (path, catalog) => {
  router.get(path, async (req, res) => {
    try {
      res.json({ success: true, ...(await CatalogService.list(catalog, req.query, { allowInactive: true })) });
    } catch (error) { sendError(res, error); }
  });

  router.get(`${path}/:id`, async (req, res) => {
    try {
      res.json({ success: true, data: await CatalogService.getById(catalog, req.params.id) });
    } catch (error) { sendError(res, error); }
  });

  router.post(path, async (req, res) => {
    try {
      const data = await CatalogService.create(catalog, req.body, req.user.email);
      res.status(201).json({ success: true, data });
    } catch (error) { sendError(res, error); }
  });

  router.put(`${path}/:id`, async (req, res) => {
    try {
      const data = await CatalogService.update(catalog, req.params.id, req.body, req.user.email);
      res.json({ success: true, data });
    } catch (error) { sendError(res, error); }
  });

  router.patch(`${path}/:id/status`, async (req, res) => {
    try {
      if (typeof req.body.active !== 'boolean') {
        throw new CatalogService.CatalogError(422, 'ACTIVE_REQUIRED', 'active debe ser booleano.');
      }
      const data = await CatalogService.setActive(
        catalog,
        req.params.id,
        req.body.active,
        req.body.updatedAt,
        req.user.email
      );
      res.json({ success: true, data });
    } catch (error) { sendError(res, error); }
  });
};

registerCatalog('/sociedades', 'sociedades');
registerCatalog('/centros', 'centros');
registerCatalog('/cuentas', 'cuentas');
registerCatalog('/ordenes-co', 'ordenesCO');

router.get('/parameters/invoice-validity', async (_req, res) => {
  try {
    res.json({ success: true, data: await CatalogService.getInvoiceValidity() });
  } catch (error) { sendError(res, error); }
});

router.put('/parameters/invoice-validity', async (req, res) => {
  try {
    const data = await CatalogService.updateInvoiceValidity(req.body, req.user.email);
    res.json({ success: true, data });
  } catch (error) { sendError(res, error); }
});

module.exports = router;
