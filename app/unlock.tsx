import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePinUnlockViewModel } from '../hooks/usePinUnlockViewModel';
import { useAuth } from '../context/AuthContext';
import * as AuthService from '../services/AuthService';
import { BackendSyncService } from '../services/BackendSyncService';

const PinDot = ({ isActive }: { isActive: boolean }) => (
  <View style={[styles.dot, isActive ? styles.dotActive : {}]} />
);

const UnlockScreen = () => {
  const router = useRouter();
  const { email: initialEmail } = useLocalSearchParams<{ email: string }>();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { setUserAndPin } = useAuth();

  // Estados para el modal de reseteo de PIN
  const [showResetPinModal, setShowResetPinModal] = useState(false);
  const [resetPinEmail, setResetPinEmail] = useState('');
  const [newResetPin, setNewResetPin] = useState('');
  const [confirmResetPin, setConfirmResetPin] = useState('');
  const [isResettingPin, setIsResettingPin] = useState(false);
  
  const handleOpenResetPinModal = () => {
    setResetPinEmail(email || '');
    setNewResetPin('');
    setConfirmResetPin('');
    setShowResetPinModal(true);
  };

  const handleResetPin = async () => {
    console.log('🔓 Unlock: ========== RESETEANDO PIN ==========');
    
    // Validaciones
    if (!resetPinEmail || resetPinEmail.trim() === '') {
      Alert.alert('Error', 'Por favor ingrese su correo electrónico para confirmar.');
      return;
    }

    if (!newResetPin || newResetPin.trim() === '') {
      Alert.alert('Error', 'Por favor ingrese el nuevo PIN.');
      return;
    }
    
    if (newResetPin.length !== 4) {
      Alert.alert('Error', 'El nuevo PIN debe ser de 4 dígitos.');
      return;
    }

    if (!confirmResetPin || confirmResetPin.trim() === '') {
      Alert.alert('Error', 'Por favor confirme el nuevo PIN.');
      return;
    }

    if (newResetPin !== confirmResetPin) {
      Alert.alert('Error', 'Los PINs no coinciden. Por favor verifique.');
      return;
    }

    if (!/^\d{4}$/.test(newResetPin)) {
      Alert.alert('Error', 'El PIN debe contener solo números.');
      return;
    }

    setIsResettingPin(true);

    try {
      // Verificar que el usuario existe
      const user = await AuthService.getLastLoggedInUser();
      
      if (!user) {
        Alert.alert('Error', 'No se encontró un usuario registrado en este dispositivo.');
        setIsResettingPin(false);
        return;
      }

      // Verificar que el email coincida
      if (user.email.toLowerCase() !== resetPinEmail.toLowerCase().trim()) {
        Alert.alert(
          'Error de Verificación',
          'El correo electrónico ingresado no coincide con el usuario registrado.\n\n' +
          'Por favor verifique e intente nuevamente.'
        );
        setIsResettingPin(false);
        return;
      }

      console.log('🔓 Unlock: Usuario verificado:', user.email);
      console.log('🔓 Unlock: Reseteando PIN...');

      // PASO 1: Resetear PIN localmente
      console.log('📱 Unlock: Actualizando PIN local...');
      await AuthService.updatePin(user.email, newResetPin);
      await AuthService.savePIN(newResetPin);
      console.log('✅ Unlock: PIN local reseteado exitosamente');

      // PASO 2: Intentar actualizar en backend (opcional si no hay conexión)
      console.log('☁️ Unlock: Intentando resetear PIN en backend...');
      
      try {
        // Intentar registrar/actualizar el usuario con el nuevo PIN
        const registerResult = await BackendSyncService.syncUserRegistration(user, newResetPin);
        
        if (registerResult.success) {
          console.log('✅ Unlock: PIN actualizado en backend exitosamente');
        } else {
          console.warn('⚠️ Unlock: No se pudo actualizar en backend, solo local');
        }
      } catch (backendError) {
        console.warn('⚠️ Unlock: Error en backend, continuando solo con reseteo local:', backendError);
      }

      // Limpiar campos y cerrar modal
      setResetPinEmail('');
      setNewResetPin('');
      setConfirmResetPin('');
      setShowResetPinModal(false);

      Alert.alert(
        '✅ PIN Reseteado',
        'Tu PIN ha sido reseteado exitosamente.\n\n' +
        '📱 Puedes iniciar sesión con tu nuevo PIN ahora.\n' +
        '☁️ Se sincronizará con el servidor en la próxima conexión.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Limpiar el PIN ingresado en la pantalla de unlock
              // para que el usuario pueda ingresar el nuevo
            }
          }
        ]
      );

    } catch (error) {
      console.error('❌ Unlock: Error reseteando PIN:', error);
      Alert.alert(
        'Error',
        'No se pudo resetear el PIN. Por favor intente nuevamente o contacte al administrador.'
      );
    } finally {
      setIsResettingPin(false);
    }
  };

  const onUnlockSuccess = (user: any, pin: string) => {
    // Actualizar el AuthContext con el usuario y PIN
    setUserAndPin(user, pin);
    Alert.alert("Éxito", `Bienvenido de nuevo, ${email}`);
    router.replace('/(tabs)/dashboard');
  };
  
  const viewModel = usePinUnlockViewModel({ 
    onUnlockSuccess, 
    email: email
  });
  
  const KeypadButton = ({ value, isBackspace = false }: { value: string, isBackspace?: boolean }) => (
    <TouchableOpacity 
      style={styles.keypadButton} 
      onPress={() => isBackspace ? viewModel.handleDelete() : viewModel.handleKeyPress(value)}
    >
      <Text style={styles.keypadText}>{value}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ingrese su PIN</Text>
      <Text style={styles.emailText}>{email}</Text>

      <View style={styles.dotsContainer}>
        {[...Array(4)].map((_, i) => <PinDot key={i} isActive={i < viewModel.pin.length} />)}
      </View>
      
      {/* --- THIS IS THE MISSING UI --- */}
      {viewModel.isLoading ? (
        <ActivityIndicator size="large" color="#2563eb" style={{ height: 50 }}/>
      ) : (
        <Text style={styles.errorText}>{viewModel.error || ' '}</Text>
      )}

      <View style={styles.keypadContainer}>
        {'123456789'.split('').map(digit => <KeypadButton key={digit} value={digit}/>)}
        <View style={styles.keypadButton} />
        <KeypadButton value={'0'} />
        <KeypadButton value={'⌫'} isBackspace={true} />
      </View>
      
      {/* Botón de Reseteo de PIN */}
      <TouchableOpacity 
        style={styles.resetPinButton}
        onPress={handleOpenResetPinModal}
      >
        <Ionicons name="key-outline" size={18} color="#dc2626" />
        <Text style={styles.resetPinButtonText}>¿Olvidaste tu PIN?</Text>
      </TouchableOpacity>

      {/* Modal de Reseteo de PIN */}
      <Modal
        visible={showResetPinModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowResetPinModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.resetPinModalContent}>
            <View style={styles.resetPinModalHeader}>
              <Ionicons name="key" size={40} color="#dc2626" />
              <Text style={styles.resetPinModalTitle}>Resetear PIN</Text>
            </View>
            
            <Text style={styles.resetPinModalDescription}>
              Para resetear tu PIN, primero confirma tu identidad ingresando tu correo electrónico:
            </Text>
            
            <View style={styles.resetPinInputContainer}>
              <Ionicons name="mail-outline" size={20} color="#64748b" style={styles.resetPinInputIcon} />
              <TextInput
                style={styles.resetPinInput}
                placeholder="correo@ejemplo.com"
                value={resetPinEmail}
                onChangeText={(text) => setResetPinEmail(text.toLowerCase())}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!isResettingPin}
                placeholderTextColor="#94a3b8"
              />
            </View>

            <Text style={styles.resetPinModalLabel}>Nuevo PIN (4 dígitos):</Text>
            <View style={styles.resetPinInputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#64748b" style={styles.resetPinInputIcon} />
              <TextInput
                style={[
                  styles.resetPinInput,
                  newResetPin && newResetPin.length !== 4 && styles.inputError
                ]}
                placeholder="••••"
                value={newResetPin}
                onChangeText={setNewResetPin}
                keyboardType="numeric"
                secureTextEntry
                maxLength={4}
                editable={!isResettingPin}
                placeholderTextColor="#94a3b8"
              />
            </View>

            {newResetPin && newResetPin.length !== 4 && (
              <View style={styles.resetPinValidationWarning}>
                <Ionicons name="alert-circle" size={14} color="#dc2626" />
                <Text style={styles.resetPinValidationText}>El PIN debe tener 4 dígitos</Text>
              </View>
            )}

            <Text style={styles.resetPinModalLabel}>Confirmar Nuevo PIN:</Text>
            <View style={styles.resetPinInputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#64748b" style={styles.resetPinInputIcon} />
              <TextInput
                style={[
                  styles.resetPinInput,
                  confirmResetPin && newResetPin !== confirmResetPin && styles.inputError,
                  confirmResetPin && newResetPin === confirmResetPin && newResetPin.length === 4 && styles.inputSuccess
                ]}
                placeholder="••••"
                value={confirmResetPin}
                onChangeText={setConfirmResetPin}
                keyboardType="numeric"
                secureTextEntry
                maxLength={4}
                editable={!isResettingPin}
                placeholderTextColor="#94a3b8"
              />
            </View>

            {confirmResetPin && newResetPin !== confirmResetPin && (
              <View style={styles.resetPinValidationWarning}>
                <Ionicons name="alert-circle" size={14} color="#dc2626" />
                <Text style={styles.resetPinValidationText}>Los PINs no coinciden</Text>
              </View>
            )}

            {confirmResetPin && newResetPin === confirmResetPin && newResetPin.length === 4 && (
              <View style={styles.resetPinValidationSuccess}>
                <Ionicons name="checkmark-circle" size={14} color="#059669" />
                <Text style={styles.resetPinValidationSuccessText}>Los PINs coinciden ✓</Text>
              </View>
            )}
            
            <View style={styles.resetPinModalButtons}>
              <TouchableOpacity
                style={styles.resetPinModalCancelButton}
                onPress={() => {
                  setShowResetPinModal(false);
                  setResetPinEmail('');
                  setNewResetPin('');
                  setConfirmResetPin('');
                }}
                disabled={isResettingPin}
              >
                <Text style={styles.resetPinModalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.resetPinModalConfirmButton,
                  (isResettingPin || !resetPinEmail || !newResetPin || newResetPin.length !== 4 || newResetPin !== confirmResetPin) && 
                  styles.resetPinModalConfirmButtonDisabled
                ]}
                onPress={handleResetPin}
                disabled={isResettingPin || !resetPinEmail || !newResetPin || newResetPin.length !== 4 || newResetPin !== confirmResetPin}
              >
                {isResettingPin ? (
                  <>
                    <ActivityIndicator size="small" color="white" />
                    <Text style={styles.resetPinModalConfirmText}>  Reseteando...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="white" />
                    <Text style={styles.resetPinModalConfirmText}>  Resetear PIN</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* --- END OF MISSING UI --- */}
    </View>
  );
};

