const { initDatabase, closeDatabase, models } = require('./database/init');
const ManagerEmployeeLink = require('./models/ManagerEmployeeLink');
const bcrypt = require('bcrypt');

/**
 * Script para crear datos de ejemplo en la base de datos
 */
async function createSampleData() {
  try {
    console.log('🔧 Creando datos de ejemplo...\n');
    
    // Inicializar conexión
    await initDatabase();
    
    const { User, Category, Expense } = models;
    
    // 1. Crear usuarios de ejemplo
    console.log('👥 Creando usuarios...');
    
    const sampleUsers = [
      {
        email: 'admin@empresa.com',
        firstName: 'Admin',
        lastName: 'Sistema',
        pin: await bcrypt.hash('1234', 10),
        department: 'IT',
        isManager: true,
        isActive: true
      },
      {
        email: 'carlos.manager@empresa.com',
        firstName: 'Carlos',
        lastName: 'Rodríguez',
        pin: await bcrypt.hash('1234', 10),
        department: 'Ventas',
        isManager: true,
        isActive: true
      },
      {
        email: 'ana.empleada@empresa.com',
        firstName: 'Ana',
        lastName: 'García',
        pin: await bcrypt.hash('1234', 10),
        department: 'Ventas',
        isManager: false,
        isActive: true
      },
      {
        email: 'juan.empleado@empresa.com',
        firstName: 'Juan',
        lastName: 'López',
        pin: await bcrypt.hash('1234', 10),
        department: 'Ventas',
        isManager: false,
        isActive: true
      },
      {
        email: 'maria.finanzas@empresa.com',
        firstName: 'María',
        lastName: 'Fernández',
        pin: await bcrypt.hash('1234', 10),
        department: 'Finanzas',
        isManager: true,
        isActive: true
      }
    ];
    
    for (const userData of sampleUsers) {
      try {
        await User.findOneAndUpdate(
          { email: userData.email },
          userData,
          { upsert: true, new: true }
        );
        console.log(`✅ Usuario creado: ${userData.firstName} ${userData.lastName}`);
      } catch (error) {
        console.log(`⚠️ Usuario ya existe: ${userData.email}`);
      }
    }
    
    // 2. Crear relaciones manager-empleado
    console.log('\n🔗 Creando relaciones manager-empleado...');
    
    const managerLinks = [
      {
        employeeEmail: 'ana.empleada@empresa.com',
        managerEmail: 'carlos.manager@empresa.com',
        department: 'Ventas',
        level: 1
      },
      {
        employeeEmail: 'juan.empleado@empresa.com',
        managerEmail: 'carlos.manager@empresa.com',
        department: 'Ventas',
        level: 1
      },
      {
        employeeEmail: 'carlos.manager@empresa.com',
        managerEmail: 'maria.finanzas@empresa.com',
        department: 'Finanzas',
        level: 2
      }
    ];
    
    for (const linkData of managerLinks) {
      try {
        await ManagerEmployeeLink.findOneAndUpdate(
          { 
            employeeEmail: linkData.employeeEmail, 
            managerEmail: linkData.managerEmail 
          },
          linkData,
          { upsert: true, new: true }
        );
        console.log(`✅ Relación creada: ${linkData.employeeEmail} → ${linkData.managerEmail}`);
      } catch (error) {
        console.log(`⚠️ Relación ya existe: ${linkData.employeeEmail} → ${linkData.managerEmail}`);
      }
    }
    
    // 3. Crear categorías de ejemplo
    console.log('\n📁 Creando categorías...');
    
    const sampleCategories = [
      {
        id: 'cat-transport-ana',
        userEmail: 'ana.empleada@empresa.com',
        name: 'Transporte',
        icon: 'car',
        centro: 'CENT001',
        cuenta: 'CUE001',
        ordenco: 'ORD001'
      },
      {
        id: 'cat-meals-ana',
        userEmail: 'ana.empleada@empresa.com',
        name: 'Comidas',
        icon: 'restaurant',
        centro: 'CENT001',
        cuenta: 'CUE002',
        ordenco: 'ORD001'
      },
      {
        id: 'cat-transport-juan',
        userEmail: 'juan.empleado@empresa.com',
        name: 'Transporte',
        icon: 'car',
        centro: 'CENT002',
        cuenta: 'CUE001',
        ordenco: 'ORD002'
      },
      {
        id: 'cat-office-carlos',
        userEmail: 'carlos.manager@empresa.com',
        name: 'Material Oficina',
        icon: 'briefcase',
        centro: 'CENT003',
        cuenta: 'CUE003',
        ordenco: 'ORD003'
      }
    ];
    
    for (const categoryData of sampleCategories) {
      try {
        await Category.findOneAndUpdate(
          { id: categoryData.id },
          categoryData,
          { upsert: true, new: true }
        );
        console.log(`✅ Categoría creada: ${categoryData.name} (${categoryData.userEmail})`);
      } catch (error) {
        console.log(`⚠️ Categoría ya existe: ${categoryData.id}`);
      }
    }
    
    // 4. Crear gastos de ejemplo
    console.log('\n💰 Creando gastos...');
    
    const sampleExpenses = [
      {
        id: 'exp-001',
        userEmail: 'ana.empleada@empresa.com',
        description: 'Taxi al aeropuerto - viaje de trabajo',
        amount: 25.50,
        date: new Date('2024-12-01').toISOString(),
        category: 'Transporte',
        status: 'ENVIADO_JEFE',
        supplier: 'Taxi Express',
        department: 'Ventas',
        notes: 'Viaje para reunión con cliente importante',
        currency: 'EUR'
      },
      {
        id: 'exp-002',
        userEmail: 'ana.empleada@empresa.com',
        description: 'Almuerzo con cliente',
        amount: 45.00,
        date: new Date('2024-12-02').toISOString(),
        category: 'Comidas',
        status: 'ENVIADO_JEFE',
        supplier: 'Restaurante El Buen Gusto',
        department: 'Ventas',
        notes: 'Reunión comercial para cerrar contrato',
        currency: 'EUR'
      },
      {
        id: 'exp-003',
        userEmail: 'juan.empleado@empresa.com',
        description: 'Combustible vehículo empresa',
        amount: 60.00,
        date: new Date('2024-12-03').toISOString(),
        category: 'Transporte',
        status: 'ENVIADO_JEFE',
        supplier: 'Gasolinera BP',
        department: 'Ventas',
        notes: 'Ruta comercial zona norte',
        currency: 'EUR'
      },
      {
        id: 'exp-004',
        userEmail: 'carlos.manager@empresa.com',
        description: 'Material de oficina para equipo',
        amount: 120.00,
        date: new Date('2024-12-04').toISOString(),
        category: 'Material Oficina',
        status: 'APROBADO_JEFE',
        supplier: 'Office Depot',
        department: 'Ventas',
        notes: 'Suministros para el nuevo trimestre',
        currency: 'EUR'
      }
    ];
    
    for (const expenseData of sampleExpenses) {
      try {
        await Expense.findOneAndUpdate(
          { id: expenseData.id },
          expenseData,
          { upsert: true, new: true }
        );
        console.log(`✅ Gasto creado: ${expenseData.description} (${expenseData.amount}€)`);
      } catch (error) {
        console.log(`⚠️ Gasto ya existe: ${expenseData.id}`);
      }
    }
    
    console.log('\n✅ Datos de ejemplo creados exitosamente');
    console.log('\n📋 Credenciales de acceso:');
    console.log('┌──────────────────────────────────────────────┐');
    console.log('│  Email: ana.empleada@empresa.com  PIN: 1234  │');
    console.log('│  Email: juan.empleado@empresa.com PIN: 1234  │');
    console.log('│  Email: carlos.manager@empresa.com PIN: 1234 │');
    console.log('│  Email: maria.finanzas@empresa.com PIN: 1234 │');
    console.log('│  Email: admin@empresa.com          PIN: 1234 │');
    console.log('└──────────────────────────────────────────────┘');
    
    console.log('\n💡 Carlos es manager de Ana y Juan');
    console.log('💡 María es manager de Carlos');
    console.log('💡 Hay gastos pendientes de aprobación para Carlos');
    
  } catch (error) {
    console.error('\n❌ Error creando datos de ejemplo:', error);
    throw error;
  } finally {
    await closeDatabase();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  createSampleData().catch(console.error);
}

module.exports = { createSampleData };