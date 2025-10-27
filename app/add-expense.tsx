import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { Picker } from '@react-native-picker/picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Category } from '../models/Category';
import { Expense, STATUSES } from '../models/Expense';
import * as AuthService from '../services/AuthService';
import { BackendSyncService } from '../services/BackendSyncService';
import * as CategoryService from '../services/CategoryService';
import * as ExpenseService from '../services/ExpenseService';




interface CustomAsset {
  uri: string;
  name?: string;
  fileName?: string;
}

export default function AddExpenseScreen() {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [category, setCategory] = useState('');
  const [department, setDepartment] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<{ name: string; uri: string } | null>(null);
  const [serie, setSerie] = useState('');
  const [noinvoice, setNoinvoice] = useState('');
  const [vat_number, setVatNumber] = useState('');
  const [supplier, setSupplier] = useState('');
  const [centro, setCentro] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [ordenco, setOrdenco] = useState('');
  const [totiva, setTotiva] = useState('');
  const [currency, setCurrency] = useState('GTQ');
  const departments = ['Tecnologia', 'Ventas', 'Marketing', 'Finanzas', 'Recursos humanos'];
  const currencies = ['GTQ', 'USD', 'EUR'];


  const [categories, setCategories] = useState<Category[]>([]);

   interface Word {
    text: string;
    frame: { top: number; left: number; width: number; height: number };
  }



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
          setCentro(selectedCategory.centro || '');
          setCuenta(selectedCategory.cuenta || '');
          setOrdenco(selectedCategory.ordenco || '');
        }
      };


  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) setDate(selectedDate);
  };

  const handleScan = async () => {
    let result;
    if (Platform.OS === 'web') {
      result = await DocumentPicker.getDocumentAsync({ type: 'image/*' });
    } else {
      // Solicitar permisos primero
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        alert('Se necesitan permisos de cámara para escanear facturas.');
        return;
      }
      
      result = await ImagePicker.launchCameraAsync({ 
        allowsEditing: true, 
        quality: 1,
        cameraType: ImagePicker.CameraType.back // Usar cámara trasera
      });
    }

    if (!result.canceled && result.assets) {
      const asset = result.assets[0] as CustomAsset;
      const fileName = asset.name ?? asset.fileName ?? 'factura.jpg';
      const newFile = { name: fileName, uri: asset.uri };
      setFile(newFile);
      await extractDataFromImage(asset.uri);
    }
  };

  const handleChooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({});
    if (!result.canceled && result.assets) {
      const asset = result.assets[0] as CustomAsset;
      const fileName = asset.name ?? 'default.jpg';
      setFile({ name: fileName, uri: asset.uri });
      await extractDataFromImage(asset.uri);
    }

  };

  const handleSave = async (status: keyof typeof STATUSES) => {
    if (!description || !amount || !category || !department) {
      alert('Por favor, llene todos los campos requeridos.');
      return;
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

      // CREAR OBJETO DEL GASTO
      const newExpense: Expense = {
        id: Date.now().toString(),
        description,
        amount: parseFloat(amount),
        date: formatDate(date),
        category,
        status,
        expenseStatus: 'draft', // Estado inicial en el flujo de liquidación
        supplier: supplier || 'Proveedor Desconocido',
        vat_number,
        department,
        notes,
        noinvoice,
        serie,
        centro,
        cuenta,
        ordenco,
        imageuri: file?.uri || '',
        totiva: parseFloat(totiva) || 0,
        currency,
        email: user.email
      };

      // PASO 1: GUARDAR LOCALMENTE (RÁPIDO - OFFLINE FIRST)
      console.log('� AddExpense: Guardando gasto localmente...');
      await ExpenseService.addExpense(newExpense, user.email);
      console.log('✅ AddExpense: Gasto guardado localmente exitosamente');

      // PASO 2: NOTIFICAR AL USUARIO INMEDIATAMENTE
      alert('✅ Gasto guardado exitosamente!');
      router.back();

      // PASO 3: SINCRONIZAR EN SEGUNDO PLANO (TRANSPARENTE - NO BLOQUEAR)
      console.log('🔄 AddExpense: Iniciando autenticación y sincronización en segundo plano...');
      
      // Ejecutar todo el flujo de auth + sync en background
      (async () => {
        try {
          // Obtener PIN local
          const userPIN = await AuthService.getPIN();
          if (!userPIN) {
            console.log('⚠️ AddExpense (BG): No se encontró PIN - sincronización pendiente');
            return;
          }

          console.log('🔐 AddExpense (BG): PIN obtenido, intentando login...');
          
          // Intentar login
          let loginResult = await BackendSyncService.loginAndGetToken(user.email, userPIN);
          console.log('🔐 AddExpense (BG): Resultado de login:', loginResult);
          
          // Si login falla, registrar y volver a intentar
          if (!loginResult.success || !loginResult.token) {
            console.log('📝 AddExpense (BG): Login falló - registrando usuario...');
            
            const registerResult = await BackendSyncService.syncUserRegistration(user, userPIN);
            console.log('📝 AddExpense (BG): Resultado de registro:', registerResult);
            
            if (registerResult.success) {
              // Volver a intentar login después del registro
              loginResult = await BackendSyncService.loginAndGetToken(user.email, userPIN);
              console.log('🔐 AddExpense (BG): Login después de registro:', loginResult);
            }
          }
          
          // Si tenemos token, sincronizar
          if (loginResult.success && loginResult.token) {
            console.log('🔄 AddExpense (BG): Token obtenido - sincronizando gastos...');
            const syncResult = await BackendSyncService.syncExpenses(user.email, loginResult.token);
            
            if (syncResult.success) {
              console.log('✅ AddExpense (BG): Gasto sincronizado exitosamente en segundo plano');
            } else {
              console.log('⚠️ AddExpense (BG): No se pudo sincronizar - quedará pendiente:', syncResult.error);
            }
          } else {
            console.log('⚠️ AddExpense (BG): No se pudo obtener token - sincronización pendiente');
          }
        } catch (bgError) {
          console.log('⚠️ AddExpense (BG): Error en autenticación/sincronización (no crítico):', bgError);
        }
      })();
      
    } catch (error: unknown) {
      console.error('❌ AddExpense: Error en handleSave:', error);
      const err = error as any;
      if (err?.name === 'QuotaExceededError') {
        alert('Error: Almacenamiento local lleno. Limpie datos del navegador o elimine gastos antiguos.');
      } else {
        alert('Error al guardar el gasto: ' + (err?.message || 'Error desconocido'));
      }
    }
  };


