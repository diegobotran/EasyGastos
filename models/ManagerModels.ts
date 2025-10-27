export interface PendingExpense {
  id: string;
  userEmail: string;
  userName?: string;
  description: string;
  amount: number;
  date: Date;
  category: string;
  status: 'ENVIADO_JEFE' | 'APROBADO_JEFE' | 'RECHAZADO_JEFE';
  supplier?: string;
  department?: string;
  notes?: string;
  currency?: string;
  totalIva?: number;
  centro?: string;
  cuenta?: string;
  ordenco?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ApprovalAction {
  expenseId: string;
  approve: boolean;
  managerEmail: string;
  comments?: string;
}

export interface ManagerSummary {
  pendingCount: number;
  totalAmount: number;
  employeeCount: number;
  departmentName?: string;
}