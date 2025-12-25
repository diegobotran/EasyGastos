/**
 * Script para analizar el estado de sincronización usando autenticación real
 */

const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Esquemas
const userSchema = new mongoose.Schema({
  email: String,
  firstName: String,
  lastName: String,
  pin: String,
  isActive: Boolean,
  isManager: Boolean
}, { collection: 'users', timestamps: true });

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
  liquidationId: String,
  voidedAt: Date,
  voidedReason: String,
  needsSync: Boolean
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

const User = mongoose.model('User', userSchema);
const Expense = mongoose.model('Expense', expenseSchema);
const Liquidation = mongoose.model('Liquidation', liquidationSchema);

async function analyze() {
  try {
    // Credenciales del usuario
    const USER_EMAIL = 'mauricio.suarez@ronesdeguatemala.com';
    const USER_PIN = '1011';

    console.log('🔐 ====== ANÁLISIS CON AUTENTICACIÓN ======\n');
    console.log(`📧 Usuario: ${USER_EMAIL}`);
    console.log(`🔑 PIN: ${USER_PIN}\n`);

    // Conectar a MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/easygastos';
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado\n');

    // Autenticar usuario
    console.log('🔍 Buscando usuario...');
    const user = await User.findOne({ email: USER_EMAIL });
    
    if (!user) {
      console.log('❌ Usuario no encontrado en la base de datos');
      console.log('⚠️ El usuario podría no haber sincronizado nunca con el backend\n');
      await mongoose.disconnect();
      return;
    }

    console.log(`✅ Usuario encontrado: ${user.firstName} ${user.lastName}`);
    console.log(`   - isManager: ${user.isManager}`);
    console.log(`   - isActive: ${user.isActive}\n`);

    // Verificar PIN
    console.log('🔐 Verificando PIN...');
    const pinMatch = await bcrypt.compare(USER_PIN, user.pin);
    
    if (!pinMatch) {
      console.log('❌ PIN incorrecto');
      await mongoose.disconnect();
      return;
    }

    console.log('✅ PIN correcto\n');

    // Generar token
    const JWT_SECRET = process.env.JWT_SECRET || 'easygastos-secret-key-2024';
    const token = jwt.sign(
      { 
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isManager: user.isManager 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('🎫 Token generado exitosamente\n');
    console.log('═══════════════════════════════════════════════════');
    console.log('📊 ANÁLISIS DE DATOS');
    console.log('═══════════════════════════════════════════════════\n');

    // Obtener todos los gastos del usuario
    const expenses = await Expense.find({ userEmail: USER_EMAIL }).sort({ createdAt: -1 });
    
    console.log(`💰 GASTOS TOTALES: ${expenses.length}\n`);

    if (expenses.length === 0) {
      console.log('⚠️ No hay gastos en el backend para este usuario');
      console.log('   Esto significa que el usuario NO ha sincronizado desde la app móvil');
      console.log('   o los datos están solo localmente en el dispositivo.\n');
    } else {
      // Analizar gastos por estado
      const byStatus = {};
      expenses.forEach(e => {
        const status = e.expenseStatus || 'undefined';
        byStatus[status] = (byStatus[status] || 0) + 1;
      });

      console.log('📈 Gastos por Estado:');
      Object.entries(byStatus).forEach(([status, count]) => {
        console.log(`   - ${status}: ${count}`);
      });
      console.log('');

      // Gastos anulados
      const voidedExpenses = expenses.filter(e => e.expenseStatus === 'voided');
      if (voidedExpenses.length > 0) {
        console.log(`⚠️ GASTOS ANULADOS: ${voidedExpenses.length}`);
        voidedExpenses.forEach(e => {
          console.log(`   [${e.id}] ${e.description} - Q${e.amount}`);
          console.log(`      Serie: ${e.serie} | No: ${e.noinvoice}`);
          console.log(`      Anulado: ${e.voidedAt}`);
          console.log(`      Razón: ${e.voidedReason}`);
          console.log(`      LiquidationId: ${e.liquidationId || 'N/A'}`);
          console.log('');
        });
      }

      // Gastos en liquidación
      const inLiquidation = expenses.filter(e => e.expenseStatus === 'in_liquidation');
      if (inLiquidation.length > 0) {
        console.log(`📦 GASTOS EN LIQUIDACIÓN: ${inLiquidation.length}`);
        inLiquidation.forEach(e => {
          console.log(`   [${e.id}] ${e.description} - Q${e.amount}`);
          console.log(`      LiquidationId: ${e.liquidationId}`);
        });
        console.log('');
      }

      // Buscar duplicados
      console.log('🔍 BUSCANDO DUPLICADOS (misma serie, no, fecha, monto):\n');
      const grouped = {};
      expenses.forEach(e => {
        if (e.serie && e.noinvoice) {
          const key = `${e.serie}-${e.noinvoice}-${e.date}-${e.amount}`;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(e);
        }
      });

      let foundDuplicates = false;
      Object.entries(grouped).forEach(([key, exps]) => {
        if (exps.length > 1) {
          foundDuplicates = true;
          console.log(`🚨 DUPLICADO: ${key}`);
          exps.forEach(e => {
            console.log(`   [${e.id}]`);
            console.log(`      Status: ${e.expenseStatus}`);
            console.log(`      LiqID: ${e.liquidationId || 'N/A'}`);
            console.log(`      Voided: ${e.voidedAt ? 'SÍ (' + e.voidedAt + ')' : 'NO'}`);
            console.log(`      Created: ${e.createdAt}`);
          });
          console.log('');
        }
      });

      if (!foundDuplicates) {
        console.log('✅ No se encontraron duplicados\n');
      }
    }

    // Obtener liquidaciones
    const liquidations = await Liquidation.find({ userId: USER_EMAIL }).sort({ createdDate: -1 });
    
    console.log(`📋 LIQUIDACIONES TOTALES: ${liquidations.length}\n`);

    if (liquidations.length === 0) {
      console.log('⚠️ No hay liquidaciones en el backend para este usuario\n');
    } else {
      liquidations.forEach((liq, idx) => {
        console.log(`[${idx + 1}] Liquidación ${liq.id}`);
        console.log(`    Status: ${liq.status}`);
        console.log(`    Total: Q${liq.totalAmount}`);
        console.log(`    Gastos: ${liq.expenseIds.length}`);
        console.log(`    Fecha Creación: ${liq.createdDate}`);
        console.log(`    Enviada: ${liq.submittedDate || 'N/A'}`);
        console.log(`    Aprobada: ${liq.approvedDate || 'N/A'}`);
        console.log(`    Rechazada: ${liq.rejectedDate || 'N/A'}`);
        console.log(`    ExpenseIds: ${liq.expenseIds.join(', ')}`);
        
        // Verificar integridad de los gastos en la liquidación
        console.log(`\n    🔍 Verificando gastos en esta liquidación:`);
        let hasIssues = false;
        
        for (const expId of liq.expenseIds) {
          const exp = expenses.find(e => e.id === expId);
          
          if (!exp) {
            console.log(`       ❌ Gasto ${expId} NO EXISTE en la BD`);
            hasIssues = true;
          } else {
            if (exp.expenseStatus === 'voided') {
              console.log(`       🚨 Gasto ${expId} está ANULADO`);
              console.log(`          Anulado: ${exp.voidedAt}`);
              console.log(`          Razón: ${exp.voidedReason}`);
              hasIssues = true;
            } else if (exp.liquidationId !== liq.id) {
              console.log(`       ⚠️ Gasto ${expId} tiene liquidationId diferente: ${exp.liquidationId}`);
              hasIssues = true;
            } else {
              console.log(`       ✅ Gasto ${expId} OK - ${exp.description} Q${exp.amount}`);
            }
          }
        }
        
        if (!hasIssues) {
          console.log(`       ✅ Todos los gastos están correctos`);
        }
        
        console.log('');
      });
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('🎯 DIAGNÓSTICO');
    console.log('═══════════════════════════════════════════════════\n');

    if (expenses.length === 0 && liquidations.length === 0) {
      console.log('⚠️ NO HAY DATOS EN EL BACKEND');
      console.log('');
      console.log('Posibles causas:');
      console.log('1. El usuario nunca ha sincronizado desde la app móvil');
      console.log('2. Los datos están solo en el dispositivo local (SQLite)');
      console.log('3. El usuario está usando un backend diferente');
      console.log('4. La configuración del backend en la app no apunta a este servidor');
      console.log('');
      console.log('✅ PARA VERIFICAR:');
      console.log('1. Abrir la app móvil con el usuario');
      console.log('2. Ir a Settings');
      console.log('3. Presionar "Sincronizar Ahora"');
      console.log('4. Observar los logs en la consola de la app');
      console.log('5. Volver a ejecutar este script');
    } else {
      // Buscar el problema específico reportado
      const voidedInLiquidation = expenses.filter(e => 
        e.expenseStatus === 'voided' && e.liquidationId
      );
      
      if (voidedInLiquidation.length > 0) {
        console.log('🚨 PROBLEMA ENCONTRADO: Gastos anulados con liquidationId');
        console.log('');
        voidedInLiquidation.forEach(e => {
          console.log(`   Gasto: ${e.id} - ${e.description}`);
          console.log(`   Estado: ${e.expenseStatus}`);
          console.log(`   LiquidationId: ${e.liquidationId}`);
          console.log(`   Anulado: ${e.voidedAt}`);
          console.log('');
        });
        console.log('ESTE ES EL PROBLEMA:');
        console.log('- Estos gastos deberían haber limpiado su liquidationId al ser anulados');
        console.log('- O deberían haber sido removidos de la liquidación ANTES de anularse');
      }
      
      const liquidationsWithVoidedExpenses = [];
      for (const liq of liquidations) {
        for (const expId of liq.expenseIds) {
          const exp = expenses.find(e => e.id === expId);
          if (exp && exp.expenseStatus === 'voided') {
            liquidationsWithVoidedExpenses.push(liq);
            break;
          }
        }
      }
      
      if (liquidationsWithVoidedExpenses.length > 0) {
        console.log('🚨 PROBLEMA: Liquidaciones con gastos anulados');
        console.log('');
        liquidationsWithVoidedExpenses.forEach(liq => {
          console.log(`   Liquidación: ${liq.id}`);
          console.log(`   Estado: ${liq.status}`);
          console.log('   Esta liquidación NO puede sincronizarse correctamente');
        });
      }
    }

    console.log('');
    console.log('✅ Análisis completado');
    console.log('');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyze();
