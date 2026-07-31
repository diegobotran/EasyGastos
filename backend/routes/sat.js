/**
 * API para importación de facturas SAT desde fuentes externas
 * 
 * Endpoints:
 * - POST /api/sat/import - Importa facturas desde un archivo Excel
 * - GET /api/sat/archivos - Lista archivos ya procesados
 * - GET /api/sat/facturas - Lista facturas importadas (con filtros)
 * - DELETE /api/sat/reset - Limpia todas las facturas y archivos (requiere manager)
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const SatFactura = require('../models/SatFactura');
const ArchivoSatProcesado = require('../models/ArchivoSatProcesado');
const { authenticateToken, requireManager } = require('../middleware/auth');
const SATInternalValidationService = require('../services/SATInternalValidationService');
const ExpenseDuplicateService = require('../services/ExpenseDuplicateService');

// Colecciones protegidas que NO deben ser afectadas
const PROTECTED_COLLECTIONS = ['users', 'expenses', 'liquidations', 'categories', 'sync_logs', 'config', 'chat_conversations'];

/**
 * POST /api/sat/import
 * Importa facturas desde datos enviados por el cliente
 * 
 * Body esperado:
 * {
 *   nombreArchivo: "facturas_sociedad_123.xlsx",
 *   facturas: [
 *     {
 *       fechaEmision: "2024-01-15",
 *       numeroAutorizacion: "ABC123",
 *       ... (todos los campos de factura)
 *     }
 *   ]
 * }
 */
router.post('/import', authenticateToken, async (req, res) => {
  try {
    const { nombreArchivo, facturas } = req.body;

    if (!nombreArchivo || !facturas || !Array.isArray(facturas)) {
      return res.status(400).json({ 
        error: 'Datos inválidos. Se requiere nombreArchivo y array de facturas' 
      });
    }

    console.log(`📥 Recibiendo archivo: ${nombreArchivo} con ${facturas.length} facturas`);

    // Calcular hash del contenido
    const contenidoStr = JSON.stringify(facturas.sort());
    const hash = crypto.createHash('md5').update(contenidoStr).digest('hex');

    // Verificar si el archivo ya fue procesado
    const archivoPrevio = await ArchivoSatProcesado.findOne({ nombreArchivo });
    
    if (archivoPrevio) {
      if (archivoPrevio.hash === hash) {
        console.log(`⏭️  Archivo ya procesado previamente: ${nombreArchivo}`);
        return res.status(200).json({
          mensaje: 'Archivo ya fue procesado previamente',
          omitido: true,
          nombreArchivo,
          fechaProcesamiento: archivoPrevio.fechaProcesamiento,
          estadisticas: {
            cantidadFacturas: archivoPrevio.cantidadFacturas,
            insertadas: archivoPrevio.insertadas,
            actualizadas: archivoPrevio.actualizadas,
            errores: archivoPrevio.errores
          }
        });
      } else {
        console.log(`🔄 Archivo modificado, reprocesando: ${nombreArchivo}`);
      }
    }

    // Procesar facturas
    let insertadas = 0;
    let actualizadas = 0;
    let errores = 0;
    const sociedadesSet = new Set();

    for (const factura of facturas) {
      try {
        // Validar campos requeridos
        if (!factura.numeroAutorizacion || !factura.fechaEmision) {
          console.warn(`⚠️  Factura sin número de autorización o fecha, omitiendo`);
          errores++;
          continue;
        }

        // Agregar metadata
        factura.archivoOrigen = nombreArchivo;
        factura.hashArchivo = hash;
        factura.fechaImportacion = new Date();

        // Convertir fechas si son strings
        if (typeof factura.fechaEmision === 'string') {
          factura.fechaEmision = new Date(factura.fechaEmision);
        }
        if (factura.fechaAnulacion && typeof factura.fechaAnulacion === 'string') {
          factura.fechaAnulacion = new Date(factura.fechaAnulacion);
        }

        // Rastrear sociedades (ID receptores)
        if (factura.idReceptor) {
          sociedadesSet.add(factura.idReceptor);
        }

        // Insertar o actualizar factura
        const resultado = await SatFactura.updateOne(
          { numeroAutorizacion: factura.numeroAutorizacion },
          { $set: factura },
          { upsert: true }
        );

        if (resultado.upsertedCount > 0) {
          insertadas++;
        } else if (resultado.modifiedCount > 0) {
          actualizadas++;
        }

      } catch (error) {
        console.error(`❌ Error procesando factura:`, error.message);
        errores++;
      }
    }

    // Guardar registro del archivo procesado
    const sociedades = Array.from(sociedadesSet);
    await ArchivoSatProcesado.updateOne(
      { nombreArchivo },
      {
        $set: {
          hash,
          fechaProcesamiento: new Date(),
          cantidadFacturas: facturas.length,
          insertadas,
          actualizadas,
          errores,
          sociedades,
          procesadoPor: 'API',
          usuarioEmail: req.user.email
        }
      },
      { upsert: true }
    );

    console.log(`✅ Procesamiento completado: ${nombreArchivo}`);
    console.log(`   📊 Insertadas: ${insertadas}, Actualizadas: ${actualizadas}, Errores: ${errores}`);

    res.status(200).json({
      mensaje: 'Archivo procesado exitosamente',
      nombreArchivo,
      estadisticas: {
        total: facturas.length,
        insertadas,
        actualizadas,
        errores,
        sociedades
      }
    });

  } catch (error) {
    console.error('❌ Error en importación SAT:', error);
    res.status(500).json({ 
      error: 'Error procesando archivo', 
      detalle: error.message 
    });
  }
});

