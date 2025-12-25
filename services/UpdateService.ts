import * as FileSystem from 'expo-file-system';
import { Platform, Linking, Alert } from 'react-native';
import { getAPI_BASE_URL } from '../config/backend';

/**
 * Servicio para gestionar actualizaciones automáticas de la APK
 * 
 * IMPORTANTE: Este servicio solo funciona en Android. En iOS, las actualizaciones
 * deben hacerse a través de la App Store por políticas de Apple.
 */

export interface AppVersion {
  version: string;          // Versión del APK (ej: "1.0.0")
  buildNumber: number;      // Build number (ej: 1)
  releaseDate: string;      // Fecha de lanzamiento
  releaseNotes?: string;    // Notas de la versión
  downloadUrl: string;      // URL para descargar el APK
  minVersion?: string;      // Versión mínima requerida
  forceUpdate?: boolean;    // Si es obligatorio actualizar
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: AppVersion;
  forceUpdate?: boolean;
}

/**
 * Obtiene la versión actual de la app
 */
export const getCurrentVersion = (): string => {
  // En producción, esto debería venir de app.json o Constants.expoConfig
  return '1.0.1';
};

export const getCurrentBuildNumber = (): number => {
  // En producción, esto debería venir de app.json o Constants.expoConfig
  return 2;
};

/**
 * Verifica si hay una nueva versión disponible en el servidor
 */
