/**
 * Servicio para gestionar el historial de conversaciones del chat con IA
 * 
 * - Almacenamiento local en SQLite
 * - Sincronización con backend
 * - Límite de 7 días de historial
 */

import * as SQLite from 'expo-sqlite';
import { ChatConversation, ChatMessage, CreateConversationDTO, generateConversationTitle } from '../models/ChatHistory';

const DB_NAME = 'easygastos.db';

class ChatHistoryServiceClass {
  private db: SQLite.SQLiteDatabase | null = null;
  private initialized: boolean = false;
  private initializing: boolean = false;

  /**
   * Inicializa la base de datos y crea las tablas necesarias
   */
  async initialize(): Promise<void> {
    // Si ya está inicializado, no hacer nada
    if (this.initialized) {
      return;
    }

    // Si está en proceso de inicialización, esperar
    if (this.initializing) {
      console.log('⏳ ChatHistoryService: Inicialización en progreso, esperando...');
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (this.initialized || !this.initializing) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });
      return;
    }

    this.initializing = true;

    try {
      this.db = await SQLite.openDatabaseAsync(DB_NAME);
      
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS chat_conversations (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          title TEXT NOT NULL,
          messages TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          expensesCount INTEGER DEFAULT 0,
          needsSync INTEGER DEFAULT 1,
          lastSync INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_conversations_userId 
        ON chat_conversations(userId);

        CREATE INDEX IF NOT EXISTS idx_conversations_updatedAt 
        ON chat_conversations(updatedAt DESC);
      `);

      this.initialized = true;
      console.log('✅ ChatHistoryService: Base de datos inicializada');
    } catch (error) {
      console.error('❌ Error inicializando ChatHistoryService:', error);
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Crea una nueva conversación
   */
  async createConversation(data: CreateConversationDTO): Promise<ChatConversation> {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const conversation: ChatConversation = {
      id: Date.now().toString(),
      userId: data.userId,
      title: data.title || 'Nueva conversación',
      messages: data.messages || [],
      createdAt: now,
      updatedAt: now,
      needsSync: true,
    };

    try {
      await this.db.runAsync(
        `INSERT INTO chat_conversations 
        (id, userId, title, messages, createdAt, updatedAt, needsSync)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          conversation.id,
          conversation.userId,
          conversation.title,
          JSON.stringify(conversation.messages),
          conversation.createdAt,
          conversation.updatedAt,
          1,
        ]
      );

      console.log(`✅ Conversación creada: ${conversation.id}`);
      return conversation;
    } catch (error) {
      console.error('❌ Error creando conversación:', error);
      throw error;
    }
  }

  /**
   * Agrega un mensaje a una conversación existente
   */
  async addMessage(
    conversationId: string,
    message: ChatMessage,
    userId: string
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Obtener la conversación actual
      const conv = await this.getConversationById(conversationId);
      if (!conv) throw new Error('Conversation not found');

      // Agregar el nuevo mensaje
      const updatedMessages = [...conv.messages, message];
      const now = new Date().toISOString();

      // Si es el primer mensaje del usuario, actualizar el título
      let title = conv.title;
      if (updatedMessages.length === 1 && message.type === 'user') {
        title = generateConversationTitle(message.text);
      }

      await this.db.runAsync(
        `UPDATE chat_conversations 
        SET messages = ?, updatedAt = ?, title = ?, needsSync = 1
        WHERE id = ?`,
        [JSON.stringify(updatedMessages), now, title, conversationId]
      );

      console.log(`✅ Mensaje agregado a conversación ${conversationId}`);
    } catch (error) {
      console.error('❌ Error agregando mensaje:', error);
      throw error;
    }
  }

  /**
   * Obtiene una conversación por ID
   */
  async getConversationById(conversationId: string): Promise<ChatConversation | null> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.getFirstAsync<any>(
        'SELECT * FROM chat_conversations WHERE id = ?',
        [conversationId]
      );

      if (!result) return null;

      return this.mapRowToConversation(result);
    } catch (error) {
      console.error('❌ Error obteniendo conversación:', error);
      return null;
    }
  }

  /**
   * Obtiene todas las conversaciones de un usuario (últimos 7 días)
   */
  async getConversationsByUser(userId: string): Promise<ChatConversation[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Calcular fecha hace 7 días
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoffDate = sevenDaysAgo.toISOString();

      const results = await this.db.getAllAsync<any>(
        `SELECT * FROM chat_conversations 
        WHERE userId = ? AND updatedAt >= ?
        ORDER BY updatedAt DESC`,
        [userId, cutoffDate]
      );

      return results.map(row => this.mapRowToConversation(row));
    } catch (error) {
      console.error('❌ Error obteniendo conversaciones:', error);
      return [];
    }
  }

  /**
   * Obtiene la conversación más reciente de un usuario (últimos 7 días)
   * Retorna null si no hay conversaciones o si la más reciente es mayor a 7 días
   */
  async getRecentConversation(userId: string): Promise<ChatConversation | null> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Calcular fecha hace 7 días
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoffDate = sevenDaysAgo.toISOString();

      const result = await this.db.getFirstAsync<any>(
        `SELECT * FROM chat_conversations 
        WHERE userId = ? AND updatedAt >= ?
        ORDER BY updatedAt DESC
        LIMIT 1`,
        [userId, cutoffDate]
      );

      if (!result) return null;

      return this.mapRowToConversation(result);
    } catch (error) {
      console.error('❌ Error obteniendo conversación reciente:', error);
      return null;
    }
  }

  /**
   * Actualiza una conversación completa
   */
  async updateConversation(conversation: ChatConversation): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.runAsync(
        `UPDATE chat_conversations 
        SET title = ?, messages = ?, updatedAt = ?, expensesCount = ?, needsSync = 1
        WHERE id = ?`,
        [
          conversation.title,
          JSON.stringify(conversation.messages),
          conversation.updatedAt,
          conversation.expensesCount || 0,
          conversation.id,
        ]
      );

      console.log(`✅ Conversación actualizada: ${conversation.id}`);
    } catch (error) {
      console.error('❌ Error actualizando conversación:', error);
      throw error;
    }
  }

  /**
   * Elimina una conversación
   */
  async deleteConversation(conversationId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.runAsync(
        'DELETE FROM chat_conversations WHERE id = ?',
        [conversationId]
      );

      console.log(`✅ Conversación eliminada: ${conversationId}`);
    } catch (error) {
      console.error('❌ Error eliminando conversación:', error);
      throw error;
    }
  }

  /**
   * Elimina conversaciones más antiguas de 7 días
   */
  async deleteOldConversations(userId: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoffDate = sevenDaysAgo.toISOString();

      const result = await this.db.runAsync(
        'DELETE FROM chat_conversations WHERE userId = ? AND updatedAt < ?',
        [userId, cutoffDate]
      );

      const deletedCount = result.changes;
      if (deletedCount > 0) {
        console.log(`✅ ${deletedCount} conversaciones antiguas eliminadas`);
      }

      return deletedCount;
    } catch (error) {
      console.error('❌ Error eliminando conversaciones antiguas:', error);
      return 0;
    }
  }

  /**
   * Marca una conversación como sincronizada
   */
  async markAsSynced(conversationId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.runAsync(
        'UPDATE chat_conversations SET needsSync = 0, lastSync = ? WHERE id = ?',
        [Date.now(), conversationId]
      );
    } catch (error) {
      console.error('❌ Error marcando conversación como sincronizada:', error);
    }
  }

  /**
   * Obtiene conversaciones que necesitan sincronización
   */
  async getUnsyncedConversations(userId: string): Promise<ChatConversation[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const results = await this.db.getAllAsync<any>(
        'SELECT * FROM chat_conversations WHERE userId = ? AND needsSync = 1',
        [userId]
      );

      return results.map(row => this.mapRowToConversation(row));
    } catch (error) {
      console.error('❌ Error obteniendo conversaciones sin sincronizar:', error);
      return [];
    }
  }

  /**
   * Helper: convierte un row de SQLite a ChatConversation
   */
  private mapRowToConversation(row: any): ChatConversation {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      messages: JSON.parse(row.messages),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      expensesCount: row.expensesCount,
      needsSync: row.needsSync === 1,
      lastSync: row.lastSync,
    };
  }

  /**
   * Limpia toda la base de datos (solo para desarrollo)
   */
  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.runAsync('DELETE FROM chat_conversations');
      console.log('✅ Todas las conversaciones eliminadas');
    } catch (error) {
      console.error('❌ Error limpiando conversaciones:', error);
      throw error;
    }
  }
}

// Exportar instancia única
export const ChatHistoryService = new ChatHistoryServiceClass();
