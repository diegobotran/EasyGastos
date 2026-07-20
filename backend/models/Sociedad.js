/**
 * Modelo de MongoDB para Sociedades/Empresas
 * 
 * Mapea códigos de sociedad con NITs para facilitar:
 * - Asignación automática de NIT al usuario según su sociedad
 * - Filtrado de facturas SAT por NIT de la empresa
 * - Validación de datos empresariales
 */

const mongoose = require('mongoose');

const sociedadSchema = new mongoose.Schema({
  // Etiqueta corta visible; opcional para conservar documentos históricos.
  acronimo: {
    type: String,
    default: null,
    trim: true,
    maxlength: 15
  },

  // Código de sociedad (puede ser número o nombre)
  codigo: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true,
    uppercase: true, // Normalizar a mayúsculas
    trim: true,
    maxlength: 4,
    match: [/^\d+$/, 'El código de sociedad debe ser numérico']
  },
  
  // NIT de la sociedad/empresa
  nit: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true,
    uppercase: true, // Para NITs con letras como "820781K"
    trim: true,
    maxlength: 15
  },
  
  // Nombre completo de la sociedad (opcional, para display)
  nombre: { 
    type: String, 
    default: null 
  },
  
  // Razón social completa (opcional)
  razonSocial: { 
    type: String, 
    default: null 
  },
  
  // Estado activo/inactivo
  activa: { 
    type: Boolean, 
    default: true 
  },
  
  // Metadata adicional
  pais: { 
    type: String, 
    default: 'GT' 
  },
  
  // Configuración específica de la sociedad
  configuracion: {
    monedaPrincipal: { type: String, default: 'GTQ' },
    requiereAprobacion: { type: Boolean, default: true },
    limiteGastoSinAprobacion: { type: Number, default: 0 }
  },

  updatedBy: {
    type: String,
    default: null,
    trim: true,
    lowercase: true
  }
}, {
  timestamps: true,
  collection: 'sociedades'
});

// Índices para búsquedas eficientes
sociedadSchema.index({ activa: 1 });
sociedadSchema.index({ codigo: 1, activa: 1 });
sociedadSchema.index({ nit: 1, activa: 1 });

/**
 * Busca una sociedad por código
 */
sociedadSchema.statics.findByCodigo = function(codigo) {
  return this.findOne({ codigo: codigo.toString().toUpperCase(), activa: true });
};

/**
 * Busca una sociedad por NIT
 */
sociedadSchema.statics.findByNit = function(nit) {
  return this.findOne({ nit: nit.toString().toUpperCase(), activa: true });
};

/**
 * Obtiene el NIT de una sociedad por su código
 */
sociedadSchema.statics.getNitByCodigo = async function(codigo) {
  const sociedad = await this.findByCodigo(codigo);
  return sociedad ? sociedad.nit : null;
};

/**
 * Obtiene todas las sociedades activas
 */
sociedadSchema.statics.getActivas = function() {
  return this.find({ activa: true }).sort({ codigo: 1 });
};

const Sociedad = mongoose.models.Sociedad || mongoose.model('Sociedad', sociedadSchema);

module.exports = Sociedad;
