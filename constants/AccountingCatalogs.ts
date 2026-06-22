export const SOCIEDAD_OPTIONS = ['4000', '4500', '5000', '7000'] as const;

export const CENTRO_OPTIONS = ['50004'] as const;

export const CUENTA_OPTIONS = [
  '71311901',
  '71311501',
  '71311401',
  '71310503',
] as const;

export const ORDENCO_OPTIONS = [
  '2000001667',
  '2000000282',
  '2000000283',
  '2000000062',
  '2000001669',
  '2000001670',
  '2000001640',
] as const;

export const ACCOUNTING_CATALOG_ROWS = [
  { tipoGasto: 'PAPELERIA Y UTILES', cuenta: '71311901', centro: '50004', ordenco: '2000001667' },
  { tipoGasto: 'GASOLINA Y PARQUEOS', cuenta: '71311501', centro: '50004', ordenco: '2000000282' },
  { tipoGasto: 'PEAJE', cuenta: '71311501', centro: '50004', ordenco: '2000000283' },
  { tipoGasto: 'HOSPEDAJE', cuenta: '71311401', centro: '50004', ordenco: '2000001669' },
  { tipoGasto: 'ALIMENTACIÓN', cuenta: '71310503', centro: '50004', ordenco: '2000001670' },
  { tipoGasto: 'ACCESORIOS DE COMPUTACIÓN', cuenta: '71310503', centro: '50004', ordenco: '2000001640' },
] as const;
