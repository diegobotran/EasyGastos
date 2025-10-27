import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAPI_BASE_URL } from '../config/backend';
import { Category } from '../models/Category';
import { Expense } from '../models/Expense';
import { User } from '../models/User';
import * as AuthService from './AuthService';
import * as CategoryService from './CategoryService';
import * as ExpenseService from './ExpenseService';
import * as LiquidationService from './LiquidationService';

/**
 * Servicio para sincronización con el backend
 * Maneja conexión, sincronización offline-first y detección de internet
 * 
 * 📋 FLUJO DE LIQUIDACIONES Y ESTADOS:
 * 
 * EMPLEADO (Usuario Normal):
 * 1. Crea liquidación → status: 'draft'
 * 2. Envía a manager → status: 'submitted'
 * 3. Sincroniza periódicamente para recibir respuesta del manager:
 *    - Si manager aprueba → status: 'approved'
 *    - Si manager rechaza → status: 'rejected' (puede reenviar)
 * 
 * MANAGER (Jefe):
 * 1. Recibe SOLO liquidaciones con status: 'submitted' de sus subordinados
 * 2. Puede aprobar → cambia status a 'approved' en backend
 * 3. Puede rechazar → cambia status a 'rejected' en backend
 * 4. Los cambios se sincronizan automáticamente al empleado
 * 
 * 💰 FLUJO DE GASTOS INDIVIDUALES:
 * 
 * EMPLEADO:
 * 1. Crea gasto → status: 'BORRADOR', expenseStatus: 'draft'
 * 2. Puede enviar a aprobación individual → status: 'ENVIADO_JEFE'
 * 3. Sincroniza para recibir respuesta:
 *    - Si aprobado → status: 'APROBADO_JEFE'
 *    - Si rechazado → status: 'RECHAZADO_JEFE' (vuelve a BORRADOR)
 * 4. Luego puede incluir en liquidación → expenseStatus: 'in_liquidation'
 * 
 * MANAGER:
 * 1. Recibe SOLO gastos con status: 'ENVIADO_JEFE' de sus subordinados
 * 2. Puede aprobar → status: 'APROBADO_JEFE'
 * 3. Puede rechazar → status: 'RECHAZADO_JEFE'
 * 4. Los cambios se sincronizan automáticamente al empleado
 * 
 * SINCRONIZACIÓN AUTOMÁTICA:
 * - Empleados: 
 *   * downloadExpensesFromBackend() → GET /api/expenses?userEmail=... (TODOS sus gastos)
 *   * downloadLiquidationsFromBackend() → GET /api/liquidations/user/:userId (TODAS sus liquidaciones)
 * - Managers:
 *   * downloadPendingExpensesForManager() → GET /api/expenses/pending-approval (SOLO ENVIADO_JEFE)
 *   * downloadPendingLiquidationsForManager() → GET /api/liquidations/manager/:email (SOLO submitted)
 * - Frecuencia: Cada 5 minutos (configurable en useManagerSync)
 * - Se actualiza el estado local si difiere del backend
 */
export class BackendSyncService {
  private static readonly BACKEND_IP_KEY = 'backend_ip_address';
  private static readonly BACKEND_PORT_KEY = 'backend_port';
  private static readonly LAST_SYNC_KEY = 'last_sync_timestamp';
  private static readonly SYNC_IN_PROGRESS_KEY = 'sync_in_progress';
  private static readonly DEFAULT_IP = '200.6.231.237';
  private static readonly DEFAULT_PORT = '7300';

  /**
   * Obtiene la URL base del backend según la configuración
   */
  private static getBackendBaseUrl(): string {
    const url = getAPI_BASE_URL();
    console.log('🌐 BackendSync: URL base obtenida de configuración:', url);
    return url;
  }

  /**
   * Obtiene la configuración del backend
   */
  static async getBackendConfig(): Promise<{ ip: string; port: string; url: string }> {
    try {
      console.log('🔧 BackendSync: Obteniendo configuración del backend...');
      
      // USAR DIRECTAMENTE LA IP Y PUERTO SIN COMPLICACIONES
      const finalConfig = { 
        ip: this.DEFAULT_IP, 
        port: this.DEFAULT_PORT, 
        url: `http://${this.DEFAULT_IP}:${this.DEFAULT_PORT}` 
      };
      console.log('🔧 BackendSync: Configuración directa (sin cache):', finalConfig);
      return finalConfig;
    } catch (error) {
      console.error('❌ BackendSync: Error obteniendo configuración backend:', error);
      const defaultConfig = { 
        ip: this.DEFAULT_IP, 
        port: this.DEFAULT_PORT, 
        url: `http://${this.DEFAULT_IP}:${this.DEFAULT_PORT}` 
      };
      console.log('🔧 BackendSync: Usando configuración por defecto:', defaultConfig);
      return defaultConfig;
    }
  }

