/**
 * Servicio para sincronizar conversaciones de chat con el backend
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ChatConversation } from "../models/ChatHistory";
import { ChatHistoryService } from "./ChatHistoryService";

const BACKEND_IP_KEY = "@backend_ip_address";
const BACKEND_PORT_KEY = "@backend_port";

/**
 * Obtiene la configuración del backend
 */
async function getBackendConfig(): Promise<{ url: string }> {
  try {
    const ip = (await AsyncStorage.getItem(BACKEND_IP_KEY)) || "23.20.116.61";
    const port = (await AsyncStorage.getItem(BACKEND_PORT_KEY)) || "3000";
    return {
      url: `http://${ip}:${port}`,
    };
  } catch (error) {
    console.error("Error obteniendo config del backend:", error);
    return { url: "http://23.20.116.61:3000" };
  }
}

/**
 * Sincroniza conversaciones locales con el backend
 */
export async function syncChatHistory(
  userId: string,
  authToken: string,
): Promise<{ success: boolean; synced: number; errors: string[] }> {
  try {
    console.log("🔄 Iniciando sincronización de historial de chat...");

    // Obtener conversaciones que necesitan sincronización
    const unsyncedConversations =
      await ChatHistoryService.getUnsyncedConversations(userId);

    if (unsyncedConversations.length === 0) {
      console.log("✅ No hay conversaciones para sincronizar");
      return { success: true, synced: 0, errors: [] };
    }

    console.log(
      `📤 Sincronizando ${unsyncedConversations.length} conversaciones...`,
    );

    const { url: backendUrl } = await getBackendConfig();

    // Enviar conversaciones al backend en batch
    const response = await fetch(`${backendUrl}/api/chat-history/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ conversations: unsyncedConversations }),
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();
    const { created, updated, failed, errors } = data;

    // Marcar conversaciones exitosas como sincronizadas
    const successfulIds = unsyncedConversations
      .filter((c) => !errors?.some((e: any) => e.id === c.id))
      .map((c) => c.id);

    for (const id of successfulIds) {
      await ChatHistoryService.markAsSynced(id);
    }

    console.log(
      `✅ Sincronización completada: ${created} creadas, ${updated} actualizadas`,
    );

    if (failed > 0) {
      console.warn(`⚠️ ${failed} conversaciones fallaron`);
    }

    return {
      success: failed === 0,
      synced: created + updated,
      errors: errors?.map((e: any) => e.error) || [],
    };
  } catch (error: any) {
    console.error("❌ Error sincronizando historial de chat:", error);
    return {
      success: false,
      synced: 0,
      errors: [error.message || "Error desconocido"],
    };
  }
}

/**
 * Descarga conversaciones del backend al dispositivo
 */
export async function downloadChatHistory(
  userId: string,
  authToken: string,
): Promise<{ success: boolean; downloaded: number; error?: string }> {
  try {
    console.log("📥 Descargando historial de chat desde el servidor...");

    const { url: backendUrl } = await getBackendConfig();

    const response = await fetch(
      `${backendUrl}/api/chat-history/user/${userId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const serverConversations: ChatConversation[] = await response.json();

    if (serverConversations.length === 0) {
      console.log("✅ No hay conversaciones en el servidor");
      return { success: true, downloaded: 0 };
    }

    console.log(
      `📥 Descargando ${serverConversations.length} conversaciones...`,
    );

    let downloadedCount = 0;

    for (const serverConv of serverConversations) {
      try {
        // Verificar si ya existe localmente
        const localConv = await ChatHistoryService.getConversationById(
          serverConv.id,
        );

        if (localConv) {
          // Si existe, actualizar solo si el servidor es más reciente
          const serverDate = new Date(serverConv.updatedAt);
          const localDate = new Date(localConv.updatedAt);

          if (serverDate > localDate) {
            await ChatHistoryService.updateConversation(serverConv);
            downloadedCount++;
            console.log(`✅ Conversación actualizada: ${serverConv.id}`);
          }
        } else {
          // Si no existe, crear nueva
          await ChatHistoryService.createConversation({
            userId: serverConv.userId,
            title: serverConv.title,
            messages: serverConv.messages,
          });
          await ChatHistoryService.markAsSynced(serverConv.id);
          downloadedCount++;
          console.log(`✅ Conversación descargada: ${serverConv.id}`);
        }
      } catch (error) {
        console.error(
          `❌ Error procesando conversación ${serverConv.id}:`,
          error,
        );
      }
    }

    console.log(`✅ Descarga completada: ${downloadedCount} conversaciones`);
    return { success: true, downloaded: downloadedCount };
  } catch (error: any) {
    console.error("❌ Error descargando historial de chat:", error);
    return {
      success: false,
      downloaded: 0,
      error: error.message || "Error desconocido",
    };
  }
}

/**
 * Elimina conversaciones antiguas tanto localmente como en el backend
 */
export async function cleanupOldConversations(
  userId: string,
  authToken: string,
): Promise<{ success: boolean; deletedLocal: number; deletedServer: number }> {
  try {
    console.log("🧹 Limpiando conversaciones antiguas...");

    // Limpiar localmente
    const deletedLocal =
      await ChatHistoryService.deleteOldConversations(userId);

    // Limpiar en el servidor
    const { url: backendUrl } = await getBackendConfig();

    const response = await fetch(
      `${backendUrl}/api/chat-history/cleanup/${userId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();
    const deletedServer = data.deletedCount || 0;

    console.log(
      `✅ Limpieza completada: ${deletedLocal} local, ${deletedServer} servidor`,
    );

    return {
      success: true,
      deletedLocal,
      deletedServer,
    };
  } catch (error: any) {
    console.error("❌ Error limpiando conversaciones antiguas:", error);
    return {
      success: false,
      deletedLocal: 0,
      deletedServer: 0,
    };
  }
}

/**
 * Sincronización completa: descarga y luego sube
 */
export async function fullChatHistorySync(
  userId: string,
  authToken: string,
): Promise<{ success: boolean; message: string }> {
  try {
    console.log("🔄 Sincronización completa de historial de chat...");

    // 1. Descargar conversaciones del servidor
    const downloadResult = await downloadChatHistory(userId, authToken);

    if (!downloadResult.success) {
      return {
        success: false,
        message: `Error descargando: ${downloadResult.error}`,
      };
    }

    // 2. Subir conversaciones locales
    const uploadResult = await syncChatHistory(userId, authToken);

    if (!uploadResult.success) {
      return {
        success: false,
        message: `Descargados ${downloadResult.downloaded}, pero error subiendo`,
      };
    }

    console.log("✅ Sincronización completa exitosa");
    return {
      success: true,
      message: `${downloadResult.downloaded} descargadas, ${uploadResult.synced} sincronizadas`,
    };
  } catch (error: any) {
    console.error("❌ Error en sincronización completa:", error);
    return {
      success: false,
      message: error.message || "Error desconocido",
    };
  }
}
