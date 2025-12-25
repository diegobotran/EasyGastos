import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as AuthService from '../../services/AuthService';
import { BackendSyncService } from '../../services/BackendSyncService';
import * as CategoryService from '../../services/CategoryService';
import * as ExpenseService from '../../services/ExpenseService';
import * as UpdateService from '../../services/UpdateService';
import * as SettingsService from '../../services/SettingsService';
import { SETTINGS_CONSTRAINTS } from '../../models/Settings';

export default function SettingsScreen() {
  const router = useRouter();
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
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [maxExpenseAmount, setMaxExpenseAmount] = useState('3500.00');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  
  const ADMIN_PASSWORD = '101104';

  const handleBackendConfigAccess = () => {
    setAdminPassword('');
    setShowAdminPasswordModal(true);
  };

  const verifyAdminPassword = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      setShowAdminPasswordModal(false);
      setAdminPassword('');
      router.push('../backend-config' as any);
    } else {
      Alert.alert('Acceso Denegado', 'Contraseña incorrecta. Solo los administradores pueden cambiar la configuración del servidor.');
      setAdminPassword('');
    }
  };

  const loadUserData = async () => {
    setIsLoading(true);
    try {
      const user = await AuthService.getLastLoggedInUser();
      if (user) {
        // El usuario ya está cargado
        
        // Cargar información de sincronización
        const categoriesNeedingSync = await CategoryService.getCategoriesNeedingSync(user.email);
        const expensesNeedingSync = await ExpenseService.getExpensesNeedingSync(user.email);
        
        let statusMsg = '';
        if (categoriesNeedingSync.length > 0) {
          statusMsg += `📂 ${categoriesNeedingSync.length} categorías`;
        }
        if (expensesNeedingSync.length > 0) {
          if (statusMsg) statusMsg += ', ';
          statusMsg += `💰 ${expensesNeedingSync.length} gastos`;
        }
        if (statusMsg) {
          setSyncStatus(`${statusMsg} pendientes de sincronización`);
        }
        
        // Cargar última fecha de sincronización desde AsyncStorage
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const lastSync = await AsyncStorage.getItem('last_sync_timestamp');
        if (lastSync) {
          setLastSyncTime(new Date(parseInt(lastSync)).toLocaleString());
        }
      }

      // Cargar configuraciones de la app
      const maxAmount = await SettingsService.getMaxExpenseAmount();
      setMaxExpenseAmount(maxAmount.toFixed(2));
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
    }    // Validar que sea numérico
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

  const syncAllData = async (userEmail: string, token: string) => {
    console.log('🔄 Settings: ========== SINCRONIZANDO TODOS LOS DATOS ==========');
    
    try {
      let syncedItems = 0;
      let errors = 0;
      
      // 1. Sincronizar categorías
      setSyncStatus('📂 Sincronizando categorías...');
      try {
        const categoryResult = await BackendSyncService.syncCategories(userEmail, token);
        if (categoryResult.success) {
          console.log('✅ Settings: Categorías sincronizadas');
          syncedItems++;
        } else {
          console.error('❌ Settings: Error en categorías:', categoryResult.error);
          errors++;
        }
      } catch (error) {
        console.error('❌ Settings: Error sincronizando categorías:', error);
        errors++;
      }
      
      // 2. Sincronizar gastos
      setSyncStatus('💰 Sincronizando gastos...');
      try {
        const expenseResult = await BackendSyncService.syncExpenses(userEmail, token);
        if (expenseResult.success) {
          console.log('✅ Settings: Gastos sincronizados');
          syncedItems++;
        } else {
          console.error('❌ Settings: Error en gastos:', expenseResult.error);
          errors++;
        }
      } catch (error) {
        console.error('❌ Settings: Error sincronizando gastos:', error);
        errors++;
      }
      
      // 3. Sincronizar liquidaciones
      setSyncStatus('📁 Sincronizando liquidaciones...');
      try {
        const liquidationResult = await BackendSyncService.syncLiquidations(userEmail, token);
        if (liquidationResult.success) {
          console.log('✅ Settings: Liquidaciones sincronizadas');
          syncedItems++;
        } else {
          console.error('❌ Settings: Error en liquidaciones:', liquidationResult.error);
          errors++;
        }
      } catch (error) {
        console.error('❌ Settings: Error sincronizando liquidaciones:', error);
        errors++;
      }
      
      // Actualizar última sincronización
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.setItem('last_sync_timestamp', Date.now().toString());
      setLastSyncTime(new Date().toLocaleString());
      
      // Mostrar resultado
      if (errors === 0) {
        setSyncStatus('✅ Sincronización completada');
        Alert.alert(
          '✅ Sincronización Exitosa',
          `Datos sincronizados correctamente:\n\n` +
          `📂 Categorías\n` +
          `💰 Gastos\n` +
          `📁 Liquidaciones\n\n` +
          `⏰ ${new Date().toLocaleTimeString()}`
        );
      } else if (syncedItems > 0) {
        setSyncStatus('⚠️ Sincronización parcial');
        Alert.alert(
          '⚠️ Sincronización Parcial',
          `Se sincronizaron ${syncedItems} de 3 elementos.\n\n` +
          `Algunos datos no se pudieron sincronizar. Intente nuevamente más tarde.`
        );
      } else {
        setSyncStatus('❌ Error en sincronización');
        Alert.alert(
          '❌ Error de Sincronización',
          `No se pudo sincronizar ningún dato.\n\n` +
          `Verifique su conexión e intente nuevamente.`
        );
      }
      
    } catch (error) {
      console.error('🚨 Settings: Error general en sincronización:', error);
      setSyncStatus('❌ Error inesperado');
      Alert.alert('Error', 'Error inesperado durante la sincronización');
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
          setSyncStatus('✅ Usuario verificado - sincronizando...');
          
          // Proceder con sincronización de datos
          await syncAllData(userEmail, loginResult.token);
          
        } else {
          console.log('⚠️ Settings: Login falló - usuario no existe en backend');
          console.log('📝 Settings: Registrando usuario con PIN local almacenado');
          setSyncStatus('📝 Registrando usuario en el servidor...');
          
          // STEP 2: Registrar usuario con el PIN almacenado localmente
          console.log('📝 Settings: Usuario a registrar:', userEmail);
          console.log('📝 Settings: PIN a usar (local):', userPIN ? 'Disponible' : 'NO DISPONIBLE');
          console.log('📝 Settings: Datos del usuario:', {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            department: user.department
          });
          
          const registerResult = await BackendSyncService.syncUserRegistration(user, userPIN);
          console.log('📝 Settings: Resultado de registro:', registerResult);
          
          if (registerResult.success) {
            console.log('✅ Settings: Usuario registrado exitosamente en el backend');
            console.log('✅ Settings: PIN registrado correctamente:', userPIN ? 'SÍ' : 'NO');
            setSyncStatus('✅ Usuario registrado - obteniendo token...');
            
            // STEP 3: Login después del registro para obtener token
            console.log('🔐 Settings: Intentando login con el PIN recién registrado');
            const newLoginResult = await BackendSyncService.loginAndGetToken(userEmail, userPIN);
            console.log('🔐 Settings: Login después de registro:', newLoginResult);
            
            if (newLoginResult.success && newLoginResult.token) {
              console.log('✅ Settings: Token obtenido exitosamente');
              console.log('✅ Settings: Usuario y PIN correctamente sincronizados con el backend');
              
              Alert.alert(
                '✅ Registro Exitoso',
                `Usuario registrado en el servidor con su PIN.\n\n` +
                `Ahora sincronizando sus datos...`
              );
              
              // Sincronizar todos los datos
              await syncAllData(userEmail, newLoginResult.token);
            } else {
              console.error('❌ Settings: No se pudo obtener token después del registro');
              console.error('❌ Settings: Esto indica un problema con el PIN registrado');
              setSyncStatus('❌ Error obteniendo token');
              Alert.alert(
                'Error de Autenticación', 
                '⚠️ Usuario registrado pero no se pudo autenticar.\n\n' +
                'Esto puede indicar un problema con el PIN. Intente:\n' +
                '1. Cerrar sesión y volver a iniciar\n' +
                '2. Contactar al administrador si el problema persiste'
              );
            }
          } else {
            // Analizar el error de registro
            const errorMsg = registerResult.error || 'Error desconocido';
            console.error('❌ Settings: Error registrando usuario:', errorMsg);
            
            if (errorMsg.toLowerCase().includes('ya existe') || errorMsg.toLowerCase().includes('already exists')) {
              // El usuario ya existe pero el PIN es incorrecto
              setSyncStatus('❌ Credenciales incorrectas');
              Alert.alert(
                'Error de Autenticación',
                '⚠️ Usuario ya existe en el servidor pero las credenciales no coinciden.\n\n' +
                'Posibles soluciones:\n' +
                '1. Verifique que su PIN sea correcto\n' +
                '2. Si olvidó su PIN, contacte al administrador\n' +
                '3. Puede continuar trabajando offline'
              );
            } else {
              // Otro tipo de error
              setSyncStatus('❌ Error de conexión');
              Alert.alert(
                'Error de Sincronización',
                `⚠️ No se pudo conectar con el servidor.\n\n` +
                `Error: ${errorMsg}\n\n` +
                `Puede continuar trabajando offline y los datos se sincronizarán automáticamente cuando haya conexión.`
              );
            }
          }
        }
      } catch (loginError: any) {
        console.error('🚨 Settings: Error en proceso de autenticación:', loginError);
        const errorMsg = loginError.message || 'Error de conexión';
        setSyncStatus('❌ Error de conexión');
        Alert.alert(
          'Error de Conexión',
          `⚠️ No se pudo conectar con el servidor.\n\n` +
          `${errorMsg}\n\n` +
          `Verifique su conexión a internet e intente nuevamente.`
        );
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

  const handleSaveMaxExpenseAmount = async () => {
    const amount = parseFloat(maxExpenseAmount);
    const constraints = SETTINGS_CONSTRAINTS.maxExpenseAmount;

    // Validaciones
    if (isNaN(amount)) {
      Alert.alert('Error', 'Por favor, ingrese un monto válido');
      return;
    }

    if (amount < constraints.min) {
      Alert.alert('Error', `El monto mínimo es Q${constraints.min.toFixed(2)}`);
      return;
    }

    if (amount > constraints.max) {
      Alert.alert('Error', `El monto máximo es Q${constraints.max.toFixed(2)}`);
      return;
    }

    try {
      setIsSavingSettings(true);
      await SettingsService.setMaxExpenseAmount(amount);
      Alert.alert(
        '✅ Guardado',
        `Límite de gasto actualizado a Q${amount.toFixed(2)}`
      );
    } catch (error) {
      console.error('Error al guardar configuración:', error);
      Alert.alert('Error', (error as Error).message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCheckUpdate = async () => {
    if (isCheckingUpdate) return;
    
    setIsCheckingUpdate(true);
    setUpdateProgress(0);
    
    try {
      await UpdateService.checkAndUpdate((progress, status) => {
        setUpdateProgress(progress);
        console.log(`📱 Actualización: ${status} - ${progress.toFixed(0)}%`);
      });
    } catch (error) {
      console.error('❌ Error verificando actualización:', error);
    } finally {
      setIsCheckingUpdate(false);
      setUpdateProgress(0);
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

      {/* SEPARADOR */}
      <View style={styles.separator} />

      {/* SECCIÓN: Límites de Gastos */}
      <Text style={styles.sectionTitle}>💰 Límites de Gastos</Text>
      
      <View style={styles.settingCard}>
        <View style={styles.settingHeader}>
          <Ionicons name="cash-outline" size={20} color="#059669" />
          <Text style={styles.settingLabelGreen}>Monto Máximo por Gasto Individual</Text>
        </View>
        
        <Text style={styles.settingDescription}>
          Define el límite máximo que puede tener cada gasto. Las liquidaciones pueden superar este límite 
          (ya que son la suma de múltiples gastos), pero cada gasto individual debe estar dentro del rango.
        </Text>

        <View style={styles.expenseAmountInputContainer}>
          <Text style={styles.currencyPrefix}>Q</Text>
          <TextInput
            style={styles.expenseAmountInput}
            value={maxExpenseAmount}
            onChangeText={setMaxExpenseAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            editable={!isSavingSettings}
          />
        </View>

        <View style={styles.constraintsRow}>
          <Text style={styles.constraintText}>
            ✓ Mínimo: Q{SETTINGS_CONSTRAINTS.maxExpenseAmount.min.toFixed(2)}
          </Text>
          <Text style={styles.constraintText}>
            ✓ Máximo: Q{SETTINGS_CONSTRAINTS.maxExpenseAmount.max.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
          </Text>
        </View>

        <TouchableOpacity 
          style={[styles.saveSettingsButton, isSavingSettings && styles.saveSettingsButtonDisabled]}
          onPress={handleSaveMaxExpenseAmount}
          disabled={isSavingSettings}
        >
          {isSavingSettings ? (
            <>
              <ActivityIndicator size="small" color="white" />
              <Text style={styles.saveSettingsButtonText}>Guardando...</Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="white" />
              <Text style={styles.saveSettingsButtonText}>Guardar Límite</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* SEPARADOR */}
      <View style={styles.separator} />

      {/* SECCIÓN: Sincronización */}
      <Text style={styles.sectionTitle}>🔄 Sincronización</Text>

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
      
      {/* Botón de configuración del backend */}
      <TouchableOpacity 
        style={styles.backendConfigButton}
        onPress={handleBackendConfigAccess}
      >
        <Ionicons name="server-outline" size={20} color="#2563eb" />
        <Text style={styles.backendConfigText}>Configurar Servidor Backend</Text>
        <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
      </TouchableOpacity>

      {/* BOTÓN DE ACTUALIZACIÓN - DESACTIVADO TEMPORALMENTE
      <TouchableOpacity 
        styotón de actualización de app */}
      <TouchableOpacity 
        style={[styles.updateAppButton, isCheckingUpdate && styles.updateAppButtonDisabled]}
        onPress={handleCheckUpdate}
        disabled={isCheckingUpdate}
      >
        {isCheckingUpdate ? (
          <>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={styles.updateAppText}>
              {updateProgress > 0 ? `Descargando ${updateProgress.toFixed(0)}%` : 'Verificando...'}
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="download-outline" size={20} color="#2563eb" />
            <Text style={styles.updateAppText}>Buscar Actualización</Text>
            <Text style={styles.updateAppVersion}>v{UpdateService.getCurrentVersion()}</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Última sincronización */}
      {lastSyncTime && (
        <View style={styles.lastSyncContainer}>
          <Text style={styles.lastSyncText}>
            🕒 Última sincronización: {lastSyncTime}
          </Text>
        </View>
      )}

      {/* Modal de Contraseña de Administrador */}
      <Modal
        visible={showAdminPasswordModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAdminPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.adminModalContent}>
            <View style={styles.adminModalHeader}>
              <Ionicons name="shield-checkmark" size={40} color="#2563eb" />
              <Text style={styles.adminModalTitle}>Acceso de Administrador</Text>
            </View>
            
            <Text style={styles.adminModalDescription}>
              Ingrese la contraseña de administrador para acceder a la configuración del servidor:
            </Text>
            
            <TextInput
              style={styles.adminPasswordInput}
              placeholder="Contraseña"
              value={adminPassword}
              onChangeText={setAdminPassword}
              secureTextEntry={true}
              keyboardType="numeric"
              maxLength={6}
              autoFocus={true}
              placeholderTextColor="#94a3b8"
            />
            
            <View style={styles.adminModalButtons}>
              <TouchableOpacity
                style={styles.adminModalCancelButton}
                onPress={() => {
                  setShowAdminPasswordModal(false);
                  setAdminPassword('');
                }}
              >
                <Text style={styles.adminModalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.adminModalConfirmButton}
                onPress={verifyAdminPassword}
              >
                <Text style={styles.adminModalConfirmText}>Aceptar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    marginBottom: 15 
  },
  syncButtonDisabled: {
    backgroundColor: '#6ee7b7',
  },
  buttonText: { color: 'white', marginLeft: 10, fontSize: 16, fontWeight: 'bold' },
  syncStatusContainer: {
    padding: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 15,
  },
  syncStatusText: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
  },
  backendConfigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 20,
  },
  backendConfigText: {
    flex: 1,
    fontSize: 15,
    color: '#2563eb',
    fontWeight: '600',
    marginLeft: 12,
  },
  updateAppButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eff6ff',
    borderWidth: 2,
    borderColor: '#2563eb',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  updateAppButtonDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#94a3b8',
  },
  updateAppText: {
    flex: 1,
    fontSize: 15,
    color: '#2563eb',
    fontWeight: '600',
    marginLeft: 12,
  },
  updateAppVersion: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  lastSyncContainer: {
    backgroundColor: '#f0fdf4',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dcfce7',
    marginTop: 10,
  },
  lastSyncText: {
    fontSize: 11,
    color: '#166534',
    textAlign: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  settingCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  settingLabelGreen: {
    fontSize: 15,
    fontWeight: '600',
    color: '#059669',
  },
  settingDescription: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 16,
  },
  expenseAmountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748b',
    marginRight: 8,
  },
  expenseAmountInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  constraintsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  constraintText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  saveSettingsButton: {
    flexDirection: 'row',
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveSettingsButtonDisabled: {
    opacity: 0.5,
  },
  saveSettingsButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adminModalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  adminModalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  adminModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 12,
  },
  adminModalDescription: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  adminPasswordInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 4,
    color: '#1e293b',
  },
  adminModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  adminModalCancelButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  adminModalCancelText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  adminModalConfirmButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  adminModalConfirmText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
