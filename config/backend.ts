// Configuración del Backend para diferentes entornos
// ⚠️ IMPORTANTE: NO ejecutar nada en import time - todo lazy loaded

import AsyncStorage from '@react-native-async-storage/async-storage';

export const BackendConfig = {
  // URL del backend por defecto
  DEFAULT_URL: 'http://3.82.200.97:3000',
  
  // Obtener URL configurada o usar default
  getBaseUrl: async (): Promise<string> => {
    try {
      // Intentar cargar URL personalizada del usuario
      const customUrl = await AsyncStorage.getItem('backend_custom_url');
      if (customUrl) {
        // MIGRACIÓN: Detectar y limpiar URLs viejas incompatibles
        const oldUrls = [
          'http://200.6.231.237:7300',
          'http://200.6.231.237',
          '200.6.231.237:7300'
        ];
        
        if (oldUrls.some(oldUrl => customUrl.includes(oldUrl))) {
          console.log('🔧 Backend Config: URL vieja detectada, limpiando...', customUrl);
          await AsyncStorage.removeItem('backend_custom_url');
          console.log('✅ Backend Config: URL vieja eliminada, usando nueva por defecto');
          return BackendConfig.DEFAULT_URL;
        }
        
        console.log('🔧 Backend Config: Usando URL personalizada:', customUrl);
        return customUrl;
      }
    } catch (error) {
      console.log('🔧 Backend Config: Error leyendo URL personalizada, usando default');
    }
    
    // Si no hay personalizada, usar la por defecto según entorno
    if (__DEV__) {
      return BackendConfig.DEFAULT_URL;
    }
    
    return BackendConfig.DEFAULT_URL;
  },
  
  // Configuraciones específicas por entorno
  development: {
    baseUrl: 'http://3.82.200.97:3000',
    timeout: 10000,
    retries: 3
  },
  
  production: {
    baseUrl: 'http://3.82.200.97:3000',
    timeout: 15000,
    retries: 5
  },
  
  // Obtener configuración actual
  getCurrentConfig: () => {
    return __DEV__ ? BackendConfig.development : BackendConfig.production;
  }
};

// Función lazy para obtener URL base (se ejecuta cuando se necesite, NO en import time)
let cachedURL: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60000; // 1 minuto

export const getAPI_BASE_URL = async (): Promise<string> => {
  const now = Date.now();
  
  // Si tenemos cache válido, usarlo
  if (cachedURL && (now - cacheTimestamp < CACHE_DURATION)) {
    console.log('🔧 Backend Config: Devolviendo URL desde cache:', cachedURL);
    return cachedURL;
  }
  
  // Obtener URL actualizada
  cachedURL = await BackendConfig.getBaseUrl();
  cacheTimestamp = now;
  console.log('🔧 Backend Config: URL cargada:', cachedURL);
  return cachedURL;
};

// Forzar recarga de URL (útil después de cambiar configuración)
export const reloadBackendURL = () => {
  cachedURL = null;
  cacheTimestamp = 0;
  console.log('🔧 Backend Config: Cache de URL limpiado');
};

export default BackendConfig;