const express = require('express');
const router = express.Router();
const { models } = require('../database/init');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireManager, canAccessUserData } = require('../middleware/auth');
const ManagerEmployeeLink = require('../models/ManagerEmployeeLink');

const { Liquidation, Expense } = models;

/**
 * @route   POST /api/liquidations
 * @desc    Crear una nueva liquidación
 * @access  Private (autenticado)
 */
router.post('/', 
  authenticateToken,
  [
    body('id').notEmpty().withMessage('ID es requerido'),
    body('userId').isEmail().withMessage('userId debe ser un email válido'),
    body('employeeName').notEmpty().withMessage('employeeName es requerido'),
    body('expenseIds').isArray({ min: 1 }).withMessage('Debe incluir al menos un gasto'),
    body('totalAmount').isNumeric().withMessage('totalAmount debe ser numérico')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id, userId, employeeName, createdDate, expenseIds, totalAmount, status } = req.body;

      // Verificar que la liquidación no exista
      const existing = await Liquidation.findOne({ id });
      if (existing) {
        return res.status(400).json({ error: 'Liquidación ya existe' });
      }

      // Obtener el jefe directo del empleado
      const manager = await ManagerEmployeeLink.getDirectManager(userId);
      const managerEmail = manager ? manager.managerEmail : null;

      // Crear la liquidación
      const newLiquidation = new Liquidation({
        id,
        userId,
        employeeName,
        createdDate: createdDate || new Date().toISOString().split('T')[0],
        expenseIds,
        totalAmount,
        status: status || 'draft',
        managerEmail
      });

      await newLiquidation.save();

      // Actualizar los gastos para asignarles la liquidationId y expenseStatus
      await Expense.updateMany(
        { id: { $in: expenseIds } },
        { 
          $set: { 
            liquidationId: id,
            expenseStatus: 'in_liquidation'
          } 
        }
      );

      console.log(`✅ Liquidación creada: ${id} con ${expenseIds.length} gastos`);
      res.status(201).json(newLiquidation);
    } catch (error) {
      console.error('Error creando liquidación:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  }
);

/**
 * @route   GET /api/liquidations/user/:userId
 * @desc    Obtener todas las liquidaciones de un usuario
 * @access  Private (solo el mismo usuario)
 */
router.get('/user/:userId', authenticateToken, canAccessUserData, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const liquidations = await Liquidation.find({ userId })
      .sort({ createdDate: -1 })
      .lean();

    res.json(liquidations);
  } catch (error) {
    console.error('Error obteniendo liquidaciones del usuario:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   GET /api/liquidations/manager/:managerEmail
 * @desc    Obtener todas las liquidaciones pendientes para un manager
 * @access  Private (solo managers)
 */
router.get('/manager/:managerEmail', authenticateToken, requireManager, async (req, res) => {
  try {
    const { managerEmail } = req.params;
    
    // Obtener liquidaciones asignadas a este manager con status 'submitted'
    const liquidations = await Liquidation.find({ 
      managerEmail,
      status: 'submitted'
    })
      .sort({ submittedDate: -1 })
      .lean();

    res.json(liquidations);
  } catch (error) {
    console.error('Error obteniendo liquidaciones para el manager:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   GET /api/liquidations/:id
 * @desc    Obtener una liquidación específica por ID
 * @access  Private (autenticado)
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const liquidation = await Liquidation.findOne({ id }).lean();
    
    if (!liquidation) {
      return res.status(404).json({ error: 'Liquidación no encontrada' });
    }

    res.json(liquidation);
  } catch (error) {
    console.error('Error obteniendo liquidación:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   PUT /api/liquidations/:id/submit
 * @desc    Enviar liquidación al jefe (draft/rejected -> submitted)
 * @access  Private (autenticado)
 */
router.put('/:id/submit', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const liquidation = await Liquidation.findOne({ id });
    
    if (!liquidation) {
      return res.status(404).json({ error: 'Liquidación no encontrada' });
    }

    if (liquidation.status !== 'draft' && liquidation.status !== 'rejected') {
      return res.status(400).json({ error: 'Solo se pueden enviar liquidaciones en draft o rejected' });
    }

    liquidation.status = 'submitted';
    liquidation.submittedDate = new Date().toISOString().split('T')[0];
    
    // Limpiar fechas de aprobación/rechazo previas si existían
    liquidation.approvedDate = null;
    liquidation.rejectedDate = null;
    liquidation.managerComments = null;

    await liquidation.save();

    console.log(`✅ Liquidación ${id} enviada al jefe`);
    res.json(liquidation);
  } catch (error) {
    console.error('Error enviando liquidación:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   PUT /api/liquidations/:id/approve
 * @desc    Aprobar liquidación (manager action)
 * @access  Private (solo managers)
 */
router.put('/:id/approve', 
  authenticateToken, 
  requireManager,
  [
    body('managerComments').optional().isString()
  ],
  async (req, res) => {
    try {
      const { id } = req.params;
      const { managerComments } = req.body;
      
      const liquidation = await Liquidation.findOne({ id });
      
      if (!liquidation) {
        return res.status(404).json({ error: 'Liquidación no encontrada' });
      }

      if (liquidation.status !== 'submitted') {
        return res.status(400).json({ error: 'Solo se pueden aprobar liquidaciones enviadas' });
      }

      liquidation.status = 'approved';
      liquidation.approvedDate = new Date().toISOString().split('T')[0];
      liquidation.managerComments = managerComments || null;

      await liquidation.save();

      // Actualizar el estado de los gastos a 'approved'
      await Expense.updateMany(
        { id: { $in: liquidation.expenseIds } },
        { $set: { expenseStatus: 'approved' } }
      );

      console.log(`✅ Liquidación ${id} aprobada por ${req.user.email}`);
      res.json(liquidation);
    } catch (error) {
      console.error('Error aprobando liquidación:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  }
);

/**
 * @route   PUT /api/liquidations/:id/reject
 * @desc    Rechazar liquidación (manager action)
 * @access  Private (solo managers)
 */
router.put('/:id/reject', 
  authenticateToken, 
  requireManager,
  [
    body('managerComments').notEmpty().withMessage('Debe incluir un comentario al rechazar')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { managerComments } = req.body;
      
      const liquidation = await Liquidation.findOne({ id });
      
      if (!liquidation) {
        return res.status(404).json({ error: 'Liquidación no encontrada' });
      }

      if (liquidation.status !== 'submitted') {
        return res.status(400).json({ error: 'Solo se pueden rechazar liquidaciones enviadas' });
      }

      liquidation.status = 'rejected';
      liquidation.rejectedDate = new Date().toISOString().split('T')[0];
      liquidation.managerComments = managerComments;

      await liquidation.save();

      // Regresar los gastos a estado 'draft' y limpiar liquidationId
      await Expense.updateMany(
        { id: { $in: liquidation.expenseIds } },
        { 
          $set: { expenseStatus: 'draft' },
          $unset: { liquidationId: '' }
        }
      );

      console.log(`✅ Liquidación ${id} rechazada por ${req.user.email}`);
      res.json(liquidation);
    } catch (error) {
      console.error('Error rechazando liquidación:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  }
);

/**
 * @route   DELETE /api/liquidations/:id
 * @desc    Eliminar liquidación (solo si está en draft)
 * @access  Private (autenticado)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const liquidation = await Liquidation.findOne({ id });
    
    if (!liquidation) {
      return res.status(404).json({ error: 'Liquidación no encontrada' });
    }

    if (liquidation.status !== 'draft') {
      return res.status(400).json({ error: 'Solo se pueden eliminar liquidaciones en draft' });
    }

    // Regresar los gastos a estado 'draft' y limpiar liquidationId
    await Expense.updateMany(
      { id: { $in: liquidation.expenseIds } },
      { 
        $set: { expenseStatus: 'draft' },
        $unset: { liquidationId: '' }
      }
    );

    await Liquidation.deleteOne({ id });

    console.log(`✅ Liquidación ${id} eliminada`);
    res.json({ message: 'Liquidación eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando liquidación:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   GET /api/liquidations/:id/csv
 * @desc    Obtener datos de liquidación en formato CSV (solo si está aprobada)
 * @access  Private (autenticado)
 */
router.get('/:id/csv', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const liquidation = await Liquidation.findOne({ id });
    
    if (!liquidation) {
      return res.status(404).json({ error: 'Liquidación no encontrada' });
    }

    if (liquidation.status !== 'approved') {
      return res.status(400).json({ error: 'Solo se puede generar CSV de liquidaciones aprobadas' });
    }

    // Obtener los gastos de la liquidación
    const expenses = await Expense.find({ 
      id: { $in: liquidation.expenseIds } 
    }).lean();

    // Generar datos CSV
    const csvData = expenses.map(expense => ({
      liquidation_id: liquidation.id,
      expense_id: expense.id,
      employee: liquidation.employeeName,
      date: expense.date,
      description: expense.description,
      amount: expense.amount,
      category: expense.category,
      department: expense.department,
      supplier: expense.supplier,
      vat_number: expense.vat_number,
      invoice_number: expense.noinvoice,
      serie: expense.serie,
      centro: expense.centro,
      cuenta: expense.cuenta,
      ordenco: expense.ordenco,
      currency: expense.currency,
      approved_date: liquidation.approvedDate
    }));

    res.json({
      liquidation,
      expenses: csvData
    });
  } catch (error) {
    console.error('Error generando CSV de liquidación:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   PUT /api/liquidations/:id
 * @desc    Actualizar liquidación (para sincronización desde la app)
 * @access  Private (autenticado)
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const liquidation = await Liquidation.findOne({ id });
    
    if (!liquidation) {
      // Si no existe, crearla (caso de sync desde app)
      const newLiquidation = new Liquidation({
        id,
        ...updateData
      });
      await newLiquidation.save();
      return res.status(201).json(newLiquidation);
    }

    // Actualizar campos permitidos
    const allowedFields = [
      'employeeName', 'expenseIds', 'totalAmount', 'status',
      'managerComments', 'submittedDate', 'approvedDate', 'rejectedDate'
    ];

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        liquidation[field] = updateData[field];
      }
    });

    await liquidation.save();
    res.json(liquidation);
  } catch (error) {
    console.error('Error actualizando liquidación:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
