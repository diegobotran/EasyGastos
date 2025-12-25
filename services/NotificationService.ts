import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Servicio de Notificaciones Locales
 * Maneja notificaciones push locales para alertar al manager de liquidaciones pendientes
 * 
 * Características:
 * - Notificaciones locales (no requiere servidor)
 * - Funciona 100% offline
 * - Personalizable por usuario
 * - Control de frecuencia para evitar spam
 */

const LAST_NOTIFICATION_KEY = '@LastNotificationTime';
const NOTIFICATION_SETTINGS_KEY = '@NotificationSettings';
const MIN_NOTIFICATION_INTERVAL = 30 * 60 * 1000; // 30 minutos entre notificaciones

interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  vibrate: boolean;
  badge: boolean;
}

// Configurar el comportamiento por defecto de las notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Inicializa el servicio de notificaciones y solicita permisos
 */
export const initializeNotifications = async (): Promise<boolean> => {
  try {
    console.log('🔔 NotificationService: Inicializando servicio de notificaciones...');

    // En web, las notificaciones no están soportadas completamente
    if (Platform.OS === 'web') {
      console.log('⚠️ NotificationService: Web no soporta notificaciones push locales');
      return false;
    }

    // Solicitar permisos
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('⚠️ NotificationService: Permisos de notificación denegados');
      return false;
    }

    console.log('✅ NotificationService: Permisos de notificación concedidos');

    // Configurar canal de notificación para Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('liquidations', {
        name: 'Liquidaciones Pendientes',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3b82f6',
        sound: 'default',
        enableVibrate: true,
      });
      console.log('✅ NotificationService: Canal de Android configurado');
    }

    return true;
  } catch (error) {
    console.error('❌ NotificationService: Error inicializando notificaciones:', error);
    return false;
  }
};

/**
 * Obtiene la configuración de notificaciones del usuario
 */
export const getNotificationSettings = async (): Promise<NotificationSettings> => {
  try {
    const settingsStr = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (settingsStr) {
      return JSON.parse(settingsStr);
    }
  } catch (error) {
    console.error('Error obteniendo configuración de notificaciones:', error);
  }

  // Configuración por defecto
  return {
    enabled: true,
    sound: true,
    vibrate: true,
    badge: true,
  };
};

/**
 * Guarda la configuración de notificaciones del usuario
 */
export const saveNotificationSettings = async (settings: NotificationSettings): Promise<void> => {
  try {
    await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
    console.log('✅ Configuración de notificaciones guardada');
  } catch (error) {
    console.error('Error guardando configuración de notificaciones:', error);
  }
};

/**
 * Verifica si se puede enviar una notificación (control de frecuencia)
 */
const canSendNotification = async (): Promise<boolean> => {
  try {
    const lastNotificationStr = await AsyncStorage.getItem(LAST_NOTIFICATION_KEY);
    if (!lastNotificationStr) return true;

    const lastNotificationTime = parseInt(lastNotificationStr, 10);
    const now = Date.now();
    const timeSinceLastNotification = now - lastNotificationTime;

    if (timeSinceLastNotification < MIN_NOTIFICATION_INTERVAL) {
      console.log(`⏱️ NotificationService: Muy pronto para otra notificación (${Math.round(timeSinceLastNotification / 60000)} min)`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error verificando frecuencia de notificaciones:', error);
    return true;
  }
};

/**
 * Actualiza el timestamp de la última notificación enviada
 */
const updateLastNotificationTime = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(LAST_NOTIFICATION_KEY, Date.now().toString());
  } catch (error) {
    console.error('Error actualizando timestamp de notificación:', error);
  }
};

/**
 * Envía una notificación local al manager sobre liquidaciones pendientes
 */
