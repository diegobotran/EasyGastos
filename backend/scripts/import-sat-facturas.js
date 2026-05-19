/**
 * Script para importar facturas SAT desde archivos Excel a MongoDB
 * 
 * ⚠️  SEGURIDAD:
 * Este script SOLO modifica las colecciones 'sat_facturas' y 'sat_archivos_procesados'
 * NO toca: users, expenses, liquidations, categories, etc.
 * 
 * 🎯 INTELIGENTE: No re-procesa archivos ya importados
 * 
 * Uso:
 *   node scripts/import-sat-facturas.js [opciones]
 * 
 * Opciones:
 *   --clean    : Limpia la colección sat_facturas antes de importar
 *   --force    : Fuerza re-importación de archivos ya procesados
 *   --file     : Importar solo un archivo específico
 *   --dry-run  : Simula la importación sin guardar nada (PRUEBA)
 * 
 * Ejemplo:
 *   node scripts/import-sat-facturas.js --dry-run    (PRUEBA primero)
 *   node scripts/import-sat-facturas.js              (Importar solo nuevos)
 *   node scripts/import-sat-facturas.js --force      (Re-importar todos)
 *   node scripts/import-sat-facturas.js --clean      (Limpiar y reimportar)
 *   node scripts/import-sat-facturas.js --file=facturas_2026.xlsx
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const xlsx = require('xlsx');
const mongoose = require('mongoose');

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Configuración
const SAT_FOLDER = path.join(__dirname, '../SAT');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/easygastos';

// 🛡️ COLECCIÓN PROTEGIDA - SOLO SE MODIFICA ESTA
const SAFE_COLLECTION_NAME = 'sat_facturas';

// 🚫 COLECCIONES QUE NO SE DEBEN TOCAR NUNCA
const PROTECTED_COLLECTIONS = [
  'users',
  'expenses',
  'liquidations',
  'categories',
  'sync_logs',
  'config',
  'chat_conversations'
];

// Schema de Mongoose para facturas SAT
const satFacturaSchema = new mongoose.Schema({
  // Identificación única
  numeroAutorizacion: { type: String, required: true, unique: true, index: true }, // UUID
  
  // Datos generales del DTE
  fechaEmision: { type: Date, required: true, index: true },
  tipoDTE: { type: String, required: true },
  serie: { type: String, required: true },
  numeroDTE: { type: String, required: true },
  estado: { type: String, required: true }, // "Vigente" o "Anulado"
  moneda: { type: String, default: 'GTQ' },
  
  // Emisor (Proveedor)
  nitEmisor: { type: String, required: true, index: true },
  nombreEmisor: { type: String, required: true },
  clasificacionEmisor: { type: String },
  codigoEstablecimiento: { type: String },
  nombreEstablecimiento: { type: String },
  
  // Receptor (Cliente)
  idReceptor: { type: String, required: true },
  nombreReceptor: { type: String, required: true },
  
  // Certificador
  nitCertificador: { type: String },
  nombreCertificador: { type: String },
  
  // Montos
  granTotal: { type: Number, required: true },
  iva: { type: Number, default: 0 },
  
  // Anulación
  marcaAnulado: { type: Boolean, default: false },
  fechaAnulacion: { type: Date, default: null },
  
  // Otros impuestos
  impuestoPetroleo: { type: Number, default: 0 },
  impuestoTurismoHospedaje: { type: Number, default: 0 },
  impuestoTurismoPasajes: { type: Number, default: 0 },
  impuestoTimbrePrensa: { type: Number, default: 0 },
  impuestoBomberos: { type: Number, default: 0 },
  impuestoTasaMunicipal: { type: Number, default: 0 },
  impuestoBebidasAlcoholicas: { type: Number, default: 0 },
  impuestoTabaco: { type: Number, default: 0 },
  impuestoCemento: { type: Number, default: 0 },
  impuestoBebidasNoAlcoholicas: { type: Number, default: 0 },
  impuestoTarifaPortuaria: { type: Number, default: 0 },
  
  // Flags adicionales
  exportacion: { type: Boolean, default: false },
  ubicacionTemporal: { type: Boolean, default: false },
  
  // Metadatos de importación
  importadoEn: { type: Date, default: Date.now },
  archivoOrigen: { type: String },
  sociedad: { type: String, index: true } // Extraído del nombre del archivo
}, {
  timestamps: true,
  collection: 'sat_facturas'
});

// Índices compuestos para búsquedas eficientes
satFacturaSchema.index({ nitEmisor: 1, fechaEmision: -1 });
satFacturaSchema.index({ idReceptor: 1, fechaEmision: -1 });
satFacturaSchema.index({ sociedad: 1, fechaEmision: -1 });

const SATFactura = mongoose.model('SATFactura', satFacturaSchema);

// Schema para trackear archivos procesados
const archivosProcesadosSchema = new mongoose.Schema({
  nombreArchivo: { type: String, required: true, unique: true, index: true },
  fechaProcesamiento: { type: Date, default: Date.now },
  cantidadFacturas: { type: Number, default: 0 },
  insertadas: { type: Number, default: 0 },
  actualizadas: { type: Number, default: 0 },
  errores: { type: Number, default: 0 },
  sociedades: [String],
  hash: { type: String } // Hash del archivo para detectar cambios
}, {
  timestamps: true,
  collection: 'sat_archivos_procesados'
});

const ArchivoProcesado = mongoose.model('ArchivoProcesado', archivosProcesadosSchema);

/**
 * Convierte un valor de Excel a booleano
 */
