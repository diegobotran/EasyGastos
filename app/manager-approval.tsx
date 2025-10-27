import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { ManagerSummary, PendingExpense } from '../models/ManagerModels';
import { BackendSyncService } from '../services/BackendSyncService';

export default function ManagerApprovalScreen() {
  const { user } = useAuth();
  const [pendingExpenses, setPendingExpenses] = useState<PendingExpense[]>([]);
  const [summary, setSummary] = useState<ManagerSummary>({ pendingCount: 0, totalAmount: 0, employeeCount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<PendingExpense | null>(null);
  const [approvalAction, setApprovalAction] = useState<boolean>(true);
  const [comments, setComments] = useState('');

  const loadPendingExpenses = async () => {
    if (!user?.email) return;

    try {
      setIsLoading(true);
      
      // Intentar obtener gastos pendientes con timeout corto para no bloquear en offline
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 3000)
      );
      
      const fetchPromise = BackendSyncService.getPendingExpensesForManager(user.email);
      
      const result = await Promise.race([fetchPromise, timeoutPromise]) as any;
      
      if (result.expenses) {
        // Conectado exitosamente
        setIsOffline(false);
        
        // Convertir Expense[] a PendingExpense[]
        const pendingExpenses: PendingExpense[] = result.expenses.map((expense: any) => ({
          id: expense.id,
          userEmail: expense.email, // Expense usa 'email', PendingExpense usa 'userEmail'
          description: expense.description,
          amount: expense.amount,
          date: new Date(expense.date),
          category: expense.category,
          status: expense.status as 'ENVIADO_JEFE' | 'APROBADO_JEFE' | 'RECHAZADO_JEFE',
          supplier: expense.supplier,
          department: expense.department,
          notes: expense.notes,
          currency: expense.currency,
          totalIva: expense.totiva,
          centro: expense.centro,
          cuenta: expense.cuenta,
          ordenco: expense.ordenco
        }));
        
        setPendingExpenses(pendingExpenses);
        
        // Calcular resumen
        const totalAmount = pendingExpenses.reduce((sum: number, expense: PendingExpense) => sum + expense.amount, 0);
        const uniqueEmployees = new Set(pendingExpenses.map((e: PendingExpense) => e.userEmail)).size;
        
        setSummary({
          pendingCount: result.expenses.length,
          totalAmount,
          employeeCount: uniqueEmployees,
          departmentName: user.department
        });
      } else if (result.error) {
        console.error('Error cargando gastos pendientes:', result.error);
        // En modo offline, no mostrar alert - simplemente dejar vacío
        setIsOffline(true);
        setPendingExpenses([]);
        setSummary({ pendingCount: 0, totalAmount: 0, employeeCount: 0 });
      }
    } catch (error) {
      // Error de timeout o conexión - modo offline
      console.log('Modo offline o sin conexión al backend:', error);
      setIsOffline(true);
      setPendingExpenses([]);
      setSummary({ pendingCount: 0, totalAmount: 0, employeeCount: 0 });
      // No mostrar alert en modo offline para no interrumpir al usuario
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleApproval = async (expenseId: string, approve: boolean, comments?: string) => {
    if (!user?.email) return;

    try {
      const result = await BackendSyncService.approveExpense(
        expenseId,
        approve,
        user.email,
        comments
      );

      if (result.success) {
        Alert.alert(
          'Éxito', 
          `Gasto ${approve ? 'aprobado' : 'rechazado'} correctamente`,
          [{ text: 'OK', onPress: loadPendingExpenses }]
        );
      } else {
        Alert.alert('Error', result.error || 'Error procesando la solicitud');
      }
    } catch (error) {
      console.error('Error en aprobación:', error);
      Alert.alert('Error', 'Error al procesar la aprobación');
    }
  };

  const promptApproval = (expense: PendingExpense, approve: boolean) => {
    setSelectedExpense(expense);
    setApprovalAction(approve);
    setComments('');
    setModalVisible(true);
  };

  const confirmApproval = () => {
    if (selectedExpense) {
      handleApproval(selectedExpense.id, approvalAction, comments);
      setModalVisible(false);
      setSelectedExpense(null);
      setComments('');
    }
  };

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadPendingExpenses();
  }, [user?.email]);

  useFocusEffect(
    useCallback(() => {
      loadPendingExpenses();
    }, [user?.email])
  );

  const renderExpenseItem = ({ item }: { item: PendingExpense }) => (
    <View style={styles.expenseCard}>
      <View style={styles.expenseHeader}>
        <Text style={styles.employeeName}>{item.userEmail}</Text>
        <Text style={styles.amount}>{item.amount.toFixed(2)}€</Text>
      </View>
      
      <Text style={styles.description}>{item.description}</Text>
      
      <View style={styles.expenseDetails}>
        <Text style={styles.category}>{item.category}</Text>
        <Text style={styles.date}>
          {new Date(item.date).toLocaleDateString('es-ES')}
        </Text>
      </View>
      
      {item.supplier && (
        <Text style={styles.supplier}>Proveedor: {item.supplier}</Text>
      )}
      
      {item.notes && (
        <Text style={styles.notes}>Notas: {item.notes}</Text>
      )}
      
      <View style={styles.actionButtons}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.rejectButton]} 
          onPress={() => promptApproval(item, false)}
        >
          <Ionicons name="close" size={20} color="white" />
          <Text style={styles.actionButtonText}>Rechazar</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.approveButton]} 
          onPress={() => promptApproval(item, true)}
        >
          <Ionicons name="checkmark" size={20} color="white" />
          <Text style={styles.actionButtonText}>Aprobar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSummaryCard = () => (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Resumen de Aprobaciones</Text>
      
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.pendingCount}</Text>
          <Text style={styles.summaryLabel}>Gastos Pendientes</Text>
        </View>
        
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.totalAmount.toFixed(2)}€</Text>
          <Text style={styles.summaryLabel}>Monto Total</Text>
        </View>
        
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.employeeCount}</Text>
          <Text style={styles.summaryLabel}>Empleados</Text>
        </View>
      </View>
      
      {summary.departmentName && (
        <Text style={styles.departmentName}>Departamento: {summary.departmentName}</Text>
      )}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Cargando gastos pendientes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={pendingExpenses}
        renderItem={renderExpenseItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderSummaryCard}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {isOffline ? (
              <>
                <Ionicons name="cloud-offline-outline" size={80} color="#94a3b8" />
                <Text style={styles.emptyTitle}>Modo Offline</Text>
                <Text style={styles.emptyMessage}>
                  La funcionalidad de aprobaciones requiere conexión al servidor.
                  {'\n'}Conéctese a internet para ver gastos pendientes.
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={80} color="#10b981" />
                <Text style={styles.emptyTitle}>¡Todo al día!</Text>
                <Text style={styles.emptyMessage}>
                  No hay gastos pendientes de aprobación
                </Text>
              </>
            )}
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
      
      {/* Modal para comentarios de aprobación */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {approvalAction ? 'Aprobar Gasto' : 'Rechazar Gasto'}
            </Text>
            
            {selectedExpense && (
              <View style={styles.expenseInfo}>
                <Text style={styles.expenseAmount}>{selectedExpense.amount.toFixed(2)}€</Text>
                <Text style={styles.expenseDescription}>{selectedExpense.description}</Text>
                <Text style={styles.expenseEmployee}>Empleado: {selectedExpense.userEmail}</Text>
              </View>
            )}
            
            <Text style={styles.commentsLabel}>Comentarios (opcional):</Text>
            <TextInput
              style={styles.commentsInput}
              multiline
              numberOfLines={4}
              placeholder="Agregar comentarios sobre la decisión..."
              value={comments}
              onChangeText={setComments}
              textAlignVertical="top"
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, approvalAction ? styles.approveModalButton : styles.rejectModalButton]} 
                onPress={confirmApproval}
              >
                <Text style={styles.actionModalButtonText}>
                  {approvalAction ? 'APROBAR' : 'RECHAZAR'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#64748b',
  },
  listContainer: {
    padding: 16,
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
  },
  departmentName: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  expenseCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  employeeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#059669',
  },
  description: {
    fontSize: 15,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 20,
  },
  expenseDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  category: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '500',
  },
  date: {
    fontSize: 13,
    color: '#6b7280',
  },
  supplier: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  notes: {
    fontSize: 13,
    color: '#6b7280',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  approveButton: {
    backgroundColor: '#059669',
  },
  rejectButton: {
    backgroundColor: '#dc2626',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10b981',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  // Estilos del modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    margin: 20,
    minWidth: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  expenseInfo: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  expenseAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#059669',
    textAlign: 'center',
    marginBottom: 4,
  },
  expenseDescription: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 4,
  },
  expenseEmployee: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  commentsLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  commentsInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#6b7280',
  },
  cancelButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  approveModalButton: {
    backgroundColor: '#059669',
  },
  rejectModalButton: {
    backgroundColor: '#dc2626',
  },
  actionModalButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});