const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Cargar variables de entorno
require('dotenv').config();

// Importar rutas
const healthRoutes = require('./routes/health');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');
const expenseRoutes = require('./routes/expenses');
const syncRoutes = require('./routes/sync');
const managerLinksRoutes = require('./routes/manager-links');
const liquidationsRoutes = require('./routes/liquidations');
const uploadsRoutes = require('./routes/uploads');
const appRoutes = require('./routes/app');
const chatHistoryRoutes = require('./routes/chat-history');
const satRoutes = require('./routes/sat');
const sociedadesRoutes = require('./routes/sociedades');

// Inicializar base de datos
const { initDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;
const BIND_IP = process.env.BIND_IP || '0.0.0.0';

// Middleware de seguridad
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos por defecto
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // límite de requests por IP
  message: 'Demasiadas solicitudes desde esta IP, intente más tarde.'
});
app.use(limiter);

// CORS - permitir solicitudes desde la app móvil
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? true // En producción, permitir todas las conexiones
  : (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:8081', 'http://192.168.1.100:8081']);

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? true : allowedOrigins,
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined'));

// Servir archivos estáticos (para imágenes de recibos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ruta raíz con información de la API
app.get('/', (req, res) => {
  res.json({
    name: 'EasyGastos Backend API',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      health: '/health',
      users: '/api/users',
      categories: '/api/categories',
      expenses: '/api/expenses',
      sync: '/api/sync',
      managerLinks: '/api/manager-links',
      liquidations: '/api/liquidations',
      chatHistory: '/api/chat-history'
    },
    documentation: {
      health: 'GET /health - Health check',
      users: {
        register: 'POST /api/users/register',
        login: 'POST /api/users/login',
        profile: 'GET /api/users/profile/:email'
      },
      categories: {
        list: 'GET /api/categories?userEmail=email',
        create: 'POST /api/categories',
        update: 'PUT /api/categories/:id'
      },
      expenses: {
        list: 'GET /api/expenses?userEmail=email',
        create: 'POST /api/expenses',
        approve: 'PUT /api/expenses/:id/approve'
      },
      sync: {
        fullSync: 'POST /api/sync/full-sync',
        upload: 'POST /api/sync/upload'
      },
      managerLinks: {
        getByEmployee: 'GET /api/manager-links/employee/:email',
        getByManager: 'GET /api/manager-links/manager/:email',
        getDirectManager: 'GET /api/manager-links/direct-manager/:email',
        getDepartment: 'GET /api/manager-links/department/:department',
        create: 'POST /api/manager-links',
        update: 'PUT /api/manager-links/:id',
        delete: 'DELETE /api/manager-links/:id',
        bulkAssign: 'POST /api/manager-links/bulk-assign'
      },
      liquidations: {
        create: 'POST /api/liquidations',
        getByUser: 'GET /api/liquidations/user/:userId',
        getByManager: 'GET /api/liquidations/manager/:managerEmail',
        getById: 'GET /api/liquidations/:id',
        submit: 'PUT /api/liquidations/:id/submit',
        approve: 'PUT /api/liquidations/:id/approve',
        reject: 'PUT /api/liquidations/:id/reject',
        delete: 'DELETE /api/liquidations/:id',
        csv: 'GET /api/liquidations/:id/csv',
        update: 'PUT /api/liquidations/:id'
      }
    }
  });
});

// Ruta de información de la API
app.get('/api', (req, res) => {
  res.json({
    message: 'EasyGastos API v1.0.0',
    status: 'online',
    endpoints: [
      'GET /health - Health check',
      'POST /api/users/register - Registrar usuario',
      'POST /api/users/login - Autenticar usuario',
      'GET /api/users/profile/:email - Obtener perfil',
      'GET /api/categories - Obtener categorías',
      'POST /api/categories - Crear categoría',
      'GET /api/expenses - Obtener gastos',
      'POST /api/expenses - Crear gasto',
      'POST /api/sync/full-sync - Sincronización completa'
    ],
    timestamp: new Date().toISOString()
  });
});

// Rutas de la API
app.use('/health', healthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/manager-links', managerLinksRoutes);
app.use('/api/liquidations', liquidationsRoutes);
app.use('/api/chat-history', chatHistoryRoutes);
app.use('/api/sat', satRoutes);
app.use('/api/sociedades', sociedadesRoutes);
// Rutas para subir archivos (imágenes de comprobantes)
app.use('/api/uploads', uploadsRoutes);
// Rutas para actualizaciones de la app móvil
app.use('/api/app', appRoutes);

// Manejo de errores
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo salió mal'
  });
});

// Ruta 404
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Inicializar base de datos y arrancar servidor
console.log('🔄 Iniciando servidor EasyGastos...');

initDatabase()
  .then(() => {
    console.log('✅ Base de datos inicializada correctamente');
    
    app.listen(PORT, BIND_IP, () => {
      console.log(`🚀 Servidor EasyGastos ejecutándose en puerto ${PORT}`);
      console.log(`📋 Health check: http://localhost:${PORT}/health`);
      console.log(`📊 API Info: http://localhost:${PORT}/api`);
      console.log(`🏠 Página principal: http://localhost:${PORT}`);
      console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Bind IP: ${BIND_IP}`);
      
      // Mostrar configuración de red
      const os = require('os');
      const networkInterfaces = os.networkInterfaces();
      console.log('\n🌐 Direcciones disponibles:');
      Object.keys(networkInterfaces).forEach(interfaceName => {
        networkInterfaces[interfaceName].forEach(addr => {
          if (addr.family === 'IPv4' && !addr.internal) {
            console.log(`   http://${addr.address}:${PORT}`);
            if (process.env.NODE_ENV === 'production') {
              console.log(`   ⭐ Usar esta IP en la app: ${addr.address}:${PORT}`);
            }
          }
        });
      });
      
      if (process.env.NODE_ENV === 'production') {
        console.log('\n📱 IMPORTANTE para la app móvil:');
        console.log('   1. Actualiza config/backend.ts con la IP pública del servidor');
        console.log('   2. Verifica que el puerto 3000 esté abierto en el firewall');
        console.log('   3. Considera usar HTTPS en producción');
      }
      
      console.log('\n✅ Servidor listo para recibir conexiones');
    });
  })
  .catch(err => {
    console.error('❌ Error al inicializar la base de datos:', err);
    console.error('💡 Verifica que MongoDB esté ejecutándose en localhost:27017');
    console.error('💡 Puedes probar la conexión ejecutando: mongosh');
    process.exit(1);
  });

module.exports = app;