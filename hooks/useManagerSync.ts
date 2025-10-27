import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as AuthService from '../services/AuthService';
import { BackendSyncService } from '../services/BackendSyncService';

/**
 * Hook para sincronización automática de liquidaciones pendientes para managers
 * Se ejecuta periódicamente sin afectar el performance de la app
 * 
 * Configuración:
 * - Intervalo por defecto: 5 minutos
 * - Solo se ejecuta si el usuario es manager
 * - Se ejecuta en background sin bloquear la UI
 * - Se pausa cuando la app está en segundo plano
 */

interface UseManagerSyncOptions {
  enabled?: boolean;           // Activar/desactivar sincronización (default: true)
  intervalMinutes?: number;    // Intervalo en minutos (default: 5)
}

export const useManagerSync = (options: UseManagerSyncOptions = {}) => {
  const { enabled = true, intervalMinutes = 5 } = options;
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const isManagerRef = useRef<boolean>(false);
  const authTokenRef = useRef<string>('');

  /**
   * Función principal de sincronización
   */
  const syncManagerData = async () => {
    try {
      console.log('🔄 ManagerSync: ========== INICIO SINCRONIZACIÓN AUTOMÁTICA ==========');
      console.log('🔄 ManagerSync: Timestamp:', new Date().toLocaleString());

      // Obtener usuario actual
      const user = await AuthService.getLastLoggedInUser();
      if (!user || !user.email) {
        console.log('⚠️ ManagerSync: No hay usuario logueado');
        return;
      }

      console.log('👤 ManagerSync: Usuario actual:', user.email);

      // Si ya sabemos que no es manager, no hacer nada
      if (isManagerRef.current === false && authTokenRef.current) {
        console.log('ℹ️ ManagerSync: Usuario confirmado NO es manager - Skip');
        return;
      }

      // Obtener token (necesario para todas las peticiones)
      if (!authTokenRef.current) {
        console.log('🔑 ManagerSync: Obteniendo token de autenticación...');
        const pin = await AuthService.getPIN();
        if (!pin) {
          console.log('⚠️ ManagerSync: No se pudo obtener PIN');
          return;
        }

        const loginResult = await BackendSyncService.loginAndGetToken(user.email, pin);
        if (!loginResult.success || !loginResult.token) {
          console.log('⚠️ ManagerSync: No se pudo obtener token');
          return;
        }

        authTokenRef.current = loginResult.token;
        console.log('✅ ManagerSync: Token obtenido');
      }

      // Verificar si es manager (solo la primera vez)
      if (isManagerRef.current === false && authTokenRef.current) {
        console.log('👔 ManagerSync: Verificando si usuario es manager...');
        const managerCheck = await BackendSyncService.checkIfUserIsManager(
          user.email,
          authTokenRef.current
        );

        isManagerRef.current = managerCheck.isManager;
        
        if (!managerCheck.isManager) {
          console.log('ℹ️ ManagerSync: Usuario NO es manager - Sincronización automática desactivada');
          return;
        }

        console.log('✅ ManagerSync: Usuario ES MANAGER de', managerCheck.employeeCount, 'empleados');
      }

      // Si es manager, descargar liquidaciones Y gastos pendientes
      if (isManagerRef.current && authTokenRef.current) {
        console.log('📥 ManagerSync: Descargando datos pendientes de aprobación...');
        
        // Descargar liquidaciones pendientes
        const liquidationsResult = await BackendSyncService.downloadPendingLiquidationsForManager(
          user.email,
          authTokenRef.current
        );

        if (liquidationsResult.success) {
          console.log('✅ ManagerSync: Liquidaciones sincronizadas -', liquidationsResult.count);
          if (liquidationsResult.count > 0) {
            console.log('📢 ManagerSync: HAY', liquidationsResult.count, 'LIQUIDACIONES NUEVAS/ACTUALIZADAS');
          }
        } else {
          console.log('⚠️ ManagerSync: Error sincronizando liquidaciones:', liquidationsResult.error);
        }

        // Descargar gastos individuales pendientes
        const expensesResult = await BackendSyncService.downloadPendingExpensesForManager(
          user.email,
          authTokenRef.current
        );

        if (expensesResult.success) {
          console.log('✅ ManagerSync: Gastos sincronizados -', expensesResult.count);
          if (expensesResult.count > 0) {
            console.log('📢 ManagerSync: HAY', expensesResult.count, 'GASTOS NUEVOS/ACTUALIZADOS PARA APROBAR');
          }
        } else {
          console.log('⚠️ ManagerSync: Error sincronizando gastos:', expensesResult.error);
        }
      }

      console.log('🔄 ManagerSync: ========== FIN SINCRONIZACIÓN AUTOMÁTICA ==========');
    } catch (error) {
      console.error('🚨 ManagerSync: Error en sincronización automática:', error);
    }
  };

  /**
   * Iniciar sincronización periódica
   */
  const startSync = () => {
    if (!enabled) {
      console.log('ℹ️ ManagerSync: Sincronización desactivada por configuración');
      return;
    }

    // Ejecutar inmediatamente la primera vez
    syncManagerData();

    // Configurar intervalo
    const intervalMs = intervalMinutes * 60 * 1000;
    console.log(`🔄 ManagerSync: Configurando sincronización cada ${intervalMinutes} minutos`);
    
    intervalRef.current = setInterval(() => {
      // Solo sincronizar si la app está activa
      if (appState.current === 'active') {
        syncManagerData();
      } else {
        console.log('ℹ️ ManagerSync: App en segundo plano - Skip sincronización');
      }
    }, intervalMs);
  };

  /**
   * Detener sincronización periódica
   */
  const stopSync = () => {
    if (intervalRef.current) {
      console.log('⏹️ ManagerSync: Deteniendo sincronización automática');
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  /**
   * Manejar cambios de estado de la app
   */
  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    console.log('📱 ManagerSync: App state cambió:', appState.current, '→', nextAppState);
    
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      console.log('🔄 ManagerSync: App volvió al foreground - Ejecutando sincronización');
      syncManagerData();
    }
    
    appState.current = nextAppState;
  };

  /**
   * Iniciar/detener sincronización según configuración
   */
  useEffect(() => {
    if (enabled) {
      startSync();

      // Escuchar cambios de estado de la app
      const subscription = AppState.addEventListener('change', handleAppStateChange);

      return () => {
        stopSync();
        subscription.remove();
      };
    }

    return () => stopSync();
  }, [enabled, intervalMinutes]);

  return {
    syncNow: syncManagerData,  // Función para sincronizar manualmente
    isEnabled: enabled
  };
};
