import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
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
  const { user, pin } = useAuth();
  const router = useRouter();
  const [pendingLiquidations, setPendingLiquidations] = useState<Liquidation[]>([]);
  const [summary, setSummary] = useState<ManagerSummary>({ pendingCount: 0, totalAmount: 0, employeeCount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedLiquidation, setSelectedLiquidation] = useState<Liquidation | null>(null);
  const [liquidationExpenses, setLiquidationExpenses] = useState<any[]>([]);
  const [selectedExpenseImage, setSelectedExpenseImage] = useState<string | null>(null);
  const [backendUrl, setBackendUrl] = useState<string>('');
  const [approvalAction, setApprovalAction] = useState<boolean>(true);
  const [comments, setComments] = useState('');
  const [isForceSyncing, setIsForceSyncing] = useState(false);

  // Cargar URL del backend al iniciar
  const loadBackendUrl = async () => {
    const config = await BackendSyncService.getBackendConfig();
    setBackendUrl(config.url);
  };

  const loadPendingLiquidations = async () => {
    if (!user?.email) {
      console.error('❌ ManagerApproval: No hay usuario o email');
      return;
    }

    if (!pin) {
      console.error('❌ ManagerApproval: No hay PIN disponible - requiere desbloquear la app primero');
      setIsOffline(true);
      setPendingLiquidations([]);
      setSummary({ pendingCount: 0, totalAmount: 0, employeeCount: 0 });
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    try {
      setIsLoading(true);
      
      // Cargar URL del backend si no está cargada
      if (!backendUrl) {
        await loadBackendUrl();
      }
      
      console.log('🔑 ManagerApproval: Obteniendo token para:', user.email);
      console.log('🔑 ManagerApproval: PIN disponible:', pin ? 'SÍ' : 'NO');
      
      // Primero obtener el token de autenticación
      const loginResult = await BackendSyncService.loginAndGetToken(user.email, pin);
      
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
        
        // Si no hay liquidaciones pendientes, limpiar el badge
        if (liquidations.length === 0) {
          await NotificationService.clearBadge();
          console.log('✅ No hay liquidaciones pendientes - Badge limpiado');
        }
        
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

    if (!pin) {
      Alert.alert('Error', 'No hay PIN disponible. Por favor, desbloquee la app primero.');
      return;
    }

    try {
      console.log(`${approve ? '✅' : '❌'} ManagerApproval: ${approve ? 'Aprobando' : 'Rechazando'} liquidación...`);
      
      // Obtener token de autenticación
      const loginResult = await BackendSyncService.loginAndGetToken(user.email, pin);
      
      if (!loginResult.success || !loginResult.token) {
        Alert.alert('Sin Conexión', 'No se pudo conectar al servidor. Por favor, verifique su conexión a internet.');
        return;
      }

      // Aprobar o rechazar en el backend
      const result = approve 
        ? await BackendSyncService.approveLiquidation(liquidationId, comments || '', loginResult.token)
        : await BackendSyncService.rejectLiquidation(liquidationId, comments || '', loginResult.token);

      if (result.success) {
        // Limpiar badge de notificaciones inmediatamente
        await NotificationService.clearBadge();
        console.log('✅ Badge de notificaciones limpiado');
        
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

  const showLiquidationDetail = async (liquidation: Liquidation) => {
    setSelectedLiquidation(liquidation);
    setDetailModalVisible(true);
    setLiquidationExpenses([]); // Limpiar lista previa
    
    // Cargar los gastos desde el backend (NO desde la BD local)
    if (!pin) {
      console.error('❌ No hay PIN para obtener gastos');
      return;
    }
    
    try {
      console.log('📋 Obteniendo gastos de liquidación:', liquidation.id);
      
      // Obtener token
      const loginResult = await BackendSyncService.loginAndGetToken(user!.email, pin);
      if (!loginResult.success || !loginResult.token) {
        console.error('❌ Error obteniendo token para gastos');
        return;
      }
      
      // Obtener gastos de la liquidación desde el backend
      const { url: backendUrl } = await BackendSyncService.getBackendConfig();
      const response = await fetch(`${backendUrl}/api/liquidations/${liquidation.id}/expenses`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${loginResult.token}`
        }
      });
      
      if (response.ok) {
        const expenses = await response.json();
        console.log('✅ Gastos obtenidos:', expenses.length);
        setLiquidationExpenses(expenses);
      } else {
        console.error('❌ Error obteniendo gastos:', response.status);
      }
    } catch (error) {
      console.error('❌ Error cargando gastos:', error);
      setLiquidationExpenses([]);
    }
  };

  const viewExpenseDetail = (expense: any) => {
    // Navegar a la pantalla de detalle del gasto pasando el objeto completo
    router.push({
      pathname: '/expense-detail',
      params: { expense: JSON.stringify(expense) }
    });
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

  const handleForceRecovery = async () => {
    if (!user?.email) {
      Alert.alert('Error', 'No hay usuario activo para recuperar aprobaciones.');
      return;
    }

    if (!pin) {
      Alert.alert('Error', 'No hay PIN disponible. Desbloquee la app primero.');
      return;
    }

    try {
      setIsForceSyncing(true);
      console.log('🔄 ManagerApproval: Forzando recuperación de aprobaciones pendientes...');

      const loginResult = await BackendSyncService.loginAndGetToken(user.email, pin);
      if (!loginResult.success || !loginResult.token) {
        throw new Error(loginResult.error || 'No se pudo autenticar la sesión del manager');
      }

      const pendingLiquidationsResult =
        await BackendSyncService.downloadPendingLiquidationsForManager(
          user.email,
          loginResult.token,
        );

      const pendingExpensesResult =
        await BackendSyncService.downloadPendingExpensesForManager(
          user.email,
          loginResult.token,
        );

      await loadPendingLiquidations();

      const liquidationCount = pendingLiquidationsResult.count || 0;
      const expenseCount = pendingExpensesResult.count || 0;

      Alert.alert(
        'Recuperación completada',
        `Liquidaciones recuperadas: ${liquidationCount}\nGastos recuperados: ${expenseCount}`,
      );
    } catch (error) {
      console.error('❌ ManagerApproval: Error forzando recuperación:', error);
      Alert.alert(
        'Error',
        (error as Error).message || 'No se pudo recuperar las aprobaciones pendientes.',
      );
    } finally {
      setIsForceSyncing(false);
    }
  };

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
        <Text style={styles.amount}>{item.currency || 'Q'}{item.totalAmount.toFixed(2)}</Text>
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
      
      {/* Botón para ver detalle de gastos */}
      <TouchableOpacity 
        style={styles.detailButton}
        onPress={() => showLiquidationDetail(item)}
      >
        <Ionicons name="list-outline" size={18} color="#2563eb" />
        <Text style={styles.detailButtonText}>Ver Gastos</Text>
      </TouchableOpacity>
      
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
          <Text style={styles.summaryValue}>{pendingLiquidations[0]?.currency || 'Q'}{summary.totalAmount.toFixed(2)}</Text>
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

      <TouchableOpacity
        style={[styles.forceSyncButton, isForceSyncing && styles.forceSyncButtonDisabled]}
        onPress={handleForceRecovery}
        disabled={isForceSyncing}
      >
        {isForceSyncing ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <Ionicons name="cloud-download-outline" size={18} color="white" />
        )}
        <Text style={styles.forceSyncButtonText}>
          {isForceSyncing ? 'Recuperando...' : 'Recuperar Solicitudes'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.syncHintText}>
        La recuperación automática sigue ejecutándose periódicamente en segundo plano.
      </Text>
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
      
      {/* Modal para ver detalle de gastos */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={detailModalVisible}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalle de Gastos</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            {selectedLiquidation && (
              <View style={styles.liquidationSummary}>
                <Text style={styles.liquidationSummaryText}>
                  Liquidación ID: {selectedLiquidation.id}
                </Text>
                <Text style={styles.liquidationSummaryText}>
                  Empleado: {selectedLiquidation.employeeName}
                </Text>
                <Text style={[styles.liquidationSummaryText, { fontWeight: 'bold', fontSize: 18 }]}>
                  Total: {selectedLiquidation.currency || 'Q'}{selectedLiquidation.totalAmount.toFixed(2)}
                </Text>
              </View>
            )}
            
            <FlatList
              data={liquidationExpenses}
              keyExtractor={(item) => item.id}
              renderItem={({ item: expense }) => (
                <TouchableOpacity 
                  style={styles.expenseDetailCard}
                  onPress={() => viewExpenseDetail(expense)}
                  activeOpacity={0.7}
                >
                  <View style={styles.expenseDetailHeader}>
                    <Text style={styles.expenseDetailDescription} numberOfLines={2}>
                      {expense.description}
                    </Text>
                    <Text style={styles.expenseDetailAmount}>
                      {expense.currency}{expense.amount.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.expenseDetailInfo}>
                    <Text style={styles.expenseDetailText}>
                      <Ionicons name="pricetag-outline" size={12} /> {expense.category}
                    </Text>
                    <Text style={styles.expenseDetailText}>
                      <Ionicons name="calendar-outline" size={12} /> {new Date(expense.date).toLocaleDateString('es-ES')}
                    </Text>
                  </View>
                  {expense.supplier && (
                    <Text style={styles.expenseDetailText}>
                      <Ionicons name="storefront-outline" size={12} /> {expense.supplier}
                    </Text>
                  )}
                  
                  {/* Indicador para ver detalle */}
                  <View style={styles.viewDetailIndicator}>
                    <Ionicons name="eye-outline" size={14} color="#2563eb" />
                    <Text style={styles.viewDetailText}>Toca para ver detalle completo</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyMessage}>Cargando gastos...</Text>
              }
              showsVerticalScrollIndicator={true}
            />
            
            <TouchableOpacity 
              style={styles.closeDetailButton}
              onPress={() => setDetailModalVisible(false)}
            >
              <Text style={styles.closeDetailButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
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
                <Text style={styles.expenseAmount}>{selectedLiquidation.currency || 'Q'}{selectedLiquidation.totalAmount.toFixed(2)}</Text>
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
  forceSyncButton: {
    marginTop: 16,
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  forceSyncButtonDisabled: {
    opacity: 0.7,
  },
  forceSyncButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  syncHintText: {
    marginTop: 10,
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
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
    color: '#1f2937',
    backgroundColor: '#ffffff',
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
  detailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 8,
    gap: 6,
  },
  detailButtonText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  liquidationSummary: {
    backgroundColor: '#f0f9ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  liquidationSummaryText: {
    fontSize: 14,
    color: '#1e40af',
    marginBottom: 4,
  },
  expenseDetailCard: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#2563eb',
  },
  expenseDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },
  expenseDetailDescription: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  expenseDetailAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
  expenseDetailInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  expenseDetailText: {
    fontSize: 13,
    color: '#6b7280',
  },
  viewDetailIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 6,
  },
  viewDetailText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '500',
  },
  closeDetailButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  closeDetailButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
