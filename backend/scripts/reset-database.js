const { initDatabase, closeDatabase, models } = require('../database/init');
const ManagerEmployeeLink = require('../models/ManagerEmployeeLink');

/**
 * Script para resetear completamente la base de datos
 * ⚠️ CUIDADO: Esto eliminará TODOS los datos
 */
async function resetDatabase() {
  try {
    console.log('⚠️ ADVERTENCIA: Este script eliminará TODOS los datos de la base de datos');
    console.log('⚠️ Presiona Ctrl+C para cancelar en los próximos 5 segundos...\n');
    
    // Esperar 5 segundos para dar oportunidad de cancelar
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🔄 Procediendo con el reset de la base de datos...\n');
    
    // Inicializar conexión
    await initDatabase();
    
    const { User, Category, Expense, SyncLog, Config } = models;
    
    // Eliminar todas las collections
    console.log('🗑️ Eliminando datos...');
    
    await User.deleteMany({});
    console.log('✅ Usuarios eliminados');
    
    await Category.deleteMany({});
    console.log('✅ Categorías eliminadas');
    
    await Expense.deleteMany({});
    console.log('✅ Gastos eliminados');
    
    await SyncLog.deleteMany({});
    console.log('✅ Logs de sincronización eliminados');
    
    await ManagerEmployeeLink.deleteMany({});
    console.log('✅ Relaciones manager-empleado eliminadas');
    
    // Mantener algunas configuraciones básicas
    await Config.deleteMany({ key: { $nin: ['app_version', 'max_expense_amount'] } });
    console.log('✅ Configuraciones resetadas (manteniendo básicas)');
    
    console.log('\n✅ Base de datos reseteada exitosamente');
    console.log('\n💡 Para crear datos de ejemplo ejecuta:');
    console.log('   npm run create-sample-data');
    
  } catch (error) {
    console.error('\n❌ Error reseteando la base de datos:', error);
    throw error;
  } finally {
    await closeDatabase();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  resetDatabase().catch(console.error);
}

module.exports = { resetDatabase };