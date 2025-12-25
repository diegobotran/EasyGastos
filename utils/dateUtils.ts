/**
 * Utilidades para manejo de fechas en formato español
 */

/**
 * Convierte una fecha en formato YYYY-MM-DD a DD/MM/YYYY
 * @param dateString Fecha en formato YYYY-MM-DD
 * @returns Fecha en formato DD/MM/YYYY
 */
export function formatDateToSpanish(dateString: string): string {
  if (!dateString) return '';
  
  // Si ya viene en formato DD/MM/YYYY, devolverlo tal cual
  if (dateString.includes('/')) {
    return dateString;
  }
  
  // Convertir de YYYY-MM-DD a DD/MM/YYYY
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Convierte una fecha en formato DD/MM/YYYY a YYYY-MM-DD para almacenamiento
 * @param dateString Fecha en formato DD/MM/YYYY
 * @returns Fecha en formato YYYY-MM-DD
 */
export function formatDateToISO(dateString: string): string {
  if (!dateString) return '';
  
  // Si ya viene en formato YYYY-MM-DD, devolverlo tal cual
  if (dateString.includes('-') && dateString.indexOf('-') === 4) {
    return dateString;
  }
  
  // Convertir de DD/MM/YYYY a YYYY-MM-DD
  const [day, month, year] = dateString.split('/');
  return `${year}-${month}-${day}`;
}

/**
 * Convierte un timestamp a formato DD/MM/YYYY HH:mm
 * @param timestamp Timestamp en milisegundos
 * @returns Fecha formateada en español
 */
export function formatTimestampToSpanish(timestamp: number): string {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Convierte un timestamp a formato DD/MM/YYYY (solo fecha)
 * @param timestamp Timestamp en milisegundos
 * @returns Fecha formateada en español sin hora
 */
export function formatTimestampToDateOnly(timestamp: number): string {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Obtiene la fecha actual en formato DD/MM/YYYY
 * @returns Fecha actual en formato español
 */
export function getCurrentDateSpanish(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD
 * @returns Fecha actual en formato ISO
 */
export function getCurrentDateISO(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  
  return `${year}-${month}-${day}`;
}
