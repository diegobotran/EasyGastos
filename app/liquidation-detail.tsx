import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Liquidation, getLiquidationStatusColor, getLiquidationStatusText, canSubmitLiquidation, canGenerateCSV, canEditLiquidation } from '../models/Liquidation';
import { Expense } from '../models/Expense';
import { getLiquidationById, deleteLiquidation, removeExpenseFromLiquidation, addExpenseToLiquidation, insertLiquidationFromBackend, updateLiquidationSAPSyncDataFromServer } from '../services/LiquidationService';
import { getExpenseById, updateExpenseStatusesFromServer } from '../services/ExpenseService';
import { BackendSyncService } from '../services/BackendSyncService';
import * as AuthService from '../services/AuthService';
import { generateLiquidationCSV, generateDetailedLiquidationCSV } from '../services/ExportService';
import { formatDateToSpanish } from '../utils/dateUtils';

export default function LiquidationDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [liquidation, setLiquidation] = useState<Liquidation | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [availableExpenses, setAvailableExpenses] = useState<Expense[]>([]);
  const [employeeComments, setEmployeeComments] = useState('');
  const [showSapPreviewModal, setShowSapPreviewModal] = useState(false);
  const [sapPreviewJson, setSapPreviewJson] = useState('');
  const [sapPreviewError, setSapPreviewError] = useState('');
  const [sapPreviewData, setSapPreviewData] = useState<any | null>(null);
  const [isLoadingSapPreview, setIsLoadingSapPreview] = useState(false);
  const [isSendingToSAP, setIsSendingToSAP] = useState(false);

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
      const liq = await getLiquidationById(liquidationId, user?.email || '');
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
      
      // Si la liquidación puede editarse, cargar gastos disponibles
      if (canEditLiquidation(liq.status)) {
        await loadAvailableExpenses(user?.email || '', liq.expenseIds, liq.sociedad || '', liq.currency || '');
      }
    } catch (error) {
      console.error('❌ Error cargando liquidación:', error);
      Alert.alert('Error', 'No se pudo cargar la liquidación');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAvailableExpenses = async (userEmail: string, excludeIds: string[], liquidationSociedad: string, liquidationCurrency: string) => {
    try {
      const { getExpenses } = require('../services/ExpenseService');
      const allExpenses = await getExpenses(userEmail);
      
      // Filtrar solo gastos disponibles (draft) y que no estén ya en la liquidación
      const available = allExpenses.filter((exp: Expense) => 
        exp.expenseStatus === 'draft' &&
        exp.satStatus === 'VALIDADO_SAT' &&
        exp.sociedad === liquidationSociedad &&
        exp.currency === liquidationCurrency &&
        !excludeIds.includes(exp.id)
      );
      
      setAvailableExpenses(available);
      console.log('✅ Gastos disponibles para agregar:', available.length);
    } catch (error) {
      console.error('❌ Error cargando gastos disponibles:', error);
    }
  };

  const resolveBackendToken = async (): Promise<string> => {
    let token = await AuthService.getToken();
    if (token) {
      return token;
    }

    const user = await AuthService.getLastLoggedInUser();
    const pin = await AuthService.getPIN();

    if (!user?.email || !pin) {
      throw new Error('No se encontró una sesión activa para operar con el backend');
    }

    const loginResult = await BackendSyncService.loginAndGetToken(user.email, pin);
    if (!loginResult.success || !loginResult.token) {
      throw new Error(loginResult.error || 'No se pudo reautenticar la sesión con el backend');
    }

    await AuthService.saveJWTToken(loginResult.token);
    return loginResult.token;
  };

  const getSapSyncPresentation = (sapSyncStatus?: string | null) => {
    switch (sapSyncStatus) {
      case 'SYNCED':
        return {
          title: 'Contabilizada en SAP',
          color: '#0f766e',
          backgroundColor: '#ccfbf1',
          icon: 'cloud-done-outline' as const,
        };
      case 'ERROR':
        return {
          title: 'Error de envío SAP',
          color: '#b91c1c',
          backgroundColor: '#fee2e2',
          icon: 'alert-circle-outline' as const,
        };
      default:
        return {
          title: 'Pendiente de envío SAP',
          color: '#7c3aed',
          backgroundColor: '#ede9fe',
          icon: 'cloud-upload-outline' as const,
        };
    }
  };

  const fetchSapPreviewData = async (liquidationId: string) => {
    const token = await resolveBackendToken();
    const { url: backendUrl } = await BackendSyncService.getBackendConfig();
    const requestUrl = `${backendUrl}/api/liquidations/${liquidationId}/sap-payload-preview`;

    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const responseText = await response.text();
    const parsedPayload = responseText ? JSON.parse(responseText) : null;

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          parsedPayload?.error === 'Liquidaci?n no encontrada'
            ? 'La liquidaci?n no existe en el backend para construir el preview SAP'
            : `El backend no expone el endpoint de preview SAP (${requestUrl})`
        );
      }

      throw new Error(parsedPayload?.error || 'No se pudo obtener el preview SAP');
    }

    return parsedPayload;
  };

  const buildMissingFieldsMessage = (previewData: any) => {
    const summary = previewData?.summary;
    const missingRequired = Array.isArray(summary?.missingRequired) ? summary.missingRequired : [];
    const missingOptional = Array.isArray(summary?.missingOptional) ? summary.missingOptional : [];
    const emptyByDesign = Array.isArray(summary?.emptyByDesign) ? summary.emptyByDesign : [];

    const requiredLines = missingRequired.map((field: any) =>
      `- ${field.section === 'expense' ? `Gasto ${field.expenseId}: ` : ''}${field.label}`
    );
    const optionalLines = missingOptional.map((field: any) =>
      `- ${field.section === 'expense' ? `Gasto ${field.expenseId}: ` : ''}${field.label}`
    );

    const parts = [
      `Total: ${liquidation?.currency || 'GTQ'} ${liquidation?.totalAmount.toFixed(2)}`,
      `Gastos: ${expenses.length}`,
    ];

    if (requiredLines.length > 0) {
      parts.push(`\nFaltan campos requeridos:\n${requiredLines.join('\n')}`);
    }

    if (optionalLines.length > 0) {
      parts.push(`\nCampos opcionales sin valor:\n${optionalLines.join('\n')}`);
    }

    if (emptyByDesign.length > 0) {
      parts.push(`\nCampos vac?os por dise?o: ${emptyByDesign.map((field: any) => field.field).filter((value: string, index: number, self: string[]) => self.indexOf(value) === index).join(', ' )}`);
    }

    if (requiredLines.length > 0 || optionalLines.length > 0) {
      parts.push('\n?Desea enviarla de todos modos a SAP?');
    } else {
      parts.push('\nEl payload SAP qued? completo. ?Desea enviarlo?');
    }

    return parts.join('\n');
  };

  const executeSendToSAP = async () => {
    if (!liquidation) {
      return;
    }

    try {
      setIsSendingToSAP(true);

      const isConnected = await BackendSyncService.checkConnection();
      if (!isConnected) {
        throw new Error('El env?o a SAP requiere conexi?n activa con el backend');
      }

      const token = await resolveBackendToken();
      const { url: backendUrl } = await BackendSyncService.getBackendConfig();
      const requestUrl = `${backendUrl}/api/liquidations/${liquidation.id}/send-to-sap`;

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const responseText = await response.text();
      const parsed = responseText ? JSON.parse(responseText) : null;

      if (parsed?.liquidation) {
        await insertLiquidationFromBackend(parsed.liquidation);
        await updateLiquidationSAPSyncDataFromServer(parsed.liquidation.id, {
          sapDocNumber: parsed.liquidation.sapDocNumber,
          sapSyncStatus: parsed.liquidation.sapSyncStatus,
          sapReferenceId: parsed.liquidation.sapReferenceId,
          sapResponseMessage: parsed.liquidation.sapResponseMessage,
          sapSyncedAt: parsed.liquidation.sapSyncedAt,
        });
      }

      if (response.ok) {
        await updateExpenseStatusesFromServer(liquidation.expenseIds, 'CONTABILIZADO');
        await loadLiquidationData();

        Alert.alert(
          'Enviado a SAP',
          `La liquidaci?n fue contabilizada correctamente.\n\nDocumento SAP: ${parsed?.sapResult?.sapDocNumber || 'N/A'}\nReferencia: ${parsed?.sapResult?.sapReferenceId || 'N/A'}`
        );
        return;
      }

      if (response.status === 422) {
        if (parsed?.code === 'LIQUIDATION_FISCAL_BLOCKED') {
          await loadLiquidationData();
          const expired = Array.isArray(parsed?.details?.expenses) ? parsed.details.expenses : [];
          const expenseLines = expired.map((expense: any) =>
            `• ${expense.description || expense.id} (${expense.elapsedDays} de ${expense.allowedDays} días)`
          );
          throw new Error(
            `La liquidación fue bloqueada antes de contactar SAP. Gastos vencidos:\n${expenseLines.join('\n')}`
          );
        }
        await updateExpenseStatusesFromServer(liquidation.expenseIds, 'ERROR_SAP');
        await loadLiquidationData();
        throw new Error(parsed?.sapResult?.sapResponseMessage || parsed?.error || 'SAP devolvi? errores al contabilizar la liquidaci?n');
      }

      throw new Error(parsed?.error || 'No se pudo enviar la liquidaci?n a SAP');
    } catch (error) {
      console.error('? Error enviando liquidaci?n a SAP:', error);
      Alert.alert('Error SAP', (error as Error).message || 'No se pudo enviar la liquidaci?n a SAP');
    } finally {
      setIsSendingToSAP(false);
    }
  };

  const handleReturnToDraft = async () => {
    if (!liquidation) return;
    Alert.alert(
      'Volver a borrador',
      'Se eliminará la aprobación anterior. Podrá retirar los gastos vencidos y deberá enviar la liquidación a aprobación nuevamente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Volver a borrador',
          onPress: async () => {
            try {
              const token = await resolveBackendToken();
              const { url: backendUrl } = await BackendSyncService.getBackendConfig();
              const response = await fetch(`${backendUrl}/api/liquidations/${liquidation.id}/return-to-draft`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}` }
              });
              const responseText = await response.text();
              const parsed = responseText ? JSON.parse(responseText) : null;
              if (!response.ok) throw new Error(parsed?.error || 'No se pudo volver a borrador');
              await insertLiquidationFromBackend(parsed);
              await loadLiquidationData();
            } catch (error) {
              Alert.alert('Error', (error as Error).message);
            }
          }
        }
      ]
    );
  };

  const handleSendToSAP = async () => {
    if (!liquidation) {
      return;
    }

    try {
      const previewData = await fetchSapPreviewData(liquidation.id);
      const confirmationMessage = buildMissingFieldsMessage(previewData);

      Alert.alert(
        'Enviar a SAP',
        confirmationMessage,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: liquidation.sapSyncStatus === 'ERROR' ? 'Reintentar' : 'Enviar',
            onPress: () => {
              void executeSendToSAP();
            }
          }
        ]
      );
    } catch (error) {
      console.error('? Error preparando env?o SAP:', error);
      Alert.alert('Error SAP', (error as Error).message || 'No se pudo preparar el env?o a SAP');
    }
  };

  const handleSubmitToManager = async () => {
    if (!liquidation) return;

    // Preparar mensaje con las notas del empleado si existen
    let alertMessage = `¿Desea enviar esta liquidación al jefe?

Total: Q${liquidation.totalAmount.toFixed(2)}
Gastos: ${expenses.length}`;
    
    if (employeeComments.trim()) {
      alertMessage += `\n\nNotas incluidas: "${employeeComments.trim().substring(0, 50)}${employeeComments.length > 50 ? '...' : ''}"'`;
    }
    
    if (liquidation.status === 'draft') {
      alertMessage += '\n\nUna vez enviada, no podrá modificarla hasta que el jefe la revise.';
    } else if (liquidation.status === 'rejected') {
      alertMessage += '\n\nSe reenviará la liquidación corregida al jefe.';
    }

    Alert.alert(
      'Enviar al Jefe',
      alertMessage,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          style: 'default',
          onPress: async () => {
            try {
              console.log('📤 LiquidationDetail: Enviando liquidación al jefe...');
              
              // Guardar las notas del empleado si existen (por ahora en el campo comments)
              if (employeeComments.trim()) {
                // TODO: Agregar campo employeeComments en el modelo Liquidation
                console.log('📝 Notas del empleado:', employeeComments);
              }
              
              const isConnected = await BackendSyncService.checkConnection();
              if (!isConnected) {
                throw new Error('El envío a aprobación requiere conexión activa con el backend');
              }

              const token = await resolveBackendToken();
              const expenseSyncResult = await BackendSyncService.syncExpenses(
                userEmail,
                token,
                liquidation.expenseIds
              );
              if (!expenseSyncResult.success) {
                throw new Error(
                  expenseSyncResult.error ||
                    'No se pudieron sincronizar los gastos antes de enviar la liquidación a aprobación'
                );
              }

              const syncResult = await BackendSyncService.syncLiquidations(userEmail, token);
              if (!syncResult.success) {
                throw new Error(syncResult.error || 'No se pudo sincronizar la liquidación antes de enviarla a aprobación');
              }

              const { url: backendUrl } = await BackendSyncService.getBackendConfig();
              const requestUrl = `${backendUrl}/api/liquidations/${liquidation.id}/submit`;
              const response = await fetch(requestUrl, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
              });

              const responseText = await response.text();
              const parsed = responseText ? JSON.parse(responseText) : null;

              if (!response.ok) {
                const affected = Array.isArray(parsed?.details?.expenses) ? parsed.details.expenses : [];
                const detail = affected.length
                  ? `\n\nGastos que requieren atención:\n${affected.map((expense: any) => `• ${expense.description || expense.id}${typeof expense.elapsedDays === 'number' ? ` (${expense.elapsedDays} de ${expense.allowedDays} días)` : ''}`).join('\n')}`
                  : '';
                throw new Error((parsed?.error || 'No se pudo enviar la liquidación al jefe') + detail);
              }

              await insertLiquidationFromBackend(parsed);

              const successMessage = liquidation.status === 'rejected'
                ? 'La liquidación corregida fue reenviada correctamente al jefe.'
                : 'La liquidación fue enviada correctamente al jefe.';

              Alert.alert(
                'Enviado correctamente',
                successMessage,
                [{ text: 'OK', onPress: () => {
                  setEmployeeComments('');
                  loadLiquidationData();
                }}]
              );
              
            } catch (error) {
              console.error('❌ LiquidationDetail: Error enviando liquidación:', error);
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
              await deleteLiquidation(liquidation.id, userEmail);
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

  const handleRemoveExpense = async (expenseId: string) => {
    if (!liquidation) return;

    const expense = expenses.find(e => e.id === expenseId);
    if (!expense) return;

    // Cambiar mensaje según si es rechazada o borrador
    const actionTitle = liquidation.status === 'rejected' ? 'Anular Gasto Rechazado' : 'Quitar Gasto';
    const actionMessage = liquidation.status === 'rejected' 
      ? `¿Desea anular este gasto de la liquidación rechazada?\n\nGasto: ${expense.description}\nMonto: Q${expense.amount.toFixed(2)}\n\nEl gasto volverá a estado "Borrador" para que pueda corregirlo o incluirlo en otra liquidación.`
      : `¿Desea quitar este gasto de la liquidación?\n\nGasto: ${expense.description}\nMonto: Q${expense.amount.toFixed(2)}\n\nEl gasto volverá a estado "Borrador" y podrá incluirse en otra liquidación.`;

    Alert.alert(
      actionTitle,
      actionMessage,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: liquidation.status === 'rejected' ? 'Anular' : 'Quitar',
          style: 'destructive',
          onPress: async () => {
            try {
              const actionLog = liquidation.status === 'rejected' ? 'Anulando' : 'Quitando';
              console.log(`🗑️ ${actionLog} gasto de liquidación...`);
              await removeExpenseFromLiquidation(liquidation.id, expenseId, userEmail);
              const successMsg = liquidation.status === 'rejected' 
                ? 'Gasto anulado. Ahora puede corregirlo o incluirlo en otra liquidación.' 
                : 'Gasto quitado de la liquidación';
              Alert.alert('Éxito', successMsg);
              await loadLiquidationData();
            } catch (error) {
              console.error('❌ Error quitando gasto:', error);
              Alert.alert('Error', 'No se pudo quitar el gasto: ' + (error as Error).message);
            }
          }
        }
      ]
    );
  };

  const handleAddExpense = async (expenseId: string) => {
    if (!liquidation) return;

    try {
      console.log('🔍 Validando gasto antes de agregar...');
      
      // Validar que el gasto pueda agregarse
      const { validateExpenseForLiquidation } = require('../services/ExpenseService');
      const validation = await validateExpenseForLiquidation(expenseId, userEmail, liquidation.id);
      
      if (!validation.valid) {
        Alert.alert('No se puede agregar', validation.error || 'El gasto no puede agregarse a esta liquidación');
        return;
      }
      
      console.log('➕ Agregando gasto a liquidación...');
      await addExpenseToLiquidation(liquidation.id, expenseId, userEmail);
      Alert.alert('Éxito', 'Gasto agregado a la liquidación');
      setShowAddExpenseModal(false);
      await loadLiquidationData();
    } catch (error) {
      console.error('❌ Error agregando gasto:', error);
      Alert.alert('Error', 'No se pudo agregar el gasto: ' + (error as Error).message);
    }
  };

  const handleViewExpenseDetail = (expense: Expense) => {
    router.push({ 
      pathname: '../expense-detail', 
      params: { expense: JSON.stringify(expense) } 
    });
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

  const handleViewSapPreview = async () => {
    if (!liquidation) {
      return;
    }

    try {
      setIsLoadingSapPreview(true);
      setSapPreviewError('');
      setSapPreviewJson('');
      setSapPreviewData(null);
      setShowSapPreviewModal(true);

      const previewData = await fetchSapPreviewData(liquidation.id);
      setSapPreviewData(previewData);
      setSapPreviewJson(JSON.stringify(previewData?.payload || {}, null, 2));
    } catch (error) {
      console.error('? Error obteniendo preview SAP:', error);
      setSapPreviewError((error as Error).message || 'Error desconocido obteniendo preview SAP');
    } finally {
      setIsLoadingSapPreview(false);
    }
  };

  const renderExpenseItem = ({ item }: { item: Expense }) => {
    const canEdit = liquidation && canEditLiquidation(liquidation.status);
    const shortDescription = item.description.length > 60 
      ? item.description.substring(0, 60) + '...' 
      : item.description;

    return (
      <View style={styles.expenseItem}>
        <View style={styles.expenseRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.expenseDescription} numberOfLines={2}>
              {shortDescription}
            </Text>
            <View style={styles.expenseMetadata}>
              <View style={styles.metadataItem}>
                <Ionicons name="calendar-outline" size={14} color="#64748b" />
                <Text style={styles.metadataText}>{formatDateToSpanish(item.date)}</Text>
              </View>
              <View style={styles.metadataItem}>
                <Ionicons name="pricetag-outline" size={14} color="#64748b" />
                <Text style={styles.metadataText}>{item.category}</Text>
              </View>
              <View style={styles.metadataItem}>
                <Ionicons name="business-outline" size={14} color="#64748b" />
                <Text style={styles.metadataText}>{item.department}</Text>
              </View>
            </View>
          </View>
          <View style={styles.expenseActions}>
            <Text style={styles.expenseAmount}>Q{item.amount.toFixed(2)}</Text>
            <View style={styles.expenseButtons}>
              <TouchableOpacity 
                style={styles.viewButton}
                onPress={() => handleViewExpenseDetail(item)}
              >
                <Ionicons name="eye-outline" size={18} color="#2563eb" />
              </TouchableOpacity>
              {canEdit && (
                <TouchableOpacity 
                  style={styles.removeButton}
                  onPress={() => handleRemoveExpense(item.id)}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
                  <Text style={styles.removeButtonText}>
                    {liquidation.status === 'rejected' ? 'Anular' : 'Quitar'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderAvailableExpenseItem = ({ item }: { item: Expense }) => {
    const shortDescription = item.description.length > 50 
      ? item.description.substring(0, 50) + '...' 
      : item.description;

    return (
      <TouchableOpacity 
        style={styles.availableExpenseItem}
        onPress={() => handleAddExpense(item.id)}
      >
        <View style={styles.availableExpenseContent}>
          <Text style={styles.availableExpenseDescription} numberOfLines={2}>
            {shortDescription}
          </Text>
          <View style={styles.availableExpenseMetadata}>
            <Text style={styles.availableExpenseDetail}>{formatDateToSpanish(item.date)}</Text>
            <Text style={styles.availableExpenseDetail}>•</Text>
            <Text style={styles.availableExpenseDetail}>{item.category}</Text>
          </View>
        </View>
        <View style={styles.availableExpenseRight}>
          <Text style={styles.availableExpenseAmount}>Q{item.amount.toFixed(2)}</Text>
          <Ionicons name="add-circle" size={24} color="#2563eb" />
        </View>
      </TouchableOpacity>
    );
  };

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
  const canSendToSAP = liquidation.status === 'approved' && liquidation.sapSyncStatus !== 'SYNCED';
  const sapSyncPresentation = getSapSyncPresentation(liquidation.sapSyncStatus);

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
            <View>
              <Text style={styles.summaryTitle}>Liquidación #{liquidation.id.slice(-6)}</Text>
              <Text style={styles.createdTimestamp}>
                Creada: {new Date(parseInt(liquidation.id)).toLocaleString('es-GT', { 
                  day: '2-digit', 
                  month: '2-digit', 
                  year: 'numeric',
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </Text>
            </View>
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
            <Ionicons name="business-outline" size={20} color="#64748b" />
            <Text style={styles.summaryLabel}>Sociedad:</Text>
            <Text style={styles.summaryValue}>{liquidation.sociedad || 'N/A'}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Ionicons name="calendar-outline" size={20} color="#64748b" />
            <Text style={styles.summaryLabel}>Fecha Creación:</Text>
            <Text style={styles.summaryValue}>{formatDateToSpanish(liquidation.createdDate)}</Text>
          </View>

          {liquidation.submittedDate && (
            <View style={styles.summaryRow}>
              <Ionicons name="send-outline" size={20} color="#64748b" />
              <Text style={styles.summaryLabel}>Fecha Envío:</Text>
              <Text style={styles.summaryValue}>{formatDateToSpanish(liquidation.submittedDate)}</Text>
            </View>
          )}

          {liquidation.approvedDate && (
            <View style={styles.summaryRow}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#64748b" />
              <Text style={styles.summaryLabel}>Fecha Aprobación:</Text>
              <Text style={styles.summaryValue}>{formatDateToSpanish(liquidation.approvedDate)}</Text>
            </View>
          )}

          {liquidation.rejectedDate && (
            <View style={styles.summaryRow}>
              <Ionicons name="close-circle-outline" size={20} color="#64748b" />
              <Text style={styles.summaryLabel}>Fecha Rechazo:</Text>
              <Text style={styles.summaryValue}>{formatDateToSpanish(liquidation.rejectedDate)}</Text>
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

        {/* Banner de liquidación rechazada */}
        {liquidation.status === 'rejected' && (
          <View style={styles.rejectedBanner}>
            <View style={styles.rejectedHeader}>
              <Ionicons name="alert-circle" size={24} color="#dc2626" />
              <Text style={styles.rejectedTitle}>Liquidación Rechazada</Text>
            </View>
            <Text style={styles.rejectedText}>
              Esta liquidación fue rechazada por el jefe. Puede revisar los comentarios, modificar los gastos y volver a enviarla.
            </Text>
            <View style={styles.rejectedActions}>
              <View style={styles.rejectedActionItem}>
                <Ionicons name="eye-outline" size={16} color="#475569" />
                <Text style={styles.rejectedActionText}>Toque un gasto para ver detalles y editarlo</Text>
              </View>
              <View style={styles.rejectedActionItem}>
                <Ionicons name="close-circle-outline" size={16} color="#475569" />
                <Text style={styles.rejectedActionText}>Use el botón (×) para quitar gastos</Text>
              </View>
              <View style={styles.rejectedActionItem}>
                <Ionicons name="add-circle-outline" size={16} color="#475569" />
                <Text style={styles.rejectedActionText}>Agregue nuevos gastos si es necesario</Text>
              </View>
            </View>
          </View>
        )}

        {/* Banner de liquidación en revisión */}
        {liquidation.status === 'submitted' && (
          <View style={styles.submittedBanner}>
            <View style={styles.submittedHeader}>
              <Ionicons name="time-outline" size={24} color="#2563eb" />
              <Text style={styles.submittedTitle}>En Revisión</Text>
            </View>
            <Text style={styles.submittedText}>
              Esta liquidación fue enviada al jefe y está en proceso de revisión. No se puede modificar hasta que sea aprobada o rechazada.
            </Text>
            <View style={styles.submittedInfo}>
              <Text style={styles.submittedInfoText}>
                ℹ️ Los cambios en el estado se sincronizarán automáticamente cuando su jefe tome una decisión.
              </Text>
            </View>
          </View>
        )}

        {/* Banner de liquidación aprobada */}
        {liquidation.status === 'approved' && (
          <View style={styles.approvedBanner}>
            <View style={styles.approvedHeader}>
              <Ionicons name="checkmark-circle" size={28} color="#059669" />
              <Text style={styles.approvedTitle}>¡Liquidación Aprobada!</Text>
            </View>
            <Text style={styles.approvedText}>
              Esta liquidación fue aprobada por el jefe. Ya puede generar el archivo CSV para procesar los gastos.
            </Text>
            <View style={styles.approvedActions}>
              <View style={styles.approvedActionItem}>
                <Ionicons name="document-text" size={16} color="#059669" />
                  <Text style={styles.approvedActionText}>Use el botón &quot;Descargar CSV&quot; para exportar</Text>
              </View>
              <View style={styles.approvedActionItem}>
                <Ionicons name="lock-closed" size={16} color="#059669" />
                <Text style={styles.approvedActionText}>Esta liquidación ya no puede modificarse</Text>
              </View>
            </View>
          </View>
        )}

        {liquidation.status === 'fiscal_blocked' && (
          <View style={styles.rejectedBanner}>
            <View style={styles.rejectedHeader}>
              <Ionicons name="alert-circle" size={24} color="#b91c1c" />
              <Text style={styles.rejectedTitle}>Bloqueada por vigencia fiscal</Text>
            </View>
            <Text style={styles.rejectedText}>
              No se contactó SAP. Retire los gastos vencidos y envíe la liquidación nuevamente a aprobación.
            </Text>
            {(liquidation.fiscalBlockedExpenses || []).map(expense => (
              <Text key={expense.id} style={styles.rejectedActionText}>
                • {expense.description || expense.id}: {expense.elapsedDays} de {expense.allowedDays} días
              </Text>
            ))}
          </View>
        )}

        {(liquidation.status === 'approved' || liquidation.sapSyncStatus || liquidation.sapDocNumber || liquidation.sapResponseMessage) && (
          <View style={styles.sapStatusCard}>
            <View style={styles.sapStatusHeader}>
              <View style={[styles.sapStatusBadge, { backgroundColor: sapSyncPresentation.backgroundColor }]}>
                <Ionicons name={sapSyncPresentation.icon} size={16} color={sapSyncPresentation.color} />
                <Text style={[styles.sapStatusBadgeText, { color: sapSyncPresentation.color }]}>
                  {sapSyncPresentation.title}
                </Text>
              </View>
            </View>

            <View style={styles.sapStatusRows}>
              <View style={styles.summaryRow}>
                <Ionicons name="swap-horizontal-outline" size={18} color="#64748b" />
                <Text style={styles.summaryLabel}>Estado SAP:</Text>
                <Text style={styles.summaryValue}>{liquidation.sapSyncStatus || 'PENDING'}</Text>
              </View>

              <View style={styles.summaryRow}>
                <Ionicons name="document-text-outline" size={18} color="#64748b" />
                <Text style={styles.summaryLabel}>Documento SAP:</Text>
                <Text style={styles.summaryValue}>{liquidation.sapDocNumber || 'Pendiente'}</Text>
              </View>

              <View style={styles.summaryRow}>
                <Ionicons name="pricetag-outline" size={18} color="#64748b" />
                <Text style={styles.summaryLabel}>Referencia SAP:</Text>
                <Text style={styles.summaryValue}>{liquidation.sapReferenceId || 'Pendiente'}</Text>
              </View>

              <View style={styles.summaryRow}>
                <Ionicons name="time-outline" size={18} color="#64748b" />
                <Text style={styles.summaryLabel}>Último envío:</Text>
                <Text style={styles.summaryValue}>
                  {liquidation.sapSyncedAt ? liquidation.sapSyncedAt.replace('T', ' ').slice(0, 19) : 'No enviado'}
                </Text>
              </View>
            </View>

            <View style={styles.sapResponseBox}>
              <Text style={styles.sapResponseLabel}>Respuesta SAP</Text>
              <Text style={styles.sapResponseText}>{liquidation.sapResponseMessage || 'Sin respuesta registrada todavía.'}</Text>
            </View>
          </View>
        )}

        {/* Comentarios del Manager */}
        {liquidation.managerComments && (
          <View style={styles.commentsCard}>
            <View style={styles.commentsHeader}>
              <Ionicons name="chatbox-outline" size={20} color="#f59e0b" />
              <Text style={styles.commentsTitle}>Comentarios del Jefe</Text>
            </View>
            <Text style={styles.commentsText}>{liquidation.managerComments}</Text>
          </View>
        )}

        {/* Campo de comentarios para el empleado (solo en liquidaciones rechazadas) */}
        {liquidation.status === 'rejected' && (
          <View style={styles.commentsCard}>
            <View style={styles.commentsHeader}>
              <Ionicons name="create-outline" size={20} color="#2563eb" />
              <Text style={styles.commentsTitle}>Notas para el Jefe (Opcional)</Text>
            </View>
            <Text style={styles.commentsHint}>Agregue comentarios explicando las correcciones realizadas:</Text>
            <TextInput
              style={styles.commentsInput}
              placeholder="Ej: He corregido los montos según sus observaciones..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={4}
              value={employeeComments}
              onChangeText={setEmployeeComments}
              textAlignVertical="top"
            />
          </View>
        )}

        {/* Lista de Gastos */}
        <View style={styles.expensesCard}>
          <View style={styles.expensesHeader}>
            <Text style={styles.expensesTitle}>Gastos Incluidos ({expenses.length})</Text>
            {canEditLiquidation(liquidation.status) && availableExpenses.length > 0 && (
              <TouchableOpacity 
                style={styles.addExpenseButton}
                onPress={() => setShowAddExpenseModal(true)}
              >
                <Ionicons name="add-circle" size={20} color="#2563eb" />
                <Text style={styles.addExpenseButtonText}>Agregar</Text>
              </TouchableOpacity>
            )}
          </View>
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

          {liquidation.status === 'fiscal_blocked' && (
            <TouchableOpacity style={styles.submitButton} onPress={handleReturnToDraft}>
              <Ionicons name="return-down-back" size={20} color="white" />
              <Text style={styles.submitButtonText}>Volver a borrador</Text>
            </TouchableOpacity>
          )}

          {canSendToSAP && (
            <TouchableOpacity
              style={styles.sapSendButton}
              onPress={handleSendToSAP}
              disabled={isSendingToSAP}
            >
              <Ionicons name={isSendingToSAP ? "hourglass-outline" : "cloud-upload-outline"} size={20} color="white" />
              <Text style={styles.sapSendButtonText}>
                {isSendingToSAP
                  ? 'Enviando a SAP...'
                  : liquidation.sapSyncStatus === 'ERROR'
                    ? 'Reintentar envío SAP'
                    : 'Enviar a SAP'}
              </Text>
            </TouchableOpacity>
          )}

          {liquidation.status === 'approved' && (
            <TouchableOpacity 
              style={styles.previewButton}
              onPress={handleViewSapPreview}
            >
              <Ionicons name="code-slash-outline" size={20} color="white" />
              <Text style={styles.previewButtonText}>Ver Preview SAP</Text>
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

      {/* Modal para agregar gastos */}
      <Modal
        visible={showSapPreviewModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSapPreviewModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Preview Payload SAP</Text>
              <TouchableOpacity onPress={() => setShowSapPreviewModal(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.sapPreviewContent}>
              {isLoadingSapPreview ? (
                <View style={styles.sapPreviewLoading}>
                  <ActivityIndicator size="large" color="#2563eb" />
                  <Text style={styles.sapPreviewLoadingText}>Construyendo preview SAP...</Text>
                </View>
              ) : sapPreviewError ? (
                <ScrollView style={styles.sapPreviewScroll} contentContainerStyle={styles.sapPreviewScrollContent}>
                  <View style={styles.sapPreviewErrorBox}>
                    <Text style={styles.sapPreviewErrorTitle}>Payload inválido</Text>
                    <Text style={styles.sapPreviewErrorText}>{sapPreviewError}</Text>
                  </View>
                </ScrollView>
              ) : (
                <ScrollView style={styles.sapPreviewScroll} contentContainerStyle={styles.sapPreviewScrollContent}>
                  {sapPreviewData?.summary && (
                    <View style={styles.sapSummaryCard}>
                      <Text style={styles.sapSummaryTitle}>Resumen de datos SAP</Text>
                      <Text style={styles.sapSummarySubtitle}>
                        Faltantes requeridos: {sapPreviewData.summary.missingRequired?.length || 0} | Opcionales: {sapPreviewData.summary.missingOptional?.length || 0}
                      </Text>

                      {Array.isArray(sapPreviewData.summary.missingRequired) && sapPreviewData.summary.missingRequired.length > 0 && (
                        <View style={styles.sapSummarySection}>
                          <Text style={styles.sapSummarySectionTitle}>Faltantes requeridos</Text>
                          {sapPreviewData.summary.missingRequired.map((field: any, index: number) => (
                            <Text key={`required-${index}`} style={styles.sapSummaryBullet}>
                              {'\u2022'} {field.section === 'expense' ? `Gasto ${field.expenseId}: ` : ''}{field.label}
                            </Text>
                          ))}
                        </View>
                      )}

                      {Array.isArray(sapPreviewData.summary.emptyByDesign) && sapPreviewData.summary.emptyByDesign.length > 0 && (
                        <View style={styles.sapSummarySection}>
                          <Text style={styles.sapSummarySectionTitle}>Vac?os por dise?o</Text>
                          <Text style={styles.sapSummaryBullet}>
                            {sapPreviewData.summary.emptyByDesign
                              .map((field: any) => field.field)
                              .filter((value: string, index: number, self: string[]) => self.indexOf(value) === index)
                              .join(', ')}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                  <Text style={styles.sapPreviewJson}>{sapPreviewJson}</Text>
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAddExpenseModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddExpenseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Agregar Gastos</Text>
              <TouchableOpacity onPress={() => setShowAddExpenseModal(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            {availableExpenses.length === 0 ? (
              <View style={styles.emptyModal}>
                <Ionicons name="folder-open-outline" size={60} color="#cbd5e1" />
                <Text style={styles.emptyModalTitle}>No hay gastos disponibles</Text>
                <Text style={styles.emptyModalText}>
                  Todos tus gastos en &quot;Borrador&quot; ya están incluidos en esta u otras liquidaciones.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.modalSubtitle}>
                  Seleccione un gasto para agregarlo a la liquidación
                </Text>
                <FlatList
                  data={availableExpenses}
                  renderItem={renderAvailableExpenseItem}
                  keyExtractor={item => item.id}
                  style={styles.availableExpensesList}
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                />
              </>
            )}
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
  createdTimestamp: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
    marginTop: 2,
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
    color: '#1e293b',
    lineHeight: 20,
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  commentsHint: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  commentsInput: {
    fontSize: 14,
    color: '#1e293b',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    maxHeight: 150,
  },
  sapStatusCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  sapStatusHeader: {
    marginBottom: 12,
  },
  sapStatusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  sapStatusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sapStatusRows: {
    gap: 8,
  },
  sapResponseBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  sapResponseLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  sapResponseText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
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
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  expenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  expenseDescription: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
    marginRight: 12,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
  },
  expenseMetadata: {
    flexDirection: 'row',
    gap: 16,
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metadataText: {
    fontSize: 12,
    color: '#64748b',
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
  sapSendButton: {
    flexDirection: 'row',
    backgroundColor: '#7c3aed',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sapSendButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  previewButton: {
    flexDirection: 'row',
    backgroundColor: '#7c3aed',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  previewButtonText: {
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
  // Estilos para banner de rechazo
  rejectedBanner: {
    backgroundColor: '#fef2f2',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fca5a5',
  },
  rejectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  rejectedTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#dc2626',
  },
  rejectedText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 12,
  },
  rejectedActions: {
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#fca5a5',
  },
  rejectedActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rejectedActionText: {
    fontSize: 13,
    color: '#475569',
    flex: 1,
  },
  // Estilos para banner de liquidación en revisión (submitted)
  submittedBanner: {
    backgroundColor: '#eff6ff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#93c5fd',
  },
  submittedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  submittedTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  submittedText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 12,
  },
  submittedInfo: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#93c5fd',
  },
  submittedInfoText: {
    fontSize: 13,
    color: '#475569',
    fontStyle: 'italic',
  },
  // Estilos para banner de liquidación aprobada
  approvedBanner: {
    backgroundColor: '#f0fdf4',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#86efac',
  },
  approvedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  approvedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#059669',
  },
  approvedText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 12,
  },
  approvedActions: {
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#86efac',
  },
  approvedActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  approvedActionText: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '500',
    flex: 1,
  },
  // Estilos para header de gastos con botón agregar
  expensesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addExpenseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
  },
  addExpenseButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  // Estilos para acciones de gastos
  expenseActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  expenseButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  viewButton: {
    padding: 4,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
  removeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ef4444',
  },
  // Estilos para modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 32,
  },
  sapPreviewContent: {
    minHeight: 320,
    maxHeight: '70%',
  },
  sapPreviewLoading: {
    flex: 1,
    minHeight: 320,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  sapPreviewLoadingText: {
    fontSize: 14,
    color: '#475569',
  },
  sapPreviewScroll: {
    flex: 1,
  },
  sapPreviewScrollContent: {
    padding: 20,
  },
  sapSummaryCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  sapSummaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  sapSummarySubtitle: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  sapSummarySection: {
    gap: 6,
  },
  sapSummarySectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  sapSummaryBullet: {
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
  },
  sapPreviewJson: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
    color: '#0f172a',
  },
  sapPreviewErrorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  sapPreviewErrorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#b91c1c',
  },
  sapPreviewErrorText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#7f1d1d',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  emptyModal: {
    padding: 40,
    alignItems: 'center',
  },
  emptyModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#475569',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyModalText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Estilos para lista de gastos disponibles
  availableExpensesList: {
    paddingHorizontal: 20,
  },
  availableExpenseItem: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  availableExpenseContent: {
    flex: 1,
    marginRight: 12,
  },
  availableExpenseDescription: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 6,
  },
  availableExpenseMetadata: {
    flexDirection: 'row',
    gap: 8,
  },
  availableExpenseDetail: {
    fontSize: 12,
    color: '#64748b',
  },
  availableExpenseRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  availableExpenseAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
});
