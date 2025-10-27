import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Expense } from '../models/Expense';

// Carga condicional de expo-sqlite para evitar errores en web
let SQLite;
if (Platform.OS !== 'web') {
  try {
    SQLite = require('expo-sqlite');
  } catch (e) {
    console.error("Error al cargar expo-sqlite. La base de datos no funcionará en móvil.", e);
  }
}

// La API de expo-sqlite es principalmente asíncrona y basada en callbacks.
const db = SQLite ? SQLite.openDatabase('easygastos.db') : null;

/**
 * Inicializa la tabla de gastos en la base de datos si no existe.
 */
export const initDB = () => {
  return new Promise<void>((resolve, reject) => {
    if (!db) {
      console.log("DB no disponible, saltando inicialización de tabla expenses.");
      return resolve();
    }
    db.transaction((tx: any) => {
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY NOT NULL,
            userEmail TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            category TEXT NOT NULL,
            status TEXT NOT NULL,
            supplier TEXT,
            vat_number TEXT,
            department TEXT,
            notes TEXT,
            noinvoice TEXT,
            serie TEXT,
            centro TEXT,
            cuenta TEXT,
            ordenco TEXT,
            managerEmail TEXT,
            needsSync BOOLEAN NOT NULL DEFAULT 1,
            lastSync INTEGER,
            serverUpdatedAt INTEGER,
            imageuri TEXT,
            totiva REAL,
            currency TEXT
        );`,
        [],
        () => {
          console.log("Tabla 'expenses' verificada/creada con éxito.");
          resolve();
        },
        (_: any, error: any): boolean => {
          console.error("Error al crear la tabla 'expenses'", error);
          reject(error);
          return false; // Detiene la transacción
        }
      );
    });
  });
};

const STORAGE_KEY_PREFIX = '@EasyGastos_Expenses_';

/**
 * Agrega un nuevo gasto.
 */
export const addExpense = async (expense: Expense, userEmail: string): Promise<void> => {
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
        if (!db) return Promise.reject("La base de datos no está inicializada.");
        return new Promise((resolve, reject) => {
            db.transaction((tx: any) => {
                tx.executeSql(
                    `INSERT INTO expenses 
                     (id, userEmail, description, amount, date, category, status, supplier, vat_number, 
                      department, notes, noinvoice, serie, centro, cuenta, ordenco, managerEmail, 
                      needsSync, lastSync, serverUpdatedAt, imageuri, totiva, currency) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, ?, ?, ?)`,
                    [
                        expense.id, 
                        userEmail, 
                        expense.description, 
                        expense.amount, 
                        expense.date, 
                        expense.category, 
                        expense.status, 
                        expense.supplier || null, 
                        expense.vat_number || null, 
                        expense.department || null, 
                        expense.notes || null, 
                        expense.noinvoice || null, 
                        expense.serie || null, 
                        expense.centro || null, 
                        expense.cuenta || null, 
                        expense.ordenco || null,
                        expense.managerEmail || null,
                        expense.imageuri || null,
                        expense.totiva || null,
                        expense.currency || null
                    ],
                    () => resolve(),
                    (_: any, error: any): boolean => { reject(error); return false; }
                );
            });
        });
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
        if (!db) return Promise.reject("La base de datos no está inicializada.");
        return new Promise((resolve, reject) => {
            db.transaction((tx: any) => {
                tx.executeSql(
                    'SELECT * FROM expenses WHERE userEmail = ?',
                    [userEmail],
                    (_: any, { rows }: any) => resolve(rows._array),
                    (_: any, error: any): boolean => { reject(error); return false; }
                );
            });
        });
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
        if (!db) return Promise.reject("La base de datos no está inicializada.");
        return new Promise((resolve, reject) => {
            db.transaction((tx: any) => {
                tx.executeSql(
                    'SELECT * FROM expenses WHERE id = ? AND userEmail = ?',
                    [id, userEmail],
                    (_: any, { rows }: any) => {
                        if (rows.length > 0) {
                            resolve(rows.item(0));
                        } else {
                            resolve(null);
                        }
                    },
                    (_: any, error: any): boolean => { reject(error); return false; }
                );
            });
        });
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
        if (!db) return Promise.reject("La base de datos no está inicializada.");
        return new Promise((resolve, reject) => {
            db.transaction((tx: any) => {
                tx.executeSql(
                    'UPDATE expenses SET description = ?, amount = ?, date = ?, category = ?, status = ?, supplier = ?, vat_number = ?, department = ?, notes = ?, noinvoice = ?, serie = ?, centro = ?, cuenta = ?, ordenco = ? WHERE id = ? AND userEmail = ?',
                    [expense.description, expense.amount, expense.date, expense.category, expense.status, expense.supplier, expense.vat_number, expense.department, expense.notes, expense.noinvoice, expense.serie, expense.centro, expense.cuenta, expense.ordenco, expense.id, userEmail],
                    () => resolve(),
                    (_: any, error: any): boolean => { reject(error); return false; }
                );
            });
        });
    }
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
        if (!db) return Promise.reject("La base de datos no está inicializada.");
        return new Promise((resolve, reject) => {
            db.transaction((tx: any) => {
                tx.executeSql(
                    'DELETE FROM expenses WHERE id = ? AND userEmail = ?',
                    [id, userEmail],
                    () => resolve(),
                    (_: any, error: any): boolean => { reject(error); return false; }
                );
            });
        });
    }
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
    if (!db) return Promise.reject("La base de datos no está inicializada.");
    return new Promise((resolve, reject) => {
      db.transaction((tx: any) => {
        tx.executeSql(
          'SELECT * FROM expenses WHERE userEmail = ? AND needsSync = 1',
          [userEmail],
          (_: any, results: any) => {
            const expenses: Expense[] = [];
            for (let i = 0; i < results.rows.length; i++) {
              const row = results.rows.item(i);
              expenses.push({
                id: row.id,
                description: row.description,
                amount: row.amount,
                date: row.date,
                category: row.category,
                status: row.status as any,
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
                needsSync: Boolean(row.needsSync),
                lastSync: row.lastSync,
                serverUpdatedAt: row.serverUpdatedAt,
                imageuri: row.imageuri,
                totiva: row.totiva,
                currency: row.currency
              });
            }
            resolve(expenses);
          },
          (_: any, error: any): boolean => {
            console.error("Error al obtener gastos que necesitan sincronización", error);
            reject(error);
            return false;
          }
        );
      });
    });
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
    if (!db) return Promise.reject("La base de datos no está inicializada.");
    return new Promise((resolve, reject) => {
      db.transaction((tx: any) => {
        tx.executeSql(
          'UPDATE expenses SET needsSync = 0, lastSync = ? WHERE id = ?',
          [now, expenseId],
          () => resolve(),
          (_: any, error: any): boolean => {
            console.error("Error al marcar gasto como sincronizado", error);
            reject(error);
            return false;
          }
        );
      });
    });
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
    if (!db) return Promise.reject("La base de datos no está inicializada.");
    return new Promise((resolve, reject) => {
      db.transaction((tx: any) => {
        tx.executeSql(
          'UPDATE expenses SET status = ?, needsSync = 1 WHERE id = ?',
          [newStatus, expenseId],
          () => resolve(),
          (_: any, error: any): boolean => {
            console.error("Error al actualizar estado del gasto", error);
            reject(error);
            return false;
          }
        );
      });
    });
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
    if (!db) return Promise.reject("La base de datos no está inicializada.");
    return new Promise((resolve, reject) => {
      db.transaction((tx: any) => {
        tx.executeSql(
          `INSERT OR REPLACE INTO expenses 
           (id, userEmail, description, amount, date, category, status, supplier, vat_number, 
            department, notes, noinvoice, serie, centro, cuenta, ordenco, managerEmail, 
            needsSync, lastSync, serverUpdatedAt, imageuri, totiva, currency) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
          [
            serverExpense.id,
            serverExpense.email,
            serverExpense.description,
            serverExpense.amount,
            serverExpense.date,
            serverExpense.category,
            serverExpense.status,
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
            Date.now(),
            serverExpense.serverUpdatedAt || Date.now(),
            serverExpense.imageuri || null,
            serverExpense.totiva || null,
            serverExpense.currency || null
          ],
          () => resolve(),
          (_: any, error: any): boolean => {
            console.error("Error al insertar/actualizar gasto desde servidor", error);
            reject(error);
            return false;
          }
        );
      });
    });
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
    if (!db) return Promise.reject("La base de datos no está inicializada.");
    return new Promise((resolve, reject) => {
      db.transaction((tx: any) => {
        tx.executeSql(
          'SELECT * FROM expenses WHERE managerEmail = ? AND status = ?',
          [managerEmail, 'ENVIADO_JEFE'],
          (_: any, results: any) => {
            const expenses: Expense[] = [];
            for (let i = 0; i < results.rows.length; i++) {
              const row = results.rows.item(i);
              expenses.push({
                id: row.id,
                description: row.description,
                amount: row.amount,
                date: row.date,
                category: row.category,
                status: row.status as any,
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
                needsSync: Boolean(row.needsSync),
                lastSync: row.lastSync,
                serverUpdatedAt: row.serverUpdatedAt,
                imageuri: row.imageuri,
                totiva: row.totiva,
                currency: row.currency
              });
            }
            resolve(expenses);
          },
          (_: any, error: any): boolean => {
            console.error("Error al obtener gastos para aprobación", error);
            reject(error);
            return false;
          }
        );
      });
    });
  }
};
