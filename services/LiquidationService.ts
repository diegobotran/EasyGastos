/**
 * LiquidationService
 * 
 * Servicio para gestionar liquidaciones de gastos en SQLite
 * con soporte offline-first y sincronización con backend
 */

import * as SQLite from 'expo-sqlite';
import { Liquidation, LiquidationStatus, CreateLiquidationDTO } from '../models/Liquidation';
import { getExpenseById, updateExpensesLiquidationStatus } from './ExpenseService';

const db = SQLite.openDatabaseSync('easygastos.db');

/**
 * Inicializa la tabla de liquidaciones en SQLite
 */
export const initLiquidationsTable = () => {
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS liquidations (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        employeeName TEXT NOT NULL,
        createdDate TEXT NOT NULL,
        expenseIds TEXT NOT NULL,
        totalAmount REAL NOT NULL,
        status TEXT NOT NULL,
        managerComments TEXT,
        submittedDate TEXT,
        approvedDate TEXT,
        rejectedDate TEXT,
        synced INTEGER DEFAULT 0
      )
    `);
    console.log('✅ Tabla liquidations inicializada correctamente');
  } catch (error) {
    console.error('❌ Error inicializando tabla liquidations:', error);
    throw error;
  }
};

/**
 * Crea una nueva liquidación con los gastos seleccionados
 */
export const createLiquidation = async (
  dto: CreateLiquidationDTO
): Promise<Liquidation> => {
  try {
    console.log('📝 LiquidationService: Creando liquidación...', dto);

    // Validar que hay gastos seleccionados
    if (!dto.expenseIds || dto.expenseIds.length === 0) {
      throw new Error('Debe seleccionar al menos un gasto');
    }

    // Calcular el monto total sumando los gastos
    let totalAmount = 0;
    for (const expenseId of dto.expenseIds) {
      const expense = await getExpenseById(expenseId, dto.userId);
      if (expense) {
        totalAmount += expense.amount;
      }
    }

    const liquidation: Liquidation = {
      id: Date.now().toString(),
      userId: dto.userId,
      employeeName: dto.employeeName,
      createdDate: new Date().toISOString().split('T')[0],
      expenseIds: dto.expenseIds,
      totalAmount,
      status: 'draft'
    };

    // Insertar en SQLite
    const stmt = db.prepareSync(`
      INSERT INTO liquidations (
        id, userId, employeeName, createdDate, expenseIds, 
        totalAmount, status, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);

    stmt.executeSync([
      liquidation.id,
      liquidation.userId,
      liquidation.employeeName,
      liquidation.createdDate,
      JSON.stringify(liquidation.expenseIds),
      liquidation.totalAmount,
      liquidation.status
    ]);

    // Actualizar el estado de los gastos a 'in_liquidation'
    await updateExpensesLiquidationStatus(dto.expenseIds, 'in_liquidation');
    
    // También actualizar el campo liquidationId de cada gasto
    for (const expenseId of dto.expenseIds) {
      const updateStmt = db.prepareSync(`
        UPDATE expenses SET liquidationId = ?, needsSync = 1 WHERE id = ?
      `);
      updateStmt.executeSync([liquidation.id, expenseId]);
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
    const result = db.getAllSync(`
      SELECT * FROM liquidations 
      WHERE userId = ?
      ORDER BY createdDate DESC
    `, [userId]);

    const liquidations: Liquidation[] = result.map((row: any) => ({
      id: row.id,
      userId: row.userId,
      employeeName: row.employeeName,
      createdDate: row.createdDate,
      expenseIds: JSON.parse(row.expenseIds),
      totalAmount: row.totalAmount,
      status: row.status as LiquidationStatus,
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
 * Obtiene una liquidación por ID
 */
export const getLiquidationById = async (id: string): Promise<Liquidation | null> => {
  try {
    const result = db.getFirstSync(`
      SELECT * FROM liquidations WHERE id = ?
    `, [id]);

    if (!result) {
      return null;
    }

    const liquidation: Liquidation = {
      id: result.id,
      userId: result.userId,
      employeeName: result.employeeName,
      createdDate: result.createdDate,
      expenseIds: JSON.parse(result.expenseIds),
      totalAmount: result.totalAmount,
      status: result.status as LiquidationStatus,
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
  expenseId: string
): Promise<boolean> => {
  try {
    const liquidation = await getLiquidationById(liquidationId);
    
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

    const newExpenseIds = [...liquidation.expenseIds, expenseId];
    const newTotal = liquidation.totalAmount + expense.amount;

    db.runSync(`
      UPDATE liquidations 
      SET expenseIds = ?, totalAmount = ?, synced = 0
      WHERE id = ?
    `, [JSON.stringify(newExpenseIds), newTotal, liquidationId]);

    console.log('✅ Gasto agregado a la liquidación');
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
  expenseId: string
): Promise<boolean> => {
  try {
    const liquidation = await getLiquidationById(liquidationId);
    
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
      db.runSync(`DELETE FROM liquidations WHERE id = ?`, [liquidationId]);
      console.log('✅ Liquidación eliminada (sin gastos)');
      return true;
    }

    db.runSync(`
      UPDATE liquidations 
      SET expenseIds = ?, totalAmount = ?, synced = 0
      WHERE id = ?
    `, [JSON.stringify(newExpenseIds), newTotal, liquidationId]);

    console.log('✅ Gasto removido de la liquidación');
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
export const submitLiquidation = async (liquidationId: string): Promise<boolean> => {
  try {
    const liquidation = await getLiquidationById(liquidationId);
    
    if (!liquidation) {
      throw new Error('Liquidación no encontrada');
    }

    if (liquidation.status !== 'draft' && liquidation.status !== 'rejected') {
      throw new Error('Solo se pueden enviar liquidaciones en borrador o rechazadas');
    }

    if (liquidation.expenseIds.length === 0) {
      throw new Error('La liquidación debe tener al menos un gasto');
    }

    const submittedDate = new Date().toISOString().split('T')[0];

    db.runSync(`
      UPDATE liquidations 
      SET status = 'submitted', submittedDate = ?, synced = 0
      WHERE id = ?
    `, [submittedDate, liquidationId]);

    console.log('✅ Liquidación enviada al jefe');
    return true;
  } catch (error) {
    console.error('❌ Error enviando liquidación:', error);
    throw error;
  }
};

/**
 * Actualiza el estado de una liquidación (usado por el jefe para aprobar/rechazar)
 */
export const updateLiquidationStatus = async (
  liquidationId: string,
  status: LiquidationStatus,
  managerComments?: string
): Promise<boolean> => {
  try {
    const liquidation = await getLiquidationById(liquidationId);
    
    if (!liquidation) {
      throw new Error('Liquidación no encontrada');
    }

    let dateField = '';
    const currentDate = new Date().toISOString().split('T')[0];

    if (status === 'approved') {
      dateField = 'approvedDate';
    } else if (status === 'rejected') {
      dateField = 'rejectedDate';
    }

    if (dateField) {
      db.runSync(`
        UPDATE liquidations 
        SET status = ?, ${dateField} = ?, managerComments = ?, synced = 0
        WHERE id = ?
      `, [status, currentDate, managerComments || null, liquidationId]);
    } else {
      db.runSync(`
        UPDATE liquidations 
        SET status = ?, managerComments = ?, synced = 0
        WHERE id = ?
      `, [status, managerComments || null, liquidationId]);
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
        db.runSync(`UPDATE expenses SET liquidationId = NULL WHERE id = ?`, [expenseId]);
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
 */
export const deleteLiquidation = async (liquidationId: string): Promise<boolean> => {
  try {
    const liquidation = await getLiquidationById(liquidationId);
    
    if (!liquidation) {
      throw new Error('Liquidación no encontrada');
    }

    if (liquidation.status !== 'draft') {
      throw new Error('Solo se pueden eliminar liquidaciones en borrador');
    }

    // Regresar los gastos a estado 'draft' y limpiar liquidationId
    await updateExpensesLiquidationStatus(liquidation.expenseIds, 'draft');
    for (const expenseId of liquidation.expenseIds) {
      db.runSync(`UPDATE expenses SET liquidationId = NULL WHERE id = ?`, [expenseId]);
    }

    db.runSync(`DELETE FROM liquidations WHERE id = ?`, [liquidationId]);

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
    const result = db.getAllSync(`
      SELECT * FROM liquidations 
      WHERE userId = ? AND synced = 0
      ORDER BY createdDate DESC
    `, [userId]);

    const liquidations: Liquidation[] = result.map((row: any) => ({
      id: row.id,
      userId: row.userId,
      employeeName: row.employeeName,
      createdDate: row.createdDate,
      expenseIds: JSON.parse(row.expenseIds),
      totalAmount: row.totalAmount,
      status: row.status as LiquidationStatus,
      managerComments: row.managerComments,
      submittedDate: row.submittedDate,
      approvedDate: row.approvedDate,
      rejectedDate: row.rejectedDate
    }));

    console.log(`📤 ${liquidations.length} liquidaciones pendientes de sincronizar`);
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
    db.runSync(`
      UPDATE liquidations SET synced = 1 WHERE id = ?
    `, [liquidationId]);
    
    console.log(`✅ Liquidación ${liquidationId} marcada como sincronizada`);
  } catch (error) {
    console.error('❌ Error marcando liquidación como sincronizada:', error);
    throw error;
  }
};

/**
 * Genera datos CSV para una liquidación aprobada
 * Retorna un array de objetos con los datos de cada gasto
 */
export const generateCSVData = async (liquidationId: string): Promise<any[]> => {
  try {
    const liquidation = await getLiquidationById(liquidationId);
    
    if (!liquidation) {
      throw new Error('Liquidación no encontrada');
    }

    if (liquidation.status !== 'approved') {
      throw new Error('Solo se pueden generar CSV de liquidaciones aprobadas');
    }

    const csvData = [];

    for (const expenseId of liquidation.expenseIds) {
      const expense = await getExpenseById(expenseId, liquidation.userId);
      if (expense) {
        csvData.push({
          liquidacion_id: liquidation.id,
          gasto_id: expense.id,
          fecha: expense.date,
          descripcion: expense.description,
          monto: expense.amount,
          categoria: expense.category,
          proveedor: expense.supplier,
          ruc: expense.vat_number,
          departamento: expense.department,
          notas: expense.notes || '',
          noinvoice: expense.noinvoice || '',
          serie: expense.serie || '',
          centro: expense.centro || '',
          cuenta: expense.cuenta || '',
          ordenco: expense.ordenco || '',
          total_iva: expense.totiva || 0,
          moneda: expense.currency,
          estado: expense.status,
          empleado: liquidation.employeeName,
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
  generateCSVData
};
