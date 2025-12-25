/**
 * Script para sincronizar vínculos manager-empleado
 * Crea registros en ManagerEmployeeLink basándose en el campo managerEmail de los usuarios
 * 
 * Uso: node scripts/sync-manager-links.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../database/init').User;
const ManagerEmployeeLink = require('../models/ManagerEmployeeLink');

async function syncManagerLinks() {
  try {
    console.log('🔄 Iniciando sincronización de vínculos manager-empleado...\n');

    // Conectar a la base de datos
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/easygastos';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    // Obtener todos los usuarios que tienen un manager asignado
    const usersWithManager = await User.find({ 
      managerEmail: { $ne: null, $exists: true },
      isActive: true 
    });

    console.log(`📊 Encontrados ${usersWithManager.length} usuarios con manager asignado\n`);

    let created = 0;
    let existing = 0;
    let errors = 0;

    // Crear vínculos para cada usuario
    for (const user of usersWithManager) {
      try {
        // Verificar que el manager existe (opcional pero recomendado)
        const managerExists = await User.findOne({ 
          email: user.managerEmail,
          isActive: true 
        });

        if (!managerExists) {
          console.log(`⚠️  Manager no encontrado: ${user.managerEmail} (empleado: ${user.email})`);
          continue;
        }

        // Crear o actualizar el vínculo
        const result = await ManagerEmployeeLink.findOneAndUpdate(
          { 
            employeeEmail: user.email,
            managerEmail: user.managerEmail
          },
          {
            employeeEmail: user.email,
            managerEmail: user.managerEmail,
            department: user.department,
            level: 1, // Manager directo
            isActive: true,
            assignedBy: 'system-sync'
          },
          { 
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
          }
        );

        if (result) {
          created++;
          console.log(`✅ ${user.email} → ${user.managerEmail}`);
        }

      } catch (error) {
        errors++;
        console.error(`❌ Error con ${user.email}:`, error.message);
      }
    }

    console.log('\n📈 Resumen de sincronización:');
    console.log(`   - Vínculos procesados: ${created}`);
    console.log(`   - Errores: ${errors}`);
    
    // Mostrar estadísticas finales
    const totalLinks = await ManagerEmployeeLink.countDocuments({ isActive: true });
    console.log(`\n✅ Total de vínculos activos en sistema: ${totalLinks}`);

  } catch (error) {
    console.error('❌ Error en sincronización:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

// Ejecutar el script
syncManagerLinks();
