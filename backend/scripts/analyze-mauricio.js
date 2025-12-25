const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Definir esquemas inline
const expenseSchema = new mongoose.Schema({
  id: String,
  userEmail: String,
  description: String,
  amount: Number,
  date: String,
  category: String,
  status: String,
  expenseStatus: String,
  serie: String,
  noinvoice: String,
  nit: String,
  proveedor: String,
  centro: String,
  cuenta: String,
  ordenco: String,
  managerEmail: String,
  imageuri: String,
  totiva: Number,
  currency: String,
  liquidationId: String,
  voidedAt: Date,
  voidedReason: String,
  needsSync: Boolean,
  lastSync: Date
}, { collection: 'expenses', timestamps: true });

const liquidationSchema = new mongoose.Schema({
  id: String,
  userId: String,
  employeeName: String,
  createdDate: String,
  expenseIds: [String],
  totalAmount: Number,
  status: String,
  managerComments: String,
  submittedDate: String,
  approvedDate: String,
  rejectedDate: String
}, { collection: 'liquidations', timestamps: true });

const Expense = mongoose.model('Expense', expenseSchema);
const Liquidation = mongoose.model('Liquidation', liquidationSchema);

async function analyze() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/easygastos';
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado\n');

    console.log('====== ANÁLISIS DE DATOS - mauricio.suarez@ronesdeguatemala.com ======\n');

    // Obtener todos los gastos
    const expenses = await Expense.find({ 
      userEmail: 'mauricio.suarez@ronesdeguatemala.com' 
    }).sort({ createdAt: -1 }).limit(30);

    console.log(`📊 ÚLTIMOS 30 GASTOS (Total encontrados: ${expenses.length}):\n`);
    expenses.forEach((e, idx) => {
      console.log(`[${idx + 1}] ID: ${e.id}`);
      console.log(`    Serie: ${e.serie || 'N/A'} | No: ${e.noinvoice || 'N/A'}`);
      console.log(`    Fecha: ${e.date} | Monto: Q${e.amount}`);
      console.log(`    Status: ${e.expenseStatus} | LiqID: ${e.liquidationId || 'N/A'}`);
      console.log(`    VoidedAt: ${e.voidedAt || 'N/A'}`);
      console.log(`    VoidedReason: ${e.voidedReason || 'N/A'}`);
      console.log(`    Created: ${e.createdAt}`);
      console.log('');
    });

    // Obtener todas las liquidaciones
    const liquidations = await Liquidation.find({ 
      userId: 'mauricio.suarez@ronesdeguatemala.com' 
    }).sort({ createdDate: -1 });

    console.log(`\n📋 LIQUIDACIONES (Total: ${liquidations.length}):\n`);
    liquidations.forEach((l, idx) => {
      console.log(`[${idx + 1}] ID: ${l.id}`);
      console.log(`    Status: ${l.status}`);
      console.log(`    Gastos: ${l.expenseIds.length}`);
      console.log(`    Total: Q${l.totalAmount}`);
      console.log(`    Fecha Creación: ${l.createdDate}`);
      console.log(`    ExpenseIds: ${l.expenseIds.join(', ')}`);
      console.log('');
      
      // Verificar si algún gasto en la liquidación está anulado
      for (const expId of l.expenseIds) {
        const exp = expenses.find(e => e.id === expId);
        if (exp && exp.expenseStatus === 'voided') {
          console.log(`    ⚠️ ALERTA: Gasto ${expId} está ANULADO (voidedAt: ${exp.voidedAt})`);
        }
        if (exp && exp.liquidationId !== l.id) {
          console.log(`    ⚠️ INCONSISTENCIA: Gasto ${expId} tiene liquidationId diferente: ${exp.liquidationId}`);
        }
        if (!exp) {
          console.log(`    ❌ ERROR: Gasto ${expId} no existe en la BD`);
        }
      }
      console.log('');
    });

    // Buscar duplicados potenciales
    console.log('\n🔍 BUSCANDO DUPLICADOS POTENCIALES:\n');
    const grouped = {};
    expenses.forEach(e => {
      const key = `${e.serie}-${e.noinvoice}-${e.date}-${e.amount}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    });

    Object.entries(grouped).forEach(([key, exps]) => {
      if (exps.length > 1) {
        console.log(`⚠️ DUPLICADO DETECTADO: ${key}`);
        exps.forEach(e => {
          console.log(`   - ID: ${e.id} | Status: ${e.expenseStatus} | LiqID: ${e.liquidationId || 'N/A'} | Voided: ${e.voidedAt ? 'SÍ' : 'NO'}`);
        });
        console.log('');
      }
    });

    await mongoose.disconnect();
    console.log('\n✅ Análisis completado');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyze();
