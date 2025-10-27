import { Category } from '../../models/Category';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useCategoryViewModel } from '../../hooks/useCategoryViewModel';
import * as AuthService from '../../services/AuthService';
import { BackendSyncService } from '../../services/BackendSyncService';
import * as SecureStore from 'expo-secure-store';

export default function CategoryScreen() {
  const { categories, isLoading, addCategory, removeCategory, updateCategory } = useCategoryViewModel();
  const [name, setName] = useState('');
  const [centro, setCentro] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [ordenco, setOrdenco] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const handleAddCategory = async () => {
    if (!name) {
      alert('El nombre de la categoría es requerido.');
      return;
    }
    if (categories.some(cat => cat.name.toLowerCase() === name.toLowerCase())) {
      alert('La categoría ya existe.');
      return;
    }

    // PRIMERO: Verificar usuario y autenticación ANTES de agregar localmente
    try {
      console.log('🚀 Categories: ========== INICIANDO PROCESO DE AGREGAR CATEGORÍA ==========');
      const user = await AuthService.getLastLoggedInUser();
      if (!user || !user.email) {
        console.error('❌ Categories: No hay usuario logueado');
        Alert.alert('Error', 'No se puede agregar categoría: usuario no disponible.');
        return;
      }

      console.log('✅ Categories: Usuario encontrado:', user.email);

      // Obtener PIN local
      const userPIN = await AuthService.getPIN();
      if (!userPIN) {
        console.error('❌ Categories: No se encontró PIN almacenado localmente');
        Alert.alert('Error', 'No se encontró PIN local. Configure su PIN primero.');
        return;
      }

      console.log('🔐 Categories: PIN local obtenido');
      console.log('🔐 Categories: Intentando login para usuario:', user.email);
      
      // STEP 1: Intentar login primero
      const loginResult = await BackendSyncService.loginAndGetToken(user.email, userPIN);
      console.log('🔐 Categories: Resultado de login:', loginResult);
      
      let authToken = '';
      
      if (loginResult.success && loginResult.token) {
        // Login exitoso - usuario ya existe
        console.log('✅ Categories: Login exitoso - usuario ya existe en backend');
        authToken = loginResult.token;
        
      } else {
        // Login falló - usuario no existe, registrar
        console.log('❌ Categories: Login falló - usuario no existe, registrando...');
        console.log('❌ Categories: Error de login:', loginResult.error);
        
        // STEP 2: Registrar usuario si no existe
        const registerResult = await BackendSyncService.syncUserRegistration(user, userPIN);
        console.log('📝 Categories: Resultado de registro:', registerResult);
        
        if (!registerResult.success) {
          console.error('❌ Categories: Error registrando usuario:', registerResult.error);
          Alert.alert('Error', 'No se pudo registrar el usuario en el servidor: ' + (registerResult.error || 'Error desconocido'));
          return;
        }
        
        console.log('✅ Categories: Usuario registrado - haciendo login...');
        
        // STEP 3: Login después del registro
        const newLoginResult = await BackendSyncService.loginAndGetToken(user.email, userPIN);
        console.log('🔐 Categories: Login después de registro:', newLoginResult);
        
        if (!newLoginResult.success || !newLoginResult.token) {
          console.error('❌ Categories: No se pudo obtener token después del registro');
          Alert.alert('Error', 'No se pudo obtener token después del registro: ' + (newLoginResult.error || 'Error desconocido'));
          return;
        }
        
        authToken = newLoginResult.token;
        console.log('✅ Categories: Token obtenido después del registro');
      }

      console.log('✅ Categories: Token disponible - procediendo a agregar y sincronizar');
      
      // Guardar el token para futuras sincronizaciones
      await SecureStore.setItemAsync('authToken', authToken);

      // AHORA SÍ: Agregar la categoría localmente
      console.log('💾 Categories: Agregando categoría localmente...');
      addCategory(name, centro, cuenta, ordenco);
      
      // Limpiar el formulario
      setName('');
      setCentro('');
      setCuenta('');
      setOrdenco('');

      // Notificar al usuario inmediatamente (no esperar sincronización)
      Alert.alert('Éxito', '✅ Categoría agregada exitosamente!');

      // STEP 4: SINCRONIZAR EN SEGUNDO PLANO (NO BLOQUEAR AL USUARIO)
      console.log('🔄 Categories: Iniciando sincronización en segundo plano...');
      
      // Ejecutar sincronización de forma asíncrona sin esperar (background sync)
      (async () => {
        try {
          console.log('🔄 Categories: Sincronizando categoría con backend (segundo plano)...');
          const syncResult = await BackendSyncService.syncCategories(user.email, authToken);
          
          if (syncResult.success) {
            console.log('✅ Categories: Categoría sincronizada exitosamente en segundo plano');
          } else {
            console.log('⚠️ Categories: No se pudo sincronizar - quedará pendiente:', syncResult.error);
          }
        } catch (bgError) {
          console.log('⚠️ Categories: Error en sincronización de segundo plano (no crítico):', bgError);
        }
      })();
      
      console.log('✅ Categories: Proceso completado exitosamente');
      
    } catch (error) {
      console.error('❌ Categories: Error en handleAddCategory:', error);
      Alert.alert('Error', 'Ocurrió un error al agregar la categoría: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    }
  };



  const handleRemoveCategory = (id: string) => {
            const message = '¿Estás seguro de que deseas eliminar esta categoría? Esta acción no se puede deshacer.';
            const title = 'Confirmar Eliminación';

            // --- THIS IS THE FIX ---
            // Check if the platform is 'web'
            if (Platform.OS === 'web') {
                // Use the browser's built-in confirm dialog
                if (window.confirm(message)) {
                removeCategory(id);
                }
            } else {
                // Use the native Alert.alert for iOS and Android
                Alert.alert(
                title,
                message,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Eliminar', style: 'destructive', onPress: () => removeCategory(id) },
                ],
                { cancelable: true }
                );
            }
    };
  

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setName(category.name);
    setCentro(category.centro || '');
    setCuenta(category.cuenta || '');
    setOrdenco(category.ordenco || '');
    setEditModalVisible(true);
  };

  const handleUpdateCategory = async () => {
    if (!name || !editingCategory) {
      alert('El nombre de la categoría es requerido.');
      return;
    }
    if (categories.some(cat => cat.id !== editingCategory.id && cat.name.toLowerCase() === name.toLowerCase())) {
      alert('La categoría ya existe.');
      return;
    }
    const updatedCategory = {
      ...editingCategory,
      name,
      centro,
      cuenta,
      ordenco,
    };
    await updateCategory(updatedCategory);
    setEditModalVisible(false);
    setName('');
    setCentro('');
    setCuenta('');
    setOrdenco('');
  };

  if (isLoading) {
    return <Text>Cargando categorías...</Text>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Categorías</Text>

      {/* Form to Add Category */}
      <View style={styles.form}>
        <TextInput 
          style={styles.input} 
          placeholder="Nombre de categoría *" 
          value={name} 
          onChangeText={setName} 
          placeholderTextColor="#888888"
        />
        <TextInput 
          style={styles.input} 
          placeholder="Centro (opcional)" 
          value={centro} 
          onChangeText={text => setCentro(text.replace(/[^0-9]/g, ''))} 
          keyboardType="numeric"
          placeholderTextColor="#888888"
        />
        <TextInput 
          style={styles.input} 
          placeholder="Cuenta (opcional)" 
          value={cuenta} 
          onChangeText={text => setCuenta(text.replace(/[^0-9]/g, ''))} 
          keyboardType="numeric"
          placeholderTextColor="#888888"
        />
        <TextInput 
          style={styles.input} 
          placeholder="Orden CO (opcional)" 
          value={ordenco} 
          onChangeText={text => setOrdenco(text.replace(/[^0-9]/g, ''))} 
          keyboardType="numeric"
          placeholderTextColor="#888888"
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAddCategory}>
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.addButtonText}>Agregar Categoría</Text>
        </TouchableOpacity>
      </View>

      {/* List of Categories */}
      <FlatList
        data={categories}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
        <View style={styles.categoryItem}>
          {/* 1. A new container for all the text info */}
          <View style={styles.categoryInfoContainer}>
            <Text style={styles.categoryName}>{item.name}</Text>
            <Text style={styles.categoryDetail}>Centro: {item.centro || 'N/A'}</Text>
            <Text style={styles.categoryDetail}>Cuenta: {item.cuenta || 'N/A'}</Text>
            <Text style={styles.categoryDetail}>Orden CO: {item.ordenco || 'N/A'}</Text>
          </View>

          {/* 2. A new container for the action buttons */}
          <View style={styles.categoryActionsContainer}>
            <TouchableOpacity onPress={() => handleEditCategory(item)} style={styles.editButton}>
              <Ionicons name="pencil-outline" size={24} color="#2563eb" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleRemoveCategory(item.id)} style={styles.deleteButton}>
              <Ionicons name="trash-outline" size={24} color="#dc2626" />
            </TouchableOpacity>
          </View>
        </View>
      )}
        ListEmptyComponent={<Text style={styles.emptyText}>No hay categorías agregadas.</Text>}
      />

      {/* Edit Modal */}
    <Modal
      visible={editModalVisible}
      transparent={true}
      animationType="slide"
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Editar Categoría</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Nombre de categoría *" 
            value={name} 
            onChangeText={setName} 
            placeholderTextColor="#888888"
          />
          <TextInput 
            style={styles.input} 
            placeholder="Centro (opcional)" 
            value={centro} 
            onChangeText={text => setCentro(text.replace(/[^0-9]/g, ''))} 
            keyboardType="numeric"
            placeholderTextColor="#888888"
          />
          <TextInput 
            style={styles.input} 
            placeholder="Cuenta (opcional)" 
            value={cuenta} 
            onChangeText={text => setCuenta(text.replace(/[^0-9]/g, ''))} 
            keyboardType="numeric"
            placeholderTextColor="#888888"
          />
          <TextInput 
            style={styles.input} 
            placeholder="Orden CO (opcional)" 
            value={ordenco} 
            onChangeText={text => setOrdenco(text.replace(/[^0-9]/g, ''))} 
            keyboardType="numeric"
            placeholderTextColor="#888888"
          />
          <TouchableOpacity style={styles.updateButton} onPress={handleUpdateCategory}>
            <Text style={styles.updateButtonText}>Actualizar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelModalButton} onPress={() => setEditModalVisible(false)}>
            <Text style={styles.cancelModalButtonText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
     </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: 'white' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, color: '#1e293b' },
  form: { marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, marginBottom: 10, color: '#1e293b' },
  addButton: { flexDirection: 'row', backgroundColor: '#2563eb', padding: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: 'white', fontWeight: 'bold', marginLeft: 5 },
  categoryItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#ddd', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryName: { fontSize: 18, fontWeight: 'bold', flex: 1, color: '#1e293b' },
  categoryInfoContainer: {
  flex: 1, // Takes up all available space
  marginRight: 10,
  },
  categoryDetail: {
  fontSize: 14,
  color: '#64748b',
},
categoryActionsContainer: {
  flexDirection: 'row', // Puts buttons side-by-side
},
  editButton: { padding: 8 },
  deleteButton: { padding: 8 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 8, width: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, color: '#1e293b' },
  updateButton: { backgroundColor: '#2563eb', padding: 10, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  updateButtonText: { color: 'white', fontWeight: 'bold' },
  cancelModalButton: { backgroundColor: '#e5e7eb', padding: 10, borderRadius: 8, alignItems: 'center' },
  cancelModalButtonText: { color: '#374151', fontWeight: 'bold' },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 20, fontSize: 16 },
});