export const checkForUpdates = async (): Promise<UpdateCheckResult> => {
  try {
    if (Platform.OS !== 'android') {
      console.log('⚠️ Actualizaciones automáticas solo disponibles en Android');
      return {
        updateAvailable: false,
        currentVersion: getCurrentVersion(),
      };
    }

    const baseUrl = await getAPI_BASE_URL();
    const response = await fetch(`${baseUrl}/api/app/version`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Error verificando versión: ${response.status}`);
    }

    const latestVersion: AppVersion = await response.json();
    const currentBuild = getCurrentBuildNumber();
    const updateAvailable = latestVersion.buildNumber > currentBuild;

    console.log(`📱 Versión actual: ${getCurrentVersion()} (build ${currentBuild})`);
    console.log(`🆕 Última versión: ${latestVersion.version} (build ${latestVersion.buildNumber})`);
    console.log(`${updateAvailable ? '✅ Actualización disponible' : '✓ Estás actualizado'}`);

    return {
      updateAvailable,
      currentVersion: getCurrentVersion(),
      latestVersion: updateAvailable ? latestVersion : undefined,
      forceUpdate: latestVersion.forceUpdate || false,
    };
  } catch (error) {
    console.error('❌ Error verificando actualizaciones:', error);
    throw error;
  }
};

/**
 * Descarga el APK más reciente del servidor
 */
export const downloadUpdate = async (
  downloadUrl: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  try {
    if (Platform.OS !== 'android') {
      throw new Error('Descarga de APK solo disponible en Android');
    }

    console.log('📥 Descargando actualización...');
    
    const fileUri = `${FileSystem.documentDirectory}EasyGastos_update.apk`;

    // Eliminar APK anterior si existe
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(fileUri);
      console.log('🗑️ APK anterior eliminado');
    }

    // Descargar nuevo APK con progreso
    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      fileUri,
      {},
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        onProgress?.(progress * 100);
      }
    );

    const result = await downloadResumable.downloadAsync();
    
    if (!result || !result.uri) {
      throw new Error('Error descargando actualización');
    }

    console.log('✅ Actualización descargada:', result.uri);
    return result.uri;
  } catch (error) {
    console.error('❌ Error descargando actualización:', error);
    throw error;
  }
};

/**
 * Instala el APK descargado
 * 
 * NOTA: En Android 8+ (API 26+), el usuario debe confirmar manualmente la instalación
 * por razones de seguridad. La app solo puede iniciar el intent de instalación.
 */
export const installUpdate = async (apkUri: string): Promise<void> => {
  try {
    if (Platform.OS !== 'android') {
      throw new Error('Instalación de APK solo disponible en Android');
    }

    console.log('🔧 Iniciando instalación:', apkUri);

    // Convertir file:// URI a content:// URI
    const contentUri = apkUri.replace('file://', 'content://');
    
    // Abrir el intent de instalación
    const supported = await Linking.canOpenURL(contentUri);
    
    if (supported) {
      await Linking.openURL(contentUri);
      console.log('✅ Intent de instalación iniciado');
    } else {
      throw new Error('No se puede abrir el instalador de APK');
    }
  } catch (error) {
    console.error('❌ Error instalando actualización:', error);
    throw error;
  }
};

/**
 * Función principal que maneja todo el flujo de actualización
 */
export const checkAndUpdate = async (
  onProgress?: (progress: number, status: string) => void
): Promise<boolean> => {
  try {
    if (Platform.OS !== 'android') {
      Alert.alert(
        'No disponible',
        'Las actualizaciones automáticas solo están disponibles en Android.',
        [{ text: 'Entendido' }]
      );
      return false;
    }

    // 1. Verificar si hay actualización
    onProgress?.(10, 'Verificando versión...');
    const updateCheck = await checkForUpdates();

    if (!updateCheck.updateAvailable) {
      Alert.alert(
        '✓ Actualizado',
        `Ya tienes la última versión (${updateCheck.currentVersion})`,
        [{ text: 'OK' }]
      );
      return false;
    }

    // 2. Confirmar con el usuario
    return new Promise((resolve) => {
      const version = updateCheck.latestVersion!;
      const message = version.releaseNotes 
        ? `Versión ${version.version}\n\n${version.releaseNotes}`
        : `Nueva versión ${version.version} disponible`;

      Alert.alert(
        updateCheck.forceUpdate ? '⚠️ Actualización requerida' : '🆕 Actualización disponible',
        message,
        [
          ...(updateCheck.forceUpdate ? [] : [{
            text: 'Más tarde',
            style: 'cancel' as const,
            onPress: () => resolve(false),
          }]),
          {
            text: 'Actualizar',
            onPress: async () => {
              try {
                // 3. Descargar APK
                onProgress?.(20, 'Descargando actualización...');
                const apkUri = await downloadUpdate(
                  version.downloadUrl,
                  (progress) => {
                    onProgress?.(20 + (progress * 0.7), 'Descargando...'); // 20-90%
                  }
                );

                // 4. Instalar APK
                onProgress?.(95, 'Preparando instalación...');
                await installUpdate(apkUri);
                
                onProgress?.(100, 'Instalación iniciada');
                resolve(true);
              } catch (error) {
                Alert.alert(
                  'Error',
                  `No se pudo actualizar: ${error}`,
                  [{ text: 'OK' }]
                );
                resolve(false);
              }
            },
          },
        ]
      );
    });
  } catch (error) {
    console.error('❌ Error en proceso de actualización:', error);
    Alert.alert(
      'Error',
      `No se pudo verificar actualizaciones: ${error}`,
      [{ text: 'OK' }]
    );
    return false;
  }
};

/**
 * Verifica automáticamente si hay actualizaciones al iniciar la app
 * (sin interferir con el uso normal)
 */
export const checkForUpdatesOnStartup = async (): Promise<void> => {
  try {
    if (Platform.OS !== 'android') {
      return;
    }

    const updateCheck = await checkForUpdates();

    if (updateCheck.updateAvailable && updateCheck.forceUpdate) {
      // Solo mostrar si es actualización obligatoria
      await checkAndUpdate();
    } else if (updateCheck.updateAvailable) {
      // Mostrar notificación discreta si hay actualización opcional
      console.log('💡 Hay una actualización disponible. Ve a Ajustes para instalarla.');
    }
  } catch (error) {
    console.error('⚠️ Error verificando actualizaciones al inicio:', error);
    // No mostrar error al usuario, es un proceso en segundo plano
  }
};

export default {
  getCurrentVersion,
  getCurrentBuildNumber,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  checkAndUpdate,
  checkForUpdatesOnStartup,
};
