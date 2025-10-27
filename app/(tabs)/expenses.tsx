import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useExpensesViewModel } from '../../hooks/useExpensesViewModel';
import { Expense, STATUSES } from '../../models/Expense';

// A dedicated component to render each item in the list for better organization.
const ExpenseListItem = ({ item }: { item: Expense }) => {
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
    router.push({ pathname: '../expense-detail', params: { expense: JSON.stringify(item) } }); // Navigate to detail screen with expense data
  };

  return (
    <View style={styles.expenseItem}>
      <View style={styles.expenseHeader}>
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
      <TouchableOpacity style={styles.detailsButton} onPress={handleViewDetails}>
        <Text style={styles.detailsButtonText}>Ver Detalles</Text>
      </TouchableOpacity>
    </View>
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

  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = expense.description.toLowerCase().includes(searchQuery.toLowerCase()) || expense.supplier.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const handleFilterChange = (value: string) => {
    setSelectedFilter(value);
    setFilterStatus(value);
  };

  const statusOptions = ['Todos los estados', ...Object.values(STATUSES).map(status => status.text)];

  if (isLoading) {
    return <ActivityIndicator style={styles.centered} size="large" />;
  }

  return (
    <View style={styles.container}>
      {/* Header with Title and "New Expense" button */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Gastos</Text>
        <Link href="/add-expense" asChild>
          <TouchableOpacity style={styles.addButton}>
            <Ionicons name="add" size={20} color="white" />
            <Text style={styles.addButtonText}>Nuevo Gasto</Text>
          </TouchableOpacity>
        </Link>
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
        <View style={styles.filterWrapper}>
          <Picker
            selectedValue={selectedFilter}
            onValueChange={handleFilterChange}
            style={styles.filterPicker}
          >
            {statusOptions.map(option => <Picker.Item key={option} label={option} value={option} />)}
          </Picker>
        </View>
      </View>

      {/* Conditionally render the list or the empty state component */}
      {filteredExpenses.length === 0 ? (
        <EmptyListComponent />
      ) : (
        <FlatList
          data={filteredExpenses}
          renderItem={({ item }) => <ExpenseListItem item={item} />}
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
  addButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: { color: 'white', fontWeight: 'bold', marginLeft: 6, fontSize: 16 },
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
  listContent: { padding: 15 },
  expenseItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  expenseDescription: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  expenseDetails: { fontSize: 14, color: '#64748b', marginBottom: 4 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: 'bold' },
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