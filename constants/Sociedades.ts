/**
 * Constantes de códigos de sociedades con sus NITs
 * 
 * IMPORTANTE: Los NITs deben coincidir con el campo 'idReceptor' 
 * de las facturas SAT importadas para poder verificarlas automáticamente.
 * 
 * Datos sincronizados con la colección 'sociedades' en MongoDB
 */

export interface Sociedad {
  code: string;
  label: string;
  nit: string; // NIT de la sociedad (debe coincidir con idReceptor en facturas SAT)
  nombre: string; // Nombre completo de la sociedad
}

export const SOCIEDADES: Sociedad[] = [
  { code: '500', label: '500', nit: '46210555', nombre: 'Sociedad 500' },
  { code: '510', label: '510', nit: '47324929', nombre: 'Sociedad 510' },
  { code: '520', label: '520', nit: '82937877', nombre: 'Sociedad 520' },
  { code: '1000', label: '1000', nit: '336963', nombre: 'Sociedad 1000' },
  { code: '2000', label: '2000', nit: '2291', nombre: 'Sociedad 2000' },
  { code: '3000', label: '3000', nit: '343862', nombre: 'Sociedad 3000' },
  { code: '3100', label: '3100', nit: '322482', nombre: 'Sociedad 3100' },
  { code: '3200', label: '3200', nit: '323012', nombre: 'Sociedad 3200' },
  { code: '3300', label: '3300', nit: '322369', nombre: 'Sociedad 3300' },
  { code: '4000', label: '4000', nit: '345377', nombre: 'Sociedad 4000' },
  { code: '4100', label: '4100', nit: '3881830', nombre: 'Sociedad 4100' },
  { code: '5000', label: '5000', nit: '792500', nombre: 'Sociedad 5000' },
  { code: '5400', label: '5400', nit: '41182901', nombre: 'Sociedad 5400' },
  { code: '5700', label: '5700', nit: '581100', nombre: 'Sociedad 5700' },
  { code: '5800', label: '5800', nit: '5298288', nombre: 'Sociedad 5800' },
  { code: '5900', label: '5900', nit: '120294923', nombre: 'Sociedad 5900' },
  { code: '7100', label: '7100', nit: '7004966', nombre: 'Sociedad 7100' },
  { code: '7200', label: '7200', nit: '1430114', nombre: 'Sociedad 7200' },
  { code: '7300', label: '7300', nit: '1688804', nombre: 'Sociedad 7300' },
  { code: '7700', label: '7700', nit: '110867505', nombre: 'Sociedad 7700' },
  { code: 'AGRICOLA', label: 'AGRICOLA', nit: '79759238', nombre: 'Agrícola' },
  { code: 'ATESA', label: 'ATESA', nit: '820781K', nombre: 'ATESA' },
  { code: 'BLSA', label: 'BLSA', nit: '60969865', nombre: 'BLSA' },
  { code: 'BYSA', label: 'BYSA', nit: '60969660', nombre: 'BYSA' },
  { code: 'LOMAS', label: 'LOMAS', nit: '118469967', nombre: 'Lomas' },
];

/**
 * Obtiene el NIT de una sociedad por su código
 */
export const getNitBySociedadCode = (code: string): string | null => {
  const sociedad = SOCIEDADES.find(s => s.code.toUpperCase() === code.toUpperCase());
  return sociedad?.nit || null;
};

/**
 * Obtiene una sociedad por su NIT
 */
export const getSociedadByNit = (nit: string): Sociedad | null => {
  return SOCIEDADES.find(s => s.nit.toUpperCase() === nit.toUpperCase()) || null;
};

/**
 * Obtiene una sociedad por su código
 */
export const getSociedadByCode = (code: string): Sociedad | null => {
  return SOCIEDADES.find(s => s.code.toUpperCase() === code.toUpperCase()) || null;
};
