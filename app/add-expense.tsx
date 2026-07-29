import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { Picker } from '@react-native-picker/picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import DocumentScanner from 'react-native-document-scanner-plugin';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Category } from '../models/Category';
import { Expense, STATUSES } from '../models/Expense';
import type { SatInvoiceSnapshot, SatValidationCause } from '../models/FiscalValidation';
import { getExpenseAmountErrorMessage, isExpenseAmountValid } from '../models/Settings';
import * as AuthService from '../services/AuthService';
import * as AccountingCatalogService from '../services/AccountingCatalogService';
import { BackendSyncService } from '../services/BackendSyncService';
import * as CategoryService from '../services/CategoryService';
import * as ExpenseService from '../services/ExpenseService';
import * as SettingsService from '../services/SettingsService';
import { extractWithAI, extractWithGoogleVisionOCR, cleanAmount, parseInvoiceDate } from '../services/AIExtractionService';
import { preprocessImageForOCR, extractFullText, extractCleanLines, extractWordsWithCoordinates, type Word } from '../utils/OCRUtils';
import { validateInvoiceWithSAT, formatNIT, formatDateForSAT, canValidateWithSAT, openSATValidationInBrowser, formatSATDataForCopy } from '../services/SATValidationService';
import { buildSatValidationFingerprint } from '../services/ExpenseService';
import { SATValidationError, validarFacturaInternaSAT } from '../services/SATFacturaService';
import {
  checkGlobalExpenseDuplicate,
  ExpenseFiscalValidationError,
  validateExpenseFiscal,
} from '../services/ExpenseFiscalValidationService';

interface CustomAsset {
  uri: string;
  name?: string;
  fileName?: string;
}

