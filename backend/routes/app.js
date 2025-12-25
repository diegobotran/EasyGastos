/**
 * Rutas para gestionar actualizaciones de la aplicación móvil
 * 
 * Endpoints:
 * - GET /api/app/version - Obtiene la versión más reciente disponible
 * - GET /api/app/download - Descarga el APK más reciente
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

// Configuración de versión actual
// NOTA: Actualizar estos valores cada vez que se suba una nueva versión
const CURRENT_APP_VERSION = {
  version: '1.0.0',
  buildNumber: 1,
  releaseDate: new Date().toISOString(),
  releaseNotes: 'Versión inicial de EasyGastos Mobile',
  downloadUrl: '/api/app/download', // URL relativa para descargar
  minVersion: '1.0.0',
  forceUpdate: false,
};

// Directorio donde se guardan los APKs
const APK_DIRECTORY = path.join(__dirname, '../apks');

/**
 * GET /api/app/version
 * Verifica si hay una nueva versión disponible
 */
router.get('/version', async (req, res) => {
  try {
    console.log('📱 Verificando versión de la app...');
    
    // Construir URL completa de descarga
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const versionInfo = {
      ...CURRENT_APP_VERSION,
      downloadUrl: `${baseUrl}${CURRENT_APP_VERSION.downloadUrl}`,
    };
    
    console.log(`✅ Versión actual: ${versionInfo.version} (build ${versionInfo.buildNumber})`);
    res.json(versionInfo);
  } catch (error) {
    console.error('❌ Error obteniendo información de versión:', error);
    res.status(500).json({ 
      error: 'Error obteniendo información de versión',
      details: error.message 
    });
  }
});

/**
 * GET /api/app/download
 * Descarga el APK más reciente
 */
router.get('/download', async (req, res) => {
  try {
    console.log('📥 Solicitud de descarga de APK...');
    
    // Buscar el APK más reciente en el directorio
    const files = await fs.readdir(APK_DIRECTORY);
    const apkFiles = files.filter(file => file.endsWith('.apk'));
    
    if (apkFiles.length === 0) {
      console.error('❌ No hay APKs disponibles en el servidor');
      return res.status(404).json({ 
        error: 'No hay actualizaciones disponibles',
        message: 'No se encontró ningún archivo APK en el servidor' 
      });
    }
    
    // Obtener el APK más reciente (por fecha de modificación)
    let latestApk = null;
    let latestTime = 0;
    
    for (const apk of apkFiles) {
      const filePath = path.join(APK_DIRECTORY, apk);
      const stats = await fs.stat(filePath);
      if (stats.mtimeMs > latestTime) {
        latestTime = stats.mtimeMs;
        latestApk = apk;
      }
    }
    
    const apkPath = path.join(APK_DIRECTORY, latestApk);
    
    // Verificar que el archivo existe
    const exists = await fs.access(apkPath).then(() => true).catch(() => false);
    if (!exists) {
      console.error('❌ APK no encontrado:', apkPath);
      return res.status(404).json({ 
        error: 'APK no encontrado',
        path: apkPath 
      });
    }
    
    console.log(`✅ Enviando APK: ${latestApk}`);
    
    // Configurar headers para descarga
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${latestApk}"`);
    
    // Enviar archivo
    res.sendFile(apkPath, (err) => {
      if (err) {
        console.error('❌ Error enviando APK:', err);
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Error enviando archivo',
            details: err.message 
          });
        }
      } else {
        console.log(`✅ APK enviado exitosamente: ${latestApk}`);
      }
    });
  } catch (error) {
    console.error('❌ Error en descarga de APK:', error);
    res.status(500).json({ 
      error: 'Error descargando APK',
      details: error.message 
    });
  }
});

/**
 * POST /api/app/version
 * Actualiza la información de versión (solo para administradores)
 * 
 * Body:
 * {
 *   "version": "1.0.1",
 *   "buildNumber": 2,
 *   "releaseNotes": "Correcciones de bugs",
 *   "forceUpdate": false
 * }
 */
router.post('/version', async (req, res) => {
  try {
    const { version, buildNumber, releaseNotes, forceUpdate } = req.body;
    
    if (!version || !buildNumber) {
      return res.status(400).json({ 
        error: 'Datos incompletos',
        required: ['version', 'buildNumber']
      });
    }
    
    // Actualizar configuración en memoria
    CURRENT_APP_VERSION.version = version;
    CURRENT_APP_VERSION.buildNumber = buildNumber;
    CURRENT_APP_VERSION.releaseDate = new Date().toISOString();
    CURRENT_APP_VERSION.releaseNotes = releaseNotes || CURRENT_APP_VERSION.releaseNotes;
    CURRENT_APP_VERSION.forceUpdate = forceUpdate || false;
    
    console.log(`✅ Versión actualizada: ${version} (build ${buildNumber})`);
    
    res.json({
      success: true,
      message: 'Versión actualizada exitosamente',
      version: CURRENT_APP_VERSION,
    });
  } catch (error) {
    console.error('❌ Error actualizando versión:', error);
    res.status(500).json({ 
      error: 'Error actualizando versión',
      details: error.message 
    });
  }
});

module.exports = router;
