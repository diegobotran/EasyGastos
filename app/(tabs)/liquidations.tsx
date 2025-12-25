import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Liquidation, getLiquidationStatusColor, getLiquidationStatusText } from '../../models/Liquidation';
import { getLiquidations } from '../../services/LiquidationService';
import { BackendSyncService } from '../../services/BackendSyncService';
import * as AuthService from '../../services/AuthService';
import { formatDateToSpanish } from '../../utils/dateUtils';

export default function LiquidationsScreen() {
  const router = useRouter();
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'draft' | 'submitted' | 'approved' | 'rejected'>('all');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const isFirstLoad = useRef(true);

  // Cargar al montar
  useEffect(() => {
    loadLiquidations();
    syncLiquidationsFromBackend();
  }, []);

  // Recargar SOLO cuando la pantalla obtiene foco (cambias de tab)
  // Pero NO en la primera carga para evitar doble carga
  useFocusEffect(
    useCallback(() => {
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        return;
      }
      console.log('📋 Liquidations: Tab enfocado, recargando...');
      loadLiquidations();
    }, [])
  );

  const loadLiquidations = async () => {
    try {
      console.log('📋 Liquidations: Cargando liquidaciones...');
      const user = await AuthService.getLastLoggedInUser();
      
      if (!user) {
        console.log('⚠️ Liquidations: No hay usuario logueado');
        setLiquidations([]);
        return;
      }

      const userLiquidations = await getLiquidations(user.email);
      setLiquidations(userLiquidations);
      console.log('✅ Liquidations: Liquidaciones cargadas:', userLiquidations.length);
    } catch (error) {
      console.error('❌ Liquidations: Error cargando liquidaciones:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Sincronizar liquidaciones desde el backend (para recibir actualizaciones del jefe)
  const syncLiquidationsFromBackend = async () => {
    try {
      console.log('🔄 Liquidations: Sincronizando desde backend...');
      const user = await AuthService.getLastLoggedInUser();
      if (!user) return;

      // Verificar conexión
      const isConnected = await BackendSyncService.checkConnection();
      if (!isConnected) {
        console.log('⚠️ Liquidations: Sin conexión - skip sync');
        return;
      }

      // Obtener token
      const pin = await AuthService.getPIN();
      if (!pin) return;

      const loginResult = await BackendSyncService.loginAndGetToken(user.email, pin);
      if (!loginResult.success || !loginResult.token) return;

      // Descargar liquidaciones desde el backend (incluye actualizaciones)
      const result = await BackendSyncService.downloadLiquidationsFromBackend(user.email, loginResult.token);
      
      if (result.success) {
        console.log(`✅ Liquidations: Sincronizadas ${result.count || 0} liquidaciones desde el backend`);
        // Recargar la lista local después de sincronizar
        loadLiquidations();
      }
    } catch (error) {
      console.log('⚠️ Liquidations: Error en sincronización (no crítico):', error);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Al hacer refresh, sincronizar primero y luego cargar
    syncLiquidationsFromBackend().then(() => loadLiquidations());
  };

  const handleViewDetails = (liquidationId: string) => {
    router.push({ 
      pathname: '../liquidation-detail', 
      params: { liquidationId } 
    });
  };

  const getFilterText = () => {
    switch (filter) {
      case 'all': return 'Todas';
      case 'draft': return 'Borradores';
      case 'submitted': return 'Enviadas';
      case 'approved': return 'Aprobadas';
      case 'rejected': return 'Rechazadas';
      default: return 'Todas';
    }
  };

  const getFilterCount = (filterType: typeof filter) => {
    if (filterType === 'all') return liquidations.length;
    return liquidations.filter(l => l.status === filterType).length;
  };

  const handleSelectFilter = (selectedFilter: typeof filter) => {
    setFilter(selectedFilter);
    setShowFilterModal(false);
  };

  const filteredLiquidations = liquidations.filter(liq => {
    if (filter === 'all') return true;
    return liq.status === filter;
  });

  const renderLiquidationItem = ({ item }: { item: Liquidation }) => {
    const statusColor = getLiquidationStatusColor(item.status);
    const statusText = getLiquidationStatusText(item.status);

    return (
      <TouchableOpacity 
        style={styles.liquidationItem}
        onPress={() => handleViewDetails(item.id)}
      >
        {/* Header: ID + Monto */}
        <View style={styles.itemHeader}>
          <View style={styles.itemTitleContainer}>
            <Ionicons name="folder" size={20} color="#2563eb" />
            <Text style={styles.itemTitle}>#{item.id.slice(-6)}</Text>
          </View>
          <Text style={styles.itemAmount}>Q{item.totalAmount.toFixed(2)}</Text>
        </View>

        {/* Info Row: Fecha, Cantidad de gastos */}
        <View style={styles.itemInfoRow}>
          <View style={styles.infoItem}>
            <Ionicons name="calendar-outline" size={14} color="#64748b" />
            <Text style={styles.infoText}>{formatDateToSpanish(item.createdDate)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="receipt-outline" size={14} color="#64748b" />
            <Text style={styles.infoText}>{item.expenseIds.length} gastos</Text>
          </View>
        </View>

        {/* Footer: Estado y fechas adicionales */}
        <View style={styles.itemFooter}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            {/* Icono según estado */}
            {item.status === 'draft' && <Ionicons name="create-outline" size={14} color={statusColor} />}
            {item.status === 'submitted' && <Ionicons name="time-outline" size={14} color={statusColor} />}
            {item.status === 'approved' && <Ionicons name="checkmark-circle" size={14} color={statusColor} />}
            {item.status === 'rejected' && <Ionicons name="close-circle" size={14} color={statusColor} />}
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>

          {item.submittedDate && (
            <View style={styles.dateBadge}>
              <Ionicons name="send" size={10} color="#64748b" />
              <Text style={styles.dateBadgeText}>Enviada {formatDateToSpanish(item.submittedDate)}</Text>
            </View>
          )}

          {item.approvedDate && (
            <View style={styles.approvedBadge}>
              <Ionicons name="checkmark-circle" size={10} color="#059669" />
              <Text style={styles.approvedBadgeText}>{item.approvedDate}</Text>
            </View>
          )}
        </View>

        {/* Comentarios del jefe (si existen) */}
        {item.managerComments && (
          <View style={styles.commentsPreview}>
            <Ionicons name="chatbox" size={12} color="#f59e0b" />
            <Text style={styles.commentsText} numberOfLines={2}>
              {item.managerComments}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="folder-open-outline" size={60} color="#cbd5e1" />
      <Text style={styles.emptyTitle}>No hay liquidaciones</Text>
      <Text style={styles.emptySubtitle}>
        {filter === 'all' 
          ? 'Crea tu primera liquidación desde la sección de Gastos'
          : `No tienes liquidaciones en estado "${getLiquidationStatusText(filter as any)}"`
        }
      </Text>
      <TouchableOpacity 
        style={styles.goToExpensesButton}
        onPress={() => router.push('/(tabs)/expenses')}
      >
        <Ionicons name="add-circle" size={20} color="white" />
        <Text style={styles.goToExpensesText}>Ir a Gastos</Text>
      </TouchableOpacity>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Cargando liquidaciones...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Liquidaciones</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.filterButtonCompact}
            onPress={() => setShowFilterModal(true)}
          >
            <Ionicons name="filter" size={20} color="#2563eb" />
            <Text style={styles.filterButtonText}>{getFilterText()}</Text>
            <View style={styles.filterCount}>
              <Text style={styles.filterCountText}>{getFilterCount(filter)}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.refreshButton}
            onPress={handleRefresh}
          >
            <Ionicons name="refresh" size={24} color="#2563eb" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowFilterModal(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtrar Liquidaciones</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Filter Options */}
            {[
              { key: 'all' as const, label: 'Todas', icon: 'list' as const },
              { key: 'draft' as const, label: 'Borradores', icon: 'create-outline' as const },
              { key: 'submitted' as const, label: 'Enviadas', icon: 'send' as const },
              { key: 'approved' as const, label: 'Aprobadas', icon: 'checkmark-circle' as const },
              { key: 'rejected' as const, label: 'Rechazadas', icon: 'close-circle' as const },
            ].map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.filterOption,
                  filter === option.key && styles.filterOptionActive
                ]}
                onPress={() => handleSelectFilter(option.key)}
              >
                <View style={styles.filterOptionLeft}>
                  <Ionicons 
                    name={option.icon} 
                    size={24} 
                    color={filter === option.key ? '#2563eb' : '#64748b'} 
                  />
                  <Text style={[
                    styles.filterOptionText,
                    filter === option.key && styles.filterOptionTextActive
                  ]}>
                    {option.label}
                  </Text>
                </View>
                <View style={[
                  styles.filterOptionBadge,
                  filter === option.key && styles.filterOptionBadgeActive
                ]}>
                  <Text style={[
                    styles.filterOptionBadgeText,
                    filter === option.key && styles.filterOptionBadgeTextActive
                  ]}>
                    {getFilterCount(option.key)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Lista de Liquidaciones */}
      {filteredLiquidations.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={filteredLiquidations}
          renderItem={renderLiquidationItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
          }
        />
      )}
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
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  refreshButton: {
    padding: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  filterButtonCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#93c5fd',
    gap: 6,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  filterCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  filterCountText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'white',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '85%',
    maxWidth: 400,
    paddingVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  filterOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  filterOptionActive: {
    backgroundColor: '#eff6ff',
  },
  filterOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  filterOptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#475569',
  },
  filterOptionTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  filterOptionBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  filterOptionBadgeActive: {
    backgroundColor: '#2563eb',
  },
  filterOptionBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748b',
  },
  filterOptionBadgeTextActive: {
    color: 'white',
  },
  listContent: {
    padding: 16,
  },
  liquidationItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  itemTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  itemAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#059669',
  },
  itemInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 10,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  dateBadgeText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  approvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d1fae5',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  approvedBadgeText: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '700',
  },
  commentsPreview: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    padding: 10,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  commentsText: {
    flex: 1,
    fontSize: 12,
    color: '#92400e',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#334155',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  goToExpensesButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
  },
  goToExpensesText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
