import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useExpensesViewModel } from '../../hooks/useExpensesViewModel';
import { Expense, STATUSES } from '../../models/Expense';
import * as AuthService from '../../services/AuthService';
import { createLiquidation } from '../../services/LiquidationService';

// A dedicated component to render each item in the list for better organization.
interface ExpenseListItemProps {
  item: Expense;
  liquidationMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}

const ExpenseListItem = ({ item, liquidationMode, isSelected, onToggleSelect }: ExpenseListItemProps) => {
  const router = useRouter();
  const statusInfo = STATUSES[item.status];

  if (!statusInfo) {
    return <View style={styles.expenseItem}><Text>Gasto con estado inválido</Text></View>;
  }

  // --- THIS IS THE FIX ---
  // 1. Manually combine the base style with the dynamic color styles.
  const statusBadgeStyle = {
    ...styles.statusBadge, // Start with the base styles
    backgroundColor: statusInfo.backgroundColor, // Add the dynamic background color
  };
  const statusTextStyle = {
    ...styles.statusText, // Start with the base styles
    color: statusInfo.color, // Add the dynamic text color
  };
  // --- END OF FIX ---

  const handleViewDetails = () => {
    if (!liquidationMode) {
      router.push({ pathname: '../expense-detail', params: { expense: JSON.stringify(item) } }); // Navigate to detail screen with expense data
    }
  };

  const handlePress = () => {
    if (liquidationMode) {
      onToggleSelect(item.id);
    } else {
      handleViewDetails();
    }
  };

  // Determinar si el gasto puede ser seleccionado
  const canBeSelected = !item.liquidationId;

  return (
    <TouchableOpacity 
      style={[
        styles.expenseItem,
        liquidationMode && isSelected && styles.expenseItemSelected,
        liquidationMode && !canBeSelected && styles.expenseItemDisabled
      ]} 
      onPress={handlePress}
      disabled={liquidationMode && !canBeSelected}
    >
      <View style={styles.expenseHeader}>
        {/* Checkbox en modo liquidación */}
        {liquidationMode && (
          <View style={styles.checkboxContainer}>
            <Ionicons 
              name={isSelected ? 'checkbox' : 'square-outline'} 
              size={24} 
              color={canBeSelected ? '#2563eb' : '#cbd5e1'} 
            />
          </View>
        )}

        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.expenseDescription}>{item.description}</Text>
        </View>
        
        {/* 2. Apply the new, single style object directly. */}
        <View style={statusBadgeStyle}>
          <Text style={statusTextStyle}>{statusInfo.text}</Text>
        </View>

      </View>
      <Text style={styles.expenseDetails}>Q{item.amount.toFixed(2)} • {item.supplier}</Text>
      <Text style={styles.expenseDetails}>{item.date} • {item.category} • {item.department}</Text>
      
      {item.liquidationId && (
        <View style={styles.liquidationBadge}>
          <Ionicons name="folder" size={12} color="#059669" />
          <Text style={styles.liquidationBadgeText}>En liquidación</Text>
        </View>
      )}

      {!liquidationMode && (
        <TouchableOpacity style={styles.detailsButton} onPress={handleViewDetails}>
          <Text style={styles.detailsButtonText}>Ver Detalles</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );


};
// A component to show when the list of expenses is empty.

const EmptyListComponent = () => (
  <View style={styles.emptyContainer}>
    <Ionicons name="document-text-outline" size={60} color="#cbd5e1" />
    <Text style={styles.emptyTitle}>No se encontraron gastos</Text>
    <Text style={styles.emptySubtitle}>No hay gastos registrados que coincidan con tus filtros.</Text>
    <Link href="/add-expense" asChild>
      <TouchableOpacity style={{ ...styles.addButton, marginTop: 20 }}>
        <Ionicons name="add" size={24} color="white" />
        <Text style={styles.addButtonText}>Crear Primer Gasto</Text>
      </TouchableOpacity>
    </Link>
  </View>
);

export default function ExpensesScreen() {
  const { expenses, isLoading, setFilterStatus } = useExpensesViewModel();
  const [searchQuery, setSearchQuery] = useState(''); // State for search input
  const [selectedFilter, setSelectedFilter] = useState('Todos los estados'); // State for filter
  const [liquidationMode, setLiquidationMode] = useState(false); // State for liquidation mode
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]); // Selected expenses for liquidation
  const router = useRouter();

  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = expense.description.toLowerCase().includes(searchQuery.toLowerCase()) || expense.supplier.toLowerCase().includes(searchQuery.toLowerCase());
    
    // En modo liquidación, solo mostrar gastos que no estén en una liquidación
    if (liquidationMode && expense.liquidationId) {
      return false;
    }
    
    return matchesSearch;
  });

  const handleFilterChange = (value: string) => {
    setSelectedFilter(value);
    setFilterStatus(value);
  };

  const handleToggleLiquidationMode = () => {
    setLiquidationMode(!liquidationMode);
    setSelectedExpenseIds([]); // Limpiar selección al cambiar de modo
  };

  const handleToggleExpenseSelection = (expenseId: string) => {
    setSelectedExpenseIds(prev => {
      if (prev.includes(expenseId)) {
        return prev.filter(id => id !== expenseId);
      } else {
        return [...prev, expenseId];
      }
    });
  };

  const handleCreateLiquidation = async () => {
    try {
      const user = await AuthService.getLastLoggedInUser();
      if (!user) {
        Alert.alert('Error', 'No se encontró usuario activo');
        return;
      }

      if (selectedExpenseIds.length === 0) {
        Alert.alert('Error', 'Debe seleccionar al menos un gasto');
        return;
      }

      console.log('🚀 Creando liquidación con', selectedExpenseIds.length, 'gastos');

      const liquidation = await createLiquidation({
        userId: user.email,
        employeeName: `${user.firstName} ${user.lastName}`.trim() || user.email,
        expenseIds: selectedExpenseIds
      });

      Alert.alert(
        'Éxito',
        `Liquidación creada con ${selectedExpenseIds.length} gastos por Q${liquidation.totalAmount.toFixed(2)}`,
        [
          {
            text: 'Ver Liquidación',
            onPress: () => {
              router.push({ 
                pathname: '../liquidation-detail', 
                params: { liquidationId: liquidation.id } 
              });
            }
          },
          { text: 'OK' }
        ]
      );

      // Salir del modo liquidación y limpiar selección
      setLiquidationMode(false);
      setSelectedExpenseIds([]);
    } catch (error) {
      console.error('❌ Error creando liquidación:', error);
      Alert.alert('Error', 'No se pudo crear la liquidación: ' + (error as Error).message);
    }
  };

  const statusOptions = ['Todos los estados', ...Object.values(STATUSES).map(status => status.text)];

  if (isLoading) {
    return <ActivityIndicator style={styles.centered} size="large" />;
  }

  return (
    <View style={styles.container}>
      {/* Header with Title and buttons */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Gastos</Text>
        <View style={styles.headerButtons}>
          {!liquidationMode && (
            <>
              <TouchableOpacity 
                style={styles.liquidateButton}
                onPress={handleToggleLiquidationMode}
              >
                <Ionicons name="folder-outline" size={20} color="white" />
                <Text style={styles.liquidateButtonText}>Liquidar</Text>
              </TouchableOpacity>
              <Link href="/add-expense" asChild>
                <TouchableOpacity style={styles.addButton}>
                  <Ionicons name="add" size={20} color="white" />
                  <Text style={styles.addButtonText}>Nuevo Gasto</Text>
                </TouchableOpacity>
              </Link>
            </>
          )}
          {liquidationMode && (
            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={handleToggleLiquidationMode}
            >
              <Ionicons name="close" size={20} color="#475569" />
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      {/* Search and Filter UI based on your wireframe  */}
      <View style={styles.controlsContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={20} color="gray" />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Buscar por descripción o proveedor..." 
            value={searchQuery}
            onChangeText={setSearchQuery} // Update search query
          />
        </View>
        {!liquidationMode && (
          <View style={styles.filterWrapper}>
            <Picker
              selectedValue={selectedFilter}
              onValueChange={handleFilterChange}
              style={styles.filterPicker}
            >
              {statusOptions.map(option => <Picker.Item key={option} label={option} value={option} />)}
            </Picker>
          </View>
        )}
      </View>

      {/* Barra de información en modo liquidación */}
      {liquidationMode && (
        <View style={styles.liquidationBar}>
          <View style={styles.liquidationInfo}>
            <Ionicons name="checkmark-circle" size={20} color="#2563eb" />
            <Text style={styles.liquidationInfoText}>
              {selectedExpenseIds.length} gastos seleccionados
            </Text>
          </View>
          {selectedExpenseIds.length > 0 && (
            <TouchableOpacity 
              style={styles.createLiquidationButton}
              onPress={handleCreateLiquidation}
            >
              <Ionicons name="folder-open" size={20} color="white" />
              <Text style={styles.createLiquidationButtonText}>Crear Liquidación</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Conditionally render the list or the empty state component */}
      {filteredExpenses.length === 0 ? (
        <EmptyListComponent />
      ) : (
        <FlatList
          data={filteredExpenses}
          renderItem={({ item }) => (
            <ExpenseListItem 
              item={item}
              liquidationMode={liquidationMode}
              isSelected={selectedExpenseIds.includes(item.id)}
              onToggleSelect={handleToggleExpenseSelection}
            />
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: { fontSize: 32, fontWeight: 'bold', color: '#1e293b' },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  liquidateButton: {
    flexDirection: 'row',
    backgroundColor: '#059669',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  liquidateButtonText: { color: 'white', fontWeight: 'bold', marginLeft: 6, fontSize: 16 },
  addButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: { color: 'white', fontWeight: 'bold', marginLeft: 6, fontSize: 16 },
  cancelButton: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: { color: '#475569', fontWeight: 'bold', marginLeft: 6, fontSize: 16 },
  controlsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  searchBox: {
    flexDirection: 'row',
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  searchInput: { marginLeft: 10, flex: 1, fontSize: 16 },
  filterWrapper: {
    flex: 1,
    marginLeft: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  filterPicker: {
    height: 50,
    color: 'gray',
  },
  liquidationBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#dbeafe',
    borderBottomWidth: 1,
    borderBottomColor: '#93c5fd',
  },
  liquidationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liquidationInfoText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
  },
  createLiquidationButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    gap: 6,
  },
  createLiquidationButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  listContent: { padding: 15 },
  expenseItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  expenseItemSelected: {
    borderColor: '#2563eb',
    borderWidth: 2,
    backgroundColor: '#eff6ff',
  },
  expenseItemDisabled: {
    opacity: 0.5,
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkboxContainer: {
    marginRight: 12,
  },
  expenseDescription: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  expenseDetails: { fontSize: 14, color: '#64748b', marginBottom: 4 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  liquidationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d1fae5',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
    gap: 4,
  },
  liquidationBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  detailsButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  detailsButtonText: { color: '#475569', fontWeight: '600' },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#334155',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
  },
});