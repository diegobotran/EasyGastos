import { Category } from '../../models/Category';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useCategoryViewModel } from '../../hooks/useCategoryViewModel';
import * as AuthService from '../../services/AuthService';
import { BackendSyncService } from '../../services/BackendSyncService';
import * as SecureStore from 'expo-secure-store';
import { CENTRO_OPTIONS, CUENTA_OPTIONS, ORDENCO_OPTIONS, SOCIEDAD_OPTIONS } from '../../constants/AccountingCatalogs';

export default function CategoryScreen() {
  const { categories, isLoading, addCategory, removeCategory, updateCategory, countDraftExpensesUsingCategory, getDraftExpensesUsingCategory } = useCategoryViewModel();
  const [name, setName] = useState('');
  const [defaultSociedad, setDefaultSociedad] = useState('');
  const [sociedad, setSociedad] = useState('');
  const [centro, setCentro] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [ordenco, setOrdenco] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const resetForm = () => {
    setName('');
    setSociedad(defaultSociedad);
    setCentro('');
    setCuenta('');
    setOrdenco('');
  };

  const closeEditModal = () => {
    setEditModalVisible(false);
    setEditingCategory(null);
    resetForm();
  };

  useEffect(() => {
    const loadUserSociedad = async () => {
      const user = await AuthService.getLastLoggedInUser();
      const defaultSociedad = user?.sociedad && SOCIEDAD_OPTIONS.includes(user.sociedad as typeof SOCIEDAD_OPTIONS[number])
        ? user.sociedad
        : '';
      setDefaultSociedad(defaultSociedad);
      setSociedad(defaultSociedad);
    };

    loadUserSociedad();
  }, []);

  const handleAddCategory = async () => {
    if (!name) {
      alert('El nombre de la categoría es requerido.');
      return;
    }
    if (!sociedad || !centro || !cuenta || !ordenco) {
      Alert.alert('Datos incompletos', 'Para crear una categoría debes completar obligatoriamente Sociedad, Centro, Cuenta y Orden CO.');
      return;
    }
    if (categories.some(cat => cat.name.toLowerCase() === name.toLowerCase())) {
      alert('La categoría ya existe.');
      return;
    }

    try {
      console.log('🚀 Categories: ========== MODO OFFLINE-FIRST: AGREGAR CATEGORÍA ==========');
      
      // PASO 1: SIEMPRE agregar la categoría LOCALMENTE primero (offline-first)
      console.log('💾 Categories: Agregando categoría LOCALMENTE (offline-first)...');
      const wasAdded = await addCategory(name, sociedad, centro, cuenta, ordenco);

      if (!wasAdded) {
        return;
      }
      
      // Limpiar el formulario inmediatamente
      resetForm();

      // Notificar al usuario de inmediato
      Alert.alert('Éxito', '✅ Categoría agregada localmente');
      console.log('✅ Categories: Categoría agregada en base de datos local');

      // PASO 2: Intentar sincronizar con el servidor EN SEGUNDO PLANO (no bloqueante)
      console.log('🔄 Categories: Iniciando sincronización en segundo plano...');
      
      // Ejecutar en segundo plano sin bloquear la UI
      (async () => {
        try {
          const user = await AuthService.getLastLoggedInUser();
          if (!user || !user.email) {
            console.warn('⚠️ Categories (BG): No hay usuario para sincronizar');
            return;
          }

          const userPIN = await AuthService.getPIN();
          if (!userPIN) {
            console.warn('⚠️ Categories (BG): No hay PIN para sincronizar');
            return;
          }

          console.log('🔄 Categories (BG): Intentando login...');
          const loginResult = await BackendSyncService.loginAndGetToken(user.email, userPIN);
          
          let authToken = '';
          
          if (loginResult.success && loginResult.token) {
            console.log('✅ Categories (BG): Login exitoso');
            authToken = loginResult.token;
          } else {
            console.log('⚠️ Categories (BG): Login falló, intentando registro...');
            const registerResult = await BackendSyncService.syncUserRegistration(user, userPIN);
            
            if (registerResult.success) {
              console.log('✅ Categories (BG): Usuario registrado, reintentando login...');
              const newLoginResult = await BackendSyncService.loginAndGetToken(user.email, userPIN);
              
              if (newLoginResult.success && newLoginResult.token) {
                authToken = newLoginResult.token;
              } else {
                console.warn('⚠️ Categories (BG): No se pudo obtener token después del registro');
                return;
              }
            } else {
              console.warn('⚠️ Categories (BG): Servidor no disponible, sincronización pendiente');
              return;
            }
          }

          // Guardar token para futuras sincronizaciones
          await SecureStore.setItemAsync('authToken', authToken);

          // Sincronizar categorías
          console.log('🔄 Categories (BG): Sincronizando con backend...');
          const syncResult = await BackendSyncService.syncCategories(user.email, authToken);
          
          if (syncResult.success) {
            console.log('✅ Categories (BG): Categoría sincronizada exitosamente con backend');
          } else {
            console.warn('⚠️ Categories (BG): Error en sincronización (se reintentará más tarde):', syncResult.error);
          }
        } catch (syncError) {
          console.warn('⚠️ Categories (BG): Error en sincronización (se reintentará más tarde):', syncError);
        }
      })();
      
      console.log('✅ Categories: Proceso completado (categoría guardada localmente, sincronización en segundo plano)');
      
    } catch (error) {
      console.error('❌ Categories: Error crítico al agregar categoría:', error);
      Alert.alert('Error', 'Ocurrió un error al agregar la categoría: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    }
  };



  const handleRemoveCategory = async (category: Category) => {
    const linkedDraftExpenses = await getDraftExpensesUsingCategory(category.name);

    if (linkedDraftExpenses.length > 0) {
      const linkedExpensesSummary = linkedDraftExpenses
        .slice(0, 5)
        .map(expense => `- ${expense.description} (#${expense.id.slice(-6)})`)
        .join('\n');
      const remainingCount = linkedDraftExpenses.length - Math.min(linkedDraftExpenses.length, 5);
      const remainingText = remainingCount > 0 ? `\n- y ${remainingCount} gasto(s) más` : '';

      Alert.alert(
        'Categoría ligada a borradores',
        `No puedes eliminar "${category.name}" porque todavía está ligada a ${linkedDraftExpenses.length} gasto(s) en borrador:\n\n${linkedExpensesSummary}${remainingText}\n\nDesvincúlalos o asígnales otra categoría antes de eliminarla.`
      );
      return;
    }

    const message = '¿Estás seguro de que deseas eliminar esta categoría? Esta acción no se puede deshacer.';
    const title = 'Confirmar Eliminación';

    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        await removeCategory(category.id);
      }
    } else {
      Alert.alert(
        title,
        message,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: () => { void removeCategory(category.id); } },
        ],
        { cancelable: true }
      );
    }
  };
  

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setName(category.name);
    setSociedad(category.sociedad || '');
    setCentro(category.centro || '');
    setCuenta(category.cuenta || '');
    setOrdenco(category.ordenco || '');
    setEditModalVisible(true);
  };

  const performUpdateCategory = async () => {
    if (!name || !editingCategory) {
      alert('El nombre de la categoría es requerido.');
      return;
    }
    if (!sociedad || !centro || !cuenta || !ordenco) {
      Alert.alert('Datos incompletos', 'Para actualizar una categoría debes completar obligatoriamente Sociedad, Centro, Cuenta y Orden CO.');
      return;
    }
    if (categories.some(cat => cat.id !== editingCategory.id && cat.name.toLowerCase() === name.toLowerCase())) {
      alert('La categoría ya existe.');
      return;
    }
    const updatedCategory = {
      ...editingCategory,
      name,
      sociedad,
      centro,
      cuenta,
      ordenco,
    };
    const updatedDraftExpenses = await updateCategory(updatedCategory);
    closeEditModal();

    if (updatedDraftExpenses > 0) {
      Alert.alert('Categoría actualizada', `La categoría fue actualizada y ${updatedDraftExpenses} gasto(s) en borrador ligado(s) a ella también actualizaron su snapshot contable.`);
      return;
    }

    Alert.alert('Categoría actualizada', 'La categoría fue actualizada exitosamente.');
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory) {
      return;
    }

    const impactedDraftExpenses = await countDraftExpensesUsingCategory(editingCategory.name);

    if (impactedDraftExpenses === 0) {
      await performUpdateCategory();
      return;
    }

    const title = 'Actualizar categoría y gastos en borrador';
    const message = `Esta categoría está asociada a ${impactedDraftExpenses} gasto(s) en borrador. Si continúas, se actualizarán automáticamente el nombre de la categoría y los datos contables snapshot de esos gastos. Esto no afectará liquidaciones ni gastos fuera de borrador.`;

    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        await performUpdateCategory();
      }
      return;
    }

    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Continuar', onPress: () => { void performUpdateCategory(); } },
    ]);
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
        <View style={styles.pickerContainerField}>
          <Picker
            selectedValue={sociedad}
            onValueChange={(value) => setSociedad(value)}
            style={styles.pickerField}
          >
            <Picker.Item label="Seleccionar sociedad *" value="" />
            {SOCIEDAD_OPTIONS.map((item) => (
              <Picker.Item key={item} label={item} value={item} />
            ))}
          </Picker>
        </View>
        <View style={styles.pickerContainerField}>
          <Picker selectedValue={centro} onValueChange={(value) => setCentro(value)} style={styles.pickerField}>
            <Picker.Item label="Seleccionar centro *" value="" />
            {CENTRO_OPTIONS.map((item) => (
              <Picker.Item key={item} label={item} value={item} />
            ))}
          </Picker>
        </View>
        <View style={styles.pickerContainerField}>
          <Picker selectedValue={cuenta} onValueChange={(value) => setCuenta(value)} style={styles.pickerField}>
            <Picker.Item label="Seleccionar cuenta *" value="" />
            {CUENTA_OPTIONS.map((item) => (
              <Picker.Item key={item} label={item} value={item} />
            ))}
          </Picker>
        </View>
        <View style={styles.pickerContainerField}>
          <Picker selectedValue={ordenco} onValueChange={(value) => setOrdenco(value)} style={styles.pickerField}>
            <Picker.Item label="Seleccionar orden CO *" value="" />
            {ORDENCO_OPTIONS.map((item) => (
              <Picker.Item key={item} label={item} value={item} />
            ))}
          </Picker>
        </View>
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
            <Text style={styles.categoryDetail}>Sociedad: {item.sociedad || 'N/A'}</Text>
            <Text style={styles.categoryDetail}>Centro: {item.centro || 'N/A'}</Text>
            <Text style={styles.categoryDetail}>Cuenta: {item.cuenta || 'N/A'}</Text>
            <Text style={styles.categoryDetail}>Orden CO: {item.ordenco || 'N/A'}</Text>
          </View>

          {/* 2. A new container for the action buttons */}
          <View style={styles.categoryActionsContainer}>
            <TouchableOpacity onPress={() => handleEditCategory(item)} style={styles.editButton}>
              <Ionicons name="pencil-outline" size={24} color="#2563eb" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { void handleRemoveCategory(item); }} style={styles.deleteButton}>
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
          <View style={styles.pickerContainerField}>
            <Picker selectedValue={sociedad} onValueChange={(value) => setSociedad(value)} style={styles.pickerField}>
              <Picker.Item label="Seleccionar sociedad *" value="" />
              {SOCIEDAD_OPTIONS.map((item) => (
                <Picker.Item key={item} label={item} value={item} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerContainerField}>
            <Picker selectedValue={centro} onValueChange={(value) => setCentro(value)} style={styles.pickerField}>
              <Picker.Item label="Seleccionar centro *" value="" />
              {CENTRO_OPTIONS.map((item) => (
                <Picker.Item key={item} label={item} value={item} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerContainerField}>
            <Picker selectedValue={cuenta} onValueChange={(value) => setCuenta(value)} style={styles.pickerField}>
              <Picker.Item label="Seleccionar cuenta *" value="" />
              {CUENTA_OPTIONS.map((item) => (
                <Picker.Item key={item} label={item} value={item} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerContainerField}>
            <Picker selectedValue={ordenco} onValueChange={(value) => setOrdenco(value)} style={styles.pickerField}>
              <Picker.Item label="Seleccionar orden CO *" value="" />
              {ORDENCO_OPTIONS.map((item) => (
                <Picker.Item key={item} label={item} value={item} />
              ))}
            </Picker>
          </View>
          <TouchableOpacity style={styles.updateButton} onPress={handleUpdateCategory}>
            <Text style={styles.updateButtonText}>Actualizar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelModalButton} onPress={closeEditModal}>
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
  readOnlyInput: { backgroundColor: '#f8fafc', color: '#64748b' },
  pickerContainerField: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 10, overflow: 'hidden' },
  pickerField: { color: '#1e293b' },
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
