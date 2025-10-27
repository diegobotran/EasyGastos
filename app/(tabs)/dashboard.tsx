import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDashboardViewModel } from '../../hooks/userDashboardViewModel';

export default function DashboardScreen() {
  const router = useRouter();
  const { 
    isLoading, 
    userGreeting,
    userRole,
    
    // Métricas de gastos
    totalExpenses,
    expensesDraft,
    expensesPendingManager,
    expensesApproved,
    expensesRejected,
    expensesAvailableForLiquidation,
    
    // Métricas de liquidaciones
    totalLiquidations,
    liquidationsDraft,
    liquidationsSubmitted,
    liquidationsApproved,
    
    // Métricas de montos
    totalAmountExpenses,
    totalAmountLiquidations,
    pendingAmountToLiquidate,
  } = useDashboardViewModel();

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Cargando dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header con saludo y rol */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{userGreeting}</Text>
          <View style={styles.roleContainer}>
            <Ionicons 
              name={userRole === 'Jefe' ? 'shield-checkmark' : 'person'} 
              size={16} 
              color={userRole === 'Jefe' ? '#2563eb' : '#64748b'} 
            />
            <Text style={[styles.roleText, userRole === 'Jefe' && styles.roleTextManager]}>
              {userRole}
            </Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => router.push('/add-expense')}
        >
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Sección: Resumen General */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Resumen General</Text>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Ionicons name="receipt-outline" size={24} color="#2563eb" />
              <Text style={styles.summaryValue}>{totalExpenses}</Text>
              <Text style={styles.summaryLabel}>Gastos</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Ionicons name="folder-outline" size={24} color="#a855f7" />
              <Text style={styles.summaryValue}>{totalLiquidations}</Text>
              <Text style={styles.summaryLabel}>Liquidaciones</Text>
            </View>
          </View>
          
          <View style={styles.amountContainer}>
            <Ionicons name="cash-outline" size={20} color="#059669" />
            <View style={styles.amountDetails}>
              <Text style={styles.amountLabel}>Total en Gastos</Text>
              <Text style={styles.amountValue}>Q{totalAmountExpenses.toFixed(2)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Sección: Mis Gastos */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Mis Gastos</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/expenses')}>
            <Text style={styles.viewAllText}>Ver todos →</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, styles.statCardDraft]}>
            <Ionicons name="create-outline" size={20} color="#64748b" />
            <Text style={styles.statValue}>{expensesDraft}</Text>
            <Text style={styles.statLabel}>Borradores</Text>
          </View>
          
          <View style={[styles.statCard, styles.statCardPending]}>
            <Ionicons name="time-outline" size={20} color="#d97706" />
            <Text style={styles.statValue}>{expensesPendingManager}</Text>
            <Text style={styles.statLabel}>Enviados</Text>
          </View>
          
          <View style={[styles.statCard, styles.statCardApproved]}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#059669" />
            <Text style={styles.statValue}>{expensesApproved}</Text>
            <Text style={styles.statLabel}>Aprobados</Text>
          </View>
          
          <View style={[styles.statCard, styles.statCardRejected]}>
            <Ionicons name="close-circle-outline" size={20} color="#dc2626" />
            <Text style={styles.statValue}>{expensesRejected}</Text>
            <Text style={styles.statLabel}>Rechazados</Text>
          </View>
        </View>

        {/* Alerta: Gastos listos para liquidar */}
        {expensesAvailableForLiquidation > 0 && (
          <TouchableOpacity 
            style={styles.alertCard}
            onPress={() => router.push('/(tabs)/expenses')}
          >
            <Ionicons name="alert-circle" size={24} color="#2563eb" />
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>
                {expensesAvailableForLiquidation} gasto(s) listo(s) para liquidar
              </Text>
              <Text style={styles.alertSubtitle}>
                Q{pendingAmountToLiquidate.toFixed(2)} pendiente de liquidación
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#2563eb" />
          </TouchableOpacity>
        )}
      </View>

      {/* Sección: Mis Liquidaciones */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Mis Liquidaciones</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/liquidations')}>
            <Text style={styles.viewAllText}>Ver todas →</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.liquidationStats}>
          <View style={styles.liquidationStatItem}>
            <View style={styles.liquidationStatIcon}>
              <Ionicons name="create-outline" size={18} color="#64748b" />
            </View>
            <View style={styles.liquidationStatInfo}>
              <Text style={styles.liquidationStatValue}>{liquidationsDraft}</Text>
              <Text style={styles.liquidationStatLabel}>Borradores</Text>
            </View>
          </View>
          
          <View style={styles.liquidationStatItem}>
            <View style={[styles.liquidationStatIcon, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="send" size={18} color="#d97706" />
            </View>
            <View style={styles.liquidationStatInfo}>
              <Text style={styles.liquidationStatValue}>{liquidationsSubmitted}</Text>
              <Text style={styles.liquidationStatLabel}>Enviadas</Text>
            </View>
          </View>
          
          <View style={styles.liquidationStatItem}>
            <View style={[styles.liquidationStatIcon, { backgroundColor: '#d1fae5' }]}>
              <Ionicons name="checkmark-circle" size={18} color="#059669" />
            </View>
            <View style={styles.liquidationStatInfo}>
              <Text style={styles.liquidationStatValue}>{liquidationsApproved}</Text>
              <Text style={styles.liquidationStatLabel}>Aprobadas</Text>
            </View>
          </View>
        </View>

        {totalAmountLiquidations > 0 && (
          <View style={styles.liquidationTotalCard}>
            <Ionicons name="wallet-outline" size={20} color="#a855f7" />
            <View style={styles.liquidationTotalInfo}>
              <Text style={styles.liquidationTotalLabel}>Total Liquidado</Text>
              <Text style={styles.liquidationTotalValue}>Q{totalAmountLiquidations.toFixed(2)}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Acciones Rápidas */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={styles.quickActionButton}
            onPress={() => router.push('/add-expense')}
          >
            <Ionicons name="add-circle" size={24} color="#2563eb" />
            <Text style={styles.quickActionText}>Nuevo Gasto</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.quickActionButton}
            onPress={() => router.push('/(tabs)/expenses')}
          >
            <Ionicons name="receipt" size={24} color="#059669" />
            <Text style={styles.quickActionText}>Ver Gastos</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.quickActionButton}
            onPress={() => router.push('/(tabs)/liquidations')}
          >
            <Ionicons name="folder" size={24} color="#a855f7" />
            <Text style={styles.quickActionText}>Liquidaciones</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f8fafc',
  },
  contentContainer: {
    paddingBottom: 20,
  },
  centered: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  greeting: { 
    fontSize: 24, 
    fontWeight: '700', 
    color: '#1e293b',
    marginBottom: 4,
  },
  roleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  roleText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  roleTextManager: {
    color: '#2563eb',
    fontWeight: '600',
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  
  // Secciones
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#1e293b',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  
  // Resumen General
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 20,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  amountDetails: {
    flex: 1,
  },
  amountLabel: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '500',
  },
  amountValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#059669',
    marginTop: 2,
  },
  
  // Stats Grid (Gastos)
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statCardDraft: {
    backgroundColor: '#fafafa',
  },
  statCardPending: {
    backgroundColor: '#fffbeb',
  },
  statCardApproved: {
    backgroundColor: '#f0fdf4',
  },
  statCardRejected: {
    backgroundColor: '#fef2f2',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },
  
  // Alert Card
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
  },
  alertSubtitle: {
    fontSize: 12,
    color: '#3b82f6',
    marginTop: 2,
  },
  
  // Liquidation Stats
  liquidationStats: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  liquidationStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  liquidationStatIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liquidationStatInfo: {
    flex: 1,
  },
  liquidationStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  liquidationStatLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  liquidationTotalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#faf5ff',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e9d5ff',
    gap: 12,
  },
  liquidationTotalInfo: {
    flex: 1,
  },
  liquidationTotalLabel: {
    fontSize: 13,
    color: '#7c3aed',
    fontWeight: '500',
  },
  liquidationTotalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#7c3aed',
    marginTop: 2,
  },
  
  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
});