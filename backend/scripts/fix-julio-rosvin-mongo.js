// Script de MongoDB para corregir liquidaciones de Julio-Rosvin
// Ejecutar este script directamente en MongoDB

// ⚠️  ADVERTENCIA: Este script modifica datos de producción
// ⚠️  Leer POLITICA-CAMBIOS-PRODUCCION.md antes de ejecutar
// ⚠️  Hacer backup antes de ejecutar

// ========================================
// CONFIGURACIÓN
// ========================================

// ⚠️  CAMBIAR ESTOS VALORES ANTES DE EJECUTAR:
const JULIO_EMAIL = "julio@ejemplo.com";  // ← Email del manager (Julio)
const ROSVIN_EMAIL = "rosvin@ejemplo.com"; // ← Email del empleado (Rosvin)

// Modo seguro: Solo muestra qué haría, NO hace cambios
const DRY_RUN = true;  // ← Cambiar a false para ejecutar cambios reales

if (DRY_RUN) {
    print("⚠️  MODO DRY RUN ACTIVADO - No se harán cambios reales");
    print("   Cambia DRY_RUN = false para aplicar cambios\n");
}

print("\n========================================");
print("   CORRECTOR DE LIQUIDACIONES");
print("   Julio (Manager) <-> Rosvin (Empleado)");
print("========================================\n");

// ========================================
// 1. VERIFICAR USUARIOS
// ========================================

print("1️⃣  Verificando usuarios...\n");

const julio = db.users.findOne({ email: JULIO_EMAIL });
const rosvin = db.users.findOne({ email: ROSVIN_EMAIL });

if (!julio) {
    print(`❌ ERROR: Usuario "${JULIO_EMAIL}" no encontrado`);
    quit();
}

if (!rosvin) {
    print(`❌ ERROR: Usuario "${ROSVIN_EMAIL}" no encontrado`);
    quit();
}

print(`✅ Julio encontrado: ${julio.firstName} ${julio.lastName}`);
print(`✅ Rosvin encontrado: ${rosvin.firstName} ${rosvin.lastName}\n`);

// ========================================
// 2. VERIFICAR Y ACTUALIZAR MANAGER DE ROSVIN
// ========================================

print("2️⃣  Verificando manager de Rosvin...\n");

if (rosvin.managerEmail !== JULIO_EMAIL) {
    print(`⚠️  Manager actual de Rosvin: ${rosvin.managerEmail || "NINGUNO"}`);
    print(`🔧 Se actualizará manager a: ${JULIO_EMAIL}...`);
    
    if (DRY_RUN) {
        print(`   [DRY RUN] db.users.updateOne({ email: "${ROSVIN_EMAIL}" }, { $set: { managerEmail: "${JULIO_EMAIL}" } })`);
        print(`   ↑ Este cambio NO se aplicó (modo dry run)\n`);
    } else {
        const updateUser = db.users.updateOne(
            { email: ROSVIN_EMAIL },
            { 
                $set: { 
                    managerEmail: JULIO_EMAIL,
                    updatedAt: new Date()
                } 
            }
        );
        
        if (updateUser.modifiedCount > 0) {
            print(`✅ Manager de Rosvin actualizado correctamente\n`);
        } else {
            print(`❌ No se pudo actualizar el manager\n`);
        }
    }
} else {
    print(`✅ Rosvin ya tiene a Julio como manager (no se requiere cambio)\n`);
}

// ========================================
// 3. VERIFICAR Y ACTUALIZAR LIQUIDACIONES
// ========================================

print("3️⃣  Verificando liquidaciones de Rosvin...\n");

const liquidaciones = db.liquidations.find({ userId: ROSVIN_EMAIL }).toArray();

print(`📋 Total de liquidaciones de Rosvin: ${liquidaciones.length}\n`);

