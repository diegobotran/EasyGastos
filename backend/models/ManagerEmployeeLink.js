const mongoose = require('mongoose');

/**
 * Esquema para gestionar las relaciones jerárquicas entre managers y empleados
 * Permite tener múltiples niveles de jerarquía y un empleado puede tener múltiples managers
 */
const managerEmployeeLinkSchema = new mongoose.Schema({
  employeeEmail: {
    type: String,
    required: true,
    index: true
  },
  managerEmail: {
    type: String,
    required: true,
    index: true
  },
  department: {
    type: String,
    required: false
  },
  level: {
    type: Number,
    default: 1, // 1 = manager directo, 2 = manager del manager, etc.
    min: 1
  },
  isActive: {
    type: Boolean,
    default: true
  },
  assignedAt: {
    type: Date,
    default: Date.now
  },
  assignedBy: {
    type: String, // Email de quien asignó esta relación
    required: false
  }
}, {
  timestamps: true
});

// Índice compuesto para evitar duplicados
managerEmployeeLinkSchema.index({ employeeEmail: 1, managerEmail: 1 }, { unique: true });

// Índice para búsquedas rápidas por department
managerEmployeeLinkSchema.index({ department: 1, isActive: 1 });

/**
 * Métodos estáticos útiles
 */
managerEmployeeLinkSchema.statics.getDirectManager = async function(employeeEmail) {
  return await this.findOne({
    employeeEmail,
    level: 1,
    isActive: true
  });
};

managerEmployeeLinkSchema.statics.getEmployeesOfManager = async function(managerEmail) {
  return await this.find({
    managerEmail,
    isActive: true
  }).sort({ employeeEmail: 1 });
};

managerEmployeeLinkSchema.statics.getAllManagersOfEmployee = async function(employeeEmail) {
  return await this.find({
    employeeEmail,
    isActive: true
  }).sort({ level: 1 });
};

managerEmployeeLinkSchema.statics.getDepartmentHierarchy = async function(department) {
  return await this.find({
    department,
    isActive: true
  }).sort({ level: 1, employeeEmail: 1 });
};

module.exports = mongoose.model('ManagerEmployeeLink', managerEmployeeLinkSchema);