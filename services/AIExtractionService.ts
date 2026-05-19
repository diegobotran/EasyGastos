/**
 * Servicio de Extracción con IA usando servidor LLM y Google Vision API
 * Maneja la comunicación con servidores de IA para extraer datos de facturas
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ========== CONFIGURACIÓN DE SERVICIOS OCR ==========
// Servidor LLM (Ollama) - Método anterior
const API_URL = "http://54.164.76.228:3000/api/extract-invoice";
const MY_TOKEN = "mi_token_super_seguro_2025_app_facturas";

// Servidor Google Vision OCR - Configuración desde AsyncStorage
// NOTA: Estos valores se configuran desde la pantalla backend-config
let GOOGLE_OCR_URL = "http://54.164.76.228:8000/extract/"; // Valor por defecto
let GOOGLE_OCR_API_KEY =
  "3f2496417c08334054d866280406bfa341667d7913373d6921c8689e8e8cfcc5";
// Valor por defecto

/**
 * Carga la configuración del servidor OCR desde AsyncStorage
 */
const loadOCRConfig = async () => {
  try {
    const savedUrl = await AsyncStorage.getItem("google_ocr_server_url");
    const savedKey = await AsyncStorage.getItem("google_ocr_api_key");

    if (savedUrl) {
      GOOGLE_OCR_URL = savedUrl;
      console.log("✅ URL del servidor OCR cargada:", GOOGLE_OCR_URL);
    }

    if (savedKey) {
      GOOGLE_OCR_API_KEY = savedKey;
      console.log("✅ API Key del servidor OCR cargada");
    }
  } catch (error) {
    console.error("❌ Error cargando configuración OCR:", error);
  }
};
// ==================================================

export interface AIExtractedData {
  nit?: string; // Para compatibilidad con código anterior
  nit_emisor?: string; // NIT del proveedor (quien emite la factura)
  nit_receptor?: string; // NIT del cliente (quien recibe la factura)
  total?: number;
  amount?: number;
  monto?: number;
  supplier?: string;
  proveedor?: string;
  fecha?: string;
  date?: string;
  serie?: string;
  numero_factura?: string;
  invoiceNumber?: string;
  establecimiento?: string;
  descripcion?: string;
  uuid?: string; // UUID de factura FEL para validación SAT
  currency?: string; // Moneda detectada: GTQ, USD, EUR, etc.
  moneda?: string; // Alias para compatibilidad
}

/**
 * Extrae datos usando Google Vision API OCR (NUEVO - Servicio en la nube)
 * Envía la imagen directamente al servidor OCR que usa Google Vision
 * @param imageUri - URI de la imagen a procesar
 * @returns Datos extraídos o null si falla
 */
export const extractWithGoogleVisionOCR = async (
  imageUri: string,
): Promise<AIExtractedData | null> => {
  try {
    // Cargar configuración antes de hacer la petición
    await loadOCRConfig();

    console.log("🌐 Google Vision OCR: Iniciando extracción...");
    console.log("📸 Enviando imagen:", imageUri);
    console.log("🔗 URL del servidor:", GOOGLE_OCR_URL);

    // Preparar FormData para enviar la imagen
    const formData = new FormData();

    // Crear objeto file desde la URI
    const filename = imageUri.split("/").pop() || "invoice.jpg";
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : "image/jpeg";

    formData.append("file", {
      uri: imageUri,
      name: filename,
      type: type,
    } as any);

    // Realizar petición al servidor Google Vision
    const response = await fetch(GOOGLE_OCR_URL, {
      method: "POST",
      headers: {
        "x-api-key": GOOGLE_OCR_API_KEY,
        // No incluir Content-Type, FormData lo maneja automáticamente
      },
      body: formData,
    });

    console.log("📡 Respuesta del servidor:", response.status);

    if (response.status === 403) {
      console.error("❌ Google Vision OCR: API Key inválida");
      return null;
    }

    if (!response.ok) {
      console.error(
        "❌ Google Vision OCR: Error en servidor:",
        response.status,
      );
      return null;
    }

    const jsonResponse = await response.json();
    console.log(
      "📦 Respuesta JSON:",
      JSON.stringify(jsonResponse).substring(0, 200),
    );

    if (jsonResponse.status === "success" && jsonResponse.data) {
      const { inferred } = jsonResponse.data;

      // Mapear los datos al formato esperado por la app
      const extractedData: AIExtractedData = {
        nit: inferred?.nit_emisor || inferred?.nit || undefined, // NIT del proveedor
        nit_emisor: inferred?.nit_emisor || undefined,
        nit_receptor: inferred?.nit_receptor || undefined,
        total: inferred?.total
          ? parseFloat(inferred.total.replace(/,/g, ""))
          : undefined,
        fecha: inferred?.fecha || undefined,
        // Campos adicionales extraídos por el servidor mejorado
        supplier: inferred?.proveedor || undefined,
        serie: inferred?.serie || undefined,
        numero_factura: inferred?.numero_factura || undefined,
        uuid: inferred?.uuid || undefined,
        currency: inferred?.currency || inferred?.moneda || undefined, // Moneda detectada
      };

      console.log("✅ Google Vision OCR: Datos extraídos:", extractedData);
      return extractedData;
    } else if (jsonResponse.error) {
      console.error(
        "❌ Google Vision OCR: Error del servidor:",
        jsonResponse.error,
      );
      return null;
    } else {
      console.error("❌ Google Vision OCR: Respuesta sin datos válidos");
      return null;
    }
  } catch (error) {
    console.error("❌ Google Vision OCR: Error de conexión:", error);
    return null;
  }
};

/**
 * Extrae datos de factura usando IA (servidor LLM - Método anterior)
 * @param ocrText - Texto extraído por OCR
 * @returns Datos extraídos o null si falla
 */
export const extractWithAI = async (
  ocrText: string,
): Promise<AIExtractedData | null> => {
  try {
    console.log("🤖 AIService: Iniciando extracción con IA...");

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MY_TOKEN}`,
      },
      body: JSON.stringify({ ocrText: ocrText }),
    });

    if (response.status === 401) {
      console.error("❌ AIService: Error de autenticación");
      return null;
    }

    if (!response.ok) {
      console.error("❌ AIService: Error en servidor:", response.status);
      return null;
    }

    const jsonResponse = await response.json();

    if (jsonResponse.success && jsonResponse.data) {
      console.log("✅ AIService: Datos extraídos:", jsonResponse.data);
      return jsonResponse.data;
    } else {
      console.error("❌ AIService: Respuesta sin datos válidos");
      return null;
    }
  } catch (error) {
    console.error("❌ AIService: Error de conexión:", error);
    return null;
  }
};

/**
 * Limpia y valida un monto extraído
 * @param amount - Monto en cualquier formato
 * @returns Monto limpio como string o null
 */
export const cleanAmount = (amount: any): string | null => {
  if (!amount) return null;

  // Convertir a string y limpiar formato
  const cleanValue = String(amount)
    .replace(/[Q$,\s]/g, "")
    .replace(/[^\d.]/g, "")
    .trim();

  const parsed = parseFloat(cleanValue);

  if (isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return cleanValue;
};

/**
 * Parsea una fecha en formato DD/MM/YYYY
 * @param dateStr - Fecha como string
 * @returns Date object o null
 */
export const parseInvoiceDate = (dateStr: string): Date | null => {
  if (!dateStr || typeof dateStr !== "string") return null;

  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1; // Los meses en JS son 0-11
  const year = parseInt(parts[2]);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  return new Date(year, month, day);
};
