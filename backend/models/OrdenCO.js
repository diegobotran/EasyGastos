const mongoose = require('mongoose');

const ordenCOSchema = new mongoose.Schema({
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
    match: [/^\d+$/, 'El código de orden CO debe ser numérico']
  },
  activo: { type: Boolean, default: true, index: true },
  updatedBy: { type: String, default: null, trim: true, lowercase: true }
}, {
  timestamps: true,
  collection: 'ordenes_co'
});

ordenCOSchema.index({ codigo: 1, activo: 1 });

module.exports = mongoose.models.OrdenCO || mongoose.model('OrdenCO', ordenCOSchema);
