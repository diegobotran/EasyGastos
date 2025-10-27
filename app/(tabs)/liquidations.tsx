import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
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
        <Text style={styles.headerTitle}>Mis Liquidaciones</Text>
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={handleRefresh}
        >
          <Ionicons name="refresh" size={24} color="#2563eb" />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContainer}
      >
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            Todas
          </Text>
          <View style={[styles.filterBadge, filter === 'all' && styles.filterBadgeActive]}>
            <Text style={[styles.filterBadgeText, filter === 'all' && styles.filterBadgeTextActive]}>
              {liquidations.length}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.filterButton, filter === 'draft' && styles.filterButtonActive]}
          onPress={() => setFilter('draft')}
        >
          <Text style={[styles.filterText, filter === 'draft' && styles.filterTextActive]}>
            Borradores
          </Text>
          <View style={[styles.filterBadge, filter === 'draft' && styles.filterBadgeActive]}>
            <Text style={[styles.filterBadgeText, filter === 'draft' && styles.filterBadgeTextActive]}>
              {liquidations.filter(l => l.status === 'draft').length}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.filterButton, filter === 'submitted' && styles.filterButtonActive]}
          onPress={() => setFilter('submitted')}
        >
          <Text style={[styles.filterText, filter === 'submitted' && styles.filterTextActive]}>
            Enviadas
          </Text>
          <View style={[styles.filterBadge, filter === 'submitted' && styles.filterBadgeActive]}>
            <Text style={[styles.filterBadgeText, filter === 'submitted' && styles.filterBadgeTextActive]}>
              {liquidations.filter(l => l.status === 'submitted').length}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.filterButton, filter === 'approved' && styles.filterButtonActive]}
          onPress={() => setFilter('approved')}
        >
          <Text style={[styles.filterText, filter === 'approved' && styles.filterTextActive]}>
            Aprobadas
          </Text>
          <View style={[styles.filterBadge, filter === 'approved' && styles.filterBadgeActive]}>
            <Text style={[styles.filterBadgeText, filter === 'approved' && styles.filterBadgeTextActive]}>
              {liquidations.filter(l => l.status === 'approved').length}
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

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
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 10,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: '#f1f5f9',
    gap: 8,
  },
  filterButtonActive: {
    backgroundColor: '#2563eb',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  filterTextActive: {
    color: 'white',
  },
  filterBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  filterBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
  },
  filterBadgeTextActive: {
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
