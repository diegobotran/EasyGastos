const mongoose = require('mongoose');

const systemParameterSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
    uppercase: true
  },
  name: { type: String, required: true, trim: true },
  value: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isInteger
  },
  active: { type: Boolean, default: true, index: true },
  updatedBy: { type: String, default: null, trim: true, lowercase: true }
}, {
  timestamps: true,
  collection: 'system_parameters'
});

module.exports = mongoose.models.SystemParameter || mongoose.model(
  'SystemParameter',
  systemParameterSchema
);