// ... dentro de AddExpenseScreen ...

const extractDataFromImage = async (imageUri: string) => {
  try {
    console.log("Iniciando reconocimiento de texto con ML Kit para:", imageUri);
    setIsLoading(true);

    // 1. Usar ML Kit para reconocer texto
    const result = await TextRecognition.recognize(imageUri);
    console.log("Resultado ML Kit:", JSON.stringify(result, null, 2));

    // 2. Obtener texto completo y líneas
    let fullText = '';
    if (result.blocks && result.blocks.length > 0) {
      result.blocks.forEach(block => {
        block.lines.forEach(line => {
          fullText += line.text + '\n';
        });
      });
    } else {
      fullText = result.text || '';
    }

    if (!fullText.trim()) {
      alert('No se pudo reconocer texto en la imagen.');
      return;
    }

    const lines = fullText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    console.log("Líneas extraídas:", lines);

    // 3. Inicializar variables de extracción
    const extractedData = {
      nit: '',
      amount: '',
      supplier: '',
      date: '',
      serie: '',
      invoiceNumber: '',
      iva: '',
      description: ''
    };

// === EXTRACCIÓN DE NIT ===
// === EXTRACCIÓN DE NIT ===
// Patrones más amplios para NIT guatemalteco
const nitPatterns = [
  /N\.?I\.?T\.?\s*:?\s*(\d{6,12}-?[0-9K]?)/i,
  /NIT\s*:?\s*(\d{6,12}-?[0-9K]?)/i,
  /\b(\d{6,12}-[0-9K])\b/,
  /\b(\d{6,12})\b(?=\s*[^0-9])/  // NIT sin guión
];

// Limitar a las primeras 15 líneas para evitar confundir con NIT del cliente
const headerLinesForNIT = lines.slice(0, 15);

for (const pattern of nitPatterns) {
  for (const line of headerLinesForNIT) {
    const match = line.match(pattern);
    if (match && match[1]) {
      let nit = match[1].replace(/[^\dK-]/gi, '');
      // Formatear NIT si no tiene guión
      if (!/\-/.test(nit) && nit.length >= 7) {
        const lastChar = nit.slice(-1);
        const numbers = nit.slice(0, -1);
        nit = `${numbers}-${lastChar}`;
      }
      extractedData.nit = nit.toUpperCase();
      break;
    }
  }
  if (extractedData.nit) break;
}

// === EXTRACCIÓN DE PROVEEDOR ===
// Primero, intentar extraer nombre antes de NIT en la misma línea (prioridad para casos como "Nombre NIT: xxxx")
const headerLines = lines.slice(0, 15);
for (const line of headerLines) {
  const match = line.match(/(.+)\s*N\.?I\.?T\.?\s*:?\s*[\d-]/i);
  if (match && match[1] && match[1].trim().length > 5) {
    extractedData.supplier = match[1].trim();
    break;
  }
}

// Si no se encontró, buscar por keywords específicos
if (!extractedData.supplier) {
  const supplierKeywords = [
    /(?:EMPRESA|SOCIEDAD|COMPAÑIA|CIA|S\.?A\.?|LTDA|COMERCIAL)/i,
    /(?:EMISOR|PROVEEDOR|RAZ[OÓ]N\s+SOCIAL|NOMBRE\s+COMERCIAL)\s*:?\s*(.+)/i
  ];

  for (const keyword of supplierKeywords) {
    for (const line of lines) {
      if (typeof keyword === 'object' && keyword.test && keyword.test(line)) {
        const match = line.match(/:\s*(.+)/);
        if (match && match[1]) {
          extractedData.supplier = match[1].trim();
          break;
        } else if (keyword.test(line) && line.length > 10) {
          extractedData.supplier = line.trim();
          break;
        }
      }
    }
    if (extractedData.supplier) break;
  }
}

// Fallback mejorado: unir líneas de encabezado que parezcan nombre de empresa
if (!extractedData.supplier) {
  let supplierParts = [];
  let collecting = false;
  for (const line of headerLines) {
    const upperLine = line.toUpperCase();
    // Modificado: No ignorar líneas con NIT si estamos recolectando, pero extraer solo el nombre
    if (upperLine.includes('FECHA') || upperLine.includes('DOCUMENTO') || upperLine.includes('FACTURA')) {
      if (collecting) break;
      continue;
    }
    
    // Si la línea tiene NIT, extraer la parte antes
    if (upperLine.includes('NIT')) {
      const match = line.match(/(.+)\s*N\.?I\.?T\.?\s*:?\s*[\d-]/i);
      if (match && match[1] && match[1].trim().length > 5) {
        supplierParts.push(match[1].trim());
        break; // Detener después de agregar el nombre
      }
      continue;
    }
    
    // Empezar a recolectar cuando encontramos líneas con potencial nombre
    if (line.length > 5 && 
        line.split(/\s+/).length >= 1 &&  
        !/^\d+$/.test(line) &&  
        !/^[A-Z0-9]{10,}$/.test(upperLine)) {  
      supplierParts.push(line.trim());
      collecting = true;
    } else if (collecting) {
      // Detener si encontramos línea vacía o irrelevante
      break;
    }
  }
  // Unir partes y limpiar
  extractedData.supplier = supplierParts.join(', ').trim();
  extractedData.supplier = extractedData.supplier.replace(/\s*,\s*/g, ', ').replace(/,$/, '');
}
// NIT    


//serie y invoice
const cleanNumber = (num: string): string => num.replace(/[,\s]/g, '');

// PASO 1: Buscar patrones combinados (SERIE y NÚMERO en la misma línea)
const combinedPatterns = [
  /SERIE\s*[:#]?\s*([A-Z0-9\-]+)\s+N[ÚUúu]MERO\s*[:#]?\s*([\d,]+)/i,
  /Serie\s*[:#]?\s*([A-Z0-9\-]+)\s+N[úuÚU]mero\s*[:#]?\s*([\d,]+)/i,
  /Serie\s+([A-Z0-9\-]+)\s+Numero\s+([\d,]+)/i, // Sin :
  /SERIE\s+([A-Z0-9\-]+)\s+NUMERO\s+([\d,]+)/i, // Sin :
  /SERIE\s*::\s*([A-Z0-9\-]+)\s+N[ÚUúu]MERO\s*::\s*([\d,]+)/i, // Con ::
  /Serie\s*::\s*([A-Z0-9\-]+)\s+N[úuÚU]mero\s*::\s*([\d,]+)/i // Con ::
];

// PASO 2: Buscar patrones individuales de serie
const seriePatterns = [
  /Serie\s*[:#]?\s*([A-Z0-9\-]+)/i,
  /SERIE\s*[:#]?\s*([A-Z0-9\-]+)/i,
  /Serie\s*([A-Z0-9\-]+)/i, // Sin :
  /SERIE\s+([A-Z0-9\-]+)/i, // Sin :
  /Serie\s*::\s*([A-Z0-9\-]+)/i, // Con ::
  /SERIE\s*::\s*([A-Z0-9\-]+)/i, // Con ::
  /S[E3R|I1]{4}\s*[:\s]*([A-Z0-9\-]{4,20})/i
];

// PASO 3: Buscar patrones de número - AMPLIADOS
const numberPatterns = [
  /No\s*:\s*([\d,]+)/i,
  /No:([\d,]+)/i,             // "No:1256551058" (sin espacio)
  /No\s*.\s*([\d,]+)/i,       // Para "No." con punto
  /No\.\s*([\d,]+)/i,         // "No. 1256551058"
  /N[°oO]\s*:\s*([\d,]+)/i,   // Para "N°:" o "No:"
  /N[°oO]:([\d,]+)/i,
  // 
  // Patrones específicos para "Número:" con o sin espacios
  /N[úuÚU]mero\s*[:#]?\s*([\d,]+)/i,       
  /N[úuÚU]mero\s*[:#]?\s*(\d+)/i,          
  /N[úuÚU]mero:([\d,]+)/i,             
  /Numero\s*[:#]?\s*([\d,]+)/i,            
  /Numero:([\d,]+)/i,                   
  // Con ::
  /N[úuÚU]mero\s*::\s*([\d,]+)/i,
  /N[úuÚU]mero\s*::\s*(\d+)/i,
  /N[úuÚU]mero::([\d,]+)/i,
  /Numero\s*::\s*([\d,]+)/i,
  /Numero::([\d,]+)/i,
  // Nuevo patrón para "Número de DTE:"
  /N[úuÚU]mero\s+de\s+DTE\s*[:#]?\s*(\d+)/i,
  /Numero\s+de\s+DTE\s*[:#]?\s*(\d+)/i,
  /N[úuÚU]mero\s+de\s+DTE:(\d+)/i, // Sin espacio después de :
  /Numero de DTE\s*:\s*(\d+)/i,
  /N[ÚU]MERO\s*[:#]?\s*([\d,]+)/i,
  /N°?\s*[:#]?\s*([\d,]+)/i,
  /DTE\s*[:#]?\s*([\d,]+)/i,
  /FACTURA\s*N[°oO]?\s*[:#]?\s*([\d,]+)/i,
  /Factura\s+No\.\s*([\d]+)/i, // "Factura No. 3544334986"
  /Factura\s+No\s*([\d]+)/i, // Sin punto
  /Factura\s+N[°oO]?\s*([\d]+)/i
];

// Procesar líneas
for (let i = 0; i < lines.length; i++) {
  let line = lines[i].trim();
  
  // Debug mejorado
  if (/N[úuÚU]mero|Serie/i.test(line)) {
    console.log(`Línea ${i}: "${line}" (longitud: ${line.length})`);
    // Mostrar códigos de caracteres para debug
    if (/N[úuÚU]mero[:#]/i.test(line)) {
      console.log(`  Caracteres alrededor de ":",`, line.split('').map(c => c.charCodeAt(0)));
    }
  }
  
  // Manejar caso donde el valor está en la línea siguiente
  let nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
  
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

//serie y invoice

      // === EXTRACCIÓN DE FECHA ===
      const datePatterns = [
        /FECHA\s*[A-Z\s]*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /EMISI[OÓ]N\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\s+\d{2}:\d{2}/,
        /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/
      ];

      for (const pattern of datePatterns) {
        for (const line of lines) {
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
              
              if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000) {
                extractedData.date = dateStr;
                break;
              }
            }
          }
        }
        if (extractedData.date) break;
      }

    // === EXTRACCIÓN DE MONTO TOTAL ===

  // ... (código anterior) ...

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


    //extractedData.amount = findFinalTotal(allWords) || '';
    extractedData.amount = findFinalTotalByLines(lines) || '';



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

    // === EXTRACCIÓN DE DESCRIPCIÓN ===
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
        console.log("Actualizando descripción:", extractedData.description);
        setDescription(extractedData.description);
      }
    }, 100);

    // Mostrar resumen de extracción
    const extractedCount = Object.values(extractedData).filter(value => value).length;
    alert(`Datos extraídos exitosamente!\n${extractedCount}/8 campos encontrados.\nPor favor, verifique los datos.`);

  } catch (error) {
    console.error("Error al extraer datos con ML Kit:", error);
    alert('Error al procesar la imagen. Inténtelo manualmente o revise la conexión.');
  } finally {
    setIsLoading(false);
  }
};


// codigo del total
function findFinalTotalByLines(lines: string[]): string | null {
  console.log('=== INICIANDO BÚSQUEDA DE TOTAL ===');
  console.log(`Total de líneas: ${lines.length}`);

  // Paso 1: Buscar líneas que contengan "TOTAL" pero NO "SUBTOTAL"
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    
    // Ignorar subtotales
    if (/subtotal/i.test(line)) {
      console.log(`Línea ${i}: Ignorando SUBTOTAL - "${line}"`);
      continue;
    }

    // Buscar líneas con TOTAL
    if (/total/i.test(line)) {
      console.log(`Línea ${i}: Encontrada línea con TOTAL - "${line}"`);
      
      const total = extractTotalFromLine(line);
      if (total) {
        console.log(`TOTAL EXTRAÍDO: ${total}`);
        return total;
      }
    }
  }

  console.log('=== FALLBACK: Buscando último número decimal ===');
  // Paso 2: Fallback - buscar el último número decimal en cualquier línea
  for (let i = lines.length - 1; i >= 0; i--) {
    const total = extractNumberFromLine(lines[i]);
    if (total) {
      console.log(`FALLBACK - Número encontrado: ${total} en línea: "${lines[i]}"`);
      return total;
    }
  }

  console.log('=== NO SE ENCONTRÓ NINGÚN TOTAL ===');
  return null;
}

function extractTotalFromLine(line: string): string | null {
  console.log(`  Extrayendo total de: "${line}"`);
  
  // Patrones de números en orden de prioridad
  const patterns = [
    // Patrón 1: Números con moneda guatemalteca Q34.10 o Q34,10
    /Q\s*(\d+[.,]\d{2})/gi,
    
    // Patrón 2: Números al final de línea con decimales 157.30 o 157,30
    /(\d+[.,]\d{2})\s*$/g,
    
    // Patrón 3: Cualquier número con 2 decimales (más específico)
    /(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/g,
    
    // Patrón 4: Números simples con decimales 068.01, 216.00
    /(\d+[.,]\d{2})/g,
    
    // Patrón 5: Números con 1 decimal
    /(\d+[.,]\d{1})/g,
    
    // Patrón 6: Números enteros al final
    /(\d+)\s*$/g
  ];

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const matches = Array.from(line.matchAll(pattern));
    
    if (matches && matches.length > 0) {
      console.log(`    Patrón ${i + 1} encontró:`, matches.map(m => m[1] || m[0]));
      
      // Para el patrón de moneda Q, tomar el grupo capturado
      if (i === 0) {
        const amount = matches[matches.length - 1][1];
        return normalizeNumber(amount);
      }
      
      // Para otros patrones, tomar el último match
      const lastMatch = matches[matches.length - 1];
      const amount = lastMatch[1] || lastMatch[0];
      return normalizeNumber(amount);
    }
  }

  return null;
}

function extractNumberFromLine(line: string): string | null {
  // Fallback más simple - buscar cualquier número decimal
  const patterns = [
    /(\d+[.,]\d{2})/g,
    /(\d+[.,]\d{1})/g,
    /(\d+)\s*$/g
  ];

  for (const pattern of patterns) {
    const matches = Array.from(line.matchAll(pattern));
    if (matches && matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const amount = lastMatch[1] || lastMatch[0];
      return normalizeNumber(amount);
    }
  }

  return null;
}

function normalizeNumber(amount: string): string {
  if (!amount) return '';
  
  // Limpiar espacios
  let normalized = amount.trim();
  
  // Reemplazar coma por punto para decimales
  // Si tiene formato 1,234.56 (coma de miles), preservar
  // Si tiene formato 123,45 (coma decimal), convertir a punto
  
  // Contar puntos y comas
  const commas = (normalized.match(/,/g) || []).length;
  const dots = (normalized.match(/\./g) || []).length;
  
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
  // 1. Find all possible keywords for the total amount.
  const totalKeywords = allWords.filter(word => /total|gran total|son/i.test(word.text));
  if (totalKeywords.length === 0) {
    console.log("No 'Total' keyword found.");
    // Fallback to bottommost number if no keyword found
  } else {
    // 2. Find the keyword that is lowest on the page (this is our anchor).
    const anchorKeyword = totalKeywords.sort((a, b) => b.frame.top - a.frame.top)[0];
    console.log(`Anchor keyword found: '${anchorKeyword.text}' at position ${anchorKeyword.frame.top}`);
    
    // 3. Define a "search area" to the right of the anchor keyword.
    // Increased vertical tolerance for OCR variations
    const searchArea = {
      top: anchorKeyword.frame.top - 2 * anchorKeyword.frame.height, // More tolerant above
      bottom: anchorKeyword.frame.top + 2 * anchorKeyword.frame.height, // More tolerant below
      left: anchorKeyword.frame.left + anchorKeyword.frame.width / 2, // Slightly less strict on left
    };

    // 4. Find all numbers that fall within this defined search area.
    const potentialAmounts = allWords.filter(word => {
      const isNumber = /\d+\.\d{2}/.test(word.text); // Simplified to detect presence of number with decimal
      if (!isNumber) return false;

      const wordCenterY = word.frame.top + word.frame.height / 2;
      // Check if the word is vertically within our search area and to the right
      return wordCenterY > searchArea.top && wordCenterY < searchArea.bottom && word.frame.left > searchArea.left;
    });

    if (potentialAmounts.length > 0) {
      // If we find multiple numbers in the area, pick the one farthest to the right (often the final amount in receipts).
      potentialAmounts.sort((a, b) => b.frame.left - a.frame.left);
      let finalAmountText = potentialAmounts[0].text;
      
      // Improved cleaning: Remove any non-numeric characters except dot.
      finalAmountText = finalAmountText.replace(/[^0-9.]/g, '');
      
      console.log("Final amount found in search area:", finalAmountText);
      return finalAmountText;
    }
    
    console.log("No amount found within the search area.");
  }
  
  // Fallback: If no amount found near keyword, find the bottommost number with decimal on the page
  const allAmounts = allWords.filter(word => /\d+\.\d{2}/.test(word.text));
  if (allAmounts.length > 0) {
    // Sort by top descending (bottommost)
    const bottomAmount = allAmounts.sort((a, b) => b.frame.top - a.frame.top)[0];
    let finalAmountText = bottomAmount.text.replace(/[^0-9.]/g, '');
    console.log("Fallback: Bottommost amount found:", finalAmountText);
    return finalAmountText;
  }

  console.log("No fallback amount found.");
  return null;
};


// Asegúrate de tener el estado isLoading
const [isLoading, setIsLoading] = useState(false);

  return (
    
  <View style={styles.outerContainer}>
    <ScrollView style={styles.container}
     contentContainerStyle={styles.contentContainer} // Added for scrolling
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Nuevo Gasto</Text>

      {/* Sección de Scan (solo adjunta imagen, sin OCR) */}
      <View style={styles.scanContainer}>
        <Ionicons name="camera" size={24} color="#3b82f6" />
        <Text style={styles.scanTitle}>Adjuntar Factura</Text>
        <Text style={styles.scanSubtitle}>Sube o toma una foto de tu factura</Text>
        <TouchableOpacity style={styles.scanButton} onPress={handleScan}>
          <Ionicons name="cloud-upload-outline" size={20} color="white" />
          <Text style={styles.scanButtonText}>Adjuntar</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Descripción *</Text>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Ej: Almuerzo de trabajo con cliente" />

      <Text style={styles.label}>Monto *</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="numeric" />

      <Text style={styles.label}>Fecha *</Text>
      <TouchableOpacity style={styles.dateInput} onPress={() => setShowDatePicker(true)}>
        <Text style={styles.dateText}>{formatDate(date)}</Text>
        <Ionicons name="calendar-outline" size={20} color="gray" />
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker value={date} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={handleDateChange} />
      )}

      <Text style={styles.label}>Categoría *</Text>
      <Picker selectedValue={category} onValueChange={handleCategoryChange} style={styles.picker}>
        <Picker.Item label="Seleccionar categoría" value="" color="#000000" />
         {categories.map((cat) => <Picker.Item key={cat.id} label={cat.name} value={cat.name} color="#000000" />)}
      </Picker>

      <Text style={styles.label}>Departamento *</Text>
      <Picker selectedValue={department} onValueChange={setDepartment} style={styles.picker}>
        <Picker.Item label="Seleccionar departamento" value="" color="#000000" />
        {departments.map((dept) => <Picker.Item key={dept} label={dept} value={dept} color="#000000" />)}
      </Picker>

      <Text style={styles.label}>Serie</Text>
      <TextInput style={styles.input} value={serie} onChangeText={setSerie} />

      <Text style={styles.label}>No. Factura</Text>
      <TextInput style={styles.input} value={noinvoice} onChangeText={setNoinvoice} />

      <Text style={styles.label}>Proveedor (Emisor)</Text>
      <TextInput style={styles.input} value={supplier} onChangeText={setSupplier} />

      <Text style={styles.label}>NIT (VAT Number)</Text>
      <TextInput style={styles.input} value={vat_number} onChangeText={setVatNumber} />

      <Text style={styles.label}>Centro</Text>
      <TextInput style={styles.input} value={centro} onChangeText={setCentro} />

      <Text style={styles.label}>Cuenta</Text>
      <TextInput style={styles.input} value={cuenta} onChangeText={setCuenta} />

      <Text style={styles.label}>Orden CO</Text>
      <TextInput style={styles.input} value={ordenco} onChangeText={setOrdenco} />

      <Text style={styles.label}>Total IVA</Text>
      <TextInput style={styles.input} value={totiva} onChangeText={setTotiva} keyboardType="numeric"  readOnly/>

      <Text style={styles.label}>Moneda</Text>
      <Picker selectedValue={currency} onValueChange={setCurrency} style={styles.picker}>
        {currencies.map((curr) => <Picker.Item key={curr} label={curr} value={curr} />)}
      </Picker>

      <Text style={styles.label}>Comprobante</Text>
      <TouchableOpacity style={styles.fileButton} onPress={handleChooseFile}>
        <Text style={styles.fileButtonText}>Choose File</Text>
        <Text style={styles.fileName}>{file ? file.name : 'No file chosen'}</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Notas</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={notes} onChangeText={setNotes} placeholder="Información adicional..." multiline />

     </ScrollView>

      <SafeAreaView style={styles.fixedButtonContainer}>
        <TouchableOpacity style={[styles.baseButton,styles.cancelButton]} onPress={() => router.back()}>
          <Text style={styles.baseButtonText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.baseButton,styles.draftButton]} onPress={() => handleSave('BORRADOR')}>
          <Ionicons name="save-outline" size={20} color="white" />
          <Text style={styles.baseButtonText}>Borrador</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.baseButton, styles.submitButton]} onPress={() => handleSave('ENVIADO_JEFE')}>
          <Ionicons name="paper-plane-outline" size={20} color="white" />
          <Text style={styles.baseButtonText}>Enviar</Text>
        </TouchableOpacity>
      </SafeAreaView>
   

    </View>
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
  container: { flex: 1, padding: 20, paddingBottom:120, backgroundColor: 'white' },
  contentContainer: { flexGrow: 1, padding: 20, paddingBottom: 120 },
  fixedButtonContainer: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 8,
  },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, color: '#2563eb' },
  scanContainer: { alignItems: 'center', backgroundColor: '#eff6ff', padding: 15, borderRadius: 8, marginBottom: 20 },
  scanTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b82f6', marginTop: 10 },
  scanSubtitle: { fontSize: 14, color: 'gray', textAlign: 'center', marginBottom: 10 },
  scanButton: { flexDirection: 'row', backgroundColor: '#2563eb', padding: 10, borderRadius: 8, alignItems: 'center' },
  scanButtonText: { color: 'white', marginLeft: 5 },
  label: { fontSize: 16, fontWeight: '500', marginBottom: 5, color: '#374151' },
  input: { borderWidth: 1, borderColor: '#d1d5db', padding: 12, borderRadius: 8, marginBottom: 15, fontSize: 16, color: '#000000' },
  dateInput: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db', padding: 12, borderRadius: 8, marginBottom: 15 },
  dateText: { fontSize: 16, color: '#374151' },
  picker: { 
    borderWidth: 1, 
    borderColor: '#d1d5db', 
    borderRadius: 8, 
    marginBottom: 15,
    height: 50,
    color: '#000000', // Color del texto negro
    backgroundColor: '#ffffff' // Fondo blanco para mejor contraste
  },
  fileButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db', padding: 12, borderRadius: 8, marginBottom: 15 },
  fileButtonText: { color: '#2563eb', marginRight: 10 },
  fileName: { color: 'gray' },
  notesInput: { height: 100, textAlignVertical: 'top' },
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