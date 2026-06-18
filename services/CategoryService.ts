import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Category } from '../models/Category';
import * as SQLite from 'expo-sqlite';
import { getDraftExpensesByCategoryName, syncDraftExpensesWithCategoryUpdate } from './ExpenseService';

// Base de datos SQLite
let db: SQLite.SQLiteDatabase | null = null;

// Flag para rastrear si la BD está inicializada
let isDBInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Inicializa la tabla de categorías en la base de datos si no existe.
 */
export const initDB = async (): Promise<void> => {
  // Si ya está inicializada, devolver inmediatamente
  if (isDBInitialized) {
    console.log("✅ CategoryService: BD ya inicializada");
    return;
  }
  
  // Si hay una inicialización en progreso, esperar
  if (initPromise) {
    console.log("⏳ CategoryService: Esperando inicialización en progreso...");
    return initPromise;
  }
  
  // Crear nueva promesa de inicialización
  initPromise = (async () => {
    if (Platform.OS === 'web') {
      console.log("⚠️ CategoryService: Plataforma web, usando AsyncStorage");
      isDBInitialized = true;
      return;
    }
    
    try {
      console.log("🗄️ CategoryService: Inicializando tabla categories...");
      db = await SQLite.openDatabaseAsync('easygastos.db');
      
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY NOT NULL,
          userEmail TEXT NOT NULL,
          name TEXT NOT NULL,
          icon TEXT,
          sociedad TEXT,
          centro TEXT,
          cuenta TEXT,
          ordenco TEXT,
          createdAt INTEGER,
          updatedAt INTEGER,
          needsSync BOOLEAN NOT NULL DEFAULT 1,
          lastSync INTEGER,
          serverUpdatedAt INTEGER
        );
      `);
      
      try {
        await db.execAsync(`ALTER TABLE categories ADD COLUMN sociedad TEXT;`);
        console.log("✅ Columna sociedad agregada");
      } catch (e) {
        console.log("ℹ️ Columna sociedad ya existe o no se pudo agregar");
      }

      console.log("✅ CategoryService: Tabla 'categories' verificada/creada con éxito.");
      isDBInitialized = true;
    } catch (error) {
      console.error("❌ CategoryService: Error al crear la tabla 'categories'", error);
      isDBInitialized = false;
      initPromise = null;
      throw error;
    }
  })();
  
  return initPromise;
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
    
    // Asegurar que la BD está inicializada antes de intentar guardar
    if (!isDBInitialized && Platform.OS !== 'web') {
        console.log("⚠️ CategoryService.addCategory: BD no inicializada, inicializando ahora...");
        await initDB();
    }
    
    // Asegurar que la nueva categoría necesita sincronización y agregar timestamps
    const now = Date.now();
    category.createdAt = now;
    category.updatedAt = now;
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
        if (!db) throw new Error("La base de datos no está inicializada.");
        
        await db.runAsync(
            `INSERT INTO categories 
             (id, userEmail, name, icon, sociedad, centro, cuenta, ordenco, createdAt, updatedAt, needsSync, lastSync, serverUpdatedAt) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL)`,
            [
                category.id, 
                userEmail, 
                category.name, 
                category.icon || null,
                category.sociedad || null,
                category.centro || null,
                category.cuenta || null,
                category.ordenco || null,
                category.createdAt || Date.now(),
                category.updatedAt || Date.now()
            ]
        );
        
        console.log('💾 CategoryService: Categoría guardada en SQLite exitosamente');
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
        if (!db) throw new Error("La base de datos no está inicializada.");
        
        const categories = await db.getAllAsync<Category>(
            'SELECT * FROM categories WHERE userEmail = ?',
            [userEmail]
        );
        
        console.log('📂 CategoryService: SQLite - Categorías encontradas:', categories.length);
        return categories;
    }
};

/**
 * Actualiza una categoría existente.
 */
export const updateCategory = async (category: Category, userEmail: string): Promise<number> => {
  // Actualizar timestamp de modificación
  category.updatedAt = Date.now();
  category.needsSync = true;

  const currentCategories = await getCategories(userEmail);
  const previousCategory = currentCategories.find(existingCategory => existingCategory.id === category.id);

  if (Platform.OS === 'web' || !db) {
        const key = `${STORAGE_KEY_PREFIX}${userEmail}`;
        let items = currentCategories;
        const index = items.findIndex(i => i.id === category.id);
        if (index !== -1) {
            items[index] = category;
            await AsyncStorage.setItem(key, JSON.stringify(items));
        }
    } else {
        if (!db) throw new Error("La base de datos no está inicializada.");
        
        await db.runAsync(
            'UPDATE categories SET name = ?, icon = ?, sociedad = ?, centro = ?, cuenta = ?, ordenco = ?, updatedAt = ?, needsSync = 1 WHERE id = ? AND userEmail = ?',
            [
              category.name, 
              category.icon || null, 
              category.sociedad || null,
              category.centro || null,
              category.cuenta || null,
              category.ordenco || null,
              category.updatedAt,
              category.id, 
              userEmail
            ]
        );
    }

  if (!previousCategory) {
    return 0;
  }

  return syncDraftExpensesWithCategoryUpdate(userEmail, previousCategory.name, category);
};

/**
 * Elimina una categoría por su ID.
 */
export const deleteCategory = async (id: string, userEmail: string): Promise<void> => {
  const currentCategories = await getCategories(userEmail);
  const categoryToDelete = currentCategories.find(category => category.id === id);

  if (!categoryToDelete) {
    throw new Error('Categoría no encontrada.');
  }

  const linkedDraftExpenses = await getDraftExpensesByCategoryName(userEmail, categoryToDelete.name);
  if (linkedDraftExpenses.length > 0) {
    const linkedExpensesSummary = linkedDraftExpenses
      .slice(0, 5)
      .map(expense => `- ${expense.description} (#${expense.id.slice(-6)})`)
      .join('\n');
    const remainingCount = linkedDraftExpenses.length - Math.min(linkedDraftExpenses.length, 5);
    const remainingText = remainingCount > 0 ? `\n- y ${remainingCount} gasto(s) más` : '';

    throw new Error(
      `No se puede eliminar la categoría mientras existan gastos en borrador ligados.\n\n${linkedExpensesSummary}${remainingText}\n\nDesvincula o recategoriza esos gastos antes de eliminarla.`
    );
  }

  if (Platform.OS === 'web' || !db) {
        const key = `${STORAGE_KEY_PREFIX}${userEmail}`;
        let items = await getCategories(userEmail);
        const filtered = items.filter(i => i.id !== id);
        await AsyncStorage.setItem(key, JSON.stringify(filtered));
    } else {
        if (!db) throw new Error("La base de datos no está inicializada.");
        
        await db.runAsync(
            'DELETE FROM categories WHERE id = ? AND userEmail = ?',
            [id, userEmail]
        );
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
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM categories WHERE userEmail = ? AND needsSync = 1',
      [userEmail]
    );
    
    const categories: Category[] = rows.map(row => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      sociedad: row.sociedad,
      centro: row.centro,
      cuenta: row.cuenta,
      ordenco: row.ordenco,
      email: row.userEmail,
      needsSync: Boolean(row.needsSync),
      lastSync: row.lastSync,
      serverUpdatedAt: row.serverUpdatedAt
    }));
    
    console.log('🔍 CategoryService: SQLite - Categorías que necesitan sync:', categories.length, categories.map(c => c.name));
    return categories;
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
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    await db.runAsync(
      'UPDATE categories SET needsSync = 0, lastSync = ? WHERE id = ?',
      [now, categoryId]
    );
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
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    await db.runAsync(
      `INSERT OR REPLACE INTO categories 
       (id, userEmail, name, icon, sociedad, centro, cuenta, ordenco, needsSync, lastSync, serverUpdatedAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        serverCategory.id,
        serverCategory.email,
        serverCategory.name,
        serverCategory.icon || null,
        serverCategory.sociedad || null,
        serverCategory.centro || null,
        serverCategory.cuenta || null,
        serverCategory.ordenco || null,
        Date.now(),
        serverCategory.serverUpdatedAt || Date.now()
      ]
    );
  }
};
