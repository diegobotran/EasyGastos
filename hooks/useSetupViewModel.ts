import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { UserProfile } from '../models/User';
import * as AuthService from '../services/AuthService';
import { BackendSyncService } from '../services/BackendSyncService';

// Define the props for the ViewModel, including the success callback
interface UseSetupViewModelProps {
  onSaveSuccess: () => void;
}

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
    if (!profile.firstName || !profile.email || pin.length < 4) {
      setError("Por favor, llene todos los campos y use un PIN de 4 dígitos.");
      return;
    }

    if (profile.email !== confirmEmail) {
      setError("Los correos electrónicos no coinciden. Por favor, inténtelo de nuevo.");
      return;
    }

    if (pin !== confirmPin) {
      setError("Los PINs no coinciden. Por favor, inténtelo de nuevo.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
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
      await AuthService.saveUserAndPin(user, pin);
      // Registrar en backend después de guardar local
      try {
        const result = await BackendSyncService.syncUserRegistration(user, pin);
        if (result.success) {
          console.log('✅ Setup: Usuario registrado en backend');
        } else {
          console.log('❌ Setup: Error registrando usuario en backend:', result.error);
        }
      } catch (err) {
        console.log('❌ Setup: Error en registro backend:', err);
      }
      // ** Call the success function on completion **
      await AuthService.setLastLoggedInUser(profile.email);
      router.replace({ pathname: '/unlock', params: { email: profile.email } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // Registrar usuario en el backend automáticamente al iniciar el setup
  React.useEffect(() => {
    const registerUserInBackend = async () => {
      try {
        const user = await import('../services/AuthService').then(auth => auth.getLastLoggedInUser());
        const pin = await import('../services/AuthService').then(auth => auth.getPIN());
        if (user && user.email && user.firstName && user.lastName && pin) {
          const result = await BackendSyncService.syncUserRegistration(user, pin);
          if (result.success) {
            console.log('✅ Setup: Usuario registrado en backend');
          } else {
            console.log('❌ Setup: Error registrando usuario en backend:', result.error);
          }
        } else {
          console.log('⚠️ Setup: Datos insuficientes para registrar usuario en backend');
        }
      } catch (error) {
        console.log('❌ Setup: Error en registro automático:', error);
      }
    };
    registerUserInBackend();
  }, []);

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