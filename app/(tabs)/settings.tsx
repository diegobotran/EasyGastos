import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as AuthService from '../../services/AuthService';
import { BackendSyncService } from '../../services/BackendSyncService';
import * as CategoryService from '../../services/CategoryService';

export default function SettingsScreen() {
  const [userName] = useState('');
  const [pin, setPin] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [autoLogoutTime, setAutoLogoutTime] = useState('30 minutos');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
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
    if (pin.length !== 4) {
      Alert.alert('Error', 'El PIN debe ser de 4 dígitos.');
      return;
    }
    try {
      const user = await AuthService.getLastLoggedInUser();
      if (user) {
        await AuthService.updatePin(user.email, pin);
      }
      // Save 2FA and auto-logout to AsyncStorage
      Alert.alert('Éxito', 'Configuración de seguridad actualizada.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar la configuración.');
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
    <View style={styles.container}>
      <Text style={styles.title}>Configuración de Seguridad</Text>
      <Text style={styles.userName}>{userName} </Text>

      <Text style={styles.label}>PIN de Seguridad (4 dígitos)</Text>
      <TextInput
        style={styles.input}
        placeholder="••••"
        value={pin}
        onChangeText={setPin}
        keyboardType="numeric"
        maxLength={4}
        secureTextEntry
      />
      <Text style={styles.subtitle}>Se solicitará para accesos posteriores después del magic link</Text>

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

      <TouchableOpacity style={styles.updateButton} onPress={handleUpdateSecurity}>
        <Ionicons name="shield-checkmark-outline" size={20} color="white" />
        <Text style={styles.buttonText}>Actualizar Seguridad</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: 'white' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, color: '#1e293b' },
  userName: { fontSize: 16, color: '#64748b', marginBottom: 30 },
  label: { fontSize: 18, fontWeight: '600', marginBottom: 5, color: '#1e293b' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, marginBottom: 5 },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 20 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  picker: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 5 },
  updateButton: { flexDirection: 'row', backgroundColor: '#2563eb', padding: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  syncButton: { flexDirection: 'row', backgroundColor: '#2563eb', padding: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  syncButtonDisabled: { backgroundColor: '#94a3b8' },
  buttonText: { color: 'white', fontWeight: 'bold', marginLeft: 5 },
  syncStatusContainer: { backgroundColor: '#f1f5f9', padding: 12, borderRadius: 8, marginBottom: 10 },
  syncStatusText: { fontSize: 14, color: '#334155', textAlign: 'center' },
  lastSyncContainer: { backgroundColor: '#f0fdf4', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#dcfce7' },
  lastSyncText: { fontSize: 12, color: '#166534', textAlign: 'center' },
});