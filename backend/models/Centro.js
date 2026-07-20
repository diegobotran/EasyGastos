const mongoose = require('mongoose');

const centroSchema = new mongoose.Schema({
  acronimo: {
    type: String,
    required: true,
    trim: true,
    maxlength: 15
  },
  codigo: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
    uppercase: true,
    maxlength: 10,
    match: [/^\d+$/, 'El código de centro debe ser numérico']
  },
  ownerEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  activo: { type: Boolean, default: true, index: true },
  updatedBy: { type: String, default: null, trim: true, lowercase: true }
}, {
  timestamps: true,
  collection: 'centros'
});

centroSchema.index({ codigo: 1, activo: 1 });

module.exports = mongoose.models.Centro || mongoose.model('Centro', centroSchema);
