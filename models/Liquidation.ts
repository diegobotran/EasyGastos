/**
 * Modelo de Liquidación
 * 
 * Representa una liquidación de gastos que agrupa múltiples gastos
 * para enviar a aprobación del jefe
 */

export interface Liquidation {
  id: string;                    // ID único de la liquidación (timestamp)
  userId: string;                // Email del usuario que crea la liquidación
  employeeName: string;          // Nombre del empleado
  sociedad: string;              // Sociedad explícita de la liquidación
  createdDate: string;           // Fecha de creación en formato YYYY-MM-DD (almacenamiento) - se muestra como DD/MM/YYYY
  expenseIds: string[];          // IDs de los gastos incluidos
  totalAmount: number;           // Monto total de todos los gastos
  currency?: string;             // Moneda de referencia de la liquidación
  status: LiquidationStatus;     // Estado actual
  managerEmail?: string;         // Email del jefe asignado (opcional)
  managerComments?: string;      // Comentarios del jefe (opcional)
  submittedDate?: string;        // Fecha de envío en formato YYYY-MM-DD (almacenamiento) - se muestra como DD/MM/YYYY
  approvedDate?: string;         // Fecha de aprobación en formato YYYY-MM-DD (almacenamiento) - se muestra como DD/MM/YYYY
  rejectedDate?: string;         // Fecha de rechazo en formato YYYY-MM-DD (almacenamiento) - se muestra como DD/MM/YYYY
  approverEmail?: string;        // Email del aprobador (tracking)
  rejectedBy?: string;           // Email del rechazador (tracking)
  csvGeneratedAt?: string;       // Fecha de generación de CSV
  csvGeneratedBy?: string;       // Usuario que generó el CSV
  sapDocNumber?: string;         // Número de documento SAP (opcional, para exportación)
  sapSyncStatus?: string;        // Estado de sincronización SAP
  sapReferenceId?: string;       // Identificador devuelto por SAP
  sapResponseMessage?: string;   // Mensaje devuelto por SAP
  sapSyncedAt?: string;          // Fecha/hora de sincronización SAP
  approverName?: string;         // Nombre del aprobador (opcional)
  comments?: string;             // Comentarios adicionales (opcional)
  createdAt?: number;            // Timestamp de creación de la liquidación
  updatedAt?: number;            // Timestamp de última actualización
}

/**
 * Estados posibles de una liquidación:
 * - draft: Borrador, usuario puede modificar
 * - submitted: Enviada al jefe, usuario NO puede modificar
 * - approved: Aprobada por el jefe, se puede generar CSV
 * - rejected: Rechazada por el jefe, usuario puede revisar y reenviar
 * - fiscal_blocked: Bloqueada antes de SAP por vencimiento fiscal
 */
export type LiquidationStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'fiscal_blocked';

/**
 * DTO para crear una nueva liquidación
 */
export interface CreateLiquidationDTO {
  userId: string;
  employeeName: string;
  sociedad: string;
  currency: string;
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
    case 'fiscal_blocked':
      return 'Bloqueada Fiscalmente';
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
    case 'fiscal_blocked':
      return '#B91C1C'; // Rojo oscuro
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
