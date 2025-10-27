export const STATUSES = {
  BORRADOR: { code: 1, text: 'Borrador', color: '#475569', backgroundColor: '#f1f5f9' },
  ENVIADO_JEFE: { code: 2, text: 'Enviado al Jefe', color: '#d97706', backgroundColor: '#fef3c7' },
  APROBADO_JEFE: { code: 3, text: 'Aprobado por Jefe', color: '#2563eb', backgroundColor: '#dbeafe' },
  RECHAZADO_JEFE: { code: 4, text: 'Rechazado por Jefe', color: '#dc2626', backgroundColor: '#fee2e2' },
  APROBADO_FINANZAS: { code: 5, text: 'Aprobado por Finanzas', color: '#059669', backgroundColor: '#d1fae5' },
  RECHAZADO_FINANZAS: { code: 6, text: 'Rechazado por Finanzas', color: '#dc2626', backgroundColor: '#fee2e2' },
  CONTABILIZADO: { code: 7, text: 'Contabilizado en SAP', color: '#0d9488', backgroundColor: '#ccfbf1' },
  ERROR_SAP: { code: 8, text: 'Error en SAP', color: '#b91c1c', backgroundColor: '#fecaca' },
} as const;

// This creates a type from the keys of the STATUSES object, e.g., 'BORRADOR', 'ENVIADO_JEFE'
type StatusCode = keyof typeof STATUSES;

// Estados del gasto en el flujo de liquidación
export type ExpenseStatus = 'draft' | 'in_liquidation' | 'approved';

export interface Expense {
  id: string; // Will be a timestamp for uniqueness we need to review because the app will be in several device or uuid() that's unique
  description: string;
  amount: number;
  date: string; // We'll store as YYYY-MM-DD for sorting
  category: string;
  status: StatusCode;
  expenseStatus: ExpenseStatus;  // Estado en flujo de liquidación: draft, in_liquidation, approved
  supplier: string;
  vat_number: string;
  department: string;
  notes?: string;
  noinvoice: string;
  serie: string;
  centro: string;
  cuenta: string;
  ordenco: string;
  imageuri: string;  //path where the image is store locally in the device
  totiva: number;
  currency: string;
  email: string;
  managerEmail?: string;
  liquidationId?: string;  // ID de la liquidación a la que pertenece (si aplica)
  needsSync?: boolean;
  lastSync?: number;
  serverUpdatedAt?: number;
}

// Helper para obtener el texto del estado de liquidación
export function getExpenseStatusText(expenseStatus: ExpenseStatus): string {
  const statusTexts = {
    draft: 'Borrador',
    in_liquidation: 'En Liquidación',
    approved: 'Autorizado',
  };
  return statusTexts[expenseStatus];
}

// Helper para obtener el color del estado de liquidación
export function getExpenseStatusColor(expenseStatus: ExpenseStatus): string {
  const statusColors = {
    draft: '#64748b',       // Gris
    in_liquidation: '#3b82f6',  // Azul
    approved: '#10b981',    // Verde
  };
  return statusColors[expenseStatus];
}