if (liquidaciones.length === 0) {
    print("⚠️  No hay liquidaciones de Rosvin en el sistema");
    print("   Rosvin debe crear y enviar liquidaciones desde la app\n");
} else {
    // Mostrar resumen por estado
    const porEstado = {};
    liquidaciones.forEach(liq => {
        porEstado[liq.status] = (porEstado[liq.status] || 0) + 1;
    });
    
    print("Resumen por estado:");
    Object.keys(porEstado).forEach(estado => {
        print(`   ${estado}: ${porEstado[estado]}`);
    });
    print("");
    
    // Verificar liquidaciones sin manager o con manager incorrecto
    const sinManagerCorrecto = liquidaciones.filter(liq => 
        !liq.managerEmail || liq.managerEmail !== JULIO_EMAIL
    );
    
    if (sinManagerCorrecto.length > 0) {
        print(`⚠️  Liquidaciones sin manager correcto: ${sinManagerCorrecto.length}`);
        print(`   (Total de liquidaciones: ${liquidaciones.length})`);
        print(`🔧 Se asignará a Julio como manager de estas liquidaciones...\n`);
        
        if (DRY_RUN) {
            print(`   [DRY RUN] Se actualizarían las siguientes liquidaciones:`);
            sinManagerCorrecto.forEach(liq => {
                print(`   - ID: ${liq.id} | Status: ${liq.status} | Manager actual: ${liq.managerEmail || "NINGUNO"}`);
            });
            print(`   ↑ Estos cambios NO se aplicaron (modo dry run)\n`);
        } else {
            const updateResult = db.liquidations.updateMany(
                { 
                    userId: ROSVIN_EMAIL,
                    $or: [
                        { managerEmail: { $exists: false } },
                        { managerEmail: null },
                        { managerEmail: "" },
                        { managerEmail: { $ne: JULIO_EMAIL } }
                    ]
                },
                { 
                    $set: { 
                        managerEmail: JULIO_EMAIL,
                        updatedAt: new Date()
                    } 
                }
            );
            
            print(`✅ ${updateResult.modifiedCount} liquidacion(es) actualizadas\n`);
        }
    } else {
        print(`✅ Todas las liquidaciones ya tienen a Julio como manager (no se requiere cambio)\n`);
    }
    
    // Mostrar detalle de cada liquidación
    print("📄 Detalle de liquidaciones:\n");
    
    liquidaciones.forEach((liq, index) => {
        print(`   ${index + 1}. ID: ${liq.id}`);
        print(`      Status: ${liq.status}`);
        print(`      Monto: Q${liq.totalAmount}`);
        print(`      Manager: ${liq.managerEmail || "NO ASIGNADO"}`);
        print(`      Fecha: ${liq.createdDate}`);
        print(`      Gastos: ${liq.expenseIds ? liq.expenseIds.length : 0}`);
        
        if (liq.status === "draft") {
            print(`      ⚠️  En BORRADOR - Rosvin debe enviarla para aprobación`);
        } else if (liq.status === "submitted") {
            print(`      ✅ ENVIADA - Julio puede aprobar/rechazar`);
        }
        print("");
    });
}

// ========================================
// 4. VERIFICAR RELACIÓN MANAGER-EMPLOYEE
// ========================================

print("4️⃣  Verificando relación manager-employee...\n");

const managerLink = db.manageremployeelinks.findOne({
    managerEmail: JULIO_EMAIL,
    employeeEmail: ROSVIN_EMAIL
});

