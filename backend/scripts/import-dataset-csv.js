const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');

// Configuración de MongoDB
const MONGODB_URI = 'mongodb://localhost:27017';
const DATABASE_NAME = 'easygastos';

// Esquema para el dataset
const datasetSchema = new mongoose.Schema({
  fechaEmision: { type: Date, index: true },
  numeroAutorizacion: { type: String, index: true },
  tipoDTE: { type: String, index: true },
  serie: { type: String },
  numeroDTE: { type: String },
  clasificacionEmisor: { type: String },
  exportacion: { type: String },
  ubicacionTemporal: { type: String },
  nitEmisor: { type: String, index: true },
  nombreEmisor: { type: String, index: true },
  codigoEstablecimiento: { type: String },
  nombreEstablecimiento: { type: String },
  idReceptor: { type: String, index: true },
  nombreReceptor: { type: String, index: true },
  nitCertificador: { type: String },
  nombreCertificador: { type: String },
  estado: { type: String, index: true },
  moneda: { type: String },
  granTotal: { type: Number, index: true },
  iva: { type: Number },
  marcaAnulado: { type: String },
  fechaAnulacion: { type: Date },
  petroleoImpuesto: { type: Number, default: 0 },
  turismoHospedajeImpuesto: { type: Number, default: 0 },
  turismoPasajesImpuesto: { type: Number, default: 0 },
  timbrePrensaImpuesto: { type: Number, default: 0 },
  bomberosImpuesto: { type: Number, default: 0 },
  tasaMunicipalImpuesto: { type: Number, default: 0 },
  bebidasAlcoholicasImpuesto: { type: Number, default: 0 },
  tabacoImpuesto: { type: Number, default: 0 },
  cementoImpuesto: { type: Number, default: 0 },
  bebidasNoAlcoholicasImpuesto: { type: Number, default: 0 },
  tarifaPortuariaImpuesto: { type: Number, default: 0 }
}, {
  timestamps: true,
  collection: 'dataset'
});

const Dataset = mongoose.model('Dataset', datasetSchema);

