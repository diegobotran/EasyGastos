const express = require('express');
const { body, validationResult } = require('express-validator');
const { models } = require('../database/init');
const { authenticateToken, canAccessUserData } = require('../middleware/auth');
const CatalogService = require('../services/CatalogService');
const router = express.Router();

const { Category, Expense, SyncLog } = models;

// Middleware para validar datos de categoría
const validateCategory = [
  body('id').isUUID(),
  body('userEmail').isEmail().normalizeEmail(),
  body('name').trim().isLength({ min: 1 }).escape(),
  body('icon').optional().trim(),
  body('sociedad').trim().isLength({ min: 1 }),
  body('centro').trim().isLength({ min: 1 }),
  body('cuenta').trim().isLength({ min: 1 }),
  body('ordenco').trim().isLength({ min: 1 })
];

// Crear nueva categoría (requiere autenticación)
router.post('/', authenticateToken, validateCategory, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id, userEmail, name, icon, sociedad, centro, cuenta, ordenco } = req.body;

    await CatalogService.assertActiveReferences({ sociedad, centro, cuenta, ordenco });

    // Verificar si ya existe una categoría con ese ID
    const existingCategory = await Category.findOne({ id });
    if (existingCategory) {
      return res.status(409).json({ error: 'Ya existe una categoría con ese ID' });
    }

    // Crear nueva categoría
    const newCategory = new Category({
      id,
      userEmail,
      name,
      icon,
      sociedad,
      centro,
      cuenta,
      ordenco
    });

    await newCategory.save();

    // Log de sincronización
    const syncLog = new SyncLog({
      userEmail,
      entityType: 'CATEGORY',
      entityId: id,
      action: 'CREATE',
      success: true
    });
    await syncLog.save();

    res.status(201).json({
      message: 'Categoría creada exitosamente',
      category: {
        id: newCategory.id,
        userEmail: newCategory.userEmail,
        name: newCategory.name,
        icon: newCategory.icon,
        sociedad: newCategory.sociedad,
        centro: newCategory.centro,
        cuenta: newCategory.cuenta,
        ordenco: newCategory.ordenco,
        createdAt: newCategory.createdAt,
        updatedAt: newCategory.updatedAt
      }
    });
  } catch (error) {
    console.error('Error creando categoría:', error);
    
    // Log de error
    if (req.body.userEmail && req.body.id) {
      const errorLog = new SyncLog({
        userEmail: req.body.userEmail,
        entityType: 'CATEGORY',
        entityId: req.body.id,
        action: 'CREATE',
        success: false,
        errorMessage: error.message
      });
      await errorLog.save().catch(() => {});
    }
    
    if (error instanceof CatalogService.CatalogError) {
      return res.status(error.status).json({ code: error.code, error: error.message, details: error.details });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener categorías de un usuario (requiere autenticación)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { userEmail } = req.query;

    if (!userEmail) {
      return res.status(400).json({ error: 'El parámetro userEmail es requerido' });
    }

    const categories = await Category.find({ 
      userEmail, 
      isActive: true 
    }).sort({ name: 1 });

    const categoryList = categories.map(category => ({
      id: category.id,
      userEmail: category.userEmail,
      name: category.name,
      icon: category.icon,
      sociedad: category.sociedad,
      centro: category.centro,
      cuenta: category.cuenta,
      ordenco: category.ordenco,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt
    }));

    res.json(categoryList);
  } catch (error) {
    console.error('Error obteniendo categorías:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualizar categoría (requiere autenticación)
router.put('/:id', authenticateToken, validateCategory, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { userEmail, name, icon, sociedad, centro, cuenta, ordenco } = req.body;

    await CatalogService.assertActiveReferences({ sociedad, centro, cuenta, ordenco });

    // Buscar categoría
    const category = await Category.findOne({ id, userEmail, isActive: true });
    if (!category) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    // Actualizar campos
    category.name = name;
    category.icon = icon;
    category.sociedad = sociedad;
    category.centro = centro;
    category.cuenta = cuenta;
    category.ordenco = ordenco;

    await category.save();

    // Log de sincronización
    const syncLog = new SyncLog({
      userEmail,
      entityType: 'CATEGORY',
      entityId: id,
      action: 'UPDATE',
      success: true
    });
    await syncLog.save();

    res.json({
      message: 'Categoría actualizada exitosamente',
      category: {
        id: category.id,
        userEmail: category.userEmail,
        name: category.name,
        icon: category.icon,
        sociedad: category.sociedad,
        centro: category.centro,
        cuenta: category.cuenta,
        ordenco: category.ordenco,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt
      }
    });
  } catch (error) {
    console.error('Error actualizando categoría:', error);
    
    // Log de error
    const errorLog = new SyncLog({
      userEmail: req.body.userEmail,
      entityType: 'CATEGORY',
      entityId: req.params.id,
      action: 'UPDATE',
      success: false,
      errorMessage: error.message
    });
    await errorLog.save().catch(() => {});
    
    if (error instanceof CatalogService.CatalogError) {
      return res.status(error.status).json({ code: error.code, error: error.message, details: error.details });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Eliminar categoría (soft delete) (requiere autenticación)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.query;

    if (!userEmail) {
      return res.status(400).json({ error: 'El parámetro userEmail es requerido' });
    }

    // Buscar categoría
    const category = await Category.findOne({ id, userEmail, isActive: true });
    if (!category) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    const linkedDraftExpenses = await Expense.find({
      userEmail,
      category: category.name,
      expenseStatus: 'draft',
      $or: [
        { liquidationId: null },
        { liquidationId: '' },
        { liquidationId: { $exists: false } }
      ]
    }).select('id description amount');

    if (linkedDraftExpenses.length > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar la categoría porque tiene gastos en borrador ligados.',
        linkedDraftExpenses: linkedDraftExpenses.map(expense => ({
          id: expense.id,
          description: expense.description,
          amount: expense.amount
        }))
      });
    }

    // Soft delete
    category.isActive = false;
    await category.save();

    // Log de sincronización
    const syncLog = new SyncLog({
      userEmail,
      entityType: 'CATEGORY',
      entityId: id,
      action: 'DELETE',
      success: true
    });
    await syncLog.save();

    res.json({ message: 'Categoría eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando categoría:', error);
    
    // Log de error
    const errorLog = new SyncLog({
      userEmail: req.query.userEmail,
      entityType: 'CATEGORY',
      entityId: req.params.id,
      action: 'DELETE',
      success: false,
      errorMessage: error.message
    });
    await errorLog.save().catch(() => {});
    
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener estadísticas de categorías por usuario (requiere autenticación y autorización)
router.get('/stats/:userEmail', authenticateToken, canAccessUserData, async (req, res) => {
  try {
    const { userEmail } = req.params;

    const stats = {
      total: await Category.countDocuments({ userEmail, isActive: true }),
      withCentro: await Category.countDocuments({ userEmail, isActive: true, centro: { $nin: [null, ''] } }),
      withCuenta: await Category.countDocuments({ userEmail, isActive: true, cuenta: { $nin: [null, ''] } }),
      withOrdenco: await Category.countDocuments({ userEmail, isActive: true, ordenco: { $nin: [null, ''] } })
    };

    res.json({ stats });
  } catch (error) {
    console.error('Error obteniendo estadísticas de categorías:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
