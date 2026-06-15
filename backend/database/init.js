const mongoose = require('mongoose');

// Configuración de MongoDB
const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'easygastos';

const resolveMongoUri = () => {
  const envMongoUri = (process.env.MONGODB_URI || '').trim();

  if (!envMongoUri) {
    return `${DEFAULT_MONGODB_URI}/${DATABASE_NAME}`;
  }

  const uriWithoutTrailingSlash = envMongoUri.replace(/\/$/, '');
  const hasDatabaseInUri = /mongodb(?:\+srv)?:\/\/[^/]+\/.+/.test(uriWithoutTrailingSlash);

  return hasDatabaseInUri
    ? uriWithoutTrailingSlash
    : `${uriWithoutTrailingSlash}/${DATABASE_NAME}`;
};

const MONGODB_URI = resolveMongoUri();

// Esquemas de Mongoose
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  pin: { type: String, required: true },
  lifnr: { type: String, default: null },
  employeeCode: { type: String, default: null },
  department: { type: String, default: null },
  managerEmail: { type: String, default: null },
  sociedad: { type: String, default: null }, // Código de sociedad (ej: "1000", "2000")
  nitEmpresa: { type: String, default: null }, // NIT de la empresa/sociedad (para filtrar facturas SAT)
  isManager: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date, default: null },
  needsSync: { type: Boolean, default: false },
  lastSync: { type: Date, default: null }
}, {
  timestamps: true, // Esto agrega createdAt y updatedAt automáticamente
  collection: 'users'
});

const categorySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userEmail: { type: String, required: true },
  name: { type: String, required: true },
  icon: { type: String, default: null },
  sociedad: { type: String, default: null },
  centro: { type: String, default: null },
  cuenta: { type: String, default: null },
  ordenco: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  needsSync: { type: Boolean, default: false },
  lastSync: { type: Date, default: null }
}, {
  timestamps: true,
  collection: 'categories'
});

const expenseSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userEmail: { type: String, required: true },
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: String, required: true }, // Mantener como string para compatibilidad
  category: { type: String, required: true },
  sociedad: { type: String, default: null },
  status: { type: String, required: true, default: 'BORRADOR' },
  expenseStatus: { 
    type: String, 
    required: true, 
    enum: ['draft', 'in_liquidation', 'approved', 'voided'],
    default: 'draft'
  },
  satStatus: {
    type: String,
    enum: ['VALIDADO_SAT', 'NO_VALIDADO_SAT'],
    default: 'NO_VALIDADO_SAT'
  },
  liquidationId: { type: String, default: null }, // ID de la liquidación a la que pertenece
  voidedAt: { type: String, default: null }, // Fecha de anulación (ISO string)
  voidedReason: { type: String, default: null }, // Razón de anulación
  supplier: { type: String, default: null },
  vat_number: { type: String, default: null },
  department: { type: String, default: null },
  notes: { type: String, default: null },
  noinvoice: { type: String, default: null },
  serie: { type: String, default: null },
  uuid: { type: String, default: null }, // UUID de factura FEL para validación SAT
  centro: { type: String, default: null },
  cuenta: { type: String, default: null },
  ordenco: { type: String, default: null },
  managerEmail: { type: String, default: null },
  imageuri: { type: String, default: null },
  totiva: { type: Number, default: null },
  currency: { type: String, default: 'EUR' },
  approvalComments: { type: String, default: null },
  approvedAt: { type: Date, default: null },
  approvedBy: { type: String, default: null },
  rejectedAt: { type: Date, default: null },
  rejectedBy: { type: String, default: null },
  needsSync: { type: Boolean, default: false },
  lastSync: { type: Date, default: null }
}, {
  timestamps: true,
  collection: 'expenses'
});

const liquidationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true }, // Email del empleado que creó la liquidación
  employeeName: { type: String, required: true },
  createdDate: { type: String, required: true }, // YYYY-MM-DD
  expenseIds: { type: [String], required: true, default: [] }, // Array de IDs de gastos
  totalAmount: { type: Number, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['draft', 'submitted', 'approved', 'rejected'],
    default: 'draft'
  },
  managerEmail: { type: String, default: null }, // Email del jefe que debe aprobar
  managerComments: { type: String, default: null },
  submittedDate: { type: String, default: null }, // YYYY-MM-DD
  approvedDate: { type: String, default: null }, // YYYY-MM-DD
  rejectedDate: { type: String, default: null }, // YYYY-MM-DD
  approverEmail: { type: String, default: null }, // Email del aprobador (tracking)
  rejectedBy: { type: String, default: null }, // Email del rechazador (tracking)
  csvGeneratedAt: { type: Date, default: null }, // Fecha de generación de CSV
  csvGeneratedBy: { type: String, default: null }, // Usuario que generó el CSV
  sapDocNumber: { type: String, default: null },
  approverName: { type: String, default: null },
  comments: { type: String, default: null },
  sapSyncStatus: { type: String, default: null },
  sapReferenceId: { type: String, default: null },
  sapResponseMessage: { type: String, default: null },
  sapSyncedAt: { type: String, default: null }
}, {
  timestamps: true, // createdAt y updatedAt
  collection: 'liquidations'
});

const syncLogSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  action: { type: String, required: true },
  success: { type: Boolean, required: true },
  errorMessage: { type: String, default: null }
}, {
  timestamps: true,
  collection: 'sync_logs'
});

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
  description: { type: String, default: null }
}, {
  timestamps: true,
  collection: 'config'
});

const chatConversationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true }, // Email del usuario
  title: { type: String, required: true },
  messages: [{
    id: { type: String, required: true },
    type: { type: String, required: true, enum: ['user', 'assistant'] },
    text: { type: String, required: true },
    timestamp: { type: String, required: true } // ISO string
  }],
  expensesCount: { type: Number, default: 0 },
  needsSync: { type: Boolean, default: false },
  lastSync: { type: Date, default: null }
}, {
  timestamps: true, // createdAt y updatedAt
  collection: 'chat_conversations'
});

// Crear índices
userSchema.index({ email: 1 });
userSchema.index({ department: 1 });
userSchema.index({ managerEmail: 1 });

categorySchema.index({ userEmail: 1 });
categorySchema.index({ userEmail: 1, isActive: 1 });

expenseSchema.index({ userEmail: 1, status: 1 });
expenseSchema.index({ managerEmail: 1 });
expenseSchema.index({ date: 1 });
expenseSchema.index({ userEmail: 1, date: -1 });

liquidationSchema.index({ userId: 1 });
liquidationSchema.index({ userId: 1, status: 1 });
liquidationSchema.index({ managerEmail: 1, status: 1 });
liquidationSchema.index({ createdDate: -1 });

syncLogSchema.index({ userEmail: 1 });
syncLogSchema.index({ createdAt: -1 });

chatConversationSchema.index({ userId: 1 });
chatConversationSchema.index({ userId: 1, updatedAt: -1 });
chatConversationSchema.index({ updatedAt: -1 }); // Para filtrar por fecha

// Importar el modelo ManagerEmployeeLink
const ManagerEmployeeLink = require('../models/ManagerEmployeeLink');

// Crear modelos
const User = mongoose.model('User', userSchema);
const Category = mongoose.model('Category', categorySchema);
const Expense = mongoose.model('Expense', expenseSchema);
const Liquidation = mongoose.model('Liquidation', liquidationSchema);
const SyncLog = mongoose.model('SyncLog', syncLogSchema);
const Config = mongoose.model('Config', configSchema);
const ChatConversation = mongoose.model('ChatConversation', chatConversationSchema);


// Función para crear collections explícitamente si no existen
const createCollectionsIfNotExist = async () => {
  try {
    const db = mongoose.connection.db;
    
    console.log('🔧 Verificando collections...');
    
    // Lista de collections que necesitamos
    const requiredCollections = [
      { name: 'users', model: User },
      { name: 'categories', model: Category },
      { name: 'expenses', model: Expense },
      { name: 'sync_logs', model: SyncLog },
      { name: 'config', model: Config },
      { name: 'manageremployeelinks', model: ManagerEmployeeLink },
      { name: 'chat_conversations', model: ChatConversation }
    ];
    
    // Obtener collections existentes
    const existingCollections = await db.listCollections().toArray();
    const existingNames = existingCollections.map(col => col.name);
    
    // Crear collections que no existen
    for (const { name, model } of requiredCollections) {
      if (!existingNames.includes(name)) {
        console.log(`📝 Creando collection: ${name}`);
        
        // Crear collection insertando y luego eliminando un documento temporal
        const tempDoc = new model({});
        try {
          // Para users, usar datos válidos temporales
          if (name === 'users') {
            tempDoc.email = 'temp@temp.com';
            tempDoc.firstName = 'Temp';
            tempDoc.lastName = 'User';
            tempDoc.pin = '0000';
          }
          // Para categories
          else if (name === 'categories') {
            tempDoc.id = 'temp-id';
            tempDoc.userEmail = 'temp@temp.com';
            tempDoc.name = 'Temp Category';
          }
          // Para expenses
          else if (name === 'expenses') {
            tempDoc.id = 'temp-id';
            tempDoc.userEmail = 'temp@temp.com';
            tempDoc.description = 'Temp Expense';
            tempDoc.amount = 0;
            tempDoc.date = new Date().toISOString();
            tempDoc.category = 'Temp';
            tempDoc.status = 'BORRADOR';
          }
          // Para sync_logs
          else if (name === 'sync_logs') {
            tempDoc.userEmail = 'temp@temp.com';
            tempDoc.entityType = 'TEMP';
            tempDoc.entityId = 'temp-id';
            tempDoc.action = 'CREATE';
            tempDoc.success = true;
          }
          // Para config
          else if (name === 'config') {
            tempDoc.key = 'temp-key';
            tempDoc.value = 'temp-value';
          }
          // Para manageremployeelinks
          else if (name === 'manageremployeelinks') {
            tempDoc.employeeEmail = 'temp@temp.com';
            tempDoc.managerEmail = 'manager@temp.com';
          }
          
          await tempDoc.save();
          await model.deleteOne({ _id: tempDoc._id });
          console.log(`✅ Collection '${name}' creada exitosamente`);
        } catch (err) {
          console.log(`ℹ️ Collection '${name}' ya existe o se creará automáticamente`);
        }
      } else {
        console.log(`✅ Collection '${name}' ya existe`);
      }
    }
    
    console.log('✅ Verificación de collections completada');
  } catch (error) {
    console.error('❌ Error creando collections:', error);
    // No lanzar error, las collections se crearán automáticamente
  }
};

