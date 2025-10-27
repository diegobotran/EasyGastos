const mongoose = require('mongoose');

async function testConnection() {
  try {
    console.log('🔌 Probando conexión a MongoDB...');
    
    await mongoose.connect('mongodb://localhost:27017/easygastos', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });
    
    console.log('✅ Conexión exitosa a MongoDB');
    console.log('📊 Base de datos: easygastos');
    
    // Probar una operación simple
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📋 Collections encontradas:', collections.map(c => c.name));
    
    await mongoose.disconnect();
    console.log('✅ Test completado exitosamente');
    
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    
    if (error.name === 'MongoServerSelectionError') {
      console.error('\n💡 MongoDB no está disponible. Posibles soluciones:');
      console.error('   1. Verificar que MongoDB esté instalado');
      console.error('   2. Iniciar el servicio MongoDB:');
      console.error('      - Windows: net start MongoDB');
      console.error('      - macOS: brew services start mongodb-community');
      console.error('      - Linux: sudo systemctl start mongod');
      console.error('   3. Verificar que esté ejecutándose en puerto 27017');
      console.error('   4. Probar conexión manual: mongosh');
    }
    
    process.exit(1);
  }
}

testConnection();