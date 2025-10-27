const express = require('express');
const { body, validationResult } = require('express-validator');
const { models } = require('../database/init');
const ManagerEmployeeLink = require('../models/ManagerEmployeeLink');
const { authenticateToken, canAccessUserData, requireManager } = require('../middleware/auth');
const router = express.Router();

const { Expense, User, SyncLog } = models;

// Middleware para validar datos de gasto
const validateExpense = [
  body('id').isUUID(),
  body('userEmail').isEmail().normalizeEmail(),
  body('description').trim().isLength({ min: 1 }).escape(),
  body('amount').isNumeric().custom(value => {
    if (value <= 0) throw new Error('El monto debe ser mayor a 0');
    if (value > 10000) throw new Error('El monto no puede exceder 10,000');
    return true;
  }),
  body('date').isISO8601().toDate(),
  body('category').trim().isLength({ min: 1 }).escape(),
  body('status').isIn(['BORRADOR', 'ENVIADO_JEFE', 'APROBADO_JEFE', 'RECHAZADO_JEFE', 'APROBADO_FINANZAS', 'RECHAZADO_FINANZAS', 'CONTABILIZADO', 'ERROR_SAP']),
  body('supplier').optional().trim().escape(),
  body('vat_number').optional().trim(),
  body('department').optional().trim().escape(),
  body('notes').optional().trim(),
  body('noinvoice').optional().trim(),
  body('serie').optional().trim(),
  body('centro').optional().trim(),
  body('cuenta').optional().trim(),
  body('ordenco').optional().trim(),
  body('currency').optional().isIn(['EUR', 'USD', 'GBP']),
  body('totiva').optional().isNumeric()
];