if (!managerLink) {
    print(`⚠️  No existe relación manager-employee`);
    print(`🔧 Se creará relación...\n`);
    
    // Obtener sociedad de Rosvin
    const sociedad = rosvin.sociedad || "1010";
    
    if (DRY_RUN) {
        print(`   [DRY RUN] Se crearía la relación:`);
        print(`   - Manager: ${JULIO_EMAIL}`);
        print(`   - Employee: ${ROSVIN_EMAIL}`);
        print(`   - Sociedad: ${sociedad}`);
        print(`   - Estado: ACTIVA`);
        print(`   ↑ Este cambio NO se aplicó (modo dry run)\n`);
    } else {
        const newLink = {
            managerEmail: JULIO_EMAIL,
            employeeEmail: ROSVIN_EMAIL,
            sociedad: sociedad,
            active: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        db.manageremployeelinks.insertOne(newLink);
        print(`✅ Relación manager-employee creada (Sociedad: ${sociedad})\n`);
    }
} else {
    print(`✅ Relación manager-employee existe`);
    print(`   Sociedad: ${managerLink.sociedad}`);
    print(`   Estado: ${managerLink.active ? "ACTIVA" : "INACTIVA"}\n`);
    
    if (!managerLink.active) {
        print(`🔧 Se activará relación...`);
        
        if (DRY_RUN) {
            print(`   [DRY RUN] Se activaría la relación`);
            print(`   ↑ Este cambio NO se aplicó (modo dry run)\n`);
        } else {
            db.manageremployeelinks.updateOne(
                { _id: managerLink._id },
                { $set: { active: true, updatedAt: new Date() } }
            );
            print(`✅ Relación activada\n`);
        }
    }
}

// ========================================
// 5. VERIFICAR GASTOS DE LAS LIQUIDACIONES
// ========================================

print("5️⃣  Verificando gastos en liquidaciones...\n");

if (liquidaciones.length > 0) {
    let gastosEncontrados = 0;
    let gastosNoEncontrados = 0;
    let gastosDesconectados = 0;
    
    liquidaciones.forEach(liq => {
        if (liq.expenseIds && liq.expenseIds.length > 0) {
            liq.expenseIds.forEach(expenseId => {
                const expense = db.expenses.findOne({ id: expenseId });
                if (expense) {
                    gastosEncontrados++;
                    
                    // Verificar que el gasto tenga el liquidationId correcto
                    if (expense.liquidationId !== liq.id) {
                        gastosDesconectados++;
                        
                        if (DRY_RUN) {
                            print(`   [DRY RUN] Se conectaría gasto ${expenseId} con liquidación ${liq.id}`);
                        } else {
                            db.expenses.updateOne(
                                { id: expenseId },
                                { 
                                    $set: { 
                                        liquidationId: liq.id,
                                        expenseStatus: "in_liquidation"
                                    } 
                                }
                            );
                        }
                    }
                } else {
                    gastosNoEncontrados++;
                    print(`   ⚠️  Gasto no encontrado: ${expenseId}`);
                }
            });
        }
    });
    
    print(`✅ Gastos verificados: ${gastosEncontrados}`);
    if (gastosDesconectados > 0) {
        if (DRY_RUN) {
            print(`   [DRY RUN] ${gastosDesconectados} gasto(s) se reconectarían a sus liquidaciones`);
        } else {
            print(`✅ ${gastosDesconectados} gasto(s) reconectados a sus liquidaciones`);
        }
    }
    if (gastosNoEncontrados > 0) {
        print(`⚠️  Gastos no encontrados: ${gastosNoEncontrados}`);
    }
    print("");
}

// ========================================
// 6. RESUMEN FINAL
// ========================================

print("========================================");
if (DRY_RUN) {
    print("   RESUMEN - MODO DRY RUN");
    print("   (CAMBIOS SIMULADOS, NO APLICADOS)");
} else {
    print("   RESUMEN DE CORRECCIONES APLICADAS");
}
print("========================================\n");

if (DRY_RUN) {
    print("🔍 CAMBIOS QUE SE APLICARÍAN:");
} else {
    print("✅ CAMBIOS APLICADOS:");
}
print(`   - Manager de Rosvin: ${JULIO_EMAIL}`);
print(`   - Liquidaciones actualizadas para mostrar a Julio como manager`);
print(`   - Relación manager-employee verificada/creada`);
print(`   - Gastos vinculados correctamente\n`);

if (DRY_RUN) {
    print("⚠️  PARA APLICAR LOS CAMBIOS:");
    print("   1. Edita este script");
    print("   2. Cambia: const DRY_RUN = false;");
    print("   3. Revisa los cambios propuestos arriba");
    print("   4. Ejecuta nuevamente el script\n");
}

// Contar liquidaciones que Julio DEBERÍA ver
const liquidacionesVisible = db.liquidations.find({
    userId: ROSVIN_EMAIL,
    managerEmail: JULIO_EMAIL,
    status: "submitted"
}).count();

print("📊 ESTADO ACTUAL:");
print(`   - Total liquidaciones de Rosvin: ${liquidaciones.length}`);
print(`   - Liquidaciones pendientes para Julio: ${liquidacionesVisible}\n`);

if (liquidacionesVisible === 0) {
    const borradores = db.liquidations.find({
        userId: ROSVIN_EMAIL,
        status: "draft"
    }).count();
    
    if (borradores > 0) {
        print("⚠️  IMPORTANTE:");
        print(`   Hay ${borradores} liquidacion(es) en BORRADOR`);
        print("   Rosvin debe 'enviar' estas liquidaciones desde la app");
        print("   para que aparezcan en el tab de aprobación de Julio\n");
    }
}

print("🔄 PRÓXIMOS PASOS:");
print("   1. Rosvin: Sincronizar app y enviar liquidaciones en borrador");
print("   2. Julio: Sincronizar app (Configuración > Sincronizar Datos)");
print("   3. Julio: Verificar tab de Liquidaciones para aprobar\n");

print("========================================\n");
