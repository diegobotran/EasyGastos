import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Expense } from '../models/Expense';
import * as SQLite from 'expo-sqlite';

type CategorySnapshotUpdate = {
  name: string;
  sociedad?: string;
  centro?: string;
  cuenta?: string;
  ordenco?: string;
};

// Base de datos para gastos
let db: SQLite.SQLiteDatabase | null = null;

// Flag para rastrear si la BD está inicializada
let isDBInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Inicializa la tabla de gastos en la base de datos si no existe.
 */
export const initDB = async (): Promise<void> => {
  // Si ya está inicializada, devolver inmediatamente
  if (isDBInitialized && db) {
    console.log("✅ ExpenseService: BD ya inicializada");
    return Promise.resolve();
  }
  
  // Si hay una inicialización en progreso, devolver la misma promesa
  if (initPromise) {
    console.log("⏳ ExpenseService: Esperando inicialización en progreso...");
    return initPromise;
  }
  
  // Crear nueva promesa de inicialización
  initPromise = (async () => {
    if (Platform.OS === 'web') {
      console.log("⚠️ ExpenseService: Plataforma web, usando AsyncStorage");
      isDBInitialized = true;
      return;
    }
    
    try {
      console.log("🗄️ ExpenseService: Abriendo base de datos...");
      db = await SQLite.openDatabaseAsync('easygastos.db');
      
      console.log("🗄️ ExpenseService: Inicializando tabla expenses...");
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY NOT NULL,
          userEmail TEXT NOT NULL,
          description TEXT NOT NULL,
          amount REAL NOT NULL,
          date TEXT NOT NULL,
          category TEXT NOT NULL,
          sociedad TEXT,
          status TEXT NOT NULL,
          expenseStatus TEXT NOT NULL DEFAULT 'draft',
          satStatus TEXT DEFAULT 'NO_VALIDADO_SAT',
          supplier TEXT,
          vat_number TEXT,
          department TEXT,
          notes TEXT,
          noinvoice TEXT,
          serie TEXT,
          uuid TEXT,
          centro TEXT,
          cuenta TEXT,
          ordenco TEXT,
          managerEmail TEXT,
          liquidationId TEXT,
          voidedAt TEXT,
          voidedReason TEXT,
          createdAt INTEGER,
          updatedAt INTEGER,
          needsSync BOOLEAN NOT NULL DEFAULT 1,
          lastSync INTEGER,
          serverUpdatedAt INTEGER,
          imageuri TEXT,
          totiva REAL,
          currency TEXT
        );
      `);
      
      console.log("🗄️ ExpenseService: Aplicando migraciones de columnas...");
      // Migración: Agregar columnas voidedAt y voidedReason si no existen
      try {
        await db.execAsync(`ALTER TABLE expenses ADD COLUMN voidedAt TEXT;`);
        console.log("✅ Columna voidedAt agregada");
      } catch (e) {
        // La columna ya existe o hubo otro error
        console.log("ℹ️ Columna voidedAt ya existe o no se pudo agregar");
      }
      
      try {
        await db.execAsync(`ALTER TABLE expenses ADD COLUMN voidedReason TEXT;`);
        console.log("✅ Columna voidedReason agregada");
      } catch (e) {
        // La columna ya existe o hubo otro error
        console.log("ℹ️ Columna voidedReason ya existe o no se pudo agregar");
      }
      
      try {
        await db.execAsync(`ALTER TABLE expenses ADD COLUMN createdAt INTEGER;`);
        console.log("✅ Columna createdAt agregada");
      } catch (e) {
        console.log("ℹ️ Columna createdAt ya existe o no se pudo agregar");
      }
      
      try {
        await db.execAsync(`ALTER TABLE expenses ADD COLUMN updatedAt INTEGER;`);
        console.log("✅ Columna updatedAt agregada");
      } catch (e) {
        console.log("ℹ️ Columna updatedAt ya existe o no se pudo agregar");
      }
      
      try {
        await db.execAsync(`ALTER TABLE expenses ADD COLUMN synced INTEGER DEFAULT 0;`);
        console.log("✅ Columna synced agregada");
      } catch (e) {
        console.log("ℹ️ Columna synced ya existe o no se pudo agregar");
      }
      
      try {
        await db.execAsync(`ALTER TABLE expenses ADD COLUMN uuid TEXT;`);
        console.log("✅ Columna uuid (número de autorización FEL) agregada");
      } catch (e) {
        console.log("ℹ️ Columna uuid ya existe o no se pudo agregar");
      }

      try {
        await db.execAsync(`ALTER TABLE expenses ADD COLUMN sociedad TEXT;`);
        console.log("✅ Columna sociedad agregada");
      } catch (e) {
        console.log("ℹ️ Columna sociedad ya existe o no se pudo agregar");
      }

      try {
        await db.execAsync(`ALTER TABLE expenses ADD COLUMN satStatus TEXT DEFAULT 'NO_VALIDADO_SAT';`);
        console.log("✅ Columna satStatus agregada");
      } catch (e) {
        console.log("ℹ️ Columna satStatus ya existe o no se pudo agregar");
      }
      
      console.log("✅ ExpenseService: Tabla 'expenses' verificada/creada con éxito.");
      isDBInitialized = true;
    } catch (error) {
      console.error("❌ ExpenseService: Error al inicializar BD", error);
      isDBInitialized = false;
      initPromise = null;
      throw error;
    }
  })();
  
  return initPromise;
};

const STORAGE_KEY_PREFIX = '@EasyGastos_Expenses_';

/**
 * Verifica si existe un gasto duplicado (misma serie, noinvoice, fecha y monto)
 * Retorna el gasto duplicado si existe, o null si no hay duplicados
 */
export const checkDuplicateExpense = async (
  userEmail: string,
  serie: string,
  noinvoice: string,
  date: string,
  amount: number,
  excludeId?: string // Para excluir el gasto actual al editar
): Promise<{ isDuplicate: boolean; existingExpense?: Expense; inLiquidation?: boolean }> => {
  try {
    console.log('🔍 Verificando duplicados:', { serie, noinvoice, date, amount });
    
    if (!serie || !noinvoice) {
      console.log('⚠️ Serie o número de factura vacíos, no se verifica duplicado');
      return { isDuplicate: false };
    }
    
    const allExpenses = await getExpenses(userEmail);
    
    // Buscar duplicado exacto: misma serie, noinvoice, fecha y monto
    // IMPORTANTE: Ignorar gastos anulados (voided) que no estén en liquidación
    const duplicate = allExpenses.find(exp => 
      exp.id !== excludeId &&
      exp.serie === serie &&
      exp.noinvoice === noinvoice &&
      exp.date === date &&
      Math.abs(exp.amount - amount) < 0.01 && // Comparación de decimales con tolerancia
      exp.expenseStatus !== 'voided' // Permitir re-crear gastos anulados
    );
    
    if (duplicate) {
      console.log('❌ Gasto duplicado encontrado:', duplicate.id);
      const inLiquidation = duplicate.expenseStatus === 'in_liquidation' || duplicate.expenseStatus === 'approved';
      
      return {
        isDuplicate: true,
        existingExpense: duplicate,
        inLiquidation
      };
    }
    
    console.log('✅ No se encontraron duplicados');
    return { isDuplicate: false };
  } catch (error) {
    console.error('❌ Error verificando duplicados:', error);
    return { isDuplicate: false };
  }
};

/**
 * Verifica si un gasto ya está incluido en otra liquidación
 * Retorna true si el gasto está en liquidación, false si está disponible
 */
export const checkExpenseInLiquidation = async (
  expenseId: string,
  userEmail: string
): Promise<{ inLiquidation: boolean; liquidationId?: string; liquidationStatus?: string }> => {
  try {
    const expense = await getExpenseById(expenseId, userEmail);
    
    if (!expense) {
      return { inLiquidation: false };
    }
    
    // Verificar si tiene liquidationId y no está en estado 'draft'
    if (expense.liquidationId && expense.expenseStatus !== 'draft') {
      console.log('⚠️ Gasto ya está en liquidación:', expense.liquidationId);
      
      // Obtener información de la liquidación
      const { getLiquidationById } = require('./LiquidationService');
      const liquidation = await getLiquidationById(expense.liquidationId, userEmail);
      
      return {
        inLiquidation: true,
        liquidationId: expense.liquidationId,
        liquidationStatus: liquidation?.status
      };
    }
    
    return { inLiquidation: false };
  } catch (error) {
    console.error('❌ Error verificando gasto en liquidación:', error);
    return { inLiquidation: false };
  }
};

/**
 * Agrega un nuevo gasto.
 */
export const addExpense = async (expense: Expense, userEmail: string): Promise<void> => {
    // Asegurar que la BD está inicializada antes de intentar guardar
    if (!isDBInitialized) {
        console.log("⚠️ ExpenseService.addExpense: BD no inicializada, inicializando ahora...");
        await initDB();
    }
    
    // VALIDACIÓN DE DUPLICADOS
    const duplicateCheck = await checkDuplicateExpense(
      userEmail,
      expense.serie || '',
      expense.noinvoice || '',
      expense.date,
      expense.amount
    );
    
    if (duplicateCheck.isDuplicate) {
      const msg = duplicateCheck.inLiquidation
        ? `Ya existe una factura con estos datos y está incluida en una liquidación (ID: ${duplicateCheck.existingExpense?.liquidationId?.slice(-6)}).`
        : `Ya existe una factura con estos datos: Serie "${expense.serie}", No. "${expense.noinvoice}", Fecha ${expense.date}, Monto Q${expense.amount.toFixed(2)}.`;
      throw new Error(msg);
    }
    
    // Asegurar que el nuevo gasto necesita sincronización
    expense.needsSync = true;
    expense.lastSync = undefined;
    expense.serverUpdatedAt = undefined;
    
    if (Platform.OS === 'web') {
        const key = `${STORAGE_KEY_PREFIX}${userEmail}`;
        const existingExpenses = await AsyncStorage.getItem(key);
        const expenses = existingExpenses ? JSON.parse(existingExpenses) : [];
        expenses.push(expense);
        await AsyncStorage.setItem(key, JSON.stringify(expenses));
    } else {
        if (!db) throw new Error("La base de datos no está inicializada.");
        
        await db.runAsync(
            `INSERT INTO expenses 
             (id, userEmail, description, amount, date, category, status, expenseStatus, supplier, vat_number, 
               sociedad, department, notes, noinvoice, serie, uuid, centro, cuenta, ordenco, managerEmail, 
               createdAt, updatedAt, needsSync, lastSync, serverUpdatedAt, imageuri, totiva, currency) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, ?, ?, ?)`,
            [
                expense.id, 
                userEmail, 
                expense.description, 
                expense.amount, 
                expense.date, 
                expense.category, 
                expense.status,
                expense.expenseStatus || 'draft',
                expense.supplier || null, 
                expense.vat_number || null, 
                expense.sociedad || null,
                expense.department || null, 
                expense.notes || null, 
                expense.noinvoice || null, 
                expense.serie || null, 
                expense.uuid || null,
                expense.centro || null, 
                expense.cuenta || null, 
                expense.ordenco || null,
                expense.managerEmail || null,
                expense.createdAt || Date.now(),
                expense.updatedAt || Date.now(),
                expense.imageuri || null,
                expense.totiva || null,
                expense.currency || null
            ]
        );
        
        console.log("✅ ExpenseService: Gasto guardado en SQLite");
    }
};

/**
 * Obtiene todos los gastos de un usuario.
 */
export const getExpenses = async (userEmail: string): Promise<Expense[]> => {
    if (Platform.OS === 'web') {
        const key = `${STORAGE_KEY_PREFIX}${userEmail}`;
        const data = await AsyncStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } else {
        if (!db) throw new Error("La base de datos no está inicializada.");
        
        const result = await db.getAllAsync<Expense>(
            'SELECT * FROM expenses WHERE userEmail = ?',
            [userEmail]
        );
        
        return result;
    }
};

/**
 * Obtiene un gasto específico por su ID.
 */
export const getExpenseById = async (id: string, userEmail: string): Promise<Expense | null> => {
    if (Platform.OS === 'web') {
        const expenses = await getExpenses(userEmail);
        return expenses.find(exp => exp.id === id) || null;
    } else {
        if (!db) throw new Error("La base de datos no está inicializada.");
        
        const result = await db.getFirstAsync<Expense>(
            'SELECT * FROM expenses WHERE id = ? AND userEmail = ?',
            [id, userEmail]
        );
        
        return result || null;
    }
};

/**
 * Actualiza un gasto existente.
 */
export const updateExpense = async (expense: Expense, userEmail: string): Promise<void> => {
    if (Platform.OS === 'web') {
        let expenses = await getExpenses(userEmail);
        const index = expenses.findIndex(exp => exp.id === expense.id);
        if (index !== -1) {
            expenses[index] = expense;
            const key = `${STORAGE_KEY_PREFIX}${userEmail}`;
            await AsyncStorage.setItem(key, JSON.stringify(expenses));
        }
    } else {
        if (!db) throw new Error("La base de datos no está inicializada.");
        
        await db.runAsync(
            'UPDATE expenses SET description = ?, amount = ?, date = ?, category = ?, sociedad = ?, status = ?, expenseStatus = ?, satStatus = ?, supplier = ?, vat_number = ?, department = ?, notes = ?, noinvoice = ?, serie = ?, uuid = ?, centro = ?, cuenta = ?, ordenco = ? WHERE id = ? AND userEmail = ?',
            [
                expense.description, 
                expense.amount, 
                expense.date, 
                expense.category, 
                expense.sociedad || null,
                expense.status, 
                expense.expenseStatus || 'draft',
                expense.satStatus || 'NO_VALIDADO_SAT',
                expense.supplier, 
                expense.vat_number, 
                expense.department, 
                expense.notes || null, 
                expense.noinvoice, 
                expense.serie, 
                expense.uuid || null,
                expense.centro, 
                expense.cuenta, 
                expense.ordenco, 
                expense.id, 
                userEmail
            ]
        );
    }
};

export const countDraftExpensesByCategoryName = async (
  userEmail: string,
  categoryName: string
): Promise<number> => {
  if (!categoryName.trim()) {
    return 0;
  }

  if (Platform.OS === 'web') {
    const expenses = await getExpenses(userEmail);
    return expenses.filter(exp =>
      exp.category === categoryName &&
      exp.expenseStatus === 'draft' &&
      !exp.liquidationId
    ).length;
  }

  if (!db) throw new Error("La base de datos no está inicializada.");

  const result = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) as total
     FROM expenses
     WHERE userEmail = ?
       AND category = ?
       AND expenseStatus = 'draft'
       AND (liquidationId IS NULL OR liquidationId = '')`,
    [userEmail, categoryName]
  );

  return result?.total ?? 0;
};

