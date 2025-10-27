import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Category } from '../models/Category';

// Carga condicional de expo-sqlite para evitar errores en web
let SQLite;
if (Platform.OS !== 'web') {
  try {
    SQLite = require('expo-sqlite');
  } catch (e) {
    console.error("Error al cargar expo-sqlite. La base de datos no funcionará en móvil.", e);
  }
}

const db = SQLite ? SQLite.openDatabase('easygastos.db') : null;

/**
 * Inicializa la tabla de categorías en la base de datos si no existe.
 */
export const initDB = () => {
  return new Promise<void>((resolve, reject) => {
    if (!db) {
      console.log("DB no disponible, saltando inicialización de tabla categories.");
      return resolve();
    }
    db.transaction((tx: any) => {
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY NOT NULL,
          userEmail TEXT NOT NULL,
          name TEXT NOT NULL,
          icon TEXT,
          centro TEXT,
          cuenta TEXT,
          ordenco TEXT,
          needsSync BOOLEAN NOT NULL DEFAULT 1,
          lastSync INTEGER,
          serverUpdatedAt INTEGER
        );`,
        [],
        () => {
          console.log("Tabla 'categories' verificada/creada con éxito.");
          resolve();
        },
        (_: any, error: any): boolean => {
          console.error("Error al crear la tabla 'categories'", error);
          reject(error);
          return false;
        }
      );
    });
  });
};

const STORAGE_KEY_PREFIX = '@EasyGastos_Categories_';

/**
 * Agrega una nueva categoría.
 */
export const addCategory = async (category: Category, userEmail: string): Promise<void> => {
    console.log('💾 CategoryService: Guardando categoría:', {
        id: category.id,
        name: category.name,
        email: category.email,
        userEmail: userEmail,
        needsSync: category.needsSync
    });
    
    // Asegurar que la nueva categoría necesita sincronización
    category.needsSync = true;
    category.lastSync = undefined;
    category.serverUpdatedAt = undefined;
    
    if (Platform.OS === 'web' || !db) {
        console.log('💾 CategoryService: Guardando en AsyncStorage, key:', `${STORAGE_KEY_PREFIX}${userEmail}`);
        const key = `${STORAGE_KEY_PREFIX}${userEmail}`;
        const existing = await AsyncStorage.getItem(key);
        const items = existing ? JSON.parse(existing) : [];
        items.push(category);
        await AsyncStorage.setItem(key, JSON.stringify(items));
        console.log('💾 CategoryService: Categoría guardada en AsyncStorage exitosamente');
    } else {
        console.log('💾 CategoryService: Guardando en SQLite');
        if (!db) return Promise.reject("La base de datos no está inicializada.");
        return new Promise((resolve, reject) => {
            db.transaction((tx: any) => {
                tx.executeSql(
                    `INSERT INTO categories 
                     (id, userEmail, name, icon, centro, cuenta, ordenco, needsSync, lastSync, serverUpdatedAt) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL)`,
                    [
                        category.id, 
                        userEmail, 
                        category.name, 
                        category.icon || null,
                        category.centro || null,
                        category.cuenta || null,
                        category.ordenco || null
                    ],
                    () => {
                        console.log('💾 CategoryService: Categoría guardada en SQLite exitosamente');
                        resolve();
                    },
                    (_: any, error: any): boolean => { 
                        console.error('❌ CategoryService: Error guardando en SQLite:', error);
                        reject(error); 
                        return false; 
                    }
                );
            });
        });
    }
};

/**
 * Obtiene todas las categorías de un usuario.
 */
export const getCategories = async (userEmail: string): Promise<Category[]> => {
    console.log('📂 CategoryService: Obteniendo categorías para:', userEmail);
    
    if (Platform.OS === 'web' || !db) {
        const key = `${STORAGE_KEY_PREFIX}${userEmail}`;
        const data = await AsyncStorage.getItem(key);
        const categories = data ? JSON.parse(data) : [];
        console.log('📂 CategoryService: AsyncStorage - Categorías encontradas:', categories.length);
        return categories;
    } else {
        if (!db) return Promise.reject("La base de datos no está inicializada.");
        return new Promise((resolve, reject) => {
            db.transaction((tx: any) => {
                tx.executeSql(
                    'SELECT * FROM categories WHERE userEmail = ?',
                    [userEmail],
                    (_: any, { rows }: any) => {
                        console.log('📂 CategoryService: SQLite - Categorías encontradas:', rows._array.length);
                        resolve(rows._array);
                    },
                    (_: any, error: any): boolean => { 
                        console.error('❌ CategoryService: Error obteniendo categorías de SQLite:', error);
                        reject(error); 
                        return false; 
                    }
                );
            });
        });
    }
};

/**
 * Actualiza una categoría existente.
 */
export const updateCategory = async (category: Category, userEmail: string): Promise<void> => {
  if (Platform.OS === 'web' || !db) {
        const key = `${STORAGE_KEY_PREFIX}${userEmail}`;
        let items = await getCategories(userEmail);
        const index = items.findIndex(i => i.id === category.id);
        if (index !== -1) {
            items[index] = category;
            await AsyncStorage.setItem(key, JSON.stringify(items));
        }
    } else {
    if (!db) return Promise.reject("La base de datos no está inicializada.");
        return new Promise((resolve, reject) => {
            db.transaction((tx: any) => {
                tx.executeSql(
                    'UPDATE categories SET name = ?, icon = ? WHERE id = ? AND userEmail = ?',
                    [category.name, category.icon, category.id, userEmail],
                    () => resolve(),
                    (_: any, error: any): boolean => { reject(error); return false; }
                );
            });
        });
    }
};

/**
 * Elimina una categoría por su ID.
 */
export const deleteCategory = async (id: string, userEmail: string): Promise<void> => {
  if (Platform.OS === 'web' || !db) {
        const key = `${STORAGE_KEY_PREFIX}${userEmail}`;
        let items = await getCategories(userEmail);
        const filtered = items.filter(i => i.id !== id);
        await AsyncStorage.setItem(key, JSON.stringify(filtered));
    } else {
    if (!db) return Promise.reject("La base de datos no está inicializada.");
        return new Promise((resolve, reject) => {
            db.transaction((tx: any) => {
                tx.executeSql(
                    'DELETE FROM categories WHERE id = ? AND userEmail = ?',
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
 * Obtiene categorías que necesitan ser sincronizadas con el backend
 */
export const getCategoriesNeedingSync = async (userEmail: string): Promise<Category[]> => {
  console.log('🔍 CategoryService: Buscando categorías que necesitan sincronización para:', userEmail);
  
  if (Platform.OS === 'web' || !db) {
    const categories = await getCategories(userEmail);
    const needingSync = categories.filter(category => category.needsSync);
    console.log('🔍 CategoryService: AsyncStorage - Categorías que necesitan sync:', needingSync.length, needingSync.map(c => c.name));
    return needingSync;
  } else {
    if (!db) return Promise.reject("La base de datos no está inicializada.");
    return new Promise((resolve, reject) => {
      db.transaction((tx: any) => {
        tx.executeSql(
          'SELECT * FROM categories WHERE userEmail = ? AND needsSync = 1',
          [userEmail],
          (_: any, results: any) => {
            const categories: Category[] = [];
            for (let i = 0; i < results.rows.length; i++) {
              const row = results.rows.item(i);
              categories.push({
                id: row.id,
                name: row.name,
                icon: row.icon,
                centro: row.centro,
                cuenta: row.cuenta,
                ordenco: row.ordenco,
                email: row.userEmail,
                needsSync: Boolean(row.needsSync),
                lastSync: row.lastSync,
                serverUpdatedAt: row.serverUpdatedAt
              });
            }
            console.log('🔍 CategoryService: SQLite - Categorías que necesitan sync:', categories.length, categories.map(c => c.name));
            resolve(categories);
          },
          (_: any, error: any): boolean => {
            console.error("Error al obtener categorías que necesitan sincronización", error);
            reject(error);
            return false;
          }
        );
      });
    });
  }
};

/**
 * Marca una categoría como sincronizada con el backend
 */
export const markCategoryAsSynced = async (categoryId: string): Promise<void> => {
  const now = Date.now();
  
  if (Platform.OS === 'web' || !db) {
    // En web, necesitamos buscar la categoría en todos los usuarios y actualizarla
    const keys = await AsyncStorage.getAllKeys();
    const categoryKeys = keys.filter(key => key.startsWith(STORAGE_KEY_PREFIX));
    
    for (const key of categoryKeys) {
      const categoriesStr = await AsyncStorage.getItem(key);
      if (categoriesStr) {
        const categories: Category[] = JSON.parse(categoriesStr);
        const categoryIndex = categories.findIndex(cat => cat.id === categoryId);
        if (categoryIndex !== -1) {
          categories[categoryIndex].needsSync = false;
          categories[categoryIndex].lastSync = now;
          await AsyncStorage.setItem(key, JSON.stringify(categories));
          break;
        }
      }
    }
  } else {
    if (!db) return Promise.reject("La base de datos no está inicializada.");
    return new Promise((resolve, reject) => {
      db.transaction((tx: any) => {
        tx.executeSql(
          'UPDATE categories SET needsSync = 0, lastSync = ? WHERE id = ?',
          [now, categoryId],
          () => resolve(),
          (_: any, error: any): boolean => {
            console.error("Error al marcar categoría como sincronizada", error);
            reject(error);
            return false;
          }
        );
      });
    });
  }
};

/**
 * Inserta o actualiza una categoría desde el servidor
 */
export const upsertCategoryFromServer = async (serverCategory: Category): Promise<void> => {
  if (Platform.OS === 'web' || !db) {
    const key = `${STORAGE_KEY_PREFIX}${serverCategory.email}`;
    const categories = await getCategories(serverCategory.email);
    const existingIndex = categories.findIndex(cat => cat.id === serverCategory.id);
    
    // Marcar como no necesita sincronización ya que viene del servidor
    serverCategory.needsSync = false;
    serverCategory.lastSync = Date.now();
    
    if (existingIndex !== -1) {
      categories[existingIndex] = serverCategory;
    } else {
      categories.push(serverCategory);
    }
    
    await AsyncStorage.setItem(key, JSON.stringify(categories));
  } else {
    if (!db) return Promise.reject("La base de datos no está inicializada.");
    return new Promise((resolve, reject) => {
      db.transaction((tx: any) => {
        tx.executeSql(
          `INSERT OR REPLACE INTO categories 
           (id, userEmail, name, icon, centro, cuenta, ordenco, needsSync, lastSync, serverUpdatedAt) 
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            serverCategory.id,
            serverCategory.email,
            serverCategory.name,
            serverCategory.icon || null,
            serverCategory.centro || null,
            serverCategory.cuenta || null,
            serverCategory.ordenco || null,
            Date.now(),
            serverCategory.serverUpdatedAt || Date.now()
          ],
          () => resolve(),
          (_: any, error: any): boolean => {
            console.error("Error al insertar/actualizar categoría desde servidor", error);
            reject(error);
            return false;
          }
        );
      });
    });
  }
};