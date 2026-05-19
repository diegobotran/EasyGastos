require('dotenv').config();
const mongoose = require('mongoose');

// Usar la conexión del servidor
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/easygastos';

async function checkImageUri() {
  try {
    // Conectar a MongoDB
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    const Expense = mongoose.model('Expense', new mongoose.Schema({}, { strict: false }), 'expenses');
    
    console.log('🔍 Verificando imageuri en gastos...\n');
    
    // Obtener gastos con imagen
    const expensesWithImage = await Expense.find({ 
      imageuri: { $ne: null, $ne: '' }
    }).limit(5).lean();
    
    console.log(`📊 Gastos con imagen: ${expensesWithImage.length}\n`);
    
    expensesWithImage.forEach((expense, index) => {
      console.log(`Gasto ${index + 1}:`);
      console.log(`  ID: ${expense.id}`);
      console.log(`  Descripción: ${expense.description}`);
      console.log(`  imageuri: ${expense.imageuri}`);
      console.log(`  Email: ${expense.email}`);
      console.log('');
    });
    
    // Verificar si alguna imagen existe en el servidor
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(__dirname, '../uploads');
    
    console.log('📂 Verificando archivos en uploads...');
    console.log(`Directorio: ${uploadsDir}\n`);
    
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      console.log(`Archivos encontrados: ${files.length}`);
      files.slice(0, 10).forEach(file => {
        console.log(`  - ${file}`);
      });
    } else {
      console.log('⚠️ Directorio uploads no existe');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

checkImageUri();