// Your styles object is correct and does not need to change.
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 8, color: '#1e293b' },
  emailText: { fontSize: 14, color: '#64748b', marginBottom: 20 },
  dotsContainer: { flexDirection: 'row', marginBottom: 20 },
  dot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#d1d5db', margin: 10 },
  dotActive: { backgroundColor: '#2563eb' },
  errorText: { color: '#ef4444', fontSize: 16, height: 50, textAlign: 'center' },
  keypadContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: '80%', marginTop: 20 },
  keypadButton: { width: '33.3%', height: 80, justifyContent: 'center', alignItems: 'center' },
  keypadText: { fontSize: 28, color: '#1f2937' },
  resetPinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 20,
    gap: 8,
  },
  resetPinButtonText: {
    fontSize: 14,
    color: '#dc2626',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetPinModalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    margin: 20,
    maxWidth: 400,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  resetPinModalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  resetPinModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#dc2626',
    marginTop: 8,
  },
  resetPinModalDescription: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  resetPinModalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
    marginTop: 8,
  },
  resetPinInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
    backgroundColor: '#f8fafc',
  },
  resetPinInputIcon: {
    marginRight: 8,
  },
  resetPinInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  inputError: {
    borderColor: '#dc2626',
    borderWidth: 2,
  },
  inputSuccess: {
    borderColor: '#059669',
    borderWidth: 2,
  },
  resetPinValidationWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginLeft: 4,
  },
  resetPinValidationText: {
    fontSize: 12,
    color: '#dc2626',
  },
  resetPinValidationSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginLeft: 4,
  },
  resetPinValidationSuccessText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  resetPinModalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  resetPinModalCancelButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetPinModalCancelText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  resetPinModalConfirmButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#dc2626',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetPinModalConfirmButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  resetPinModalConfirmText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default UnlockScreen;