import { useEffect, useState } from 'react';
import * as AuthService from '../services/AuthService';

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
      onUnlockSuccess();
    } else {
      setError('PIN Incorrecto. Intente de nuevo.');
      setPin('');
    }
    setIsLoading(false);
  };

  return {
    pin,
    error,
    isLoading,
    handleKeyPress,
    handleDelete,
  };
};