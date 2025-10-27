// Script para verificar que no hay errores de sintaxis en las rutas

console.log('🔍 Verificando sintaxis de rutas...');

try {
  console.log('✅ Verificando middleware de autenticación...');
  const auth = require('./middleware/auth');
  console.log('   - authenticateToken: ' + typeof auth.authenticateToken);
  console.log('   - generateToken: ' + typeof auth.generateToken);
  console.log('   - requireManager: ' + typeof auth.requireManager);
  console.log('   - canAccessUserData: ' + typeof auth.canAccessUserData);

  console.log('✅ Verificando rutas de usuarios...');
  const users = require('./routes/users');
  console.log('   - Rutas de usuarios cargadas correctamente');

  console.log('✅ Verificando rutas de gastos...');
  const expenses = require('./routes/expenses');
  console.log('   - Rutas de gastos cargadas correctamente');

  console.log('✅ Verificando rutas de categorías...');
  const categories = require('./routes/categories');
  console.log('   - Rutas de categorías cargadas correctamente');

  console.log('✅ Verificando rutas de sincronización...');
  const sync = require('./routes/sync');
  console.log('   - Rutas de sync cargadas correctamente');

  console.log('✅ Verificando rutas de manager-links...');
  const managerLinks = require('./routes/manager-links');
  console.log('   - Rutas de manager-links cargadas correctamente');

  console.log('✅ Verificando rutas de health...');
  const health = require('./routes/health');
  console.log('   - Rutas de health cargadas correctamente');

  console.log('');
  console.log('🎉 ¡Todas las rutas se cargaron correctamente!');
  console.log('📝 No se encontraron errores de sintaxis');
  console.log('✅ El servidor debería iniciar sin problemas');

} catch (error) {
  console.error('❌ Error encontrado:');
  console.error(error.message);
  console.error('');
  console.error('Stack trace:');
  console.error(error.stack);
  process.exit(1);
}

process.exit(0);