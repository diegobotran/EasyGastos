const jwt = require('jsonwebtoken');
const { models } = require('../database/init');

const { User } = models;

/**
 * Middleware para verificar token JWT
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    // Verificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    
    // Buscar usuario en la base de datos
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Usuario no válido' });
    }

    // Agregar información del usuario a la request
    req.user = {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      department: user.department,
      isManager: user.isManager
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    
    console.error('Error en autenticación:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Middleware opcional - no requiere token pero lo verifica si está presente
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      const user = await User.findById(decoded.userId);
      
      if (user && user.isActive) {
        req.user = {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          department: user.department,
          isManager: user.isManager
        };
      }
    }

    next();
  } catch (error) {
    // En auth opcional, continuamos sin user si hay error
    next();
  }
};

/**
 * Generar token JWT para un usuario
 */
const generateToken = (user) => {
  const payload = {
    userId: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'fallback_secret',
    { 
      expiresIn: '48h', // Token expira en 48 horas
      issuer: 'easygastos-backend',
      audience: 'easygastos-app'
    }
  );
};

/**
 * Middleware para verificar que el usuario es manager
 */
const requireManager = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Autenticación requerida' });
  }
  
  if (!req.user.isManager) {
    return res.status(403).json({ error: 'Acceso restringido a managers' });
  }
  
  next();
};

/**
 * Middleware para verificar que el usuario puede acceder a los datos
 * (es el mismo usuario o es su manager)
 */
const canAccessUserData = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Autenticación requerida' });
    }

    const targetEmail = req.params.email || req.body.userEmail || req.query.userEmail;
    
    // El usuario puede acceder a sus propios datos
    if (req.user.email === targetEmail) {
      return next();
    }
    
    // Si es manager, verificar si puede acceder a este usuario
    if (req.user.isManager) {
      const { ManagerEmployeeLink } = models;
      const link = await ManagerEmployeeLink.findOne({
        managerEmail: req.user.email,
        employeeEmail: targetEmail,
        isActive: true
      });
      
      if (link) {
        return next();
      }
    }
    
    return res.status(403).json({ error: 'No tienes permisos para acceder a estos datos' });
  } catch (error) {
    console.error('Error verificando acceso:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
  generateToken,
  requireManager,
  canAccessUserData
};