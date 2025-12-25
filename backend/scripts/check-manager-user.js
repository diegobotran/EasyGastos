const fetch = require('node-fetch');

const BACKEND_URL = 'http://3.82.200.97:3000';
const MANAGER_EMAIL = 'jsuarezc1@gmail.com';
const MANAGER_PIN = '1234';

async function checkManagerUser() {
  console.log('🔍 VERIFICANDO USUARIO MANAGER');
  console.log('================================\n');
  
  try {
    // 1. Login
    console.log('1️⃣ Intentando login...');
    console.log(`   Email: ${MANAGER_EMAIL}`);
    console.log(`   PIN: ${MANAGER_PIN}\n`);
    
    const loginResponse = await fetch(`${BACKEND_URL}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: MANAGER_EMAIL,
        pin: MANAGER_PIN
      })
    });
    
    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      console.error('❌ Error en login:', loginResponse.status, errorText);
      return;
    }
    
    const loginData = await loginResponse.json();
    console.log('✅ Login exitoso');
    console.log('📋 Datos del usuario:');
    console.log(JSON.stringify(loginData, null, 2));
    console.log();
    
    const token = loginData.token;
    
    // 2. Intentar acceder a ruta de manager
    console.log('2️⃣ Probando acceso a liquidaciones de manager...');
    const managerLiquidationsResponse = await fetch(
      `${BACKEND_URL}/api/liquidations/manager/${encodeURIComponent(MANAGER_EMAIL)}`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    
    console.log(`   Status: ${managerLiquidationsResponse.status}`);
    
    if (managerLiquidationsResponse.status === 403) {
      console.error('❌ ACCESO DENEGADO (403)');
      console.error('   El usuario NO tiene isManager=true en la base de datos\n');
      
      console.log('🔧 SOLUCIÓN:');
      console.log('   Ejecuta el script de setup para crear el usuario manager:');
      console.log('   cd backend');
      console.log('   npm run setup-admin\n');
      return;
    }
    
    if (managerLiquidationsResponse.ok) {
      const liquidations = await managerLiquidationsResponse.json();
      console.log(`✅ Acceso exitoso - ${liquidations.length} liquidaciones pendientes`);
      console.log(JSON.stringify(liquidations, null, 2));
    } else {
      const errorText = await managerLiquidationsResponse.text();
      console.error(`⚠️ Error ${managerLiquidationsResponse.status}:`, errorText);
    }
    
    console.log();
    
    // 3. Probar acceso a gastos pendientes
    console.log('3️⃣ Probando acceso a gastos pendientes de aprobación...');
    const pendingExpensesResponse = await fetch(
      `${BACKEND_URL}/api/expenses/pending-approval?managerEmail=${encodeURIComponent(MANAGER_EMAIL)}`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    
    console.log(`   Status: ${pendingExpensesResponse.status}`);
    
    if (pendingExpensesResponse.ok) {
      const expenses = await pendingExpensesResponse.json();
      console.log(`✅ Acceso exitoso - ${expenses.length} gastos pendientes`);
      console.log(JSON.stringify(expenses, null, 2));
    } else {
      const errorText = await pendingExpensesResponse.text();
      console.error(`⚠️ Error ${pendingExpensesResponse.status}:`, errorText);
    }
    
  } catch (error) {
    console.error('🚨 Error general:', error.message);
  }
}

checkManagerUser();
