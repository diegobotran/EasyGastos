import { useEffect, useState } from 'react';
import * as AuthService from '../services/AuthService';
import { BackendSyncService } from '../services/BackendSyncService';

const PIN_LENGTH = 4;

interface UsePinUnlockViewModelProps {
  onUnlockSuccess: () => void;
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
      // ✅ PIN CORRECTO - Ejecutar verificación de manager en background
      console.log('🔓 Unlock: PIN correcto - Verificando datos en background...');
      
      // Verificar si es manager y descargar liquidaciones pendientes SIN BLOQUEAR
      checkManagerAndDownloadPendingLiquidations(email).catch(err => {
        console.error('⚠️ Unlock: Error en verificación de manager (no crítico):', err);
      });
      
      onUnlockSuccess();
    } else {
      setError('PIN Incorrecto. Intente de nuevo.');
      setPin('');
    }
    setIsLoading(false);
  };

  /**
   * Verifica si el usuario es manager y descarga liquidaciones pendientes en background
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