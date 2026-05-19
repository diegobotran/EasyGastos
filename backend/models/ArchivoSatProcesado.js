/**
 * Modelo para rastrear archivos SAT ya procesados
 * Previene la reimportación de archivos duplicados
 */

const mongoose = require('mongoose');

const archivoSatProcesadoSchema = new mongoose.Schema({
  nombreArchivo: { type: String, required: true, unique: true, index: true },
  fechaProcesamiento: { type: Date, default: Date.now },
  hash: { type: String, required: true },
  
  // Estadísticas del procesamiento
  cantidadFacturas: { type: Number, default: 0 },
  insertadas: { type: Number, default: 0 },
  actualizadas: { type: Number, default: 0 },
  errores: { type: Number, default: 0 },
  
  // Información de las sociedades (NITs receptores) en este archivo
  sociedades: [{ type: String }],
  
  // Información del procesamiento
  procesadoPor: { type: String, default: 'API' }, // 'API' o 'Script'
  usuarioEmail: { type: String }, // Email del usuario que ejecutó la importación
}, {
  timestamps: true,
  collection: 'sat_archivos_procesados'
});

const ArchivoSatProcesado = mongoose.model('ArchivoSatProcesado', archivoSatProcesadoSchema);

module.exports = ArchivoSatProcesado;
