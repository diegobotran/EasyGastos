import { useEffect, useState } from 'react';
import * as AuthService from '../services/AuthService';
import { BackendSyncService } from '../services/BackendSyncService';

const PIN_LENGTH = 4;

interface UsePinUnlockViewModelProps {
  onUnlockSuccess: (user: any, pin: string) => void;
  email: string; // The email of the user to verify
}

export const usePinUnlockViewModel = ({ onUnlockSuccess, email }: UsePinUnlockViewModelProps) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      handleVerifyPin();
    }
  }, [pin]);

  const handleKeyPress = (digit: string) => {
    if (pin.length < PIN_LENGTH) {
      setError('');
      setPin(prevPin => prevPin + digit);
    }
  };

  const handleDelete = () => {
    setPin(prevPin => prevPin.slice(0, -1));
  };
  
  const handleVerifyPin = async () => {
    // If for some reason the email is missing, prevent the error.
    if (!email) {
      setError("Error: No se encontró el email del usuario.");
      return;
    }

    setIsLoading(true);
    // ** THE FIX IS HERE **
    // Pass both the email and the pin to the verify function.
    const isValid = await AuthService.verifyPin(email, pin);
    
    if (isValid) {
      // ✅ PIN CORRECTO - Obtener usuario y pasar al callback
      console.log('🔓 Unlock: PIN correcto - Obteniendo datos del usuario...');
      const user = await AuthService.getLastLoggedInUser();
      
      // Ejecutar sincronización completa en background (NO BLOQUEA el UI)
      syncUserDataInBackground(email, pin).catch(err => {
        console.error('⚠️ Unlock: Error en sincronización de datos (no crítico):', err);
      });
      
      // Pasar el usuario y PIN al callback
      onUnlockSuccess(user, pin);
    } else {
      setError('PIN Incorrecto. Intente de nuevo.');
      setPin('');
    }
    setIsLoading(false);
  };

  /**
   * 🔄 SINCRONIZACIÓN COMPLETA DE DATOS DEL USUARIO
   * Descarga TODOS los datos del backend: categorías, gastos, liquidaciones
   * Esto es CRÍTICO cuando:
   * - El usuario reinstala la app (se pierden datos locales)
   * - El usuario hace login en un nuevo dispositivo
   * - Se necesita recuperar datos del servidor
   */
  const syncUserDataInBackground = async (userEmail: string, userPin: string) => {
    try {
      console.log('🔄 Unlock: ========== SINCRONIZACIÓN COMPLETA DE DATOS ==========');
      console.log('📧 Unlock: Usuario:', userEmail);
      
      // Paso 1: Obtener token de autenticación
      console.log('🔐 Unlock: Obteniendo token de autenticación...');
      const loginResult = await BackendSyncService.loginAndGetToken(userEmail, userPin);
      if (!loginResult.success || !loginResult.token) {
        console.warn('⚠️ Unlock: No se pudo obtener token - Sincronización abortada');
        return;
      }

      const authToken = loginResult.token;
      console.log('✅ Unlock: Token obtenido');

      // Paso 2: Descargar CATEGORÍAS del backend
      console.log('📂 Unlock: Descargando categorías del backend...');
      const categoriesResult = await BackendSyncService.downloadCategoriesFromBackend(
        userEmail,
        authToken
      );
      if (categoriesResult.success) {
        console.log('✅ Unlock: Categorías descargadas:', categoriesResult.count);
      } else {
        console.warn('⚠️ Unlock: Error descargando categorías:', categoriesResult.error);
      }

      // Paso 3: Descargar GASTOS del backend
      console.log('💰 Unlock: Descargando gastos del backend...');
      const expensesResult = await BackendSyncService.downloadExpensesFromBackend(
        userEmail,
        authToken
      );
      if (expensesResult.success) {
        console.log('✅ Unlock: Gastos descargados:', expensesResult.count);
      } else {
        console.warn('⚠️ Unlock: Error descargando gastos:', expensesResult.error);
      }

      // Paso 4: Descargar LIQUIDACIONES del backend
      console.log('📋 Unlock: Descargando liquidaciones del backend...');
      const liquidationsResult = await BackendSyncService.downloadLiquidationsFromBackend(
        userEmail,
        authToken
      );
      if (liquidationsResult.success) {
        console.log('✅ Unlock: Liquidaciones descargadas:', liquidationsResult.count);
      } else {
        console.warn('⚠️ Unlock: Error descargando liquidaciones:', liquidationsResult.error);
      }

      // Paso 5: Verificar si es MANAGER y descargar datos pendientes de aprobación
      console.log('👔 Unlock: Verificando si es manager...');
      const managerCheck = await BackendSyncService.checkIfUserIsManager(userEmail, authToken);
      
      if (managerCheck.isManager) {
        console.log('👔 Unlock: Usuario ES MANAGER de', managerCheck.employeeCount, 'empleados');
        
        // Descargar liquidaciones pendientes de aprobación
        const pendingLiquidationsResult = await BackendSyncService.downloadPendingLiquidationsForManager(
          userEmail,
          authToken
        );
        if (pendingLiquidationsResult.success) {
          console.log('✅ Unlock: Liquidaciones pendientes descargadas:', pendingLiquidationsResult.count);
        }

        // Descargar gastos individuales pendientes de aprobación
        const pendingExpensesResult = await BackendSyncService.downloadPendingExpensesForManager(
          userEmail,
          authToken
        );
        if (pendingExpensesResult.success) {
          console.log('✅ Unlock: Gastos pendientes descargados:', pendingExpensesResult.count);
        }
      } else {
        console.log('ℹ️ Unlock: Usuario NO es manager');
      }

      console.log('✅ Unlock: ========== SINCRONIZACIÓN COMPLETADA ==========');
    } catch (error) {
      console.error('🚨 Unlock: Error en sincronización de datos:', error);
    }
  };

  /**
   * @deprecated Esta función ya no se usa, se reemplazó por syncUserDataInBackground
   */
  const checkManagerAndDownloadPendingLiquidations = async (userEmail: string) => {
    try {
      console.log('👔 Unlock: ========== VERIFICACIÓN DE MANAGER EN BACKGROUND ==========');
      
      // Obtener token de autenticación
      const loginResult = await BackendSyncService.loginAndGetToken(userEmail, pin);
      if (!loginResult.success || !loginResult.token) {
        console.log('⚠️ Unlock: No se pudo obtener token para verificación de manager');
        return;
      }

      const authToken = loginResult.token;
      console.log('✅ Unlock: Token obtenido para verificación');

      // Verificar si es manager
      const managerCheck = await BackendSyncService.checkIfUserIsManager(userEmail, authToken);
      
      if (managerCheck.isManager) {
        console.log('👔 Unlock: Usuario ES MANAGER de', managerCheck.employeeCount, 'empleados');
        console.log('📥 Unlock: Descargando datos pendientes de aprobación...');
        
        // Descargar liquidaciones pendientes
        const liquidationsResult = await BackendSyncService.downloadPendingLiquidationsForManager(
          userEmail,
          authToken
        );
        
        if (liquidationsResult.success) {
          console.log('✅ Unlock: Liquidaciones pendientes descargadas:', liquidationsResult.count);
          if (liquidationsResult.count > 0) {
            console.log('📢 Unlock: HAY', liquidationsResult.count, 'LIQUIDACIONES PENDIENTES DE APROBACIÓN');
          }
        } else {
          console.log('⚠️ Unlock: Error descargando liquidaciones:', liquidationsResult.error);
        }

        // Descargar gastos individuales pendientes
        const expensesResult = await BackendSyncService.downloadPendingExpensesForManager(
          userEmail,
          authToken
        );

        if (expensesResult.success) {
          console.log('✅ Unlock: Gastos pendientes descargados:', expensesResult.count);
          if (expensesResult.count > 0) {
            console.log('📢 Unlock: HAY', expensesResult.count, 'GASTOS PENDIENTES DE APROBACIÓN');
          }
        } else {
          console.log('⚠️ Unlock: Error descargando gastos:', expensesResult.error);
        }
      } else {
        console.log('ℹ️ Unlock: Usuario NO es manager - Sin gastos/liquidaciones para aprobar');
      }
    } catch (error) {
      console.error('🚨 Unlock: Error en verificación de manager:', error);
    }
  };

  return {
    pin,
    error,
    isLoading,
    handleKeyPress,
    handleDelete,
  };
};