export default function AddExpenseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ expense?: string }>();
  const [editingExpense] = useState<Expense | null>(() => {
    if (!params.expense) return null;
    try {
      return JSON.parse(params.expense) as Expense;
    } catch {
      return null;
    }
  });
  const isEditing = Boolean(editingExpense);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [category, setCategory] = useState('');
  const [department, setDepartment] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<{ name: string; uri: string } | null>(null);
  const [imageValidationFingerprint, setImageValidationFingerprint] = useState<string | undefined>(undefined);
  const [serie, setSerie] = useState('');
  const [noinvoice, setNoinvoice] = useState('');
  const [vat_number, setVatNumber] = useState('');
  const [supplier, setSupplier] = useState('');
  const [expenseSociedad, setExpenseSociedad] = useState('');
  const [centro, setCentro] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [ordenco, setOrdenco] = useState('');
  const [totiva, setTotiva] = useState('');
  const [currency, setCurrency] = useState('GTQ');
  const [isLoading, setIsLoading] = useState(false);
  const useAIExtraction = false; // MVP2: extracción remota desactivada; se usa exclusivamente OCR local.
  const [uuid, setUuid] = useState(''); // UUID de la factura FEL para validación SAT
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [validationMessage, setValidationMessage] = useState('');
  const [satValidatedAt, setSatValidatedAt] = useState<string | undefined>(undefined);
  const [satValidationFingerprint, setSatValidationFingerprint] = useState<string | undefined>(undefined);
  const [satValidationCause, setSatValidationCause] = useState<SatValidationCause>('NINGUNA');
  const [satFacturaId, setSatFacturaId] = useState<string | undefined>(undefined);
  const [satInvoiceSnapshot, setSatInvoiceSnapshot] = useState<SatInvoiceSnapshot | undefined>(undefined);
  const [fiscalStatus, setFiscalStatus] = useState<Expense['fiscalStatus']>('PENDIENTE');
  const [fiscalValidatedAt, setFiscalValidatedAt] = useState<string | undefined>(undefined);
  const [fiscalValidityDaysApplied, setFiscalValidityDaysApplied] = useState<number | undefined>(undefined);
  const skipNextFingerprintInvalidation = useRef(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const departments = ['Tecnologia', 'Ventas', 'Marketing', 'Finanzas', 'Recursos humanos'];
  const currencies = ['GTQ', 'USD', 'EUR'];


  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (!editingExpense) return;

    setDescription(editingExpense.description || '');
    setAmount(editingExpense.amount ? String(editingExpense.amount) : '');
    setDate(editingExpense.date ? new Date(`${editingExpense.date}T00:00:00`) : null);
    setCategory(editingExpense.category || '');
    setDepartment(editingExpense.department || '');
    setNotes(editingExpense.notes || '');
    setFile(editingExpense.imageuri
      ? { name: 'Comprobante actual', uri: editingExpense.imageuri }
      : null);
    setImageValidationFingerprint(
      editingExpense.imageValidationFingerprint || editingExpense.imageuri || undefined
    );
    setSerie(editingExpense.serie || '');
    setNoinvoice(editingExpense.noinvoice || '');
    setVatNumber(editingExpense.vat_number || '');
    setSupplier(editingExpense.supplier || '');
    setExpenseSociedad(editingExpense.sociedad || '');
    setCentro(editingExpense.centro || '');
    setCuenta(editingExpense.cuenta || '');
    setOrdenco(editingExpense.ordenco || '');
    setTotiva(editingExpense.totiva ? String(editingExpense.totiva) : '');
    setCurrency(editingExpense.currency || 'GTQ');
    setUuid(editingExpense.uuid || '');
    setValidationStatus(editingExpense.satStatus === 'VALIDADO_SAT' ? 'valid' : 'idle');
    setValidationMessage(
      editingExpense.satStatus === 'VALIDADO_SAT' ? 'Factura validada por SAT' : ''
    );
    setSatValidatedAt(editingExpense.satValidatedAt);
    setSatValidationFingerprint(editingExpense.satValidationFingerprint);
    setSatValidationCause(editingExpense.satValidationCause || 'NINGUNA');
    setSatFacturaId(editingExpense.satFacturaId);
    setSatInvoiceSnapshot(editingExpense.satInvoiceSnapshot);
    setFiscalStatus(editingExpense.fiscalStatus || 'PENDIENTE');
    setFiscalValidatedAt(editingExpense.fiscalValidatedAt);
    setFiscalValidityDaysApplied(editingExpense.fiscalValidityDaysApplied);
  }, [editingExpense]);

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

  // Función para recalcular el IVA cuando cambia el monto
  const handleAmountChange = (value: string) => {
    setAmount(value);
    
    // Solo calcular IVA si hay un monto válido y completo
    // No calcular mientras está borrando o editando
    if (value.trim() === '') {
      setTotiva(''); // Limpiar IVA si el monto está vacío
      return;
    }
    
    const parsedAmount = parseFloat(value);
    // Solo recalcular si es un número válido mayor a 0
    if (!isNaN(parsedAmount) && parsedAmount > 0) {
      const ivaRate = 0.12; // 12% IVA en Guatemala
      const calculatedIva = (parsedAmount * ivaRate / (1 + ivaRate)).toFixed(2);
      setTotiva(calculatedIva);
    }
  };

    useEffect(() => {
      const loadCustomCategories = async () => {
        try {
          console.log('📂 AddExpense: Cargando categorías...');
          const user = await AuthService.getLastLoggedInUser();
          console.log('📂 AddExpense: Usuario:', user?.email);
          if (user) {
            const data = await CategoryService.getCategories(user.email);
            console.log('📂 AddExpense: Categorías cargadas:', data.length);
            setCategories(data);
            if (data.length === 0) {
              console.log('ℹ️ No hay categorías; el usuario aún puede guardar un borrador con documento adjunto.');
            }
          } else {
            console.log('⚠️ AddExpense: No hay usuario logueado');
          }
        } catch (error) {
          console.error('❌ AddExpense: Error cargando categorías:', error);
        }
      };
      loadCustomCategories();
    }, []);

      // On category change
      const handleCategoryChange = (value: string) => {
        setCategory(value);
        const selectedCategory = categories.find(cat => cat.name === value);
        if (selectedCategory) {
          setExpenseSociedad(selectedCategory.sociedad || '');
          setCentro(selectedCategory.centro || '');
          setCuenta(selectedCategory.cuenta || '');
          setOrdenco(selectedCategory.ordenco || '');
        } else {
          setExpenseSociedad('');
          setCentro('');
          setCuenta('');
          setOrdenco('');
        }
      };


  // Formatea fecha a YYYY-MM-DD para almacenamiento interno
  const formatDate = (date: Date | null) => {
    if (!date) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
  };

  // Formatea fecha a DD/MM/YYYY para visualización
  const formatDateDisplay = (date: Date | null) => {
    if (!date) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  useEffect(() => {
    if (validationStatus !== 'valid') {
      return;
    }

    const currentFingerprint = buildSatValidationFingerprint({
      serie,
      noinvoice,
      vat_number,
      supplier,
      date: formatDate(date),
      amount: amount ? parseFloat(amount) : 0,
      uuid,
      currency,
      sociedad: expenseSociedad,
      category,
      imageuri: file?.uri || '',
      imageValidationFingerprint,
    });

    if (skipNextFingerprintInvalidation.current) {
      skipNextFingerprintInvalidation.current = false;
      if (currentFingerprint !== satValidationFingerprint) {
        setSatValidationFingerprint(currentFingerprint);
      }
      return;
    }

    if (satValidationFingerprint && currentFingerprint !== satValidationFingerprint) {
      setValidationStatus('idle');
      setValidationMessage('');
      setSatValidatedAt(undefined);
      setSatValidationFingerprint(undefined);
      setSatFacturaId(undefined);
      setSatInvoiceSnapshot(undefined);
      setSatValidationCause('DATOS_FISCALES_MODIFICADOS');
      setFiscalStatus('PENDIENTE');
      setFiscalValidatedAt(undefined);
      setFiscalValidityDaysApplied(undefined);
    }
  }, [serie, noinvoice, vat_number, supplier, date, amount, uuid, currency, expenseSociedad, category, file?.uri, imageValidationFingerprint, validationStatus, satValidationFingerprint]);

  // Función helper para sincronizar en segundo plano
  const syncExpenseInBackground = async (userEmail: string, userData: any) => {
    try {
      // PASO 1: Verificar conectividad con el backend
      console.log('🌐 AddExpense (BG): Verificando conexión al backend...');
      const isConnected = await BackendSyncService.checkConnection();
      
      if (!isConnected) {
        console.log('⚠️ AddExpense (BG): Backend no disponible - sincronización pendiente');
        console.log('💾 AddExpense (BG): El gasto quedó guardado localmente');
        return;
      }
      console.log('✅ AddExpense (BG): Conexión al backend OK');

      // PASO 2: Obtener PIN local
      const userPIN = await AuthService.getPIN();
      if (!userPIN) {
        console.log('⚠️ AddExpense (BG): No se encontró PIN - sincronización pendiente');
        return;
      }

      // PASO 3: Autenticar (login o registro)
      console.log('🔐 AddExpense (BG): Autenticando usuario...');
      let loginResult = await BackendSyncService.loginAndGetToken(userEmail, userPIN);
      
      if (!loginResult.success || !loginResult.token) {
        console.log('📝 AddExpense (BG): Usuario no registrado - registrando...');
        const registerResult = await BackendSyncService.syncUserRegistration(userData, userPIN);
        
        if (registerResult.success) {
          loginResult = await BackendSyncService.loginAndGetToken(userEmail, userPIN);
        }
      }

      // PASO 4: Sincronizar gastos
      if (loginResult.success && loginResult.token) {
        console.log('🔄 AddExpense (BG): Sincronizando gastos con el backend...');
        const syncResult = await BackendSyncService.syncExpenses(userEmail, loginResult.token);
        
        if (syncResult.success) {
          console.log('✅ AddExpense (BG): ¡Gasto sincronizado exitosamente con el servidor!');
        } else {
          console.log('⚠️ AddExpense (BG): Error en sincronización:', syncResult.error);
        }
      } else {
        console.log('⚠️ AddExpense (BG): No se pudo autenticar - sincronización pendiente');
      }
    } catch (error) {
      // Error no crítico - el gasto ya está guardado localmente
      console.log('⚠️ AddExpense (BG): No se pudo sincronizar (offline o error de red):', error);
      console.log('💾 AddExpense (BG): El gasto quedó guardado localmente y se sincronizará cuando haya conexión');
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) setDate(selectedDate);
  };

  const handleScan = async () => {
    // En web, usar el picker normal
    if (Platform.OS === 'web') {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*' });
      if (!result.canceled && result.assets) {
        const asset = result.assets[0] as CustomAsset;
        const fileName = asset.name ?? asset.fileName ?? 'factura.jpg';
        const newFile = { name: fileName, uri: asset.uri };
        setFile(newFile);
        setImageValidationFingerprint(asset.uri);
        await extractDataFromImage(asset.uri);
      }
      return;
    }

    // En móvil, usar el Document Scanner
    try {
      const { scannedImages } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        croppedImageQuality: 100  // Máxima calidad
      });

      if (scannedImages && scannedImages.length > 0) {
        const scannedUri = scannedImages[0];
        const fileName = 'factura_escaneada.jpg';
        const newFile = { name: fileName, uri: scannedUri };
        setFile(newFile);
        setImageValidationFingerprint(scannedUri);
        
        console.log('📸 Scanner: Imagen escaneada:', scannedUri);
        await extractDataFromImage(scannedUri);
      }
    } catch (error: any) {
      // Si el usuario cancela o hay error, intentar con cámara normal
      console.log('⚠️ Scanner cancelado o no disponible, usando cámara normal');
      
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        alert('Se necesitan permisos de cámara para escanear facturas.');
        return;
      }
      
      const result = await ImagePicker.launchCameraAsync({ 
        allowsEditing: true,
        quality: 1,
        cameraType: ImagePicker.CameraType.back
      });

      if (!result.canceled && result.assets) {
        const asset = result.assets[0] as CustomAsset;
        const fileName = asset.name ?? asset.fileName ?? 'factura.jpg';
        const newFile = { name: fileName, uri: asset.uri };
        setFile(newFile);
        setImageValidationFingerprint(asset.uri);
        await extractDataFromImage(asset.uri);
      }
    }
  };

  const handleChooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({});
    if (!result.canceled && result.assets) {
      const asset = result.assets[0] as CustomAsset;
      const fileName = asset.name ?? 'default.jpg';
      setFile({ name: fileName, uri: asset.uri });
      setImageValidationFingerprint(asset.uri);
      await extractDataFromImage(asset.uri);
    }

  };

  // Función para limpiar todos los campos del formulario
  const handleClearForm = () => {
    Alert.alert(
      'Limpiar Formulario',
      '¿Está seguro que desea borrar todos los datos ingresados? Esta acción no se puede deshacer.',
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'Limpiar',
          style: 'destructive',
          onPress: () => {
            // Limpiar todos los campos
            setDescription('');
            setAmount('');
            setDate(new Date());
            setCategory('');
            setDepartment('');
            setNotes('');
            setFile(null);
            setImageValidationFingerprint(undefined);
            setSerie('');
            setNoinvoice('');
            setVatNumber('');
            setSupplier('');
            setExpenseSociedad('');
            setCentro('');
            setCuenta('');
            setOrdenco('');
            setTotiva('');
            setCurrency('GTQ');
            setUuid('');
            setValidationStatus('idle');
            setValidationMessage('');
            setSatValidatedAt(undefined);
            setSatValidationFingerprint(undefined);
            setSatValidationCause('NINGUNA');
            setSatFacturaId(undefined);
            setSatInvoiceSnapshot(undefined);
            setFiscalStatus('PENDIENTE');
            setFiscalValidatedAt(undefined);
            setFiscalValidityDaysApplied(undefined);
            console.log('🧹 Formulario limpiado - listo para nuevo escaneo');
            Alert.alert('✓ Limpiado', 'Formulario limpiado. Puede escanear una nueva factura.');
          }
        }
      ]
    );
  };

  const buildDraftExpenseForFiscal = async (overrides: Partial<Expense> = {}): Promise<Expense> => {
    const user = await AuthService.getLastLoggedInUser();
    if (!user?.email) throw new Error('No se encontró usuario activo');
    return {
      id: 'SAT-PREVIEW',
      description: description.trim() || 'Gasto sin descripción',
      amount: amount ? parseFloat(amount) || 0 : 0,
      date: formatDate(date),
      category,
      sociedad: expenseSociedad || undefined,
      status: 'BORRADOR',
      expenseStatus: 'draft',
      satStatus: 'PENDIENTE_VALIDACION_SAT',
      satValidationCause,
      fiscalStatus,
      supplier: supplier || 'Proveedor Desconocido',
      vat_number,
      department,
      notes,
      noinvoice,
      serie,
      uuid,
      centro,
      cuenta,
      ordenco,
      imageuri: file?.uri || '',
      imageValidationFingerprint,
      totiva: parseFloat(totiva) || 0,
      currency,
      email: user.email,
      ...overrides,
    };
  };

  // Función para validar la factura con el servicio de la SAT
  const handleValidateSAT = async () => {
    try {
      const missingFields = [];
      if (!noinvoice.trim()) missingFields.push('No. Factura');
      if (!serie.trim()) missingFields.push('Serie');

      if (missingFields.length > 0) {
        Alert.alert(
          'Datos mínimos requeridos',
          `Para consultar SAT debe completar:\n\n- ${missingFields.join('\n- ')}`
        );
        return;
      }

      setValidationStatus('validating');
      setValidationMessage('Consultando servicio interno SAT...');

      const result = await validarFacturaInternaSAT({
        serie,
        noinvoice,
        nitEmisor: vat_number,
        supplier,
        date: formatDate(date),
        amount: amount ? parseFloat(amount) : undefined,
        uuid,
        currency,
        totiva: totiva ? parseFloat(totiva) : undefined,
        excludeExpenseId: editingExpense?.id,
      });

      if (!result.encontrada || !result.validada || !result.campos) {
        const pendingExpense = await validateExpenseFiscal(await buildDraftExpenseForFiscal({
          satStatus: 'PENDIENTE_VALIDACION_SAT',
          satValidationCause: 'NO_ENCONTRADO_D_PLUS_1',
          fiscalStatus: 'PENDIENTE',
        }), 'SAT_QUERY');
        setValidationStatus('invalid');
        setSatValidationCause('NO_ENCONTRADO_D_PLUS_1');
        setSatFacturaId(undefined);
        setSatInvoiceSnapshot(undefined);
        setFiscalStatus(pendingExpense.fiscalStatus || 'PENDIENTE');
        setFiscalValidatedAt(pendingExpense.fiscalValidatedAt);
        setFiscalValidityDaysApplied(pendingExpense.fiscalValidityDaysApplied);
        setValidationMessage(result.mensaje || 'No existen datos para esa factura.');
        const validityMessage = pendingExpense.fiscalStatus === 'BLOQUEADO_ANTIGUEDAD'
          ? `\n\nLa fecha registrada supera la vigencia de ${pendingExpense.fiscalValidityDaysApplied} días. El borrador podrá guardarse, pero no podrá liquidarse.`
          : '';
        Alert.alert(
          'Factura no encontrada',
          `${result.mensaje || 'No existen datos para esa factura.'}\n\n${result.disclaimer || 'Las facturas solo están disponibles para consulta 24 horas después de haber sido emitidas por el emisor.'}${validityMessage}`
        );
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
          `${sections.join('\n\n')}\n\n¿Deseas aplicar esta información y finalizar la validación?`,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Aplicar y validar', onPress: () => resolve(true) },
          ],
          { cancelable: false },
        );
      });
      if (!accepted) {
        setValidationStatus('idle');
        setValidationMessage('Validación cancelada; no se modificaron los datos.');
        return;
      }

      const corrected = {
        serie: String(result.campos.serie || serie),
        noinvoice: String(result.campos.noinvoice || noinvoice),
        vat_number: String(result.campos.vat_number || vat_number),
        supplier: String(result.campos.supplier || supplier),
        date: String(result.campos.date || formatDate(date)),
        amount: result.campos.amount ?? (amount ? parseFloat(amount) : 0),
        uuid: String(result.campos.uuid || uuid),
        currency: String(result.campos.currency || currency),
        imageuri: file?.uri || '',
        sociedad: expenseSociedad,
        category,
      };
      skipNextFingerprintInvalidation.current = true;
      setSerie(corrected.serie);
      setNoinvoice(corrected.noinvoice);
      setVatNumber(corrected.vat_number);
      setSupplier(corrected.supplier);
      setUuid(corrected.uuid);
      handleAmountChange(String(corrected.amount));
      setDate(new Date(`${corrected.date}T00:00:00`));
      setCurrency(corrected.currency);
      if (result.campos.totiva !== undefined) setTotiva(String(result.campos.totiva));

      const validatedFingerprint = buildSatValidationFingerprint({
        ...corrected,
        imageValidationFingerprint,
      });

      const evaluatedExpense = await validateExpenseFiscal(await buildDraftExpenseForFiscal({
        ...corrected,
        status: 'BORRADOR',
        satStatus: 'VALIDADO_SAT',
        satValidationCause: 'NINGUNA',
        fiscalStatus: 'PENDIENTE',
        satValidatedAt: result.validatedAt || new Date().toISOString(),
        satValidationSource: 'SAT_INTERNO',
        satValidationFingerprint: validatedFingerprint,
        satFacturaId: result.facturaId,
        satInvoiceSnapshot: result.snapshot,
        imageValidationFingerprint,
      }), 'SAT_QUERY');

      setSatValidatedAt(evaluatedExpense.satValidatedAt);
      setSatValidationFingerprint(evaluatedExpense.satValidationFingerprint || validatedFingerprint);
      setSatValidationCause('NINGUNA');
      setSatFacturaId(evaluatedExpense.satFacturaId || result.facturaId);
      setSatInvoiceSnapshot(evaluatedExpense.satInvoiceSnapshot || result.snapshot);
      setFiscalStatus(evaluatedExpense.fiscalStatus || 'PENDIENTE');
      setFiscalValidatedAt(evaluatedExpense.fiscalValidatedAt);
      setFiscalValidityDaysApplied(evaluatedExpense.fiscalValidityDaysApplied);
      setValidationStatus('valid');
      const isExpired = evaluatedExpense.fiscalStatus === 'BLOQUEADO_ANTIGUEDAD';
      setValidationMessage(isExpired
        ? `Factura encontrada en SAT, pero supera la vigencia de ${evaluatedExpense.fiscalValidityDaysApplied} días.`
        : (result.mensaje || 'Factura validada por SAT'));

      Alert.alert(
        isExpired ? 'Factura vencida' : 'Validación SAT completada',
        isExpired
          ? `${sections.join('\n\n')}\n\nLa factura fue encontrada en SAT, pero supera la vigencia de ${evaluatedExpense.fiscalValidityDaysApplied} días. Puede conservarse como borrador, pero no liquidarse.`
          : sections.join('\n\n')
      );
      return;

      // Validar que tengamos todos los datos necesarios
      const validationRequest = {
        uuid: uuid,
        nitEmisor: formatNIT(vat_number),
        nitReceptor: 'CF', // Por defecto Consumidor Final, podrías agregar un campo para esto
        fechaEmision: date ? formatDateForSAT(date || new Date()) : '',
        monto: amount
      };

      // Verificar que todos los campos estén presentes
      if (!canValidateWithSAT(validationRequest)) {
        const missingFields = [];
        if (!uuid) missingFields.push('UUID');
        if (!vat_number) missingFields.push('NIT del Emisor');
        if (!amount) missingFields.push('Monto');
        
        Alert.alert(
          'Datos Incompletos',
          `Para validar con la SAT se requieren los siguientes datos:\n\n${missingFields.join('\n')}\n\nEstos datos se extraen automáticamente de la factura al escanearla.`
        );
        return;
      }

      // Ofrecer dos opciones al usuario
      Alert.alert(
        'Validar Factura con SAT',
        'El portal de la SAT requiere resolver un CAPTCHA. Seleccione cómo desea validar:',
        [
          {
            text: 'Cancelar',
            style: 'cancel'
          },
          {
            text: 'Abrir Portal SAT',
            onPress: async () => {
              // Opción 1: Abrir el portal de la SAT en el navegador
              const opened = await openSATValidationInBrowser(validationRequest);
              if (opened) {
                // Copiar datos al portapapeles para facilitar el llenado
                const dataText = formatSATDataForCopy(validationRequest);
                Alert.alert(
                  'ℹ️ Portal Abierto',
                  'Se ha abierto el portal de la SAT en su navegador.\n\nDatos de la factura:\n\n' + dataText + '\n\nComplete el CAPTCHA y verifique la factura.',
                  [{ text: 'Entendido' }]
                );
              } else {
                Alert.alert('Error', 'No se pudo abrir el navegador');
              }
            }
          },
          {
            text: 'Intentar Automático',
            onPress: async () => {
              // Opción 2: Intentar validación automática (puede fallar por CAPTCHA)
              setValidationStatus('validating');
              setValidationMessage('Validando con la SAT...');

              console.log('🔍 Validando factura con SAT:', validationRequest);

              const result = await validateInvoiceWithSAT(validationRequest);

              if (result.success) {
                if (result.valid) {
                  setValidationStatus('valid');
                  setValidationMessage(result.mensaje || 'Factura válida');
                  
                  Alert.alert(
                    '✅ Factura Válida',
                    `La factura ha sido verificada exitosamente con la SAT.\n\n${result.mensaje}\n\nCódigo: ${result.codigo}`,
                    [{ text: 'OK' }]
                  );
                } else {
                  setValidationStatus('invalid');
                  setValidationMessage(result.mensaje || 'Factura inválida');
                  
                  Alert.alert(
                    '⚠️ Factura Inválida',
                    `La factura NO es válida según la SAT.\n\n${result.mensaje}\n\nCódigo: ${result.codigo}`,
                    [{ text: 'OK' }]
                  );
                }
              } else {
                setValidationStatus('idle');
                setValidationMessage('');
                
                Alert.alert(
                  '❌ Error de Validación',
                  result.error || 'No se pudo conectar con el servicio de la SAT. Use "Abrir Portal SAT" para validar manualmente.',
                  [{ text: 'OK' }]
                );
              }
            }
          }
        ]
      );

    } catch (error: any) {
      if (error instanceof ExpenseFiscalValidationError) {
        Alert.alert('No se puede consultar SAT', `${error.message}\n\nCódigo: ${error.code}`);
        return;
      }
      const presentation = getSATErrorPresentation(error);
      console.error('Error al validar con SAT:', {
        title: presentation.title,
        userMessage: presentation.userMessage,
        technicalMessage: presentation.technicalMessage,
      });
      if (validationStatus !== 'valid') {
        setValidationStatus('idle');
        setValidationMessage('');
      }
      
      Alert.alert(
        presentation.title,
        `${presentation.userMessage}\n\n${presentation.technicalMessage}`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleSave = async (status: keyof typeof STATUSES) => {
    console.log('🔍 AddExpense: Validando campos...');
    console.log('📝 Description:', description);
    console.log('💰 Amount:', amount);
    console.log('📂 Category:', category);
    console.log('🏢 Department:', department);

    if (!file?.uri) {
      Alert.alert('Documento requerido', 'Para guardar el borrador debe adjuntar una imagen o documento.');
      return;
    }

    const isDraftSave = status === 'BORRADOR';

    if (!isDraftSave && categories.length === 0) {
      Alert.alert(
        'Categorías requeridas',
        'Primero debes crear al menos una categoría de gasto para poder registrar un gasto.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Ir a Categorías',
            onPress: () => router.push('/(tabs)/categories')
          }
        ]
      );
      return;
    }
    
    if (!isDraftSave && (!category || !department)) {
      const missingFields = [];
      if (!category) missingFields.push('Categoría');
      if (!department) missingFields.push('Departamento');
      
      alert(`Por favor, complete los campos requeridos:\n- ${missingFields.join('\n- ')}`);
      return;
    }

    if (!isDraftSave && (!expenseSociedad || !centro || !cuenta || !ordenco)) {
      Alert.alert(
        'Categoría incompleta',
        'La categoría seleccionada no tiene completo el snapshot contable requerido. Edita o recrea la categoría antes de guardar el gasto.'
      );
      return;
    }

    // Si no hay descripción, generarla automáticamente
    const finalDescription = description.trim() || 
      [supplier, noinvoice ? `Factura ${noinvoice}` : null].filter(Boolean).join(' - ') || 
      'Gasto sin descripción';
    
    // Validar que el monto sea un número válido si fue ingresado
    const parsedAmount = parseFloat(amount);
    if (amount && (isNaN(parsedAmount) || parsedAmount <= 0)) {
      alert('Por favor, ingrese un monto válido mayor a 0');
      return;
    }
    
    // Validar límite de monto por gasto (solo si hay monto)
    if (amount) {
      try {
        const maxExpenseAmount = await SettingsService.getMaxExpenseAmount();
        if (!isExpenseAmountValid(parsedAmount, maxExpenseAmount)) {
          const errorMessage = getExpenseAmountErrorMessage(parsedAmount, maxExpenseAmount);
          alert(errorMessage);
          return;
        }
      } catch (error) {
        console.error('Error al validar límite de monto:', error);
        if (parsedAmount > 3500) {
          alert(`El monto no puede exceder Q3,500.00. Si necesitas un gasto mayor, divídelo en múltiples gastos.`);
          return;
        }
      }
    }
    
    try {
      console.log('🚀 AddExpense: ========== INICIANDO PROCESO DE GUARDAR GASTO (OFFLINE-FIRST) ==========');
      
      const user = await AuthService.getLastLoggedInUser();
      if (!user || !user.email) {
        console.error('❌ AddExpense: No hay usuario logueado');
        alert('Error: usuario no autenticado');
        return;
      }

      console.log('✅ AddExpense: Usuario encontrado:', user.email);
      const backendConnected = await BackendSyncService.checkConnection();

      // VALIDACIÓN DE DUPLICADOS (ANTES DE CREAR EL GASTO)
      console.log('🔍 AddExpense: Verificando duplicados de factura...');
      const canCheckDuplicate = Boolean(serie.trim() && noinvoice.trim());
      const duplicateCheck = canCheckDuplicate
        ? await ExpenseService.checkDuplicateExpense(
            user.email,
            serie || '',
            noinvoice || '',
            formatDate(date),
            parsedAmount || 0,
            editingExpense?.id,
          )
        : { isDuplicate: false, existingExpense: undefined, inLiquidation: false };

      if (duplicateCheck.isDuplicate && duplicateCheck.existingExpense) {
        console.log('⚠️ AddExpense: Factura duplicada detectada');
        
        let message = `⚠️ FACTURA DUPLICADA\n\n`;
        message += `Ya existe una factura con estos datos:\n\n`;
        message += `• Serie: ${serie || 'N/A'}\n`;
        message += `• No. Factura: ${noinvoice || 'N/A'}\n`;
        message += `• Fecha: ${formatDate(date)}\n`;
        message += `• Monto: Q${(parsedAmount || 0).toFixed(2)}\n\n`;
        
        if (duplicateCheck.inLiquidation) {
          const liqId = duplicateCheck.existingExpense.liquidationId?.slice(-6) || 'N/A';
          message += `⚠️ IMPORTANTE: Esta factura ya está incluida en la liquidación #${liqId}.\n\n`;
          message += `No se permite agregar facturas duplicadas que ya estén en liquidaciones.`;
        } else {
          message += `Gasto existente: ${duplicateCheck.existingExpense.description}\n\n`;
          message += `Para registrar nuevamente esta factura debe anular primero el gasto existente.`;
        }

        Alert.alert('Factura Duplicada', message, [{ text: 'Entendido' }]);
        return;
      }

      if (canCheckDuplicate && backendConnected) {
        const globalDuplicate = await checkGlobalExpenseDuplicate(
          serie,
          noinvoice,
          editingExpense?.id,
        );
        if (globalDuplicate.isDuplicate) {
          Alert.alert(
            'Factura duplicada',
            'Ya existe un gasto activo en el sistema con la misma serie y número. Para registrarla nuevamente debe anular primero el gasto existente.',
            [{ text: 'Entendido' }],
          );
          return;
        }
      }

      // CREAR OBJETO DEL GASTO
      let newExpense: Expense = {
        id: editingExpense?.id || Date.now().toString(),
        description: finalDescription,
        amount: parsedAmount || 0,
        date: formatDate(date),
        category,
        sociedad: expenseSociedad || undefined,
        status,
        expenseStatus: editingExpense?.expenseStatus || 'draft',
        satStatus: validationStatus === 'valid' ? 'VALIDADO_SAT' : 'PENDIENTE_VALIDACION_SAT',
        satValidationCause: validationStatus === 'valid' ? 'NINGUNA' : satValidationCause,
        fiscalStatus: fiscalStatus || 'PENDIENTE',
        satValidatedAt: validationStatus === 'valid' ? satValidatedAt : undefined,
        satValidationSource: validationStatus === 'valid' ? 'SAT_INTERNO' : undefined,
        satValidationFingerprint: validationStatus === 'valid'
          ? buildSatValidationFingerprint({
              serie: serie || '',
              noinvoice: noinvoice || '',
              vat_number: vat_number || '',
              supplier: supplier || 'Proveedor Desconocido',
              date: formatDate(date),
              amount: parsedAmount || 0,
              uuid: uuid || '',
              currency: currency || 'GTQ',
              sociedad: expenseSociedad,
              category,
              imageuri: file?.uri || '',
              imageValidationFingerprint,
            })
          : undefined,
        satFacturaId: validationStatus === 'valid' ? satFacturaId : undefined,
        satInvoiceSnapshot: validationStatus === 'valid' ? satInvoiceSnapshot : undefined,
        fiscalValidatedAt,
        fiscalValidityDaysApplied,
        supplier: supplier || 'Proveedor Desconocido',
        vat_number: vat_number || '',
        department,
        notes: notes || '',
        noinvoice: noinvoice || '',
        serie: serie || '',
        uuid: uuid || '', // Número de Autorización FEL
        centro: centro || '',
        cuenta: cuenta || '',
        createdAt: editingExpense?.createdAt || Date.now(),
        updatedAt: Date.now(),
        ordenco: ordenco || '',
        imageuri: file?.uri || '',
        imageValidationFingerprint: validationStatus === 'valid' ? imageValidationFingerprint : undefined,
        totiva: parseFloat(totiva) || 0,
        currency: currency || 'GTQ',
        email: user.email
      };

      console.log('📋 AddExpense: Objeto del gasto creado');

      // Con conexión, el backend es autoritativo. Sin conexión, el borrador usa
      // catálogos cacheados y queda sujeto a revalidación al sincronizar.
      if (backendConnected) {
        newExpense = await validateExpenseFiscal(newExpense);
      } else if (status !== 'BORRADOR') {
        throw new ExpenseFiscalValidationError(
          'FISCAL_NETWORK_REQUIRED',
          'Se requiere conexión al backend para enviar el gasto.',
        );
      } else if (
        newExpense.satStatus === 'VALIDADO_SAT' &&
        newExpense.satInvoiceSnapshot?.idReceptor &&
        newExpense.category &&
        newExpense.sociedad &&
        newExpense.centro &&
        newExpense.cuenta &&
        newExpense.ordenco
      ) {
        const references = await AccountingCatalogService.areActiveReferences(newExpense);
        if (!references.valid) {
          throw new ExpenseFiscalValidationError(
            'INACTIVE_ACCOUNTING_REFERENCE',
            `La categoría contiene referencias inactivas o no disponibles localmente: ${references.inactive.join(', ')}.`,
          );
        }
        const [selectedSociety, actualSociety] = await Promise.all([
          AccountingCatalogService.getActiveSociedadRecord(newExpense.sociedad),
          AccountingCatalogService.getActiveSociedadByNit(newExpense.satInvoiceSnapshot.idReceptor),
        ]);
        if (!selectedSociety) {
          throw new ExpenseFiscalValidationError(
            'SOCIETY_NOT_FOUND',
            `La sociedad ${newExpense.sociedad} no está disponible en el catálogo local.`,
          );
        }
        if (!actualSociety || actualSociety.codigo !== selectedSociety.codigo) {
          const actualText = actualSociety
            ? `la sociedad ${actualSociety.codigo}`
            : 'ninguna sociedad configurada';
          throw new ExpenseFiscalValidationError(
            'EXPENSE_NIT_SOCIETY_MISMATCH',
            `El NIT receptor ${newExpense.satInvoiceSnapshot.idReceptor} corresponde a ${actualText}, no a la sociedad ${selectedSociety.codigo} asociada a la categoría.`,
          );
        }
        if (newExpense.fiscalStatus !== 'BLOQUEADO_ANTIGUEDAD') {
          newExpense = {
            ...newExpense,
            fiscalStatus: 'APTO_PARA_LIQUIDAR',
            fiscalValidatedAt: new Date().toISOString(),
          };
        }
      }

      // PASO 1: GUARDAR LOCALMENTE (RÁPIDO - OFFLINE FIRST)
      console.log('📱 AddExpense: Guardando gasto localmente...');
      try {
        if (editingExpense) {
          await ExpenseService.updateExpense(newExpense, user.email);
        } else {
          await ExpenseService.addExpense(newExpense, user.email);
        }
        console.log('✅ AddExpense: Gasto guardado localmente exitosamente');
      } catch (dbError: any) {
        console.error('❌ AddExpense: Error al guardar en base de datos:', dbError);
        throw new Error(`Error al guardar en base de datos: ${dbError.message || dbError}`);
      }

      // PASO 2: NOTIFICAR AL USUARIO INMEDIATAMENTE
      alert(editingExpense ? '✅ Gasto actualizado exitosamente!' : '✅ Gasto guardado exitosamente!');
      if (editingExpense) {
        router.replace('/(tabs)/expenses');
      } else {
        router.back();
      }

      // PASO 3: SINCRONIZAR EN SEGUNDO PLANO SI HAY CONEXIÓN
      console.log('🔄 AddExpense: Iniciando sincronización automática en segundo plano...');
      
      // Ejecutar sincronización de forma no bloqueante (sin await)
      (async () => {
        await syncExpenseInBackground(user.email, user);
      })();
      
    } catch (error: unknown) {
      console.error('❌ AddExpense: Error en handleSave:', error);
      const err = error as any;
      if (error instanceof ExpenseFiscalValidationError) {
        Alert.alert('No se puede guardar el gasto', `${error.message}\n\nCódigo: ${error.code}`);
      } else if (err?.name === 'QuotaExceededError') {
        alert('Error: Almacenamiento local lleno. Limpie datos del navegador o elimine gastos antiguos.');
      } else {
        alert('Error al guardar el gasto: ' + (err?.message || 'Error desconocido'));
      }
    }
  };


