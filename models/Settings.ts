/**
 * Modelo de configuración de la aplicación
 */

export interface AppSettings {
  maxExpenseAmount: number;  // Monto máximo permitido por gasto individual (default: 3500)
  temporarySociedad: string | null;  // Sociedad temporal para reportar gastos
  // Futuras configuraciones pueden agregarse aquí
}

// Valores por defecto
export const DEFAULT_SETTINGS: AppSettings = {
  maxExpenseAmount: 3500.00,
  temporarySociedad: null,
};

// Validaciones
export const SETTINGS_CONSTRAINTS = {
  maxExpenseAmount: {
    min: 1,
    max: 100000,
    default: 3500,
  },
};

/**
 * Valida que un monto esté dentro del límite configurado
 */
export function isExpenseAmountValid(amount: number, maxExpenseAmount: number): boolean {
  return amount > 0 && amount <= maxExpenseAmount;
}

/**
 * Obtiene el mensaje de error para monto inválido
 */
export function getExpenseAmountErrorMessage(amount: number, maxExpenseAmount: number): string {
  if (amount <= 0) {
    return 'El monto debe ser mayor a Q0.00';
  }
  if (amount > maxExpenseAmount) {
    return `El monto no puede exceder Q${maxExpenseAmount.toFixed(2)}. Si necesitas un gasto mayor, divídelo en múltiples gastos.`;
  }
  return '';
}
