import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Expense, STATUSES, canVoidExpense, getExpenseStatusText } from '../models/Expense';
import { formatDateToSpanish, formatTimestampToSpanish } from '../utils/dateUtils';
import * as ExpenseService from '../services/ExpenseService';
import * as AuthService from '../services/AuthService';
import { BackendSyncService } from '../services/BackendSyncService';
import { buildSatValidationFingerprint } from '../services/ExpenseService';
import { SATValidationError, validarFacturaInternaSAT } from '../services/SATFacturaService';
import { ExpenseFiscalValidationError, validateExpenseFiscal } from '../services/ExpenseFiscalValidationService';

export default function ExpenseDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const expense: Expense = JSON.parse(params.expense as string);
  const statusInfo = STATUSES[expense.status];
  
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);
  const [imageUri, setImageUri] = useState<string>(expense.imageuri);
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [isValidatingSAT, setIsValidatingSAT] = useState(false);

  // Detectar si la imagen es local o del backend y construir la URL apropiada
  useEffect(() => {
    const loadImageUri = async () => {
      if (expense.imageuri) {
        setImageLoading(true);
        setImageError(false);
        
        // LÓGICA: Determinar si la imagen está en el backend o es local
        // - Si tiene 'file://' → Siempre es local
        // - Si ya es una URL completa (http/https) → Usar directamente
        // - Si empieza con 'uploads/' o '/uploads/' → Es ruta del servidor (caso del jefe viendo gastos del empleado)
        // - Si synced === 1 → La imagen ya fue subida al backend, construir URL del backend
        // - Otro caso → Imagen local sin prefijo conocido

        if (expense.imageuri.startsWith('file://')) {
          // Imagen explícitamente local
          console.log('📷 Usando imagen local (file://):', expense.imageuri);
          setImageUri(expense.imageuri);
        } else if (expense.imageuri.startsWith('http://') || expense.imageuri.startsWith('https://')) {
          // Ya es una URL completa del servidor
          console.log('📷 Usando URL completa del backend:', expense.imageuri);
          setImageUri(expense.imageuri);
        } else if (
          expense.synced === 1 ||
          expense.imageuri.startsWith('uploads/') ||
          expense.imageuri.startsWith('/uploads/')
        ) {
          // Imagen en el backend:
          // - synced=1 (empleado con gasto sincronizado)
          // - ruta 'uploads/...' (jefe viendo gastos del empleado desde la API)
          const config = await BackendSyncService.getBackendConfig();
          
          let imagePath = expense.imageuri;
          if (imagePath.startsWith('/uploads/')) {
            imagePath = imagePath.substring(1); // Quitar el / inicial
          } else if (!imagePath.startsWith('uploads/')) {
            imagePath = `uploads/${imagePath}`;
          }
          
          const backendImageUri = `${config.url}/${imagePath}`;
          console.log('📷 Cargando imagen del backend:', backendImageUri);
          setImageUri(backendImageUri);
        } else {
          // Gasto no sincronizado = imagen local sin prefijo conocido
          console.log('📷 Usando imagen local (sin prefijo):', expense.imageuri);
          setImageUri(expense.imageuri);
        }
      }
    };
    loadImageUri();
  }, [expense.imageuri, expense.synced]);
  
  const retryLoadImage = () => {
    console.log('🔄 Reintentando cargar imagen...');
    setImageError(false);
    setImageLoading(true);
    // Forzar recarga cambiando la URI con timestamp
    setImageUri(prev => prev.includes('?') ? prev : `${prev}?retry=${Date.now()}`);
  };

  const handleVoidExpense = async () => {
    if (!voidReason || voidReason.trim().length === 0) {
      Alert.alert('Error', 'Debe proporcionar una razón para anular el gasto');
      return;
    }

    try {
      setIsVoiding(true);
      const user = await AuthService.getLastLoggedInUser();
      if (!user) {
        Alert.alert('Error', 'No se encontró usuario activo');
        return;
      }

      // Anular gasto localmente primero
      await ExpenseService.voidExpense(expense.id, user.email, voidReason);
      console.log('✅ Gasto anulado localmente:', expense.id);
      
      // Intentar sincronizar en background si hay conexión (sin bloquear la UI)
      console.log('🔄 Intentando sincronizar anulación en background...');
      const plainPin = await AuthService.getPIN();
      console.log('📌 PIN recuperado:', plainPin ? `${plainPin.length} caracteres` : 'null');
      console.log('📌 Email:', user.email);
      
      if (plainPin && plainPin.length === 4) {
        console.log('🔐 Intentando login con email:', user.email);
        BackendSyncService.loginAndGetToken(user.email, plainPin)
          .then(async (loginResult) => {
            console.log('📥 Respuesta de login:', JSON.stringify(loginResult));
            if (loginResult.success && loginResult.token) {
              console.log('✅ Login exitoso, sincronizando gasto...');
              await BackendSyncService.syncExpenses(user.email, loginResult.token);
              console.log('✅ Anulación sincronizada en background');
            } else {
              console.log('⚠️ Login falló en background:', loginResult.error);
            }
          })
          .catch(err => {
            console.error('❌ Error en sincronización background:', err);
            console.error('❌ Detalle del error:', JSON.stringify(err));
          });
      } else {
        console.log('⚠️ PIN inválido o no encontrado. Longitud:', plainPin?.length);
      }
      
      Alert.alert(
        '✅ Gasto Anulado',
        'El gasto ha sido anulado exitosamente. Se mantendrá como registro histórico.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('Error anulando gasto:', error);
      Alert.alert('Error', (error as Error).message);
    } finally {
      setIsVoiding(false);
      setShowVoidModal(false);
    }
  };

  const handleValidateSAT = async () => {
    const missingFields = [];
    if (!expense.noinvoice?.trim()) missingFields.push('No. Factura');
    if (!expense.serie?.trim()) missingFields.push('Serie');

    if (missingFields.length > 0) {
      Alert.alert('Datos mínimos requeridos', `Para consultar SAT debe completar:\n\n- ${missingFields.join('\n- ')}`);
      return;
    }

    try {
      setIsValidatingSAT(true);

      const result = await validarFacturaInternaSAT({
        serie: expense.serie,
        noinvoice: expense.noinvoice,
        nitEmisor: expense.vat_number,
        nitReceptor: expense.receiver_vat_number,
        supplier: expense.supplier,
        date: expense.date,
        amount: expense.amount,
        uuid: expense.uuid,
        currency: expense.currency,
        totiva: expense.totiva,
        excludeExpenseId: expense.id,
      });

      if (!result.encontrada || !result.validada || !result.campos) {
        const user = await AuthService.getLastLoggedInUser();
        if (user) {
          const pendingExpense = await validateExpenseFiscal({
            ...expense,
            satStatus: 'PENDIENTE_VALIDACION_SAT',
            satValidationCause: 'NO_ENCONTRADO_D_PLUS_1',
            fiscalStatus: 'PENDIENTE',
          }, 'SAT_QUERY');
          await ExpenseService.updateExpense(pendingExpense, user.email);
          const validityMessage = pendingExpense.fiscalStatus === 'BLOQUEADO_ANTIGUEDAD'
            ? `\n\nLa fecha registrada supera la vigencia de ${pendingExpense.fiscalValidityDaysApplied} días. El borrador se conserva, pero no puede liquidarse.`
            : '';
          Alert.alert(
            'Factura no encontrada',
            `${result.mensaje || 'No existen datos para esa factura.'}\n\n${result.disclaimer || 'Las facturas solo están disponibles para consulta 24 horas después de haber sido emitidas por el emisor.'}${validityMessage}`
          );
          return;
        }
        return;
      }

      const complementados = (result.complementados || []).map(item => item.label).join(', ');
      const corregidos = (result.corregidos || []).map(item => item.label).join(', ');
      const sections: string[] = [];
      if (complementados) sections.push(`Se complementarán estos campos: ${complementados}.`);
      if (corregidos) sections.push(`Se modificarán estos campos: ${corregidos}.`);
      if (sections.length === 0) sections.push('Los datos ya coinciden con SAT.');
      const requiresAcceptance = (result.complementados?.length || 0) > 0 || (result.corregidos?.length || 0) > 0;
      const accepted = !requiresAcceptance || await new Promise<boolean>(resolve => {
        Alert.alert(
          'Cambios encontrados en SAT',
          `${sections.join('\n\n')}\n\n¿Deseas aplicar esta información?`,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Aplicar y validar', onPress: () => resolve(true) },
          ],
          { cancelable: false },
        );
      });
      if (!accepted) return;

      let updatedExpense: Expense = {
        ...expense,
        serie: String(result.campos.serie || expense.serie || ''),
        noinvoice: String(result.campos.noinvoice || expense.noinvoice || ''),
        vat_number: String(result.campos.vat_number || expense.vat_number || ''),
        receiver_vat_number: String(
          result.campos.receiver_vat_number ||
          result.snapshot?.idReceptor ||
          expense.receiver_vat_number ||
          ''
        ),
        supplier: String(result.campos.supplier || expense.supplier || ''),
        date: String(result.campos.date || expense.date),
        amount: result.campos.amount ?? expense.amount,
        uuid: String(result.campos.uuid || expense.uuid || ''),
        currency: String(result.campos.currency || expense.currency || 'GTQ'),
        totiva: result.campos.totiva ?? expense.totiva,
        satStatus: 'VALIDADO_SAT',
        satValidationCause: 'NINGUNA',
        fiscalStatus: 'PENDIENTE',
        satValidatedAt: result.validatedAt || new Date().toISOString(),
        satValidationSource: 'SAT_INTERNO',
        satFacturaId: result.facturaId,
        satInvoiceSnapshot: result.snapshot,
        imageValidationFingerprint: expense.imageValidationFingerprint || expense.imageuri,
        satValidationFingerprint: buildSatValidationFingerprint({
          serie: String(result.campos.serie || expense.serie || ''),
          noinvoice: String(result.campos.noinvoice || expense.noinvoice || ''),
          vat_number: String(result.campos.vat_number || expense.vat_number || ''),
          receiver_vat_number: String(
            result.campos.receiver_vat_number ||
            result.snapshot?.idReceptor ||
            expense.receiver_vat_number ||
            ''
          ),
          supplier: String(result.campos.supplier || expense.supplier || ''),
          date: String(result.campos.date || expense.date),
          amount: result.campos.amount ?? expense.amount,
          uuid: String(result.campos.uuid || expense.uuid || ''),
          currency: String(result.campos.currency || expense.currency || 'GTQ'),
          imageuri: expense.imageuri,
          imageValidationFingerprint: expense.imageValidationFingerprint || expense.imageuri,
        }),
      };

      const user = await AuthService.getLastLoggedInUser();
      if (!user) {
        throw new Error('No se encontró usuario activo');
      }

      const normalizeNit = (value?: string) =>
        String(value || '').trim().toUpperCase().replace(/[-\s]/g, '');
      const receiverNitChanged =
        normalizeNit(updatedExpense.receiver_vat_number) !==
        normalizeNit(expense.receiver_vat_number);
      if (receiverNitChanged) {
        updatedExpense = {
          ...updatedExpense,
          category: '',
          sociedad: undefined,
          centro: '',
          cuenta: '',
          ordenco: '',
          fiscalStatus: 'PENDIENTE',
          fiscalValidatedAt: undefined,
        };
      }

      updatedExpense = await validateExpenseFiscal(updatedExpense, 'SAT_QUERY');
      if (!receiverNitChanged) {
        if (
          updatedExpense.fiscalStatus !== 'BLOQUEADO_ANTIGUEDAD' &&
          updatedExpense.category
        ) {
          updatedExpense.fiscalStatus = 'APTO_PARA_LIQUIDAR';
        }
        await ExpenseService.updateExpense(updatedExpense, user.email);
      }

      const isExpired = updatedExpense.fiscalStatus === 'BLOQUEADO_ANTIGUEDAD';
      Alert.alert(isExpired ? 'Factura vencida' : 'Validación SAT completada', isExpired
        ? `${sections.join('\n\n')}\n\nLa factura fue encontrada en SAT, pero supera la vigencia de ${updatedExpense.fiscalValidityDaysApplied} días.${receiverNitChanged ? '\n\nSAT modificó el NIT del receptor y la categoría fue removida. Debe seleccionar nuevamente una categoría antes de guardar.' : ' El borrador se conserva, pero no puede liquidarse.'}`
        : `${sections.join('\n\n')}${receiverNitChanged ? '\n\nSAT modificó el NIT del receptor y la categoría fue removida. Debe seleccionar nuevamente la categoría correcta.' : ''}`, [
        {
          text: 'OK',
          onPress: () => receiverNitChanged
            ? router.replace({
                pathname: '/add-expense',
                params: { expense: JSON.stringify(updatedExpense) },
              })
            : router.back()
        }
      ]);
    } catch (error) {
      if (error instanceof ExpenseFiscalValidationError) {
        Alert.alert('No se puede validar el gasto', `${error.message}\n\nCódigo: ${error.code}`);
        return;
      }
      const presentation = getSATErrorPresentation(error);
      console.error('Error al validar SAT en detalle de gasto:', {
        title: presentation.title,
        userMessage: presentation.userMessage,
        technicalMessage: presentation.technicalMessage,
      });
      Alert.alert(presentation.title, `${presentation.userMessage}\n\n${presentation.technicalMessage}`);
    } finally {
      setIsValidatingSAT(false);
    }
  };

  const showCanVoid = canVoidExpense(expense);
  const satCauseText = {
    NO_ENCONTRADO_D_PLUS_1: 'Pendiente por réplica SAT D+1',
    DATOS_FISCALES_MODIFICADOS: 'Datos fiscales modificados',
    NINGUNA: 'Sin causal fiscal',
  }[expense.satValidationCause || 'NINGUNA'];
  const fiscalStatusText = {
    PENDIENTE: 'Evaluación fiscal pendiente',
    APTO_PARA_LIQUIDAR: 'Apto para liquidar',
    BLOQUEADO_NIT_SOCIEDAD: 'Bloqueado por Sociedad–NIT',
    BLOQUEADO_ANTIGUEDAD: 'Bloqueado por antigüedad',
  }[expense.fiscalStatus || 'PENDIENTE'];

  const getSATErrorPresentation = (error: unknown): { title: string; userMessage: string; technicalMessage: string } => {
    if (error instanceof SATValidationError) {
      const technicalMessage = `Código: ${error.code}${error.status ? ` | HTTP: ${error.status}` : ''}${error.technicalDetails ? `\nDetalle: ${error.technicalDetails}` : ''}`;

      switch (error.code) {
        case 'SAT_BACKEND_CONFIG_MISSING':
          return {
            title: 'Configuración SAT incompleta',
            userMessage: 'No hay configuración de backend disponible para consultar SAT.',
            technicalMessage,
          };
        case 'SAT_SESSION_MISSING':
          return {
            title: 'Sesión requerida',
            userMessage: 'No hay una sesión activa para consultar SAT. Debe iniciar sesión nuevamente.',
            technicalMessage,
          };
        case 'SAT_REAUTH_FAILED':
          return {
            title: 'Reautenticación fallida',
            userMessage: 'No se pudo revalidar la sesión antes de consultar SAT.',
            technicalMessage,
          };
        case 'SAT_UNAUTHORIZED':
          return {
            title: 'Sesión inválida',
            userMessage: 'El backend rechazó la sesión al consultar SAT.',
            technicalMessage,
          };
        case 'SAT_FORBIDDEN':
          return {
            title: 'Acceso denegado',
            userMessage: 'La sesión actual no tiene permisos para consultar SAT.',
            technicalMessage,
          };
        case 'EXPENSE_DUPLICATE':
          return {
            title: 'Factura duplicada',
            userMessage: error.message,
            technicalMessage,
          };
        case 'SAT_BACKEND_ERROR':
          return {
            title: 'Error del backend SAT',
            userMessage: error.message,
            technicalMessage,
          };
        case 'SAT_INVALID_RESPONSE':
          return {
            title: 'Respuesta inválida del backend',
            userMessage: 'El backend respondió en un formato no esperado durante la validación SAT.',
            technicalMessage,
          };
        case 'SAT_NETWORK_ERROR':
        default:
          return {
            title: 'Error de conexión SAT',
            userMessage: error.message,
            technicalMessage,
          };
      }
    }

    const genericMessage = error instanceof Error ? error.message : 'Sin detalle técnico adicional';
    return {
      title: 'Error inesperado',
      userMessage: 'Ocurrió un error no controlado al validar con SAT.',
      technicalMessage: `Detalle: ${genericMessage}`,
    };
  };

  return (
    <View style={styles.container}>
      {/* Header con botón de regreso */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalle del Gasto</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView 
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
      >
        {/* Banner de estado anulado */}
        {expense.expenseStatus === 'voided' && (
          <View style={styles.voidedBanner}>
            <Ionicons name="close-circle" size={24} color="#dc2626" />
            <View style={styles.voidedBannerText}>
              <Text style={styles.voidedTitle}>Gasto Anulado</Text>
              {expense.voidedAt && (
                <Text style={styles.voidedDate}>
                  Anulado el {formatDateToSpanish(expense.voidedAt.split('T')[0])}
                </Text>
              )}
              {expense.voidedReason && (
                <Text style={styles.voidedReason}>Razón: {expense.voidedReason}</Text>
              )}
            </View>
          </View>
        )}

        {/* Card Principal: Monto y Estado */}
        <View style={styles.mainCard}>
          <View style={styles.mainCardHeader}>
            <View>
              <Text style={styles.mainCardLabel}>Gasto #{expense.id.slice(-8)}</Text>
              <Text style={styles.createdDate}>
                Creado: {formatTimestampToSpanish(parseInt(expense.id))}
              </Text>
            </View>
          </View>
          <Text style={styles.amount}>Q{expense.amount.toFixed(2)}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.backgroundColor }]}>
              <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.text}</Text>
            </View>
            {expense.satStatus === 'VALIDADO_SAT' && (
              <View style={[styles.statusBadge, styles.satValidatedBadge]}>
                <Text style={[styles.statusText, styles.satValidatedText]}>Validado por servicio interno de la SAT</Text>
              </View>
            )}
            {expense.satStatus !== 'VALIDADO_SAT' && (
              <View style={[styles.statusBadge, { backgroundColor: '#fef3c7' }]}>
                <Text style={[styles.statusText, { color: '#b45309' }]}>Pendiente de validación SAT</Text>
              </View>
            )}
            <View style={[styles.statusBadge, { backgroundColor: '#f1f5f9' }]}>
              <Text style={[styles.statusText, { color: '#475569' }]}>{satCauseText}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: expense.fiscalStatus === 'APTO_PARA_LIQUIDAR' ? '#dcfce7' : '#f1f5f9' }]}>
              <Text style={[styles.statusText, { color: expense.fiscalStatus === 'APTO_PARA_LIQUIDAR' ? '#15803d' : '#475569' }]}>{fiscalStatusText}</Text>
            </View>
            {expense.expenseStatus !== 'draft' && (
              <View style={[styles.statusBadge, { backgroundColor: expense.expenseStatus === 'voided' ? '#fee2e2' : '#dbeafe' }]}>
                <Text style={[styles.statusText, { color: expense.expenseStatus === 'voided' ? '#dc2626' : '#2563eb' }]}>
                  {getExpenseStatusText(expense.expenseStatus)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Información General */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Información General</Text>
          <DetailRow icon="calendar-outline" label="Fecha Factura" value={formatDateToSpanish(expense.date)} />
          <DetailRow icon="pricetag-outline" label="Categoría" value={expense.category} />
          <DetailRow icon="briefcase-outline" label="Departamento" value={expense.department} />
          <DetailRow icon="cash-outline" label="Moneda" value={expense.currency} />
        </View>

        {/* Proveedor */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Proveedor</Text>
          <DetailRow icon="storefront-outline" label="Nombre" value={expense.supplier} />
          <DetailRow icon="card-outline" label="NIT del Emisor" value={expense.vat_number} />
          <DetailRow icon="business-outline" label="NIT del Receptor" value={expense.receiver_vat_number || 'N/A'} />
        </View>

        {/* Factura */}
        {(expense.serie || expense.noinvoice || expense.totiva > 0) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Factura</Text>
            {expense.serie && <DetailRow icon="document-text-outline" label="Serie" value={expense.serie} />}
            {expense.noinvoice && <DetailRow icon="receipt-outline" label="Número" value={expense.noinvoice} />}
            {expense.totiva > 0 && <DetailRow icon="calculator-outline" label="IVA" value={`Q${expense.totiva.toFixed(2)}`} />}
          </View>
        )}

        {/* Contabilidad */}
        {(expense.centro || expense.cuenta || expense.ordenco) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Información Contable</Text>
            {expense.centro && <DetailRow icon="business-outline" label="Centro" value={expense.centro} />}
            {expense.cuenta && <DetailRow icon="list-outline" label="Cuenta" value={expense.cuenta} />}
            {expense.ordenco && <DetailRow icon="document-outline" label="Orden CO" value={expense.ordenco} />}
          </View>
        )}

        {/* Descripción */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Descripción</Text>
          <Text style={styles.descriptionText}>{expense.description}</Text>
        </View>

        {/* Notas */}
        {expense.notes && expense.notes.trim().length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Notas Adicionales</Text>
            <Text style={styles.notesText}>{expense.notes}</Text>
          </View>
        )}

        {/* Comprobante - Con mejor presentación */}
        {imageUri && (
          <View style={styles.imageCard}>
            <Text style={styles.cardTitle}>Comprobante Adjunto</Text>
            <TouchableOpacity 
              activeOpacity={0.9} 
              style={styles.imageContainer}
              onPress={() => !imageError && setShowImageModal(true)}
              disabled={imageError}
            >
              {imageLoading && (
                <View style={styles.imageLoadingOverlay}>
                  <Text style={styles.imageLoadingText}>Cargando imagen...</Text>
                </View>
              )}
              {imageError ? (
                <View style={styles.imageErrorContainer}>
                  <Ionicons name="image-outline" size={64} color="#94a3b8" />
                  <Text style={styles.imageErrorText}>No se pudo cargar la imagen</Text>
                  <Text style={styles.imageErrorHint}>
                    {(expense.synced === 1 || !expense.imageuri?.startsWith('file://'))
                      ? 'La imagen está en el servidor. Verifica tu conexión.'
                      : 'La imagen no está disponible localmente.'}
                  </Text>
                  {(expense.synced === 1 || !expense.imageuri?.startsWith('file://')) && (
                    <TouchableOpacity 
                      style={styles.retryButton}
                      onPress={retryLoadImage}
                    >
                      <Ionicons name="refresh-outline" size={18} color="#2563eb" />
                      <Text style={styles.retryButtonText}>Reintentar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <Image 
                  source={{ uri: imageUri }} 
                  style={styles.image} 
                  resizeMode="contain"
                  onLoadStart={() => setImageLoading(true)}
                  onLoadEnd={() => setImageLoading(false)}
                  onError={(error) => {
                    console.error('❌ Error cargando imagen:', error.nativeEvent.error);
                    setImageLoading(false);
                    setImageError(true);
                  }}
                />
              )}
            </TouchableOpacity>
            {!imageError && <Text style={styles.imageHint}>Toca para ver en detalle</Text>}
          </View>
        )}

        {/* Botón de Anular Gasto */}
        {showCanVoid && (
          <TouchableOpacity 
            style={styles.voidButton}
            onPress={() => setShowVoidModal(true)}
          >
            <Ionicons name="close-circle-outline" size={20} color="white" />
            <Text style={styles.voidButtonText}>Anular Gasto</Text>
          </TouchableOpacity>
        )}

        {expense.expenseStatus === 'draft' && !expense.liquidationId && (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push({
              pathname: '/add-expense',
              params: { expense: JSON.stringify(expense) },
            })}
          >
            <Ionicons name="create-outline" size={20} color="white" />
            <Text style={styles.editButtonText}>Editar Gasto</Text>
          </TouchableOpacity>
        )}

        {expense.expenseStatus === 'draft' && expense.satStatus !== 'VALIDADO_SAT' && (
          <TouchableOpacity
            style={styles.validateSatButton}
            onPress={handleValidateSAT}
            disabled={isValidatingSAT}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color="white" />
            <Text style={styles.validateSatButtonText}>
              {isValidatingSAT ? 'Validando...' : 'Consultar SAT'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Modal para anular gasto */}
      <Modal
        visible={showVoidModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowVoidModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Anular Gasto</Text>
            <Text style={styles.modalDescription}>
              El gasto será marcado como anulado y se mantendrá como registro histórico. 
              No podrá agregarse a liquidaciones.
            </Text>
            
            <Text style={styles.inputLabel}>Razón de anulación *</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Ej: Factura duplicada, error de registro..."
              value={voidReason}
              onChangeText={setVoidReason}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => {
                  setShowVoidModal(false);
                  setVoidReason('');
                }}
                disabled={isVoiding}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.confirmVoidButton, isVoiding && styles.disabledButton]}
                onPress={handleVoidExpense}
                disabled={isVoiding}
              >
                <Ionicons name="close-circle" size={20} color="white" />
                <Text style={styles.confirmVoidButtonText}>
                  {isVoiding ? 'Anulando...' : 'Anular'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal para ver imagen en pantalla completa */}
      <Modal
        visible={showImageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <View style={styles.imageModalOverlay}>
          <TouchableOpacity 
            style={styles.imageModalCloseButton}
            onPress={() => setShowImageModal(false)}
          >
            <Ionicons name="close" size={30} color="white" />
          </TouchableOpacity>
          <Image 
            source={{ uri: imageUri }} 
            style={styles.fullscreenImage}
            resizeMode="contain"
          />
        </View>
      </Modal>
    </View>
  );
}

// Helper component mejorado
const DetailRow = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
  <View style={styles.detailRow}>
    <View style={styles.detailLabel}>
      <Ionicons name={icon as any} size={18} color="#64748b" />
      <Text style={styles.labelText}>{label}</Text>
    </View>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f8fafc' 
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  scrollContent: {
    flex: 1,
    padding: 16,
  },
  scrollContentContainer: {
    paddingBottom: 100,
  },
  mainCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mainCardHeader: {
    marginBottom: 12,
  },
  mainCardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
  },
  createdDate: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  amount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#059669',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  satValidatedBadge: {
    backgroundColor: '#ede9fe',
  },
  satValidatedText: {
    color: '#7c3aed',
  },
  voidedBanner: {
    flexDirection: 'row',
    backgroundColor: '#fee2e2',
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
    padding: 16,
    marginBottom: 16,
    borderRadius: 8,
    gap: 12,
  },
  voidedBannerText: {
    flex: 1,
  },
  voidedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#991b1b',
    marginBottom: 4,
  },
  voidedDate: {
    fontSize: 13,
    color: '#dc2626',
    marginBottom: 4,
  },
  voidedReason: {
    fontSize: 14,
    color: '#7f1d1d',
    fontStyle: 'italic',
  },
  voidButton: {
    flexDirection: 'row',
    backgroundColor: '#dc2626',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    marginBottom: 32,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  voidButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  editButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
    marginHorizontal: 4,
  },
  editButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  validateSatButton: {
    flexDirection: 'row',
    backgroundColor: '#7c3aed',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 32,
    marginHorizontal: 4,
  },
  validateSatButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1e293b',
    minHeight: 80,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#475569',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmVoidButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  confirmVoidButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.5,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  detailLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  labelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'right',
    flex: 1,
  },
  descriptionText: {
    fontSize: 15,
    color: '#1e293b',
    lineHeight: 22,
    fontWeight: '500',
  },
  notesText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  imageCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  imageContainer: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 400,
    backgroundColor: '#ffffff',
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  imageLoadingText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
  },
  imageErrorContainer: {
    width: '100%',
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  imageErrorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 16,
    textAlign: 'center',
  },
  imageErrorHint: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  imageHint: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 25,
    padding: 10,
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
});
