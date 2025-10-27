import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import * as AuthService from '../../services/AuthService';

export default function LiquidationsScreen() {
  const router = useRouter();
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'draft' | 'submitted' | 'approved' | 'rejected'>('all');
  const [showFilterModal, setShowFilterModal] = useState(false);

  useEffect(() => {
    loadLiquidations();
  }, []);

  const loadLiquidations = async () => {
    try {
      console.log('📋 Cargando liquidaciones...');
      const user = await AuthService.getLastLoggedInUser();
      
      if (!user) {
        console.log('⚠️ No hay usuario logueado');
        setLiquidations([]);
        return;
      }

      const userLiquidations = await getLiquidations(user.email);
      setLiquidations(userLiquidations);
      console.log('✅ Liquidaciones cargadas:', userLiquidations.length);
    } catch (error) {
      console.error('❌ Error cargando liquidaciones:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadLiquidations();
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
        <View style={styles.itemHeader}>
          <View style={styles.itemTitleContainer}>
            <Ionicons name="folder" size={24} color="#2563eb" />
            <View style={styles.itemTitleText}>
              <Text style={styles.itemTitle}>Liquidación #{item.id.slice(-6)}</Text>
              <Text style={styles.itemDate}>{item.createdDate}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>

        <View style={styles.itemDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="receipt-outline" size={16} color="#64748b" />
            <Text style={styles.detailText}>{item.expenseIds.length} gastos</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="cash-outline" size={16} color="#64748b" />
            <Text style={styles.detailAmount}>Q{item.totalAmount.toFixed(2)}</Text>
          </View>
        </View>

        {item.submittedDate && (
          <View style={styles.submittedInfo}>
            <Ionicons name="send" size={14} color="#64748b" />
            <Text style={styles.submittedText}>Enviada: {item.submittedDate}</Text>
          </View>
        )}

        {item.approvedDate && (
          <View style={styles.approvedInfo}>
            <Ionicons name="checkmark-circle" size={14} color="#059669" />
            <Text style={styles.approvedText}>Aprobada: {item.approvedDate}</Text>
          </View>
        )}

        {item.managerComments && (
          <View style={styles.commentsPreview}>
            <Ionicons name="chatbox-outline" size={14} color="#64748b" />
            <Text style={styles.commentsText} numberOfLines={2}>
              {item.managerComments}
            </Text>
          </View>
        )}

        <View style={styles.itemFooter}>
          <Text style={styles.viewDetailsText}>Ver detalles</Text>
          <Ionicons name="chevron-forward" size={20} color="#2563eb" />
        </View>
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
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  itemTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  itemTitleText: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  itemDate: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  itemDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 14,
    color: '#64748b',
  },
  detailAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },
  submittedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  submittedText: {
    fontSize: 12,
    color: '#64748b',
  },
  approvedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  approvedText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  commentsPreview: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
  },
  commentsText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    fontStyle: 'italic',
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 4,
  },
  viewDetailsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
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
