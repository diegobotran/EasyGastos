const express = require('express');
const { body, validationResult } = require('express-validator');
const { models } = require('../database/init');
const ManagerEmployeeLink = require('../models/ManagerEmployeeLink');
const { authenticateToken, canAccessUserData, requireManager } = require('../middleware/auth');
const ExpenseFiscalValidationService = require('../services/ExpenseFiscalValidationService');
const ExpenseDuplicateService = require('../services/ExpenseDuplicateService');
const router = express.Router();

const { Expense, User, SyncLog } = models;

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

// Middleware para validar datos de gasto
const validateExpense = [
  body('id').trim().isLength({ min: 1 }),
  body('userEmail').isEmail().normalizeEmail(),
  body('description').optional({ nullable: true }).trim(),
  body('amount').optional({ nullable: true }).isNumeric().custom((value, { req }) => {
    if (!isDraft(req.body) && value <= 0) throw new Error('El monto debe ser mayor a 0');
    if (value < 0) throw new Error('El monto no puede ser negativo');
    if (value > 3500) throw new Error('El monto no puede exceder Q3,500');
    return true;
  }),
  body('date').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body('category').optional({ nullable: true }).trim(),
  body('sociedad').optional({ nullable: true }).trim(),
  body('status').isIn(['BORRADOR', 'ENVIADO_JEFE', 'APROBADO_JEFE', 'RECHAZADO_JEFE', 'APROBADO_FINANZAS', 'RECHAZADO_FINANZAS', 'CONTABILIZADO', 'ERROR_SAP']),
  body('expenseStatus').optional().isIn(['draft', 'in_liquidation', 'approved', 'voided']),
  body('satStatus').optional().isIn(['VALIDADO_SAT', 'PENDIENTE_VALIDACION_SAT']),
  body('satValidatedAt').optional().trim(),
  body('satValidationSource').optional().isIn(['SAT_INTERNO']),
  body('satValidationFingerprint').optional().trim(),
  body('satValidationCause').optional().isIn(['NO_ENCONTRADO_D_PLUS_1', 'DATOS_FISCALES_MODIFICADOS', 'NINGUNA']),
  body('fiscalStatus').optional().isIn(['PENDIENTE', 'APTO_PARA_LIQUIDAR', 'BLOQUEADO_NIT_SOCIEDAD', 'BLOQUEADO_ANTIGUEDAD']),
  body('satFacturaId').optional({ nullable: true }).trim(),
  body('satInvoiceSnapshot').optional({ nullable: true }).isObject(),
  body('fiscalValidatedAt').optional({ nullable: true }).trim(),
  body('fiscalValidityDaysApplied').optional({ nullable: true }).isInt({ min: 1 }),
  body('imageValidationFingerprint').optional({ nullable: true }).trim(),
  body('supplier').optional().trim(),
  body('vat_number').optional().trim(),
  body('receiver_vat_number').optional().trim(),
  body('department').optional().trim(),
  body('notes').optional().trim(),
  body('noinvoice').optional().trim(),
  body('serie').optional().trim(),
  body('uuid').optional().trim(), // UUID de factura FEL
  body('centro').optional({ nullable: true }).trim(),
  body('cuenta').optional({ nullable: true }).trim(),
  body('ordenco').optional({ nullable: true }).trim(),
  body('managerEmail').optional({ nullable: true, checkFalsy: true }).isEmail(),
  body('liquidationId').optional().trim(),
  body('imageuri').optional().trim(),
  body('currency').optional().isIn(['GTQ', 'EUR', 'USD', 'GBP']),
  body('totiva').optional().isNumeric(),
  body().custom(value => {
    if (!hasAttachment(value)) throw new Error('Debe adjuntar un documento o imagen.');
    if (!isDraft(value) && !hasAccountingSnapshot(value)) {
      throw new Error('El gasto debe incluir categoría, sociedad, centro, cuenta y orden CO.');
    }
    return true;
  })
];

router.post('/validate-fiscal', authenticateToken, async (req, res) => {
  try {
    return res.json({ success: true, expense: await normalizeSatValidationState(req.body) });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      code: error.code || 'FISCAL_VALIDATION_ERROR',
      error: error.status ? error.message : 'Error interno del servidor',
      details: error.details
    });
  }
});

// Verificación global de identidad de factura.
router.post('/check-duplicate', authenticateToken, async (req, res) => {
  try {
    const { serie, noinvoice, excludeId } = req.body || {};
    if (!ExpenseDuplicateService.normalizeInvoiceKey(serie) || !ExpenseDuplicateService.normalizeInvoiceKey(noinvoice)) {
      return res.status(400).json({
        error: 'Se requiere serie y número de factura para verificar duplicidad.'
      });
    }

    const duplicate = await ExpenseDuplicateService.findActiveDuplicate({ serie, noinvoice, excludeId });
    return res.json({
      isDuplicate: Boolean(duplicate),
      inLiquidation: Boolean(
        duplicate?.liquidationId &&
        ['in_liquidation', 'approved'].includes(duplicate.expenseStatus)
      )
    });
  } catch (error) {
    console.error('Error verificando duplicidad global:', error);
    return res.status(500).json({ error: 'No fue posible verificar la duplicidad global.' });
  }
});

