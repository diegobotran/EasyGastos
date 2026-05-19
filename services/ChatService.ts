/**
 * Servicio de Chat con IA para consultas sobre gastos
 * Utiliza el endpoint /chat-stateless/ del servidor de IA (Python)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// Configuración del servidor de chat (mismo servidor que Google Vision OCR)
let CHAT_API_URL = "http://54.159.178.170:8000/chat-stateless/"; // Valor por defecto
let CHAT_API_KEY =
  "3f2496417c08334054d866280406bfa341667d7913373d6921c8689e8e8cfcc5";
// Valor por defecto (mismo que OCR)

/**
 * Carga la configuración del servidor de chat desde AsyncStorage
 */
const loadChatConfig = async () => {
  try {
    console.log("🔧 ChatService: Cargando configuración...");
    const savedUrl = await AsyncStorage.getItem("google_ocr_server_url");
    const savedKey = await AsyncStorage.getItem("google_ocr_api_key");

    console.log("🔍 ChatService: URL guardada:", savedUrl || "Ninguna (usando default)");

    if (savedUrl) {
      // Construir URL del chat desde la URL base del servidor
      const baseUrl = savedUrl.replace(/\/extract\/?$/i, "");
      CHAT_API_URL = `${baseUrl}/chat-stateless/`;
      console.log("✅ URL del servidor de chat construida:", CHAT_API_URL);
    } else {
      console.log("ℹ️ ChatService: Usando URL por defecto:", CHAT_API_URL);
    }

    if (savedKey) {
      CHAT_API_KEY = savedKey;
      console.log("✅ API Key del servidor de chat cargada (longitud:", savedKey.length, ")");
    } else {
      console.log("ℹ️ ChatService: Usando API Key por defecto");
    }
  } catch (error) {
    console.error("❌ Error cargando configuración del chat:", error);
    console.log("⚠️ ChatService: Usando configuración por defecto");
  }
};

export interface ChatRequest {
  question: string;
  context_data: any; // JSON con los datos de gastos del usuario
}

export interface ChatResponse {
  response?: string;
  error?: string;
}

/**
 * Envía una pregunta al asistente de IA con el contexto de gastos del usuario
 * @param question - Pregunta del usuario
 * @param contextData - Datos de gastos (JSON) para proporcionar contexto
 * @returns Respuesta del asistente o error
 */
export const askChatAssistant = async (
  question: string,
  contextData: any,
): Promise<ChatResponse> => {
  try {
    // Cargar configuración antes de hacer la petición
    await loadChatConfig();

    console.log("💬 Chat: Enviando pregunta...");
    console.log("❓ Pregunta:", question);
    console.log("📊 Contexto: datos de", contextData?.length || 0, "gastos");
    console.log("🔗 URL del servidor:", CHAT_API_URL);
    console.log("🔑 API Key (primeros 10 chars):", CHAT_API_KEY.substring(0, 10) + "...");

    const requestBody: ChatRequest = {
      question: question.trim(),
      context_data: contextData,
    };

    // Timeout de 60 segundos para la petición
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": CHAT_API_KEY,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log("📡 Respuesta del servidor:", response.status, response.statusText);

      if (response.status === 403) {
        console.error("❌ Chat: API Key inválida (403 Forbidden)");
        return {
          error:
            "API Key inválida. Verifica la configuración del servidor OCR en Ajustes.",
        };
      }

      if (response.status === 404) {
        console.error("❌ Chat: Endpoint no encontrado (404)");
        return {
          error:
            "Servicio de chat no disponible. Verifica que el servidor de IA esté corriendo correctamente.",
        };
      }

      if (!response.ok) {
        console.error("❌ Chat: Error en servidor:", response.status);
        const errorText = await response.text();
        console.error("❌ Detalles del error:", errorText);
        return {
          error: `Error del servidor (${response.status}): ${errorText.substring(0, 100)}`,
        };
      }

      const jsonResponse: ChatResponse = await response.json();
      console.log("✅ Chat: Respuesta recibida exitosamente");

      if (jsonResponse.error) {
        console.error("❌ Chat: Error en respuesta:", jsonResponse.error);
        return jsonResponse;
      }

      return jsonResponse;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        console.error("❌ Chat: Timeout - la petición tardó más de 60 segundos");
        return {
          error: "El servidor tardó demasiado en responder. Intenta nuevamente.",
        };
      }

      // Error de red
      console.error("❌ Error de red en fetch:", fetchError.message);
      return {
        error:
          `No se pudo conectar con el servidor de IA (${CHAT_API_URL}). Verifica tu conexión a internet y que el servidor esté activo.`,
      };
    }
  } catch (error: any) {
    console.error("❌ Error en askChatAssistant:", error);
    return {
      error: `Error inesperado: ${error.message || "Error desconocido"}`,
    };
  }
};

/**
 * Prepara los datos de gastos para enviar al chat
 * Selecciona solo los campos relevantes para optimizar el consumo de tokens
 * IMPORTANTE: NO incluye URLs de imágenes ni datos binarios
 */
export const prepareExpensesContext = (expenses: any[]) => {
  return expenses.map((expense) => ({
    // Información básica del gasto
    descripcion: expense.description || expense.descripcion,
    monto: expense.amount || expense.monto,
    fecha: expense.date || expense.fecha,
    categoria: expense.category || expense.categoria,
    proveedor: expense.supplier || expense.proveedor,
    
    // Estados del gasto
    estado: expense.status || expense.estado,
    estado_liquidacion: expense.expenseStatus,
    
    // Información de factura (sin UUID largo)
    numero_factura: expense.noinvoice || expense.numero_factura,
    serie: expense.serie,
    nit: expense.vat_number || expense.nit,
    
    // Información contable
    departamento: expense.department || expense.departamento,
    centro: expense.centro,
    cuenta: expense.cuenta,
    
    // IVA y moneda
    iva: expense.totiva,
    moneda: expense.currency || "GTQ",
    
    // Notas y observaciones (si existen)
    notas: expense.notes || "",
    
    // ID de liquidación (si está asociado)
    en_liquidacion: expense.liquidationId ? "Sí" : "No",
    
    // NOTA: NO incluimos imageuri, imageUrl, photo, ni attachments
    // para evitar consumir tokens innecesariamente
  }));
};
