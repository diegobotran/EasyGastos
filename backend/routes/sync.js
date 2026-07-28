const express = require('express');
const { body, validationResult } = require('express-validator');
const { models } = require('../database/init');
const { authenticateToken, canAccessUserData } = require('../middleware/auth');
const ManagerEmployeeLink = require('../models/ManagerEmployeeLink');
const CatalogService = require('../services/CatalogService');
const ExpenseFiscalValidationService = require('../services/ExpenseFiscalValidationService');
const router = express.Router();

const { User, Category, Expense, SyncLog } = models;

const hasAccountingSnapshot = (expenseData = {}) => {
  return Boolean(
    String(expenseData.category || '').trim() &&
    String(expenseData.sociedad || '').trim() &&
    String(expenseData.centro || '').trim() &&
    String(expenseData.cuenta || '').trim() &&
    String(expenseData.ordenco || '').trim()
  );
};
const isDraft = expenseData => expenseData.status === 'BORRADOR';
const hasAttachment = expenseData => Boolean(String(expenseData.imageuri || '').trim());

const normalizeSatValidationState = ExpenseFiscalValidationService.validateAndNormalize;

// Endpoint para sincronización completa de un usuario (requiere autenticación)
router.post('/full-sync', authenticateToken, [
  body('userEmail').isEmail().normalizeEmail(),
  body('lastSyncTimestamp').optional().isISO8601().toDate()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userEmail, lastSyncTimestamp } = req.body;

    // Verificar que el usuario existe
    const user = await User.findOne({ email: userEmail, isActive: true });
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const syncResult = {
      user: null,
      categories: [],
      expenses: [],
      syncTimestamp: new Date()
    };

    // 1. Sincronizar datos del usuario
    syncResult.user = {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      lifnr: user.lifnr,
      sociedad: user.sociedad,
      nitEmpresa: user.nitEmpresa,
      department: user.department,
      managerEmail: user.managerEmail,
      isManager: user.isManager,
      isAdmin: Boolean(user.isAdmin),
      updatedAt: user.updatedAt
    };

    // 2. Obtener categorías actualizadas desde la última sincronización
    let categoryFilter = { userEmail, isActive: true };
    if (lastSyncTimestamp) {
      categoryFilter.updatedAt = { $gte: lastSyncTimestamp };
    }

    const categories = await Category.find(categoryFilter).sort({ name: 1 });
    syncResult.categories = categories.map(category => ({
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

    // 3. Obtener gastos actualizados desde la última sincronización
    let expenseFilter = { userEmail };
    if (lastSyncTimestamp) {
      expenseFilter.updatedAt = { $gte: lastSyncTimestamp };
    }

    const expenses = await Expense.find(expenseFilter).sort({ date: -1 });
    syncResult.expenses = expenses.map(expense => ({
      id: expense.id,
      userEmail: expense.userEmail,
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      category: expense.category,
      sociedad: expense.sociedad,
      status: expense.status,
      expenseStatus: expense.expenseStatus || 'draft',
      satStatus: expense.satStatus || 'PENDIENTE_VALIDACION_SAT',
      satValidatedAt: expense.satValidatedAt || null,
      satValidationSource: expense.satValidationSource || null,
      satValidationFingerprint: expense.satValidationFingerprint || null,
      satValidationCause: expense.satValidationCause || 'NINGUNA',
      fiscalStatus: expense.fiscalStatus || 'PENDIENTE',
      satFacturaId: expense.satFacturaId || null,
      satInvoiceSnapshot: expense.satInvoiceSnapshot || null,
      fiscalValidatedAt: expense.fiscalValidatedAt || null,
      fiscalValidityDaysApplied: expense.fiscalValidityDaysApplied || null,
      imageValidationFingerprint: expense.imageValidationFingerprint || null,
      liquidationId: expense.liquidationId || '',
      supplier: expense.supplier,
      vat_number: expense.vat_number,
      department: expense.department,
      notes: expense.notes,
      noinvoice: expense.noinvoice,
      serie: expense.serie,
      uuid: expense.uuid,
      centro: expense.centro,
      cuenta: expense.cuenta,
      ordenco: expense.ordenco,
      managerEmail: expense.managerEmail,
      imageuri: expense.imageuri,
      totiva: expense.totiva,
      currency: expense.currency,
      approvalComments: expense.approvalComments,
      approvedAt: expense.approvedAt,
      approvedBy: expense.approvedBy,
      rejectedAt: expense.rejectedAt,
      rejectedBy: expense.rejectedBy,
      voidedAt: expense.voidedAt,
      voidedReason: expense.voidedReason,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt
    }));

    // 4. Si el usuario es manager, obtener gastos pendientes de aprobación
    if (user.isManager) {
      const pendingExpenses = await Expense.find({
        managerEmail: userEmail,
        status: 'ENVIADO_JEFE'
      }).sort({ createdAt: 1 });

      syncResult.pendingApprovals = pendingExpenses.map(expense => ({
        id: expense.id,
        userEmail: expense.userEmail,
        description: expense.description,
        amount: expense.amount,
        date: expense.date,
        category: expense.category,
        status: expense.status,
        supplier: expense.supplier,
        department: expense.department,
        notes: expense.notes,
        currency: expense.currency,
        createdAt: expense.createdAt
      }));
    }

    // Log de sincronización exitosa
    const syncLog = new SyncLog({
      userEmail,
      entityType: 'FULL_SYNC',
      entityId: userEmail,
      action: 'SYNC',
      success: true
    });
    await syncLog.save();

    res.json({
      message: 'Sincronización completa exitosa',
      data: syncResult
    });
  } catch (error) {
    console.error('Error en sincronización completa:', error);
    
    // Log de error
    if (req.body.userEmail) {
      const errorLog = new SyncLog({
        userEmail: req.body.userEmail,
        entityType: 'FULL_SYNC',
        entityId: req.body.userEmail,
        action: 'SYNC',
        success: false,
        errorMessage: error.message
      });
      await errorLog.save().catch(() => {});
    }
    
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para subir datos desde la app (batch sync) (requiere autenticación)
router.post('/upload', authenticateToken, [
  body('userEmail').isEmail().normalizeEmail(),
  body('categories').optional().isArray(),
  body('expenses').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userEmail, categories = [], expenses = [] } = req.body;

    // Verificar que el usuario existe
    const user = await User.findOne({ email: userEmail, isActive: true });
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const uploadResult = {
      categoriesProcessed: 0,
      expensesProcessed: 0,
      errors: []
    };

    // Procesar categorías
    for (const categoryData of categories) {
      try {
        await CatalogService.assertActiveReferences(categoryData);
        await Category.findOneAndUpdate(
          { id: categoryData.id },
          {
            ...categoryData,
            userEmail,
            isActive: true
          },
          { upsert: true, new: true }
        );
        uploadResult.categoriesProcessed++;

        // Log individual
        const syncLog = new SyncLog({
          userEmail,
          entityType: 'CATEGORY',
          entityId: categoryData.id,
          action: 'UPLOAD',
          success: true
        });
        await syncLog.save();
      } catch (error) {
        uploadResult.errors.push({
          type: 'category',
          id: categoryData.id,
          error: error.message
        });

        // Log de error individual
        const errorLog = new SyncLog({
          userEmail,
          entityType: 'CATEGORY',
          entityId: categoryData.id,
          action: 'UPLOAD',
          success: false,
          errorMessage: error.message
        });
        await errorLog.save().catch(() => {});
      }
    }

    // Procesar gastos
    for (const expenseData of expenses) {
      try {
        if (!hasAttachment(expenseData)) {
          throw new Error('El borrador debe incluir un documento o imagen adjunta.');
        }
        if (!isDraft(expenseData) && !hasAccountingSnapshot(expenseData)) {
          throw new Error('El gasto no incluye snapshot contable completo (categoría, sociedad, centro, cuenta y orden CO).');
        }

        // Si no tiene managerEmail, buscarlo en ManagerEmployeeLink o en el usuario
        if (!expenseData.managerEmail) {
          const managerLink = await ManagerEmployeeLink.getDirectManager(userEmail);
          if (managerLink) {
            expenseData.managerEmail = managerLink.managerEmail;
          } else if (user.managerEmail) {
            // Fallback: usar el managerEmail del usuario si no hay relación definida
            expenseData.managerEmail = user.managerEmail;
          }
        }

        const normalizedExpenseData = await normalizeSatValidationState(expenseData);

        await Expense.findOneAndUpdate(
          { id: expenseData.id },
          {
            ...normalizedExpenseData,
            userEmail
          },
          { upsert: true, new: true }
        );
        uploadResult.expensesProcessed++;

        // Log individual
        const syncLog = new SyncLog({
          userEmail,
          entityType: 'EXPENSE',
          entityId: expenseData.id,
          action: 'UPLOAD',
          success: true
        });
        await syncLog.save();
      } catch (error) {
        uploadResult.errors.push({
          type: 'expense',
          id: expenseData.id,
          error: error.message
        });

        // Log de error individual
        const errorLog = new SyncLog({
          userEmail,
          entityType: 'EXPENSE',
          entityId: expenseData.id,
          action: 'UPLOAD',
          success: false,
          errorMessage: error.message
        });
        await errorLog.save().catch(() => {});
      }
    }

    // Log de upload completo
    const syncLog = new SyncLog({
      userEmail,
      entityType: 'BATCH_UPLOAD',
      entityId: userEmail,
      action: 'UPLOAD',
      success: uploadResult.errors.length === 0
    });
    await syncLog.save();

    res.json({
      message: 'Carga de datos completada',
      result: uploadResult
    });
  } catch (error) {
    console.error('Error en carga de datos:', error);
    
    // Log de error general
    if (req.body.userEmail) {
      const errorLog = new SyncLog({
        userEmail: req.body.userEmail,
        entityType: 'BATCH_UPLOAD',
        entityId: req.body.userEmail,
        action: 'UPLOAD',
        success: false,
        errorMessage: error.message
      });
      await errorLog.save().catch(() => {});
    }
    
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener logs de sincronización de un usuario
router.get('/logs/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    const { limit = 50, offset = 0, entityType } = req.query;

    let filter = { userEmail };
    if (entityType) {
      filter.entityType = entityType;
    }

    const logs = await SyncLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await SyncLog.countDocuments(filter);

    const logList = logs.map(log => ({
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      success: log.success,
      errorMessage: log.errorMessage,
      createdAt: log.createdAt
    }));

    res.json({
      logs: logList,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < total
      }
    });
  } catch (error) {
    console.error('Error obteniendo logs de sincronización:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para verificar estado de sincronización
router.get('/status/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;

    // Verificar que el usuario existe
    const user = await User.findOne({ email: userEmail, isActive: true });
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Obtener estadísticas de sincronización
    const lastSync = await SyncLog.findOne({ userEmail })
      .sort({ createdAt: -1 });

    const recentErrors = await SyncLog.find({
      userEmail,
      success: false,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Últimas 24 horas
    }).countDocuments();

    const pendingItems = {
      categories: await Category.countDocuments({ userEmail, isActive: true }),
      expenses: await Expense.countDocuments({ userEmail })
    };

    res.json({
      userEmail,
      lastSyncAt: lastSync ? lastSync.createdAt : null,
      recentErrors,
      pendingItems,
      isOnline: true,
      serverTime: new Date()
    });
  } catch (error) {
    console.error('Error obteniendo estado de sincronización:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
