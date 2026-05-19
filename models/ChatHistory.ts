/**
 * Modelo de Historial de Chat con IA
 * 
 * Almacena conversaciones del usuario con el asistente de gastos
 */

export interface ChatMessage {
  id: string;                   // ID único del mensaje
  type: 'user' | 'assistant';   // Tipo de mensaje
  text: string;                 // Contenido del mensaje
  timestamp: string;            // Fecha en formato ISO
}

export interface ChatConversation {
  id: string;                   // ID único de la conversación (timestamp)
  userId: string;               // Email del usuario
  title: string;                // Título generado automáticamente
  messages: ChatMessage[];      // Array de mensajes
  createdAt: string;            // Fecha de creación (ISO)
  updatedAt: string;            // Última actualización (ISO)
  expensesCount?: number;       // Número de gastos en contexto
  needsSync?: boolean;          // Si necesita sincronizar con backend
  lastSync?: number;            // Timestamp de última sincronización
}

/**
 * DTO para crear una nueva conversación
 */
export interface CreateConversationDTO {
  userId: string;
  title?: string;
  messages?: ChatMessage[];
}

/**
 * Genera un título automático basado en la primera pregunta del usuario
 */
export function generateConversationTitle(firstUserMessage: string): string {
  if (!firstUserMessage) return 'Nueva conversación';
  
  // Tomar primeras 50 caracteres
  const title = firstUserMessage.substring(0, 50);
  return title.length < firstUserMessage.length ? `${title}...` : title;
}

/**
 * Agrupa conversaciones por fecha
 */
export interface GroupedConversations {
  today: ChatConversation[];
  yesterday: ChatConversation[];
  thisWeek: ChatConversation[];
  older: ChatConversation[];
}

export function groupConversationsByDate(conversations: ChatConversation[]): GroupedConversations {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const grouped: GroupedConversations = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  };

  conversations.forEach(conv => {
    const convDate = new Date(conv.updatedAt);
    
    if (convDate >= today) {
      grouped.today.push(conv);
    } else if (convDate >= yesterday) {
      grouped.yesterday.push(conv);
    } else if (convDate >= weekAgo) {
      grouped.thisWeek.push(conv);
    } else {
      grouped.older.push(conv);
    }
  });

  return grouped;
}
