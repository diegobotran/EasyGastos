/**
 * Script para inicializar la colección de Sociedades en MongoDB
 * 
 * Este script:
 * - Crea la colección 'sociedades' si no existe
 * - Inserta/actualiza los datos de sociedades con sus NITs
 * - Valida que no haya duplicados
 * 
 * IMPORTANTE: Los NITs de sociedades son los NITs RECEPTORES de las facturas SAT
 * - NIT Sociedad = NIT Receptor (idReceptor) = Cliente que recibe la factura
 * - NIT Emisor (nitEmisor) = Proveedor que emite la factura
 * 
 * Uso:
 *   node scripts/init-sociedades.js
 *   MONGODB_URI=mongodb://host:27017/db node scripts/init-sociedades.js
 */

const path = require('path');
const dotenv = require('dotenv');

// Cargar variables de entorno desde backend/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Sociedad = require('../models/Sociedad');

// Configuración de MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/easygastos';

// Datos histÃ³ricos para la inicializaciÃ³n administrativa de sociedades.
const SOCIEDADES_DATA = [
  { codigo: '500', nit: '46210555', nombre: 'Sociedad 500' },
  { codigo: '510', nit: '47324929', nombre: 'Sociedad 510' },
  { codigo: '520', nit: '82937877', nombre: 'Sociedad 520' },
  { codigo: '1000', nit: '336963', nombre: 'Sociedad 1000' },
  { codigo: '2000', nit: '2291', nombre: 'Sociedad 2000' },
  { codigo: '3000', nit: '343862', nombre: 'Sociedad 3000' },
  { codigo: '3100', nit: '322482', nombre: 'Sociedad 3100' },
  { codigo: '3200', nit: '323012', nombre: 'Sociedad 3200' },
  { codigo: '3300', nit: '322369', nombre: 'Sociedad 3300' },
  { codigo: '4000', nit: '345377', nombre: 'Sociedad 4000' },
  { codigo: '4100', nit: '3881830', nombre: 'Sociedad 4100' },
  { codigo: '5000', nit: '792500', nombre: 'Sociedad 5000' },
  { codigo: '5400', nit: '41182901', nombre: 'Sociedad 5400' },
  { codigo: '5700', nit: '581100', nombre: 'Sociedad 5700' },
  { codigo: '5800', nit: '5298288', nombre: 'Sociedad 5800' },
  { codigo: '5900', nit: '120294923', nombre: 'Sociedad 5900' },
  { codigo: '7100', nit: '7004966', nombre: 'Sociedad 7100' },
  { codigo: '7200', nit: '1430114', nombre: 'Sociedad 7200' },
  { codigo: '7300', nit: '1688804', nombre: 'Sociedad 7300' },
  { codigo: '7700', nit: '110867505', nombre: 'Sociedad 7700' },
  { codigo: 'AGRICOLA', nit: '79759238', nombre: 'Agrícola' },
  { codigo: 'ATESA', nit: '820781K', nombre: 'ATESA' },
  { codigo: 'BLSA', nit: '60969865', nombre: 'BLSA' },
  { codigo: 'BYSA', nit: '60969660', nombre: 'BYSA' },
  { codigo: 'LOMAS', nit: '118469967', nombre: 'Lomas' },
];

async function initSociedades() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  INICIALIZACIÓN DE SOCIEDADES');
    console.log('═══════════════════════════════════════════════════════\n');

    // Conectar a MongoDB
    console.log('📡 Conectando a MongoDB...');
    const isLocal = MONGODB_URI.includes('localhost') || MONGODB_URI.includes('127.0.0.1');
    const dbHost = isLocal ? '🖥️  Local' : '☁️  Nube (AWS)';
    console.log(`   Destino: ${dbHost}`);
    console.log(`   URI: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}`);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado exitosamente\n');
    console.log('📝 IMPORTANTE: NITs de sociedades = NITs RECEPTORES en facturas SAT');
    console.log('   (El NIT del proveedor es otro - va en nitEmisor)\n');

    let insertadas = 0;
    let actualizadas = 0;
    let errores = 0;

    console.log(`📊 Procesando ${SOCIEDADES_DATA.length} sociedades...\n`);

    for (const data of SOCIEDADES_DATA) {
      try {
        // Usar upsert para insertar o actualizar
        const result = await Sociedad.updateOne(
          { codigo: data.codigo.toUpperCase() },
          { 
            $set: {
              codigo: data.codigo.toUpperCase(),
              nit: data.nit.toUpperCase(),
              nombre: data.nombre,
              activa: true,
              pais: 'GT'
            }
          },
          { upsert: true }
        );

        if (result.upsertedCount > 0) {
          console.log(`✅ Insertada: ${data.codigo} - NIT: ${data.nit}`);
          insertadas++;
        } else if (result.modifiedCount > 0) {
          console.log(`🔄 Actualizada: ${data.codigo} - NIT: ${data.nit}`);
          actualizadas++;
        } else {
          console.log(`ℹ️  Sin cambios: ${data.codigo} - NIT: ${data.nit}`);
        }
      } catch (error) {
        console.error(`❌ Error con ${data.codigo}:`, error.message);
        errores++;
      }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  RESUMEN');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ Insertadas:   ${insertadas}`);
    console.log(`🔄 Actualizadas: ${actualizadas}`);
    console.log(`❌ Errores:      ${errores}`);
    console.log(`📊 Total:        ${SOCIEDADES_DATA.length}`);

    // Verificar y mostrar todas las sociedades
    const sociedadesEnDB = await Sociedad.find({ activa: true }).sort({ codigo: 1 });
    console.log(`\n📋 Sociedades activas en la base de datos: ${sociedadesEnDB.length}`);
    console.log('\nCódigo  | NIT          | Nombre');
    console.log('--------|--------------|----------------------------------');
    sociedadesEnDB.forEach(soc => {
      console.log(`${soc.codigo.padEnd(8)}| ${soc.nit.padEnd(13)}| ${soc.nombre}`);
    });

    console.log('\n✅ Inicialización completada exitosamente');

  } catch (error) {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Desconectado de MongoDB');
  }
}

// Ejecutar
initSociedades();
