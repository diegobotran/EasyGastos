const express = require('express');
const router = express.Router();
const { models } = require('../database/init');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireManager, canAccessUserData } = require('../middleware/auth');
const ManagerEmployeeLink = require('../models/ManagerEmployeeLink');
const { buildLiquidationSAPPayloadPreview } = require('../services/SAPPayloadService');

const { Liquidation, Expense, User } = models;
const SAP_EA_DOCUMENT_URL = process.env.SAP_EA_DOCUMENT_URL || 'https://api-integration-plataform-qa-wozvko.0uij1w.usa-e2.cloudhub.io/api/ea-document';
const SAP_EA_DOCUMENT_USER = process.env.SAP_EA_DOCUMENT_USER || 'easyapp';
const SAP_EA_DOCUMENT_PASSWORD = process.env.SAP_EA_DOCUMENT_PASSWORD || '';

const getSAPReturnMessages = (payload) => {
  if (Array.isArray(payload?.retunr)) {
    return payload.retunr;
  }

  if (Array.isArray(payload?.return)) {
    return payload.return;
  }

  return [];
};

const getSAPResponseSummary = (payload, liquidationId) => {
  const messages = getSAPReturnMessages(payload);
  const messageText = messages
    .map(item => String(item?.MESSAGE || '').trim())
    .filter(Boolean)
    .join(' | ');

  const documentMessage = messages.find(item => item?.ID === 'ZCM' && item?.MESSAGE_V1);
  const headerMessage = messages.find(item => item?.MESSAGE_V2 || item?.MESSAGE_V1);
  const hasError = messages.some(item => ['E', 'A', 'X'].includes(String(item?.TYPE || '').toUpperCase()));

  return {
    rawMessages: messages,
    hasError,
    sapDocNumber: documentMessage?.MESSAGE_V1 ? String(documentMessage.MESSAGE_V1).trim() : '',
    sapReferenceId: headerMessage?.MESSAGE_V2
      ? String(headerMessage.MESSAGE_V2).trim()
      : (headerMessage?.MESSAGE_V1 ? String(headerMessage.MESSAGE_V1).trim() : liquidationId),
    sapResponseMessage: messageText || 'SAP no devolvió mensajes descriptivos',
  };
};

const extractXMLTagValue = (xmlText, tagName) => {
  const match = String(xmlText || '').match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? String(match[1] || '').trim() : '';
};

const extractXMLItemBlocks = (xmlText, containerTag) => {
  const containerMatch = String(xmlText || '').match(new RegExp(`<${containerTag}>([\\s\\S]*?)<\\/${containerTag}>`, 'i'));
  if (!containerMatch) {
    return [];
  }

  const blocks = [];
  const regex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = regex.exec(containerMatch[1])) !== null) {
    blocks.push(match[1]);
  }

  return blocks;
};

