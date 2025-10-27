const { initDatabase, closeDatabase } = require('../database/init');

/**
 * Script simple para inicializar la base de datos
 */
async function initDatabaseScript() {
  try {
    console.log('🚀 Inicializando base de datos...\n');
    
    await initDatabase();
    
    console.log('\n✅ Base de datos inicializada exitosamente');
    console.log('\n💡 Para crear datos de ejemplo ejecuta:');
    console.log('   npm run create-sample-data');
    
  } catch (error) {
    console.error('\n❌ Error inicializando la base de datos:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  initDatabaseScript();
}

module.exports = { initDatabaseScript };