// Crear nuevo gasto (requiere autenticación)
router.post('/', authenticateToken, validateExpense, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const expenseData = req.body;

    // Verificar si ya existe un gasto con ese ID
    const existingExpense = await Expense.findOne({ id: expenseData.id });
    if (existingExpense) {
      return res.status(409).json({ error: 'Ya existe un gasto con ese ID' });
    }

    // Obtener el manager directo del empleado
    const managerLink = await ManagerEmployeeLink.getDirectManager(expenseData.userEmail);
    if (managerLink) {
      expenseData.managerEmail = managerLink.managerEmail;
    } else {
      // Fallback: intentar obtener del usuario si no hay relación definida
      const user = await User.findOne({ email: expenseData.userEmail });
      if (user && user.managerEmail) {
        expenseData.managerEmail = user.managerEmail;
      }
    }

    // Crear nuevo gasto
    const newExpense = new Expense(expenseData);
    await newExpense.save();

    // Log de sincronización
    const syncLog = new SyncLog({
      userEmail: expenseData.userEmail,
      entityType: 'EXPENSE',
      entityId: expenseData.id,
      action: 'CREATE',
      success: true
    });
    await syncLog.save();

    res.status(201).json({
      message: 'Gasto creado exitosamente',
      expense: {
        id: newExpense.id,
        userEmail: newExpense.userEmail,
        description: newExpense.description,
        amount: newExpense.amount,
        date: newExpense.date,
        category: newExpense.category,
        status: newExpense.status,
        managerEmail: newExpense.managerEmail,
        createdAt: newExpense.createdAt,
        updatedAt: newExpense.updatedAt
      }
    });
  } catch (error) {
    console.error('Error creando gasto:', error);
    
    // Log de error
    if (req.body.userEmail && req.body.id) {
      const errorLog = new SyncLog({
        userEmail: req.body.userEmail,
        entityType: 'EXPENSE',
        entityId: req.body.id,
        action: 'CREATE',
        success: false,
        errorMessage: error.message
      });
      await errorLog.save().catch(() => {});
    }
    
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener gastos de un usuario (requiere autenticación)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { userEmail, status, startDate, endDate, limit = 50, offset = 0 } = req.query;

    if (!userEmail) {
      return res.status(400).json({ error: 'El parámetro userEmail es requerido' });
    }

    // Construir filtros
    let filter = { userEmail };
    
    if (status) {
      filter.status = status;
    }
    
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    const expenses = await Expense.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await Expense.countDocuments(filter);

    const expenseList = expenses.map(expense => ({
      id: expense.id,
      userEmail: expense.userEmail,
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      category: expense.category,
      status: expense.status,
      supplier: expense.supplier,
      vat_number: expense.vat_number,
      department: expense.department,
      notes: expense.notes,
      noinvoice: expense.noinvoice,
      serie: expense.serie,
      centro: expense.centro,
      cuenta: expense.cuenta,
      ordenco: expense.ordenco,
      managerEmail: expense.managerEmail,
      imageuri: expense.imageuri,
      totiva: expense.totiva,
      currency: expense.currency,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt
    }));

    res.json({
      expenses: expenseList,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < total
      }
    });
  } catch (error) {
    console.error('Error obteniendo gastos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener gastos pendientes de aprobación para un manager (requiere ser manager)
router.get('/pending-approval', authenticateToken, requireManager, async (req, res) => {
  try {
    const { managerEmail } = req.query;

    if (!managerEmail) {
      return res.status(400).json({ error: 'El parámetro managerEmail es requerido' });
    }

    // Obtener todos los empleados que reportan a este manager
    const employeeLinks = await ManagerEmployeeLink.getEmployeesOfManager(managerEmail);
    const employeeEmails = employeeLinks.map(link => link.employeeEmail);

    // Si no tiene empleados, devolver array vacío
    if (employeeEmails.length === 0) {
      return res.json([]);
    }

    // Buscar gastos pendientes de estos empleados
    const expenses = await Expense.find({
      userEmail: { $in: employeeEmails },
      status: 'ENVIADO_JEFE'
    }).sort({ createdAt: 1 }); // Más antiguos primero

    const expenseList = expenses.map(expense => ({
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

    res.json(expenseList);
  } catch (error) {
    console.error('Error obteniendo gastos pendientes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualizar estado de gasto (requiere autenticación)
router.put('/:id/status', authenticateToken, [
  body('status').isIn(['BORRADOR', 'ENVIADO_JEFE', 'APROBADO_JEFE', 'RECHAZADO_JEFE', 'APROBADO_FINANZAS', 'RECHAZADO_FINANZAS', 'CONTABILIZADO', 'ERROR_SAP']),
  body('comments').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status, comments, managerEmail } = req.body;

    // Buscar gasto
    const expense = await Expense.findOne({ id });
    if (!expense) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    // Validar transiciones de estado
    const validTransitions = {
      'BORRADOR': ['ENVIADO_JEFE'],
      'ENVIADO_JEFE': ['APROBADO_JEFE', 'RECHAZADO_JEFE'],
      'APROBADO_JEFE': ['APROBADO_FINANZAS', 'RECHAZADO_FINANZAS'],
      'RECHAZADO_JEFE': ['BORRADOR'],
      'APROBADO_FINANZAS': ['CONTABILIZADO'],
      'RECHAZADO_FINANZAS': ['BORRADOR'],
      'CONTABILIZADO': [],
      'ERROR_SAP': ['APROBADO_FINANZAS']
    };

    if (!validTransitions[expense.status].includes(status)) {
      return res.status(400).json({ 
        error: `No se puede cambiar de ${expense.status} a ${status}` 
      });
    }

    // Actualizar gasto
    expense.status = status;
    
    if (comments) {
      expense.approvalComments = comments;
    }

    if (status === 'APROBADO_JEFE' || status === 'RECHAZADO_JEFE') {
      if (status === 'APROBADO_JEFE') {
        expense.approvedAt = new Date();
        expense.approvedBy = managerEmail;
      } else {
        expense.rejectedAt = new Date();
        expense.rejectedBy = managerEmail;
      }
    }

    await expense.save();

    // Log de sincronización
    const syncLog = new SyncLog({
      userEmail: expense.userEmail,
      entityType: 'EXPENSE',
      entityId: id,
      action: 'UPDATE_STATUS',
      success: true
    });
    await syncLog.save();

    res.json({
      message: 'Estado del gasto actualizado exitosamente',
      expense: {
        id: expense.id,
        status: expense.status,
        approvalComments: expense.approvalComments,
        approvedAt: expense.approvedAt,
        approvedBy: expense.approvedBy,
        rejectedAt: expense.rejectedAt,
        rejectedBy: expense.rejectedBy,
        updatedAt: expense.updatedAt
      }
    });
  } catch (error) {
    console.error('Error actualizando estado del gasto:', error);
    
    // Log de error
    const errorLog = new SyncLog({
      userEmail: 'unknown',
      entityType: 'EXPENSE',
      entityId: req.params.id,
      action: 'UPDATE_STATUS',
      success: false,
      errorMessage: error.message
    });
    await errorLog.save().catch(() => {});
    
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Aprobar o rechazar gasto (endpoint específico para managers autenticados)
router.put('/:id/approve', authenticateToken, requireManager, [
  body('approve').isBoolean(),
  body('managerEmail').isEmail().normalizeEmail(),
  body('comments').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { approve, managerEmail, comments } = req.body;

    // Buscar gasto
    const expense = await Expense.findOne({ id, managerEmail, status: 'ENVIADO_JEFE' });
    if (!expense) {
      return res.status(404).json({ error: 'Gasto no encontrado o no está pendiente de aprobación' });
    }

    // Actualizar estado
    expense.status = approve ? 'APROBADO_JEFE' : 'RECHAZADO_JEFE';
    
    if (comments) {
      expense.approvalComments = comments;
    }

    if (approve) {
      expense.approvedAt = new Date();
      expense.approvedBy = managerEmail;
    } else {
      expense.rejectedAt = new Date();
      expense.rejectedBy = managerEmail;
    }

    await expense.save();

    // Log de sincronización
    const syncLog = new SyncLog({
      userEmail: expense.userEmail,
      entityType: 'EXPENSE',
      entityId: id,
      action: approve ? 'APPROVE' : 'REJECT',
      success: true
    });
    await syncLog.save();

    res.json({
      message: `Gasto ${approve ? 'aprobado' : 'rechazado'} exitosamente`,
      expense: {
        id: expense.id,
        status: expense.status,
        approvalComments: expense.approvalComments,
        approvedAt: expense.approvedAt,
        approvedBy: expense.approvedBy,
        rejectedAt: expense.rejectedAt,
        rejectedBy: expense.rejectedBy,
        updatedAt: expense.updatedAt
      }
    });
  } catch (error) {
    console.error('Error aprobando/rechazando gasto:', error);
    
    // Log de error
    const errorLog = new SyncLog({
      userEmail: 'unknown',
      entityType: 'EXPENSE',
      entityId: req.params.id,
      action: 'APPROVE_REJECT',
      success: false,
      errorMessage: error.message
    });
    await errorLog.save().catch(() => {});
    
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener estadísticas de gastos (requiere autenticación y autorización)
router.get('/stats/:userEmail', authenticateToken, canAccessUserData, async (req, res) => {
  try {
    const { userEmail } = req.params;
    const { startDate, endDate } = req.query;

    let dateFilter = {};
    if (startDate || endDate) {
      if (startDate) dateFilter.$gte = startDate;
      if (endDate) dateFilter.$lte = endDate;
    }

    const baseFilter = { userEmail };
    if (Object.keys(dateFilter).length > 0) {
      baseFilter.date = dateFilter;
    }

    const stats = {
      total: await Expense.countDocuments(baseFilter),
      byStatus: {},
      totalAmount: 0,
      averageAmount: 0
    };

    // Contar por estado
    const statusCounts = await Expense.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } }
    ]);

    statusCounts.forEach(item => {
      stats.byStatus[item._id] = {
        count: item.count,
        totalAmount: item.totalAmount
      };
      stats.totalAmount += item.totalAmount;
    });

    if (stats.total > 0) {
      stats.averageAmount = stats.totalAmount / stats.total;
    }

    res.json({ stats });
  } catch (error) {
    console.error('Error obteniendo estadísticas de gastos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;