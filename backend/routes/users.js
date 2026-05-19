const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const { models } = require('../database/init');
const { authenticateToken, generateToken, canAccessUserData, optionalAuth, requireManager } = require('../middleware/auth');
const ManagerEmployeeLink = require('../models/ManagerEmployeeLink');
const Sociedad = require('../models/Sociedad');
const router = express.Router();

const { User, SyncLog } = models;

// Middleware para validar datos de entrada
const validateUserRegistration = [
  body('email').isEmail().normalizeEmail(),
  body('firstName').trim().isLength({ min: 1 }).escape(),
  body('lastName').trim().isLength({ min: 1 }).escape(),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric(),
  body('employeeCode').optional().trim().escape(),
  body('department').optional().trim().escape(),
  body('sociedad').optional().trim().escape()
];

const validateUserProfile = [
  body('email').isEmail().normalizeEmail(),
  body('firstName').trim().isLength({ min: 1 }).escape(),
  body('lastName').trim().isLength({ min: 1 }).escape(),
  body('department').optional().trim().escape()
];

// Registrar nuevo usuario O actualizar usuario existente
router.post('/register', validateUserRegistration, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, firstName, lastName, pin, employeeCode, department, sociedad } = req.body;

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email });
    
    // Encriptar PIN (se hará después de validar)
    // const hashedPin = await bcrypt.hash(pin, 10);

    if (existingUser) {
      // ===== USUARIO EXISTE: VERIFICAR PIN ANTES DE ACTUALIZAR =====
      console.log(`🔍 Usuario ${email} ya existe - Verificando PIN...`);
      
      // Verificar si el PIN enviado coincide con el PIN existente
      const pinMatch = await bcrypt.compare(pin, existingUser.pin);
      
      if (!pinMatch) {
        // ⚠️ PIN DIFERENTE - Posible nuevo registro en otro dispositivo o PIN olvidado
        console.log(`⚠️ Usuario ${email} intenta registrar con PIN DIFERENTE`);
        
        return res.status(409).json({
          error: 'Usuario ya registrado con otro PIN',
          code: 'PIN_MISMATCH',
          message: 'Este correo ya está registrado. Si olvidaste tu PIN, contacta al administrador.',
          suggestion: 'Intenta con tu PIN anterior o solicita ayuda al administrador.'
        });
      }
      
      // ✅ PIN CORRECTO - Actualizar solo datos (NO el PIN)
      console.log(`✅ Usuario ${email} - PIN correcto, actualizando información`);
      
      existingUser.firstName = firstName;
      existingUser.lastName = lastName;
      // NO actualizar PIN aquí (ya es correcto)
      existingUser.employeeCode = employeeCode;
      existingUser.department = department;
      existingUser.sociedad = sociedad;
      
      // Asignar automáticamente el NIT de la empresa basado en el código de sociedad
      if (sociedad) {
        const nitEmpresa = await Sociedad.getNitByCodigo(sociedad);
        if (nitEmpresa) {
          existingUser.nitEmpresa = nitEmpresa;
          console.log(`🏢 NIT de empresa asignado: ${nitEmpresa} (Sociedad: ${sociedad})`);
        }
      }
      
      existingUser.lastLoginAt = new Date();

      // Verificar si este usuario ES manager (aparece como managerEmail en links)
      const isManagerCount = await ManagerEmployeeLink.countDocuments({ 
        managerEmail: email, 
        isActive: true 
      });
      existingUser.isManager = isManagerCount > 0;
      
      if (existingUser.isManager) {
        console.log(`👔 Usuario ${email} ES MANAGER - Tiene ${isManagerCount} empleados asignados`);
      }

      // Determinar manager: primero buscar en ManagerEmployeeLink, luego por departamento
      const managerLink = await ManagerEmployeeLink.getDirectManager(email);
      if (managerLink) {
        existingUser.managerEmail = managerLink.managerEmail;
        console.log(`✅ Manager encontrado en ManagerEmployeeLink: ${managerLink.managerEmail}`);
      } else if (department) {
        const manager = await User.findOne({ 
          department, 
          isManager: true, 
          isActive: true 
        });
        if (manager) {
          existingUser.managerEmail = manager.email;
          console.log(`✅ Manager encontrado por departamento: ${manager.email}`);
        }
      }

      await existingUser.save();

      // Log de sincronización
      const syncLog = new SyncLog({
        userEmail: email,
        entityType: 'USER',
        entityId: email,
        action: 'UPDATE',
        success: true
      });
      await syncLog.save();

      // Generar token JWT
      const token = generateToken(existingUser);

      return res.status(200).json({
        message: 'Usuario actualizado exitosamente',
        updated: true,
        token,
        user: {
          email,
          firstName,
          lastName,
          employeeCode,
          department,
          sociedad,
          managerEmail: existingUser.managerEmail
        }
      });
    }

    // ===== USUARIO NUEVO: REGISTRAR =====
    console.log(`📝 Registrando nuevo usuario: ${email}`);
    
    // Encriptar PIN para nuevo usuario
    const hashedPin = await bcrypt.hash(pin, 10);

    // Verificar si este usuario ES manager (aparece como managerEmail en links)
    const isManagerCount = await ManagerEmployeeLink.countDocuments({ 
      managerEmail: email, 
      isActive: true 
    });
    const isManager = isManagerCount > 0;
    
    if (isManager) {
      console.log(`👔 Usuario ${email} ES MANAGER - Tiene ${isManagerCount} empleados asignados`);
    }

    // Determinar manager: primero buscar en ManagerEmployeeLink, luego por departamento
    let managerEmail = null;
    
    // 1. Buscar en ManagerEmployeeLink (prioridad)
    const managerLink = await ManagerEmployeeLink.getDirectManager(email);
    if (managerLink) {
      managerEmail = managerLink.managerEmail;
      console.log(`✅ Manager encontrado en ManagerEmployeeLink: ${managerEmail}`);
    } else if (department) {
      // 2. Fallback: buscar manager por departamento
      const manager = await User.findOne({ 
        department, 
        isManager: true, 
        isActive: true 
      });
      if (manager) {
        managerEmail = manager.email;
        console.log(`✅ Manager encontrado por departamento: ${managerEmail}`);
      }
    }

    // Asignar automáticamente el NIT de la empresa basado en el código de sociedad
    let nitEmpresa = null;
    if (sociedad) {
      nitEmpresa = await Sociedad.getNitByCodigo(sociedad);
      if (nitEmpresa) {
        console.log(`🏢 NIT de empresa asignado: ${nitEmpresa} (Sociedad: ${sociedad})`);
      }
    }

    // Crear usuario
    const newUser = new User({
      email,
      firstName,
      lastName,
      pin: hashedPin,
      employeeCode,
      department,
      sociedad,
      nitEmpresa,
      managerEmail,
      isManager,
      lastLoginAt: new Date()
    });

    await newUser.save();

    // Log de sincronización
    const syncLog = new SyncLog({
      userEmail: email,
      entityType: 'USER',
      entityId: email,
      action: 'REGISTER',
      success: true
    });
    await syncLog.save();

    // Generar token JWT
    const token = generateToken(newUser);

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      updated: false,
      token,
      user: {
        email,
        firstName,
        lastName,
        employeeCode,
        department,
        sociedad,
        managerEmail
      }
    });
  } catch (error) {
    console.error('Error en registro/actualización de usuario:', error);
    
    // Log de error
    if (req.body.email) {
      const errorLog = new SyncLog({
        userEmail: req.body.email,
        entityType: 'USER',
        entityId: req.body.email,
        action: 'REGISTER',
        success: false,
        errorMessage: error.message
      });
      await errorLog.save().catch(() => {}); // No fallar si no se puede guardar el log
    }
    
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Login de usuario
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, pin } = req.body;

    // Buscar usuario
    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Verificar PIN
    const isValidPin = await bcrypt.compare(pin, user.pin);
    if (!isValidPin) {
      return res.status(401).json({ error: 'PIN incorrecto' });
    }

    // Actualizar isManager verificando ManagerEmployeeLink
    const isManagerCount = await ManagerEmployeeLink.countDocuments({ 
      managerEmail: email, 
      isActive: true 
    });
    user.isManager = isManagerCount > 0;

    // Actualizar último login
    user.lastLoginAt = new Date();
    await user.save();

    // Generar token JWT
    const token = generateToken(user);

    // Log de sincronización
    const syncLog = new SyncLog({
      userEmail: email,
      entityType: 'USER',
      entityId: email,
      action: 'LOGIN',
      success: true
    });
    await syncLog.save();

    res.json({
      message: 'Login exitoso',
      token,
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        department: user.department,
        managerEmail: user.managerEmail,
        isManager: user.isManager
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    
    // Log de error
    if (req.body.email) {
      const errorLog = new SyncLog({
        userEmail: req.body.email,
        entityType: 'USER',
        entityId: req.body.email,
        action: 'LOGIN',
        success: false,
        errorMessage: error.message
      });
      await errorLog.save().catch(() => {});
    }
    
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualizar PIN del usuario
router.put('/update-pin', authenticateToken, [
  body('email').isEmail().normalizeEmail(),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric()
], async (req, res) => {
  try {
    console.log('🔐 Backend: Solicitud de actualización de PIN recibida');
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Backend: Errores de validación:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, pin } = req.body;
    console.log('🔐 Backend: Email del usuario:', email);
    console.log('🔐 Backend: Usuario autenticado:', req.user.email);

    // Verificar que el usuario solo puede actualizar su propio PIN
    if (req.user.email !== email) {
      console.log('❌ Backend: Usuario intenta actualizar PIN de otro usuario');
      return res.status(403).json({ error: 'No autorizado para actualizar este PIN' });
    }

    // Buscar usuario
    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      console.log('❌ Backend: Usuario no encontrado:', email);
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Encriptar nuevo PIN
    const hashedPin = await bcrypt.hash(pin, 10);
    console.log('🔐 Backend: PIN encriptado exitosamente');

    // Actualizar PIN
    user.pin = hashedPin;
    user.updatedAt = new Date();
    await user.save();

    console.log('✅ Backend: PIN actualizado en base de datos');

    // Log de sincronización
    const syncLog = new SyncLog({
      userEmail: email,
      entityType: 'USER',
      entityId: email,
      action: 'UPDATE_PIN',
      success: true
    });
    await syncLog.save();

    console.log('✅ Backend: Log de sincronización creado');

    res.json({
      message: 'PIN actualizado exitosamente',
      success: true
    });
  } catch (error) {
    console.error('❌ Backend: Error actualizando PIN:', error);
    res.status(500).json({ error: 'Error en el servidor al actualizar PIN' });
  }
});

// Actualizar perfil de usuario
router.put('/profile', validateUserProfile, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, firstName, lastName, department } = req.body;

    // Verificar si el usuario existe
    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Actualizar usuario
    user.firstName = firstName;
    user.lastName = lastName;
    user.department = department;
    
    await user.save();

    // Log de sincronización
    const syncLog = new SyncLog({
      userEmail: email,
      entityType: 'USER',
      entityId: email,
      action: 'UPDATE',
      success: true
    });
    await syncLog.save();

    res.json({
      message: 'Perfil actualizado exitosamente',
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        department: user.department,
        managerEmail: user.managerEmail
      }
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    
    // Log de error
    const errorLog = new SyncLog({
      userEmail: req.body.email,
      entityType: 'USER',
      entityId: req.body.email,
      action: 'UPDATE',
      success: false,
      errorMessage: error.message
    });
    await errorLog.save().catch(() => {});
    
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Autenticar usuario
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('pin').isLength({ min: 4, max: 4 }).isNumeric()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, pin } = req.body;

    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const pinMatch = await bcrypt.compare(pin, user.pin);
    if (!pinMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Actualizar último login
    user.lastLoginAt = new Date();
    await user.save();

    // Log de sincronización
    const syncLog = new SyncLog({
      userEmail: email,
      entityType: 'USER',
      entityId: email,
      action: 'LOGIN',
      success: true
    });
    await syncLog.save();

    res.json({
      message: 'Autenticación exitosa',
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        department: user.department,
        managerEmail: user.managerEmail,
        isManager: user.isManager
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener información de usuario (requiere autenticación y autorización)
router.get('/profile/:email', authenticateToken, canAccessUserData, async (req, res) => {
  try {
    const { email } = req.params;

    const user = await User.findOne({ email, isActive: true })
      .select('-pin'); // No incluir el PIN en la respuesta

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        department: user.department,
        managerEmail: user.managerEmail,
        isManager: user.isManager,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      }
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Listar usuarios (solo para managers autenticados)
router.get('/list', authenticateToken, requireManager, async (req, res) => {
  try {
    const { managerEmail, department } = req.query;

    let query = { isActive: true };

    if (managerEmail) {
      query.managerEmail = managerEmail;
    }

    if (department) {
      query.department = department;
    }

    const users = await User.find(query)
      .select('-pin') // No incluir PINs
      .sort({ lastName: 1, firstName: 1 });

    const userList = users.map(user => ({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      department: user.department,
      isManager: user.isManager,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt
    }));

    res.json({ users: userList });
  } catch (error) {
    console.error('Error listando usuarios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;