// Función para limpiar y parsear números
function parseNumber(value) {
  if (!value || value === '') return 0;
  const cleaned = value.replace(/,/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

// Función para parsear fecha
function parseDate(dateStr) {
  if (!dateStr || dateStr === '') return null;
  try {
    return new Date(dateStr);
  } catch (error) {
    return null;
  }
}

// Función principal de importación
async function importCSV(csvFilePath) {
  console.log('🔗 Conectando a MongoDB...');
  await mongoose.connect(`${MONGODB_URI}/${DATABASE_NAME}`);
  console.log('✅ Conectado a MongoDB');

  // Limpiar colección existente (opcional)
  const shouldClean = process.argv.includes('--clean');
  if (shouldClean) {
    console.log('🗑️  Limpiando colección dataset...');
    await Dataset.deleteMany({});
    console.log('✅ Colección limpiada');
  }

  const records = [];
  let lineCount = 0;
  let errorCount = 0;

  console.log('📂 Leyendo archivo CSV:', csvFilePath);
  console.log('⏳ Procesando registros...');

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        lineCount++;
        
        try {
          const record = {
            fechaEmision: parseDate(row['Fecha de emisión']),
            numeroAutorizacion: row['Número de Autorización'] || '',
            tipoDTE: row['Tipo de DTE\r\n (nombre)'] || row['Tipo de DTE (nombre)'] || '',
            serie: row['Serie'] || '',
            numeroDTE: row['Número del DTE'] || '',
            clasificacionEmisor: row['Clasificación emisor'] || '',
            exportacion: row['Exportación'] || '',
            ubicacionTemporal: row['Ubicación temporal'] || '',
            nitEmisor: row['NIT del emisor'] || '',
            nombreEmisor: row['Nombre completo del emisor'] || '',
            codigoEstablecimiento: row['Código de establecimiento'] || '',
            nombreEstablecimiento: row['Nombre del establecimiento'] || '',
            idReceptor: row['ID del receptor'] || '',
            nombreReceptor: row['Nombre completo del receptor'] || '',
            nitCertificador: row['NIT del Certificador'] || '',
            nombreCertificador: row['Nombre completo del Certificador'] || '',
            estado: row['Estado'] || '',
            moneda: row['Moneda'] || '',
            granTotal: parseNumber(row['Gran Total (Moneda Original)']),
            iva: parseNumber(row['IVA (monto de este impuesto)']),
            marcaAnulado: row['Marca de anulado'] || '',
            fechaAnulacion: parseDate(row['Fecha de anulación']),
            petroleoImpuesto: parseNumber(row['Petróleo (monto de este impuesto)']),
            turismoHospedajeImpuesto: parseNumber(row['Turismo Hospedaje (monto de este impuesto)']),
            turismoPasajesImpuesto: parseNumber(row['Turismo Pasajes (monto de este impuesto)']),
            timbrePrensaImpuesto: parseNumber(row['Timbre de Prensa (monto de este impuesto)']),
            bomberosImpuesto: parseNumber(row['Bomberos (monto de este impuesto)']),
            tasaMunicipalImpuesto: parseNumber(row['Tasa Municipal (monto de este impuesto)']),
            bebidasAlcoholicasImpuesto: parseNumber(row['Bebidas alcohólicas (monto de este impuesto)']),
            tabacoImpuesto: parseNumber(row['Tabaco (monto de este impuesto)']),
            cementoImpuesto: parseNumber(row['Cemento (monto de este impuesto)']),
            bebidasNoAlcoholicasImpuesto: parseNumber(row['Bebidas no Alcohólicas (monto de este impuesto)']),
            tarifaPortuariaImpuesto: parseNumber(row['Tarifa Portuaria (monto de este impuesto)'])
          };

          records.push(record);

          // Insertar en lotes de 1000 registros
          if (records.length >= 1000) {
            const batch = [...records];
            records.length = 0;
            
            Dataset.insertMany(batch, { ordered: false })
              .then(() => {
                console.log(`✅ Insertados ${lineCount} registros (${batch.length} en este lote)`);
              })
              .catch(err => {
                errorCount += err.writeErrors ? err.writeErrors.length : 1;
                console.error(`⚠️  Algunos registros del lote tuvieron errores (continuando...)`);
              });
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ Error procesando línea ${lineCount}:`, error.message);
        }
      })
      .on('end', async () => {
        // Insertar registros restantes
        if (records.length > 0) {
          try {
            await Dataset.insertMany(records, { ordered: false });
            console.log(`✅ Insertados últimos ${records.length} registros`);
          } catch (err) {
            errorCount += err.writeErrors ? err.writeErrors.length : 1;
            console.error('⚠️  Algunos registros finales tuvieron errores');
          }
        }

        console.log('\n📊 RESUMEN DE IMPORTACIÓN:');
        console.log(`✅ Total de líneas procesadas: ${lineCount}`);
        console.log(`❌ Errores encontrados: ${errorCount}`);
        console.log(`✅ Registros exitosos: ${lineCount - errorCount}`);

        // Mostrar estadísticas
        const totalRecords = await Dataset.countDocuments();
        console.log(`\n📈 Total de registros en la colección: ${totalRecords}`);

        // Estadísticas por tipo de DTE
        const tipoStats = await Dataset.aggregate([
          { $group: { _id: '$tipoDTE', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]);
        
        console.log('\n📋 Registros por tipo de DTE:');
        tipoStats.forEach(stat => {
          console.log(`  - ${stat._id}: ${stat.count}`);
        });

        // Estadísticas por estado
        const estadoStats = await Dataset.aggregate([
          { $group: { _id: '$estado', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]);
        
        console.log('\n📋 Registros por estado:');
        estadoStats.forEach(stat => {
          console.log(`  - ${stat._id}: ${stat.count}`);
        });

        await mongoose.disconnect();
        console.log('\n✅ Importación completada y conexión cerrada');
        resolve();
      })
      .on('error', (error) => {
        console.error('❌ Error leyendo archivo CSV:', error);
        mongoose.disconnect();
        reject(error);
      });
  });
}

// Ejecutar importación
const csvFilePath = process.argv[2] || 'C:\\Users\\Administrador\\Downloads\\DATA_2025.csv';

if (!fs.existsSync(csvFilePath)) {
  console.error('❌ Error: Archivo no encontrado:', csvFilePath);
  console.log('Uso: node import-dataset-csv.js <ruta-al-archivo.csv> [--clean]');
  process.exit(1);
}

console.log('🚀 Iniciando importación de dataset...');
console.log('📁 Archivo:', csvFilePath);
console.log('🗄️  Base de datos:', DATABASE_NAME);
console.log('📦 Colección:', 'dataset');
console.log('');

importCSV(csvFilePath)
  .then(() => {
    console.log('✅ ¡Importación exitosa!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error en importación:', error);
    process.exit(1);
  });