  /**
   * Registra un usuario en el backend
   */
  static async syncUserRegistration(user: User, userPIN: string): Promise<{ success: boolean; error?: string }> {
    console.log('👤 BackendSync: ========== INICIO SINCRONIZACIÓN USUARIO ==========');
    console.log('👤 BackendSync: Email:', user.email);
    console.log('👤 BackendSync: Nombre:', user.firstName, user.lastName);
    console.log('👤 BackendSync: Departamento:', user.department);

    try {
      const { url: backendUrl } = await this.getBackendConfig();
      const requestUrl = `${backendUrl}/api/users/register`;
      console.log('👤 BackendSync: URL de registro:', requestUrl);

      const userData = {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        department: user.department,
        pin: userPIN
      };
      console.log('👤 BackendSync: Datos de usuario a enviar:', JSON.stringify(userData, null, 2));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('⏰ BackendSync: Timeout de 10 segundos para registro de usuario');
        controller.abort();
      }, 10000);

      console.log('📡 BackendSync: Enviando petición POST de registro...');
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log('📡 BackendSync: Respuesta de registro - Status:', response.status);
      console.log('📡 BackendSync: Respuesta de registro - OK:', response.ok);

      if (response.ok) {
        const result = await response.text();
        console.log('✅ BackendSync: Usuario registrado exitosamente:', result);
        await AuthService.markUserAsSynced(user.email);
        console.log('✅ BackendSync: Usuario marcado como sincronizado');
        return { success: true };
      } else {
        const errorText = await response.text();
        console.log('❌ BackendSync: Error en registro - Status:', response.status, 'Error:', errorText);
        
        if (response.status === 409) {
          console.log('ℹ️ BackendSync: Usuario ya existe - marcando como sincronizado');
          await AuthService.markUserAsSynced(user.email);
          return { success: true };
        }
        
        return { success: false, error: `Error ${response.status}: ${errorText}` };
      }
    } catch (error) {
      console.error('🚨 BackendSync: Error registrando usuario:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  /**
   * Realiza login y obtiene token JWT del backend
   */
  static async loginAndGetToken(email: string, pin: string): Promise<{ success: boolean; token?: string; error?: string }> {
    console.log('🔐 BackendSync: ========== INICIO LOGIN ==========');
    console.log('🔐 BackendSync: Email:', email);

    try {
      const { url: backendUrl } = await this.getBackendConfig();
      const requestUrl = `${backendUrl}/api/users/login`;
      console.log('🔐 BackendSync: URL de login:', requestUrl);

      const loginData = {
        email: email,
        pin: pin
      };
      console.log('🔐 BackendSync: Datos de login a enviar:', JSON.stringify(loginData, null, 2));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('⏰ BackendSync: Timeout de 10 segundos para login');
        controller.abort();
      }, 10000);

      console.log('📡 BackendSync: Enviando petición POST de login...');
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loginData),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log('📡 BackendSync: Respuesta de login - Status:', response.status);
      console.log('📡 BackendSync: Respuesta de login - OK:', response.ok);

      if (response.ok) {
        const result = await response.json();
        console.log('✅ BackendSync: Login exitoso:', result.message);
        console.log('🎫 BackendSync: Token obtenido (primeros 50 chars):', result.token.substring(0, 50) + '...');
        return { success: true, token: result.token };
      } else {
        const errorText = await response.text();
        console.log('❌ BackendSync: Error en login - Status:', response.status, 'Error:', errorText);
        return { success: false, error: `Error ${response.status}: ${errorText}` };
      }
    } catch (error) {
      console.error('🚨 BackendSync: Error en login:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  /**
   * Sincroniza categorías del usuario con el backend
   */
  static async syncCategories(userEmail: string, authToken: string): Promise<{ success: boolean; error?: string }> {
    console.log('🔄 BackendSync: ============ INICIO SINCRONIZACIÓN CATEGORÍAS ============');
    console.log('🔄 BackendSync: Usuario:', userEmail);
    console.log('🔄 BackendSync: Token disponible:', authToken ? 'SÍ' : 'NO');

    try {
      const { url: backendUrl } = await this.getBackendConfig();
      console.log('🌐 BackendSync: URL del backend obtenida:', backendUrl);
      
      const localCategories = await CategoryService.getCategoriesNeedingSync(userEmail);
      console.log('📂 BackendSync: Categorías que necesitan sincronización:', localCategories.length);
      console.log('📂 BackendSync: Detalles:', JSON.stringify(localCategories, null, 2));
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const category of localCategories) {
        console.log('📤 BackendSync: ========== PROCESANDO CATEGORÍA ==========');
        console.log('📤 BackendSync: Nombre:', category.name);
        console.log('📤 BackendSync: ID:', category.id);
        console.log('📤 BackendSync: Email:', category.email);

        // Construir el objeto con userEmail en vez de email (desestructuración para remover email)
        const { email, ...categoryWithoutEmail } = category;
        const categoryPayload = {
          ...categoryWithoutEmail,
          userEmail: email,
        };

        const requestUrl = `${backendUrl}/api/categories`;
        console.log('🌐 BackendSync: URL COMPLETA de la petición POST:', requestUrl);
        console.log('📦 BackendSync: JSON que se va a enviar:', JSON.stringify(categoryPayload, null, 2));

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.log('⏰ BackendSync: TIMEOUT de 10 segundos para categoría:', category.name);
            controller.abort();
          }, 10000);

          console.log('📡 BackendSync: Iniciando petición fetch POST...');
          const response = await fetch(requestUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(categoryPayload),
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          console.log('📡 BackendSync: ========== RESPUESTA RECIBIDA ==========');
          console.log('📡 BackendSync: Status Code:', response.status);
          console.log('📡 BackendSync: Status Text:', response.statusText);
          console.log('📡 BackendSync: Response OK:', response.ok);
          console.log('📡 BackendSync: Response URL:', response.url);

          if (response.ok) {
            const responseData = await response.text();
            console.log('📡 BackendSync: ÉXITO - Datos de respuesta:', responseData);
            await CategoryService.markCategoryAsSynced(category.id);
            console.log('✅ BackendSync: Categoría marcada como sincronizada:', category.name);
            successCount++;
          } else {
            const errorText = await response.text();
            console.log('❌ BackendSync: ERROR DEL SERVIDOR');
            console.log('❌ BackendSync: Status:', response.status);
            console.log('❌ BackendSync: Error texto:', errorText);
            errorCount++;
          }
        } catch (fetchError) {
          console.error('🚨 BackendSync: ========== ERROR DE FETCH ==========');
          console.error('🚨 BackendSync: Categoría afectada:', category.name);
          console.error('🚨 BackendSync: Error completo:', fetchError);
          errorCount++;
        }
      }

      console.log('📊 BackendSync: Resumen - Exitosas:', successCount, 'Errores:', errorCount);

      if (successCount > 0) {
        console.log('✅ BackendSync: Categorías sincronizadas exitosamente');
        return { success: true };
      } else {
        return { success: false, error: `No se pudieron sincronizar las ${localCategories.length} categorías` };
      }
    } catch (error) {
      console.error('❌ BackendSync: Error general sincronizando categorías:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  /**
   * Sincroniza gastos del usuario con el backend
   */
  static async syncExpenses(userEmail: string, authToken: string): Promise<{ success: boolean; error?: string }> {
    console.log('💰 BackendSync: ============ INICIO SINCRONIZACIÓN GASTOS ============');
    console.log('💰 BackendSync: Usuario:', userEmail);
    console.log('💰 BackendSync: Token disponible:', authToken ? 'SÍ' : 'NO');

    try {
      const { url: backendUrl } = await this.getBackendConfig();
      console.log('🌐 BackendSync: URL del backend obtenida:', backendUrl);
      
      const localExpenses = await ExpenseService.getExpensesNeedingSync(userEmail);
      console.log('💰 BackendSync: Gastos que necesitan sincronización:', localExpenses.length);
      console.log('💰 BackendSync: Detalles:', JSON.stringify(localExpenses, null, 2));
      
      if (localExpenses.length === 0) {
        console.log('✅ BackendSync: No hay gastos pendientes de sincronización');
        return { success: true };
      }
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const expense of localExpenses) {
        console.log('📤 BackendSync: ========== PROCESANDO GASTO ==========');
        console.log('📤 BackendSync: Descripción:', expense.description);
        console.log('📤 BackendSync: ID:', expense.id);
        console.log('📤 BackendSync: Monto:', expense.amount);
        console.log('📤 BackendSync: Email:', expense.email);

        // Construir el objeto con userEmail en vez de email (desestructuración para remover email)
        const { email, ...expenseWithoutEmail } = expense;
        const expensePayload = {
          ...expenseWithoutEmail,
          userEmail: email,
        };

        const requestUrl = `${backendUrl}/api/expenses`;
        console.log('🌐 BackendSync: URL COMPLETA de la petición POST:', requestUrl);
        console.log('📦 BackendSync: JSON que se va a enviar:', JSON.stringify(expensePayload, null, 2));

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.log('⏰ BackendSync: TIMEOUT de 10 segundos para gasto:', expense.description);
            controller.abort();
          }, 10000);

          console.log('📡 BackendSync: Iniciando petición fetch POST...');
          const response = await fetch(requestUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(expensePayload),
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          console.log('📡 BackendSync: ========== RESPUESTA RECIBIDA ==========');
          console.log('📡 BackendSync: Status Code:', response.status);
          console.log('📡 BackendSync: Status Text:', response.statusText);
          console.log('📡 BackendSync: Response OK:', response.ok);

          if (response.ok) {
            const responseData = await response.text();
            console.log('� BackendSync: ÉXITO - Datos de respuesta:', responseData);
            await ExpenseService.markExpenseAsSynced(expense.id);
            console.log('✅ BackendSync: Gasto marcado como sincronizado:', expense.description);
            successCount++;
          } else {
            const errorText = await response.text();
            console.log('❌ BackendSync: ERROR DEL SERVIDOR');
            console.log('❌ BackendSync: Status:', response.status);
            console.log('❌ BackendSync: Error texto:', errorText);
            errorCount++;
          }
        } catch (fetchError) {
          console.error('❌ BackendSync: Error en fetch para gasto:', expense.description, fetchError);
          errorCount++;
        }
      }

      console.log('🔄 BackendSync: ========== RESUMEN SINCRONIZACIÓN GASTOS ==========');
      console.log('✅ BackendSync: Gastos sincronizados:', successCount);
      console.log('❌ BackendSync: Gastos con error:', errorCount);

      if (successCount > 0 && errorCount === 0) {
        return { success: true };
      } else if (successCount > 0 && errorCount > 0) {
        return { success: true, error: `${errorCount} gastos no se pudieron sincronizar` };
      } else {
        return { success: false, error: 'No se pudo sincronizar ningún gasto' };
      }
    } catch (error) {
      console.error('🚨 BackendSync: Error general en sincronización de gastos:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  /**
   * Sincroniza liquidaciones del usuario con el backend
   */
  static async syncLiquidations(userEmail: string, authToken: string): Promise<{ success: boolean; error?: string }> {
    console.log('📁 BackendSync: ============ INICIO SINCRONIZACIÓN LIQUIDACIONES ============');
    console.log('📁 BackendSync: Usuario:', userEmail);
    console.log('📁 BackendSync: Token disponible:', authToken ? 'SÍ' : 'NO');

    try {
      const { url: backendUrl } = await this.getBackendConfig();
      console.log('🌐 BackendSync: URL del backend obtenida:', backendUrl);
      
      const localLiquidations = await LiquidationService.getLiquidationsNeedingSync(userEmail);
      console.log('📁 BackendSync: Liquidaciones que necesitan sincronización:', localLiquidations.length);
      
      if (localLiquidations.length === 0) {
        console.log('✅ BackendSync: No hay liquidaciones pendientes de sincronización');
        return { success: true };
      }
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const liquidation of localLiquidations) {
        console.log('📤 BackendSync: ========== PROCESANDO LIQUIDACIÓN ==========');
        console.log('📤 BackendSync: ID:', liquidation.id);
        console.log('📤 BackendSync: Empleado:', liquidation.employeeName);
        console.log('📤 BackendSync: Total:', liquidation.totalAmount);
        console.log('📤 BackendSync: Status:', liquidation.status);
        console.log('📤 BackendSync: Gastos incluidos:', liquidation.expenseIds.length);

        const requestUrl = `${backendUrl}/api/liquidations`;
        console.log('🌐 BackendSync: URL COMPLETA de la petición POST:', requestUrl);
        console.log('📦 BackendSync: JSON que se va a enviar:', JSON.stringify(liquidation, null, 2));

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.log('⏰ BackendSync: TIMEOUT de 10 segundos para liquidación:', liquidation.id);
            controller.abort();
          }, 10000);

          console.log('📡 BackendSync: Iniciando petición fetch POST...');
          const response = await fetch(requestUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(liquidation),
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          console.log('📡 BackendSync: ========== RESPUESTA RECIBIDA ==========');
          console.log('📡 BackendSync: Status Code:', response.status);
          console.log('📡 BackendSync: Status Text:', response.statusText);
          console.log('📡 BackendSync: Response OK:', response.ok);

          if (response.ok) {
            const responseData = await response.text();
            console.log('✅ BackendSync: ÉXITO - Datos de respuesta:', responseData);
            await LiquidationService.markLiquidationAsSynced(liquidation.id);
            console.log('✅ BackendSync: Liquidación marcada como sincronizada:', liquidation.id);
            successCount++;
          } else {
            const errorText = await response.text();
            console.log('❌ BackendSync: ERROR DEL SERVIDOR');
            console.log('❌ BackendSync: Status:', response.status);
            console.log('❌ BackendSync: Error:', errorText);
            errorCount++;
          }
        } catch (fetchError) {
          console.error('❌ BackendSync: Error en fetch de liquidación:', fetchError);
          errorCount++;
        }
      }

      console.log('🔄 BackendSync: ========== RESUMEN SINCRONIZACIÓN LIQUIDACIONES ==========');
      console.log('✅ BackendSync: Liquidaciones sincronizadas:', successCount);
      console.log('❌ BackendSync: Liquidaciones con error:', errorCount);

      if (successCount > 0 && errorCount === 0) {
        return { success: true };
      } else if (successCount > 0 && errorCount > 0) {
        return { success: true, error: `${errorCount} liquidaciones no se pudieron sincronizar` };
      } else {
        return { success: false, error: 'No se pudo sincronizar ninguna liquidación' };
      }
    } catch (error) {
      console.error('🚨 BackendSync: Error general en sincronización de liquidaciones:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  /**
   * DESCARGA categorías desde el backend y las guarda localmente
   */
  static async downloadCategoriesFromBackend(userEmail: string, authToken: string): Promise<{ success: boolean; count: number; error?: string }> {
    console.log('📥 BackendSync: ============ DESCARGANDO CATEGORÍAS DESDE BACKEND ============');
    console.log('📥 BackendSync: Usuario:', userEmail);

    try {
      const { url: backendUrl } = await this.getBackendConfig();
      const requestUrl = `${backendUrl}/api/categories`;
      console.log('🌐 BackendSync: GET', requestUrl);

      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ BackendSync: Error descargando categorías:', errorText);
        return { success: false, count: 0, error: `Error ${response.status}: ${errorText}` };
      }

      const categories: Category[] = await response.json();
      console.log('📥 BackendSync: Categorías recibidas del backend:', categories.length);

      // Guardar cada categoría localmente
      let savedCount = 0;
      for (const category of categories) {
        try {
          // Usar upsertCategoryFromServer para insertar/actualizar
          await CategoryService.upsertCategoryFromServer({
            ...category,
            email: userEmail,
            needsSync: false,
            lastSync: Date.now()
          });
          savedCount++;
        } catch (saveError) {
          console.error('❌ BackendSync: Error guardando categoría:', category.name, saveError);
        }
      }

      console.log('✅ BackendSync: Categorías guardadas localmente:', savedCount);
      return { success: true, count: savedCount };
    } catch (error) {
      console.error('❌ BackendSync: Error en descarga de categorías:', error);
      return { success: false, count: 0, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  /**
   * DESCARGA gastos desde el backend y los guarda localmente
   */
  static async downloadExpensesFromBackend(userEmail: string, authToken: string): Promise<{ success: boolean; count: number; error?: string }> {
    console.log('📥 BackendSync: ============ DESCARGANDO GASTOS DESDE BACKEND ============');
    console.log('📥 BackendSync: Usuario:', userEmail);

    try {
      const { url: backendUrl } = await this.getBackendConfig();
      // IMPORTANTE: Agregar userEmail como query parameter
      const requestUrl = `${backendUrl}/api/expenses?userEmail=${encodeURIComponent(userEmail)}`;
      console.log('🌐 BackendSync: GET', requestUrl);

      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ BackendSync: Error descargando gastos:', errorText);
        return { success: false, count: 0, error: `Error ${response.status}: ${errorText}` };
      }

      // El backend retorna { expenses: [...], pagination: {...} }
      const data = await response.json();
      const expenses: Expense[] = data.expenses || data; // Compatibilidad con ambos formatos
      console.log('📥 BackendSync: Gastos recibidos del backend:', expenses.length);

      if (expenses.length === 0) {
        console.log('ℹ️ BackendSync: No hay gastos para descargar');
        return { success: true, count: 0 };
      }

      // IMPORTANTE: Actualizar gastos existentes con sus estados actualizados
      let savedCount = 0;
      for (const expense of expenses) {
        try {
          // Usar upsertExpenseFromServer para insertar/actualizar
          // Esto actualiza campos como status, approvalComments, approvedBy, etc.
          await ExpenseService.upsertExpenseFromServer({
            ...expense,
            email: userEmail,
            needsSync: false,
            lastSync: Date.now()
          });
          savedCount++;
        } catch (saveError) {
          console.error('❌ BackendSync: Error guardando gasto:', expense.description, saveError);
        }
      }

      console.log('✅ BackendSync: Gastos guardados/actualizados localmente:', savedCount);
      return { success: true, count: savedCount };
    } catch (error) {
      console.error('❌ BackendSync: Error en descarga de gastos:', error);
      return { success: false, count: 0, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  /**
   * DESCARGA liquidaciones desde el backend y las guarda localmente
   */
  static async downloadLiquidationsFromBackend(userEmail: string, authToken: string): Promise<{ success: boolean; count: number; error?: string }> {
    console.log('📥 BackendSync: ============ DESCARGANDO LIQUIDACIONES DESDE BACKEND ============');
    console.log('📥 BackendSync: Usuario:', userEmail);

    try {
      const { url: backendUrl } = await this.getBackendConfig();
      // IMPORTANTE: Usar endpoint correcto para obtener liquidaciones del usuario
      const requestUrl = `${backendUrl}/api/liquidations/user/${encodeURIComponent(userEmail)}`;
      console.log('🌐 BackendSync: GET', requestUrl);

      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ BackendSync: Error descargando liquidaciones:', errorText);
        return { success: false, count: 0, error: `Error ${response.status}: ${errorText}` };
      }

      const liquidations = await response.json();
      console.log('📥 BackendSync: Liquidaciones recibidas del backend:', liquidations.length);

      if (liquidations.length === 0) {
        console.log('ℹ️ BackendSync: No hay liquidaciones para descargar');
        return { success: true, count: 0 };
      }

      // IMPORTANTE: Actualizar liquidaciones existentes con su estado actualizado
      let savedCount = 0;
      for (const liquidation of liquidations) {
        try {
          // Verificar si la liquidación ya existe localmente
          const existingLiquidation = await LiquidationService.getLiquidationById(liquidation.id);
          
          if (existingLiquidation) {
            // La liquidación existe, ACTUALIZAR su estado
            console.log(`🔄 BackendSync: Actualizando liquidación existente ${liquidation.id} - Estado: ${liquidation.status}`);
            
            // Actualizar el estado de la liquidación usando los parámetros correctos
            await LiquidationService.updateLiquidationStatus(
              liquidation.id,
              liquidation.status,
              liquidation.managerComments || undefined
            );
            
            savedCount++;
          } else {
            // La liquidación NO existe, crear nueva
            console.log(`➕ BackendSync: Creando nueva liquidación ${liquidation.id}`);
            const dto = {
              userId: liquidation.userId || userEmail,
              employeeName: liquidation.employeeName,
              expenseIds: liquidation.expenseIds || []
            };
            
            await LiquidationService.createLiquidation(dto);
            savedCount++;
          }
        } catch (saveError) {
          console.error('❌ BackendSync: Error guardando/actualizando liquidación:', liquidation.id, saveError);
        }
      }

      console.log('✅ BackendSync: Liquidaciones procesadas localmente:', savedCount);
      return { success: true, count: savedCount };
    } catch (error) {
      console.error('❌ BackendSync: Error en descarga de liquidaciones:', error);
      return { success: false, count: 0, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  /**
   * Ejecuta sincronización completa de todos los datos del usuario
   */
  static async fullSync(userEmail: string): Promise<{ success: boolean; error?: string }> {
    try {
      const syncInProgress = await AsyncStorage.getItem(this.SYNC_IN_PROGRESS_KEY);
      if (syncInProgress === 'true') {
        console.log('🔄 BackendSync: Sincronización ya en progreso');
        return { success: false, error: 'Sincronización ya en progreso' };
      }

      await AsyncStorage.setItem(this.SYNC_IN_PROGRESS_KEY, 'true');

      try {
        console.log('🚀 BackendSync: ========== INICIANDO SINCRONIZACIÓN COMPLETA ==========');
        console.log('🚀 BackendSync: Usuario a sincronizar:', userEmail);
        
        // PASO 1: SINCRONIZAR USUARIO PRIMERO (CRÍTICO)
        console.log('👤 BackendSync: ========== PASO 1: SINCRONIZAR USUARIO ==========');
        const user = await AuthService.getLastLoggedInUser();
        if (!user) {
          console.error('❌ BackendSync: No se encontró usuario logueado');
          return { success: false, error: 'No se encontró usuario logueado' };
        }

        console.log('👤 BackendSync: Usuario encontrado:', user.email);
        console.log('👤 BackendSync: Obteniendo PIN del usuario...');
        
        const userPIN = await AuthService.getPIN();
        if (!userPIN) {
          console.error('❌ BackendSync: No se encontró PIN del usuario');
          return { success: false, error: 'No se encontró PIN del usuario' };
        }
        
        console.log('👤 BackendSync: Registrando usuario en backend...');
        const userResult = await this.syncUserRegistration(user, userPIN);
        
        if (!userResult.success) {
          console.error('❌ BackendSync: FALLO CRÍTICO - Usuario no sincronizado:', userResult.error);
          return { success: false, error: `Usuario no sincronizado: ${userResult.error}` };
        }
        console.log('✅ BackendSync: Usuario registrado/verificado exitosamente');

        // PASO 2: LOGIN PARA OBTENER TOKEN (NECESARIO PARA CATEGORÍAS)
        console.log('🔐 BackendSync: ========== PASO 2: LOGIN PARA TOKEN ==========');
        console.log('🔐 BackendSync: Haciendo login para obtener token JWT con PIN local...');
        const loginResult = await this.loginAndGetToken(user.email, userPIN);
        
        if (!loginResult.success || !loginResult.token) {
          console.error('❌ BackendSync: FALLO CRÍTICO - No se pudo obtener token:', loginResult.error);
          return { success: false, error: `No se pudo obtener token: ${loginResult.error}` };
        }
        console.log('✅ BackendSync: Token JWT obtenido exitosamente');

        // PASO 3: SINCRONIZAR CATEGORÍAS CON TOKEN
        console.log('📂 BackendSync: ========== PASO 3: SINCRONIZAR CATEGORÍAS ==========');
        const categoryResult = await this.syncCategories(userEmail, loginResult.token);
        console.log('📂 BackendSync: Resultado categorías:', categoryResult.success ? '✅ ÉXITO' : '❌ FALLO');

        // PASO 4: SINCRONIZAR GASTOS
        console.log('💰 BackendSync: ========== PASO 4: SINCRONIZAR GASTOS ==========');
        const expenseResult = await this.syncExpenses(userEmail, loginResult.token);
        console.log('💰 BackendSync: Resultado gastos:', expenseResult.success ? '✅ ÉXITO' : '❌ FALLO');

        // PASO 5: SINCRONIZAR LIQUIDACIONES
        console.log('📁 BackendSync: ========== PASO 5: SINCRONIZAR LIQUIDACIONES ==========');
        const liquidationResult = await this.syncLiquidations(userEmail, loginResult.token);
        console.log('📁 BackendSync: Resultado liquidaciones:', liquidationResult.success ? '✅ ÉXITO' : '❌ FALLO');

        // EVALUAR RESULTADOS
        const anySuccess = userResult.success || categoryResult.success || expenseResult.success || liquidationResult.success;
        
        if (anySuccess) {
          await AsyncStorage.setItem(this.LAST_SYNC_KEY, Date.now().toString());
          console.log('✅ BackendSync: Sincronización completada con éxito');
          return { success: true };
        } else {
          console.log('❌ BackendSync: Todas las sincronizaciones fallaron');
          return { success: false, error: 'No se pudo sincronizar ningún dato' };
        }

      } finally {
        await AsyncStorage.removeItem(this.SYNC_IN_PROGRESS_KEY);
        console.log('🔄 BackendSync: Flag de sincronización limpiado');
      }
    } catch (error) {
      console.error('🚨 BackendSync: Error general en sincronización:', error);
      await AsyncStorage.removeItem(this.SYNC_IN_PROGRESS_KEY);
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  /**
   * Obtiene el timestamp de la última sincronización
   */
  static async getLastSyncTime(): Promise<number | null> {
    try {
      const timestamp = await AsyncStorage.getItem(this.LAST_SYNC_KEY);
      return timestamp ? parseInt(timestamp) : null;
    } catch (error) {
      console.error('Error obteniendo última sincronización:', error);
      return null;
    }
  }

  /**
   * Verifica si un usuario es manager de otros empleados
   */
  static async checkIfUserIsManager(userEmail: string, authToken: string): Promise<{ isManager: boolean; employeeCount: number }> {
    console.log('👔 BackendSync: ============ VERIFICAR SI ES MANAGER ============');
    console.log('👔 BackendSync: Usuario:', userEmail);

    try {
      const { url: backendUrl } = await this.getBackendConfig();
      const requestUrl = `${backendUrl}/api/manager-links/is-manager/${encodeURIComponent(userEmail)}`;
      console.log('🌐 BackendSync: URL de verificación:', requestUrl);

      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ BackendSync: Es manager:', data.isManager, '- Empleados:', data.employeeCount);
        return { 
          isManager: data.isManager, 
          employeeCount: data.employeeCount 
        };
      } else {
        console.error('❌ BackendSync: Error verificando manager');
        return { isManager: false, employeeCount: 0 };
      }
    } catch (error) {
      console.error('🚨 BackendSync: Error en checkIfUserIsManager:', error);
      return { isManager: false, employeeCount: 0 };
    }
  }

  /**
   * Descarga y guarda localmente las liquidaciones pendientes para un manager
   */
  static async downloadPendingLiquidationsForManager(
    managerEmail: string, 
    authToken: string
  ): Promise<{ success: boolean; count: number; error?: string }> {
    console.log('👔 BackendSync: ============ DESCARGANDO LIQUIDACIONES PARA APROBACIÓN ============');
    console.log('👔 BackendSync: Manager:', managerEmail);

    try {
      // Obtener liquidaciones pendientes del backend
      const liquidations = await this.getPendingLiquidationsForManager(managerEmail, authToken);
      
      if (liquidations.length === 0) {
        console.log('✅ BackendSync: No hay liquidaciones pendientes de aprobación');
        return { success: true, count: 0 };
      }

      console.log('📥 BackendSync: Liquidaciones pendientes recibidas:', liquidations.length);

      // IMPORTANTE: Guardar/Actualizar cada liquidación localmente
      let savedCount = 0;
      for (const liquidation of liquidations) {
        try {
          // Verificar si la liquidación ya existe localmente
          const existingLiquidation = await LiquidationService.getLiquidationById(liquidation.id);
          
          if (existingLiquidation) {
            // Ya existe - solo actualizar si el estado cambió
            console.log(`🔄 BackendSync: Liquidación ${liquidation.id} ya existe localmente - Verificando estado`);
            
            if (existingLiquidation.status !== liquidation.status) {
              console.log(`🔄 BackendSync: Estado cambió: ${existingLiquidation.status} → ${liquidation.status}`);
              await LiquidationService.updateLiquidationStatus(
                liquidation.id,
                liquidation.status,
                liquidation.managerComments || undefined
              );
            }
            savedCount++;
          } else {
            // No existe - crear nueva
            console.log(`➕ BackendSync: Creando nueva liquidación pendiente ${liquidation.id}`);
            const dto = {
              userId: liquidation.userId || liquidation.employeeEmail,
              employeeName: liquidation.employeeName,
              expenseIds: liquidation.expenseIds || []
            };
            
            await LiquidationService.createLiquidation(dto);
            savedCount++;
          }
        } catch (saveError) {
          console.error('❌ BackendSync: Error guardando liquidación pendiente:', liquidation.id, saveError);
        }
      }

      console.log('✅ BackendSync: Liquidaciones pendientes guardadas localmente:', savedCount);
      return { success: true, count: savedCount };
    } catch (error) {
      console.error('🚨 BackendSync: Error descargando liquidaciones para aprobación:', error);
      return { success: false, count: 0, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  /**
   * DESCARGA gastos individuales pendientes de aprobación para un manager
   * Los gastos con status 'ENVIADO_JEFE' que necesitan aprobación del manager
   */
  static async downloadPendingExpensesForManager(
    managerEmail: string,
    authToken: string
  ): Promise<{ success: boolean; count: number; error?: string }> {
    console.log('👔 BackendSync: ============ DESCARGANDO GASTOS PENDIENTES DE APROBACIÓN ============');
    console.log('👔 BackendSync: Manager:', managerEmail);

    try {
      const { url: backendUrl } = await this.getBackendConfig();
      const requestUrl = `${backendUrl}/api/expenses/pending-approval?managerEmail=${encodeURIComponent(managerEmail)}`;
      console.log('🌐 BackendSync: GET', requestUrl);

      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ BackendSync: Error descargando gastos pendientes:', errorText);
        return { success: false, count: 0, error: `Error ${response.status}: ${errorText}` };
      }

      const expenses = await response.json();
      console.log('📥 BackendSync: Gastos pendientes recibidos:', expenses.length);

      if (expenses.length === 0) {
        console.log('ℹ️ BackendSync: No hay gastos pendientes de aprobación');
        return { success: true, count: 0 };
      }

      // Guardar/Actualizar cada gasto localmente
      let savedCount = 0;
      for (const expense of expenses) {
        try {
          // Usar upsertExpenseFromServer para insertar/actualizar
          await ExpenseService.upsertExpenseFromServer({
            ...expense,
            email: expense.userEmail, // Email del empleado dueño del gasto
            needsSync: false,
            lastSync: Date.now()
          });
          savedCount++;
        } catch (saveError) {
          console.error('❌ BackendSync: Error guardando gasto pendiente:', expense.id, saveError);
        }
      }

      console.log('✅ BackendSync: Gastos pendientes guardados localmente:', savedCount);
      return { success: true, count: savedCount };
    } catch (error) {
      console.error('🚨 BackendSync: Error descargando gastos pendientes:', error);
      return { success: false, count: 0, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  /**
   * Obtiene las liquidaciones pendientes para un manager desde el backend
   */
  static async getPendingLiquidationsForManager(managerEmail: string, authToken: string): Promise<any[]> {
    console.log('👔 BackendSync: ============ OBTENER LIQUIDACIONES PARA MANAGER ============');
    console.log('👔 BackendSync: Manager:', managerEmail);

    try {
      const { url: backendUrl } = await this.getBackendConfig();
      const requestUrl = `${backendUrl}/api/liquidations/manager/${encodeURIComponent(managerEmail)}`;
      console.log('🌐 BackendSync: URL de consulta:', requestUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('⏰ BackendSync: TIMEOUT de 10 segundos para obtener liquidaciones');
        controller.abort();
      }, 10000);

      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const liquidations = await response.json();
        console.log('✅ BackendSync: Liquidaciones obtenidas:', liquidations.length);
        return liquidations;
      } else {
        const errorText = await response.text();
        console.error('❌ BackendSync: Error obteniendo liquidaciones:', errorText);
        return [];
      }
    } catch (error) {
      console.error('🚨 BackendSync: Error en getPendingLiquidationsForManager:', error);
      return [];
    }
  }

  /**
   * Aprueba una liquidación en el backend
   */
  static async approveLiquidation(
    liquidationId: string, 
    managerComments: string, 
    authToken: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log('✅ BackendSync: ============ APROBAR LIQUIDACIÓN ============');
    console.log('✅ BackendSync: Liquidación ID:', liquidationId);

    try {
      const { url: backendUrl } = await this.getBackendConfig();
      const requestUrl = `${backendUrl}/api/liquidations/${liquidationId}/approve`;
      console.log('🌐 BackendSync: URL de aprobación:', requestUrl);

      const response = await fetch(requestUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ managerComments })
      });

      if (response.ok) {
        console.log('✅ BackendSync: Liquidación aprobada exitosamente');
        return { success: true };
      } else {
        const errorText = await response.text();
        console.error('❌ BackendSync: Error aprobando liquidación:', errorText);
        return { success: false, error: errorText };
      }
    } catch (error) {
      console.error('🚨 BackendSync: Error en approveLiquidation:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  /**
   * Rechaza una liquidación en el backend
   */
  static async rejectLiquidation(
    liquidationId: string, 
    managerComments: string, 
    authToken: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log('❌ BackendSync: ============ RECHAZAR LIQUIDACIÓN ============');
    console.log('❌ BackendSync: Liquidación ID:', liquidationId);

    try {
      const { url: backendUrl } = await this.getBackendConfig();
      const requestUrl = `${backendUrl}/api/liquidations/${liquidationId}/reject`;
      console.log('🌐 BackendSync: URL de rechazo:', requestUrl);

      const response = await fetch(requestUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ managerComments })
      });

      if (response.ok) {
        console.log('✅ BackendSync: Liquidación rechazada exitosamente');
        return { success: true };
      } else {
        const errorText = await response.text();
        console.error('❌ BackendSync: Error rechazando liquidación:', errorText);
        return { success: false, error: errorText };
      }
    } catch (error) {
      console.error('🚨 BackendSync: Error en rejectLiquidation:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }
}