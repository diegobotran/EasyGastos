const fetch = require('node-fetch');

const BACKEND_URL = 'http://23.20.116.61:3000';
const TEST_EMAIL = 'mauricio.suarez@ronesdeguatemala.com';
const TEST_PIN = '1011';

async function checkRemoteImages() {
  try {
    console.log('🔐 Obteniendo token de autenticación...');
    
    // Login para obtener token
    const loginResponse = await fetch(`${BACKEND_URL}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, pin: TEST_PIN })
    });
    
    const loginData = await loginResponse.json();
    if (!loginData.token) {
      console.error('❌ Error obteniendo token:', loginData);
      return;
    }
    
    console.log('✅ Token obtenido\n');
    
    // Obtener liquidación pendiente
    console.log('📋 Obteniendo liquidación ID: 1766599800841...');
    const liqResponse = await fetch(`${BACKEND_URL}/api/liquidations/1766599800841/expenses`, {
      headers: { 
        'Authorization': `Bearer ${loginData.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const expenses = await liqResponse.json();
    console.log(`✅ Gastos obtenidos: ${expenses.length}\n`);
    
    // Revisar cada gasto
    expenses.forEach((expense, index) => {
      console.log(`Gasto ${index + 1}:`);
      console.log(`  ID: ${expense.id}`);
      console.log(`  Descripción: ${expense.description}`);
      console.log(`  Monto: ${expense.currency}${expense.amount}`);
      console.log(`  imageuri: ${expense.imageuri || 'NULL'}`);
      
      if (expense.imageuri) {
        console.log(`  URL completa: ${BACKEND_URL}/uploads/${expense.imageuri}`);
      }
      console.log('');
    });
    
    // Verificar si alguna imagen es accesible
    for (const expense of expenses) {
      if (expense.imageuri) {
        console.log(`📷 Verificando imagen: ${expense.imageuri}`);
        const imageUrl = `${BACKEND_URL}/uploads/${expense.imageuri}`;
        
        const imgResponse = await fetch(imageUrl);
        console.log(`  Status: ${imgResponse.status} ${imgResponse.statusText}`);
        console.log(`  Content-Type: ${imgResponse.headers.get('content-type')}`);
        console.log('');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkRemoteImages();
