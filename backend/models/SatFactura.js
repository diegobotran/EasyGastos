/**
 * Modelo de MongoDB para facturas SAT (Sistema de Administración Tributaria)
 * 
 * Este modelo almacena información de facturas electrónicas guatemaltecas (FEL)
 * provenientes de archivos Excel generados por el sistema SAT.
 */

const mongoose = require('mongoose');

const satFacturaSchema = new mongoose.Schema({
  // Campos principales de identificación
  fechaEmision: { type: Date, required: true, index: true },
  numeroAutorizacion: { type: String, required: true, unique: true, index: true },
  tipoDTE: { type: String, required: true },  // Tipo de DTE (nombre)
  serie: { type: String, required: true },
  numeroDTE: { type: String, required: true },
  
  // Información del emisor
  nitEmisor: { type: String, required: true, index: true },  // NIT del emisor
  nombreEmisor: { type: String, required: true },  // Nombre completo del emisor
  clasificacionEmisor: { type: String },  // Clasificación emisor
  codigoEstablecimiento: { type: String },  // Código de establecimiento
  nombreEstablecimiento: { type: String },  // Nombre del establecimiento
  
  // Información del receptor (la empresa)
  idReceptor: { type: String, required: true, index: true },  // ID del receptor
  nombreReceptor: { type: String, required: true },  // Nombre completo del receptor
  
  // Información del certificador
  nitCertificador: { type: String },  // NIT del Certificador
  nombreCertificador: { type: String },  // Nombre completo del Certificador
  
  // Código de sociedad (extraído del nombre del archivo)
  codigoSociedad: { type: String, index: true },
  
  // Estado y control
  estado: { type: String },  // Estado
  marcaAnulado: { type: String },  // Marca de anulado
  fechaAnulacion: { type: Date },  // Fecha de anulación
  exportacion: { type: String },  // Exportación
  ubicacionTemporal: { type: String },  // Ubicación temporal
  
  // Montos principales
  moneda: { type: String },  // Moneda
  granTotal: { type: Number, required: true },  // Gran Total (Moneda Original)
  iva: { type: Number, default: 0 },  // IVA (monto de este impuesto)
  
  // Impuestos específicos (montos de estos impuestos)
  impuestoPetroleo: { type: Number, default: 0 },  // Petróleo
  impuestoTurismoHospedaje: { type: Number, default: 0 },  // Turismo Hospedaje
  impuestoTurismoPasajes: { type: Number, default: 0 },  // Turismo Pasajes
  impuestoTimbrePrensa: { type: Number, default: 0 },  // Timbre de Prensa
  impuestoBomberos: { type: Number, default: 0 },  // Bomberos
  impuestoTasaMunicipal: { type: Number, default: 0 },  // Tasa Municipal
  impuestoBebidasAlcoholicas: { type: Number, default: 0 },  // Bebidas alcohólicas
  impuestoTabaco: { type: Number, default: 0 },  // Tabaco
  impuestoCemento: { type: Number, default: 0 },  // Cemento
  impuestoBebidasNoAlcoholicas: { type: Number, default: 0 },  // Bebidas no Alcohólicas
  impuestoTarifaPortuaria: { type: Number, default: 0 },  // Tarifa Portuaria
  
  // Metadata de importación
  archivoOrigen: { type: String, required: true },
  fechaImportacion: { type: Date, default: Date.now },
  hashArchivo: { type: String, required: true },
}, {
  timestamps: true,
  collection: 'sat_facturas'
});

// Índices compuestos para búsquedas eficientes
satFacturaSchema.index({ idReceptor: 1, fechaEmision: -1 });
satFacturaSchema.index({ nitEmisor: 1, fechaEmision: -1 });
satFacturaSchema.index({ codigoSociedad: 1, fechaEmision: -1 });
satFacturaSchema.index({ serie: 1, numeroDTE: 1, idReceptor: 1 }); // Búsqueda por serie + numero + sociedad
satFacturaSchema.index({ serie: 1, numeroDTE: 1, codigoSociedad: 1 }); // Búsqueda alternativa
satFacturaSchema.index({ archivoOrigen: 1 });
satFacturaSchema.index({ hashArchivo: 1 });
satFacturaSchema.index({ estado: 1 });
satFacturaSchema.index({ marcaAnulado: 1 });

const SatFactura = mongoose.model('SatFactura', satFacturaSchema);

module.exports = SatFactura;
