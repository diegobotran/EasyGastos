// Configuración del Backend para diferentes entornos
// ⚠️ IMPORTANTE: NO ejecutar nada en import time - todo lazy loaded

export const BackendConfig = {
  // URL del backend
  getBaseUrl: () => {
    // Desarrollo en Expo (emulador/PC): usar localhost
    if (__DEV__) {
      return 'http://200.6.231.237:7300';
    }
    
    // Producción (teléfono físico): usar IP pública del servidor
    return 'http://200.6.231.237:7300';
  },
  
  // Configuraciones específicas por entorno
  development: {
    // Emulador o desarrollo en PC
    baseUrl: 'http://200.6.231.237:7300',
    timeout: 10000,
    retries: 3
  },
  
  production: {
    // Teléfono físico - conecta a IP pública del servidor
    baseUrl: 'http://200.6.231.237:7300',
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

export const getAPI_BASE_URL = (): string => {
  if (!cachedURL) {
    cachedURL = BackendConfig.getBaseUrl();
    console.log('🔧 Backend Config: URL generada:', cachedURL);
  }
  console.log('🔧 Backend Config: Devolviendo URL cached:', cachedURL);
  return cachedURL;
};

// Mantener compatibility - pero lazy
Object.defineProperty(module.exports, 'API_BASE_URL', {
  get: () => getAPI_BASE_URL(),
  configurable: true
});

export default BackendConfig;