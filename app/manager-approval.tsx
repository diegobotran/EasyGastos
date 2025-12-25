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
import { Liquidation, getLiquidationStatusColor, getLiquidationStatusText } from '../models/Liquidation';
import { BackendSyncService } from '../services/BackendSyncService';
import { getExpenseById } from '../services/ExpenseService';
import * as NotificationService from '../services/NotificationService';

interface ManagerSummary {
  pendingCount: number;
  totalAmount: number;
  employeeCount: number;
  departmentName?: string;
}

export default function ManagerApprovalScreen() {
  const { user } = useAuth();
  const [pendingLiquidations, setPendingLiquidations] = useState<Liquidation[]>([]);
  const [summary, setSummary] = useState<ManagerSummary>({ pendingCount: 0, totalAmount: 0, employeeCount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedLiquidation, setSelectedLiquidation] = useState<Liquidation | null>(null);
  const [approvalAction, setApprovalAction] = useState<boolean>(true);
  const [comments, setComments] = useState('');

  const loadPendingLiquidations = async () => {
    if (!user?.email) {
      console.error('❌ ManagerApproval: No hay usuario o email');
      return;
    }

    try {
      setIsLoading(true);
      
      console.log('🔑 ManagerApproval: Obteniendo token para:', user.email);
      console.log('🔑 ManagerApproval: PIN disponible:', user.pin ? 'SÍ' : 'NO');
      
      // Primero obtener el token de autenticación
      const loginResult = await BackendSyncService.loginAndGetToken(user.email, user.pin || '');
      
      if (!loginResult.success || !loginResult.token) {
        console.error('❌ ManagerApproval: Error obteniendo token:', loginResult.error);
        setIsOffline(true);
        setPendingLiquidations([]);
        setSummary({ pendingCount: 0, totalAmount: 0, employeeCount: 0 });
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      console.log('✅ ManagerApproval: Token obtenido exitosamente');
      
      // Obtener liquidaciones pendientes para este manager
      console.log('📋 ManagerApproval: Solicitando liquidaciones pendientes...');
      const liquidations = await BackendSyncService.getPendingLiquidationsForManager(user.email, loginResult.token);
      
      console.log('📋 ManagerApproval: Liquidaciones recibidas:', liquidations?.length || 0);
      
      if (liquidations && Array.isArray(liquidations)) {
        // Conectado exitosamente
        setIsOffline(false);
        setPendingLiquidations(liquidations);
        
        // Calcular resumen
        const totalAmount = liquidations.reduce((sum: number, liq: Liquidation) => sum + liq.totalAmount, 0);
        const uniqueEmployees = new Set(liquidations.map((liq: Liquidation) => liq.userId)).size;
        
        setSummary({
          pendingCount: liquidations.length,
          totalAmount,
          employeeCount: uniqueEmployees,
          departmentName: user.department
        });
        
        console.log(`✅ ManagerApproval: ${liquidations.length} liquidaciones cargadas`);
      } else {
        console.error('❌ ManagerApproval: Respuesta inválida del servidor');
        setIsOffline(true);
        setPendingLiquidations([]);
        setSummary({ pendingCount: 0, totalAmount: 0, employeeCount: 0 });
      }
    } catch (error) {
      // Error de conexión - modo offline
      console.log('Modo offline o sin conexión al backend:', error);
      setIsOffline(true);
      setPendingLiquidations([]);
      setSummary({ pendingCount: 0, totalAmount: 0, employeeCount: 0 });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleApproval = async (liquidationId: string, approve: boolean, comments?: string) => {
    if (!user?.email) return;

    try {
      console.log(`${approve ? '✅' : '❌'} ManagerApproval: ${approve ? 'Aprobando' : 'Rechazando'} liquidación...`);
      
      // Obtener token de autenticación
      const loginResult = await BackendSyncService.loginAndGetToken(user.email, user.pin || '');
      
      if (!loginResult.success || !loginResult.token) {
        Alert.alert('Sin Conexión', 'No se pudo conectar al servidor. Por favor, verifique su conexión a internet.');
        return;
      }

      // Aprobar o rechazar en el backend
      const result = approve 
        ? await BackendSyncService.approveLiquidation(liquidationId, comments || '', loginResult.token)
        : await BackendSyncService.rejectLiquidation(liquidationId, comments || '', loginResult.token);

      if (result.success) {
        Alert.alert(
          '✅ Completado', 
          `Liquidación ${approve ? 'aprobada' : 'rechazada'} correctamente.\n\nEl empleado recibirá la notificación cuando sincronice.`,
          [{ text: 'OK', onPress: loadPendingLiquidations }]
        );
      } else {
        Alert.alert('Error', result.error || 'Error procesando la solicitud. Por favor, intente de nuevo.');
      }
    } catch (error) {
      console.error('❌ ManagerApproval: Error en aprobación:', error);
      Alert.alert('Error', 'No se pudo procesar la aprobación. Verifique su conexión.');
    }
  };

  const promptApproval = (liquidation: Liquidation, approve: boolean) => {
    setSelectedLiquidation(liquidation);
    setApprovalAction(approve);
    setComments('');
    setModalVisible(true);
  };

  const confirmApproval = () => {
    if (selectedLiquidation) {
      handleApproval(selectedLiquidation.id, approvalAction, comments);
      setModalVisible(false);
      setSelectedLiquidation(null);
      setComments('');
    }
  };

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadPendingLiquidations();
  }, [user?.email]);

  useFocusEffect(
    useCallback(() => {
      // Limpiar badge de notificaciones cuando el manager abre la pantalla
      NotificationService.clearBadge();
      loadPendingLiquidations();
    }, [user?.email])
  );

  const renderLiquidationItem = ({ item }: { item: Liquidation }) => (
    <View style={styles.expenseCard}>
      <View style={styles.expenseHeader}>
        <View>
          <Text style={styles.employeeName}>{item.employeeName}</Text>
          <Text style={styles.liquidationId}>ID: {item.id}</Text>
        </View>
        <Text style={styles.amount}>{item.totalAmount.toFixed(2)}€</Text>
      </View>
      
      <View style={[styles.statusBadge, { backgroundColor: getLiquidationStatusColor(item.status) + '20' }]}>
        <Text style={[styles.statusText, { color: getLiquidationStatusColor(item.status) }]}>
          {getLiquidationStatusText(item.status)}
        </Text>
      </View>
      
      <View style={styles.expenseDetails}>
        <Text style={styles.category}>
          <Ionicons name="receipt" size={14} color="#666" /> {item.expenseIds.length} gasto(s)
        </Text>
        <Text style={styles.date}>
          {new Date(item.createdDate).toLocaleDateString('es-ES')}
        </Text>
      </View>
      
      {item.submittedDate && (
        <Text style={styles.notes}>
          Enviado: {new Date(item.submittedDate).toLocaleDateString('es-ES')}
        </Text>
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
          <Text style={styles.summaryLabel}>Liquidaciones</Text>
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
        data={pendingLiquidations}
        renderItem={renderLiquidationItem}
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
                  {'\n'}Conéctese a internet para ver liquidaciones pendientes.
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={80} color="#10b981" />
                <Text style={styles.emptyTitle}>¡Todo al día!</Text>
                <Text style={styles.emptyMessage}>
                  No hay liquidaciones pendientes de aprobación
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
              {approvalAction ? 'Aprobar Liquidación' : 'Rechazar Liquidación'}
            </Text>
            
            {selectedLiquidation && (
              <View style={styles.expenseInfo}>
                <Text style={styles.expenseAmount}>{selectedLiquidation.totalAmount.toFixed(2)}€</Text>
                <Text style={styles.expenseDescription}>
                  Liquidación ID: {selectedLiquidation.id}
                </Text>
                <Text style={styles.expenseEmployee}>
                  Empleado: {selectedLiquidation.employeeName}
                </Text>
                <Text style={styles.expenseEmployee}>
                  {selectedLiquidation.expenseIds.length} gasto(s) incluido(s)
                </Text>
              </View>
            )}
            
            <Text style={styles.commentsLabel}>Comentarios{!approvalAction ? ' (requerido)' : ' (opcional)'}:</Text>
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
  liquidationId: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
});