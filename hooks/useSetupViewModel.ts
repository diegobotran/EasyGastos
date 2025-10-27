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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateProfileField = (field: keyof typeof profile, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };
  
  const handleSaveProfile = async () => {
    // VALIDACIÓN 1: Campos obligatorios
    if (!profile.firstName || !profile.lastName || !profile.email || !confirmEmail || !pin || !confirmPin) {
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
      
      try {
        // Intentar login para verificar si el usuario ya existe
        const loginResult = await BackendSyncService.loginAndGetToken(profile.email, pin);
        if (loginResult.success) {
          userExists = true;
          console.log('✅ Setup: Usuario YA EXISTE en backend - Se actualizará el PIN');
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
        department: '',
        managerEmail: '',
        needsSync: true,
        lastSync: Date.now()
      };

      // PASO 2: Guardar localmente PRIMERO (offline-first)
      console.log('💾 Setup: Guardando usuario localmente...');
      await AuthService.saveUserAndPin(user, pin);
      console.log('✅ Setup: Usuario guardado localmente');

      // PASO 3: Sincronizar con backend
      if (userExists) {
        console.log('🔄 Setup: Usuario existe - Actualizando PIN en backend...');
        // El usuario existe, syncUserRegistration actualizará el PIN
        const result = await BackendSyncService.syncUserRegistration(user, pin);
        
        if (result.success) {
          console.log('✅ Setup: PIN actualizado exitosamente en backend');
        } else {
          console.log('⚠️ Setup: Error actualizando PIN (no crítico):', result.error);
          // No bloqueamos el flujo, el usuario puede usar la app offline
        }
      } else {
        console.log('📝 Setup: Usuario nuevo - Registrando en backend...');
        // El usuario no existe, se registrará por primera vez
        const result = await BackendSyncService.syncUserRegistration(user, pin);
        
        if (result.success) {
          console.log('✅ Setup: Usuario registrado exitosamente en backend');
        } else {
          console.log('⚠️ Setup: Error registrando usuario (no crítico):', result.error);
          // No bloqueamos el flujo, el usuario puede usar la app offline
        }
      }

      // PASO 4: Establecer como último usuario logueado y navegar
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
    isLoading,
    error,
    updateProfileField,
    setPin,
    setConfirmPin,
    setConfirmEmail,
    handleSaveProfile,
  };
};