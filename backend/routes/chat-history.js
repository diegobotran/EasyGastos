/**
 * Rutas para el historial de conversaciones del chat con IA
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { models } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

const { ChatConversation, SyncLog } = models;

// Middleware de validación
const validateConversation = [
  body('id').isString().isLength({ min: 1 }),
  body('userId').isEmail().normalizeEmail(),
  body('title').trim().isLength({ min: 1, max: 200 }),
  body('messages').isArray(),
  body('messages.*.id').isString(),
  body('messages.*.type').isIn(['user', 'assistant']),
  body('messages.*.text').isString(),
  body('messages.*.timestamp').isISO8601()
];

/**
 * POST /api/chat-history
 * Crear una nueva conversación
 */
router.post('/', authenticateToken, validateConversation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id, userId, title, messages, expensesCount } = req.body;

    // Verificar si ya existe
    const existing = await ChatConversation.findOne({ id });
    if (existing) {
      return res.status(409).json({ error: 'La conversación ya existe' });
    }

    // Crear conversación
    const conversation = new ChatConversation({
      id,
      userId,
      title,
      messages,
      expensesCount: expensesCount || 0
    });

    await conversation.save();

    // Log de sincronización
    await SyncLog.create({
      userEmail: userId,
      entityType: 'chat_conversation',
      entityId: id,
      action: 'create',
      success: true
    });

    console.log(`✅ Conversación creada: ${id} para usuario ${userId}`);
    res.status(201).json(conversation);
  } catch (error) {
    console.error('❌ Error creando conversación:', error);
    res.status(500).json({ error: 'Error al crear la conversación' });
  }
});

/**
 * GET /api/chat-history/user/:userId
 * Obtener todas las conversaciones de un usuario (últimos 7 días)
 */
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Calcular fecha hace 7 días
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const conversations = await ChatConversation.find({
      userId,
      updatedAt: { $gte: sevenDaysAgo }
    })
    .sort({ updatedAt: -1 })
    .lean();

    console.log(`✅ ${conversations.length} conversaciones encontradas para ${userId}`);
    res.json(conversations);
  } catch (error) {
    console.error('❌ Error obteniendo conversaciones:', error);
    res.status(500).json({ error: 'Error al obtener conversaciones' });
  }
});

/**
 * GET /api/chat-history/:id
 * Obtener una conversación por ID
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await ChatConversation.findOne({ id }).lean();

    if (!conversation) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    res.json(conversation);
  } catch (error) {
    console.error('❌ Error obteniendo conversación:', error);
    res.status(500).json({ error: 'Error al obtener la conversación' });
  }
});

/**
 * PUT /api/chat-history/:id
 * Actualizar una conversación (agregar mensajes)
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, messages, expensesCount } = req.body;

    const conversation = await ChatConversation.findOne({ id });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    // Actualizar campos
    if (title) conversation.title = title;
    if (messages) conversation.messages = messages;
    if (expensesCount !== undefined) conversation.expensesCount = expensesCount;

    await conversation.save();

    // Log de sincronización
    await SyncLog.create({
      userEmail: conversation.userId,
      entityType: 'chat_conversation',
      entityId: id,
      action: 'update',
      success: true
    });

    console.log(`✅ Conversación actualizada: ${id}`);
    res.json(conversation);
  } catch (error) {
    console.error('❌ Error actualizando conversación:', error);
    res.status(500).json({ error: 'Error al actualizar la conversación' });
  }
});

/**
 * DELETE /api/chat-history/:id
 * Eliminar una conversación
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await ChatConversation.findOne({ id });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    await ChatConversation.deleteOne({ id });

    // Log de sincronización
    await SyncLog.create({
      userEmail: conversation.userId,
      entityType: 'chat_conversation',
      entityId: id,
      action: 'delete',
      success: true
    });

    console.log(`✅ Conversación eliminada: ${id}`);
    res.json({ message: 'Conversación eliminada exitosamente' });
  } catch (error) {
    console.error('❌ Error eliminando conversación:', error);
    res.status(500).json({ error: 'Error al eliminar la conversación' });
  }
});

/**
 * DELETE /api/chat-history/cleanup/:userId
 * Eliminar conversaciones mayores a 7 días para un usuario
 */
router.delete('/cleanup/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = await ChatConversation.deleteMany({
      userId,
      updatedAt: { $lt: sevenDaysAgo }
    });

    console.log(`✅ ${result.deletedCount} conversaciones antiguas eliminadas para ${userId}`);
    res.json({ 
      message: `${result.deletedCount} conversaciones eliminadas`,
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('❌ Error limpiando conversaciones:', error);
    res.status(500).json({ error: 'Error al limpiar conversaciones' });
  }
});

/**
 * POST /api/chat-history/batch
 * Sincronizar múltiples conversaciones (batch)
 */
router.post('/batch', authenticateToken, async (req, res) => {
  try {
    const { conversations } = req.body;

    if (!Array.isArray(conversations)) {
      return res.status(400).json({ error: 'Se espera un array de conversaciones' });
    }

    const results = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    for (const conv of conversations) {
      try {
        const existing = await ChatConversation.findOne({ id: conv.id });

        if (existing) {
          // Actualizar
          existing.title = conv.title;
          existing.messages = conv.messages;
          existing.expensesCount = conv.expensesCount || 0;
          await existing.save();
          results.updated++;
        } else {
          // Crear
          const newConv = new ChatConversation({
            id: conv.id,
            userId: conv.userId,
            title: conv.title,
            messages: conv.messages,
            expensesCount: conv.expensesCount || 0
          });
          await newConv.save();
          results.created++;
        }

        // Log exitoso
        await SyncLog.create({
          userEmail: conv.userId,
          entityType: 'chat_conversation',
          entityId: conv.id,
          action: existing ? 'update' : 'create',
          success: true
        });
      } catch (error) {
        results.failed++;
        results.errors.push({
          id: conv.id,
          error: error.message
        });

        // Log fallido
        await SyncLog.create({
          userEmail: conv.userId,
          entityType: 'chat_conversation',
          entityId: conv.id,
          action: 'batch_sync',
          success: false,
          errorMessage: error.message
        });
      }
    }

    console.log(`✅ Sincronización batch: ${results.created} creadas, ${results.updated} actualizadas, ${results.failed} fallidas`);
    res.json(results);
  } catch (error) {
    console.error('❌ Error en sincronización batch:', error);
    res.status(500).json({ error: 'Error en sincronización batch' });
  }
});

module.exports = router;
