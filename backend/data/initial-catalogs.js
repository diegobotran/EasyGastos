const societies = [
  ['500', '46210555'], ['510', '47324929'], ['520', '82937877'],
  ['1000', '336963'], ['2000', '2291'], ['3000', '343862'],
  ['3100', '322482'], ['3200', '323012'], ['3300', '322369'],
  ['4000', '345377'], ['4100', '3881830'], ['5000', '792500'],
  ['5400', '41182901'], ['5700', '581100'], ['5800', '5298288'],
  ['5900', '120294923'], ['7100', '7004966'], ['7200', '1430114'],
  ['7300', '1688804'], ['7700', '110867505']
].map(([codigo, nit]) => ({
  acronimo: codigo,
  codigo,
  nit,
  nombre: `Sociedad ${codigo}`,
  activa: true,
  pais: 'GT'
}));

const accounts = ['71311901', '71311501', '71311401', '71310503'];
const orders = [
  '2000001667', '2000000282', '2000000283', '2000000062',
  '2000001669', '2000001670', '2000001640'
];

const sourceConflicts = [
  ...['AGRICOLA', 'ATESA', 'BLSA', 'BYSA', 'LOMAS'].map(codigo => ({
    catalog: 'sociedades',
    codigo,
    reason: 'El valor histórico es un acrónimo; el código de sociedad debe ser numérico.'
  })),
  ...['4500', '7000'].map(codigo => ({
    catalog: 'sociedades',
    codigo,
    reason: 'La opción contable histórica no tiene un NIT de sociedad asociado.'
  }))
];

const buildInitialCatalogs = (centerOwner = 'manager@ronesdeguatemala.com') => ({
  sociedades: societies,
  centros: [{
    acronimo: '50004',
    codigo: '50004',
    ownerEmail: centerOwner.trim().toLowerCase(),
    activo: true
  }],
  cuentas: accounts.map(codigo => ({ acronimo: codigo, codigo, activo: true })),
  ordenesCO: orders.map(codigo => ({ acronimo: codigo, codigo, activo: true })),
  sourceConflicts
});

module.exports = { buildInitialCatalogs };
