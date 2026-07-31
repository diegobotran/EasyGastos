import { Category } from '../../models/Category';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useCategoryViewModel } from '../../hooks/useCategoryViewModel';
import * as AuthService from '../../services/AuthService';
import { BackendSyncService } from '../../services/BackendSyncService';
import * as SecureStore from 'expo-secure-store';
import { AccountingCatalogOption } from '../../models/AccountingCatalog';
import * as AccountingCatalogService from '../../services/AccountingCatalogService';

export default function CategoryScreen() {
  const { categories, isLoading, addCategory, removeCategory, updateCategory, countDraftExpensesUsingCategory, getDraftExpensesUsingCategory } = useCategoryViewModel();
  const [name, setName] = useState('');
  const [sociedad, setSociedad] = useState('');
  const [centro, setCentro] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [ordenco, setOrdenco] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [sociedadOptions, setSociedadOptions] = useState<AccountingCatalogOption[]>([]);
  const [centroOptions, setCentroOptions] = useState<AccountingCatalogOption[]>([]);
  const [cuentaOptions, setCuentaOptions] = useState<AccountingCatalogOption[]>([]);
  const [ordenCOOptions, setOrdenCOOptions] = useState<AccountingCatalogOption[]>([]);
  const [catalogsSyncing, setCatalogsSyncing] = useState(false);
  const [catalogsLastSyncAt, setCatalogsLastSyncAt] = useState<number | null>(null);
  const [catalogsMessage, setCatalogsMessage] = useState('');

  const loadCachedCatalogs = useCallback(async () => {
    const [sociedades, centros, cuentas, ordenes, metadata] = await Promise.all([
      AccountingCatalogService.getActiveSociedades(),
      AccountingCatalogService.getActiveCentros(),
      AccountingCatalogService.getActiveCuentas(),
      AccountingCatalogService.getActiveOrdenesCO(),
      AccountingCatalogService.getCatalogMetadata(),
    ]);
    setSociedadOptions(sociedades);
    setCentroOptions(centros);
    setCuentaOptions(cuentas);
    setOrdenCOOptions(ordenes);
    setCatalogsLastSyncAt(metadata.lastSyncAt);
  }, []);

  const obtainCatalogToken = useCallback(async () => {
    const existing = await AuthService.getToken();
    if (existing) return existing;
    const user = await AuthService.getLastLoggedInUser();
    const pin = await AuthService.getPIN();
    if (!user || !pin) return null;
    const login = await BackendSyncService.loginAndGetToken(user.email, pin);
    return login.success ? login.token || null : null;
  }, []);

  const refreshCatalogs = useCallback(async (force = false, notify = false) => {
    setCatalogsSyncing(true);
    try {
      await loadCachedCatalogs();
      const token = await obtainCatalogToken();
      if (!token) {
        setCatalogsMessage('Sin conexión o sesión remota. Se muestran los catálogos guardados en el dispositivo.');
        return;
      }
      const result = await BackendSyncService.syncAccountingCatalogs(token, force);
      await loadCachedCatalogs();
      if (result.success) {
        setCatalogsMessage(result.changed ? 'Catálogos actualizados.' : 'Los catálogos ya están al día.');
        if (notify) Alert.alert('Catálogos', result.changed ? 'Catálogos actualizados correctamente.' : 'Los catálogos ya están al día.');
      } else {
        setCatalogsMessage('No se pudo actualizar. Se mantienen disponibles los datos guardados localmente.');
        if (notify) Alert.alert('Modo sin conexión', 'No fue posible actualizar. Puedes continuar con los catálogos guardados localmente.');
      }
    } finally {
      setCatalogsSyncing(false);
    }
  }, [loadCachedCatalogs, obtainCatalogToken]);

  useFocusEffect(useCallback(() => {
    void refreshCatalogs(false, false);
  }, [refreshCatalogs]));

  const resetForm = () => {
    setName('');
    setSociedad('');
    setCentro('');
    setCuenta('');
    setOrdenco('');
  };

  const closeEditModal = () => {
    setEditModalVisible(false);
    setEditingCategory(null);
    resetForm();
  };

  const validateActiveSelection = async () => {
    const result = await AccountingCatalogService.areActiveReferences({ sociedad, centro, cuenta, ordenco });
    if (!result.valid) {
      Alert.alert(
        'Catálogo desactualizado o inactivo',
        `Corrige las siguientes referencias antes de continuar:\n\n${result.inactive.join('\n')}`,
      );
    }
    return result.valid;
  };

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
    if (!(await validateActiveSelection())) return;

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
    if (!(await validateActiveSelection())) return;
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

  const optionsForPicker = (options: AccountingCatalogOption[], selected: string) => {
    if (!selected || options.some(option => option.codigo === selected)) return options;
    return [...options, { codigo: selected, label: `${selected} (inactivo)`, active: false, historical: true }];
  };

  const isCategoryCatalogActive = (category: Category) =>
    sociedadOptions.some(item => item.codigo === category.sociedad) &&
    centroOptions.some(item => item.codigo === category.centro) &&
    cuentaOptions.some(item => item.codigo === category.cuenta) &&
    ordenCOOptions.some(item => item.codigo === category.ordenco);

  const categoryListHeader = (
    <View>
      <Text style={styles.title}>Categorías</Text>
      <View style={styles.catalogStatus}>
        <View style={styles.catalogStatusText}>
          <Text style={styles.catalogStatusTitle}>Catálogos contables</Text>
          <Text style={styles.catalogStatusDetail}>
            {catalogsLastSyncAt
              ? `Última actualización: ${new Date(catalogsLastSyncAt).toLocaleString()}`
              : 'Pendiente de primera sincronización'}
          </Text>
          {!!catalogsMessage && <Text style={styles.catalogStatusDetail}>{catalogsMessage}</Text>}
        </View>
        <TouchableOpacity
          style={[styles.refreshButton, catalogsSyncing && styles.disabledButton]}
          disabled={catalogsSyncing}
          onPress={() => { void refreshCatalogs(true, true); }}
        >
          <Ionicons name="refresh" size={18} color="white" />
          <Text style={styles.refreshButtonText}>{catalogsSyncing ? 'Actualizando' : 'Actualizar'}</Text>
        </TouchableOpacity>
      </View>

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
            {sociedadOptions.map((item) => (
              <Picker.Item key={item.codigo} label={item.label} value={item.codigo} enabled={item.active} />
            ))}
          </Picker>
        </View>
        <View style={styles.pickerContainerField}>
          <Picker selectedValue={centro} onValueChange={(value) => setCentro(value)} style={styles.pickerField}>
            <Picker.Item label="Seleccionar centro *" value="" />
            {centroOptions.map((item) => (
              <Picker.Item key={item.codigo} label={item.label} value={item.codigo} enabled={item.active} />
            ))}
          </Picker>
        </View>
        <View style={styles.pickerContainerField}>
          <Picker selectedValue={cuenta} onValueChange={(value) => setCuenta(value)} style={styles.pickerField}>
            <Picker.Item label="Seleccionar cuenta *" value="" />
            {cuentaOptions.map((item) => (
              <Picker.Item key={item.codigo} label={item.label} value={item.codigo} enabled={item.active} />
            ))}
          </Picker>
        </View>
        <View style={styles.pickerContainerField}>
          <Picker selectedValue={ordenco} onValueChange={(value) => setOrdenco(value)} style={styles.pickerField}>
            <Picker.Item label="Seleccionar orden CO *" value="" />
            {ordenCOOptions.map((item) => (
              <Picker.Item key={item.codigo} label={item.label} value={item.codigo} enabled={item.active} />
            ))}
          </Picker>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleAddCategory}>
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.addButtonText}>Agregar Categoría</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.categoryList}
        contentContainerStyle={styles.categoryListContent}
        data={categories}
        keyExtractor={item => item.id}
        ListHeaderComponent={categoryListHeader}
        renderItem={({ item }) => (
        <View style={styles.categoryItem}>
          {/* 1. A new container for all the text info */}
          <View style={styles.categoryInfoContainer}>
            <Text style={styles.categoryName}>{item.name}</Text>
            <Text style={styles.categoryDetail}>Sociedad: {item.sociedad || 'N/A'}</Text>
            <Text style={styles.categoryDetail}>Centro: {item.centro || 'N/A'}</Text>
            <Text style={styles.categoryDetail}>Cuenta: {item.cuenta || 'N/A'}</Text>
            <Text style={styles.categoryDetail}>Orden CO: {item.ordenco || 'N/A'}</Text>
            {!isCategoryCatalogActive(item) && (
              <Text style={styles.inactiveWarning}>Debe corregirse: contiene una referencia inactiva.</Text>
            )}
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
              {optionsForPicker(sociedadOptions, sociedad).map((item) => (
                <Picker.Item key={item.codigo} label={item.label} value={item.codigo} enabled={item.active} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerContainerField}>
            <Picker selectedValue={centro} onValueChange={(value) => setCentro(value)} style={styles.pickerField}>
              <Picker.Item label="Seleccionar centro *" value="" />
              {optionsForPicker(centroOptions, centro).map((item) => (
                <Picker.Item key={item.codigo} label={item.label} value={item.codigo} enabled={item.active} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerContainerField}>
            <Picker selectedValue={cuenta} onValueChange={(value) => setCuenta(value)} style={styles.pickerField}>
              <Picker.Item label="Seleccionar cuenta *" value="" />
              {optionsForPicker(cuentaOptions, cuenta).map((item) => (
                <Picker.Item key={item.codigo} label={item.label} value={item.codigo} enabled={item.active} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerContainerField}>
            <Picker selectedValue={ordenco} onValueChange={(value) => setOrdenco(value)} style={styles.pickerField}>
              <Picker.Item label="Seleccionar orden CO *" value="" />
              {optionsForPicker(ordenCOOptions, ordenco).map((item) => (
                <Picker.Item key={item.codigo} label={item.label} value={item.codigo} enabled={item.active} />
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
  categoryList: { flex: 1 },
  categoryListContent: { paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, color: '#1e293b' },
  catalogStatus: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 16, borderRadius: 8, backgroundColor: '#eff6ff' },
  catalogStatusText: { flex: 1, marginRight: 10 },
  catalogStatusTitle: { color: '#1e3a8a', fontWeight: 'bold' },
  catalogStatusDetail: { color: '#475569', fontSize: 12, marginTop: 2 },
  refreshButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#2563eb', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  refreshButtonText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  disabledButton: { opacity: 0.6 },
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
  inactiveWarning: { color: '#b45309', fontSize: 13, fontWeight: '600', marginTop: 4 },
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