function parseBoolean(value) {
  if (value === null || value === undefined || value === '') return false;
  const str = String(value).toLowerCase().trim();
  return str === 'si' || str === 'sí' || str === 'yes' || str === 'true' || str === '1';
}

/**
 * Convierte un valor de Excel a número
 */
function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Convierte fecha de Excel a Date
 */
function parseDate(value) {
  if (!value) return null;
  
  // Si es un número (formato fecha de Excel)
  if (typeof value === 'number') {
    return xlsx.SSF.parse_date_code(value);
  }
  
  // Si es string, intentar parsear
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Calcula hash simple del archivo para detectar cambios
 */
function calcularHashArchivo(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('md5');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Verifica si un archivo ya fue procesado
 */
async function archivoYaProcesado(nombreArchivo, hash) {
  const archivo = await ArchivoProcesado.findOne({ nombreArchivo });
  
  if (!archivo) {
    return { procesado: false, motivo: 'nuevo' };
  }
  
  // Si el hash es diferente, el archivo cambió
  if (archivo.hash && archivo.hash !== hash) {
    return { procesado: false, motivo: 'modificado', archivoAnterior: archivo };
  }
  
  return { procesado: true, archivo };
}

/**
 * Guarda información del archivo procesado
 */
async function guardarArchivoProcesado(nombreArchivo, hash, stats) {
  const sociedades = await SATFactura.distinct('sociedad', { archivoOrigen: nombreArchivo });
  
  await ArchivoProcesado.updateOne(
    { nombreArchivo },
    {
      $set: {
        fechaProcesamiento: new Date(),
        cantidadFacturas: stats.insertadas + stats.actualizadas,
        insertadas: stats.insertadas,
        actualizadas: stats.actualizadas,
        errores: stats.errores,
        sociedades,
        hash
      }
    },
    { upsert: true }
  );
}

/**
 * Extrae el nombre de la sociedad del nombre del archivo
 * Ejemplo: "facturas_INGENIO_TULULA_2026.xlsx" -> "INGENIO TULULA"
 */
function extractSociedadFromFilename(filename) {
  // Remover extensión
  const nameWithoutExt = filename.replace(/\.(xlsx|xls|csv)$/i, '');
  
  // Patrones comunes: facturas_SOCIEDAD_YYYY o SOCIEDAD_facturas o simplemente SOCIEDAD
  const patterns = [
    /facturas[_-]([A-Z][A-Z\s_-]+?)(?:[_-]\d{4})?$/i,
    /^([A-Z][A-Z\s_-]+?)[_-]facturas/i,
    /^([A-Z][A-Z\s_-]+?)$/i
  ];
  
  for (const pattern of patterns) {
    const match = nameWithoutExt.match(pattern);
    if (match) {
      return match[1].replace(/[_-]/g, ' ').trim();
    }
  }
  
  return nameWithoutExt;
}

/**
 * Procesa un archivo Excel y retorna array de facturas
 */
function procesarArchivoExcel(filePath) {
  console.log(`${colors.cyan}📄 Procesando: ${path.basename(filePath)}${colors.reset}`);
  
  // Leer archivo Excel
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Convertir a JSON
  const rows = xlsx.utils.sheet_to_json(sheet);
  
  console.log(`   ${rows.length} filas encontradas`);
  
  const sociedad = extractSociedadFromFilename(path.basename(filePath));
  console.log(`   Sociedad: ${sociedad}`);
  
  const facturas = [];
  let errores = 0;
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    try {
      // Validar campos obligatorios
      if (!row['Número de Autorización']) {
        console.log(`   ${colors.yellow}⚠️  Fila ${i + 2}: Sin Número de Autorización - omitida${colors.reset}`);
        errores++;
        continue;
      }
      
      // Construir objeto de factura
      const factura = {
        numeroAutorizacion: String(row['Número de Autorización']).trim(),
        
        // Datos generales
        fechaEmision: parseDate(row['Fecha de emisión']),
        tipoDTE: String(row['Tipo de DTE (nombre)'] || '').trim(),
        serie: String(row['Serie'] || '').trim(),
        numeroDTE: String(row['Número del DTE'] || '').trim(),
        estado: String(row['Estado'] || 'Vigente').trim(),
        moneda: String(row['Moneda'] || 'GTQ').trim(),
        
        // Emisor
        nitEmisor: String(row['NIT del emisor'] || '').trim(),
        nombreEmisor: String(row['Nombre completo del emisor'] || '').trim(),
        clasificacionEmisor: String(row['Clasificación emisor'] || '').trim(),
        codigoEstablecimiento: String(row['Código de establecimiento'] || '').trim(),
        nombreEstablecimiento: String(row['Nombre del establecimiento'] || '').trim(),
        
        // Receptor
        idReceptor: String(row['ID del receptor'] || '').trim(),
        nombreReceptor: String(row['Nombre completo del receptor'] || '').trim(),
        
        // Certificador
        nitCertificador: String(row['NIT del Certificador'] || '').trim(),
        nombreCertificador: String(row['Nombre completo del Certificador'] || '').trim(),
        
        // Montos
        granTotal: parseNumber(row['Gran Total (Moneda Original)']),
        iva: parseNumber(row['IVA (monto de este impuesto)']),
        
        // Anulación
        marcaAnulado: parseBoolean(row['Marca de anulado']),
        fechaAnulacion: parseDate(row['Fecha de anulación']),
        
        // Otros impuestos
        impuestoPetroleo: parseNumber(row['Petróleo (monto de este impuesto)']),
        impuestoTurismoHospedaje: parseNumber(row['Turismo Hospedaje (monto de este impuesto)']),
        impuestoTurismoPasajes: parseNumber(row['Turismo Pasajes (monto de este impuesto)']),
        impuestoTimbrePrensa: parseNumber(row['Timbre de Prensa (monto de este impuesto)']),
        impuestoBomberos: parseNumber(row['Bomberos (monto de este impuesto)']),
        impuestoTasaMunicipal: parseNumber(row['Tasa Municipal (monto de este impuesto)']),
        impuestoBebidasAlcoholicas: parseNumber(row['Bebidas alcohólicas (monto de este impuesto)']),
        impuestoTabaco: parseNumber(row['Tabaco (monto de este impuesto)']),
        impuestoCemento: parseNumber(row['Cemento (monto de este impuesto)']),
        impuestoBebidasNoAlcoholicas: parseNumber(row['Bebidas no Alcohólicas (monto de este impuesto)']),
        impuestoTarifaPortuaria: parseNumber(row['Tarifa Portuaria (monto de este impuesto)']),
        
        // Flags
        exportacion: parseBoolean(row['Exportación']),
        ubicacionTemporal: parseBoolean(row['Ubicación temporal']),
        
        // Metadatos
        archivoOrigen: path.basename(filePath),
        sociedad: sociedad
      };
      
      facturas.push(factura);
      
    } catch (error) {
      console.log(`   ${colors.red}❌ Error en fila ${i + 2}: ${error.message}${colors.reset}`);
      errores++;
    }
  }
  
  console.log(`   ${colors.green}✅ ${facturas.length} facturas procesadas${colors.reset}`);
  if (errores > 0) {
    console.log(`   ${colors.yellow}⚠️  ${errores} errores${colors.reset}`);
  }
  
  return facturas;
}

/**
 * Importa facturas a MongoDB
 */
async function importarFacturas(facturas, dryRun = false) {
  let insertadas = 0;
  let actualizadas = 0;
  let errores = 0;
  
  if (dryRun) {
    console.log(`\n${colors.yellow}🧪 MODO DRY-RUN: Simulación sin guardar datos${colors.reset}`);
    console.log(`   Se procesarían ${facturas.length} facturas`);
    console.log(`   Colección objetivo: ${SAFE_COLLECTION_NAME}`);
    return { insertadas: facturas.length, actualizadas: 0, errores: 0 };
  }
  
  console.log(`\n${colors.magenta}💾 Importando a MongoDB...${colors.reset}`);
  
  for (const factura of facturas) {
    try {
      // Usar upsert para actualizar si existe o insertar si no existe
      const result = await SATFactura.updateOne(
        { numeroAutorizacion: factura.numeroAutorizacion },
        { $set: factura },
        { upsert: true }
      );
      
      if (result.upsertedCount > 0) {
        insertadas++;
      } else if (result.modifiedCount > 0) {
        actualizadas++;
      }
      
    } catch (error) {
      console.log(`   ${colors.red}❌ Error con UUID ${factura.numeroAutorizacion}: ${error.message}${colors.reset}`);
      errores++;
    }
  }
  
  return { insertadas, actualizadas, errores };
}

/**
 * Verifica la seguridad de la base de datos
 * Asegura que las colecciones protegidas existan y no se toquen
 */
async function verificarSeguridad() {
  console.log(`\n${colors.blue}🛡️  VERIFICACIÓN DE SEGURIDAD${colors.reset}`);
  
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map(c => c.name);
  
  console.log(`   Colecciones en la BD: ${collectionNames.length}`);
  
  // Verificar que colecciones protegidas existan
  const protectedFound = PROTECTED_COLLECTIONS.filter(name => collectionNames.includes(name));
  
  if (protectedFound.length > 0) {
    console.log(`   ${colors.green}✅ Colecciones protegidas encontradas: ${protectedFound.join(', ')}${colors.reset}`);
    console.log(`   ${colors.green}✅ Estas colecciones NO serán modificadas${colors.reset}`);
  }
  
  // Verificar si sat_facturas ya existe
  if (collectionNames.includes(SAFE_COLLECTION_NAME)) {
    const count = await SATFactura.countDocuments();
    console.log(`   ${colors.cyan}ℹ️  Colección '${SAFE_COLLECTION_NAME}' existe con ${count} documentos${colors.reset}`);
  } else {
    console.log(`   ${colors.yellow}⚠️  Colección '${SAFE_COLLECTION_NAME}' será creada${colors.reset}`);
  }
  
  console.log(`   ${colors.green}✅ SOLO se modificará: ${SAFE_COLLECTION_NAME}${colors.reset}\n`);
  
  return true;
}

/**
 * Función principal
 */
async function main() {
  console.log(`${colors.blue}
╔════════════════════════════════════════════════════════════╗
║     IMPORTADOR DE FACTURAS SAT A MONGODB                   ║
║     🛡️  SEGURO: Solo modifica colección 'sat_facturas'     ║
╚════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  // Parsear argumentos
  const args = process.argv.slice(2);
  const cleanCollection = args.includes('--clean');
  const dryRun = args.includes('--dry-run');
  const forceReimport = args.includes('--force');
  const fileArg = args.find(arg => arg.startsWith('--file='));
  const specificFile = fileArg ? fileArg.split('=')[1] : null;
  
  if (dryRun) {
    console.log(`${colors.yellow}
╔════════════════════════════════════════════════════════════╗
║  🧪 MODO DRY-RUN ACTIVADO                                  ║
║  ⚠️  Esto es una SIMULACIÓN - No se guardará nada          ║
╚════════════════════════════════════════════════════════════╝
${colors.reset}\n`);
  }
  
  if (forceReimport) {
    console.log(`${colors.yellow}⚠️  MODO FORCE: Se re-procesarán archivos ya importados${colors.reset}\n`);
  }
  
  try {
    // Verificar que exista la carpeta SAT
    if (!fs.existsSync(SAT_FOLDER)) {
      console.log(`${colors.red}❌ Error: No existe la carpeta SAT en ${SAT_FOLDER}${colors.reset}`);
      console.log(`${colors.yellow}💡 Crea la carpeta y coloca los archivos Excel allí${colors.reset}`);
      process.exit(1);
    }
    
    // Buscar archivos Excel
    let files = fs.readdirSync(SAT_FOLDER)
      .filter(file => /\.(xlsx|xls)$/i.test(file))
      .map(file => path.join(SAT_FOLDER, file));
    
    if (specificFile) {
      files = files.filter(file => path.basename(file) === specificFile);
    }
    
    if (files.length === 0) {
      console.log(`${colors.yellow}⚠️  No se encontraron archivos Excel en la carpeta SAT${colors.reset}`);
      console.log(`${colors.cyan}📁 Carpeta: ${SAT_FOLDER}${colors.reset}`);
      process.exit(0);
    }
    
    console.log(`${colors.cyan}📁 Carpeta: ${SAT_FOLDER}${colors.reset}`);
    console.log(`${colors.cyan}📊 Archivos encontrados: ${files.length}${colors.reset}\n`);
    
    // Conectar a MongoDB
    console.log(`${colors.blue}🔌 Conectando a MongoDB...${colors.reset}`);
    console.log(`   ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);
    console.log(`${colors.green}✅ Conectado exitosamente${colors.reset}`);
    
    // 🛡️ VERIFICAR SEGURIDAD - Asegurar que solo se toca sat_facturas
    await verificarSeguridad();
    
    // 🎯 FILTRAR ARCHIVOS: Verificar cuáles ya fueron procesados
    console.log(`${colors.magenta}🔍 Verificando archivos ya procesados...${colors.reset}`);
    
    const archivosAProcesar = [];
    const archivosOmitidos = [];
    
    for (const file of files) {
      const nombreArchivo = path.basename(file);
      const hash = calcularHashArchivo(file);
      const { procesado, motivo, archivo: archivoAnterior } = await archivoYaProcesado(nombreArchivo, hash);
      
      if (procesado && !forceReimport) {
        // Archivo ya procesado, omitir
        archivosOmitidos.push({
          nombre: nombreArchivo,
          archivo: archivoAnterior
        });
        console.log(`   ${colors.cyan}⏭️  ${nombreArchivo}${colors.reset} - Ya procesado el ${new Date(archivoAnterior.fechaProcesamiento).toLocaleDateString()} (${archivoAnterior.cantidadFacturas} facturas)`);
      } else {
        // Archivo nuevo o modificado, procesar
        archivosAProcesar.push(file);
        if (motivo === 'modificado') {
          console.log(`   ${colors.yellow}🔄 ${nombreArchivo}${colors.reset} - Archivo modificado, se re-procesará`);
        } else {
          console.log(`   ${colors.green}✅ ${nombreArchivo}${colors.reset} - Nuevo archivo`);
        }
      }
    }
    
    console.log(`\n${colors.cyan}📊 Resumen:${colors.reset}`);
    console.log(`   Archivos a procesar: ${colors.green}${archivosAProcesar.length}${colors.reset}`);
    console.log(`   Archivos omitidos: ${colors.cyan}${archivosOmitidos.length}${colors.reset}`);
    
    if (archivosAProcesar.length === 0) {
      console.log(`\n${colors.yellow}✅ No hay archivos nuevos para procesar${colors.reset}`);
      console.log(`${colors.cyan}💡 Usa --force para re-procesar archivos ya importados${colors.reset}`);
      await mongoose.disconnect();
      console.log(`\n${colors.blue}👋 Desconectado de MongoDB${colors.reset}`);
      return;
    }
    
    console.log('');
    
    // Limpiar colección si se solicita
    if (cleanCollection) {
      if (dryRun) {
        console.log(`${colors.yellow}🗑️  [DRY-RUN] Se limpiaría la colección ${SAFE_COLLECTION_NAME}${colors.reset}`);
        console.log(`${colors.yellow}🗑️  [DRY-RUN] Se limpiaría el registro de archivos procesados${colors.reset}\n`);
      } else {
        console.log(`${colors.yellow}🗑️  Limpiando colección ${SAFE_COLLECTION_NAME}...${colors.reset}`);
        const deleteResult = await SATFactura.deleteMany({});
        console.log(`   ${deleteResult.deletedCount} documentos eliminados`);
        
        console.log(`${colors.yellow}🗑️  Limpiando registro de archivos procesados...${colors.reset}`);
        const deleteArchivos = await ArchivoProcesado.deleteMany({});
        console.log(`   ${deleteArchivos.deletedCount} registros eliminados\n`);
      }
    }
    
    // Procesar cada archivo (solo los que necesitan procesarse)
    let archivosProcesadosStats = [];
    
    for (const file of archivosAProcesar) {
      const nombreArchivo = path.basename(file);
      console.log(`${colors.cyan}📄 Procesando: ${nombreArchivo}${colors.reset}`);
      
      const facturas = procesarArchivoExcel(file);
      
      if (facturas.length > 0) {
        // Importar facturas de este archivo
        const resultado = await importarFacturas(facturas, dryRun);
        
        // Guardar info del archivo procesado (solo si no es dry-run)
        if (!dryRun) {
          const hash = calcularHashArchivo(file);
          await guardarArchivoProcesado(nombreArchivo, hash, resultado);
        }
        
        archivosProcesadosStats.push({
          nombre: nombreArchivo,
          cantidad: facturas.length,
          ...resultado
        });
      }
    }
    
    // Calcular totales
    const totales = archivosProcesadosStats.reduce((acc, stats) => ({
      insertadas: acc.insertadas + stats.insertadas,
      actualizadas: acc.actualizadas + stats.actualizadas,
      errores: acc.errores + stats.errores,
      total: acc.total + stats.cantidad
    }), { insertadas: 0, actualizadas: 0, errores: 0, total: 0 });
    
    console.log(`\n${colors.green}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.green}║                    RESUMEN                                 ║${colors.reset}`);
    console.log(`${colors.green}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
    
    console.log(`${colors.cyan}📁 Archivos procesados: ${archivosProcesadosStats.length}${colors.reset}`);
    console.log(`${colors.cyan}📄 Facturas totales: ${totales.total}${colors.reset}\n`);
    
    if (dryRun) {
      console.log(`${colors.yellow}🧪 MODO DRY-RUN - Simulación completada${colors.reset}`);
      console.log(`${colors.cyan}   Se procesarían: ${totales.insertadas} facturas${colors.reset}`);
      console.log(`${colors.cyan}   Colección objetivo: ${SAFE_COLLECTION_NAME}${colors.reset}`);
    } else {
      console.log(`${colors.green}✅ Insertadas:   ${totales.insertadas}${colors.reset}`);
      console.log(`${colors.yellow}🔄 Actualizadas: ${totales.actualizadas}${colors.reset}`);
      console.log(`${colors.red}❌ Errores:      ${totales.errores}${colors.reset}`);
      
      // Detalles por archivo
      if (archivosProcesadosStats.length > 1) {
        console.log(`\n${colors.cyan}📋 Detalle por archivo:${colors.reset}`);
        archivosProcesadosStats.forEach(stats => {
          console.log(`   ${stats.nombre}: ${stats.insertadas} nuevas, ${stats.actualizadas} actualizadas`);
        });
      }
    }
    
    // Estadísticas finales (solo en modo real)
    if (!dryRun) {
      const totalDocs = await SATFactura.countDocuments();
      const sociedades = await SATFactura.distinct('sociedad');
      const vigentes = await SATFactura.countDocuments({ marcaAnulado: false });
      const anuladas = await SATFactura.countDocuments({ marcaAnulado: true });
      const totalArchivosProcesados = await ArchivoProcesado.countDocuments();
      
      console.log(`\n${colors.magenta}📈 Estadísticas de la colección:${colors.reset}`);
      console.log(`   Total documentos: ${totalDocs}`);
      console.log(`   Sociedades: ${sociedades.length} (${sociedades.join(', ')})`);
      console.log(`   Facturas vigentes: ${vigentes}`);
      console.log(`   Facturas anuladas: ${anuladas}`);
      console.log(`   Archivos procesados histórico: ${totalArchivosProcesados}`);
    }
    
    if (dryRun) {
      console.log(`\n${colors.yellow}✅ Simulación completada - No se modificó la base de datos${colors.reset}`);
    } else {
      console.log(`\n${colors.green}✅ Importación completada exitosamente${colors.reset}`);
    }
    
  } catch (error) {
    console.error(`\n${colors.red}❌ Error fatal: ${error.message}${colors.reset}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log(`\n${colors.blue}👋 Desconectado de MongoDB${colors.reset}`);
  }
}

// Ejecutar
main();
