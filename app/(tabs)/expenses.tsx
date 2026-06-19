import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
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
import { Expense, getExpenseStatusText, getExpenseStatusColor } from '../../models/Expense';
import * as AuthService from '../../services/AuthService';
import { createLiquidation } from '../../services/LiquidationService';
import { formatDateToSpanish } from '../../utils/dateUtils';
import { SOCIEDADES } from '../../constants/Sociedades';

const LIQUIDATION_CURRENCIES = ['GTQ', 'USD', 'EUR'];

// A dedicated component to render each item in the list for better organization.
interface ExpenseListItemProps {
  item: Expense;
  liquidationMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}

const ExpenseListItem = ({ item, liquidationMode, isSelected, onToggleSelect }: ExpenseListItemProps) => {
  const router = useRouter();
  
  // Usar expenseStatus en lugar de status para mostrar el estado correcto del flujo
  const statusText = getExpenseStatusText(item.expenseStatus);
  const statusColor = getExpenseStatusColor(item.expenseStatus);
  
  // Determinar el color de fondo según el estado
  const getBackgroundColor = (status: string) => {
    switch (status) {
      case 'draft': return '#f1f5f9';
      case 'in_liquidation': return '#dbeafe';
      case 'approved': return '#d1fae5';
      case 'voided': return '#fee2e2';
      default: return '#f1f5f9';
    }
  };
  
  const statusBadgeStyle = {
    ...styles.statusBadge,
    backgroundColor: getBackgroundColor(item.expenseStatus),
  };
  
  const statusTextStyle = {
    ...styles.statusText,
    color: statusColor,
  };

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

  // Determinar si el gasto puede ser seleccionado (solo si está en draft)
  const canBeSelected = item.expenseStatus === 'draft' && item.satStatus === 'VALIDADO_SAT';

  // Truncar proveedor para que no sea muy largo
  const shortSupplier = item.supplier.length > 25 
    ? item.supplier.substring(0, 25) + '...' 
    : item.supplier;

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
      <View style={styles.expenseRow}>
        {/* Checkbox en modo liquidación */}
        {liquidationMode && (
          <View style={styles.checkboxContainer}>
            <Ionicons 
              name={isSelected ? 'checkbox' : 'square-outline'} 
              size={22} 
              color={canBeSelected ? '#2563eb' : '#cbd5e1'} 
            />
          </View>
        )}

        {/* Contenido principal */}
        <View style={styles.expenseContent}>
          {/* Header: Monto y Estado */}
          <View style={styles.expenseHeader}>
            <Text style={styles.expenseAmount}>Q{item.amount.toFixed(2)}</Text>
            <View style={styles.badgeRow}>
              <View style={statusBadgeStyle}>
                <Text style={statusTextStyle}>{statusText}</Text>
              </View>
              {item.satStatus === 'VALIDADO_SAT' && (
                <View style={styles.satBadge}>
                  <Text style={styles.satBadgeText}>SAT</Text>
                </View>
              )}
              {item.liquidationId && (
                <View style={styles.liquidationBadge}>
                  <Ionicons name="folder" size={10} color="#059669" />
                  <Text style={styles.liquidationBadgeText}>#{item.liquidationId.slice(-6)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Grid de información */}
          <View style={styles.infoGrid}>
            {/* Primera fila - Fechas */}
            <View style={styles.infoRow}>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Fecha Factura</Text>
                <Text style={styles.infoValue}>{formatDateToSpanish(item.date)}</Text>
              </View>
              <View style={styles.infoCellRight}>
                <Text style={styles.infoLabel}>Fecha Carga</Text>
                <Text style={styles.infoValue}>
                  {item.createdAt ? formatDateToSpanish(new Date(item.createdAt).toISOString().split('T')[0]) : 'N/A'}
                </Text>
              </View>
            </View>

            {/* Segunda fila */}
            <View style={styles.infoRow}>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Factura</Text>
                <Text style={styles.infoValue}>{item.noinvoice || 'N/A'}</Text>
              </View>
              <View style={styles.infoCellRight}>
                <Text style={styles.infoLabel}>Categoría</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{item.category}</Text>
              </View>
            </View>

            {/* Tercera fila */}
            <View style={styles.infoRow}>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Departamento</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{item.department}</Text>
              </View>
            </View>

            {/* Tercera fila - Proveedor completo */}
            <View style={styles.infoRowFull}>
              <Text style={styles.infoLabel}>Proveedor</Text>
              <Text style={styles.infoValue} numberOfLines={1}>{shortSupplier}</Text>
            </View>
          </View>
        </View>
      </View>
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
  const { expenses, isLoading, setFilterStatus, loadExpenses } = useExpensesViewModel();
  const [searchQuery, setSearchQuery] = useState(''); // State for search input
  const [selectedFilter, setSelectedFilter] = useState('Todos los estados'); // State for filter
  const [liquidationMode, setLiquidationMode] = useState(false); // State for liquidation mode
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]); // Selected expenses for liquidation
  const [selectedSociedad, setSelectedSociedad] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const router = useRouter();

  const filteredExpenses = expenses.filter(expense => {
    // Filtrar por búsqueda (descripción, proveedor, número de factura, fechas)
    if (searchQuery === '') {
      // Sin búsqueda, aplicar solo filtro de liquidación
      if (liquidationMode && !selectedSociedad) {
        return false;
      }
      if (liquidationMode && (expense.expenseStatus !== 'draft' || expense.satStatus !== 'VALIDADO_SAT')) {
        return false;
      }
      if (liquidationMode && selectedSociedad && expense.sociedad !== selectedSociedad) {
        return false;
      }
      if (liquidationMode && selectedCurrency && expense.currency !== selectedCurrency) {
        return false;
      }
      return true;
    }
    
    const query = searchQuery.toLowerCase();
    
    // Buscar en descripción
    const matchesDescription = expense.description.toLowerCase().includes(query);
    
    // Buscar en proveedor
    const matchesSupplier = expense.supplier.toLowerCase().includes(query);
    
    // Buscar en número de factura
    const matchesInvoice = expense.noinvoice && expense.noinvoice.toLowerCase().includes(query);
    
    // Buscar en fecha de factura (formato DD/MM/YYYY)
    const invoiceDate = formatDateToSpanish(expense.date);
    const matchesInvoiceDate = invoiceDate.includes(query);
    
    // Buscar en fecha de carga (formato DD/MM/YYYY)
    let matchesCreatedDate = false;
    if (expense.createdAt) {
      try {
        const createdDate = formatDateToSpanish(new Date(expense.createdAt).toISOString().split('T')[0]);
        matchesCreatedDate = createdDate.includes(query);
      } catch (e) {
        matchesCreatedDate = false;
      }
    }
    
    const matchesSearch = matchesDescription || matchesSupplier || matchesInvoice || 
                         matchesInvoiceDate || matchesCreatedDate;
    
    // En modo liquidación, solo mostrar gastos con expenseStatus='draft'
    if (liquidationMode && !selectedSociedad) {
      return false;
    }
    if (liquidationMode && (expense.expenseStatus !== 'draft' || expense.satStatus !== 'VALIDADO_SAT')) {
      return false;
    }
    if (liquidationMode && selectedSociedad && expense.sociedad !== selectedSociedad) {
      return false;
    }
    if (liquidationMode && selectedCurrency && expense.currency !== selectedCurrency) {
      return false;
    }
    
    return matchesSearch;
  });

  const handleFilterChange = (value: string) => {
    setSelectedFilter(value);
    setFilterStatus(value);
  };

  const handleToggleLiquidationMode = async () => {
    if (!liquidationMode) {
      const user = await AuthService.getLastLoggedInUser();
      if (user?.sociedad && !selectedSociedad) {
        setSelectedSociedad(user.sociedad);
      }
    }

    setLiquidationMode(!liquidationMode);
    setSelectedExpenseIds([]); // Limpiar selección al cambiar de modo
    if (liquidationMode) {
      setSelectedCurrency('');
    }
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

      if (!selectedSociedad) {
        Alert.alert('Error', 'Debe seleccionar la sociedad de la liquidación');
        return;
      }

      if (!selectedCurrency) {
        Alert.alert('Error', 'Debe seleccionar la moneda de la liquidaci?n');
        return;
      }

      console.log('🚀 Creando liquidación con', selectedExpenseIds.length, 'gastos');

      const liquidation = await createLiquidation({
        userId: user.email,
        employeeName: `${user.firstName} ${user.lastName}`.trim() || user.email,
        sociedad: selectedSociedad,
        currency: selectedCurrency,
        expenseIds: selectedExpenseIds
      });

      // Limpiar inmediatamente
      setLiquidationMode(false);
      setSelectedExpenseIds([]);
      setSelectedCurrency('');

      // Recargar gastos UNA SOLA VEZ para reflejar cambios de estado
      if (loadExpenses) {
        await loadExpenses();
      }

      Alert.alert(
        '✅ Liquidación Creada',
        `Se creó la liquidación con ${selectedExpenseIds.length} gastos por ${liquidation.currency || selectedCurrency} ${liquidation.totalAmount.toFixed(2)}\n\n💡 Puedes verla ahora o ir a la pestaña "Liquidaciones" cuando desees.`,
        [
          {
            text: 'Ver Ahora',
            onPress: () => {
              router.push({ 
                pathname: '../liquidation-detail', 
                params: { liquidationId: liquidation.id } 
              });
            }
          },
          { text: 'Más Tarde' }
        ]
      );
    } catch (error) {
      console.error('❌ Error creando liquidación:', error);
      Alert.alert('Error', 'No se pudo crear la liquidación: ' + (error as Error).message);
    }
  };

  const statusOptions = [
    'Todos los estados',
    'Borrador',
    'En Liquidación',
    'Autorizado',
    'Anulado'
  ];

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
                  <Text style={styles.addButtonText}>Gasto</Text>
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
            placeholder="Buscar por descripción, proveedor, factura, fecha..." 
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
          <View style={styles.liquidationSelectorsRow}>
            <View style={styles.liquidationSociedadPicker}>
              <Picker
                selectedValue={selectedSociedad}
                onValueChange={(value) => {
                  setSelectedSociedad(value);
                  setSelectedExpenseIds([]);
                }}
                style={styles.liquidationPicker}
              >
                <Picker.Item label="Seleccionar sociedad" value="" />
                {SOCIEDADES.map((sociedad) => (
                  <Picker.Item key={sociedad.code} label={sociedad.label} value={sociedad.code} />
                ))}
              </Picker>
            </View>
            <View style={styles.liquidationCurrencyPicker}>
              <Picker
                selectedValue={selectedCurrency}
                onValueChange={(value) => {
                  setSelectedCurrency(value);
                  setSelectedExpenseIds([]);
                }}
                style={styles.liquidationPicker}
              >
                <Picker.Item label="Moneda" value="" />
                {LIQUIDATION_CURRENCIES.map((currency) => (
                  <Picker.Item key={currency} label={currency} value={currency} />
                ))}
              </Picker>
            </View>
          </View>
          {selectedExpenseIds.length > 0 && selectedSociedad && selectedCurrency && (
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

      {/* Botón flotante para chat con IA */}
      {!liquidationMode && (
        <TouchableOpacity 
          style={styles.floatingChatButton}
          onPress={() => router.push('../expense-chat')}
        >
          <Ionicons name="chatbubbles" size={28} color="white" />
        </TouchableOpacity>
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
  searchInput: { 
    marginLeft: 10, 
    flex: 1, 
    fontSize: 16,
    color: '#1e293b',
  },
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
    gap: 12,
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
  liquidationSelectorsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  createLiquidationButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  createLiquidationButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  liquidationSociedadPicker: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  liquidationCurrencyPicker: {
    width: 132,
    backgroundColor: 'white',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  liquidationPicker: {
    height: 44,
    color: '#1e3a8a',
  },
  listContent: { padding: 15 },
  expenseItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  expenseItemSelected: {
    borderColor: '#2563eb',
    borderWidth: 2,
    backgroundColor: '#eff6ff',
  },
  expenseItemDisabled: {
    opacity: 0.5,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxContainer: {
    marginRight: 12,
    paddingTop: 2,
  },
  expenseContent: {
    flex: 1,
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  expenseAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#059669',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: { 
    paddingVertical: 4, 
    paddingHorizontal: 10, 
    borderRadius: 12,
  },
  statusText: { 
    fontSize: 10, 
    fontWeight: '700',
  },
  liquidationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d1fae5',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 3,
  },
  liquidationBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  satBadge: {
    backgroundColor: '#ede9fe',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  satBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7c3aed',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginBottom: 12,
  },
  infoGrid: {
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoCell: {
    flex: 1,
  },
  infoCellRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  infoRowFull: {
    width: '100%',
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
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
  floatingChatButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
});