// Crear nuevo gasto (requiere autenticación)
router.post('/', authenticateToken, validateExpense, async (req, res) => {
  try {
    console.log('📥 POST /api/expenses - Datos recibidos:', JSON.stringify(req.body, null, 2));
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('❌ Errores de validación:', JSON.stringify(errors.array(), null, 2));
      return res.status(400).json({ errors: errors.array() });
    }

    const expenseData = await normalizeSatValidationState(req.body);
    console.log('✅ Validación exitosa para gasto ID:', expenseData.id);

    if (!isDraft(expenseData) && !hasAccountingSnapshot(expenseData)) {
      return res.status(400).json({
        error: 'El gasto debe incluir categoría, sociedad, centro, cuenta y orden CO.'
      });
    }

    // Verificar si ya existe un gasto con ese ID
    const existingExpense = await Expense.findOne({ id: expenseData.id });
    if (existingExpense) {
      console.log('⚠️ Gasto duplicado detectado - ID:', expenseData.id);
      return res.status(409).json({ error: 'Ya existe un gasto con ese ID' });
    }

    // VALIDACIÓN GLOBAL: la identidad se determina únicamente por serie + número.
    if (expenseData.serie && expenseData.noinvoice) {
      console.log('🔍 Backend: Verificando duplicado de factura:', {
        serie: expenseData.serie,
        noinvoice: expenseData.noinvoice
      });

      // IMPORTANTE: Ignorar gastos anulados para permitir re-crear facturas anuladas
      const duplicateExpense = await ExpenseDuplicateService.findActiveDuplicate(expenseData);

      if (duplicateExpense) {
        console.log('⚠️ Backend: Factura duplicada detectada:', duplicateExpense.id);
        
        // Verificar si está en liquidación
        const inLiquidation = duplicateExpense.liquidationId && 
                             (duplicateExpense.expenseStatus === 'in_liquidation' || 
                              duplicateExpense.expenseStatus === 'approved');
        
        let errorMsg = `Factura duplicada: Ya existe un gasto activo con Serie "${expenseData.serie}" y No. "${expenseData.noinvoice}".`;
        
        if (inLiquidation) {
          errorMsg += ` Esta factura está incluida en la liquidación #${duplicateExpense.liquidationId}.`;
        }
        
        return res.status(409).json({ 
          error: errorMsg,
          duplicateExpenseId: duplicateExpense.id,
          inLiquidation: inLiquidation
        });
      }
      
      console.log('✅ Backend: No se encontraron duplicados');
    }

    // Convertir fecha a formato ISO antes de guardar
    if (expenseData.date) {
      const dateObj = new Date(expenseData.date);
      expenseData.date = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
      console.log('📅 Fecha convertida a formato ISO:', expenseData.date);
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
        sociedad: newExpense.sociedad,
        status: newExpense.status,
        expenseStatus: newExpense.expenseStatus,
        satStatus: newExpense.satStatus,
        satValidatedAt: newExpense.satValidatedAt,
        satValidationSource: newExpense.satValidationSource,
        satValidationFingerprint: newExpense.satValidationFingerprint,
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
    
    if (error.status) {
      return res.status(error.status).json({ code: error.code, error: error.message, details: error.details });
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
      receiver_vat_number: expense.receiver_vat_number,
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
      voidedAt: expense.voidedAt,
      voidedReason: expense.voidedReason,
      approvalComments: expense.approvalComments,
      approvedAt: expense.approvedAt,
      approvedBy: expense.approvedBy,
      rejectedAt: expense.rejectedAt,
      rejectedBy: expense.rejectedBy,
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
      sociedad: expense.sociedad,
      status: expense.status,
      satStatus: expense.satStatus || 'PENDIENTE_VALIDACION_SAT',
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

// NUEVO: Actualizar gasto completo (PATCH) - Para sincronizar cambios como anulaciones
router.patch('/:id', authenticateToken, [
  body('expenseStatus').optional().isIn(['draft', 'in_liquidation', 'approved', 'voided']),
  body('satStatus').optional().isIn(['VALIDADO_SAT', 'PENDIENTE_VALIDACION_SAT']),
  body('satValidatedAt').optional().trim(),
  body('satValidationSource').optional().isIn(['SAT_INTERNO']),
  body('satValidationFingerprint').optional().trim(),
  body('satValidationCause').optional().isIn(['NO_ENCONTRADO_D_PLUS_1', 'DATOS_FISCALES_MODIFICADOS', 'NINGUNA']),
  body('fiscalStatus').optional().isIn(['PENDIENTE', 'APTO_PARA_LIQUIDAR', 'BLOQUEADO_NIT_SOCIEDAD', 'BLOQUEADO_ANTIGUEDAD']),
  body('satFacturaId').optional({ nullable: true }).trim(),
  body('satInvoiceSnapshot').optional({ nullable: true }).isObject(),
  body('fiscalValidatedAt').optional({ nullable: true }).trim(),
  body('fiscalValidityDaysApplied').optional({ nullable: true }).isInt({ min: 1 }),
  body('imageValidationFingerprint').optional({ nullable: true }).trim(),
  body('receiver_vat_number').optional().trim(),
  body('voidedAt').optional().trim(),
  body('voidedReason').optional().trim(),
  body('description').optional().trim().isLength({ min: 1 }),
  body('amount').optional().isNumeric(),
  body('date').optional({ checkFalsy: true }).isISO8601(),
  body('category').optional().trim(),
  body('sociedad').optional().trim(),
  body('status').optional().isIn(['BORRADOR', 'ENVIADO_JEFE', 'APROBADO_JEFE', 'RECHAZADO_JEFE']),
  body('supplier').optional().trim(),
  body('department').optional().trim(),
  body('notes').optional().trim(),
  body('noinvoice').optional().trim(),
  body('serie').optional().trim(),
  body('uuid').optional().trim(),
  body('centro').optional().trim(),
  body('cuenta').optional().trim(),
  body('ordenco').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('❌ Errores de validación en PATCH:', JSON.stringify(errors.array(), null, 2));
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const mergedInput = { ...(await Expense.findOne({ id: req.params.id }).lean()), ...req.body };
    const updateData = await normalizeSatValidationState(mergedInput);

    console.log('📝 PATCH /api/expenses/:id - Actualizando gasto:', id);
    console.log('📝 Datos a actualizar:', JSON.stringify(updateData, null, 2));

    // Buscar gasto existente
    const expense = await Expense.findOne({ id });
    if (!expense) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    // Verificar permisos: solo el dueño puede actualizar
    if (expense.userEmail !== updateData.userEmail && expense.userEmail !== req.user.email) {
      return res.status(403).json({ error: 'No tiene permisos para actualizar este gasto' });
    }

    if (updateData.serie && updateData.noinvoice) {
      const duplicateExpense = await ExpenseDuplicateService.findActiveDuplicate({
        serie: updateData.serie,
        noinvoice: updateData.noinvoice,
        excludeId: expense.id
      });
      if (duplicateExpense) {
        return res.status(409).json({
          error: `Factura duplicada: Ya existe otro gasto activo con Serie "${updateData.serie}" y No. "${updateData.noinvoice}".`,
          duplicateExpenseId: duplicateExpense.id,
          inLiquidation: Boolean(
            duplicateExpense.liquidationId &&
            ['in_liquidation', 'approved'].includes(duplicateExpense.expenseStatus)
          )
        });
      }
    }

    // Si no tiene managerEmail, buscarlo en ManagerEmployeeLink o en el usuario
    if (!updateData.managerEmail && !expense.managerEmail) {
      const managerLink = await ManagerEmployeeLink.getDirectManager(expense.userEmail);
      if (managerLink) {
        updateData.managerEmail = managerLink.managerEmail;
        console.log('✅ Manager asignado desde ManagerEmployeeLink:', updateData.managerEmail);
      } else {
        // Fallback: usar el managerEmail del usuario si no hay relación definida
        const user = await User.findOne({ email: expense.userEmail });
        if (user && user.managerEmail) {
          updateData.managerEmail = user.managerEmail;
          console.log('✅ Manager asignado desde User:', updateData.managerEmail);
        }
      }
    }

    // Actualizar campos permitidos
    const allowedFields = [
      'description', 'amount', 'date', 'category', 'sociedad', 'status', 'expenseStatus', 'satStatus',
      'satValidatedAt', 'satValidationSource', 'satValidationFingerprint',
      'satValidationCause', 'fiscalStatus', 'satFacturaId', 'satInvoiceSnapshot',
      'fiscalValidatedAt', 'fiscalValidityDaysApplied', 'imageValidationFingerprint',
      'supplier', 'vat_number', 'receiver_vat_number', 'department', 'notes', 'noinvoice', 'serie', 'uuid',
      'centro', 'cuenta', 'ordenco', 'imageuri', 'currency', 'totiva',
      'voidedAt', 'voidedReason', 'liquidationId'
    ];

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        expense[field] = updateData[field];
      }
    });

    // Normalizar fecha si se actualizó
    if (updateData.date) {
      const dateObj = new Date(updateData.date);
      expense.date = dateObj.toISOString().split('T')[0];
      console.log('📅 Fecha normalizada:', expense.date);
    }

    if (!isDraft(expense) && !hasAccountingSnapshot(expense)) {
      return res.status(400).json({
        error: 'El gasto debe conservar categoría, sociedad, centro, cuenta y orden CO válidos.'
      });
    }

    expense.updatedAt = new Date();
    await expense.save();

    console.log('✅ Gasto actualizado exitosamente:', id);

    // Log de sincronización
    const syncLog = new SyncLog({
      userEmail: expense.userEmail,
      entityType: 'EXPENSE',
      entityId: expense.id,
      action: 'UPDATE',
      success: true
    });
    await syncLog.save();

    res.json({
      message: 'Gasto actualizado exitosamente',
      expense: expense
    });
  } catch (error) {
    console.error('❌ Error actualizando gasto:', error);
    if (error.status) {
      return res.status(error.status).json({ code: error.code, error: error.message, details: error.details });
    }
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
