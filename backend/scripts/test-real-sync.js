/**
 * Prueba REAL de sincronización usando la API del backend
 * Simula exactamente lo que hace la función de sync en Settings
 */

const fetch = require('node-fetch');

// Configuración del usuario
const USER_EMAIL = 'mauricio.suarez@ronesdeguatemala.com';
const USER_PIN = '1011';

// IMPORTANTE: Usar la URL real del backend (AWS)
let BACKEND_URL = process.env.BACKEND_URL || 'http://23.20.116.61:3000';

console.log('🔐 ====== TEST REAL DE SINCRONIZACIÓN ======\n');
console.log(`📧 Usuario: ${USER_EMAIL}`);
console.log(`🔑 PIN: ${USER_PIN}`);
console.log(`🌐 Backend URL: ${BACKEND_URL}\n`);

async function testRealSync() {
  try {
    // PASO 1: Verificar conexión
    console.log('═══ PASO 1: Verificar Conexión ═══');
    try {
      const healthCheck = await fetch(`${BACKEND_URL}/api/health`, {
        method: 'GET',
        timeout: 5000
      });
      console.log(`✅ Backend responde: ${healthCheck.status} ${healthCheck.statusText}`);
    } catch (error) {
      console.error(`❌ No se puede conectar al backend: ${error.message}`);
      console.log('\n⚠️ Verifica que el backend esté corriendo en:', BACKEND_URL);
      return;
    }

    // PASO 2: Login y obtener token
    console.log('\n═══ PASO 2: Autenticación (Login) ═══');
    const loginResponse = await fetch(`${BACKEND_URL}/api/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: USER_EMAIL,
        pin: USER_PIN
      })
    });

    console.log(`Status: ${loginResponse.status} ${loginResponse.statusText}`);

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      console.error(`❌ Error en login: ${errorText}`);
      return;
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log(`✅ Login exitoso`);
    console.log(`🎫 Token obtenido: ${token.substring(0, 30)}...`);
    console.log(`👤 Usuario: ${loginData.user.firstName} ${loginData.user.lastName}`);

    // PASO 3: Obtener gastos del usuario (simular downloadExpensesFromBackend)
    console.log('\n═══ PASO 3: Descargar Gastos desde Backend ═══');
    const expensesResponse = await fetch(`${BACKEND_URL}/api/expenses?userEmail=${encodeURIComponent(USER_EMAIL)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log(`Status: ${expensesResponse.status} ${expensesResponse.statusText}`);

    if (expensesResponse.ok) {
      const expensesResult = await expensesResponse.json();
      const expenses = expensesResult.expenses || expensesResult;
      console.log(`✅ Gastos encontrados: ${expenses.length}`);
      
      if (expenses.length > 0) {
        console.log('\n📊 Primeros 5 gastos:');
        expenses.slice(0, 5).forEach((exp, idx) => {
          console.log(`  [${idx + 1}] ${exp.description}`);
          console.log(`      ID: ${exp.id}`);
          console.log(`      Monto: Q${exp.amount}`);
          console.log(`      Estado: ${exp.expenseStatus}`);
          console.log(`      LiquidationId: ${exp.liquidationId || 'N/A'}`);
          if (exp.expenseStatus === 'voided') {
            console.log(`      🚨 ANULADO: ${exp.voidedAt}`);
            console.log(`      Razón: ${exp.voidedReason}`);
          }
        });

        // Buscar gastos anulados
        const voidedExpenses = expenses.filter(e => e.expenseStatus === 'voided');
        if (voidedExpenses.length > 0) {
          console.log(`\n⚠️ Gastos anulados: ${voidedExpenses.length}`);
          voidedExpenses.forEach(e => {
            console.log(`   - ${e.description} (ID: ${e.id})`);
            console.log(`     LiquidationId: ${e.liquidationId || 'N/A'}`);
          });
        }

        // Buscar duplicados
        const grouped = {};
        expenses.forEach(e => {
          if (e.serie && e.noinvoice) {
            const key = `${e.serie}-${e.noinvoice}-${e.date}-${e.amount}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(e);
          }
        });

        console.log('\n🔍 Buscando duplicados...');
        let foundDuplicates = false;
        Object.entries(grouped).forEach(([key, exps]) => {
          if (exps.length > 1) {
            foundDuplicates = true;
            console.log(`\n🚨 DUPLICADO ENCONTRADO: ${key}`);
            exps.forEach(e => {
              console.log(`   [${e.id}] Estado: ${e.expenseStatus}, LiqID: ${e.liquidationId || 'N/A'}, Voided: ${e.voidedAt ? 'SÍ' : 'NO'}`);
            });
          }
        });
        if (!foundDuplicates) {
          console.log('✅ No hay duplicados');
        }
      }
    } else if (expensesResponse.status === 404) {
      console.log('ℹ️ No hay gastos en el backend (404)');
    } else {
      const errorText = await expensesResponse.text();
      console.log(`❌ Error: ${errorText}`);
    }

    // PASO 4: Obtener liquidaciones (simular downloadLiquidationsFromBackend)
    console.log('\n═══ PASO 4: Descargar Liquidaciones desde Backend ═══');
    const liquidationsResponse = await fetch(`${BACKEND_URL}/api/liquidations/user/${encodeURIComponent(USER_EMAIL)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log(`Status: ${liquidationsResponse.status} ${liquidationsResponse.statusText}`);

    if (liquidationsResponse.status === 304) {
      console.log('🎯 ¡ENCONTRADO! Servidor responde con 304 Not Modified');
      console.log('   Esto significa que el contenido no ha cambiado desde la última consulta');
      console.log('   El código actual NO maneja este caso específicamente');
    } else if (liquidationsResponse.ok) {
      const liquidations = await liquidationsResponse.json();
      console.log(`✅ Liquidaciones encontradas: ${liquidations.length}`);
      
      if (liquidations.length > 0) {
        console.log('\n📋 Liquidaciones:');
        
        // Obtener gastos para verificación
        let expensesData = [];
        if (expensesResponse.ok) {
          const expensesResponse2 = await fetch(`${BACKEND_URL}/api/expenses?userEmail=${encodeURIComponent(USER_EMAIL)}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (expensesResponse2.ok) {
            expensesData = await expensesResponse2.json();
          }
        }
        
        liquidations.forEach((liq, idx) => {
          console.log(`\n[${idx + 1}] Liquidación ${liq.id}`);
          console.log(`    Estado: ${liq.status}`);
          console.log(`    Total: Q${liq.totalAmount}`);
          console.log(`    Gastos: ${liq.expenseIds.length}`);
          console.log(`    ExpenseIds: ${liq.expenseIds.join(', ')}`);
          
          // Verificar si algún gasto está anulado
          if (expensesData.length > 0) {
            const voidedInLiq = liq.expenseIds.filter(expId => {
              const exp = expensesData.find(e => e.id === expId);
              return exp && exp.expenseStatus === 'voided';
            });
            
            if (voidedInLiq.length > 0) {
              console.log(`    🚨 PROBLEMA: Contiene ${voidedInLiq.length} gasto(s) anulado(s): ${voidedInLiq.join(', ')}`);
            }
          }
        });
      }
    } else if (liquidationsResponse.status === 404) {
      console.log('ℹ️ No hay liquidaciones en el backend (404)');
    } else {
      const errorText = await liquidationsResponse.text();
      console.log(`❌ Error: ${errorText}`);
    }

    // PASO 5: Simular sincronización UPLOAD de gastos pendientes
    console.log('\n═══ PASO 5: Simular Upload de Gastos Pendientes ═══');
    console.log('ℹ️ Esto requeriría acceso a la BD local SQLite del dispositivo');
    console.log('   En un test real, aquí se subirían gastos con needsSync=true');

    // PASO 6: Simular sincronización UPLOAD de liquidaciones pendientes
    console.log('\n═══ PASO 6: Simular Upload de Liquidaciones Pendientes ═══');
    console.log('ℹ️ Esto requeriría acceso a la BD local SQLite del dispositivo');
    console.log('   En un test real, aquí se subirían liquidaciones con synced=false');

    console.log('\n═══════════════════════════════════════════════════');
    console.log('🎯 RESUMEN DEL TEST');
    console.log('═══════════════════════════════════════════════════\n');

    console.log('✅ Conexión al backend: OK');
    console.log('✅ Autenticación: OK');
    console.log(`📊 Gastos en backend: ${expensesResponse.ok ? 'Consultados' : 'Error/Sin datos'}`);
    console.log(`📋 Liquidaciones en backend: ${liquidationsResponse.ok ? 'Consultadas' : liquidationsResponse.status === 304 ? '304 Not Modified' : 'Error/Sin datos'}`);

    if (liquidationsResponse.status === 304) {
      console.log('\n🚨 PROBLEMA IDENTIFICADO:');
      console.log('   El servidor responde con 304 en GET /api/liquidations/:userId');
      console.log('   El código en BackendSyncService.downloadLiquidationsFromBackend()');
      console.log('   NO maneja específicamente el código 304');
      console.log('\n   Línea problemática en BackendSyncService.ts (~línea 1000):');
      console.log('   if (!response.ok) {');
      console.log('     // Aquí 304 entra porque !response.ok (304 no es ok)');
      console.log('     return { success: false, count: 0, error: ... }');
      console.log('   }');
    }

    console.log('\n✅ Test completado\n');

  } catch (error) {
    console.error('❌ Error en el test:', error.message);
    console.error(error);
  }
}

// Ejecutar el test
testRealSync();
