/**
 * Modelo de Liquidación
 * 
 * Representa una liquidación de gastos que agrupa múltiples gastos
 * para enviar a aprobación del jefe
 */

export interface Liquidation {
  id: string;                    // ID único de la liquidación
  userId: string;                // Email del usuario que crea la liquidación
  employeeName: string;          // Nombre del empleado
  createdDate: string;           // Fecha de creación (YYYY-MM-DD)
  expenseIds: string[];          // IDs de los gastos incluidos
  totalAmount: number;           // Monto total de todos los gastos
  status: LiquidationStatus;     // Estado actual
  managerComments?: string;      // Comentarios del jefe (opcional)
  submittedDate?: string;        // Fecha de envío al jefe (opcional)
  approvedDate?: string;         // Fecha de aprobación (opcional)
  rejectedDate?: string;         // Fecha de rechazo (opcional)
}

/**
 * Estados posibles de una liquidación:
 * - draft: Borrador, usuario puede modificar
 * - submitted: Enviada al jefe, usuario NO puede modificar
 * - approved: Aprobada por el jefe, se puede generar CSV
 * - rejected: Rechazada por el jefe, usuario puede revisar y reenviar
 */
export type LiquidationStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

/**
 * DTO para crear una nueva liquidación
 */
export interface CreateLiquidationDTO {
  userId: string;
  employeeName: string;
  expenseIds: string[];
}

/**
 * DTO para actualizar el estado de una liquidación
 */
export interface UpdateLiquidationStatusDTO {
  status: LiquidationStatus;
  managerComments?: string;
}

/**
 * Helper para obtener el nombre del estado en español
 */
export const getLiquidationStatusText = (status: LiquidationStatus): string => {
  switch (status) {
    case 'draft':
      return 'Borrador';
    case 'submitted':
      return 'En Revisión';
    case 'approved':
      return 'Aprobada';
    case 'rejected':
      return 'Rechazada';
    default:
      return 'Desconocido';
  }
};

/**
 * Helper para obtener el color del estado
 */
export const getLiquidationStatusColor = (status: LiquidationStatus): string => {
  switch (status) {
    case 'draft':
      return '#FFA500'; // Naranja
    case 'submitted':
      return '#2196F3'; // Azul
    case 'approved':
      return '#4CAF50'; // Verde
    case 'rejected':
      return '#F44336'; // Rojo
    default:
      return '#999999'; // Gris
  }
};

/**
 * Helper para verificar si una liquidación puede ser editada
 */
export const canEditLiquidation = (status: LiquidationStatus): boolean => {
  return status === 'draft' || status === 'rejected';
};

/**
 * Helper para verificar si una liquidación puede ser enviada
 */
export const canSubmitLiquidation = (status: LiquidationStatus): boolean => {
  return status === 'draft' || status === 'rejected';
};

/**
 * Helper para verificar si se puede generar CSV
 */
export const canGenerateCSV = (status: LiquidationStatus): boolean => {
  return status === 'approved';
};