export const sendLiquidationPendingNotification = async (count: number): Promise<void> => {
  try {
    console.log(`🔔 NotificationService: Intentando enviar notificación (${count} liquidaciones)`);

    // Verificar configuración del usuario
    const settings = await getNotificationSettings();
    if (!settings.enabled) {
      console.log('⚠️ NotificationService: Notificaciones desactivadas por el usuario');
      return;
    }

    // Verificar si se puede enviar (control de frecuencia)
    if (!(await canSendNotification())) {
      return;
    }

    // En web no enviamos notificaciones
    if (Platform.OS === 'web') {
      return;
    }

    // Preparar el contenido de la notificación
    const title = '🔔 Liquidaciones Pendientes';
    const body = count === 1
      ? 'Tienes 1 liquidación esperando tu aprobación'
      : `Tienes ${count} liquidaciones esperando tu aprobación`;

    // Programar notificación inmediata
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: settings.sound ? 'default' : undefined,
        vibrate: settings.vibrate ? [0, 250, 250, 250] : undefined,
        badge: settings.badge ? count : undefined,
        data: { 
          type: 'liquidation_pending',
          count,
          screen: 'manager-approval'
        },
        categoryIdentifier: 'liquidations',
      },
      trigger: null, // null = enviar inmediatamente
    });

    // Actualizar badge del app icon
    if (settings.badge) {
      await Notifications.setBadgeCountAsync(count);
    }

    // Actualizar timestamp
    await updateLastNotificationTime();

    console.log(`✅ NotificationService: Notificación enviada exitosamente (${count} liquidaciones)`);
  } catch (error) {
    console.error('❌ NotificationService: Error enviando notificación:', error);
  }
};

/**
 * Cancela todas las notificaciones pendientes
 */
export const cancelAllNotifications = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.setBadgeCountAsync(0);
    console.log('✅ NotificationService: Notificaciones canceladas');
  } catch (error) {
    console.error('Error cancelando notificaciones:', error);
  }
};

/**
 * Limpia el badge cuando el usuario ve las liquidaciones
 */
export const clearBadge = async (): Promise<void> => {
  try {
    await Notifications.setBadgeCountAsync(0);
    console.log('✅ NotificationService: Badge limpiado');
  } catch (error) {
    console.error('Error limpiando badge:', error);
  }
};

/**
 * Notifica al usuario cuando su liquidación es aprobada
 */
export const notifyLiquidationApproved = async (
  liquidationId: string,
  totalAmount: number,
  approverName?: string
): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      return;
    }

    const settings = await getNotificationSettings();
    if (!settings.enabled) {
      console.log('⚠️ NotificationService: Notificaciones deshabilitadas');
      return;
    }

    const approverText = approverName ? ` por ${approverName}` : '';
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '✅ Liquidación Aprobada',
        body: `Su liquidación de Q${totalAmount.toFixed(2)} fue aprobada${approverText}. Ya puede generar el CSV.`,
        data: { 
          type: 'liquidation_approved',
          liquidationId,
          totalAmount 
        },
        sound: settings.sound,
        badge: settings.badge ? 1 : undefined,
        vibrate: settings.vibrate ? [0, 250, 250, 250] : undefined,
      },
      trigger: null, // Inmediata
    });

    console.log(`✅ NotificationService: Notificación de aprobación enviada para liquidación ${liquidationId}`);
  } catch (error) {
    console.error('Error enviando notificación de aprobación:', error);
  }
};

/**
 * Notifica al usuario cuando su liquidación es rechazada
 */
export const notifyLiquidationRejected = async (
  liquidationId: string,
  totalAmount: number,
  reason?: string
): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      return;
    }

    const settings = await getNotificationSettings();
    if (!settings.enabled) {
      console.log('⚠️ NotificationService: Notificaciones deshabilitadas');
      return;
    }

    const reasonText = reason ? `: ${reason}` : '';
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '❌ Liquidación Rechazada',
        body: `Su liquidación de Q${totalAmount.toFixed(2)} fue rechazada${reasonText}. Puede editarla y volver a enviarla.`,
        data: { 
          type: 'liquidation_rejected',
          liquidationId,
          totalAmount,
          reason 
        },
        sound: settings.sound,
        badge: settings.badge ? 1 : undefined,
        vibrate: settings.vibrate ? [0, 250, 250, 250] : undefined,
      },
      trigger: null, // Inmediata
    });

    console.log(`✅ NotificationService: Notificación de rechazo enviada para liquidación ${liquidationId}`);
  } catch (error) {
    console.error('Error enviando notificación de rechazo:', error);
  }
};

/**
 * Configura listener para cuando el usuario toca una notificación
 */
export const setupNotificationListener = (onNotificationTap: (data: any) => void) => {
  const subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
    console.log('📱 NotificationService: Usuario tocó la notificación');
    const data = response.notification.request.content.data;
    onNotificationTap(data);
  });

  return () => subscription.remove();
};
