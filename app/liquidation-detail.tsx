import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Liquidation, getLiquidationStatusColor, getLiquidationStatusText, canSubmitLiquidation, canGenerateCSV } from '../models/Liquidation';
import { Expense } from '../models/Expense';
import { getLiquidationById, submitLiquidation, deleteLiquidation } from '../services/LiquidationService';
import { getExpenseById } from '../services/ExpenseService';
import * as AuthService from '../services/AuthService';
import { generateLiquidationCSV, generateDetailedLiquidationCSV } from '../services/ExportService';

export default function LiquidationDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [liquidation, setLiquidation] = useState<Liquidation | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');

  const liquidationId = params.liquidationId as string;

  useEffect(() => {
    loadLiquidationData();
  }, [liquidationId]);

  const loadLiquidationData = async () => {
    try {
      setIsLoading(true);
      console.log('📋 Cargando liquidación:', liquidationId);

      const user = await AuthService.getLastLoggedInUser();
      if (user) {
        setUserEmail(user.email);
      }

      // Cargar liquidación
      const liq = await getLiquidationById(liquidationId);
      if (!liq) {
        Alert.alert('Error', 'Liquidación no encontrada');
        router.back();
        return;
      }

      setLiquidation(liq);

      // Cargar gastos de la liquidación
      const loadedExpenses: Expense[] = [];
      for (const expenseId of liq.expenseIds) {
        const expense = await getExpenseById(expenseId, liq.userId);
        if (expense) {
          loadedExpenses.push(expense);
        }
      }

      setExpenses(loadedExpenses);
      console.log('✅ Liquidación cargada con', loadedExpenses.length, 'gastos');
    } catch (error) {
      console.error('❌ Error cargando liquidación:', error);
      Alert.alert('Error', 'No se pudo cargar la liquidación');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitToManager = async () => {
    if (!liquidation) return;

    Alert.alert(
      'Confirmar Envío',
      `¿Desea enviar esta liquidación al jefe por Q${liquidation.totalAmount.toFixed(2)}?\n\nUna vez enviada, no podrá modificarla.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          style: 'default',
          onPress: async () => {
            try {
              console.log('📤 Enviando liquidación al jefe...');
              await submitLiquidation(liquidation.id);
              Alert.alert('Éxito', 'Liquidación enviada al jefe para revisión');
              await loadLiquidationData(); // Recargar datos
            } catch (error) {
              console.error('❌ Error enviando liquidación:', error);
              Alert.alert('Error', 'No se pudo enviar la liquidación: ' + (error as Error).message);
            }
          }
        }
      ]
    );
  };

  const handleDeleteLiquidation = async () => {
    if (!liquidation) return;

    Alert.alert(
      'Confirmar Eliminación',
      '¿Está seguro de eliminar esta liquidación? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🗑️ Eliminando liquidación...');
              await deleteLiquidation(liquidation.id);
              Alert.alert('Éxito', 'Liquidación eliminada');
              router.back();
            } catch (error) {
              console.error('❌ Error eliminando liquidación:', error);
              Alert.alert('Error', 'No se pudo eliminar la liquidación: ' + (error as Error).message);
            }
          }
        }
      ]
    );
  };

  const handleDownloadCSV = async () => {
    if (!liquidation || expenses.length === 0) {
      Alert.alert('Error', 'No hay gastos para exportar');
      return;
    }

    // Mostrar opciones de exportación
    Alert.alert(
      'Exportar Liquidación',
      'Seleccione el formato de exportación:',
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'CSV Formato SAP',
          onPress: async () => {
            try {
              await generateLiquidationCSV(liquidation, expenses);
              Alert.alert(
                'Éxito',
                'Archivo CSV generado correctamente. Puede compartirlo por WhatsApp, email o guardarlo en su dispositivo.'
              );
            } catch (error) {
              console.error('Error exportando CSV:', error);
              Alert.alert(
                'Error',
                'No se pudo generar el archivo CSV. Por favor intente nuevamente.'
              );
            }
          }
        },
        {
          text: 'CSV Detallado',
          onPress: async () => {
            try {
              await generateDetailedLiquidationCSV(liquidation, expenses);
              Alert.alert(
                'Éxito',
                'Archivo CSV detallado generado correctamente. Incluye toda la información de la liquidación.'
              );
            } catch (error) {
              console.error('Error exportando CSV detallado:', error);
              Alert.alert(
                'Error',
                'No se pudo generar el archivo CSV detallado. Por favor intente nuevamente.'
              );
            }
          }
        }
      ],
      { cancelable: true }
    );
  };

  const renderExpenseItem = ({ item }: { item: Expense }) => (
    <View style={styles.expenseItem}>
      <View style={styles.expenseHeader}>
        <Text style={styles.expenseDescription}>{item.description}</Text>
        <Text style={styles.expenseAmount}>Q{item.amount.toFixed(2)}</Text>
      </View>
      <Text style={styles.expenseDetails}>{item.date} • {item.supplier}</Text>
      <Text style={styles.expenseDetails}>{item.category} • {item.department}</Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Cargando liquidación...</Text>
      </View>
    );
  }

  if (!liquidation) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={60} color="#ef4444" />
        <Text style={styles.errorText}>Liquidación no encontrada</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = getLiquidationStatusColor(liquidation.status);
  const statusText = getLiquidationStatusText(liquidation.status);
  const canSubmit = canSubmitLiquidation(liquidation.status);
  const canDownloadCSV = canGenerateCSV(liquidation.status);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalle de Liquidación</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Card de Resumen */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Liquidación #{liquidation.id.slice(-6)}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <Ionicons name="person-outline" size={20} color="#64748b" />
            <Text style={styles.summaryLabel}>Empleado:</Text>
            <Text style={styles.summaryValue}>{liquidation.employeeName}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Ionicons name="calendar-outline" size={20} color="#64748b" />
            <Text style={styles.summaryLabel}>Fecha Creación:</Text>
            <Text style={styles.summaryValue}>{liquidation.createdDate}</Text>
          </View>

          {liquidation.submittedDate && (
            <View style={styles.summaryRow}>
              <Ionicons name="send-outline" size={20} color="#64748b" />
              <Text style={styles.summaryLabel}>Fecha Envío:</Text>
              <Text style={styles.summaryValue}>{liquidation.submittedDate}</Text>
            </View>
          )}

          {liquidation.approvedDate && (
            <View style={styles.summaryRow}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#64748b" />
              <Text style={styles.summaryLabel}>Fecha Aprobación:</Text>
              <Text style={styles.summaryValue}>{liquidation.approvedDate}</Text>
            </View>
          )}

          {liquidation.rejectedDate && (
            <View style={styles.summaryRow}>
              <Ionicons name="close-circle-outline" size={20} color="#64748b" />
              <Text style={styles.summaryLabel}>Fecha Rechazo:</Text>
              <Text style={styles.summaryValue}>{liquidation.rejectedDate}</Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total:</Text>
            <Text style={styles.totalAmount}>Q{liquidation.totalAmount.toFixed(2)}</Text>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Gastos Incluidos:</Text>
            <Text style={styles.totalCount}>{expenses.length}</Text>
          </View>
        </View>

        {/* Comentarios del Manager */}
        {liquidation.managerComments && (
          <View style={styles.commentsCard}>
            <View style={styles.commentsHeader}>
              <Ionicons name="chatbox-outline" size={20} color="#2563eb" />
              <Text style={styles.commentsTitle}>Comentarios del Jefe</Text>
            </View>
            <Text style={styles.commentsText}>{liquidation.managerComments}</Text>
          </View>
        )}

        {/* Lista de Gastos */}
        <View style={styles.expensesCard}>
          <Text style={styles.expensesTitle}>Gastos Incluidos ({expenses.length})</Text>
          <FlatList
            data={expenses}
            renderItem={renderExpenseItem}
            keyExtractor={item => item.id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>

        {/* Botones de Acción */}
        <View style={styles.actionsCard}>
          {canSubmit && (
            <TouchableOpacity 
              style={styles.submitButton}
              onPress={handleSubmitToManager}
            >
              <Ionicons name="send" size={20} color="white" />
              <Text style={styles.submitButtonText}>Enviar al Jefe</Text>
            </TouchableOpacity>
          )}

          {canDownloadCSV && (
            <TouchableOpacity 
              style={styles.downloadButton}
              onPress={handleDownloadCSV}
            >
              <Ionicons name="download-outline" size={20} color="white" />
              <Text style={styles.downloadButtonText}>Descargar CSV</Text>
            </TouchableOpacity>
          )}

          {liquidation.status === 'draft' && (
            <TouchableOpacity 
              style={styles.deleteButton}
              onPress={handleDeleteLiquidation}
            >
              <Ionicons name="trash-outline" size={20} color="white" />
              <Text style={styles.deleteButtonText}>Eliminar Liquidación</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#ef4444',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  content: {
    flex: 1,
  },
  summaryCard: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#059669',
  },
  totalCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  commentsCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  commentsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  commentsText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  expensesCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  expensesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
  },
  expenseItem: {
    paddingVertical: 12,
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  expenseDescription: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
  expenseDetails: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 4,
  },
  actionsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  submitButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  downloadButton: {
    flexDirection: 'row',
    backgroundColor: '#059669',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  downloadButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteButton: {
    flexDirection: 'row',
    backgroundColor: '#ef4444',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
