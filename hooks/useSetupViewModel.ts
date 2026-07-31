import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { UserProfile } from '../models/User';
import * as AuthService from '../services/AuthService';
import { BackendSyncService } from '../services/BackendSyncService';

// Define the props for the ViewModel, including the success callback
interface UseSetupViewModelProps {
  onSaveSuccess: () => void;
}

/**
 * Valida que un correo electrónico tenga formato correcto
 */
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const useSetupViewModel = () => {
  const router = useRouter();
  const [profile, setProfile] = useState<Omit<UserProfile, 'installationId'>>({ firstName: '', lastName: '', email: '' });
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [lifnr, setLifnr] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateProfileField = (field: keyof typeof profile, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };
  
  const handleSaveProfile = async () => {
    // VALIDACIÓN 1: Campos obligatorios
    if (!profile.firstName || !profile.lastName || !profile.email || !confirmEmail || !pin || !confirmPin || !lifnr || !employeeCode) {
      setError("Por favor, llene todos los campos.");
      return;
    }

    // VALIDACIÓN 2: Formato de correo electrónico
    if (!isValidEmail(profile.email)) {
      setError("Por favor, ingrese un correo electrónico válido.");
      return;
    }

    // VALIDACIÓN 3: Correos coinciden
    if (profile.email !== confirmEmail) {
      setError("Los correos electrónicos no coinciden.");
      return;
    }

    // VALIDACIÓN 4: PIN debe ser de 4 dígitos numéricos
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setError("El PIN debe tener exactamente 4 dígitos numéricos.");
      return;
    }

    // VALIDACIÓN 5: PINs coinciden
    if (pin !== confirmPin) {
      setError("Los PINs no coinciden.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('📝 Setup: Iniciando proceso de registro/actualización...');
      console.log('📝 Setup: Email:', profile.email);

      // PASO 1: Verificar si el usuario ya existe en el backend
      console.log('🔍 Setup: Verificando si usuario existe en backend...');
      let userExists = false;
      let authToken = '';
      
      try {
        // Intentar login para verificar si el usuario ya existe
        const loginResult = await BackendSyncService.loginAndGetToken(profile.email, pin);
        if (loginResult.success && loginResult.token) {
          userExists = true;
          authToken = loginResult.token;
          console.log('✅ Setup: Usuario YA EXISTE en backend - Se descargará su información');
        }
      } catch (err) {
        // Si falla el login, el usuario no existe
        console.log('📝 Setup: Usuario NO existe - Se registrará por primera vez');
      }

      // Crear objeto User completo
      const user: any = {
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        lifnr: lifnr,
        employeeCode: employeeCode,
        department: '',
        managerEmail: '',
        needsSync: true,
        lastSync: Date.now()
      };

      // PASO 2: Sincronizar con backend PRIMERO para validar PIN
      if (userExists) {
        console.log('🔄 Setup: Usuario existe - Verificando PIN en backend...');
        // El usuario existe, verificar que el PIN sea correcto antes de guardar localmente
        const result = await BackendSyncService.syncUserRegistration(user, pin);
        
        if (result.success) {
          console.log('✅ Setup: PIN verificado exitosamente en backend');
        } else if (result.code === 'PIN_MISMATCH') {
          // ⚠️ Usuario existe pero con PIN diferente - NO guardar localmente
          console.log('⚠️ Setup: PIN diferente detectado');
          setError(
            'Este correo ya está registrado con un PIN diferente.\n\n' +
            '¿Ya te habías registrado antes? Si olvidaste tu PIN, contacta al administrador.'
          );
          setIsLoading(false);
          return; // Detener el proceso SIN guardar localmente
        } else {
          console.log('⚠️ Setup: Error verificando PIN (continuando offline):', result.error);
          // Error de red - permitir uso offline
        }

        // PASO 2.1: Guardar localmente después de validar
        console.log('💾 Setup: Guardando usuario localmente...');
        await AuthService.saveUserAndPin(user, pin);
        console.log('✅ Setup: Usuario guardado localmente');

        // PASO 3.1: DESCARGAR DATOS EN BACKGROUND (sin bloquear)
        console.log('📥 Setup: Iniciando descarga de datos en background...');
        
        // Ejecutar descarga en background usando Promise sin await
        Promise.all([
          BackendSyncService.syncAccountingCatalogs(authToken),
          BackendSyncService.downloadCategoriesFromBackend(profile.email, authToken),
          BackendSyncService.downloadExpensesFromBackend(profile.email, authToken),
          BackendSyncService.downloadLiquidationsFromBackend(profile.email, authToken)
        ]).then(async ([catalogsResult, categoriesResult, expensesResult, liquidationsResult]) => {
          console.log('✅ Setup: ========== DESCARGA EN BACKGROUND COMPLETADA ==========');
          console.log('📚 Catálogos contables:', catalogsResult.success ? 'sincronizados' : `Error: ${catalogsResult.error}`);
          console.log('📂 Categorías:', categoriesResult.success ? `${categoriesResult.count} descargadas` : `Error: ${categoriesResult.error}`);
          console.log('💰 Gastos:', expensesResult.success ? `${expensesResult.count} descargados` : `Error: ${expensesResult.error}`);
          console.log('📁 Liquidaciones:', liquidationsResult.success ? `${liquidationsResult.count} descargadas` : `Error: ${liquidationsResult.error}`);
          
          // PASO 3.2: VERIFICAR SI ES MANAGER Y DESCARGAR LIQUIDACIONES PENDIENTES
          console.log('👔 Setup: Verificando si usuario es manager...');
          const managerCheck = await BackendSyncService.checkIfUserIsManager(profile.email, authToken);
          
          if (managerCheck.isManager) {
            console.log('✅ Setup: Usuario ES MANAGER de', managerCheck.employeeCount, 'empleados');
            console.log('📥 Setup: Descargando datos pendientes de aprobación...');
            
            // Descargar liquidaciones pendientes
            const pendingLiquidationsResult = await BackendSyncService.downloadPendingLiquidationsForManager(
              profile.email, 
              authToken
            );
            
            if (pendingLiquidationsResult.success) {
              console.log('✅ Setup: Liquidaciones pendientes descargadas:', pendingLiquidationsResult.count);
            } else {
              console.log('⚠️ Setup: Error descargando liquidaciones pendientes:', pendingLiquidationsResult.error);
            }

            // Descargar gastos individuales pendientes de aprobación
            const pendingExpensesResult = await BackendSyncService.downloadPendingExpensesForManager(
              profile.email,
              authToken
            );

            if (pendingExpensesResult.success) {
              console.log('✅ Setup: Gastos pendientes descargados:', pendingExpensesResult.count);
            } else {
              console.log('⚠️ Setup: Error descargando gastos pendientes:', pendingExpensesResult.error);
            }
          } else {
            console.log('ℹ️ Setup: Usuario NO es manager - No hay liquidaciones para aprobar');
          }
        }).catch((error) => {
          console.error('⚠️ Setup: Error en descarga background (no crítico):', error);
        });
        
        console.log('📥 Setup: Descarga en progreso en background (el usuario puede continuar)');
        
      } else {
        console.log('📝 Setup: Usuario nuevo - Registrando en backend...');
        // El usuario no existe, se registrará por primera vez
        const result = await BackendSyncService.syncUserRegistration(user, pin);
        
        if (result.success) {
          console.log('✅ Setup: Usuario registrado exitosamente en backend');
        } else if (result.code === 'PIN_MISMATCH') {
          // ⚠️ Alguien más registró este email mientras tanto - NO guardar localmente
          console.log('⚠️ Setup: PIN diferente detectado en nuevo registro');
          setError(
            'Este correo fue registrado recientemente con otro PIN.\n\n' +
            'Si no fuiste tú, contacta al administrador.'
          );
          setIsLoading(false);
          return; // Detener el proceso SIN guardar localmente
        } else {
          console.log('⚠️ Setup: Error registrando usuario (continuando offline):', result.error);
          // Error de red - permitir uso offline
        }
        
        // PASO 2.2: Guardar localmente después de registrar
        console.log('💾 Setup: Guardando usuario localmente...');
        await AuthService.saveUserAndPin(user, pin);
        console.log('✅ Setup: Usuario guardado localmente');
      }

      // PASO 3: Establecer como último usuario logueado y navegar
      await AuthService.setLastLoggedInUser(profile.email);
      console.log('✅ Setup: Proceso completado - Navegando a unlock...');
      
      router.replace({ pathname: '/unlock', params: { email: profile.email } });
      
    } catch (e) {
      console.error('❌ Setup: Error en proceso de registro:', e);
      setError((e as Error).message || 'Error al guardar el perfil');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    profile,
    pin,
    confirmPin,
    confirmEmail,
    lifnr,
    employeeCode,
    isLoading,
    error,
    updateProfileField,
    setPin,
    setConfirmPin,
    setConfirmEmail,
    setLifnr,
    setEmployeeCode,
    handleSaveProfile,
  };
};
