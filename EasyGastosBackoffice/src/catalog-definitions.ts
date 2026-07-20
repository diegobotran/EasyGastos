import type { CatalogDefinition } from './types/catalogs';

export const catalogDefinitions: Record<string, CatalogDefinition> = {
  sociedades: {
    key: 'sociedades',
    title: 'Sociedad – NIT',
    description: 'Relaciones fiscales oficiales utilizadas para validar el receptor de cada factura.',
    singular: 'Sociedad',
    activeField: 'activa',
    fields: [
      { key: 'acronimo', label: 'Acrónimo', maxLength: 15, placeholder: 'Etiqueta corta' },
      { key: 'codigo', label: 'Código', required: true, maxLength: 4, placeholder: '1000' },
      { key: 'nit', label: 'NIT', required: true, maxLength: 15, placeholder: '336963' },
      { key: 'razonSocial', label: 'Razón social', maxLength: 160, placeholder: 'Nombre legal de la sociedad' }
    ]
  },
  centros: {
    key: 'centros',
    title: 'Centros',
    description: 'Centros de costo disponibles y usuario activo responsable de cada uno.',
    singular: 'Centro',
    activeField: 'activo',
    fields: [
      { key: 'acronimo', label: 'Acrónimo', required: true, maxLength: 15 },
      { key: 'codigo', label: 'Código', required: true, maxLength: 10, placeholder: '50004' },
      { key: 'ownerEmail', label: 'Correo del propietario', required: true, type: 'email', placeholder: 'usuario@empresa.com' }
    ]
  },
  cuentas: {
    key: 'cuentas',
    title: 'Cuentas',
    description: 'Cuentas contables autorizadas para clasificar los gastos.',
    singular: 'Cuenta',
    activeField: 'activo',
    fields: [
      { key: 'acronimo', label: 'Acrónimo', required: true, maxLength: 15 },
      { key: 'codigo', label: 'Código', required: true, maxLength: 10, placeholder: '71311901' }
    ]
  },
  'ordenes-co': {
    key: 'ordenes-co',
    title: 'Órdenes CO',
    description: 'Órdenes internas disponibles para la imputación contable.',
    singular: 'Orden CO',
    activeField: 'activo',
    fields: [
      { key: 'acronimo', label: 'Acrónimo', required: true, maxLength: 15 },
      { key: 'codigo', label: 'Código', required: true, maxLength: 10, placeholder: '2000001667' }
    ]
  }
};