// ... dentro de AddExpenseScreen ...

// Función para preprocesar imagen y mejorar calidad para OCR
// === FUNCIÓN PRINCIPAL DE EXTRACCIÓN DE DATOS DE IMAGEN ===
const extractDataFromImage = async (imageUri: string) => {
  try {
    console.log("🔍 OCR: Iniciando reconocimiento de texto para:", imageUri);
    setIsLoading(true);

    // 1. Preprocesar imagen para mejorar calidad de OCR
    const processedImageUri = await preprocessImageForOCR(imageUri);

    // 2. Usar ML Kit para reconocer texto
    const result = await TextRecognition.recognize(processedImageUri);
    console.log("✅ OCR: Texto reconocido por ML Kit");

    // 3. Extraer texto completo RAW (sin procesar)
    const fullText = extractFullText(result);

    if (!fullText.trim()) {
      alert('No se pudo reconocer texto en la imagen.');
      setIsLoading(false);
      return;
    }
    
    // 4. VALIDACIÓN CRÍTICA: Detectar si el CLIENTE/RECEPTOR es CF (Consumidor Final)
    // IMPORTANTE: El proveedor puede tener NIT válido, pero si el cliente es CF,
    // la factura NO tiene validez fiscal para deducción
    const lines = fullText.split('\n').map(line => line.trim());
    
    // Buscar zona de datos del cliente/receptor/comprador
    let isClientCF = false;
    let clientZoneStart = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      // Detectar inicio de zona de cliente
      if (/\b(cliente|receptor|comprador|nombre)\s*:/i.test(line) || 
          /consumidor\s+final/i.test(line)) {
        clientZoneStart = i;
        
        // Revisar las siguientes 3-5 líneas buscando CF
        for (let j = i; j < Math.min(i + 5, lines.length); j++) {
          const checkLine = lines[j];
          
          // Buscar "NIT: CF" o "Nit: CF" o variaciones
          if (/\b(nit|n\.i\.t\.|n\.i\.t)\s*:\s*(c\/f|cf|c\.f\.)\b/i.test(checkLine)) {
            isClientCF = true;
            console.log(`❌ Cliente CF detectado en línea ${j}: "${checkLine}"`);
            break;
          }
          
          // Buscar "Consumidor Final" explícito
          if (/consumidor\s+final/i.test(checkLine)) {
            isClientCF = true;
            console.log(`❌ "Consumidor Final" detectado en línea ${j}: "${checkLine}"`);
            break;
          }
        }
        
        if (isClientCF) break;
      }
    }
    
    if (isClientCF) {
      console.log('❌ FACTURA RECHAZADA: Cliente es Consumidor Final (CF)');
      setIsLoading(false);
      Alert.alert(
        '❌ Factura No Válida para Deducción',
        'Esta factura fue emitida a "Consumidor Final" (CF).\n\n' +
        '⚠️ Para que un gasto sea deducible, la factura debe estar emitida ' +
        'AL NIT DE LA EMPRESA, no a consumidor final.\n\n' +
        '📋 Solicite al proveedor que emita la factura con:\n' +
        '• NIT de su empresa\n' +
        '• Razón social completa\n\n' +
        'Solo así tendrá validez fiscal.',
        [
          { text: 'Entendido', style: 'default' }
        ]
      );
      return; // No llenar ningún dato
    }
    
    // Log del texto que se mandará a la IA (primeras 500 caracteres)
    console.log('📄 OCR: Texto extraído (primeros 500 chars):', fullText.substring(0, 500));
    console.log('📄 OCR: Longitud total del texto:', fullText.length, 'caracteres');

    // === INTENTO 1: EXTRACCIÓN CON IA (si está activada) ===
    if (useAIExtraction) {
      console.log('🤖 IA: Método Google Vision OCR activado');
      console.log('📸 Enviando imagen directamente al servidor en la nube...');
      
      // NUEVO: Intentar con Google Vision OCR primero (envía la imagen directamente)
      const googleOCRData = await extractWithGoogleVisionOCR(imageUri);
      
      if (googleOCRData) {
        console.log('✅ Google Vision OCR: Datos extraídos exitosamente');
        
        // VALIDACIÓN CRÍTICA: Verificar NIT del RECEPTOR (cliente)
        const nitReceptor = googleOCRData.nit_receptor;
        if (nitReceptor && (nitReceptor.toUpperCase() === 'CF' || 
                           nitReceptor.toUpperCase() === 'C/F' || 
                           nitReceptor.toUpperCase() === 'C.F.')) {
          console.log('❌ Google Vision OCR: Factura emitida a Consumidor Final (CF)');
          setIsLoading(false);
          Alert.alert(
            '❌ Factura No Válida para Deducción',
            'Esta factura fue emitida a "Consumidor Final" (CF).\n\n' +
            '⚠️ Para que un gasto sea deducible, la factura debe estar emitida ' +
            'AL NIT DE LA EMPRESA, no a consumidor final.\n\n' +
            '📋 Solicite al proveedor que emita la factura con:\n' +
            '• NIT de su empresa\n' +
            '• Razón social completa\n\n' +
            'Solo así tendrá validez fiscal.',
            [{ text: 'Entendido', style: 'default' }]
          );
          return; // No llenar ningún dato
        }
        
        // Extraer datos clave del OCR para buscar en SAT
        const serieOCR = googleOCRData.serie;
        const numeroDTE = googleOCRData.numero_factura || googleOCRData.invoiceNumber;
        const nitEmisor = googleOCRData.nit_emisor;
        // nitReceptor ya fue extraído antes para validar CF
        
        // === USAR DATOS DE GOOGLE VISION OCR DIRECTAMENTE ===
        console.log('📝 Usando datos de Google Vision OCR...');
        
        // Actualizar NIT del EMISOR (proveedor)
        if (nitEmisor) {
          setVatNumber(nitEmisor);
          console.log('📝 NIT del proveedor actualizado:', nitEmisor);
        } else {
          setVatNumber('');
          console.log('⚠️ Google Vision OCR: No se detectó NIT del emisor, queda vacío para corrección manual');
        }
        
        // Actualizar monto y recalcular IVA
        const amountValue = googleOCRData.total || googleOCRData.amount || googleOCRData.monto;
        if (amountValue) {
          const cleaned = cleanAmount(amountValue);
          if (cleaned) {
            console.log('💰 Google Vision: Actualizando monto:', cleaned);
            handleAmountChange(cleaned); // Recalcula IVA automáticamente
          }
        }
        
        // Actualizar fecha
        const dateValue = googleOCRData.fecha || googleOCRData.date;
        if (dateValue && typeof dateValue === 'string') {
          const parsedDate = parseInvoiceDate(dateValue);
          if (parsedDate) {
            setDate(parsedDate);
            console.log('📅 Fecha actualizada:', dateValue);
          }
        }
        
        // Actualizar proveedor (si el servicio lo extrae en el futuro)
        const supplierValue = googleOCRData.supplier || googleOCRData.proveedor;
        if (supplierValue) {
          setSupplier(supplierValue);
        }
        
        // Actualizar serie y número de factura (si el servicio lo extrae)
        if (googleOCRData.serie) setSerie(googleOCRData.serie);
        const invoiceNum = googleOCRData.numero_factura || googleOCRData.invoiceNumber;
        if (invoiceNum) {
          setNoinvoice(invoiceNum);
        }
        
        // Actualizar UUID (FEL)
        if (googleOCRData.uuid) {
          setUuid(googleOCRData.uuid);
        }
        
        // Actualizar moneda detectada
        const detectedCurrency = googleOCRData.currency || googleOCRData.moneda;
        if (detectedCurrency) {
          const normalizedCurrency = detectedCurrency.toUpperCase();
          // Validar que sea una moneda soportada
          if (currencies.includes(normalizedCurrency)) {
            setCurrency(normalizedCurrency);
            console.log('💱 Moneda detectada y asignada:', normalizedCurrency);
          } else {
            console.log('⚠️ Moneda detectada no soportada:', detectedCurrency);
          }
        }
        
        // Llenar notas con info de la factura (proveedor, establecimiento, descripción de items)
        const notesPartsOCR: string[] = [];
        if (supplierValue) notesPartsOCR.push(supplierValue);
        if (googleOCRData.establecimiento && googleOCRData.establecimiento !== supplierValue) notesPartsOCR.push(googleOCRData.establecimiento);
        if (googleOCRData.descripcion) notesPartsOCR.push(googleOCRData.descripcion);
        if (notesPartsOCR.length > 0) setNotes(notesPartsOCR.join(' | '));
        
        // Contar cuántos campos fueron extraídos exitosamente
        let extractedFieldsCount = 0;
        const totalFields = 9; // Total de campos importantes a extraer (agregado moneda)
        const foundFields: string[] = [];
        
        if (nitEmisor) { extractedFieldsCount++; foundFields.push('NIT'); }
        if (amountValue && cleanAmount(amountValue)) { extractedFieldsCount++; foundFields.push('Monto'); }
        if (dateValue) { extractedFieldsCount++; foundFields.push('Fecha'); }
        if (supplierValue) { extractedFieldsCount++; foundFields.push('Proveedor'); }
        if (googleOCRData.serie) { extractedFieldsCount++; foundFields.push('Serie'); }
        if (invoiceNum) { extractedFieldsCount++; foundFields.push('No. Factura'); }
        if (googleOCRData.uuid) { extractedFieldsCount++; foundFields.push('UUID'); }
        if (googleOCRData.establecimiento) { extractedFieldsCount++; foundFields.push('Establecimiento'); }
        if (detectedCurrency) { extractedFieldsCount++; foundFields.push('Moneda'); }
        
        console.log(`📊 Google Vision OCR: ${extractedFieldsCount}/${totalFields} campos encontrados`);
        console.log(`✅ Campos extraídos: ${foundFields.join(', ')}`);
        
        // Mensaje con información de campos encontrados
        setShowMoreDetails(true);
        Alert.alert(
          '✅ Extracción Completada', 
          `Los datos de la factura se han extraído exitosamente.\n\n` +
          `📊 Campos encontrados: ${extractedFieldsCount}/${totalFields}\n` +
          `✓ ${foundFields.join(', ')}\n\n` +
          `Por favor, revisa que la información sea correcta.`
        );
        setIsLoading(false);
        return; // Salir, datos ya extraídos
      } else {
        // Si Google Vision falla, intentar con método anterior (LLM)
        console.log('⚠️ Google Vision OCR no disponible, intentando con LLM...');
        const aiData = await extractWithAI(fullText);
        
        if (aiData) {
          console.log('✅ IA (LLM): Datos extraídos exitosamente');
          
          // Actualizar NIT
          if (aiData.nit) {
            setVatNumber(aiData.nit);
          }
          
          // Actualizar monto y recalcular IVA
          const amountValue = aiData.total || aiData.amount || aiData.monto;
          if (amountValue) {
            const cleaned = cleanAmount(amountValue);
            if (cleaned) {
              console.log('💰 IA: Actualizando monto:', cleaned);
              handleAmountChange(cleaned); // Recalcula IVA automáticamente
            }
          }
          
          // Actualizar proveedor
          const supplierValue = aiData.supplier || aiData.proveedor;
          if (supplierValue) {
            setSupplier(supplierValue);
          }
          
          // Actualizar fecha
          const dateValue = aiData.fecha || aiData.date;
          if (dateValue && typeof dateValue === 'string') {
            const parsedDate = parseInvoiceDate(dateValue);
            if (parsedDate) {
              setDate(parsedDate);
            }
          }
          
          // Actualizar serie y número de factura
          if (aiData.serie) setSerie(aiData.serie);
          const invoiceNum = aiData.numero_factura || aiData.invoiceNumber;
          if (invoiceNum) {
            setNoinvoice(invoiceNum);
          }
          // Llenar notas con info de la factura (proveedor, establecimiento, descripción)
          const supplierAI = aiData.supplier || aiData.proveedor;
          const notesPartsAI: string[] = [];
          if (supplierAI) notesPartsAI.push(supplierAI);
          if (aiData.establecimiento && aiData.establecimiento !== supplierAI) notesPartsAI.push(aiData.establecimiento);
          if (aiData.descripcion) notesPartsAI.push(aiData.descripcion);
          if (notesPartsAI.length > 0) setNotes(notesPartsAI.join(' | '));
          
          setShowMoreDetails(true);
          Alert.alert('✅ Extracción con IA', 'Datos extraídos exitosamente usando inteligencia artificial (método LLM)');
          setIsLoading(false);
          return; // Salir sin usar regex
        } else {
          console.log('⚠️ Todos los servicios de IA fallaron, usando método tradicional...');
          Alert.alert('Usando método tradicional', 'Los servidores de IA no están disponibles, se usará el método de extracción local');
        }
      }
    }

    // === INTENTO 2: EXTRACCIÓN TRADICIONAL (REGEX) ===
    console.log('📝 Usando extracción tradicional con Regex...');
    // Reutilizar la variable lines ya declarada arriba
    const cleanedLines = lines.filter(line => line.length > 0);

    console.log("Líneas extraídas:", cleanedLines);

    // 3. Inicializar variables de extracción
    const extractedData = {
      nit: '',
      amount: '',
      supplier: '',
      date: '',
      serie: '',
      invoiceNumber: '',
      iva: '',
      description: '',
      uuid: '', // Para facturas FEL (Factura Electrónica en Línea)
      currency: '' // Moneda detectada: GTQ, USD, EUR, etc.
    };

// === EXTRACCIÓN DE UUID (FACTURA FEL GUATEMALA) ===
// El UUID es un identificador único muy confiable para facturas electrónicas
// Formato estándar: D93AD945-F66F-4566-9473-91BFB1C6DC23
const uuidPattern = /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i;
const uuidPatternNoHyphens = /\b([0-9A-F]{32})\b/i; // UUID sin guiones (32 caracteres)

// Buscar en TODA la factura, especialmente al final donde suele estar
for (let i = cleanedLines.length - 1; i >= 0; i--) {
  const line = cleanedLines[i];
  
  // Buscar UUID con guiones primero
  const match = line.match(uuidPattern);
  if (match) {
    extractedData.uuid = match[0].toUpperCase();
    console.log(`🆔 UUID FEL encontrado en línea ${i}: ${extractedData.uuid}`);
    break;
  }
  
  // Buscar UUID sin guiones (Shell y otros)
  const matchNoHyphens = line.match(uuidPatternNoHyphens);
  if (matchNoHyphens) {
    const uuid = matchNoHyphens[1];
    // Formatear con guiones: 8-4-4-4-12
    const formatted = `${uuid.substr(0,8)}-${uuid.substr(8,4)}-${uuid.substr(12,4)}-${uuid.substr(16,4)}-${uuid.substr(20,12)}`;
    extractedData.uuid = formatted.toUpperCase();
    console.log(`🆔 UUID FEL encontrado (sin guiones) en línea ${i}: ${extractedData.uuid}`);
    break;
  }
}

// === EXTRACCIÓN DE NIT ===
// === EXTRACCIÓN DE PROVEEDOR ===
// CRÍTICO: Buscar SOLO en zona del EMISOR (antes de "DATOS DEL COMPRADOR" o "DATOS DEL CERTIFICADOR")
const datosCompradorIndex = cleanedLines.findIndex(line => /datos\s+del\s+(comprador|cliente)/i.test(line.trim()));
const datosCertificadorIndex = cleanedLines.findIndex(line => /datos\s+del\s+certificador/i.test(line.trim()));
const facturaIndex = cleanedLines.findIndex(line => /^FACTURA\s*$/i.test(line.trim()));

// El encabezado termina en la primera sección de datos que encontremos
let headerEndIndex = cleanedLines.length;
if (datosCompradorIndex > 0) headerEndIndex = Math.min(headerEndIndex, datosCompradorIndex);
if (datosCertificadorIndex > 0) headerEndIndex = Math.min(headerEndIndex, datosCertificadorIndex);
if (facturaIndex > 0) headerEndIndex = Math.min(headerEndIndex, facturaIndex);

// Si no encontramos ninguna marca, usar las primeras 15 líneas
if (headerEndIndex === cleanedLines.length) headerEndIndex = 15;

const headerLinesForNIT = cleanedLines.slice(0, headerEndIndex);
const headerLines = headerLinesForNIT;

console.log(`🔍 Buscando NIT y PROVEEDOR en zona del EMISOR (líneas 0-${headerEndIndex})`);
if (datosCompradorIndex > 0) console.log(`   📍 DATOS DEL COMPRADOR detectado en línea ${datosCompradorIndex}`);
if (datosCertificadorIndex > 0) console.log(`   📍 DATOS DEL CERTIFICADOR detectado en línea ${datosCertificadorIndex}`);

// === EXTRACCIÓN DE NIT ===
// MEJORA: Buscar solo NITs con formato "NIT:" explícito primero (más confiable)
// IMPORTANTE: Solo del EMISOR/PROVEEDOR, NO del comprador (puede ser CF)
const nitPatterns = [
  /(?:NIT|N\.I\.T\.|N\. I\. T\.|N\.I\.T|N I T)\s*:\s*(\d{6,12}-?[0-9K])/i,  // Todas las variaciones con ":"
  /Nit\s*\.\s*\\?\s*(\d{6,12}-?[0-9K])/i,           // "Nit.\\452158-7" o "Nit.452158-7"
  /(?:NIT|N\.I\.T\.|N\. I\. T\.)\s+(\d{6,12}-?[0-9K])/i,  // Con espacio en lugar de ":"
  /\b(\d{7,12}-[0-9K])\b/                            // Con guión (última prioridad)
];

// Lista de palabras que indican que NO es el NIT del proveedor
const nitExclusionKeywords = [
  'comprador', 'cliente', 'receptor', 'certificador', 'consumidor final',
  'c/f', 'cf', 'c.f.', 'digitafact', 'infile'
];

// Buscar NIT en las líneas del EMISOR solamente
for (const pattern of nitPatterns) {
  for (let idx = 0; idx < headerLinesForNIT.length; idx++) {
    const line = headerLinesForNIT[idx];
    
    // VALIDACIÓN CRÍTICA: Verificar que la línea no contenga palabras de exclusión
    const lineForCheck = line.toLowerCase();
    const hasExclusionKeyword = nitExclusionKeywords.some(keyword => lineForCheck.includes(keyword));
    
    if (hasExclusionKeyword) {
      console.log(`  ⏭️ Línea ${idx} ignorada (contiene keyword de exclusión): "${line}"`);
      continue;
    }
    
    // VALIDACIÓN EXTRA: Si encontramos palabras de otras secciones, salir completamente
    if (/datos\s+del\s+(certificador|comprador|cliente)/i.test(line)) {
      console.log(`  🛑 Encontrada sección "${line.trim()}" - fin de búsqueda de NIT del emisor`);
      break;
    }
    
    // Ignorar líneas con indicadores de otras secciones
    if (/certificador|cliente|digitafact|infile|nombre\s*:/i.test(line)) {
      console.log(`  ⏭️ Línea ${idx} ignorada (posible otra sección): "${line}"`);
      continue;
    }
    
    const match = line.match(pattern);
    if (match && match[1]) {
      let nit = match[1].replace(/[^\dK-]/gi, '');
      
      // Validar longitud razonable (NIT guatemalteco)
      if (nit.length < 6 || nit.length > 13) {
        console.log(`  ⚠️ NIT descartado por longitud: "${nit}" (${nit.length} caracteres)`);
        continue;
      }
      
      // Formatear NIT si no tiene guión (agregar guión antes del último dígito)
      if (!/\-/.test(nit) && nit.length >= 6) {
        const lastChar = nit.slice(-1);
        const numbers = nit.slice(0, -1);
        nit = `${numbers}-${lastChar}`;
      }
      
      extractedData.nit = nit.toUpperCase();
      console.log(`✅ NIT del PROVEEDOR encontrado en línea ${idx}: ${extractedData.nit}`);
      console.log(`   Línea original: "${line}"`);
      break;
    }
  }
  if (extractedData.nit) break;
}

if (!extractedData.nit) {
  console.log('⚠️ No se pudo extraer el NIT del proveedor');
}

// === EXTRACCIÓN DE PROVEEDOR ===
console.log(`🔍 Buscando PROVEEDOR en zona del EMISOR...`);

// ESTRATEGIA: Tomar la PRIMERA línea válida del emisor (generalmente el nombre de la empresa)
// MEJORA: Combinar líneas si el nombre continúa
for (let idx = 0; idx < headerLines.length; idx++) {
  const line = headerLines[idx].trim();
  
  // CRÍTICO: Detener si encontramos secciones de datos
  if (/datos\s+del\s+(comprador|certificador|cliente)/i.test(line)) {
    console.log(`  🛑 Fin de búsqueda de proveedor (encontrada sección: "${line}")`);
    break;
  }
  
  // Ignorar líneas que claramente NO son nombres de proveedor
  if (line.length < 5 || // Muy corta
      /^\d+$/.test(line) || // Solo números
      /^NIT\s*:/i.test(line) || // Empieza con "NIT:"
      /shell\s+licensee/i.test(line) || // Ignorar título "Shell Licensee" (no es razón social)
      /^FECHA|^DOCUMENTO|^SERIE|^DTE|^\|/i.test(line)) { // Campos de factura o separadores
    console.log(`  Línea ${idx} ignorada: "${line}"`);
    continue;
  }
  
  // Limpiar NIT si está en la misma línea
  let supplierName = line.replace(/\s*N\.?I\.?T\.?\s*:?\s*[\d-]+.*$/i, '').trim();
  
  // MEJORA: Si la siguiente línea parece continuación del nombre, combinarlas
  if (idx + 1 < headerLines.length) {
    const nextLine = headerLines[idx + 1].trim();
    // Si la línea actual termina con preposiciones o palabras incompletas y la siguiente es texto
    if (/\b(de|del|la|los|las|y|e)$/i.test(supplierName) && 
        nextLine.length > 3 && 
        !/^NIT|^FECHA|^DOCUMENTO|^SERIE|^DTE|^\||^\d+$/i.test(nextLine)) {
      const nextCleaned = nextLine.replace(/\s*N\.?I\.?T\.?\s*:?\s*[\d-]+.*$/i, '').trim();
      supplierName = `${supplierName} ${nextCleaned}`.trim();
      console.log(`  Combinando líneas ${idx} y ${idx+1}: "${supplierName}"`);
    }
  }
  
  // Aceptar si tiene longitud razonable
  if (supplierName.length >= 5 && supplierName.length < 150) {
    extractedData.supplier = supplierName;
    console.log(`✅ Proveedor encontrado en línea ${idx}: "${extractedData.supplier}"`);
    break;
  }
}

// FALLBACK: Buscar líneas con terminaciones empresariales típicas
if (!extractedData.supplier) {
  console.log('🔍 Buscando con fallback (patrones empresariales)...');
  for (let idx = 0; idx < Math.min(8, headerLines.length); idx++) {
    const line = headerLines[idx].trim();
    
    // Buscar S.A., LTDA, CIA, etc.
    if (/S\.?\s*A\.?|LTDA|C\.?\s*A\.?|SOCIEDAD|COMPAÑIA/i.test(line)) {
      let supplierName = line.replace(/\s*N\.?I\.?T\.?\s*:?\s*[\d-]+.*$/i, '').trim();
      
      if (supplierName.length > 5 && supplierName.length < 100) {
        extractedData.supplier = supplierName;
        console.log(`✅ Proveedor encontrado (patrón empresa) en línea ${idx}: "${extractedData.supplier}"`);
        break;
      }
    }
  }
}

if (!extractedData.supplier) {
  console.log('⚠️ No se pudo extraer el proveedor');
}
// NIT    


//serie y invoice
// MEJORA: Si tenemos UUID, podemos usarlo como referencia alternativa
if (extractedData.uuid && !extractedData.serie) {
  console.log('💡 Factura FEL detectada (UUID presente), serie puede estar en formato diferente');
}

const cleanNumber = (num: string): string => num.replace(/[,\s]/g, '');

// ESTRATEGIA: Buscar Serie y Número en la ZONA DE FACTURA (parte inferior)
// En facturas FEL guatemaltecas, los datos oficiales están después de "FACTURA" o "DOCUMENTO TRIBUTARIO"
const facturaZoneStart = cleanedLines.findIndex(line => 
  /FACTURA|DOCUMENTO\s+TRIBUTARIO/i.test(line.trim())
);

const searchStartIndex = facturaZoneStart > 0 ? facturaZoneStart : 0;
const linesForSerieNumber = facturaZoneStart > 0 
  ? cleanedLines.slice(searchStartIndex, Math.min(searchStartIndex + 15, cleanedLines.length))
  : cleanedLines;

console.log(`🔍 Buscando Serie/Número desde línea ${searchStartIndex} (${linesForSerieNumber.length} líneas)`);
if (facturaZoneStart > 0) {
  console.log(`  📍 Zona FACTURA detectada en línea ${facturaZoneStart}`);
}

// PASO 1: Buscar patrones combinados (SERIE y NÚMERO en la misma línea)
const combinedPatterns = [
  /SERIE\s*[:#]?\s*([A-Z0-9\-]+)\s+N[ÚUúu]MERO\s*[:#]?\s*([\d,]+)/i,
  /Serie\s*[:#]?\s*([A-Z0-9\-]+)\s+N[úuÚU]mero\s*[:#]?\s*([\d,]+)/i,
  /Serie\s+([A-Z0-9\-]+)\s+Numero\s+([\d,]+)/i, // Sin :
  /SERIE\s+([A-Z0-9\-]+)\s+NUMERO\s+([\d,]+)/i, // Sin :
  /SERIE\s*::\s*([A-Z0-9\-]+)\s+N[ÚUúu]MERO\s*::\s*([\d,]+)/i, // Con ::
  /Serie\s*::\s*([A-Z0-9\-]+)\s+N[úuÚU]mero\s*::\s*([\d,]+)/i, // Con ::
  // NUEVO: Patrones para Shell: "DTE | FACTURA | 8A8A1BDG 2512501951"
  /FACTURA\s*\|\s*([A-Z0-9]+)\s+(\d{10,})/i,
  /\|\s*FACTURA\s*\|\s*([A-Z0-9]+)\s+(\d{10,})/i,
  /DTE\s*\|\s*FACTURA\s*\|\s*([A-Z0-9]+)\s+(\d{10,})/i,
  // Patrones adicionales para detectar serie alfanumérica seguida de número largo
  /\b([A-Z0-9]{8,12})\s+(\d{10,14})\b/i // 8A8A1BDG 2512501951
];

// PASO 2: Buscar patrones individuales de serie
const seriePatterns = [
  // Formato más común: "Serie D93AD945" o "Serie: D93AD945"
  /Serie\s*:?\s*([A-Z0-9]{6,12})\b/i,
  /SERIE\s*:?\s*([A-Z0-9]{6,12})\b/i,
  // Con dos puntos
  /Serie\s*:\s*([A-Z0-9\-]+)/i,
  /SERIE\s*:\s*([A-Z0-9\-]+)/i,
  // Con doble dos puntos ::
  /Serie\s*::\s*([A-Z0-9\-]+)/i,
  /SERIE\s*::\s*([A-Z0-9\-]+)/i,
  // OCR puede confundir letras
  /S[E3R|I1]{4}\s*[:\s]*([A-Z0-9\-]{4,20})/i
];

// PASO 3: Buscar patrones de número - AMPLIADOS
const numberPatterns = [
  // Formato más común: "Factura No.4134487432" o "Factura No. 4134487432"
  /Factura\s+No\.?\s*(\d{10,})/i,
  /Factura\s+N[°oO]\.?\s*(\d{10,})/i,
  // Con dos puntos
  /No\s*:\s*([\d,]+)/i,
  /No:([\d,]+)/i,
  /No\.\s*([\d,]+)/i,
  /N[°oO]\s*:\s*([\d,]+)/i,
  /N[°oO]:([\d,]+)/i,
  // Patrones "Número" con acentos
  /N[úuÚU]mero\s*[:#]?\s*(\d{5,})/i,
  /Numero\s*[:#]?\s*(\d{5,})/i,
  /N[úuÚU]mero:([\d,]+)/i,
  /Numero:([\d,]+)/i,
  // Con doble dos puntos ::
  /N[úuÚU]mero\s*::\s*(\d{5,})/i,
  /Numero\s*::\s*(\d{5,})/i,
  // Número de DTE
  /N[úuÚU]mero\s+de\s+DTE\s*[:#]?\s*(\d+)/i,
  /Numero\s+de\s+DTE\s*[:#]?\s*(\d+)/i,
  // Genéricos
  /N[ÚU]MERO\s*[:#]?\s*([\d,]+)/i,
  /DTE\s*[:#]?\s*([\d,]+)/i,
  /FACTURA\s*N[°oO]?\s*[:#]?\s*([\d,]+)/i
];

// Procesar líneas en la zona de FACTURA
for (let i = 0; i < linesForSerieNumber.length; i++) {
  let line = linesForSerieNumber[i].trim();
  const actualLineIndex = searchStartIndex + i;
  
  // Debug mejorado
  if (/N[úuÚU]mero|Serie/i.test(line)) {
    console.log(`Línea ${actualLineIndex}: "${line}" (longitud: ${line.length})`);
    // Mostrar códigos de caracteres para debug
    if (/N[úuÚU]mero[:#]/i.test(line)) {
      console.log(`  Caracteres alrededor de ":",`, line.split('').map(c => c.charCodeAt(0)));
    }
  }
  
  // Manejar caso donde el valor está en la línea siguiente
  let nextLine = (i + 1 < linesForSerieNumber.length) ? linesForSerieNumber[i + 1].trim() : '';
  
  // PRIMERO: Buscar patrones combinados
  if (!extractedData.serie || !extractedData.invoiceNumber) {
    for (const pattern of combinedPatterns) {
      const match = line.match(pattern);
      if (match) {
        extractedData.serie = match[1].toUpperCase();
        extractedData.invoiceNumber = cleanNumber(match[2]);
        console.log(`✓ Serie y Número juntos: ${extractedData.serie} - ${extractedData.invoiceNumber}`);
        break;
      }
    }
  }
  
  // SEGUNDO: Buscar Serie individual
  if (!extractedData.serie) {
    // Caso mismo línea
    for (const pattern of seriePatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        if (match[1].length <= 20) {
          extractedData.serie = match[1].toUpperCase();
          console.log(`✓ Serie encontrada: ${extractedData.serie}`);
          break;
        }
      }
    }
    
    // Caso valor en línea siguiente (ej. "Serie:" sola, valor abajo)
    if (!extractedData.serie && /Serie\s*[:#]?\s*$/i.test(line) || /SERIE\s*[:#]?\s*$/i.test(line) || /Serie\s*::\s*$/i.test(line) || /SERIE\s*::\s*$/i.test(line)) {
      const valueMatch = nextLine.match(/([A-Z0-9\-]+)/i);
      if (valueMatch && valueMatch[1] && valueMatch[1].length <= 20) {
        extractedData.serie = valueMatch[1].toUpperCase();
        console.log(`✓ Serie encontrada en línea siguiente: ${extractedData.serie}`);
        i++; // Saltar la siguiente línea ya procesada
      }
    }
  }
  
  // TERCERO: Buscar Número individual con patrones mejorados
  if (!extractedData.invoiceNumber) {
    // Caso mismo línea
    for (const pattern of numberPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const cleanedNumber = cleanNumber(match[1]);
        if (/^\d+$/.test(cleanedNumber) && cleanedNumber.length >= 5) {
          extractedData.invoiceNumber = cleanedNumber;
          console.log(`✓ Número encontrado con patrón: ${extractedData.invoiceNumber}`);
          break;
        }
      }
    }
    
    // Caso valor en línea siguiente (ej. "Número:" sola, valor abajo)
    if (!extractedData.invoiceNumber && /N[úuÚU]mero\s*[:#]?\s*$/i.test(line) || /Numero\s*[:#]?\s*$/i.test(line) || /N[úuÚU]mero\s*::\s*$/i.test(line) || /Numero\s*::\s*$/i.test(line)) {
      const valueMatch = nextLine.match(/([\d,]+)/);
      if (valueMatch && valueMatch[1]) {
        const cleanedNumber = cleanNumber(valueMatch[1]);
        if (/^\d+$/.test(cleanedNumber) && cleanedNumber.length >= 5) {
          extractedData.invoiceNumber = cleanedNumber;
          console.log(`✓ Número encontrado en línea siguiente: ${extractedData.invoiceNumber}`);
          i++; // Saltar la siguiente línea ya procesada
        }
      }
    }
    
    // Si no funcionó, intentar método más agresivo
    if (!extractedData.invoiceNumber) {
      // Buscar "Número" seguido de cualquier cosa que parezca un número
      const aggressiveMatch = line.match(/N[úuÚU]mero\s*[:#]?\s*(\d[\d,]*)/i);
      if (aggressiveMatch && aggressiveMatch[1]) {
        const cleanedNumber = cleanNumber(aggressiveMatch[1]);
        if (/^\d+$/.test(cleanedNumber) && cleanedNumber.length >= 5) {
          extractedData.invoiceNumber = cleanedNumber;
          console.log(`✓ Número encontrado (método agresivo): ${extractedData.invoiceNumber}`);
        }
      }
    }
  }
  
  // Salir si ya tenemos ambos
  if (extractedData.serie && extractedData.invoiceNumber) {
    break;
  }
}

// FALLBACK: Si no encontramos Serie/Número en zona FACTURA, buscar en TODO el documento
// Esto maneja facturas como Shell donde Serie/Número están ANTES de la palabra "FACTURA"
if ((!extractedData.serie || !extractedData.invoiceNumber) && facturaZoneStart > 0) {
  console.log('🔄 FALLBACK: Buscando Serie/Número en todo el documento...');
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    let nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
    
    // Buscar Serie si no la tenemos
    if (!extractedData.serie) {
      for (const pattern of seriePatterns) {
        const match = line.match(pattern);
        if (match && match[1] && match[1].length <= 20) {
          extractedData.serie = match[1].toUpperCase();
          console.log(`✓ Serie encontrada (fallback) en línea ${i}: ${extractedData.serie}`);
          break;
        }
      }
    }
    
    // Buscar Número si no lo tenemos
    if (!extractedData.invoiceNumber) {
      for (const pattern of numberPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const cleanedNumber = cleanNumber(match[1]);
          if (/^\d+$/.test(cleanedNumber) && cleanedNumber.length >= 5 && cleanedNumber.length <= 15) {
            extractedData.invoiceNumber = cleanedNumber;
            console.log(`✓ Número encontrado (fallback) en línea ${i}: ${extractedData.invoiceNumber}`);
            break;
          }
        }
      }
    }
    
    // Salir si ya tenemos ambos
    if (extractedData.serie && extractedData.invoiceNumber) {
      console.log('✅ Serie y Número encontrados con fallback');
      break;
    }
  }
}

//serie y invoice

      // === EXTRACCIÓN DE FECHA ===
      // Patrones mejorados para diferentes formatos de fecha
      const datePatterns = [
        // Formato: "Fecha 11-01-2026" o "Fecha: 11-01-2026"
        /Fecha\s*:?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/i,
        // Formato: "FECHA DE EMISIÓN: 19/12/2025"
        /FECHA\s+DE\s+EMISI[OÓ]N\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /FECHA\s+DE\s+EMISI[OÓ]N\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        // Formato genérico con "FECHA"
        /FECHA\s*[A-Z\s]*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        // Formato con "EMISIÓN"
        /EMISI[OÓ]N\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        // Formato con hora: "11/01/2026 18:45:35"
        /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\s+\d{2}:\d{2}/,
        // Cualquier fecha que parezca válida
        /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/
      ];

      for (const pattern of datePatterns) {
        for (const line of cleanedLines) {
          const match = line.match(pattern);
          if (match && match[1]) {
            // Validar fecha
            const dateStr = match[1];
            const parts = dateStr.split(/[\/\-]/);
            if (parts.length === 3) {
              const day = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10);
              let year = parseInt(parts[2], 10);
              
              if (year < 100) year += year < 50 ? 2000 : 1900;
              
              if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2030) {
                extractedData.date = dateStr;
                console.log(`📅 Fecha encontrada: ${dateStr} (línea: "${line.substring(0, 50)}...")`);
                break;
              }
            }
          }
        }
        if (extractedData.date) break;
      }

    // === EXTRACCIÓN DE MONEDA ===
    console.log('💱 === DETECTANDO MONEDA ===');
    extractedData.currency = detectCurrency(cleanedLines);
    if (extractedData.currency) {
      console.log(`💱 Moneda detectada: ${extractedData.currency}`);
    } else {
      console.log('💱 No se detectó moneda específica, usando GTQ por defecto');
      extractedData.currency = 'GTQ'; // Default para Guatemala
    }

    // === EXTRACCIÓN DE MONTO TOTAL ===
    const allWords: Word[] = [];
    if (result.blocks && result.blocks.length > 0) {
      result.blocks.forEach(block => {
        block.lines.forEach(line => {
          line.elements.forEach(element => {
            if (element.frame) {
              allWords.push({ text: element.text, frame: element.frame });
            }
          });
        });
      });
    }


    // MEJORA: Usar método de coordenadas espaciales primero (mejor para facturas largas)
    // Fallback a búsqueda por líneas si falla
    // NUEVO: Reverse search mejorado para detectar propina/servicio
    const amountByCords = findFinalTotal(allWords);
    const amountByLines = amountByCords ? null : findFinalTotalByLines(lines);
    extractedData.amount = amountByCords || amountByLines || '';
    console.log('💰 Método de extracción usado:', amountByCords ? 'COORDENADAS' : (amountByLines ? 'LÍNEAS' : 'NINGUNO'));
    console.log('💰 Monto extraído:', extractedData.amount);
    
    // MEJORA NUEVA: Si hay UUID FEL, validar que el monto sea el TOTAL final (no subtotal)
    if (extractedData.uuid && extractedData.amount) {
      console.log('🔍 Validando monto para factura FEL...');
      const validatedAmount = validateFELTotal(lines, extractedData.amount);
      if (validatedAmount && validatedAmount !== extractedData.amount) {
        console.log('💰 Monto corregido de', extractedData.amount, 'a', validatedAmount);
        extractedData.amount = validatedAmount;
      }
    }
    
    // NUEVO: Validar descuentos aplicados
    const discountInfo = detectDiscount(lines);
    if (discountInfo) {
      console.log(`💸 Descuento detectado: Q${discountInfo.amount} (${discountInfo.percentage || '?'}%)`);
      // El total ya debería incluir el descuento, solo informar
      console.log(`   Subtotal antes de descuento: Q${discountInfo.subtotal || '?'}`);
    }



     // === EXTRACCIÓN DE IVA ===
    const ivaPatterns = [
      /I\.?V\.?A\.?\s*:?\s*Q?\s*([0-9,]+\.?[0-9]*)/i,
      /IMPUESTO\s+AL\s+VALOR\s+AGREGADO\s*:?\s*Q?\s*([0-9,]+\.?[0-9]*)/i
    ];

    for (const pattern of ivaPatterns) {
      for (const line of lines) {
        const match = line.match(pattern);
        if (match && match[1]) {
          extractedData.iva = match[1].replace(/,/g, '');
          break;
        }
      }
      if (extractedData.iva) break;
    }

    // Calcular IVA si no se encontró (12% estándar en Guatemala)
    if (!extractedData.iva && extractedData.amount) {
      const total = parseFloat(extractedData.amount);
      if (!isNaN(total) && total > 0) {
        const ivaRate = 0.12;
        const calculatedIva = (total * ivaRate / (1 + ivaRate)).toFixed(2);
        extractedData.iva = calculatedIva;
        console.log(`IVA calculado: ${calculatedIva} (12% del total ${total})`);
      }
    }

    // === EXTRACCIÓN DE DESCRIPCIÓN Y PRODUCTOS ===
    // MEJORA: Detectar formato columnar (descripción - cantidad - precio - total)
    const products = extractProducts(lines);
    
    if (products.length > 0) {
      // Concatenar nombres de productos como descripción
      extractedData.description = products.map(p => p.name).join(', ');
      console.log(`📦 ${products.length} productos extraídos:`, extractedData.description);
    } else {
      // Fallback al método anterior
      console.log('📦 Usando método legacy para descripción...');
      const descriptionStartWords = ['DESCRIPCI', 'DETALLE', 'CONCEPTO', 'PRODUCTOS', 'SERVICIOS'];
      const descriptionEndWords = ['SUBTOTAL', 'TOTAL', 'IVA', 'IMPORTE', 'CANTIDAD'];

      let startIdx = -1;
      let endIdx = lines.length;

      // Encontrar inicio de descripción
      for (let i = 0; i < lines.length; i++) {
        if (descriptionStartWords.some(word => lines[i].toUpperCase().includes(word))) {
          startIdx = i + 1;
          break;
        }
      }

      // Encontrar final de descripción
      if (startIdx !== -1) {
        for (let i = startIdx; i < lines.length; i++) {
          if (descriptionEndWords.some(word => lines[i].toUpperCase().includes(word))) {
            endIdx = i;
            break;
          }
        }

        const descriptionLines = lines.slice(startIdx, endIdx)
          .filter(line => {
            // Filtrar líneas que no son solo números o precios
            return line.length > 2 && 
                   !/^[Q\$]?\s*[0-9,\.]+\s*$/.test(line) &&
                   !/^\s*[0-9]+\s*$/.test(line);
          });
        
        extractedData.description = descriptionLines.join(', ').trim();
      }
    }

    // === LOGGING Y ACTUALIZACIÓN DE ESTADOS ===
    console.log("Datos extraídos:", extractedData);

    // Parsear fecha si existe
    let parsedDate = date; // Mantener fecha actual por defecto
    if (extractedData.date) {
      const parts = extractedData.date.split(/[\/\-]/);
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
        let year = parseInt(parts[2], 10);
        
        if (year < 100) {
          year += year < 50 ? 2000 : 1900;
        }
        
        parsedDate = new Date(year, month, day);
        console.log("Fecha parseada:", parsedDate);
      }
    }

    // Actualizar TODOS los estados en un solo batch usando setTimeout para asegurar que React procese las actualizaciones
    setTimeout(() => {
      if (extractedData.uuid) {
        console.log("Actualizando UUID:", extractedData.uuid);
        setUuid(extractedData.uuid);
      }
      
      if (extractedData.nit) {
        console.log("Actualizando NIT:", extractedData.nit);
        setVatNumber(extractedData.nit);
      }
      
      if (extractedData.amount) {
        console.log("Actualizando monto:", extractedData.amount);
        setAmount(extractedData.amount);
      }
      
      if (extractedData.supplier) {
        console.log("Actualizando proveedor:", extractedData.supplier);
        setSupplier(extractedData.supplier);
      }
      
      if (extractedData.serie) {
        console.log("Actualizando serie:", extractedData.serie);
        setSerie(extractedData.serie);
      }
      
      if (extractedData.invoiceNumber) {
        console.log("Actualizando número de factura:", extractedData.invoiceNumber);
        setNoinvoice(extractedData.invoiceNumber);
      }
      
      if (extractedData.iva) {
        console.log("Actualizando IVA:", extractedData.iva);
        setTotiva(extractedData.iva);
      }
      
      if (extractedData.date) {
        console.log("Actualizando fecha:", parsedDate);
        setDate(parsedDate);
      }
      
      if (extractedData.description) {
        console.log("Actualizando notas con datos OCR:", extractedData.description);
        setNotes(extractedData.description);
      }
      
      if (extractedData.currency) {
        console.log("Actualizando moneda:", extractedData.currency);
        setCurrency(extractedData.currency);
      }
    }, 100);

    // Mostrar resumen de extracción
    setShowMoreDetails(true);
    const extractedCount = Object.values(extractedData).filter(value => value).length;
    alert(`Datos extraídos exitosamente!\n${extractedCount}/9 campos encontrados.\nPor favor, verifique los datos.`);

  } catch (error) {
    console.error("Error al extraer datos con ML Kit:", error);
    alert('Error al procesar la imagen. Inténtelo manualmente o revise la conexión.');
  } finally {
    setIsLoading(false);
  }
};


// NUEVA FUNCIÓN: Detectar moneda en la factura
function detectCurrency(lines: string[]): string {
  console.log('💱 === DETECTANDO MONEDA ===');
  
  let currencyScores = {
    'GTQ': 0,  // Quetzal guatemalteco
    'USD': 0,  // Dólar estadounidense
    'EUR': 0   // Euro
  };
  
  // Buscar en las primeras 30 líneas (encabezado) y últimas 20 líneas (totales)
  const searchLines = [
    ...lines.slice(0, 30),
    ...lines.slice(-20)
  ];
  
  for (const line of searchLines) {
    const upperLine = line.toUpperCase();
    
    // === DETECCIÓN DE GTQ (QUETZAL) ===
    // Símbolo "Q" seguido de número (muy común en Guatemala)
    if (/\bQ\s*\d+/i.test(line)) {
      currencyScores.GTQ += 15;
    }
    
    // Palabra "QUETZAL" o "QUETZALES"
    if (/QUETZAL/i.test(line)) {
      currencyScores.GTQ += 20;
    }
    
    // "GTQ" explícito
    if (/\bGTQ\b/i.test(line)) {
      currencyScores.GTQ += 25;
    }
    
    // Palabras clave de Guatemala
    if (/GUATEMALA|GUATEMALTEC/i.test(line)) {
      currencyScores.GTQ += 5;
    }
    
    // === DETECCIÓN DE USD (DÓLAR) ===
    // Símbolo "$" seguido de número
    if (/\$\s*\d+/.test(line)) {
      currencyScores.USD += 10;
    }
    
    // Palabra "DOLLAR" o "DOLAR"
    if (/DOLLAR|D[ÓO]LAR/i.test(line)) {
      currencyScores.USD += 20;
    }
    
    // "USD" explícito
    if (/\bUSD\b/i.test(line)) {
      currencyScores.USD += 25;
    }
    
    // "US$" o "U.S.$"
    if (/US\$|U\.S\.\$/.test(line)) {
      currencyScores.USD += 25;
    }
    
    // Frases comunes con dólares
    if (/AMERICAN\s+DOLLAR|UNITED\s+STATES|ESTADOS\s+UNIDOS/i.test(line)) {
      currencyScores.USD += 10;
    }
    
    // === DETECCIÓN DE EUR (EURO) ===
    // Símbolo "€" 
    if (/€/.test(line)) {
      currencyScores.EUR += 20;
    }
    
    // Palabra "EURO"
    if (/\bEURO\b/i.test(line)) {
      currencyScores.EUR += 20;
    }
    
    // "EUR" explícito
    if (/\bEUR\b/i.test(line)) {
      currencyScores.EUR += 25;
    }
  }
  
  console.log('💱 Scores de monedas:', currencyScores);
  
  // Determinar ganador
  const winner = Object.entries(currencyScores).reduce((prev, curr) => 
    curr[1] > prev[1] ? curr : prev
  );
  
  // Solo retornar si el score es significativo (mayor a 10)
  if (winner[1] >= 10) {
    console.log(`💱 Moneda detectada: ${winner[0]} (score: ${winner[1]})`);
    return winner[0];
  }
  
  console.log('💱 No se detectó moneda con confianza suficiente');
  return ''; // Retornar vacío si no hay detección clara
}


// NUEVA FUNCIÓN: Extraer productos en formato columnar
function extractProducts(lines: string[]): Array<{ name: string; quantity: number; price: number; total: number }> {
  console.log('📦 === EXTRAYENDO PRODUCTOS (FORMATO COLUMNAR) ===');
  
  const products: Array<{ name: string; quantity: number; price: number; total: number }> = [];
  
  // Palabras que marcan el inicio de la zona de productos
  const startKeywords = ['ORDEN', 'DETALLE', 'DESCRIPCION', 'PRODUCTO', 'ARTICULO', 'ITEM'];
  
  // Palabras que marcan el fin de la zona de productos
  const endKeywords = ['DESCUENTO', 'SUBTOTAL', 'TOTAL', 'IVA', 'IMPUESTO', 'MEDIOS DE PAGO'];
  
  let startIdx = -1;
  let endIdx = lines.length;
  
  // Encontrar zona de productos
  for (let i = 0; i < lines.length; i++) {
    const upperLine = lines[i].toUpperCase().trim();
    
    // Buscar inicio (debe contener alguna keyword de inicio)
    if (startIdx === -1) {
      for (const keyword of startKeywords) {
        if (upperLine.includes(keyword)) {
          startIdx = i + 1;
          console.log(`  🎯 Inicio de productos en línea ${i}: "${lines[i]}"`);
          break;
        }
      }
    }
    
    // Buscar fin
    if (startIdx !== -1 && endIdx === lines.length) {
      for (const keyword of endKeywords) {
        if (upperLine.includes(keyword) && i > startIdx) {
          endIdx = i;
          console.log(`  🛑 Fin de productos en línea ${i}: "${lines[i]}"`);
          break;
        }
      }
    }
  }
  
  // Si no encontramos inicio explícito, intentar detectar automáticamente
  if (startIdx === -1) {
    console.log('  ⚠️ No se encontró inicio explícito, buscando primera línea de producto...');
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      // Buscar líneas que tengan el patrón: TEXTO NUMERO NUMERO NUMERO
      // Ej: "PEPPERONI DOG CERDO 3 25.99 77.97"
      if (looksLikeProductLine(lines[i])) {
        startIdx = i;
        console.log(`  🎯 Inicio automático en línea ${i}: "${lines[i]}"`);
        break;
      }
    }
  }
  
  if (startIdx === -1 || endIdx <= startIdx) {
    console.log('  ❌ No se pudo determinar zona de productos');
    return products;
  }
  
  console.log(`  📍 Procesando líneas ${startIdx} a ${endIdx}`);
  
  // Procesar cada línea en la zona de productos
  for (let i = startIdx; i < endIdx; i++) {
    const line = lines[i].trim();
    
    // Ignorar líneas muy cortas o vacías
    if (line.length < 3) continue;
    
    // Intentar parsear como producto
    const product = parseProductLine(line);
    if (product) {
      products.push(product);
      console.log(`  ✅ Producto: ${product.name} | Cant: ${product.quantity} | Precio: ${product.price} | Total: ${product.total}`);
    }
  }
  
  console.log(`  📦 Total de productos extraídos: ${products.length}`);
  return products;
}

// Detectar si una línea parece ser un producto
function looksLikeProductLine(line: string): boolean {
  // Debe tener al menos un texto seguido de números
  // Patrón: TEXTO [NÚMEROS] [NÚMEROS] [NÚMEROS]
  const pattern = /[a-zA-ZÁ-ÿ]{3,}.*?\d+.*?\d+\.\d{2}/;
  return pattern.test(line);
}

// Parsear línea de producto en formato columnar
function parseProductLine(line: string): { name: string; quantity: number; price: number; total: number } | null {
  // Formato típico de Guatemala:
  // PEPPERONI "DOG" CERDO    3    25.99    77.97
  // PAPALINAS SHELL SELECT 60G    3    11.50    34.50
  // COCA COLA LATA    3    6.50    19.50
  
  // Extraer todos los números con decimales de la línea
  const numberMatches = line.match(/\d+(?:[.,]\d+)?/g);
  
  if (!numberMatches || numberMatches.length < 2) {
    return null; // Necesitamos al menos 2 números (cantidad y precio o precio y total)
  }
  
  // Convertir números a formato estándar
  const numbers = numberMatches.map(n => parseFloat(n.replace(',', '.')));
  
  // Validar que tengamos números válidos
  if (numbers.some(n => isNaN(n))) return null;
  
  let quantity = 0;
  let price = 0;
  let total = 0;
  let name = '';
  
  // CASO 1: Tenemos 3 números -> cantidad, precio unitario, total
  if (numbers.length >= 3) {
    quantity = numbers[numbers.length - 3];
    price = numbers[numbers.length - 2];
    total = numbers[numbers.length - 1];
    
    // Extraer nombre (todo antes del primer número)
    const firstNumberMatch = line.match(/\d+/);
    if (firstNumberMatch) {
      const firstNumberIndex = line.indexOf(firstNumberMatch[0]);
      name = line.substring(0, firstNumberIndex).trim();
    }
  }
  // CASO 2: Tenemos 2 números -> asumir cantidad y total (sin precio unitario explícito)
  else if (numbers.length === 2) {
    quantity = numbers[0];
    total = numbers[1];
    price = total / quantity;
    
    // Extraer nombre
    const firstNumberMatch = line.match(/\d+/);
    if (firstNumberMatch) {
      const firstNumberIndex = line.indexOf(firstNumberMatch[0]);
      name = line.substring(0, firstNumberIndex).trim();
    }
  }
  
  // Validaciones
  if (!name || name.length < 3) return null;
  if (quantity <= 0 || quantity > 10000) return null; // Cantidad razonable
  if (price < 0 || price > 1000000) return null; // Precio razonable
  if (total < 0 || total > 1000000) return null; // Total razonable
  
  // Validar que cantidad * precio ≈ total (con tolerancia del 10% por redondeos)
  const expectedTotal = quantity * price;
  const tolerance = expectedTotal * 0.1;
  if (Math.abs(total - expectedTotal) > tolerance && numbers.length >= 3) {
    // Si no valida, podría no ser una línea de producto
    return null;
  }
  
  return { name, quantity, price, total };
}

// NUEVA FUNCIÓN: Detectar descuentos aplicados
function detectDiscount(lines: string[]): { amount: number; percentage?: number; subtotal?: number } | null {
  console.log('💸 === DETECTANDO DESCUENTOS ===');
  
  const discountPatterns = [
    /Descuento\s+Aplicado\s*\(-?\)\s*Q?\s*:?\s*(\d+(?:[.,]\d{2})?)/i,
    /Descuento\s*\(-?\)\s*Q?\s*:?\s*(\d+(?:[.,]\d{2})?)/i,
    /DESCUENTO\s*:?\s*-?\s*Q?\s*(\d+(?:[.,]\d{2})?)/i,
    /Desc\.\s*:?\s*-?\s*Q?\s*(\d+(?:[.,]\d{2})?)/i,
    /Dto\.\s*:?\s*-?\s*Q?\s*(\d+(?:[.,]\d{2})?)/i
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    for (const pattern of discountPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const discountAmount = parseFloat(match[1].replace(',', '.'));
        
        if (!isNaN(discountAmount) && discountAmount > 0) {
          console.log(`  ✅ Descuento encontrado: Q${discountAmount} en línea: "${line}"`);
          
          // Intentar calcular porcentaje si encontramos el subtotal
          const subtotalPattern = /SUBTOTAL\s*:?\s*Q?\s*(\d+(?:[.,]\d{2})?)/i;
          for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 5); j++) {
            const subtotalMatch = lines[j].match(subtotalPattern);
            if (subtotalMatch && subtotalMatch[1]) {
              const subtotal = parseFloat(subtotalMatch[1].replace(',', '.'));
              if (!isNaN(subtotal) && subtotal > 0) {
                const percentage = ((discountAmount / subtotal) * 100).toFixed(1);
                console.log(`  📊 Subtotal: Q${subtotal}, Descuento: ${percentage}%`);
                return { amount: discountAmount, percentage: parseFloat(percentage), subtotal };
              }
            }
          }
          
          return { amount: discountAmount };
        }
      }
    }
  }
  
  console.log('  ℹ️ No se detectaron descuentos');
  return null;
}

// NUEVA FUNCIÓN: Validar total en facturas FEL (con propina/servicio)
function validateFELTotal(lines: string[], currentAmount: string): string | null {
  console.log('🔍 Validando si hay propina/servicio después del subtotal...');
  
  // Buscar de abajo hacia arriba (reverse search)
  const reversedLines = [...lines].reverse();
  let foundTotal = false;
  let foundTip = false;
  let grandTotal = '';
  
  for (let i = 0; i < Math.min(20, reversedLines.length); i++) {
    const line = reversedLines[i].trim().toUpperCase();
    
    // Buscar el ÚLTIMO "Total" o "Total a Pagar" (el definitivo)
    if (!foundTotal && (line.includes('TOTAL') && !line.includes('SUBTOTAL'))) {
      const match = line.match(/([0-9,]+\.\d{2})/);
      if (match) {
        grandTotal = match[1].replace(/,/g, '');
        foundTotal = true;
        console.log('  💰 Total encontrado:', grandTotal, 'en línea:', reversedLines[i]);
      }
    }
    
    // Buscar Propina/Servicio (común en restaurantes)
    if (!foundTip && (line.includes('SERVICIO') || line.includes('PROPINA') || line.includes('TIP'))) {
      foundTip = true;
      const match = line.match(/([0-9,]+\.\d{2})/);
      if (match) {
        const tipAmount = match[1].replace(/,/g, '');
        console.log('  💵 Propina/Servicio encontrado:', tipAmount, 'en línea:', reversedLines[i]);
      }
    }
    
    // Si ya encontramos ambos, podemos parar
    if (foundTotal && foundTip) break;
  }
  
  // Si encontramos propina/servicio y un gran total diferente al actual, usar el gran total
  if (foundTip && grandTotal && grandTotal !== currentAmount) {
    console.log('  ✅ Se detectó propina/servicio. Usando gran total:', grandTotal);
    return grandTotal;
  }
  
  return null; // No hay cambios necesarios
}

// codigo del total
function findFinalTotalByLines(lines: string[]): string | null {
  console.log('=== INICIANDO BÚSQUEDA DE TOTAL (MÉTODO LÍNEAS CON REVERSE SEARCH) ===');
  console.log(`Total de líneas: ${lines.length}`);

  // MEJORA: Buscar desde el final hacia arriba (REVERSE SEARCH)
  // Esto evita tomar subtotales en lugar del total final
  const searchLines = lines.length > 40 ? lines.slice(Math.floor(lines.length * 0.5)) : lines.slice(-30);
  console.log(`📍 Buscando en las últimas ${searchLines.length} líneas`);

  // MEJORA: Buscar múltiples variantes de "TOTAL" con prioridades
  const totalKeywords = [
    // Prioridad máxima - Totales finales explícitos
    { pattern: /\bTOTAL\s+A\s+PAGAR\b/i, priority: 100, name: 'TOTAL A PAGAR' },
    { pattern: /\bGRAN\s+TOTAL\b/i, priority: 95, name: 'GRAN TOTAL' },
    { pattern: /\bTOTAL\s+GENERAL\b/i, priority: 90, name: 'TOTAL GENERAL' },
    { pattern: /\bIMPORTE\s+TOTAL\b/i, priority: 85, name: 'IMPORTE TOTAL' },
    { pattern: /\bTOTAL\s+FACTURA\b/i, priority: 85, name: 'TOTAL FACTURA' },
    { pattern: /\bPAGO\s+TOTAL\b/i, priority: 85, name: 'PAGO TOTAL' },
    
    // Prioridad alta - "Total" simple (MUY COMÚN)
    { pattern: /\bTotal\s*[:Q$]?\s*\d/i, priority: 80, name: 'Total' }, // "Total Q22.00" o "Total: 22.00"
    { pattern: /\bTOTAL\s*[:Q$]?\s*\d/i, priority: 80, name: 'TOTAL' },
    
    // Prioridad media - Variantes
    { pattern: /\bSON\s*:/i, priority: 60, name: 'SON' },  // "SON: Q1234.56"
    { pattern: /\bNETO\s+A\s+PAGAR\b/i, priority: 60, name: 'NETO A PAGAR' },
    
    // Prioridad baja - Puede ser confuso
    { pattern: /\bTOTAL\b/i, priority: 50, name: 'TOTAL genérico' }
  ];

  let bestCandidate: string | null = null;
  let bestScore = 0;

  // REVERSE SEARCH: Buscar de abajo hacia arriba
  for (let i = searchLines.length - 1; i >= 0; i--) {
    const line = searchLines[i].trim();
    const originalIndex = lines.length - searchLines.length + i;
    
    // IMPORTANTE: Detener búsqueda si llegamos a zona de certificador/firma
    if (/DATOS\s+DEL\s+CERTIFICADOR|firma|sujeto\s+a\s+pagos/i.test(line)) {
      console.log(`Línea ${originalIndex}: Fin de zona útil (certificador/firma) - "${line}"`);
      break;
    }
    
    // Ignorar subtotales
    if (/subtotal/i.test(line)) {
      console.log(`Línea ${originalIndex}: Ignorando SUBTOTAL - "${line}"`);
      continue;
    }
    
    // MEJORA: Ignorar líneas que contengan campos de factura
    if (/serie.*n[úu]mero|factura.*no|dte/i.test(line)) {
      continue;
    }

    // Buscar líneas con alguna variante de TOTAL (con prioridad)
    for (const keyword of totalKeywords) {
      if (keyword.pattern.test(line)) {
        console.log(`Línea ${originalIndex}: Encontrada "${keyword.name}" - "${line}"`);
        
        // PRIORIDAD 1: Número en la MISMA línea que TOTAL
        const total = extractTotalFromLine(line);
        if (total) {
          const score = keyword.priority + calculateTotalScore(line, originalIndex, lines.length, true);
          console.log(`  Score: ${score} (prioridad: ${keyword.priority}) - Total: ${total}`);
          
          if (score > bestScore) {
            bestScore = score;
            bestCandidate = total;
            console.log(`  ⭐ Nuevo mejor candidato: ${total}`);
          }
          
          // Si el score es muy alto, retornar inmediatamente
          if (score >= 150) {
            console.log(`✓ TOTAL EXTRAÍDO (alta confianza): ${total}`);
            return total;
          }
        }
        
        // PRIORIDAD 2: Número en las siguientes 2 líneas
        for (let j = 1; j <= 2 && i + j < searchLines.length; j++) {
          const nextLine = searchLines[i + j].trim();
          const totalNext = extractNumberFromLine(nextLine);
          if (totalNext) {
            const score = keyword.priority + calculateTotalScore(line, originalIndex, lines.length, false);
            
            if (score > bestScore) {
              bestScore = score;
              bestCandidate = totalNext;
            }
          }
        }
        
        // Si encontramos un buen candidato, no seguir buscando en keywords de menor prioridad
        if (bestCandidate) break;
      }
    }
    
    // Si ya tenemos un candidato con score alto, parar la búsqueda
    if (bestScore >= 100) break;
  }

  if (bestCandidate && bestScore >= 50) {
    console.log(`✓ MEJOR CANDIDATO (score: ${bestScore}): ${bestCandidate}`);
    return bestCandidate;
  }

  console.log('=== FALLBACK: Buscando último número decimal válido (REVERSE) ===');
  // Paso 2: Fallback - buscar el último número decimal válido (de abajo hacia arriba)
  for (let i = searchLines.length - 1; i >= 0; i--) {
    const line = searchLines[i].trim();
    
    // Ignorar líneas con keywords problemáticos
    if (/serie|número|factura|dte|nit|cliente/i.test(line)) {
      continue;
    }
    
    const total = extractNumberFromLine(line);
    if (total) {
      console.log(`FALLBACK - Número encontrado: ${total} en línea: "${line}"`);
      return total;
    }
  }

  console.log('=== NO SE ENCONTRÓ NINGÚN TOTAL ===');
  return null;
}

// Nueva función: Calcular score de confianza para un candidato a total
function calculateTotalScore(line: string, lineIndex: number, totalLines: number, sameLineAsTotal: boolean): number {
  let score = 0;
  
  // +40 puntos si el número está en la misma línea que "TOTAL"
  if (sameLineAsTotal) score += 40;
  
  // +30 puntos si está en las últimas 10 líneas
  if (lineIndex >= totalLines - 10) score += 30;
  
  // +20 puntos si está en las últimas 5 líneas (zona más probable)
  if (lineIndex >= totalLines - 5) score += 20;
  
  // +25 puntos si contiene "GRAN TOTAL" o "TOTAL GENERAL" o "TOTAL A PAGAR"
  if (/gran\s+total|total\s+general|total\s+a\s+pagar/i.test(line)) score += 25;
  
  // +15 puntos si contiene "Pago" cerca de "Total" (muy común)
  if (/pago.*total|total.*pago/i.test(line)) score += 15;
  
  // +10 puntos si tiene el símbolo de moneda Q
  if (/Q\s*\d/.test(line)) score += 10;
  
  // +10 puntos si contiene "Total Q" (formato directo muy común)
  if (/Total\s+Q\d|TOTAL\s+Q\d/i.test(line)) score += 10;
  
  // -10 puntos si contiene "Cambio" (no es el total, es el vuelto)
  if (/cambio/i.test(line)) score -= 10;
  
  return score;
}

function extractTotalFromLine(line: string): string | null {
  console.log(`  Extrayendo total de: "${line}"`);
  
  // MEJORA: Validación de rango razonable
  const MAX_REASONABLE_AMOUNT = 999999.99;
  const MIN_REASONABLE_AMOUNT = 0.01;
  
  // Patrones de números en orden de PRIORIDAD (más específico primero)
  const patterns = [
    // Patrón 1 (PRIORIDAD MÁXIMA): "Total Q22.00" - Palabra Total seguida de Q y número
    /Total\s+Q\s*(\d{1,3}(?:[.,]\d{3})*[.,]?\d{1,2})/gi,
    /TOTAL\s+Q\s*(\d{1,3}(?:[.,]\d{3})*[.,]?\d{1,2})/gi,
    
    // Patrón 2: Total con dos puntos: "Total: Q22.00" o "Total:22.00"
    /Total\s*:\s*Q?\s*(\d{1,3}(?:[.,]\d{3})*[.,]?\d{1,2})/gi,
    /TOTAL\s*:\s*Q?\s*(\d{1,3}(?:[.,]\d{3})*[.,]?\d{1,2})/gi,
    
    // Patrón 3: Números con Q al FINAL de línea
    /Q\s*(\d{1,3}(?:[.,]\d{3})+[.,]\d{2})\s*$/gi,
    /Q\s*(\d+[.,]\d{2})\s*$/gi,
    
    // Patrón 4: Números con moneda guatemalteca Q en cualquier posición
    /Q\s*(\d{1,3}(?:[.,]\d{3})+[.,]\d{2})/gi,
    /Q\s*(\d+[.,]\d{2})/gi,
    
    // Patrón 5: Números con separadores de miles al FINAL de línea
    /(\d{1,3}(?:[.,]\d{3})+[.,]\d{2})\s*$/g,
    
    // Patrón 6: Números simples al FINAL de línea con decimales
    /(\d+[.,]\d{2})\s*$/g,
    
    // Patrón 7: Números con separadores de miles (posición flexible)
    /(\d{1,3}(?:[.,]\d{3})+[.,]\d{2})/g,
    
    // Patrón 8: Cualquier número con 2 decimales
    /(\d+[.,]\d{2})/g,
    
    // Patrón 9: Números con 1 decimal (baja prioridad)
    /(\d+[.,]\d{1})/g
  ];

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const matches = Array.from(line.matchAll(pattern));
    
    if (matches && matches.length > 0) {
      console.log(`    Patrón ${i + 1} encontró:`, matches.map(m => m[1] || m[0]));
      
      // Tomar el ÚLTIMO match (generalmente es el total en facturas)
      let amount = '';
      if (i < 4) { // Patrones con Q o al final de línea
        amount = matches[matches.length - 1][1] || matches[matches.length - 1][0];
      } else {
        // Para patrones menos específicos, tomar el último
        const lastMatch = matches[matches.length - 1];
        amount = lastMatch[1] || lastMatch[0];
      }
      
      const normalized = normalizeNumber(amount);
      
      // Si la normalización falló (retornó vacío), continuar con el siguiente patrón
      if (!normalized) {
        console.log(`    ⚠️ Normalización falló, probando siguiente patrón...`);
        continue;
      }
      
      // VALIDAR RANGO RAZONABLE
      const numValue = parseFloat(normalized);
      if (!isNaN(numValue) && numValue >= MIN_REASONABLE_AMOUNT && numValue <= MAX_REASONABLE_AMOUNT) {
        console.log(`    ✓ Total validado: ${normalized} (patrón ${i + 1})`);
        return normalized;
      } else {
        console.log(`    ✗ Total rechazado: ${normalized} (fuera de rango: ${numValue})`);
        // Continuar buscando con el siguiente patrón
        continue;
      }
    }
  }

  return null;
}

function extractNumberFromLine(line: string): string | null {
  // MEJORA: Validación de rango razonable para evitar números de factura/códigos
  const MAX_REASONABLE_AMOUNT = 999999.99; // Q1 millón máximo
  const MIN_REASONABLE_AMOUNT = 0.01; // Q0.01 mínimo
  
  // CRÍTICO: Ignorar líneas que contengan palabras clave de número de factura
  if (/n[úu]mero|factura|no\.|serie|dte/i.test(line)) {
    console.log(`    ⚠️ Línea ignorada (contiene campo de factura): "${line}"`);
    return null;
  }
  
  // Fallback más simple - buscar SOLO números con formato de monto
  const patterns = [
    // Números con separadores de miles: 3,111.00 o 1.234,56
    /(\d{1,3}(?:[.,]\d{3})+[.,]\d{2})/g,
    // Números simples con decimales (OBLIGATORIO para montos)
    /(\d+[.,]\d{2})/g,
    /(\d+[.,]\d{1})/g
    // REMOVIDO: No aceptar números sin decimales (evita confusión con códigos)
  ];

  for (const pattern of patterns) {
    const matches = Array.from(line.matchAll(pattern));
    if (matches && matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const amount = lastMatch[1] || lastMatch[0];
      const normalized = normalizeNumber(amount);
      
      // VALIDAR RANGO RAZONABLE
      const numValue = parseFloat(normalized);
      if (!isNaN(numValue) && numValue >= MIN_REASONABLE_AMOUNT && numValue <= MAX_REASONABLE_AMOUNT) {
        console.log(`    ✓ Monto validado: ${normalized} (dentro de rango razonable)`);
        return normalized;
      } else {
        console.log(`    ✗ Monto rechazado: ${normalized} (fuera de rango: ${numValue})`);
      }
    }
  }

  return null;
}

function normalizeNumber(amount: string): string {
  if (!amount) return '';
  
  // Limpiar espacios
  let normalized = amount.trim();
  
  // MEJORA: Filtrar números muy largos (probablemente códigos o números de factura)
  // Ej: 1234567890 sin decimales → rechazar
  const digitsOnly = normalized.replace(/[^0-9]/g, '');
  if (digitsOnly.length > 10) {
    console.log(`    ⚠️ Número muy largo rechazado: "${amount}" (${digitsOnly.length} dígitos)`);
    return ''; // Retornar vacío para que se ignore
  }
  
  // CRÍTICO: Rechazar números sin punto o coma decimal
  // Esto evita confundir códigos como "123456" con montos
  if (!/[.,]/.test(normalized)) {
    console.log(`    ⚠️ Número sin decimales rechazado: "${amount}" (probablemente código)`);
    return '';
  }
  
  // Reemplazar coma por punto para decimales
  // Si tiene formato 1,234.56 (coma de miles), preservar
  // Si tiene formato 123,45 (coma decimal), convertir a punto
  
  // Contar puntos y comas
  const commas = (normalized.match(/,/g) || []).length;
  const dots = (normalized.match(/\./g) || []).length;
  
  console.log(`    Normalizando: "${amount}" (comas: ${commas}, puntos: ${dots})`);
  
  // Caso especial: 3,111.00 (coma de miles, punto decimal)
  if (commas === 1 && dots === 1) {
    const commaPos = normalized.indexOf(',');
    const dotPos = normalized.indexOf('.');
    
    // Si la coma está antes del punto y el punto tiene 2 decimales después
    if (commaPos < dotPos && dotPos === normalized.length - 3) {
      // Eliminar la coma de miles y mantener el punto decimal
      normalized = normalized.replace(',', '');
      console.log(`    Formato miles detectado: ${normalized}`);
      return normalized;
    }
  }
  
  // Si hay una sola coma y no hay puntos, probablemente es decimal
  if (commas === 1 && dots === 0) {
    normalized = normalized.replace(',', '.');
  }
  // Si hay múltiples comas o puntos, limpiar comas de miles
  else if (commas > 0) {
    // Asumir que la última coma/punto es decimal
    const parts = normalized.split(/[.,]/);
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      // Si la última parte tiene 2 dígitos, es decimal
      if (lastPart.length <= 2) {
        const mainPart = parts.slice(0, -1).join('').replace(/,/g, '');
        normalized = mainPart + '.' + lastPart;
      }
    }
  }
  
  console.log(`    Normalizado: "${amount}" -> "${normalized}"`);
  return normalized;
}
// codigo del total