export const syncDraftExpensesWithCategoryUpdate = async (
  userEmail: string,
  previousCategoryName: string,
  updatedCategory: CategorySnapshotUpdate
): Promise<number> => {
  if (!previousCategoryName.trim()) {
    return 0;
  }

  const now = Date.now();

  if (Platform.OS === 'web') {
    const key = `${STORAGE_KEY_PREFIX}${userEmail}`;
    const expenses = await getExpenses(userEmail);
    let updatedCount = 0;

    const syncedExpenses = expenses.map(expense => {
      const shouldUpdate = expense.category === previousCategoryName && expense.expenseStatus === 'draft' && !expense.liquidationId;
      if (!shouldUpdate) {
        return expense;
      }

      updatedCount += 1;

      return {
        ...expense,
        category: updatedCategory.name,
        sociedad: updatedCategory.sociedad || '',
        centro: updatedCategory.centro || '',
        cuenta: updatedCategory.cuenta || '',
        ordenco: updatedCategory.ordenco || '',
        updatedAt: now,
        needsSync: true,
      };
    });

    await AsyncStorage.setItem(key, JSON.stringify(syncedExpenses));
    return updatedCount;
  }

  if (!db) throw new Error("La base de datos no está inicializada.");

  const result = await db.runAsync(
    `UPDATE expenses
     SET category = ?,
         sociedad = ?,
         centro = ?,
         cuenta = ?,
         ordenco = ?,
         updatedAt = ?,
         needsSync = 1
     WHERE userEmail = ?
       AND category = ?
       AND expenseStatus = 'draft'
       AND (liquidationId IS NULL OR liquidationId = '')`,
    [
      updatedCategory.name,
      updatedCategory.sociedad || null,
      updatedCategory.centro || null,
      updatedCategory.cuenta || null,
      updatedCategory.ordenco || null,
      now,
      userEmail,
      previousCategoryName,
    ]
  );

  return result.changes ?? 0;
};

