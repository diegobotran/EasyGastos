const express = require('express');
const router = express.Router();
const { models } = require('../database/init');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireManager, canAccessUserData } = require('../middleware/auth');
const ManagerEmployeeLink = require('../models/ManagerEmployeeLink');

const { Liquidation, Expense, User } = models;

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
    body('totalAmount').isNumeric().withMessage('totalAmount debe ser numérico'),
    body('status').optional().isIn(['draft', 'submitted', 'approved', 'rejected']),
    body('createdDate').optional(),
    body('managerEmail').optional().isEmail(),
    body('managerComments').optional(),
    body('submittedDate').optional(),
    body('approvedDate').optional(),
    body('rejectedDate').optional(),
    body('approverEmail').optional().isEmail(),
    body('rejectedBy').optional().isEmail(),
    body('csvGeneratedAt').optional(),
    body('csvGeneratedBy').optional().isEmail(),
    body('sapDocNumber').optional(),
    body('sapSyncStatus').optional(),
    body('sapReferenceId').optional(),
    body('sapResponseMessage').optional(),
    body('sapSyncedAt').optional(),
    body('approverName').optional(),
    body('comments').optional(),
    body('createdAt').optional().isNumeric(),
    body('updatedAt').optional().isNumeric()
  ],
  async (req, res) => {
    try {
      console.log('📥 POST /api/liquidations - Datos recibidos:', JSON.stringify(req.body, null, 2));
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error('❌ Errores de validación en liquidación:', JSON.stringify(errors.array(), null, 2));
        return res.status(400).json({ errors: errors.array() });
      }

      const { id, userId, employeeName, createdDate, expenseIds, totalAmount, status, sapDocNumber, sapSyncStatus, sapReferenceId, sapResponseMessage, sapSyncedAt, approverName, comments } = req.body;

      console.log('✅ Validación exitosa para liquidación ID:', id);
      console.log('📋 ExpenseIds recibidos:', expenseIds);

      // Verificar que la liquidación no exista
      const existing = await Liquidation.findOne({ id });
      if (existing) {
        console.log('⚠️ Liquidación duplicada detectada - ID:', id);
        return res.status(400).json({ error: 'Liquidación ya existe' });
      }

      // VALIDACIÓN CRÍTICA: Verificar que TODOS los gastos existan en el backend
      console.log('🔍 Verificando estado de gastos antes de crear liquidación...');
      console.log('🔍 ExpenseIds a buscar:', expenseIds);
      const expensesToInclude = await Expense.find({ id: { $in: expenseIds } });
      console.log('📊 Gastos encontrados en BD:', expensesToInclude.length);
      console.log('📊 Gastos esperados:', expenseIds.length);
      
      // VALIDACIÓN: Todos los gastos deben existir en el backend
      if (expensesToInclude.length !== expenseIds.length) {
        const foundIds = expensesToInclude.map(e => e.id);
        const missingIds = expenseIds.filter(id => !foundIds.includes(id));
        console.error('❌ CRÍTICO: Algunos gastos NO existen en el backend:', missingIds);
        return res.status(400).json({ 
          error: 'Algunos gastos no existen en el sistema. Por favor, sincroniza tus gastos primero y vuelve a intentar.',
          missingExpenseIds: missingIds,
          found: expensesToInclude.length,
          expected: expenseIds.length
        });
      }
      
      const voidedExpenses = expensesToInclude.filter(exp => exp.expenseStatus === 'voided');
      if (voidedExpenses.length > 0) {
        console.error('❌ CRÍTICO: Se intentó incluir gastos anulados en liquidación:', voidedExpenses.map(e => ({
          id: e.id,
          description: e.description,
          expenseStatus: e.expenseStatus,
          voidedAt: e.voidedAt,
          voidedReason: e.voidedReason
        })));
        return res.status(400).json({ 
          error: 'No se pueden incluir gastos anulados en una liquidación',
          voidedExpenses: voidedExpenses.map(e => e.id)
        });
      }

      // Verificar que ningún gasto esté ya en otra liquidación (excepto esta misma)
      const expensesInLiquidation = expensesToInclude.filter(exp => exp.liquidationId && exp.liquidationId !== '' && exp.liquidationId !== id);
      if (expensesInLiquidation.length > 0) {
        console.error('❌ Gastos ya están en otra liquidación:', expensesInLiquidation.map(e => ({
          id: e.id,
          liquidationId: e.liquidationId
        })));
        return res.status(400).json({ 
          error: 'Algunos gastos ya están en otra liquidación',
          conflictingExpenses: expensesInLiquidation.map(e => ({ id: e.id, liquidationId: e.liquidationId }))
        });
      }

      // Obtener el jefe directo del empleado
      console.log('👔 Buscando jefe directo para:', userId);
      const manager = await ManagerEmployeeLink.getDirectManager(userId);
      const managerEmail = manager ? manager.managerEmail : null;
      console.log('👔 Jefe asignado:', managerEmail || 'Sin jefe');

      // Crear la liquidación
      console.log('💾 Creando liquidación en BD...');
      const newLiquidation = new Liquidation({
        id,
        userId,
        employeeName,
        createdDate: createdDate || new Date().toISOString().split('T')[0],
        expenseIds,
        totalAmount,
        status: status || 'draft',
        managerEmail,
        sapDocNumber: sapDocNumber || null,
        sapSyncStatus: sapSyncStatus || null,
        sapReferenceId: sapReferenceId || null,
        sapResponseMessage: sapResponseMessage || null,
        sapSyncedAt: sapSyncedAt || null,
        approverName: approverName || null,
        comments: comments || null
      });

      await newLiquidation.save();
      console.log('✅ Liquidación guardada exitosamente');

      // Actualizar los gastos para asignarles la liquidationId y expenseStatus
      console.log('🔄 Actualizando gastos con liquidationId...');
      const updateResult = await Expense.updateMany(
        { id: { $in: expenseIds } },
        { 
          $set: { 
            liquidationId: id,
            expenseStatus: 'in_liquidation'
          } 
        }
      );

      console.log(`✅ ${updateResult.modifiedCount} gastos actualizados con liquidationId`);
      console.log(`✅ Liquidación creada: ${id} con ${expenseIds.length} gastos`);
      res.status(201).json(newLiquidation);
    } catch (error) {
      console.error('❌ ERROR creando liquidación:', error);
      console.error('❌ Stack trace:', error.stack);
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

    // Agregar la moneda del primer gasto de cada liquidación
    const liquidationsWithCurrency = await Promise.all(
      liquidations.map(async (liq) => {
        if (liq.expenseIds && liq.expenseIds.length > 0) {
          const firstExpense = await Expense.findOne({ id: liq.expenseIds[0] }).lean();
          if (firstExpense && firstExpense.currency) {
            liq.currency = firstExpense.currency;
          }
        }
        return liq;
      })
    );

    res.json(liquidationsWithCurrency);
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
 * @route   GET /api/liquidations/:id/expenses
 * @desc    Obtener todos los gastos de una liquidación
 * @access  Private (autenticado)
 */
router.get('/:id/expenses', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const liquidation = await Liquidation.findOne({ id }).lean();
    
    if (!liquidation) {
      return res.status(404).json({ error: 'Liquidación no encontrada' });
    }

    // Obtener todos los gastos de la liquidación
    const expenses = await Expense.find({ 
      id: { $in: liquidation.expenseIds } 
    }).lean();

    res.json(expenses);
  } catch (error) {
    console.error('Error obteniendo gastos de liquidación:', error);
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

    // VALIDACIÓN ESTRICTA: Solo draft o rejected pueden enviarse
    if (liquidation.status !== 'draft' && liquidation.status !== 'rejected') {
      const statusText = liquidation.status === 'submitted' ? 'ya está en revisión' :
                        liquidation.status === 'approved' ? 'ya fue aprobada' : 'desconocido';
      console.log(`⚠️ Intento de reenviar liquidación ${id} en estado ${liquidation.status}`);
      return res.status(400).json({ 
        error: `No se puede enviar esta liquidación: ${statusText}. Solo liquidaciones en borrador o rechazadas pueden enviarse.` 
      });
    }

    // Validar que tenga gastos
    if (!liquidation.expenseIds || liquidation.expenseIds.length === 0) {
      return res.status(400).json({ error: 'La liquidación debe tener al menos un gasto' });
    }

    liquidation.status = 'submitted';
    liquidation.submittedDate = new Date().toISOString().split('T')[0];
    
    // Limpiar fechas de aprobación/rechazo previas si existían
    liquidation.approvedDate = null;
    liquidation.rejectedDate = null;
    liquidation.managerComments = null;

    await liquidation.save();

    console.log(`✅ Liquidación ${id} enviada al jefe por ${req.user.email}`);
    console.log(`   - Gastos incluidos: ${liquidation.expenseIds.length}`);
    console.log(`   - Total: Q${liquidation.totalAmount}`);
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

      // VALIDACIÓN ESTRICTA: Solo liquidaciones 'submitted' pueden aprobarse
      if (liquidation.status !== 'submitted') {
        const statusText = liquidation.status === 'draft' ? 'borrador (no enviada)' :
                          liquidation.status === 'approved' ? 'ya aprobada' :
                          liquidation.status === 'rejected' ? 'rechazada' : 'desconocido';
        console.log(`⚠️ Intento de aprobar liquidación ${id} en estado ${liquidation.status}`);
        return res.status(400).json({ 
          error: `No se puede aprobar una liquidación en estado "${statusText}". Solo liquidaciones en revisión pueden ser aprobadas.` 
        });
      }

      // Guardar información del aprobador
      const previousStatus = liquidation.status;
      liquidation.status = 'approved';
      liquidation.approvedDate = new Date().toISOString().split('T')[0];
      liquidation.managerComments = managerComments || null;
      liquidation.approverEmail = req.user.email; // Tracking del aprobador

      await liquidation.save();

      // Actualizar el estado de los gastos a 'approved'
      const updateResult = await Expense.updateMany(
        { id: { $in: liquidation.expenseIds } },
        { $set: { expenseStatus: 'approved' } }
      );

      console.log(`✅ Liquidación ${id} aprobada por ${req.user.email}`);
      console.log(`   - Estado anterior: ${previousStatus}`);
      console.log(`   - Gastos actualizados: ${updateResult.modifiedCount}`);
      console.log(`   - Total aprobado: Q${liquidation.totalAmount}`);
      console.log(`   - Empleado: ${liquidation.employeeName}`);
      
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

      // VALIDACIÓN ESTRICTA: Solo liquidaciones 'submitted' pueden rechazarse
      if (liquidation.status !== 'submitted') {
        const statusText = liquidation.status === 'draft' ? 'borrador (no enviada)' :
                          liquidation.status === 'approved' ? 'ya aprobada' :
                          liquidation.status === 'rejected' ? 'ya rechazada' : 'desconocido';
        console.log(`⚠️ Intento de rechazar liquidación ${id} en estado ${liquidation.status}`);
        return res.status(400).json({ 
          error: `No se puede rechazar una liquidación en estado "${statusText}". Solo liquidaciones en revisión pueden ser rechazadas.` 
        });
      }

      const previousStatus = liquidation.status;
      liquidation.status = 'rejected';
      liquidation.rejectedDate = new Date().toISOString().split('T')[0];
      liquidation.managerComments = managerComments;
      liquidation.rejectedBy = req.user.email; // Tracking del rechazador

      await liquidation.save();

      // Regresar los gastos a estado 'draft' y limpiar liquidationId
      const updateResult = await Expense.updateMany(
        { id: { $in: liquidation.expenseIds } },
        { 
          $set: { expenseStatus: 'draft' },
          $unset: { liquidationId: '' }
        }
      );

      console.log(`❌ Liquidación ${id} rechazada por ${req.user.email}`);
      console.log(`   - Estado anterior: ${previousStatus}`);
      console.log(`   - Gastos liberados: ${updateResult.modifiedCount}`);
      console.log(`   - Comentarios: ${managerComments}`);
      console.log(`   - Empleado: ${liquidation.employeeName}`);
      
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

    // Obtener datos del usuario para codigo_empleado y sociedad
    const user = await User.findOne({ email: liquidation.userId });
    const codigoEmpleado = user?.employeeCode || '';
    const sociedad = user?.sociedad || '';

    // Obtener los gastos de la liquidación
    const expenses = await Expense.find({ 
      id: { $in: liquidation.expenseIds } 
    }).lean();

    // Generar datos CSV
    const csvData = expenses.map(expense => ({
      liquidation_id: liquidation.id,
      expense_id: expense.id,
      employee: liquidation.employeeName,
      codigo_empleado: codigoEmpleado,
      sociedad: sociedad,
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
