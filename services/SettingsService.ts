import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { AppSettings, DEFAULT_SETTINGS, SETTINGS_CONSTRAINTS } from '../models/Settings';

const STORAGE_KEY = 'app_settings';

let db: SQLite.SQLiteDatabase | null = null;
let isDBInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Inicializa la tabla de configuración en la base de datos si no existe
 */
export const initDB = async (): Promise<void> => {
  if (isDBInitialized && db) {
    console.log("✅ SettingsService: BD ya inicializada");
    return Promise.resolve();
  }
  
  if (initPromise) {
    console.log("⏳ SettingsService: Esperando inicialización en progreso...");
    return initPromise;
  }
  
  initPromise = (async () => {
    if (Platform.OS === 'web') {
      console.log("⚠️ SettingsService: Plataforma web, usando AsyncStorage");
      isDBInitialized = true;
      return;
    }
    
    try {
      console.log("🗄️ SettingsService: Abriendo base de datos...");
      db = await SQLite.openDatabaseAsync('easygastos.db');
      
      console.log("🗄️ SettingsService: Inicializando tabla settings...");
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updatedAt INTEGER NOT NULL
        );
      `);
      
      console.log("✅ SettingsService: Tabla 'settings' verificada/creada con éxito.");
      isDBInitialized = true;
    } catch (error) {
      console.error("❌ SettingsService: Error al inicializar BD", error);
      isDBInitialized = false;
      initPromise = null;
      throw error;
    }
  })();
  
  return initPromise;
};
/**
 * Obtiene todas las configuraciones
 */
export const getSettings = async (): Promise<AppSettings> => {
  await initDB();
  
  if (Platform.OS === 'web') {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  } else {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    try {
      const rows = await db.getAllAsync<{ key: string; value: string }>(
        'SELECT key, value FROM settings'
      );
      
      const settings: any = { ...DEFAULT_SETTINGS };
      rows.forEach(row => {
        try {
          settings[row.key] = JSON.parse(row.value);
        } catch {
          // Mantener valor por defecto si hay error de parsing
        }
      });
      
      return settings;
    } catch (error) {
      console.error("Error al obtener settings:", error);
      return DEFAULT_SETTINGS;
    }
  }
};

/**
 * Guarda una configuración específica
 */
const setSetting = async (key: string, value: any): Promise<void> => {
  await initDB();
  const now = Date.now();
  
  if (Platform.OS === 'web') {
    const settings = await getSettings();
    (settings as any)[key] = value;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } else {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    await db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?)`,
      [key, JSON.stringify(value), now]
    );
  }
};

/**
 * Obtiene el monto máximo permitido por gasto
 */
export const getMaxExpenseAmount = async (): Promise<number> => {
  const settings = await getSettings();
  return settings.maxExpenseAmount;
};

/**
 * Establece el monto máximo permitido por gasto
 */
export const setMaxExpenseAmount = async (amount: number): Promise<void> => {
  // Validar el monto
  const constraints = SETTINGS_CONSTRAINTS.maxExpenseAmount;
  if (amount < constraints.min) {
    throw new Error(`El monto mínimo es Q${constraints.min.toFixed(2)}`);
  }
  if (amount > constraints.max) {
    throw new Error(`El monto máximo es Q${constraints.max.toFixed(2)}`);
  }
  
  await setSetting('maxExpenseAmount', amount);
  console.log(`✅ Monto máximo por gasto actualizado a Q${amount.toFixed(2)}`);
};

/**
 * Restablece todas las configuraciones a valores por defecto
 */
export const resetSettings = async (): Promise<void> => {
  await initDB();
  
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
  } else {
    if (!db) throw new Error("La base de datos no está inicializada.");
    
    // Eliminar todas las configuraciones
    await db.runAsync('DELETE FROM settings');
  }
  
  console.log("✅ Configuraciones restablecidas a valores por defecto");
};
