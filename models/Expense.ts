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

export interface Expense {
  id: string; // Will be a timestamp for uniqueness we need to review because the app will be in several device or uuid() that's unique
  description: string;
  amount: number;
  date: string; // We'll store as YYYY-MM-DD for sorting
  category: string;
  status: StatusCode;
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
  needsSync?: boolean;
  lastSync?: number;
  serverUpdatedAt?: number;
}