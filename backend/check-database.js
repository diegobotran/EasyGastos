const { initDatabase, getDatabaseStats, closeDatabase } = require('./database/init');

/**
 * Script para verificar el estado de la base de datos MongoDB
 * y crear las collections necesarias
 */
async function checkDatabase() {
  try {
    console.log('🔍 Verificando estado de la base de datos...\n');
    
    // Inicializar conexión
    await initDatabase();
    
    console.log('\n📊 Estadísticas finales:');
    const stats = await getDatabaseStats();
    
    console.log('┌─────────────────────────────────────┐');
    console.log('│           RESUMEN BD                │');
    console.log('├─────────────────────────────────────│');
    console.log(`│ 👥 Usuarios activos:     ${stats.users.toString().padStart(10)} │`);
    console.log(`│ 📁 Categorías activas:   ${stats.categories.toString().padStart(10)} │`);
    console.log(`│ 💰 Gastos totales:       ${stats.expenses.toString().padStart(10)} │`);
    console.log(`│ 📝 Logs de sync:         ${stats.syncLogs.toString().padStart(10)} │`);
    console.log(`│ 🔗 Relaciones M-E:       ${stats.managerLinks.toString().padStart(10)} │`);
    console.log('└─────────────────────────────────────┘');
    
    // Verificar si hay datos de ejemplo
    if (stats.users === 0) {
      console.log('\n💡 La base de datos está vacía. ¿Deseas crear datos de ejemplo?');
      console.log('   Ejecuta: npm run create-sample-data');
    }
    
    console.log('\n✅ Verificación completada exitosamente');
    
  } catch (error) {
    console.error('\n❌ Error verificando la base de datos:', error);
    
    if (error.name === 'MongoServerSelectionError') {
      console.error('\n💡 Pasos para solucionar:');
      console.error('   1. Verificar que MongoDB esté ejecutándose:');
      console.error('      - Windows: net start MongoDB');
      console.error('      - macOS/Linux: sudo systemctl start mongod');
      console.error('      - Docker: docker run -d -p 27017:27017 mongo');
      console.error('   2. Verificar conexión: mongosh');
      console.error('   3. Verificar puerto 27017 esté disponible');
    }
    
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  checkDatabase();
}

module.exports = { checkDatabase };