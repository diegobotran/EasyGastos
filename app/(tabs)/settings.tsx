import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as AuthService from '../../services/AuthService';
import { BackendSyncService } from '../../services/BackendSyncService';
import * as CategoryService from '../../services/CategoryService';

export default function SettingsScreen() {
  const [userName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [autoLogoutTime, setAutoLogoutTime] = useState('30 minutos');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUpdatingSecurity, setIsUpdatingSecurity] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const loadUserData = async () => {
    setIsLoading(true);
    try {
      const user = await AuthService.getLastLoggedInUser();
      if (user) {
        // El usuario ya está cargado
        
        // Cargar información de sincronización
        const categoriesNeedingSync = await CategoryService.getCategoriesNeedingSync(user.email);
        if (categoriesNeedingSync.length > 0) {
          setSyncStatus(`📂 ${categoriesNeedingSync.length} categorías pendientes de sincronización`);
        }
        
        // Cargar última fecha de sincronización desde AsyncStorage
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const lastSync = await AsyncStorage.getItem('last_sync_timestamp');
        if (lastSync) {
          setLastSyncTime(new Date(parseInt(lastSync)).toLocaleString());
        }
      }
    } catch (error) {
      console.error('Error cargando datos de usuario:', error);
    }
    // Load other settings from AsyncStorage if saved (e.g., 2FA, auto-logout)
    setIsLoading(false);
  };

  React.useEffect(() => {
    loadUserData(); // Load once on mount; no focus reload for smoother experience
  }, []);

  const handleUpdateSecurity = async () => {
    console.log('🔐 Settings: ========== ACTUALIZANDO SEGURIDAD ==========');
    
    // Validaciones
    if (!pin || pin.trim() === '') {
      Alert.alert('Error', 'Por favor ingrese un PIN.');
      return;
    }
    
    if (pin.length !== 4) {
      Alert.alert('Error', 'El PIN debe ser de 4 dígitos.');
      return;
    }

    if (!confirmPin || confirmPin.trim() === '') {
      Alert.alert('Error', 'Por favor confirme el PIN.');
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert('Error', 'Los PINs no coinciden. Por favor verifique.');
      return;
    }

    // Validar que sea numérico
    if (!/^\d{4}$/.test(pin)) {
      Alert.alert('Error', 'El PIN debe contener solo números.');
      return;
    }

    setIsUpdatingSecurity(true);

    try {
      const user = await AuthService.getLastLoggedInUser();
      if (!user) {
        Alert.alert('Error', 'No hay usuario logueado.');
        return;
      }

      console.log('🔐 Settings: Usuario actual:', user.email);
      console.log('🔐 Settings: Actualizando PIN local y en backend...');

      // PASO 1: Actualizar PIN local (SQLite)
      console.log('📱 Settings: Actualizando PIN en base de datos local...');
      await AuthService.updatePin(user.email, pin);
      console.log('✅ Settings: PIN actualizado en SQLite');

      // PASO 2: Actualizar PIN en backend
      console.log('☁️ Settings: Actualizando PIN en backend...');
      
      try {
        // Hacer login primero para obtener token
        const oldPin = await AuthService.getPIN();
        if (oldPin) {
          const loginResult = await BackendSyncService.loginAndGetToken(user.email, oldPin);
          
          if (loginResult.success && loginResult.token) {
            console.log('✅ Settings: Login exitoso con PIN anterior');
            
            // Actualizar PIN en backend usando el endpoint de actualización
            const updateResult = await BackendSyncService.updateUserPinInBackend(
              user.email, 
              pin, 
              loginResult.token
            );
            
            if (updateResult.success) {
              console.log('✅ Settings: PIN actualizado en backend exitosamente');
              
              // Guardar otras configuraciones en AsyncStorage
              const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
              await AsyncStorage.setItem('two_factor_enabled', JSON.stringify(twoFactorEnabled));
              await AsyncStorage.setItem('auto_logout_time', autoLogoutTime);
              
              // Limpiar campos
              setPin('');
              setConfirmPin('');
              
              Alert.alert(
                'Éxito', 
                '✅ Configuración de seguridad actualizada.\n\n' +
                '📱 PIN actualizado localmente\n' +
                '☁️ PIN actualizado en servidor\n' +
                '🔄 Sincronización garantizada'
              );
            } else {
              console.error('❌ Settings: Error actualizando PIN en backend:', updateResult.error);
              Alert.alert(
                'Advertencia',
                '⚠️ PIN actualizado localmente pero hubo un problema con el servidor.\n\n' +
                'Puede que necesite actualizar el PIN manualmente en el servidor para mantener la sincronización.'
              );
            }
          } else {
            console.warn('⚠️ Settings: No se pudo obtener token, solo actualización local');
            Alert.alert(
              'Advertencia',
              '⚠️ PIN actualizado localmente.\n\n' +
              'No se pudo conectar con el servidor. El PIN se sincronizará automáticamente en la próxima conexión.'
            );
          }
        }
      } catch (backendError) {
        console.error('❌ Settings: Error actualizando en backend:', backendError);
        Alert.alert(
          'Advertencia',
          '⚠️ PIN actualizado localmente.\n\n' +
          'Hubo un problema al actualizar en el servidor. Intente sincronizar más tarde.'
        );
      }

    } catch (error) {
      console.error('❌ Settings: Error actualizando seguridad:', error);
      Alert.alert('Error', 'No se pudo actualizar la configuración. Por favor intente nuevamente.');
    } finally {
      setIsUpdatingSecurity(false);
    }
  };

  const syncCategoriesWithToken = async (userEmail: string, token: string) => {
    console.log('📂 Settings: ========== SINCRONIZANDO CATEGORÍAS CON TOKEN ==========');
    console.log('📂 Settings: Usuario:', userEmail);
    console.log('📂 Settings: Token disponible:', token ? 'SÍ' : 'NO');
    
    try {
      // Obtener categorías pendientes
      const categoriesToSync = await CategoryService.getCategoriesNeedingSync(userEmail);
      console.log('📂 Settings: Categorías pendientes:', categoriesToSync.length);
      
      if (categoriesToSync.length === 0) {
        console.log('✅ Settings: No hay categorías pendientes de sincronización');
        setSyncStatus('✅ Todas las categorías están sincronizadas');
        Alert.alert('Sincronización Completa', '✅ No hay categorías pendientes de sincronización');
        return;
      }
      
      // Mostrar categorías a sincronizar
      const categoryNames = categoriesToSync.map(c => `- ${c.name}`).join('\n');
      Alert.alert(
        'Sincronizando Categorías', 
        `📂 ${categoriesToSync.length} categorías pendientes:\n${categoryNames}`
      );
      
      // Sincronizar usando el BackendSyncService
      const syncResult = await BackendSyncService.syncCategories(userEmail, token);
      console.log('📂 Settings: Resultado de sincronización:', syncResult);
      
      if (syncResult.success) {
        console.log('✅ Settings: Categorías sincronizadas exitosamente');
        setSyncStatus('✅ Sincronización completada exitosamente');
        setLastSyncTime(new Date().toLocaleString());
        Alert.alert(
          'Sincronización Exitosa', 
          `✅ ${categoriesToSync.length} categorías sincronizadas correctamente\n⏰ ${new Date().toLocaleTimeString()}`
        );
      } else {
        console.error('❌ Settings: Error sincronizando categorías:', syncResult.error);
        setSyncStatus(`❌ Error: ${syncResult.error}`);
        Alert.alert('Error de Sincronización', `❌ ${syncResult.error}`);
      }
      
    } catch (error) {
      console.error('🚨 Settings: Error en sincronización de categorías:', error);
      setSyncStatus('❌ Error inesperado');
      Alert.alert('Error', 'Error inesperado durante la sincronización de categorías');
    }
  };

  const handleSynchronize = async () => {
    if (isSyncing) return; // Evitar múltiples sincronizaciones simultáneas
    
    console.log('🚀 Settings: ========== BOTÓN SINCRONIZAR PRESIONADO ==========');
    setIsSyncing(true);
    setSyncStatus('🔄 Iniciando sincronización...');
    
    try {
      console.log('👤 Settings: Obteniendo usuario logueado...');
      const user = await AuthService.getLastLoggedInUser();
      if (!user) {
        console.error('❌ Settings: No hay usuario logueado');
        Alert.alert('Error', 'No hay usuario logueado');
        return;
      }

      console.log('✅ Settings: Usuario encontrado:', user.email);
      console.log('🔄 Settings: Iniciando sincronización manual para:', user.email);
      
      // STEP 1: Verificar si usuario existe en backend con login
      console.log('🔐 Settings: ========== VERIFICANDO LOGIN DEL USUARIO ==========');
      setSyncStatus('🔐 Verificando credenciales...');
      
      // USAR EL EMAIL REAL CON EL PIN QUE FUNCIONA EN EL BACKEND
      // Usando usuario real después de eliminar del backend
      const userEmail = user.email; // vivlopgt@gmail.com
      const userPIN = await AuthService.getPIN(); // PIN 5518 almacenado localmente
      console.log('🔐 Settings: Usando usuario real con PIN almacenado localmente');
      console.log('🔐 Settings: Email real:', userEmail);
      console.log('🔐 Settings: PIN local:', userPIN);
      
      if (!userPIN) {
        console.error('❌ Settings: No se encontró PIN almacenado localmente');
        setSyncStatus('❌ Error: PIN no encontrado');
        Alert.alert('Error', 'No se encontró PIN almacenado. Configure su PIN primero.');
        return;
      }
      
      try {
        const loginResult = await BackendSyncService.loginAndGetToken(userEmail, userPIN);
        console.log('🔐 Settings: Resultado de login:', loginResult);
        
        if (loginResult.success && loginResult.token) {
          console.log('✅ Settings: Login exitoso - usuario ya existe');
          setSyncStatus('✅ Usuario verificado - sincronizando categorías...');
          Alert.alert('Usuario Verificado', `✅ Login exitoso para ${userEmail}`);
          
          // Proceder con sincronización de categorías usando el email de prueba
          await syncCategoriesWithToken(userEmail, loginResult.token);
          
        } else {
          console.log('❌ Settings: Login falló - usuario no existe, registrando...');
          setSyncStatus('📝 Usuario no existe - registrando...');
          Alert.alert('Registrando Usuario', `📝 Creando usuario ${userEmail} en el backend`);
          
          // STEP 2: Registrar usuario si no existe
          const registerResult = await BackendSyncService.syncUserRegistration(user, userPIN);
          console.log('📝 Settings: Resultado de registro:', registerResult);
          
          if (registerResult.success) {
            console.log('✅ Settings: Usuario registrado - haciendo login...');
            setSyncStatus('✅ Usuario registrado - obteniendo token...');
            
            // STEP 3: Login después del registro
            const newLoginResult = await BackendSyncService.loginAndGetToken(userEmail, userPIN);
            console.log('🔐 Settings: Login después de registro:', newLoginResult);
            
            if (newLoginResult.success && newLoginResult.token) {
              console.log('✅ Settings: Token obtenido - sincronizando categorías...');
              Alert.alert('Token Obtenido', `🎫 Procediendo a sincronizar categorías`);
              
              // Proceder con sincronización de categorías usando el email de prueba
              await syncCategoriesWithToken(userEmail, newLoginResult.token);
            } else {
              console.error('❌ Settings: No se pudo obtener token después del registro');
              setSyncStatus('❌ Error obteniendo token');
              Alert.alert('Error', 'No se pudo obtener token después del registro');
            }
          } else {
            console.error('❌ Settings: Error registrando usuario:', registerResult.error);
            setSyncStatus('❌ Error registrando usuario');
            Alert.alert('Error', `No se pudo registrar usuario: ${registerResult.error}`);
          }
        }
      } catch (loginError) {
        console.error('🚨 Settings: Error en proceso de login:', loginError);
        setSyncStatus('❌ Error en autenticación');
        Alert.alert('Error', 'Error durante la autenticación');
      }
      
    } catch (error) {
      console.error('❌ Settings: Error general en sincronización:', error);
      setSyncStatus('❌ Error inesperado');
      Alert.alert('Error', 'Error inesperado durante la sincronización');
    } finally {
      setIsSyncing(false);
      console.log('🔄 Settings: Sincronización finalizada - limpiando estado');
      // Limpiar el estado después de 5 segundos
      setTimeout(() => setSyncStatus(''), 5000);
    }
  };

  if (isLoading) {
    return <ActivityIndicator size="large" style={styles.centered} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Configuración de Seguridad</Text>
      <Text style={styles.userName}>{userName} </Text>

      <Text style={styles.label}>Nuevo PIN de Seguridad (4 dígitos)</Text>
      <TextInput
        style={[styles.input, pin && pin.length !== 4 && styles.inputError]}
        placeholder="••••"
        value={pin}
        onChangeText={setPin}
        keyboardType="numeric"
        maxLength={4}
        secureTextEntry
        editable={!isUpdatingSecurity}
      />
      
      <Text style={styles.label}>Confirmar PIN</Text>
      <TextInput
        style={[
          styles.input, 
          confirmPin && pin !== confirmPin && styles.inputError,
          confirmPin && pin === confirmPin && pin.length === 4 && styles.inputSuccess
        ]}
        placeholder="••••"
        value={confirmPin}
        onChangeText={setConfirmPin}
        keyboardType="numeric"
        maxLength={4}
        secureTextEntry
        editable={!isUpdatingSecurity}
      />
      
      {/* Validación visual */}
      {pin && pin.length !== 4 && (
        <View style={styles.validationWarning}>
          <Ionicons name="alert-circle" size={16} color="#dc2626" />
          <Text style={styles.validationWarningText}>El PIN debe tener 4 dígitos</Text>
        </View>
      )}
      
      {confirmPin && pin !== confirmPin && (
        <View style={styles.validationWarning}>
          <Ionicons name="alert-circle" size={16} color="#dc2626" />
          <Text style={styles.validationWarningText}>Los PINs no coinciden</Text>
        </View>
      )}
      
      {confirmPin && pin === confirmPin && pin.length === 4 && (
        <View style={styles.validationSuccess}>
          <Ionicons name="checkmark-circle" size={16} color="#059669" />
          <Text style={styles.validationSuccessText}>Los PINs coinciden ✓</Text>
        </View>
      )}
      
      <Text style={styles.subtitle}>
        ⚠️ Importante: El PIN se actualizará tanto localmente como en el servidor para mantener la sincronización.
      </Text>

      <View style={styles.toggleRow}>
        <Text style={styles.label}>Autenticación de Dos Factores</Text>
        <Switch
          value={twoFactorEnabled}
          onValueChange={setTwoFactorEnabled}
        />
      </View>
      <Text style={styles.subtitle}>Seguridad adicional para tu cuenta</Text>

      <Text style={styles.label}>Cerrar Sesión Automático</Text>
      <Picker
        selectedValue={autoLogoutTime}
        onValueChange={setAutoLogoutTime}
        style={styles.picker}
      >
        <Picker.Item label="15 minutos" value="15 minutos" />
        <Picker.Item label="30 minutos" value="30 minutos" />
        <Picker.Item label="1 hora" value="1 hora" />
        <Picker.Item label="Nunca" value="Nunca" />
      </Picker>
      <Text style={styles.subtitle}>Cerrar sesión después de inactividad</Text>

      <TouchableOpacity 
        style={[
          styles.updateButton, 
          (isUpdatingSecurity || !pin || pin.length !== 4 || pin !== confirmPin) && styles.updateButtonDisabled
        ]} 
        onPress={handleUpdateSecurity}
        disabled={isUpdatingSecurity || !pin || pin.length !== 4 || pin !== confirmPin}
      >
        {isUpdatingSecurity ? (
          <>
            <ActivityIndicator size="small" color="white" />
            <Text style={styles.buttonText}>Actualizando...</Text>
          </>
        ) : (
          <>
            <Ionicons name="shield-checkmark-outline" size={20} color="white" />
            <Text style={styles.buttonText}>Actualizar Seguridad</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]} 
        onPress={handleSynchronize}
        disabled={isSyncing}
      >
        {isSyncing ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <Ionicons name="sync-outline" size={20} color="white" />
        )}
        <Text style={styles.buttonText}>
          {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
        </Text>
      </TouchableOpacity>

      {/* Estado de sincronización */}
      {syncStatus && (
        <View style={styles.syncStatusContainer}>
          <Text style={styles.syncStatusText}>{syncStatus}</Text>
        </View>
      )}

      {/* Última sincronización */}
      {lastSyncTime && (
        <View style={styles.lastSyncContainer}>
          <Text style={styles.lastSyncText}>
            🕒 Última sincronización: {lastSyncTime}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: 'white' 
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10, color: '#1e293b' },
  userName: { fontSize: 14, color: '#64748b', marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 5, color: '#1e293b' },
  input: { 
    borderWidth: 1, 
    borderColor: '#ddd', 
    padding: 10, 
    borderRadius: 8, 
    marginBottom: 5,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#dc2626',
    borderWidth: 2,
  },
  inputSuccess: {
    borderColor: '#059669',
    borderWidth: 2,
  },
  validationWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginLeft: 4,
  },
  validationWarningText: {
    fontSize: 12,
    color: '#dc2626',
  },
  validationSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginLeft: 4,
  },
  validationSuccessText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 15 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  picker: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 5 },
  updateButton: { 
    flexDirection: 'row', 
    backgroundColor: '#2563eb', 
    padding: 14, 
    borderRadius: 8, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 15 
  },
  updateButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  syncButton: { 
    flexDirection: 'row', 
    backgroundColor: '#10b981', 
    padding: 14, 
    borderRadius: 8, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 10 
  },
  syncButtonDisabled: { backgroundColor: '#94a3b8' },
  buttonText: { color: 'white', fontWeight: 'bold', marginLeft: 5, fontSize: 15 },
  syncStatusContainer: { backgroundColor: '#f1f5f9', padding: 10, borderRadius: 8, marginBottom: 10 },
  syncStatusText: { fontSize: 13, color: '#334155', textAlign: 'center' },
  lastSyncContainer: { backgroundColor: '#f0fdf4', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#dcfce7' },
  lastSyncText: { fontSize: 11, color: '#166534', textAlign: 'center' },
});