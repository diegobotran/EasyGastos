/**
 * Rutas API para Sociedades
 * 
 * Endpoints:
 * - GET /api/sociedades - Obtener todas las sociedades activas
 * - GET /api/sociedades/:codigo - Obtener sociedad por código
 * - GET /api/sociedades/nit/:nit - Obtener sociedad por NIT
 */

const express = require('express');
const router = express.Router();
const Sociedad = require('../models/Sociedad');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

/**
 * GET /api/sociedades
 * Obtener todas las sociedades activas
 * 
 * Query params:
 * - activa: filtrar por estado (true/false)
 * - pais: filtrar por país (GT, SV, HN, etc.)
 * 
 * Respuesta:
 * [
 *   { codigo: '1000', nit: '336963', nombre: 'Sociedad 1000', activa: true, pais: 'GT' },
 *   ...
 * ]
 */
router.get('/', async (req, res) => {
  try {
    const { activa, pais } = req.query;
    
    const filtro = {};
    if (activa !== undefined) {
      filtro.activa = activa === 'true';
    }
    if (pais) {
      filtro.pais = pais.toUpperCase();
    }

    const sociedades = await Sociedad.find(filtro).sort({ codigo: 1 });
    
    res.json({
      success: true,
      count: sociedades.length,
      data: sociedades
    });
  } catch (error) {
    console.error('Error obteniendo sociedades:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener sociedades',
      message: error.message
    });
  }
});

/**
 * GET /api/sociedades/:codigo
 * Obtener una sociedad por código
 * 
 * Params:
 * - codigo: código de la sociedad (ej: '1000', 'LOMAS', etc.)
 * 
 * Respuesta:
 * { codigo: '1000', nit: '336963', nombre: 'Sociedad 1000', activa: true, pais: 'GT' }
 */
router.get('/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    
    const sociedad = await Sociedad.findByCodigo(codigo);
    
    if (!sociedad) {
      return res.status(404).json({
        success: false,
        error: 'Sociedad no encontrada',
        codigo
      });
    }

    res.json({
      success: true,
      data: sociedad
    });
  } catch (error) {
    console.error(`Error obteniendo sociedad ${req.params.codigo}:`, error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener sociedad',
      message: error.message
    });
  }
});

/**
 * GET /api/sociedades/nit/:nit
 * Obtener una sociedad por NIT
 * 
 * Params:
 * - nit: NIT de la sociedad (ej: '336963', '820781K', etc.)
 * 
 * Respuesta:
 * { codigo: '1000', nit: '336963', nombre: 'Sociedad 1000', activa: true, pais: 'GT' }
 */
router.get('/nit/:nit', async (req, res) => {
  try {
    const { nit } = req.params;
    
    const sociedad = await Sociedad.findOne({ 
      nit: nit.toUpperCase(),
      activa: true 
    });
    
    if (!sociedad) {
      return res.status(404).json({
        success: false,
        error: 'Sociedad no encontrada',
        nit
      });
    }

    res.json({
      success: true,
      data: sociedad
    });
  } catch (error) {
    console.error(`Error obteniendo sociedad por NIT ${req.params.nit}:`, error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener sociedad',
      message: error.message
    });
  }
});

/**
 * POST /api/sociedades/sync
 * Sincronizar/actualizar sociedades masivamente
 * 
 * Body:
 * {
 *   sociedades: [
 *     { codigo: '1000', nit: '336963', nombre: 'Sociedad 1000' },
 *     ...
 *   ]
 * }
 * 
 * Respuesta:
 * {
 *   success: true,
 *   insertadas: 10,
 *   actualizadas: 15,
 *   errores: 0
 * }
 */
router.post('/sync', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { sociedades } = req.body;

    if (!Array.isArray(sociedades) || sociedades.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un array de sociedades'
      });
    }

    console.log(`📊 Sincronizando ${sociedades.length} sociedades...`);

    let insertadas = 0;
    let actualizadas = 0;
    let errores = 0;
    const detalles = [];

    for (const data of sociedades) {
      try {
        if (!data.codigo || !data.nit) {
          errores++;
          detalles.push({ 
            codigo: data.codigo || 'N/A', 
            error: 'Código y NIT son requeridos' 
          });
          continue;
        }

        // Usar upsert para insertar o actualizar
        const result = await Sociedad.updateOne(
          { codigo: data.codigo.toUpperCase() },
          { 
            $set: {
              codigo: data.codigo.toUpperCase(),
              nit: data.nit.toUpperCase(),
              nombre: data.nombre || `Sociedad ${data.codigo}`,
              activa: data.activa !== undefined ? data.activa : true,
              pais: data.pais ? data.pais.toUpperCase() : 'GT'
            }
          },
          { upsert: true }
        );

        if (result.upsertedCount > 0) {
          insertadas++;
          detalles.push({ codigo: data.codigo, accion: 'insertada' });
        } else if (result.modifiedCount > 0) {
          actualizadas++;
          detalles.push({ codigo: data.codigo, accion: 'actualizada' });
        } else {
          detalles.push({ codigo: data.codigo, accion: 'sin cambios' });
        }
      } catch (error) {
        console.error(`Error con sociedad ${data.codigo}:`, error.message);
        errores++;
        detalles.push({ codigo: data.codigo, error: error.message });
      }
    }

    console.log(`✅ Sincronización completa:`);
    console.log(`   Insertadas: ${insertadas}`);
    console.log(`   Actualizadas: ${actualizadas}`);
    console.log(`   Errores: ${errores}`);

    res.json({
      success: true,
      insertadas,
      actualizadas,
      errores,
      total: sociedades.length,
      detalles
    });
  } catch (error) {
    console.error('Error sincronizando sociedades:', error);
    res.status(500).json({
      success: false,
      error: 'Error sincronizando sociedades',
      message: error.message
    });
  }
});

module.exports = router;
