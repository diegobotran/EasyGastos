import { getAPI_BASE_URL } from '../config/backend';
import { Expense } from '../models/Expense';
import * as AuthService from './AuthService';
import { BackendSyncService } from './BackendSyncService';

export class ExpenseFiscalValidationError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ExpenseFiscalValidationError';
    this.code = code;
    this.details = details;
  }
}

const getToken = async () => {
  const existing = await AuthService.getToken();
  if (existing) return existing;
  const user = await AuthService.getLastLoggedInUser();
  const pin = await AuthService.getPIN();
  if (!user || !pin) throw new ExpenseFiscalValidationError('SAT_SESSION_MISSING', 'No existe una sesión activa.');
  const login = await BackendSyncService.loginAndGetToken(user.email, pin);
  if (!login.success || !login.token) {
    throw new ExpenseFiscalValidationError('SAT_REAUTH_FAILED', 'No se pudo validar la sesión contra el backend.');
  }
  return login.token;
};

export const validateExpenseFiscal = async (expense: Expense): Promise<Expense> => {
  const [baseUrl, token] = await Promise.all([getAPI_BASE_URL(), getToken()]);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/expenses/validate-fiscal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...expense, userEmail: expense.email }),
    });
  } catch {
    throw new ExpenseFiscalValidationError('FISCAL_NETWORK_ERROR', 'No fue posible ejecutar la validación fiscal antes de guardar.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    throw new ExpenseFiscalValidationError(
      payload.code || 'FISCAL_VALIDATION_ERROR',
      payload.error || 'El gasto no superó la validación fiscal.',
      payload.details,
    );
  }
  return { ...expense, ...payload.expense, email: expense.email };
};
