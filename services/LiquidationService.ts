/**
 * LiquidationService
 * 
 * Servicio para gestionar liquidaciones de gastos en SQLite
 * con soporte offline-first y sincronización con backend
 */

import { Platform } from 'react-native';
import { Liquidation, LiquidationStatus, CreateLiquidationDTO } from '../models/Liquidation';
import { getExpenseById, updateExpensesLiquidationStatus, validateExpenseForLiquidation } from './ExpenseService';
import { getCurrentDateISO } from '../utils/dateUtils';
import * as SQLite from 'expo-sqlite';
import { getUser } from './AuthService';

// Base de datos SQLite
let db: SQLite.SQLiteDatabase | null = null;
let isDBInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Inicializa la tabla de liquidaciones en SQLite
 */
export const initLiquidationsTable = async (): Promise<void> => {
  // Si ya está inicializada, devolver inmediatamente
  if (isDBInitialized) {
    console.log("✅ LiquidationService: BD ya inicializada");
    return;
  }
  
  // Si hay una inicialización en progreso, esperar
  if (initPromise) {
    console.log("⏳ LiquidationService: Esperando inicialización en progreso...");
    return initPromise;
  }
  
  // Crear nueva promesa de inicialización
  initPromise = (async () => {
    if (Platform.OS === 'web') {
      console.log("⚠️ LiquidationService: Plataforma web, no se usa SQLite");
      isDBInitialized = true;
      return;
    }
    
    try {
      console.log("🗄️ LiquidationService: Inicializando tabla liquidations...");
      db = await SQLite.openDatabaseAsync('easygastos.db');
      
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS liquidations (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          employeeName TEXT NOT NULL,
          sociedad TEXT,
          createdDate TEXT NOT NULL,
          expenseIds TEXT NOT NULL,
          totalAmount REAL NOT NULL,
          status TEXT NOT NULL,
          managerEmail TEXT,
          managerComments TEXT,
          submittedDate TEXT,
          approvedDate TEXT,
          rejectedDate TEXT,
          approverEmail TEXT,
          rejectedBy TEXT,
          csvGeneratedAt TEXT,
          csvGeneratedBy TEXT,
          sapDocNumber TEXT,
          sapSyncStatus TEXT,
          sapReferenceId TEXT,
          sapResponseMessage TEXT,
          sapSyncedAt TEXT,
          synced INTEGER DEFAULT 0
        )
      `);

      const liquidationColumns = [
        ['sociedad', 'TEXT'],
        ['approverEmail', 'TEXT'],
        ['rejectedBy', 'TEXT'],
        ['csvGeneratedAt', 'TEXT'],
        ['csvGeneratedBy', 'TEXT'],
        ['sapDocNumber', 'TEXT'],
        ['sapSyncStatus', 'TEXT'],
        ['sapReferenceId', 'TEXT'],
        ['sapResponseMessage', 'TEXT'],
        ['sapSyncedAt', 'TEXT']
      ];

      for (const [columnName, columnType] of liquidationColumns) {
        try {
          await db.execAsync(`ALTER TABLE liquidations ADD COLUMN ${columnName} ${columnType};`);
          console.log(`✅ Columna ${columnName} agregada en liquidations`);
        } catch (error) {
          console.log(`ℹ️ Columna ${columnName} ya existe o no se pudo agregar`);
        }
      }
      
      console.log('✅ LiquidationService: Tabla liquidations inicializada correctamente');
      isDBInitialized = true;
    } catch (error) {
      console.error('❌ LiquidationService: Error inicializando tabla liquidations:', error);
      isDBInitialized = false;
      initPromise = null;
      throw error;
    }
  })();
  
  return initPromise;
};

/**
 * Crea una nueva liquidación con los gastos seleccionados
 */
export const createLiquidation = async (
  dto: CreateLiquidationDTO
): Promise<Liquidation> => {
  try {
    console.log('📝 LiquidationService: Creando liquidación...', dto);

    // Asegurar que la BD está inicializada
    if (!isDBInitialized && Platform.OS !== 'web') {
      console.log("⚠️ LiquidationService.createLiquidation: BD no inicializada, inicializando ahora...");
      await initLiquidationsTable();
    }

    // Validar que hay gastos seleccionados
    if (!dto.expenseIds || dto.expenseIds.length === 0) {
      throw new Error('Debe seleccionar al menos un gasto');
    }

    if (!dto.sociedad || !dto.sociedad.trim()) {
      throw new Error('Debe seleccionar la sociedad de la liquidación');
    }

    // Calcular el monto total sumando los gastos
    let totalAmount = 0;
    for (const expenseId of dto.expenseIds) {
      const validation = await validateExpenseForLiquidation(expenseId, dto.userId);
      if (!validation.valid) {
        throw new Error(validation.error || 'Uno de los gastos no puede incluirse en la liquidación');
      }

      const expense = await getExpenseById(expenseId, dto.userId);
      if (expense) {
        if (expense.sociedad !== dto.sociedad) {
          throw new Error(`Todos los gastos de una liquidación deben pertenecer a la sociedad ${dto.sociedad}.`);
        }
        totalAmount += expense.amount;
      }
    }

    const liquidation: Liquidation = {
      id: Date.now().toString(),
      userId: dto.userId,
      employeeName: dto.employeeName,
      sociedad: dto.sociedad,
      createdDate: getCurrentDateISO(),
      expenseIds: dto.expenseIds,
      totalAmount,
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    if (!db) throw new Error("La base de datos no está inicializada.");

    // Insertar en SQLite
    await db.runAsync(
      `INSERT INTO liquidations (
        id, userId, employeeName, sociedad, createdDate, expenseIds, 
        totalAmount, status, sapSyncStatus, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        liquidation.id,
        liquidation.userId,
        liquidation.employeeName,
        liquidation.sociedad,
        liquidation.createdDate,
        JSON.stringify(liquidation.expenseIds),
        liquidation.totalAmount,
        liquidation.status,
        liquidation.sapSyncStatus || 'PENDING'
      ]
    );

    // Actualizar el estado de los gastos a 'in_liquidation'
    await updateExpensesLiquidationStatus(dto.expenseIds, 'in_liquidation');
    
    // También actualizar el campo liquidationId de cada gasto
    for (const expenseId of dto.expenseIds) {
      await db.runAsync(
        `UPDATE expenses SET liquidationId = ?, needsSync = 1 WHERE id = ?`,
        [liquidation.id, expenseId]
      );
    }

    console.log('✅ Liquidación creada:', liquidation.id);
    console.log(`✅ ${dto.expenseIds.length} gasto(s) marcados como 'in_liquidation'`);
    return liquidation;
  } catch (error) {
    console.error('❌ Error creando liquidación:', error);
    throw error;
  }
};

/**
 * Obtiene todas las liquidaciones de un usuario
 */
export const getLiquidations = async (userId: string): Promise<Liquidation[]> => {
  try {
    if (!db) {
      console.warn('⚠️ LiquidationService: DB no inicializada');
      return [];
    }
    
    const result = await db.getAllAsync<any>(
      `SELECT * FROM liquidations 
       WHERE userId = ?
       ORDER BY createdDate DESC`,
      [userId]
    );

    const liquidations: Liquidation[] = result.map((row: any) => ({
      id: row.id,
      userId: row.userId,
      employeeName: row.employeeName,
      sociedad: row.sociedad || '',
      createdDate: row.createdDate,
      expenseIds: JSON.parse(row.expenseIds),
      totalAmount: row.totalAmount,
      status: row.status as LiquidationStatus,
      approverEmail: row.approverEmail,
      rejectedBy: row.rejectedBy,
      csvGeneratedAt: row.csvGeneratedAt,
      csvGeneratedBy: row.csvGeneratedBy,
      sapDocNumber: row.sapDocNumber,
      sapSyncStatus: row.sapSyncStatus,
      sapReferenceId: row.sapReferenceId,
      sapResponseMessage: row.sapResponseMessage,
      sapSyncedAt: row.sapSyncedAt,
      managerComments: row.managerComments,
      submittedDate: row.submittedDate,
      approvedDate: row.approvedDate,
      rejectedDate: row.rejectedDate
    }));

    console.log(`✅ ${liquidations.length} liquidaciones encontradas para ${userId}`);
    return liquidations;
  } catch (error) {
    console.error('❌ Error obteniendo liquidaciones:', error);
    return [];
  }
};

/**
 * Obtiene una liquidación por ID (validando que pertenece al usuario)
 */
export const getLiquidationById = async (id: string, userId: string): Promise<Liquidation | null> => {
  try {
    if (!db) {
      console.warn('⚠️ LiquidationService: DB no inicializada');
      return null;
    }
    
    const result = await db.getFirstAsync<any>(
      `SELECT * FROM liquidations WHERE id = ? AND userId = ?`,
      [id, userId]
    );

    if (!result) {
      return null;
    }

    const liquidation: Liquidation = {
      id: result.id,
      userId: result.userId,
      employeeName: result.employeeName,
      sociedad: result.sociedad || '',
      createdDate: result.createdDate,
      expenseIds: JSON.parse(result.expenseIds),
      totalAmount: result.totalAmount,
      status: result.status as LiquidationStatus,
      approverEmail: result.approverEmail,
      rejectedBy: result.rejectedBy,
      csvGeneratedAt: result.csvGeneratedAt,
      csvGeneratedBy: result.csvGeneratedBy,
      sapDocNumber: result.sapDocNumber,
      sapSyncStatus: result.sapSyncStatus,
      sapReferenceId: result.sapReferenceId,
      sapResponseMessage: result.sapResponseMessage,
      sapSyncedAt: result.sapSyncedAt,
      managerComments: result.managerComments,
      submittedDate: result.submittedDate,
      approvedDate: result.approvedDate,
      rejectedDate: result.rejectedDate
    };

    return liquidation;
  } catch (error) {
    console.error('❌ Error obteniendo liquidación:', error);
    return null;
  }
};

/**
 * Agrega un gasto a una liquidación existente (solo si está en estado 'draft' o 'rejected')
 */
export const addExpenseToLiquidation = async (
  liquidationId: string,
  expenseId: string,
  userId: string
): Promise<boolean> => {
  try {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    const liquidation = await getLiquidationById(liquidationId, userId);
    
    if (!liquidation) {
      throw new Error('Liquidación no encontrada');
    }

    if (liquidation.status !== 'draft' && liquidation.status !== 'rejected') {
      throw new Error('No se puede modificar una liquidación enviada o aprobada');
    }

    // Verificar que el gasto no esté ya incluido
    if (liquidation.expenseIds.includes(expenseId)) {
      console.log('⚠️ El gasto ya está incluido en la liquidación');
      return false;
    }

    // Agregar el gasto y recalcular el total
    const expense = await getExpenseById(expenseId, liquidation.userId);
    if (!expense) {
      throw new Error('Gasto no encontrado');
    }

    if (expense.sociedad !== liquidation.sociedad) {
      throw new Error(`Solo puede agregar gastos de la sociedad ${liquidation.sociedad} a esta liquidación.`);
    }

    const validation = await validateExpenseForLiquidation(expenseId, liquidation.userId, liquidationId);
    if (!validation.valid) {
      throw new Error(validation.error || 'El gasto no puede agregarse a esta liquidación');
    }

    const newExpenseIds = [...liquidation.expenseIds, expenseId];
    const newTotal = liquidation.totalAmount + expense.amount;

    await db.runAsync(
      `UPDATE liquidations 
       SET expenseIds = ?, totalAmount = ?, synced = 0
       WHERE id = ?`,
      [JSON.stringify(newExpenseIds), newTotal, liquidationId]
    );

    // Actualizar el estado del gasto a 'in_liquidation' y asignarle la liquidationId
    await updateExpensesLiquidationStatus([expenseId], 'in_liquidation');
    await db.runAsync(`UPDATE expenses SET liquidationId = ?, needsSync = 1 WHERE id = ?`, [liquidationId, expenseId]);

    console.log('✅ Gasto agregado a la liquidación');
    console.log('✅ Gasto marcado como "in_liquidation"');
    return true;
  } catch (error) {
    console.error('❌ Error agregando gasto a liquidación:', error);
    throw error;
  }
};

/**
 * Elimina un gasto de una liquidación (solo si está en estado 'draft' o 'rejected')
 */
export const removeExpenseFromLiquidation = async (
  liquidationId: string,
  expenseId: string,
  userId: string
): Promise<boolean> => {
  try {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    const liquidation = await getLiquidationById(liquidationId, userId);
    
    if (!liquidation) {
      throw new Error('Liquidación no encontrada');
    }

    if (liquidation.status !== 'draft' && liquidation.status !== 'rejected') {
      throw new Error('No se puede modificar una liquidación enviada o aprobada');
    }

    // Verificar que el gasto esté incluido
    if (!liquidation.expenseIds.includes(expenseId)) {
      console.log('⚠️ El gasto no está en la liquidación');
      return false;
    }

    // Remover el gasto y recalcular el total
    const expense = await getExpenseById(expenseId, liquidation.userId);
    if (!expense) {
      throw new Error('Gasto no encontrado');
    }

    const newExpenseIds = liquidation.expenseIds.filter(id => id !== expenseId);
    const newTotal = liquidation.totalAmount - expense.amount;

    // Si ya no hay gastos, eliminar la liquidación
    if (newExpenseIds.length === 0) {
      await db.runAsync(`DELETE FROM liquidations WHERE id = ?`, [liquidationId]);
      
      // Regresar el gasto a estado 'draft' y limpiar liquidationId
      await updateExpensesLiquidationStatus([expenseId], 'draft');
      await db.runAsync(`UPDATE expenses SET liquidationId = NULL, needsSync = 1 WHERE id = ?`, [expenseId]);
      
      console.log('✅ Liquidación eliminada (sin gastos)');
      console.log('✅ Gasto regresado a estado "draft"');
      return true;
    }

    await db.runAsync(
      `UPDATE liquidations 
       SET expenseIds = ?, totalAmount = ?, synced = 0
       WHERE id = ?`,
      [JSON.stringify(newExpenseIds), newTotal, liquidationId]
    );

    // Regresar el gasto a estado 'draft' y limpiar liquidationId
    await updateExpensesLiquidationStatus([expenseId], 'draft');
    await db.runAsync(`UPDATE expenses SET liquidationId = NULL, needsSync = 1 WHERE id = ?`, [expenseId]);

    console.log('✅ Gasto removido de la liquidación');
    console.log('✅ Gasto regresado a estado "draft"');
    return true;
  } catch (error) {
    console.error('❌ Error removiendo gasto de liquidación:', error);
    throw error;
  }
};

/**
 * Envía una liquidación al jefe para aprobación
 * Cambia el estado a 'submitted' y marca la fecha
 */
export const submitLiquidation = async (liquidationId: string, userId: string): Promise<boolean> => {
  try {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    const liquidation = await getLiquidationById(liquidationId, userId);
    
    if (!liquidation) {
      throw new Error('Liquidación no encontrada');
    }

    // VALIDACIÓN ESTRICTA: Solo liquidaciones en 'draft' o 'rejected' pueden enviarse
    if (liquidation.status !== 'draft' && liquidation.status !== 'rejected') {
      if (liquidation.status === 'submitted') {
        throw new Error('Esta liquidación ya está en revisión. No se puede enviar nuevamente.');
      } else if (liquidation.status === 'approved') {
        throw new Error('Esta liquidación ya fue aprobada. No se puede modificar ni reenviar.');
      }
      throw new Error('Solo se pueden enviar liquidaciones en borrador o rechazadas');
    }

    if (liquidation.expenseIds.length === 0) {
      throw new Error('La liquidación debe tener al menos un gasto');
    }

    const submittedDate = getCurrentDateISO();

    await db.runAsync(
      `UPDATE liquidations 
       SET status = 'submitted', submittedDate = ?, synced = 0
       WHERE id = ?`,
      [submittedDate, liquidationId]
    );

    console.log('✅ Liquidación enviada al jefe');
    return true;
  } catch (error) {
    console.error('❌ Error enviando liquidación:', error);
    throw error;
  }
};

/**
 * Actualiza el estado de una liquidación (usado por el jefe para aprobar/rechazar)
 * IMPORTANTE: Solo liquidaciones en estado 'submitted' pueden ser aprobadas/rechazadas
 * NOTA: Esta función es usada por managers, no valida userId sino que carga la liquidación sin filtro
 * para permitir que managers accedan a liquidaciones de sus empleados
 */
export const updateLiquidationStatus = async (
  liquidationId: string,
  status: LiquidationStatus,
  managerComments?: string,
  fromSync: boolean = false
): Promise<boolean> => {
  try {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    // Los managers necesitan acceder a liquidaciones de otros usuarios, así que usamos una consulta sin userId
    const result = await db.getFirstAsync<any>(
      `SELECT * FROM liquidations WHERE id = ?`,
      [liquidationId]
    );
    
    if (!result) {
      throw new Error('Liquidación no encontrada');
    }
    
    const liquidation: Liquidation = {
      id: result.id,
      userId: result.userId,
      employeeName: result.employeeName,
      sociedad: result.sociedad || '',
      createdDate: result.createdDate,
      expenseIds: JSON.parse(result.expenseIds),
      totalAmount: result.totalAmount,
      status: result.status as LiquidationStatus,
      approverEmail: result.approverEmail,
      rejectedBy: result.rejectedBy,
      csvGeneratedAt: result.csvGeneratedAt,
      csvGeneratedBy: result.csvGeneratedBy,
      sapDocNumber: result.sapDocNumber,
      sapSyncStatus: result.sapSyncStatus,
      sapReferenceId: result.sapReferenceId,
      sapResponseMessage: result.sapResponseMessage,
      sapSyncedAt: result.sapSyncedAt,
      managerComments: result.managerComments,
      submittedDate: result.submittedDate,
      approvedDate: result.approvedDate,
      rejectedDate: result.rejectedDate
    };
    
    if (!liquidation) {
      throw new Error('Liquidación no encontrada');
    }

    // VALIDACIÓN ESTRICTA: Solo liquidaciones 'submitted' pueden cambiar a approved/rejected
    if (status === 'approved' || status === 'rejected') {
      if (liquidation.status !== 'submitted') {
        const currentStatusText = liquidation.status === 'draft' ? 'borrador' :
                                 liquidation.status === 'approved' ? 'ya aprobada' :
                                 liquidation.status === 'rejected' ? 'rechazada' : 'desconocido';
        throw new Error(`No se puede ${status === 'approved' ? 'aprobar' : 'rechazar'} una liquidación en estado "${currentStatusText}". Solo liquidaciones en revisión pueden ser aprobadas o rechazadas.`);
      }
    }

    let dateField = '';
    const currentDate = getCurrentDateISO();

    if (status === 'approved') {
      dateField = 'approvedDate';
    } else if (status === 'rejected') {
      dateField = 'rejectedDate';
    }

    // Solo marcar synced=0 si es cambio local, NO si viene del servidor
    const syncValue = fromSync ? 1 : 0;
    
    if (dateField) {
      await db.runAsync(
        `UPDATE liquidations 
         SET status = ?, ${dateField} = ?, managerComments = ?, synced = ?
         WHERE id = ?`,
        [status, currentDate, managerComments || null, syncValue, liquidationId]
      );
    } else {
      await db.runAsync(
        `UPDATE liquidations 
         SET status = ?, managerComments = ?, synced = ?
         WHERE id = ?`,
        [status, managerComments || null, syncValue, liquidationId]
      );
    }

    // Actualizar el estado de los gastos según la decisión del jefe
    if (status === 'approved') {
      // Si se aprueba → gastos pasan a 'approved'
      await updateExpensesLiquidationStatus(liquidation.expenseIds, 'approved');
      console.log(`✅ ${liquidation.expenseIds.length} gasto(s) marcados como 'approved'`);
    } else if (status === 'rejected') {
      // Si se rechaza → gastos vuelven a 'draft' y se limpia liquidationId
      await updateExpensesLiquidationStatus(liquidation.expenseIds, 'draft');
      for (const expenseId of liquidation.expenseIds) {
        await db.runAsync(`UPDATE expenses SET liquidationId = NULL WHERE id = ?`, [expenseId]);
      }
      console.log(`✅ ${liquidation.expenseIds.length} gasto(s) regresados a 'draft'`);
    }

    console.log(`✅ Liquidación actualizada a estado: ${status}`);
    return true;
  } catch (error) {
    console.error('❌ Error actualizando estado de liquidación:', error);
    throw error;
  }
};

/**
 * Elimina una liquidación (solo si está en estado 'draft')
 * Las liquidaciones en revisión (submitted) o aprobadas/rechazadas NO se pueden eliminar
 */
export const deleteLiquidation = async (liquidationId: string, userId: string): Promise<boolean> => {
  try {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    const liquidation = await getLiquidationById(liquidationId, userId);
    
    if (!liquidation) {
      throw new Error('Liquidación no encontrada');
    }

    // VALIDACIÓN ESTRICTA: Solo liquidaciones en 'draft' pueden eliminarse
    if (liquidation.status !== 'draft') {
      const statusText = liquidation.status === 'submitted' ? 'en revisión' : 
                        liquidation.status === 'approved' ? 'aprobada' : 'rechazada';
      throw new Error(`No se puede eliminar una liquidación ${statusText}. Solo liquidaciones en borrador pueden eliminarse.`);
    }

    // Regresar los gastos a estado 'draft' y limpiar liquidationId
    await updateExpensesLiquidationStatus(liquidation.expenseIds, 'draft');
    for (const expenseId of liquidation.expenseIds) {
      await db.runAsync(`UPDATE expenses SET liquidationId = NULL WHERE id = ?`, [expenseId]);
    }

    await db.runAsync(`DELETE FROM liquidations WHERE id = ?`, [liquidationId]);

    console.log('✅ Liquidación eliminada');
    console.log(`✅ ${liquidation.expenseIds.length} gasto(s) regresados a 'draft'`);
    return true;
  } catch (error) {
    console.error('❌ Error eliminando liquidación:', error);
    throw error;
  }
};

/**
 * Obtiene liquidaciones que necesitan sincronizarse con el backend
 */
export const getLiquidationsNeedingSync = async (userId: string): Promise<Liquidation[]> => {
  try {
    if (!db) {
      console.warn('⚠️ LiquidationService: DB no inicializada');
      return [];
    }
    
    console.log(`🔍 Buscando liquidaciones pendientes de sincronización para: ${userId}`);
    
    const result = await db.getAllAsync<any>(
      `SELECT * FROM liquidations 
       WHERE userId = ? AND synced = 0
       ORDER BY createdDate DESC`,
      [userId]
    );

    console.log(`📊 Liquidaciones en BD con synced=0: ${result.length}`);

    const liquidations: Liquidation[] = [];
    
    for (const row of result) {
      console.log(`📋 Liquidación ${row.id}: synced=${row.synced}, status=${row.status}`);
      const expenseIds = JSON.parse(row.expenseIds);
      
      // CRÍTICO: Verificar que ningún gasto esté anulado antes de sincronizar la liquidación
      console.log(`🔍 Verificando ${expenseIds.length} gastos de liquidación ${row.id}...`);
      let hasVoidedExpenses = false;
      
      for (const expenseId of expenseIds) {
        const expenseRow = await db.getFirstAsync<any>(
          'SELECT expenseStatus, voidedAt FROM expenses WHERE id = ?',
          [expenseId]
        );
        
        if (expenseRow && expenseRow.expenseStatus === 'voided') {
          console.warn(`⚠️ Liquidación ${row.id} contiene gasto anulado: ${expenseId}`);
          console.warn(`⚠️ Esta liquidación NO será sincronizada hasta que se resuelva`);
          hasVoidedExpenses = true;
          break;
        }
      }
      
      // Solo incluir liquidaciones que NO tengan gastos anulados
      if (!hasVoidedExpenses) {
        liquidations.push({
          id: row.id,
          userId: row.userId,
          employeeName: row.employeeName,
          sociedad: row.sociedad || '',
          createdDate: row.createdDate,
          expenseIds: expenseIds,
          totalAmount: row.totalAmount,
          status: row.status as LiquidationStatus,
          approverEmail: row.approverEmail,
          rejectedBy: row.rejectedBy,
          csvGeneratedAt: row.csvGeneratedAt,
          csvGeneratedBy: row.csvGeneratedBy,
          sapDocNumber: row.sapDocNumber,
          sapSyncStatus: row.sapSyncStatus,
          sapReferenceId: row.sapReferenceId,
          sapResponseMessage: row.sapResponseMessage,
          sapSyncedAt: row.sapSyncedAt,
          managerComments: row.managerComments,
          submittedDate: row.submittedDate,
          approvedDate: row.approvedDate,
          rejectedDate: row.rejectedDate
        });
        console.log(`✅ Liquidación ${row.id} incluida para sincronización`);
      } else {
        // IMPORTANTE: Si la liquidación tiene gastos anulados, marcarla como sincronizada
        // para que no siga intentando sincronizarse indefinidamente
        console.warn(`⚠️ Liquidación ${row.id} tiene gastos anulados, marcando como sincronizada para evitar reintentos`);
        await markLiquidationAsSynced(row.id);
      }
    }

    console.log(`📤 ${liquidations.length} liquidaciones válidas pendientes de sincronizar`);
    return liquidations;
  } catch (error) {
    console.error('❌ Error obteniendo liquidaciones pendientes:', error);
    return [];
  }
};

/**
 * Marca una liquidación como sincronizada con el backend
 */
export const markLiquidationAsSynced = async (liquidationId: string): Promise<void> => {
  try {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    console.log(`🔄 Marcando liquidación ${liquidationId} como sincronizada...`);
    
    const result = await db.runAsync(
      `UPDATE liquidations SET synced = 1 WHERE id = ?`,
      [liquidationId]
    );
    
    console.log(`✅ Liquidación ${liquidationId} marcada como sincronizada (rows affected: ${result.changes})`);
    
    // Verificar que se actualizó
    const verification = await db.getFirstAsync<any>(
      'SELECT synced FROM liquidations WHERE id = ?',
      [liquidationId]
    );
    console.log(`🔍 Verificación - Liquidación ${liquidationId}: synced=${verification?.synced}`);
  } catch (error) {
    console.error('❌ Error marcando liquidación como sincronizada:', error);
    throw error;
  }
};

/**
 * Genera datos CSV para una liquidación aprobada
 * Retorna un array de objetos con los datos de cada gasto
 */
export const generateCSVData = async (liquidationId: string, userId: string): Promise<any[]> => {
  try {
    const liquidation = await getLiquidationById(liquidationId, userId);
    
    if (!liquidation) {
      throw new Error('Liquidación no encontrada');
    }

    if (liquidation.status !== 'approved') {
      throw new Error('Solo se pueden generar CSV de liquidaciones aprobadas');
    }

    // Obtener datos del usuario para codigo_empleado y sociedad
    const user = await getUser();
    const codigoEmpleado = user?.employeeCode || '';
    const sociedad = liquidation.sociedad || user?.sociedad || '';

    const csvData = [];

    for (const expenseId of liquidation.expenseIds) {
      const expense = await getExpenseById(expenseId, liquidation.userId);
      if (expense) {
        // Usar expenseStatus en lugar de status para mostrar el estado correcto
        const estadoTexto = expense.expenseStatus === 'approved' ? 'APROBADO' :
                           expense.expenseStatus === 'voided' ? 'ANULADO' :
                           expense.expenseStatus === 'in_liquidation' ? 'EN_LIQUIDACION' : 'BORRADOR';
        
        csvData.push({
          liquidacion_id: liquidation.id,
          gasto_id: expense.id,
          fecha: expense.date,
          monto: expense.amount,
          categoria: expense.category,
          departamento: expense.department,
          proveedor: expense.supplier,
          ruc: expense.vat_number,
          noinvoice: expense.noinvoice || '',
          serie: expense.serie || '',
          centro: expense.centro || '',
          cuenta: expense.cuenta || '',
          ordenco: expense.ordenco || '',
          total_iva: expense.totiva || 0,
          moneda: expense.currency,
          notas: expense.notes || '',
          estado: estadoTexto,
          empleado: liquidation.employeeName,
          codigo_empleado: codigoEmpleado,
          sociedad: sociedad,
          fecha_aprobacion: liquidation.approvedDate
        });
      }
    }

    console.log(`✅ Datos CSV generados: ${csvData.length} registros`);
    return csvData;
  } catch (error) {
    console.error('❌ Error generando datos CSV:', error);
    throw error;
  }
};

/**
 * Inserta una liquidación que viene del backend (usada en sincronización)
 * NO actualiza el estado de los gastos ya que vienen del backend
 */
export const insertLiquidationFromBackend = async (liquidation: any): Promise<void> => {
  try {
    if (!db) {
      await initLiquidationsTable();
      if (!db) {
        throw new Error('No se pudo inicializar la base de datos');
      }
    }

    await db.runAsync(
      `INSERT OR REPLACE INTO liquidations (
        id, userId, employeeName, createdDate, expenseIds, 
        sociedad, totalAmount, status, managerEmail, managerComments, submittedDate,
        approvedDate, rejectedDate, approverEmail, rejectedBy,
        csvGeneratedAt, csvGeneratedBy, sapDocNumber, sapSyncStatus,
        sapReferenceId, sapResponseMessage, sapSyncedAt, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        liquidation.id,
        liquidation.userId,
        liquidation.employeeName,
        liquidation.createdDate,
        JSON.stringify(liquidation.expenseIds || []),
        liquidation.sociedad || '',
        liquidation.totalAmount,
        liquidation.status,
        liquidation.managerEmail || null,
        liquidation.managerComments || null,
        liquidation.submittedDate || null,
        liquidation.approvedDate || null,
        liquidation.rejectedDate || null,
        liquidation.approverEmail || null,
        liquidation.rejectedBy || null,
        liquidation.csvGeneratedAt || null,
        liquidation.csvGeneratedBy || null,
        liquidation.sapDocNumber || null,
        liquidation.sapSyncStatus || null,
        liquidation.sapReferenceId || null,
        liquidation.sapResponseMessage || null,
        liquidation.sapSyncedAt || null
      ]
    );

    console.log(`✅ LiquidationService: Liquidación ${liquidation.id} insertada desde backend`);
  } catch (error) {
    console.error('❌ LiquidationService: Error insertando liquidación desde backend:', error);
    throw error;
  }
};

export const LiquidationService = {
  initLiquidationsTable,
  createLiquidation,
  getLiquidations,
  getLiquidationById,
  addExpenseToLiquidation,
  removeExpenseFromLiquidation,
  submitLiquidation,
  updateLiquidationStatus,
  deleteLiquidation,
  getLiquidationsNeedingSync,
  markLiquidationAsSynced,
  generateCSVData,
  insertLiquidationFromBackend,
  getDB: () => db
};