const parseXMLSAPResponse = (xmlText, liquidationId) => {
  const rawMessages = extractXMLItemBlocks(xmlText, 'TAB_RETURN').map((block) => ({
    TYPE: extractXMLTagValue(block, 'TYPE'),
    ID: extractXMLTagValue(block, 'ID'),
    NUMBER: extractXMLTagValue(block, 'NUMBER'),
    MESSAGE: extractXMLTagValue(block, 'MESSAGE'),
    MESSAGE_V1: extractXMLTagValue(block, 'MESSAGE_V1'),
    MESSAGE_V2: extractXMLTagValue(block, 'MESSAGE_V2'),
    MESSAGE_V3: extractXMLTagValue(block, 'MESSAGE_V3'),
    MESSAGE_V4: extractXMLTagValue(block, 'MESSAGE_V4'),
    PARAMETER: extractXMLTagValue(block, 'PARAMETER'),
    ROW: extractXMLTagValue(block, 'ROW'),
    FIELD: extractXMLTagValue(block, 'FIELD'),
    SYSTEM: extractXMLTagValue(block, 'SYSTEM'),
  }));

  const meaningfulMessages = rawMessages.filter((item) =>
    Object.values(item).some((value) => String(value || '').trim() !== '')
  );

  const messageText = meaningfulMessages
    .map((item) => String(item.MESSAGE || item.MESSAGE_V1 || item.MESSAGE_V2 || '').trim())
    .filter(Boolean)
    .join(' | ');

  const hasError = meaningfulMessages.some((item) =>
    ['E', 'A', 'X'].includes(String(item.TYPE || '').toUpperCase())
  );

  const documentMessage = meaningfulMessages.find((item) =>
    (String(item.ID || '').toUpperCase() === 'ZCM' && item.MESSAGE_V1) ||
    /documento|doc/i.test(String(item.MESSAGE || ''))
  );

  return {
    format: 'xml',
    rawMessages: meaningfulMessages,
    hasError,
    hasConfirmation: meaningfulMessages.length > 0,
    sapDocNumber: documentMessage?.MESSAGE_V1 ? String(documentMessage.MESSAGE_V1).trim() : '',
    sapReferenceId: meaningfulMessages[0]?.MESSAGE_V2
      ? String(meaningfulMessages[0].MESSAGE_V2).trim()
      : liquidationId,
    sapResponseMessage: messageText || 'El middleware devolvió XML sin mensajes de confirmación en TAB_RETURN',
    rawXML: xmlText,
  };
};

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
    body('sociedad').optional().trim(),
    body('currency').optional().trim(),
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

      const { id, userId, employeeName, sociedad, currency, createdDate, expenseIds, totalAmount, status, sapDocNumber, sapSyncStatus, sapReferenceId, sapResponseMessage, sapSyncedAt, approverName, comments } = req.body;

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

      const nonValidatedExpenses = expensesToInclude.filter(exp => exp.satStatus !== 'VALIDADO_SAT');
      if (nonValidatedExpenses.length > 0) {
        return res.status(400).json({
          error: 'Todos los gastos deben estar validados por SAT antes de incluirse en una liquidación',
          nonValidatedExpenses: nonValidatedExpenses.map(exp => ({
            id: exp.id,
            description: exp.description,
            satStatus: exp.satStatus || 'NO_VALIDADO_SAT'
          }))
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

      if (!sociedad || !String(sociedad).trim()) {
        return res.status(400).json({ error: 'La liquidación debe indicar una sociedad.' });
      }

      if (!currency || !String(currency).trim()) {
        return res.status(400).json({ error: 'La liquidación debe indicar una moneda.' });
      }

      const conflictingSociedadExpenses = expensesToInclude.filter(exp => String(exp.sociedad || '').trim() !== String(sociedad).trim());
      if (conflictingSociedadExpenses.length > 0) {
        return res.status(400).json({
          error: 'Todos los gastos de una liquidación deben pertenecer a la misma sociedad.',
          conflictingExpenses: conflictingSociedadExpenses.map(exp => ({
            id: exp.id,
            description: exp.description,
            sociedad: exp.sociedad || ''
          }))
        });
      }

      const normalizedCurrency = String(currency).trim().toUpperCase();
      const conflictingCurrencyExpenses = expensesToInclude.filter(exp => String(exp.currency || '').trim().toUpperCase() !== normalizedCurrency);
      if (conflictingCurrencyExpenses.length > 0) {
        return res.status(400).json({
          error: 'Todos los gastos de una liquidación deben pertenecer a la misma moneda.',
          conflictingExpenses: conflictingCurrencyExpenses.map(exp => ({
            id: exp.id,
            description: exp.description,
            currency: exp.currency || ''
          }))
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
        sociedad,
        currency: normalizedCurrency,
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
    const sociedad = liquidation.sociedad || user?.sociedad || '';

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
 * @route   GET /api/liquidations/:id/sap-payload-preview
 * @desc    Generar preview interno del payload SAP para inspección manual
 * @access  Private (autenticado)
 */
router.get('/:id/sap-payload-preview', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await buildLiquidationSAPPayloadPreview(id);

    if (result.notFound) {
      return res.status(404).json({ error: 'Liquidación no encontrada' });
    }

    return res.json(result);
  } catch (error) {
    console.error('Error generando preview de payload SAP:', error);
    return res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   POST /api/liquidations/:id/send-to-sap
 * @desc    Enviar una liquidación aprobada al endpoint SAP
 * @access  Private (autenticado)
 */
router.post('/:id/send-to-sap', authenticateToken, async (req, res) => {
  const syncedAt = new Date().toISOString();

  try {
    const { id } = req.params;
    const liquidation = await Liquidation.findOne({ id });

    if (!liquidation) {
      return res.status(404).json({ error: 'Liquidación no encontrada' });
    }

    if (req.user.email !== liquidation.userId && !req.user.isManager) {
      return res.status(403).json({ error: 'No tienes permisos para enviar esta liquidación a SAP' });
    }

    if (liquidation.status !== 'approved') {
      return res.status(400).json({ error: 'Solo se pueden enviar a SAP liquidaciones aprobadas' });
    }

    if (!SAP_EA_DOCUMENT_PASSWORD) {
      liquidation.sapSyncStatus = 'ERROR';
      liquidation.sapResponseMessage = 'Falta configurar SAP_EA_DOCUMENT_PASSWORD en el backend';
      liquidation.sapSyncedAt = syncedAt;
      await liquidation.save();

      return res.status(500).json({ error: 'Configuración SAP incompleta en el backend' });
    }

    const previewResult = await buildLiquidationSAPPayloadPreview(id);
    if (previewResult.notFound) {
      return res.status(404).json({ error: 'Liquidación no encontrada' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    let sapResponse;
    try {
      sapResponse = await fetch(SAP_EA_DOCUMENT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${SAP_EA_DOCUMENT_USER}:${SAP_EA_DOCUMENT_PASSWORD}`).toString('base64')}`,
        },
        body: JSON.stringify(previewResult.payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const responseText = await sapResponse.text();
    let parsedSAPResponse = null;
    let parsedXMLResponse = null;

    try {
      parsedSAPResponse = responseText ? JSON.parse(responseText) : null;
    } catch (error) {
      if (responseText && responseText.trim().startsWith('<?xml')) {
        parsedXMLResponse = parseXMLSAPResponse(responseText, liquidation.id);
      } else {
        liquidation.sapSyncStatus = 'ERROR';
        liquidation.sapResponseMessage = `SAP devolvi? una respuesta no JSON: ${responseText || 'vac?a'}`;
        liquidation.sapSyncedAt = syncedAt;
        await liquidation.save();
        await Expense.updateMany(
          { id: { $in: liquidation.expenseIds } },
          { $set: { status: 'ERROR_SAP' } }
        );

        return res.status(502).json({ error: 'SAP devolvi? una respuesta inv?lida', details: String(error.message || error) });
      }
    }

    if (parsedXMLResponse) {
      if (!sapResponse.ok) {
        liquidation.sapSyncStatus = 'ERROR';
        liquidation.sapResponseMessage = parsedXMLResponse.sapResponseMessage;
        liquidation.sapSyncedAt = syncedAt;
        await liquidation.save();
        await Expense.updateMany(
          { id: { $in: liquidation.expenseIds } },
          { $set: { status: 'ERROR_SAP' } }
        );

        return res.status(502).json({
          error: 'El middleware devolvi? XML de error al enviar a SAP',
          sapStatus: sapResponse.status,
          sapResult: parsedXMLResponse,
        });
      }

      if (parsedXMLResponse.hasError) {
        liquidation.sapSyncStatus = 'ERROR';
        liquidation.sapDocNumber = parsedXMLResponse.sapDocNumber || null;
        liquidation.sapReferenceId = parsedXMLResponse.sapReferenceId || null;
        liquidation.sapResponseMessage = parsedXMLResponse.sapResponseMessage;
        liquidation.sapSyncedAt = syncedAt;
        await liquidation.save();

        await Expense.updateMany(
          { id: { $in: liquidation.expenseIds } },
          { $set: { status: 'ERROR_SAP' } }
        );

        return res.status(422).json({
          error: 'SAP devolvi? errores de contabilizaci?n en XML',
          liquidation,
          sapResult: {
            status: 'ERROR',
            sapDocNumber: parsedXMLResponse.sapDocNumber,
            sapReferenceId: parsedXMLResponse.sapReferenceId,
            sapResponseMessage: parsedXMLResponse.sapResponseMessage,
            sapSyncedAt: syncedAt,
            messages: parsedXMLResponse.rawMessages,
            format: 'xml',
          },
        });
      }

      if (!parsedXMLResponse.hasConfirmation) {
        liquidation.sapSyncStatus = 'ERROR';
        liquidation.sapReferenceId = parsedXMLResponse.sapReferenceId || null;
        liquidation.sapResponseMessage = parsedXMLResponse.sapResponseMessage;
        liquidation.sapSyncedAt = syncedAt;
        await liquidation.save();
        await Expense.updateMany(
          { id: { $in: liquidation.expenseIds } },
          { $set: { status: 'ERROR_SAP' } }
        );

        return res.status(502).json({
          error: 'El middleware devolvi? XML, pero no confirm? la contabilizaci?n en SAP',
          liquidation,
          sapResult: {
            status: 'UNCONFIRMED',
            sapDocNumber: parsedXMLResponse.sapDocNumber,
            sapReferenceId: parsedXMLResponse.sapReferenceId,
            sapResponseMessage: parsedXMLResponse.sapResponseMessage,
            sapSyncedAt: syncedAt,
            messages: parsedXMLResponse.rawMessages,
            format: 'xml',
          },
        });
      }

      liquidation.sapSyncStatus = 'SYNCED';
      liquidation.sapDocNumber = parsedXMLResponse.sapDocNumber || null;
      liquidation.sapReferenceId = parsedXMLResponse.sapReferenceId || null;
      liquidation.sapResponseMessage = parsedXMLResponse.sapResponseMessage;
      liquidation.sapSyncedAt = syncedAt;
      await liquidation.save();

      await Expense.updateMany(
        { id: { $in: liquidation.expenseIds } },
        { $set: { status: 'CONTABILIZADO' } }
      );

      return res.json({
        message: 'Liquidaci?n enviada correctamente a SAP',
        liquidation,
        sapResult: {
          status: 'SYNCED',
          sapDocNumber: parsedXMLResponse.sapDocNumber,
          sapReferenceId: parsedXMLResponse.sapReferenceId,
          sapResponseMessage: parsedXMLResponse.sapResponseMessage,
          sapSyncedAt: syncedAt,
          messages: parsedXMLResponse.rawMessages,
          format: 'xml',
        },
      });
    }

    if (!sapResponse.ok) {
      liquidation.sapSyncStatus = 'ERROR';
      liquidation.sapResponseMessage = parsedSAPResponse?.error || `SAP respondió HTTP ${sapResponse.status}`;
      liquidation.sapSyncedAt = syncedAt;
      await liquidation.save();
      await Expense.updateMany(
        { id: { $in: liquidation.expenseIds } },
        { $set: { status: 'ERROR_SAP' } }
      );

      return res.status(502).json({
        error: parsedSAPResponse?.error || 'Error al enviar la liquidación a SAP',
        sapStatus: sapResponse.status,
        sapResponse: parsedSAPResponse,
      });
    }

    const sapSummary = getSAPResponseSummary(parsedSAPResponse, liquidation.id);
    if (sapSummary.hasError) {
      liquidation.sapSyncStatus = 'ERROR';
      liquidation.sapDocNumber = sapSummary.sapDocNumber || null;
      liquidation.sapReferenceId = sapSummary.sapReferenceId || null;
      liquidation.sapResponseMessage = sapSummary.sapResponseMessage;
      liquidation.sapSyncedAt = syncedAt;
      await liquidation.save();

      await Expense.updateMany(
        { id: { $in: liquidation.expenseIds } },
        { $set: { status: 'ERROR_SAP' } }
      );

      return res.status(422).json({
        error: 'SAP devolvió errores de contabilización',
        liquidation,
        sapResult: {
          status: 'ERROR',
          sapDocNumber: sapSummary.sapDocNumber,
          sapReferenceId: sapSummary.sapReferenceId,
          sapResponseMessage: sapSummary.sapResponseMessage,
          sapSyncedAt: syncedAt,
          messages: sapSummary.rawMessages,
        },
      });
    }

    liquidation.sapSyncStatus = 'SYNCED';
    liquidation.sapDocNumber = sapSummary.sapDocNumber || null;
    liquidation.sapReferenceId = sapSummary.sapReferenceId || null;
    liquidation.sapResponseMessage = sapSummary.sapResponseMessage;
    liquidation.sapSyncedAt = syncedAt;
    await liquidation.save();

    await Expense.updateMany(
      { id: { $in: liquidation.expenseIds } },
      { $set: { status: 'CONTABILIZADO' } }
    );

    return res.json({
      message: 'Liquidación enviada correctamente a SAP',
      liquidation,
      sapResult: {
        status: 'SYNCED',
        sapDocNumber: sapSummary.sapDocNumber,
        sapReferenceId: sapSummary.sapReferenceId,
        sapResponseMessage: sapSummary.sapResponseMessage,
        sapSyncedAt: syncedAt,
        messages: sapSummary.rawMessages,
      },
    });
  } catch (error) {
    console.error('Error enviando liquidación a SAP:', error);
    return res.status(500).json({ error: error.message || 'Error del servidor al enviar a SAP' });
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
      'employeeName', 'sociedad', 'expenseIds', 'totalAmount', 'status',
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
