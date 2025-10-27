const express = require('express');
const router = express.Router();
const ManagerEmployeeLink = require('../models/ManagerEmployeeLink');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireManager, canAccessUserData } = require('../middleware/auth');

/**
 * @route   GET /api/manager-links/employee/:email
 * @desc    Obtener todos los managers de un empleado
 * @access  Public
 */
router.get('/employee/:email', authenticateToken, canAccessUserData, async (req, res) => {
  try {
    const { email } = req.params;
    const managers = await ManagerEmployeeLink.getAllManagersOfEmployee(email);
    res.json(managers);
  } catch (error) {
    console.error('Error obteniendo managers del empleado:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   GET /api/manager-links/manager/:email
 * @desc    Obtener todos los empleados de un manager
 * @access  Public
 */
router.get('/manager/:email', authenticateToken, requireManager, async (req, res) => {
  try {
    const { email } = req.params;
    const employees = await ManagerEmployeeLink.getEmployeesOfManager(email);
    res.json(employees);
  } catch (error) {
    console.error('Error obteniendo empleados del manager:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   GET /api/manager-links/is-manager/:email
 * @desc    Verificar si un usuario es manager de alguien
 * @access  Private
 */
router.get('/is-manager/:email', authenticateToken, async (req, res) => {
  try {
    const { email } = req.params;
    
    // Verificar si este email aparece como managerEmail en alguna relación activa
    const count = await ManagerEmployeeLink.countDocuments({
      managerEmail: email,
      isActive: true
    });
    
    const isManager = count > 0;
    const employeeCount = count;
    
    res.json({ 
      isManager, 
      employeeCount,
      email 
    });
  } catch (error) {
    console.error('Error verificando si es manager:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   GET /api/manager-links/direct-manager/:email
 * @desc    Obtener el manager directo de un empleado
 * @access  Public
 */
router.get('/direct-manager/:email', authenticateToken, canAccessUserData, async (req, res) => {
  try {
    const { email } = req.params;
    const manager = await ManagerEmployeeLink.getDirectManager(email);
    res.json(manager);
  } catch (error) {
    console.error('Error obteniendo manager directo:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   GET /api/manager-links/department/:department
 * @desc    Obtener la jerarquía completa de un departamento
 * @access  Public
 */
router.get('/department/:department', authenticateToken, requireManager, async (req, res) => {
  try {
    const { department } = req.params;
    const hierarchy = await ManagerEmployeeLink.getDepartmentHierarchy(department);
    res.json(hierarchy);
  } catch (error) {
    console.error('Error obteniendo jerarquía del departamento:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   POST /api/manager-links
 * @desc    Crear una nueva relación manager-empleado
 * @access  Public
 */
router.post('/', authenticateToken, requireManager, [
  body('employeeEmail').isEmail().withMessage('Email del empleado inválido'),
  body('managerEmail').isEmail().withMessage('Email del manager inválido'),
  body('department').optional().isString(),
  body('level').optional().isInt({ min: 1 }).withMessage('Level debe ser un entero positivo'),
  body('assignedBy').optional().isEmail().withMessage('Email de quien asigna inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { employeeEmail, managerEmail, department, level = 1, assignedBy } = req.body;

    // Verificar que no se trate de autoasignarse
    if (employeeEmail === managerEmail) {
      return res.status(400).json({ error: 'Un empleado no puede ser su propio manager' });
    }

    // Crear la relación
    const managerLink = new ManagerEmployeeLink({
      employeeEmail,
      managerEmail,
      department,
      level,
      assignedBy
    });

    await managerLink.save();
    res.status(201).json(managerLink);
  } catch (error) {
    if (error.code === 11000) {
      // Error de duplicado
      return res.status(400).json({ error: 'Esta relación manager-empleado ya existe' });
    }
    console.error('Error creando relación manager-empleado:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   PUT /api/manager-links/:id
 * @desc    Actualizar una relación manager-empleado
 * @access  Public
 */
router.put('/:id', authenticateToken, requireManager, [
  body('department').optional().isString(),
  body('level').optional().isInt({ min: 1 }),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updates = req.body;

    const managerLink = await ManagerEmployeeLink.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!managerLink) {
      return res.status(404).json({ error: 'Relación manager-empleado no encontrada' });
    }

    res.json(managerLink);
  } catch (error) {
    console.error('Error actualizando relación manager-empleado:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   DELETE /api/manager-links/:id
 * @desc    Desactivar una relación manager-empleado (soft delete)
 * @access  Public
 */
router.delete('/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    const { id } = req.params;
    
    const managerLink = await ManagerEmployeeLink.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!managerLink) {
      return res.status(404).json({ error: 'Relación manager-empleado no encontrada' });
    }

    res.json({ message: 'Relación desactivada correctamente', managerLink });
  } catch (error) {
    console.error('Error desactivando relación manager-empleado:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * @route   POST /api/manager-links/bulk-assign
 * @desc    Asignar múltiples empleados a un manager
 * @access  Public
 */
router.post('/bulk-assign', authenticateToken, requireManager, [
  body('employeeEmails').isArray().withMessage('employeeEmails debe ser un array'),
  body('employeeEmails.*').isEmail().withMessage('Todos los emails de empleados deben ser válidos'),
  body('managerEmail').isEmail().withMessage('Email del manager inválido'),
  body('department').optional().isString(),
  body('level').optional().isInt({ min: 1 }),
  body('assignedBy').optional().isEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { employeeEmails, managerEmail, department, level = 1, assignedBy } = req.body;

    const createdLinks = [];
    const errors_links = [];

    for (const employeeEmail of employeeEmails) {
      try {
        if (employeeEmail === managerEmail) {
          errors_links.push({ employeeEmail, error: 'Un empleado no puede ser su propio manager' });
          continue;
        }

        const managerLink = new ManagerEmployeeLink({
          employeeEmail,
          managerEmail,
          department,
          level,
          assignedBy
        });

        await managerLink.save();
        createdLinks.push(managerLink);
      } catch (error) {
        if (error.code === 11000) {
          errors_links.push({ employeeEmail, error: 'Relación ya existe' });
        } else {
          errors_links.push({ employeeEmail, error: error.message });
        }
      }
    }

    res.status(201).json({
      message: `${createdLinks.length} relaciones creadas exitosamente`,
      created: createdLinks,
      errors: errors_links
    });
  } catch (error) {
    console.error('Error en asignación masiva:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;