const findFinalTotal = (allWords: Word[]): string | null => {
  console.log('🔍 MÉTODO COORDENADAS: Iniciando búsqueda espacial de total');
  
  // 1. Find all possible keywords for the total amount.
  // MEJORA: Buscar múltiples variantes y excluir SUBTOTAL
  const totalKeywords = allWords.filter(word => {
    const text = word.text.toLowerCase();
    const hasTotal = text.includes('total') || text.includes('son') || text.includes('pagar');
    const notSubtotal = !text.includes('subtotal') && !text.includes('sub-total');
    return hasTotal && notSubtotal;
  });
  
  if (totalKeywords.length === 0) {
    console.log("❌ No 'Total' keyword found en método de coordenadas.");
    // Fallback to bottommost number if no keyword found
  } else {
    console.log(`✓ Encontradas ${totalKeywords.length} palabras clave de total:`, 
                totalKeywords.map(w => w.text));
    
    // 2. Find the keyword that is lowest on the page (this is our anchor).
    // MEJORA: Priorizar "GRAN TOTAL" o "TOTAL GENERAL" sobre "TOTAL" simple
    const sortedKeywords = totalKeywords.sort((a, b) => {
      // Primero por tipo de keyword (gran total > total)
      const aIsGrand = /gran|general|pagar/i.test(a.text);
      const bIsGrand = /gran|general|pagar/i.test(b.text);
      if (aIsGrand && !bIsGrand) return -1;
      if (!aIsGrand && bIsGrand) return 1;
      
      // Luego por posición (más bajo = más prioritario)
      return b.frame.top - a.frame.top;
    });
    
    const anchorKeyword = sortedKeywords[0];
    console.log(`✓ Keyword ancla: '${anchorKeyword.text}' at Y=${anchorKeyword.frame.top}`);
    
    // 3. Define a "search area" to the right of the anchor keyword.
    // MEJORA: Área más precisa para facturas largas
    const searchArea = {
      top: anchorKeyword.frame.top - 2 * anchorKeyword.frame.height, // Tolerancia arriba
      bottom: anchorKeyword.frame.top + 4 * anchorKeyword.frame.height, // Más tolerancia abajo
      left: anchorKeyword.frame.left + anchorKeyword.frame.width * 0.5, // A la derecha
      right: 99999 // Sin límite derecho
    };
    
    console.log(`  Área de búsqueda: Y[${searchArea.top.toFixed(0)}-${searchArea.bottom.toFixed(0)}], X>${searchArea.left.toFixed(0)}`);

    // 4. Find all numbers that fall within this defined search area.
    const potentialAmounts = allWords.filter(word => {
      const hasDecimal = /\d+[.,]\d{1,2}/.test(word.text);
      if (!hasDecimal) return false;

      const wordCenterY = word.frame.top + word.frame.height / 2;
      const wordLeft = word.frame.left;
      
      // Check if the word is within our search area
      const inVerticalRange = wordCenterY >= searchArea.top && wordCenterY <= searchArea.bottom;
      const toTheRight = wordLeft >= searchArea.left;
      
      if (inVerticalRange && toTheRight) {
        console.log(`    Candidato encontrado: "${word.text}" at X=${wordLeft.toFixed(0)}, Y=${wordCenterY.toFixed(0)}`);
      }
      
      return inVerticalRange && toTheRight;
    });

    if (potentialAmounts.length > 0) {
      // MEJORA: Validar rangos razonables
      const MAX_REASONABLE = 999999.99;
      const MIN_REASONABLE = 0.01;
      
      console.log(`  Encontrados ${potentialAmounts.length} números candidatos`);
      
      // Ordenar: primero por X (más a la derecha), luego por Y (más abajo)
      potentialAmounts.sort((a, b) => {
        const xDiff = b.frame.left - a.frame.left;
        if (Math.abs(xDiff) > 20) return xDiff; // Diferencia significativa en X
        return b.frame.top - a.frame.top; // Si están alineados en X, preferir más bajo
      });
      
      for (const candidate of potentialAmounts) {
        let finalAmountText = candidate.text;
        
        // Improved cleaning: Remove any non-numeric characters except dot and comma.
        finalAmountText = finalAmountText.replace(/[^0-9.,]/g, '');
        
        const normalized = normalizeNumber(finalAmountText);
        if (!normalized) continue;
        
        const numValue = parseFloat(normalized);
        if (!isNaN(numValue) && numValue >= MIN_REASONABLE && numValue <= MAX_REASONABLE) {
          console.log(`✓ Total encontrado (coordenadas): ${normalized} (validado)`);
          return normalized;
        } else {
          console.log(`✗ Candidato rechazado: ${normalized} (${numValue})`);
        }
      }
    } else {
      console.log("  No se encontraron números en el área de búsqueda.");
    }
  }
  
  // Fallback: If no amount found near keyword, find the bottommost number with decimal on the page
  const MAX_REASONABLE = 999999.99;
  const MIN_REASONABLE = 0.01;
  
  const allAmounts = allWords.filter(word => /\d+\.\d{2}/.test(word.text));
  if (allAmounts.length > 0) {
    // Sort by top descending (bottommost)
    allAmounts.sort((a, b) => b.frame.top - a.frame.top);
    
    // Validar los candidatos desde el más bajo
    for (const candidate of allAmounts) {
      let finalAmountText = candidate.text.replace(/[^0-9.]/g, '');
      const numValue = parseFloat(finalAmountText);
      
      if (!isNaN(numValue) && numValue >= MIN_REASONABLE && numValue <= MAX_REASONABLE) {
        console.log(`✓ Fallback (coordenadas): ${finalAmountText} (validado)`);
        return finalAmountText;
      } else {
        console.log(`✗ Fallback rechazado: ${finalAmountText} (${numValue})`);
      }
    }
  }

  console.log("No fallback amount found.");
  return null;
};

  return (
    <KeyboardAvoidingView 
      style={styles.outerContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView 
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.title}>{isEditing ? 'Editar Gasto' : 'Nuevo Gasto'}</Text>

        {/* === BOTÓN PRINCIPAL DE FOTO/ESCANEO === */}
        <View style={styles.scanContainer}>
          {/* Botón de cámara compacto */}
          <TouchableOpacity style={styles.bigCameraButton} onPress={handleScan} disabled={isLoading}>
            {isLoading ? (
              <>
                <ActivityIndicator size="small" color="white" />
                <Text style={styles.bigCameraButtonText}>Procesando...</Text>
              </>
            ) : (
              <>
                <Ionicons name="camera" size={22} color="white" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bigCameraButtonText}>
                    {file ? 'Cambiar foto / Escanear' : 'Tomar foto / Escanear factura'}
                  </Text>
                  {file && <Text style={styles.bigCameraButtonSub} numberOfLines={1}>{file.name}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#bfdbfe" />
              </>
            )}
          </TouchableOpacity>

          {/* Estado verificador SAT y botón limpiar */}
          <View style={styles.scanActionsRow}>
            <View style={styles.satBadge}>
              <Ionicons name="sparkles" size={14} color="#10b981" />
              <Text style={styles.satBadgeText}>Verificador SAT activo</Text>
            </View>
            <TouchableOpacity style={styles.clearButtonSmall} onPress={handleClearForm}>
              <Ionicons name="trash-outline" size={16} color="#dc2626" />
              <Text style={styles.clearButtonSmallText}>Limpiar</Text>
            </TouchableOpacity>
          </View>

          {/* Botón validar SAT - visible cuando hay datos de factura */}
          <TouchableOpacity 
            style={[
              styles.validateButton,
              !(serie && noinvoice) && styles.validateButtonDisabled,
              validationStatus === 'valid' && styles.validateButtonValid,
              validationStatus === 'invalid' && styles.validateButtonInvalid,
              validationStatus === 'validating' && styles.validateButtonValidating
            ]} 
            onPress={handleValidateSAT}
            disabled={validationStatus === 'validating'}
          >
            <Ionicons 
              name={
                validationStatus === 'validating' ? "hourglass-outline" :
                validationStatus === 'valid' ? "checkmark-circle" :
                validationStatus === 'invalid' ? "close-circle" :
                "shield-checkmark-outline"
              } 
              size={18} 
              color="white" 
            />
            <Text style={styles.validateButtonText}>
              {validationStatus === 'validating' ? 'Validando...' :
               validationStatus === 'valid' ? 'Validada SAT' :
               validationStatus === 'invalid' ? 'No encontrada' :
               'Consultar SAT'}
            </Text>
            {validationStatus === 'validating' && (
              <ActivityIndicator size="small" color="white" style={{ marginLeft: 6 }} />
            )}
          </TouchableOpacity>
          {!!validationMessage && (
            <Text style={[
              styles.validationMessage,
              fiscalStatus === 'BLOQUEADO_ANTIGUEDAD' && styles.validationMessageBlocked,
            ]}>
              {validationMessage}
            </Text>
          )}
          {false && (
            <TouchableOpacity 
              style={[
                styles.validateButton,
                validationStatus === 'valid' && styles.validateButtonValid,
                validationStatus === 'invalid' && styles.validateButtonInvalid,
                validationStatus === 'validating' && styles.validateButtonValidating
              ]} 
              onPress={handleValidateSAT}
              disabled={validationStatus === 'validating'}
            >
              <Ionicons 
                name={
                  validationStatus === 'validating' ? "hourglass-outline" :
                  validationStatus === 'valid' ? "checkmark-circle" :
                  validationStatus === 'invalid' ? "close-circle" :
                  "shield-checkmark-outline"
                } 
                size={18} 
                color="white" 
              />
              <Text style={styles.validateButtonText}>
                {validationStatus === 'validating' ? 'Validando...' :
                 validationStatus === 'valid' ? 'Válida ✓' :
                 validationStatus === 'invalid' ? 'Inválida ✗' :
                 'Validar con SAT'}
              </Text>
              {validationStatus === 'validating' && (
                <ActivityIndicator size="small" color="white" style={{ marginLeft: 6 }} />
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* === CAMPOS ESENCIALES === */}
        <View style={styles.essentialSection}>
          <Text style={styles.sectionHeader}>Datos de la Factura</Text>

          <Text style={styles.label}>No. Factura</Text>
          <TextInput 
            style={styles.input} 
            value={noinvoice} 
            onChangeText={setNoinvoice} 
            placeholder="Ej: 4134487432"
            keyboardType="numeric"
          />

          <Text style={styles.label}>Serie</Text>
          <TextInput 
            style={styles.input} 
            value={serie} 
            onChangeText={setSerie} 
            placeholder="Ej: A, B, FEL..."
            autoCapitalize="characters"
          />

          <Text style={styles.label}>NIT del Emisor (Proveedor) *</Text>
          <TextInput 
            style={styles.input} 
            value={vat_number} 
            onChangeText={setVatNumber} 
            placeholder="Ej: 1234567-8"
            keyboardType="default"
          />

          <Text style={styles.label}>Monto</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={handleAmountChange}
            placeholder="0.00"
            keyboardType="numeric"
          />

          <Text style={styles.label}>Categoría *</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={category} onValueChange={handleCategoryChange} style={styles.picker}>
              <Picker.Item label="Seleccionar categoría" value="" />
              {categories.map((cat) => <Picker.Item key={cat.id} label={cat.name} value={cat.name} />)}
            </Picker>
          </View>

          <Text style={styles.label}>Departamento *</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={department} onValueChange={setDepartment} style={styles.picker}>
              <Picker.Item label="Seleccionar departamento" value="" />
              {departments.map((dept) => <Picker.Item key={dept} label={dept} value={dept} />)}
            </Picker>
          </View>
        </View>

        {/* === SECCIÓN DE MÁS DETALLES (COLAPSABLE) === */}
        <TouchableOpacity 
          style={styles.moreDetailsToggle} 
          onPress={() => setShowMoreDetails(!showMoreDetails)}
        >
          <Ionicons 
            name={showMoreDetails ? "chevron-up-circle" : "chevron-down-circle"} 
            size={22} 
            color="#3b82f6" 
          />
          <Text style={styles.moreDetailsToggleText}>
            {showMoreDetails ? 'Ocultar detalles adicionales' : 'Ver detalles adicionales'}
          </Text>
          {/* Indicador si hay datos en campos secundarios */}
          {(amount || description || supplier || uuid) && !showMoreDetails && (
            <View style={styles.filledBadge}>
              <Text style={styles.filledBadgeText}>Con datos</Text>
            </View>
          )}
        </TouchableOpacity>

        {showMoreDetails && (
          <View style={styles.detailsSection}>
            <Text style={styles.label}>Descripción</Text>
            <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Ej: Almuerzo de trabajo con cliente" />

            <Text style={styles.label}>Fecha del Documento</Text>
            <TouchableOpacity style={styles.dateInput} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.dateText}>{date ? formatDateDisplay(date) : 'Seleccionar fecha del documento'}</Text>
              <Ionicons name="calendar-outline" size={20} color="gray" />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker value={date || new Date()} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={handleDateChange} />
            )}

            <Text style={styles.label}>Proveedor (Nombre)</Text>
            <TextInput style={styles.input} value={supplier} onChangeText={setSupplier} placeholder="Nombre del proveedor" />

            {uuid ? (
              <>
                <Text style={styles.label}>No. Autorización FEL (UUID)</Text>
                <TextInput 
                  style={[styles.input, styles.uuidInput]} 
                  value={uuid} 
                  onChangeText={setUuid}
                  placeholder="UUID de factura electrónica"
                  autoCapitalize="characters"
                />
              </>
            ) : null}

            <Text style={styles.label}>Sociedad</Text>
            <TextInput style={[styles.input, styles.readOnlyInput]} value={expenseSociedad} editable={false} placeholder="Sociedad ligada a la categoría" />

            <Text style={styles.label}>Centro</Text>
            <TextInput style={[styles.input, styles.readOnlyInput]} value={centro} onChangeText={setCentro} editable={false} />

            <Text style={styles.label}>Cuenta</Text>
            <TextInput style={[styles.input, styles.readOnlyInput]} value={cuenta} onChangeText={setCuenta} editable={false} />

            <Text style={styles.label}>Orden CO</Text>
            <TextInput style={[styles.input, styles.readOnlyInput]} value={ordenco} onChangeText={setOrdenco} editable={false} />

            <Text style={styles.label}>Total IVA</Text>
            <TextInput style={styles.input} value={totiva} onChangeText={setTotiva} keyboardType="numeric" editable={false} />

            <Text style={styles.label}>Moneda</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={currency} onValueChange={setCurrency} style={styles.picker}>
                {currencies.map((curr) => <Picker.Item key={curr} label={curr} value={curr} />)}
              </Picker>
            </View>

            <Text style={styles.label}>Comprobante (archivo)</Text>
            <TouchableOpacity style={styles.fileButton} onPress={handleChooseFile}>
              <Text style={styles.fileButtonText}>Seleccionar archivo</Text>
              <Text style={styles.fileName}>{file ? file.name : 'Ninguno'}</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Notas</Text>
            <TextInput 
              style={[styles.input, styles.notesInput]} 
              value={notes} 
              onChangeText={setNotes} 
              placeholder="Información adicional..." 
              multiline 
              textAlignVertical="top"
            />
          </View>
        )}

      </ScrollView>

      <SafeAreaView style={styles.fixedButtonContainer}>
        <TouchableOpacity style={[styles.baseButton,styles.cancelButton]} onPress={() => router.back()}>
          <Text style={styles.baseButtonText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.baseButton,styles.draftButton]} onPress={() => handleSave('BORRADOR')}>
          <Ionicons name="save-outline" size={20} color="white" />
          <Text style={styles.baseButtonText}>{isEditing ? 'Guardar' : 'Borrador'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.baseButton, styles.submitButton]} onPress={() => handleSave('ENVIADO_JEFE')}>
          <Ionicons name="paper-plane-outline" size={20} color="white" />
          <Text style={styles.baseButtonText}>Enviar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  scrollView: {
    flex: 1,
  },
  container: { flex: 1, padding: 20, backgroundColor: 'white' },
  contentContainer: { flexGrow: 1, padding: 20, paddingBottom: 200 },
  fixedButtonContainer: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 8,
  },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, color: '#2563eb' },
  scanContainer: { backgroundColor: '#eff6ff', padding: 15, borderRadius: 12, marginBottom: 20 },
  bigCameraButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  bigCameraButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  bigCameraButtonSub: {
    color: '#bfdbfe',
    fontSize: 11,
    marginTop: 1,
  },
  scanActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  satBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#6ee7b7',
  },
  satBadgeText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '600',
  },
  clearButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  clearButtonSmallText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '600',
  },
  essentialSection: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  moreDetailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  moreDetailsToggleText: {
    fontSize: 15,
    color: '#3b82f6',
    fontWeight: '600',
    flex: 1,
  },
  filledBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  filledBadgeText: {
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '600',
  },
  detailsSection: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  scanTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b82f6', marginTop: 10 },
  scanSubtitle: { fontSize: 14, color: 'gray', textAlign: 'center', marginBottom: 10 },
  aiSwitchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#ffffff', 
    paddingHorizontal: 15, 
    paddingVertical: 10, 
    borderRadius: 8, 
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 8
  },
  aiSwitchLabel: { 
    flex: 1, 
    fontSize: 15, 
    color: '#6b7280',
    fontWeight: '500'
  },
  aiSwitchLabelActive: { 
    color: '#10b981',
    fontWeight: '600'
  },
  validateButton: { 
    flexDirection: 'row', 
    backgroundColor: '#7c3aed', 
    padding: 12, 
    borderRadius: 8, 
    alignItems: 'center', 
    justifyContent: 'center',
    marginVertical: 8,
    width: '100%',
    gap: 8
  },
  validateButtonValid: {
    backgroundColor: '#10b981'
  },
  validateButtonInvalid: {
    backgroundColor: '#dc2626'
  },
  validateButtonValidating: {
    backgroundColor: '#64748b'
  },
  validationMessage: {
    marginTop: 8,
    color: '#166534',
    fontSize: 13,
    textAlign: 'center',
  },
  validationMessageBlocked: {
    color: '#b91c1c',
    fontWeight: '600',
  },
  validateButtonDisabled: {
    backgroundColor: '#a78bfa'
  },
  validateButtonText: { 
    color: 'white', 
    fontWeight: '600',
    fontSize: 15
  },
  scanButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 5,
    width: '100%'
  },
  scanButton: { 
    flex: 1,
    flexDirection: 'row', 
    backgroundColor: '#2563eb', 
    padding: 10, 
    borderRadius: 8, 
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  scanButtonText: { 
    color: 'white',
    fontWeight: '600',
    fontSize: 15
  },
  clearButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#dc2626',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  clearButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15
  },
  label: { fontSize: 16, fontWeight: '500', marginBottom: 5, color: '#374151' },
  input: { borderWidth: 1, borderColor: '#d1d5db', padding: 12, borderRadius: 8, marginBottom: 15, fontSize: 16, color: '#000000' },
  readOnlyInput: { backgroundColor: '#f8fafc', color: '#64748b' },
  uuidInput: {
    backgroundColor: '#f0fdf4', 
    borderColor: '#86efac',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 14
  },
  dateInput: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db', padding: 12, borderRadius: 8, marginBottom: 15 },
  dateText: { fontSize: 16, color: '#374151' },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    marginBottom: 15,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    ...Platform.select({
      android: {
        paddingHorizontal: 0,
      },
      ios: {
        paddingHorizontal: 8,
      },
    }),
  },
  picker: { 
    width: '100%',
    height: 50,
    color: '#1f2937',
    backgroundColor: 'transparent',
    ...Platform.select({
      android: {
        color: '#1f2937',
      },
      ios: {
        color: '#1f2937',
      },
    }),
  },
  fileButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db', padding: 12, borderRadius: 8, marginBottom: 15 },
  fileButtonText: { color: '#2563eb', marginRight: 10 },
  fileName: { color: 'gray' },
  notesInput: { 
    height: 120, 
    textAlignVertical: 'top',
    paddingTop: 12,
    paddingBottom: 12
  },
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 },
  baseButton: {
  flex: 1, // This makes all buttons take up equal space
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: 14,
  borderRadius: 12, // More rounded corners
},
// Base style for all button text
baseButtonText: {
  fontWeight: 'bold',
  fontSize: 16,
  marginLeft: 8,
},
cancelButton: {
  backgroundColor: '#f1f5f9',
},
draftButton: {
  backgroundColor: '#64748b',
},
submitButton: {
  backgroundColor: '#2563eb',
},
cancelButtonText: {
  color: '#334155',
  marginLeft: 0, // No icon on cancel button
},

});