/**
 * GET /api/sat/archivos
 * Lista todos los archivos procesados
 */
router.get('/archivos', authenticateToken, async (req, res) => {
  try {
    const archivos = await ArchivoSatProcesado.find()
      .sort({ fechaProcesamiento: -1 })
      .select('-__v');

    res.json({
      total: archivos.length,
      archivos
    });
  } catch (error) {
    console.error('❌ Error listando archivos:', error);
    res.status(500).json({ error: 'Error obteniendo archivos' });
  }
});

/**
 * GET /api/sat/facturas
 * Lista facturas con filtros opcionales
 * 
 * Query params:
 * - codigoSociedad: Filtrar por código de sociedad (4 dígitos)
 * - idReceptor: Filtrar por ID receptor
 * - nitEmisor: Filtrar por NIT emisor
 * - fechaDesde: Fecha inicio (YYYY-MM-DD)
 * - fechaHasta: Fecha fin (YYYY-MM-DD)
 * - limit: Límite de resultados (default: 100)
 * - skip: Paginación
 */
router.get('/facturas', authenticateToken, async (req, res) => {
  try {
    const { codigoSociedad, idReceptor, nitEmisor, fechaDesde, fechaHasta, limit = 100, skip = 0 } = req.query;

    const filtros = {};

    if (codigoSociedad) filtros.codigoSociedad = codigoSociedad;
    if (idReceptor) filtros.idReceptor = idReceptor;
    if (nitEmisor) filtros.nitEmisor = nitEmisor;
    
    if (fechaDesde || fechaHasta) {
      filtros.fechaEmision = {};
      if (fechaDesde) filtros.fechaEmision.$gte = new Date(fechaDesde);
      if (fechaHasta) filtros.fechaEmision.$lte = new Date(fechaHasta);
    }

    const facturas = await SatFactura.find(filtros)
      .sort({ fechaEmision: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .select('-__v');

    const total = await SatFactura.countDocuments(filtros);

    res.json({
      total,
      facturas: facturas.length,
      datos: facturas
    });
  } catch (error) {
    console.error('❌ Error listando facturas:', error);
    res.status(500).json({ error: 'Error obteniendo facturas' });
  }
});

/**
 * GET /api/sat/stats
 * Estadísticas generales de facturas importadas
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const totalFacturas = await SatFactura.countDocuments();
    const totalArchivos = await ArchivoSatProcesado.countDocuments();
    
    // Obtener sociedades únicas (códigos de 4 dígitos)
    const codigosSociedad = await SatFactura.distinct('codigoSociedad');
    
    // Obtener IDs receptores únicos
    const idsReceptor = await SatFactura.distinct('idReceptor');
    
    // Obtener rango de fechas
    const rangoFechas = await SatFactura.aggregate([
      {
        $group: {
          _id: null,
          fechaMin: { $min: '$fechaEmision' },
          fechaMax: { $max: '$fechaEmision' },
          totalMonto: { $sum: '$granTotal' }
        }
      }
    ]);

    res.json({
      totalFacturas,
      totalArchivos,
      codigosSociedad: codigosSociedad.filter(c => c !== null && c !== undefined),
      idsReceptor: idsReceptor.length,
      rangoFechas: rangoFechas[0] || null
    });
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

/**
 * POST /api/sat/buscar-factura
 * Busca una factura en la base de datos SAT por NIT emisor y Número del DTE
 * Se usa como verificador interno para autocompletar datos de gastos
 * 
 * Body esperado:
 * {
 *   nitEmisor: "12345678",
 *   numeroDTE: "123456"
 * }
 */
router.post('/buscar-factura', authenticateToken, async (req, res) => {
  try {
    res.set('Deprecation', 'true');
    res.set('Sunset', 'Thu, 31 Dec 2026 23:59:59 GMT');
    res.set('Link', '</api/sat/validar-interno>; rel="successor-version"');
    const { nitEmisor, numeroDTE } = req.body;

    if (!nitEmisor || !numeroDTE) {
      return res.status(400).json({ 
        error: 'Se requiere nitEmisor y numeroDTE' 
      });
    }

    console.log(`🔍 Buscando factura SAT: NIT=${nitEmisor}, DTE=${numeroDTE}`);

    // Buscar factura en la base de datos
    const factura = await SatFactura.findOne({ 
      nitEmisor: nitEmisor,
      numeroDTE: numeroDTE.toString()
    }).select('-__v -createdAt -updatedAt');

    if (factura) {
      console.log(`✅ Factura encontrada en SAT: ${factura.numeroAutorizacion}`);
      return res.json({
        encontrada: true,
        factura: factura
      });
    } else {
      console.log(`⚠️  Factura no encontrada en SAT`);
      return res.json({
        encontrada: false,
        mensaje: 'Factura no encontrada en el verificador SAT'
      });
    }

  } catch (error) {
    console.error('❌ Error buscando factura SAT:', error);
    res.status(500).json({ 
      error: 'Error buscando factura', 
      detalle: error.message 
    });
  }
});

/**
 * POST /api/sat/buscar-por-numero
 * Busca una factura en la base de datos SAT por Serie y Número del DTE
 * Automáticamente filtra por el NIT de la empresa del usuario autenticado
 * 
 * Body esperado:
 * {
 *   serie: "A",
 *   numeroDTE: "123456",
 *   nitReceptor: "12345678" // Opcional - si no se envía, usa el NIT de la empresa del usuario
 * }
 */
router.post('/buscar-por-numero', authenticateToken, async (req, res) => {
  try {
    res.set('Deprecation', 'true');
    res.set('Sunset', 'Thu, 31 Dec 2026 23:59:59 GMT');
    res.set('Link', '</api/sat/validar-interno>; rel="successor-version"');
    const { serie, numeroDTE, nitReceptor } = req.body;

    if (!serie || !numeroDTE) {
      return res.status(400).json({ 
        error: 'Se requiere serie y numeroDTE' 
      });
    }
    
    console.log(`🔍 Buscando factura SAT por número: Serie=${serie}, DTE=${numeroDTE}`);
    console.log(`   Usuario autenticado: ${req.user.email}`);

    // Construir criterio de búsqueda
    const criterio = { 
      serie: serie.toString().trim(),
      numeroDTE: numeroDTE.toString().trim()
    };
    
    // Determinar el NIT del receptor (empresa)
    // El perfil del usuario no define la sociedad ni el NIT fiscal; solo se filtra por un NIT enviado explícitamente.
    let nitFiltro = null;
    
    if (nitReceptor) {
      // Si se proporciona NIT del receptor en el request, usarlo
      nitFiltro = nitReceptor.toString().replace(/[-\s]/g, '').trim();
      console.log(`   Usando NIT del request: ${nitFiltro}`);
    }
    
    // Agregar filtro de NIT si está disponible
    if (nitFiltro) {
      criterio.idReceptor = nitFiltro;
    }

    // Buscar factura
    let factura = await SatFactura.findOne(criterio)
      .select('-__v -createdAt -updatedAt')
      .sort({ fechaEmision: -1 }); // Si hay múltiples, tomar la más reciente

    if (factura) {
      console.log(`✅ Factura encontrada en SAT: ${factura.numeroAutorizacion}`);
      console.log(`   Proveedor: ${factura.nombreEmisor} (NIT: ${factura.nitEmisor})`);
      console.log(`   Receptor: ${factura.nombreReceptor} (ID: ${factura.idReceptor})`);
      console.log(`   Total: ${factura.moneda} ${factura.granTotal}`);
      return res.json({
        encontrada: true,
        factura: factura
      });
    } else {
      console.log(`⚠️  Factura no encontrada en SAT`);
      if (nitFiltro) {
        console.log(`   Búsqueda limitada a facturas con idReceptor=${nitFiltro}`);
      }
      return res.json({
        encontrada: false,
        mensaje: nitFiltro 
          ? 'Factura no encontrada para tu empresa en el verificador SAT'
          : 'Factura no encontrada en el verificador SAT'
      });
    }

  } catch (error) {
    console.error('❌ Error buscando factura SAT por número:', error);
    res.status(500).json({ 
      error: 'Error buscando factura', 
      detalle: error.message 
    });
  }
});

router.post('/validar-interno', authenticateToken, async (req, res) => {
  try {
    const duplicate = await ExpenseDuplicateService.findActiveDuplicate({
      serie: req.body?.serie,
      noinvoice: req.body?.noinvoice,
      excludeId: req.body?.excludeExpenseId
    });
    if (duplicate) {
      return res.status(409).json({
        code: 'EXPENSE_DUPLICATE',
        error: 'Ya existe un gasto activo en el sistema con la misma serie y número. Debe anularse antes de registrar nuevamente la factura.'
      });
    }
    return res.json(await SATInternalValidationService.validate(req.body));
  } catch (error) {
    console.error('❌ Error validando factura SAT interna:', error);
    return res.status(error.status || 503).json({
      code: error.code || 'SAT_INTERNAL_SERVICE_ERROR',
      error: error.status ? error.message : 'No fue posible consultar la réplica SAT interna.',
      detalle: error.message
    });
  }
});

/**
 * DELETE /api/sat/reset
 * Limpia todas las facturas y archivos procesados
 * Requiere ser manager
 */
router.delete('/reset', authenticateToken, requireManager, async (req, res) => {
  try {
    console.log(`🗑️  Limpiando datos SAT por ${req.user.email}`);
    
    const facturasBorradas = await SatFactura.deleteMany({});
    const archivosBorrados = await ArchivoSatProcesado.deleteMany({});

    console.log(`✅ Limpieza completada: ${facturasBorradas.deletedCount} facturas, ${archivosBorrados.deletedCount} archivos`);

    res.json({
      mensaje: 'Datos SAT limpiados exitosamente',
      facturasBorradas: facturasBorradas.deletedCount,
      archivosBorrados: archivosBorrados.deletedCount
    });
  } catch (error) {
    console.error('❌ Error limpiando datos SAT:', error);
    res.status(500).json({ error: 'Error limpiando datos' });
  }
});

module.exports = router;