/**
 * Elimina un gasto por su ID.
 */
export const deleteExpense = async (id: string, userEmail: string): Promise<void> => {
    if (Platform.OS === 'web') {
        let expenses = await getExpenses(userEmail);
        const filteredExpenses = expenses.filter(exp => exp.id !== id);
        const key = `${STORAGE_KEY_PREFIX}${userEmail}`;
        await AsyncStorage.setItem(key, JSON.stringify(filteredExpenses));
    } else {
        if (!db) throw new Error("La base de datos no está inicializada.");
        
        await db.runAsync(
            'DELETE FROM expenses WHERE id = ? AND userEmail = ?',
            [id, userEmail]
        );
    }
};

/**
 * Anula un gasto (solo si no está en liquidación).
 * El gasto permanece en la BD como registro histórico pero marcado como 'voided'.
 */
export const voidExpense = async (id: string, userEmail: string, reason: string): Promise<void> => {
    if (!reason || reason.trim().length === 0) {
        throw new Error('Debe proporcionar una razón para anular el gasto');
    }

    // Obtener el gasto actual
    const expense = await getExpenseById(id, userEmail);
    if (!expense) {
        throw new Error('Gasto no encontrado');
    }

    // Validar que no esté en liquidación
    if (expense.liquidationId) {
        throw new Error('No se puede anular un gasto que está en una liquidación. Debe quitarlo primero de la liquidación.');
    }

    // Validar que esté en estado draft
    if (expense.expenseStatus !== 'draft') {
        throw new Error('Solo se pueden anular gastos en estado Borrador');
    }

    const voidedAt = new Date().toISOString();
    const now = Date.now();

    if (Platform.OS === 'web') {
        let expenses = await getExpenses(userEmail);
        const index = expenses.findIndex(exp => exp.id === id);
        if (index !== -1) {
            expenses[index] = {
                ...expenses[index],
                expenseStatus: 'voided',
                voidedAt,
                voidedReason: reason,
                updatedAt: now,
                needsSync: true
            };
            const key = `${STORAGE_KEY_PREFIX}${userEmail}`;
            await AsyncStorage.setItem(key, JSON.stringify(expenses));
        }
    } else {
        if (!db) throw new Error("La base de datos no está inicializada.");
        
        await db.runAsync(
            `UPDATE expenses 
             SET expenseStatus = 'voided', 
                 voidedAt = ?, 
                 voidedReason = ?,
                 needsSync = 1 
             WHERE id = ? AND userEmail = ?`,
            [voidedAt, reason, id, userEmail]
        );
    }

    console.log(`✅ Gasto ${id} anulado. Razón: ${reason}`);
};

