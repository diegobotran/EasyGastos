require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/easygastos';

async function checkImages() {
  try {
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    const Expense = mongoose.model('Expense', new mongoose.Schema({}, { strict: false }), 'expenses');
    
    // Buscar gastos con imageuri que NO sea null
    const expensesWithImage = await Expense.find({ 
      imageuri: { $exists: true, $ne: null, $ne: '' }
    }).lean();
    
    console.log(`📊 Total gastos en BD: ${await Expense.countDocuments()}`);
    console.log(`📊 Gastos con imageuri: ${expensesWithImage.length}\n`);
    
    if (expensesWithImage.length > 0) {
      console.log('Ejemplos de imageuri:\n');
      expensesWithImage.slice(0, 5).forEach((expense, index) => {
        console.log(`${index + 1}. ${expense.description}`);
        console.log(`   imageuri: "${expense.imageuri}"`);
        console.log(`   Longitud: ${expense.imageuri?.length || 0}`);
        console.log('');
      });
    }
    
    // Verificar archivos en uploads
    const uploadsDir = path.join(__dirname, '../uploads');
    console.log('📂 Estructura de uploads:\n');
    
    function listDirectory(dir, prefix = '') {
      try {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
          const fullPath = path.join(dir, item);
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            console.log(`${prefix}📁 ${item}/`);
            listDirectory(fullPath, prefix + '  ');
          } else {
            console.log(`${prefix}📄 ${item} (${(stats.size / 1024).toFixed(2)} KB)`);
          }
        });
      } catch (error) {
        console.log(`${prefix}❌ Error: ${error.message}`);
      }
    }
    
    listDirectory(uploadsDir);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

checkImages();