// Función para crear índices
const createIndexes = async () => {
  try {
    console.log('🔧 Creando índices...');
    
    // Crear índices para mejor rendimiento
    await User.createIndexes();
    await Category.createIndexes();
    await Expense.createIndexes();
    await SyncLog.createIndexes();
    await Config.createIndexes();
    
    // Los índices de ManagerEmployeeLink se crean en su propio esquema
    await ManagerEmployeeLink.createIndexes();
    
    console.log('✅ Índices creados exitosamente');
  } catch (error) {
    console.error('⚠️ Error creando índices:', error);
    // No es crítico si fallan los índices
  }
};

// Función para mostrar información de la base de datos
const showDatabaseInfo = async () => {
  try {
    console.log('📊 Estadísticas de la base de datos:');
    
    const stats = await getDatabaseStats();
    console.log(`   👥 Usuarios: ${stats.users}`);
    console.log(`   📁 Categorías: ${stats.categories}`);
    console.log(`   💰 Gastos: ${stats.expenses}`);
    console.log(`   📝 Logs de sync: ${stats.syncLogs}`);
    console.log(`   🔗 Relaciones manager-empleado: ${stats.managerLinks || 0}`);
    
    // Mostrar collections disponibles
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log(`   🗂️ Collections: ${collections.map(c => c.name).join(', ')}`);
    
  } catch (error) {
    console.error('⚠️ Error obteniendo estadísticas:', error);
  }
};

// Función para conectar a MongoDB
const initDatabase = async () => {
  try {
    console.log('🔌 Conectando a MongoDB...');
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });
    
    console.log('✅ Conectado exitosamente a MongoDB');
    console.log(`📊 Base de datos: ${DATABASE_NAME}`);
    console.log(`🔗 Mongo URI efectiva: ${MONGODB_URI.replace(/:[^:@/]+@/, ':****@')}`);
    
    // Verificar conexión
    const adminDb = mongoose.connection.db.admin();
    const serverStatus = await adminDb.serverStatus();
    console.log(`📋 MongoDB versión: ${serverStatus.version}`);
    
    // Crear collections explícitamente si no existen
    await createCollectionsIfNotExist();
    
    // Crear índices
    await createIndexes();
    
    // Verificar y mostrar estadísticas
    await showDatabaseInfo();
    
    // Insertar configuración inicial si no existe
    await Config.findOneAndUpdate(
      { key: 'app_version' },
      { key: 'app_version', value: '1.0.0', description: 'Versión de la aplicación' },
      { upsert: true, new: true }
    );
    
    await Config.findOneAndUpdate(
      { key: 'max_expense_amount' },
      { key: 'max_expense_amount', value: '3500', description: 'Monto máximo permitido para gastos' },
      { upsert: true, new: true }
    );
    
    console.log('✅ Configuración inicial verificada');
    
    // Event listeners para conexión
    mongoose.connection.on('error', (err) => {
      console.error('❌ Error de conexión MongoDB:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB desconectado');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconectado');
    });
    
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    
    if (error.name === 'MongoServerSelectionError') {
      console.error(`💡 Verifica que MongoDB esté ejecutándose y que MONGODB_URI sea correcta: ${MONGODB_URI}`);
      console.error('   - Windows: net start MongoDB');
      console.error('   - macOS/Linux: sudo systemctl start mongod');
      console.error('   - Docker: docker run -d -p 27017:27017 mongo');
      console.error('   - Verificar: mongosh');
    }
    
    throw error;
  }
};

// Función para obtener estadísticas de la base de datos
const getDatabaseStats = async () => {
  try {
    const stats = {
      users: await User.countDocuments({ isActive: true }),
      categories: await Category.countDocuments({ isActive: true }),
      expenses: await Expense.countDocuments(),
      liquidations: await Liquidation.countDocuments(),
      syncLogs: await SyncLog.countDocuments(),
      managerLinks: await ManagerEmployeeLink.countDocuments({ isActive: true }),
      chatConversations: await ChatConversation.countDocuments()
    };
    
    return stats;
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    throw error;
  }
};

// Función para cerrar conexión
const closeDatabase = async () => {
  try {
    await mongoose.connection.close();
    console.log('✅ Conexión a MongoDB cerrada');
  } catch (error) {
    console.error('Error cerrando conexión:', error);
  }
};

module.exports = {
  initDatabase,
  getDatabaseStats,
  closeDatabase,
  models: {
    User,
    Category,
    Expense,
    Liquidation,
    SyncLog,
    Config,
    ManagerEmployeeLink,
    ChatConversation
  }
};
