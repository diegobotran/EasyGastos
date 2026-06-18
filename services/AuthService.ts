/**
 * Obtiene el token JWT almacenado después del login
 */
export const getToken = async (): Promise<string | null> => {
  try {
    const jwtToken = await getJWTToken();
    if (jwtToken) return jwtToken;

    // Intentar obtener de SecureStore primero
    const token = await SecureStore.getItemAsync('authToken');
    if (token) return token;

    // Fallback a AsyncStorage si no existe en SecureStore
    const asyncToken = await AsyncStorage.getItem('@EasyGastos_Token');
    return asyncToken;
  } catch (error) {
    console.error('AuthService: Error obteniendo token:', error);
    return null;
  }
};
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../models/User';

const USER_STORAGE_KEY = '@EasyGastos_User';
const PIN_SECURE_KEY = 'user_pin';
const JWT_TOKEN_KEY = '@EasyGastos_JWT_Token';
const TOKEN_EXPIRY_KEY = '@EasyGastos_Token_Expiry';
const TOKEN_EXPIRY_HOURS = 48;

// Obtener usuario
export const getUser = async (): Promise<User | null> => {
  try {
    const userJson = await AsyncStorage.getItem(USER_STORAGE_KEY);
    return userJson ? JSON.parse(userJson) : null;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
};

// Guardar usuario
export const saveUser = async (user: User): Promise<void> => {
  try {
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch (error) {
    console.error('Error saving user:', error);
    throw error;
  }
};

// Guardar PIN
export const savePIN = async (pin: string): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(PIN_SECURE_KEY, pin);
    } else {
      await SecureStore.setItemAsync(PIN_SECURE_KEY, pin);
    }
  } catch (error) {
    console.error('Error saving PIN:', error);
    throw error;
  }
};

// Validar PIN
export const validatePIN = async (pin: string): Promise<boolean> => {
  try {
    let storedPIN: string | null = null;
    if (Platform.OS === 'web') {
      storedPIN = await AsyncStorage.getItem(PIN_SECURE_KEY);
    } else {
      storedPIN = await SecureStore.getItemAsync(PIN_SECURE_KEY);
    }
    return storedPIN === pin;
  } catch (error) {
    console.error('Error validating PIN:', error);
    return false;
  }
};

// Obtener PIN
export const getPIN = async (): Promise<string | null> => {
  try {
    let storedPIN: string | null = null;
    if (Platform.OS === 'web') {
      storedPIN = await AsyncStorage.getItem(PIN_SECURE_KEY);
    } else {
      storedPIN = await SecureStore.getItemAsync(PIN_SECURE_KEY);
    }
    return storedPIN;
  } catch (error) {
    console.error('Error getting PIN:', error);
    return null;
  }
};

// Guardar JWT
export const saveJWTToken = async (token: string): Promise<void> => {
  try {
    const expiry = Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
    await AsyncStorage.setItem(JWT_TOKEN_KEY, token);
    await AsyncStorage.setItem(TOKEN_EXPIRY_KEY, expiry.toString());
  } catch (error) {
    console.error('Error saving JWT token:', error);
    throw error;
  }
};

// Obtener JWT
export const getJWTToken = async (): Promise<string | null> => {
  try {
    const token = await AsyncStorage.getItem(JWT_TOKEN_KEY);
    const expiry = await AsyncStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!token || !expiry) return null;
    if (Date.now() > parseInt(expiry)) {
      await AsyncStorage.removeItem(JWT_TOKEN_KEY);
      await AsyncStorage.removeItem(TOKEN_EXPIRY_KEY);
      return null;
    }
    return token;
  } catch (error) {
    console.error('Error getting JWT token:', error);
    return null;
  }
};

// Limpiar datos
export const clearUserData = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
    await AsyncStorage.removeItem(JWT_TOKEN_KEY);
    await AsyncStorage.removeItem(TOKEN_EXPIRY_KEY);
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(PIN_SECURE_KEY);
    } else {
      await AsyncStorage.removeItem(PIN_SECURE_KEY);
    }
  } catch (error) {
    console.error('Error clearing user data:', error);
    throw error;
  }
};

// Obtener último usuario que inició sesión
export const getLastLoggedInUser = async (): Promise<User | null> => {
  try {
    const userJson = await AsyncStorage.getItem(USER_STORAGE_KEY);
    return userJson ? JSON.parse(userJson) : null;
  } catch (error) {
    console.error('Error getting last user:', error);
    return null;
  }
};

// Obtener perfil del usuario
export const getUserProfile = async (email: string): Promise<User | null> => {
  try {
    const user = await getLastLoggedInUser();
    return user && user.email === email ? user : null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
};

// Actualizar manager del usuario
export const updateUserManager = async (userEmail: string, managerEmail: string): Promise<void> => {
  try {
    const user = await getLastLoggedInUser();
    if (user && user.email === userEmail) {
      user.managerEmail = managerEmail;
      await saveUser(user);
    }
  } catch (error) {
    console.error('Error updating user manager:', error);
    throw error;
  }
};

// Marcar usuario como sincronizado
export const markUserAsSynced = async (userEmail: string): Promise<void> => {
  try {
    const user = await getLastLoggedInUser();
    if (user && user.email === userEmail) {
      user.needsSync = false;
      user.lastSync = Date.now();
      await saveUser(user);
    }
  } catch (error) {
    console.error('Error marking user as synced:', error);
    throw error;
  }
};

// Obtener headers de autenticación
export const getAuthHeaders = async (): Promise<{ [key: string]: string }> => {
  try {
    const token = await getJWTToken();
    if (token) {
      return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
    }
    return {
      'Content-Type': 'application/json'
    };
  } catch (error) {
    console.error('Error getting auth headers:', error);
    return { 'Content-Type': 'application/json' };
  }
};

// Limpiar token JWT
export const clearJWTToken = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(JWT_TOKEN_KEY);
    await AsyncStorage.removeItem(TOKEN_EXPIRY_KEY);
  } catch (error) {
    console.error('Error clearing JWT token:', error);
  }
};

// Guardar usuario y PIN
export const saveUserAndPin = async (user: User, pin: string): Promise<void> => {
  try {
    await saveUser(user);
    await savePIN(pin);
  } catch (error) {
    console.error('Error saving user and PIN:', error);
    throw error;
  }
};

// Establecer último usuario que inició sesión
export const setLastLoggedInUser = async (email: string): Promise<void> => {
  try {
    const user = await getLastLoggedInUser();
    if (user && user.email === email) {
      await saveUser(user);
    }
  } catch (error) {
    console.error('Error setting last logged in user:', error);
    throw error;
  }
};

// Verificar PIN
export const verifyPin = async (email: string, pin: string): Promise<boolean> => {
  try {
    return await validatePIN(pin);
  } catch (error) {
    console.error('Error verifying PIN:', error);
    return false;
  }
};

// Actualizar PIN
export const updatePin = async (email: string, newPin: string): Promise<void> => {
  try {
    await savePIN(newPin);
  } catch (error) {
    console.error('Error updating PIN:', error);
    throw error;
  }
};