/**
 * FUNCIONES DE SINCRONIZACIÓN
 */

/**
 * Obtiene gastos que necesitan ser sincronizados con el backend
 */
export const getExpensesNeedingSync = async (userEmail: string): Promise<Expense[]> => {
  if (Platform.OS === 'web') {
    const expenses = await getExpenses(userEmail);
    return expenses.filter(expense => expense.needsSync);
  } else {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM expenses WHERE userEmail = ? AND needsSync = 1',
      [userEmail]
    );
    
    const expenses: Expense[] = rows.map(row => ({
      id: row.id,
      description: row.description,
      amount: row.amount,
      date: row.date,
      category: row.category,
      sociedad: row.sociedad,
      status: row.status as any,
      expenseStatus: row.expenseStatus || 'draft',
      satStatus: row.satStatus || 'NO_VALIDADO_SAT',
      supplier: row.supplier,
      vat_number: row.vat_number,
      department: row.department,
      notes: row.notes,
      noinvoice: row.noinvoice,
      serie: row.serie,
      centro: row.centro,
      cuenta: row.cuenta,
      ordenco: row.ordenco,
      email: row.userEmail,
      managerEmail: row.managerEmail,
      liquidationId: row.liquidationId,
      voidedAt: row.voidedAt,
      voidedReason: row.voidedReason,
      needsSync: Boolean(row.needsSync),
      lastSync: row.lastSync,
      serverUpdatedAt: row.serverUpdatedAt,
      imageuri: row.imageuri,
      totiva: row.totiva,
      currency: row.currency,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
    
    return expenses;
  }
};

/**
 * Marca un gasto como sincronizado con el backend
 */
export const markExpenseAsSynced = async (expenseId: string): Promise<void> => {
  const now = Date.now();
  
  if (Platform.OS === 'web') {
    // En web, necesitamos buscar el gasto en todos los usuarios y actualizarlo
    const keys = await AsyncStorage.getAllKeys();
    const expenseKeys = keys.filter(key => key.startsWith(STORAGE_KEY_PREFIX));
    
    for (const key of expenseKeys) {
      const expensesStr = await AsyncStorage.getItem(key);
      if (expensesStr) {
        const expenses: Expense[] = JSON.parse(expensesStr);
        const expenseIndex = expenses.findIndex(exp => exp.id === expenseId);
        if (expenseIndex !== -1) {
          expenses[expenseIndex].needsSync = false;
          expenses[expenseIndex].lastSync = now;
          await AsyncStorage.setItem(key, JSON.stringify(expenses));
          break;
        }
      }
    }
  } else {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    await db.runAsync(
      'UPDATE expenses SET needsSync = 0, lastSync = ? WHERE id = ?',
      [now, expenseId]
    );
  }
};

/**
 * Actualiza el estado de un gasto
 */
export const updateExpenseStatus = async (expenseId: string, newStatus: string): Promise<void> => {
  if (Platform.OS === 'web') {
    const keys = await AsyncStorage.getAllKeys();
    const expenseKeys = keys.filter(key => key.startsWith(STORAGE_KEY_PREFIX));
    
    for (const key of expenseKeys) {
      const expensesStr = await AsyncStorage.getItem(key);
      if (expensesStr) {
        const expenses: Expense[] = JSON.parse(expensesStr);
        const expenseIndex = expenses.findIndex(exp => exp.id === expenseId);
        if (expenseIndex !== -1) {
          expenses[expenseIndex].status = newStatus as any;
          expenses[expenseIndex].needsSync = true; // Marcar para sincronización
          await AsyncStorage.setItem(key, JSON.stringify(expenses));
          break;
        }
      }
    }
  } else {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    await db.runAsync(
      'UPDATE expenses SET status = ?, needsSync = 1 WHERE id = ?',
      [newStatus, expenseId]
    );
  }
};

/**
 * Inserta o actualiza un gasto desde el servidor
 */
export const upsertExpenseFromServer = async (serverExpense: Expense): Promise<void> => {
  if (Platform.OS === 'web') {
    const key = `${STORAGE_KEY_PREFIX}${serverExpense.email}`;
    const expenses = await getExpenses(serverExpense.email);
    const existingIndex = expenses.findIndex(exp => exp.id === serverExpense.id);
    
    // Marcar como no necesita sincronización ya que viene del servidor
    serverExpense.needsSync = false;
    serverExpense.lastSync = Date.now();
    
    if (existingIndex !== -1) {
      expenses[existingIndex] = serverExpense;
    } else {
      expenses.push(serverExpense);
    }
    
    await AsyncStorage.setItem(key, JSON.stringify(expenses));
  } else {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    await db.runAsync(
      `INSERT OR REPLACE INTO expenses 
       (id, userEmail, description, amount, date, category, sociedad, status, expenseStatus, satStatus, supplier, vat_number, 
        department, notes, noinvoice, serie, centro, cuenta, ordenco, managerEmail, liquidationId,
        voidedAt, voidedReason, createdAt, updatedAt,
        needsSync, lastSync, serverUpdatedAt, imageuri, totiva, currency, synced) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 1)`,
      [
        serverExpense.id,
        serverExpense.email,
        serverExpense.description,
        serverExpense.amount,
        serverExpense.date,
        serverExpense.category,
        serverExpense.sociedad || null,
        serverExpense.status,
        serverExpense.expenseStatus || 'draft',
        serverExpense.satStatus || 'NO_VALIDADO_SAT',
        serverExpense.supplier || null,
        serverExpense.vat_number || null,
        serverExpense.department || null,
        serverExpense.notes || null,
        serverExpense.noinvoice || null,
        serverExpense.serie || null,
        serverExpense.centro || null,
        serverExpense.cuenta || null,
        serverExpense.ordenco || null,
        serverExpense.managerEmail || null,
        serverExpense.liquidationId || null,
        serverExpense.voidedAt || null,
        serverExpense.voidedReason || null,
        serverExpense.createdAt || Date.now(),
        serverExpense.updatedAt || Date.now(),
        Date.now(),
        serverExpense.serverUpdatedAt || Date.now(),
        serverExpense.imageuri || null,
        serverExpense.totiva || null,
        serverExpense.currency || null
      ]
    );
  }
};

/**
 * Obtiene gastos pendientes de aprobación para un manager
 */
export const getExpensesForApproval = async (managerEmail: string): Promise<Expense[]> => {
  if (Platform.OS === 'web') {
    // En web, necesitamos buscar en todos los usuarios
    const keys = await AsyncStorage.getAllKeys();
    const expenseKeys = keys.filter(key => key.startsWith(STORAGE_KEY_PREFIX));
    const allExpenses: Expense[] = [];
    
    for (const key of expenseKeys) {
      const expensesStr = await AsyncStorage.getItem(key);
      if (expensesStr) {
        const expenses: Expense[] = JSON.parse(expensesStr);
        const pendingExpenses = expenses.filter(exp => 
          exp.managerEmail === managerEmail && exp.status === 'ENVIADO_JEFE'
        );
        allExpenses.push(...pendingExpenses);
      }
    }
    
    return allExpenses;
  } else {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM expenses WHERE managerEmail = ? AND status = ?',
      [managerEmail, 'ENVIADO_JEFE']
    );
    
    const expenses: Expense[] = rows.map(row => ({
      id: row.id,
      description: row.description,
      amount: row.amount,
      date: row.date,
      category: row.category,
      sociedad: row.sociedad,
      status: row.status as any,
      expenseStatus: row.expenseStatus || 'draft',
      satStatus: row.satStatus || 'NO_VALIDADO_SAT',
      supplier: row.supplier,
      vat_number: row.vat_number,
      department: row.department,
      notes: row.notes,
      noinvoice: row.noinvoice,
      serie: row.serie,
      centro: row.centro,
      cuenta: row.cuenta,
      ordenco: row.ordenco,
      email: row.userEmail,
      managerEmail: row.managerEmail,
      liquidationId: row.liquidationId,
      needsSync: Boolean(row.needsSync),
      lastSync: row.lastSync,
      serverUpdatedAt: row.serverUpdatedAt,
      imageuri: row.imageuri,
      totiva: row.totiva,
      currency: row.currency
    }));
    
    return expenses;
  }
};

/**
 * Valida que un gasto pueda agregarse a una liquidación
 */
export const validateExpenseForLiquidation = async (
  expenseId: string,
  userEmail: string,
  targetLiquidationId?: string
): Promise<{ valid: boolean; error?: string }> => {
  try {
    const expense = await getExpenseById(expenseId, userEmail);
    
    if (!expense) {
      return { valid: false, error: 'Gasto no encontrado' };
    }
    
    // Verificar estado del gasto
    if (expense.expenseStatus !== 'draft' && expense.expenseStatus !== 'in_liquidation') {
      return { valid: false, error: 'El gasto ya fue aprobado y no puede incluirse en otra liquidación' };
    }
    
    // Si ya tiene liquidationId y no es la liquidación objetivo
    if (expense.liquidationId && expense.liquidationId !== targetLiquidationId) {
      const { getLiquidationById } = require('./LiquidationService');
      const liquidation = await getLiquidationById(expense.liquidationId, userEmail);
      
      if (liquidation) {
        const statusText = liquidation.status === 'submitted' ? 'enviada' : 
                          liquidation.status === 'approved' ? 'aprobada' : 
                          liquidation.status === 'rejected' ? 'rechazada' : 'en proceso';
        
        return {
          valid: false,
          error: `Este gasto ya está en la liquidación #${expense.liquidationId.slice(-6)} (${statusText}). Primero debe quitarlo de esa liquidación.`
        };
      }
    }
    
    return { valid: true };
  } catch (error) {
    console.error('❌ Error validando gasto para liquidación:', error);
    return { valid: false, error: 'Error al validar el gasto' };
  }
};

/**
 * Actualiza el estado de liquidación de uno o varios gastos
 */
export const updateExpensesLiquidationStatus = async (
  expenseIds: string[], 
  newExpenseStatus: 'draft' | 'in_liquidation' | 'approved'
): Promise<void> => {
  if (Platform.OS === 'web') {
    // Para web, necesitaríamos iterar sobre todos los usuarios (no implementado completamente)
    console.warn('updateExpenseStatus en web no está completamente implementado');
    return;
  } else {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    const placeholders = expenseIds.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE expenses SET expenseStatus = ?, needsSync = 1 WHERE id IN (${placeholders})`,
      [newExpenseStatus, ...expenseIds]
    );
    
    console.log(`✅ ${expenseIds.length} gasto(s) actualizados a estado: ${newExpenseStatus}`);
  }
};
