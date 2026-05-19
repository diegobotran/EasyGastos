import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BackendSyncService } from "../services/BackendSyncService";

/**
 * Pantalla de configuración del Backend
 * Permite cambiar la URL del servidor sin recompilar la app
 */
const BackendConfigScreen = () => {
  const router = useRouter();
  const [backendUrl, setBackendUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [currentUrl, setCurrentUrl] = useState("");

  // Estados para configuración del servidor OCR
  const [ocrServerUrl, setOcrServerUrl] = useState("");
  const [ocrApiKey, setOcrApiKey] = useState("");
  const [currentOcrUrl, setCurrentOcrUrl] = useState("");
  const [currentOcrKey, setCurrentOcrKey] = useState("");
  const [ocrTestResult, setOcrTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isTestingOcr, setIsTestingOcr] = useState(false);

  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const loadCurrentConfig = async () => {
    try {
      setIsLoading(true);

      // Cargar configuración del Backend principal
      const savedUrl = await AsyncStorage.getItem("backend_custom_url");
      if (savedUrl) {
        // Verificar si es una URL vieja y limpiarla
        const oldUrls = ["200.6.231.237:7300", "200.6.231.237"];
        if (oldUrls.some((oldUrl) => savedUrl.includes(oldUrl))) {
          console.log("🔧 backend-config: URL vieja detectada, limpiando...");
          await AsyncStorage.removeItem("backend_custom_url");
          const defaultUrl = "http://23.20.116.61:3000";
          setBackendUrl(defaultUrl);
          setCurrentUrl(defaultUrl);
        } else {
          setBackendUrl(savedUrl);
          setCurrentUrl(savedUrl);
        }
      } else {
        // Cargar URL por defecto desde configuración
        const defaultUrl = "http://23.20.116.61:3000";
        setBackendUrl(defaultUrl);
        setCurrentUrl(defaultUrl);
      }

      // Cargar configuración del servidor OCR (Google Vision)
      const savedOcrUrl = await AsyncStorage.getItem("google_ocr_server_url");
      const savedOcrKey = await AsyncStorage.getItem("google_ocr_api_key");

      if (savedOcrUrl) {
        setOcrServerUrl(savedOcrUrl);
        setCurrentOcrUrl(savedOcrUrl);
      }

      if (savedOcrKey) {
        setOcrApiKey(savedOcrKey);
        setCurrentOcrKey(savedOcrKey);
      }
    } catch (error) {
      console.error("Error cargando configuración:", error);
      Alert.alert("Error", "No se pudo cargar la configuración actual");
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async () => {
    if (!backendUrl.trim()) {
      Alert.alert("Error", "Por favor ingresa una URL válida");
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      console.log("🔍 Probando conexión con:", backendUrl);

      // Guardar temporalmente la URL para que checkConnection la use
      await AsyncStorage.setItem("backend_custom_url", backendUrl.trim());

      // Probar la conexión
      const isConnected = await BackendSyncService.checkConnection();

      if (isConnected) {
        setTestResult({
          success: true,
          message: "✅ Conexión exitosa con el servidor",
        });
      } else {
        setTestResult({
          success: false,
          message:
            "❌ No se pudo conectar al servidor. Verifica la URL y que el servidor esté activo.",
        });
        // Restaurar URL anterior si la prueba falla
        if (currentUrl) {
          await AsyncStorage.setItem("backend_custom_url", currentUrl);
        }
      }
    } catch (error) {
      console.error("Error probando conexión:", error);
      setTestResult({
        success: false,
        message: `❌ Error: ${error instanceof Error ? error.message : "Error desconocido"}`,
      });
      // Restaurar URL anterior si hay error
      if (currentUrl) {
        await AsyncStorage.setItem("backend_custom_url", currentUrl);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const saveConfiguration = async () => {
    if (!backendUrl.trim()) {
      Alert.alert("Error", "Por favor ingresa una URL válida");
      return;
    }

    // Validar formato básico de URL
    if (
      !backendUrl.startsWith("http://") &&
      !backendUrl.startsWith("https://")
    ) {
      Alert.alert("Error", "La URL debe comenzar con http:// o https://");
      return;
    }

    Alert.alert(
      "Confirmar cambios",
      "¿Deseas guardar esta configuración? La app usará esta URL para todas las sincronizaciones.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Guardar",
          onPress: async () => {
            try {
              setIsLoading(true);

              // Guardar la URL personalizada
              await AsyncStorage.setItem(
                "backend_custom_url",
                backendUrl.trim(),
              );

              // Limpiar el caché de URL para forzar recarga
              await AsyncStorage.removeItem("backend_url_cache");

              setCurrentUrl(backendUrl.trim());

              Alert.alert(
                "Éxito",
                "Configuración guardada correctamente. La app ahora usará la nueva URL del servidor.",
                [
                  {
                    text: "OK",
                    onPress: () => router.back(),
                  },
                ],
              );
            } catch (error) {
              console.error("Error guardando configuración:", error);
              Alert.alert("Error", "No se pudo guardar la configuración");
            } finally {
              setIsLoading(false);
            }
          },
        },
      ],
    );
  };

  const saveOCRConfiguration = async () => {
    if (!ocrServerUrl.trim()) {
      Alert.alert("Error", "Por favor ingresa la URL del servidor OCR");
      return;
    }

    if (!ocrApiKey.trim()) {
      Alert.alert("Error", "Por favor ingresa el API Key del servidor OCR");
      return;
    }

    // Validar formato básico de URL
    if (
      !ocrServerUrl.startsWith("http://") &&
      !ocrServerUrl.startsWith("https://")
    ) {
      Alert.alert("Error", "La URL debe comenzar con http:// o https://");
      return;
    }

    Alert.alert(
      "Confirmar configuración OCR",
      "¿Deseas guardar la configuración del servidor Google Vision OCR?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Guardar",
          onPress: async () => {
            try {
              setIsLoading(true);

              // Guardar configuración del OCR
              await AsyncStorage.setItem(
                "google_ocr_server_url",
                ocrServerUrl.trim(),
              );
              await AsyncStorage.setItem(
                "google_ocr_api_key",
                ocrApiKey.trim(),
              );

              setCurrentOcrUrl(ocrServerUrl.trim());
              setCurrentOcrKey(ocrApiKey.trim());

              Alert.alert(
                "Éxito",
                "Configuración del servidor OCR guardada correctamente. La app ahora usará Google Vision API para extracción de datos.",
              );
            } catch (error) {
              console.error("Error guardando configuración OCR:", error);
              Alert.alert(
                "Error",
                "No se pudo guardar la configuración del OCR",
              );
            } finally {
              setIsLoading(false);
            }
          },
        },
      ],
    );
  };

  const testOCRConnection = async () => {
    if (!ocrServerUrl.trim() || !ocrApiKey.trim()) {
      Alert.alert(
        "Error",
        "Por favor completa la URL y el API Key del servidor OCR",
      );
      return;
    }

    setIsTestingOcr(true);
    setOcrTestResult(null);

    try {
      console.log("🔍 Probando conexión OCR con:", ocrServerUrl);

      // Intentar hacer un ping básico al servidor
      const testUrl = ocrServerUrl.endsWith("/")
        ? ocrServerUrl.slice(0, -1)
        : ocrServerUrl;

      const response = await fetch(testUrl.replace("/extract/", "/"), {
        method: "GET",
        headers: {
          "x-api-key": ocrApiKey.trim(),
        },
      });

      // FastAPI responde con 404 en GET a raíz, pero si responde, el servidor está activo
      if (
        response.status === 404 ||
        response.status === 200 ||
        response.status === 405
      ) {
        setOcrTestResult({
          success: true,
          message:
            "✅ Servidor OCR activo. API Key será validada al procesar una factura.",
        });
      } else if (response.status === 403) {
        setOcrTestResult({
          success: false,
          message: "❌ API Key inválida. Verifica tu clave de acceso.",
        });
      } else {
        setOcrTestResult({
          success: false,
          message: `⚠️ Servidor respondió con código ${response.status}. Verifica la configuración.`,
        });
      }
    } catch (error) {
      console.error("Error probando conexión OCR:", error);
      setOcrTestResult({
        success: false,
        message: `❌ No se pudo conectar al servidor OCR. Verifica la URL y que el servidor esté activo.`,
      });
    } finally {
      setIsTestingOcr(false);
    }
  };

  const resetToDefault = async () => {
    Alert.alert(
      "Restaurar configuración",
      "¿Deseas restaurar la configuración por defecto del servidor?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Restaurar",
          onPress: async () => {
            try {
              setIsLoading(true);

              // Eliminar configuración personalizada
              await AsyncStorage.removeItem("backend_custom_url");
              await AsyncStorage.removeItem("backend_url_cache");

              // Cargar URL por defecto
              const defaultUrl = "http://23.20.116.61:3000";
              setBackendUrl(defaultUrl);
              setCurrentUrl(defaultUrl);
              setTestResult(null);

              Alert.alert(
                "Éxito",
                "Configuración restaurada a valores por defecto",
              );
            } catch (error) {
              console.error("Error restaurando configuración:", error);
              Alert.alert("Error", "No se pudo restaurar la configuración");
            } finally {
              setIsLoading(false);
            }
          },
        },
      ],
    );
  };

  const loadPreset = (presetName: string) => {
    const presets: { [key: string]: string } = {
      local: "http://localhost:3000",
      "local-android": "http://10.0.2.2:3000",
      "local-ios": "http://localhost:3000",
      production: "http://23.20.116.61:3000",
    };

    const url = presets[presetName];
    if (url) {
      setBackendUrl(url);
      setTestResult(null);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Cargando configuración...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#2563eb" />
            </TouchableOpacity>
            <View style={styles.headerContent}>
              <Ionicons name="server-outline" size={60} color="#2563eb" />
              <Text style={styles.title}>Configuración del Servidor</Text>
              <Text style={styles.subtitle}>
                Configura la URL del backend para sincronización
              </Text>
            </View>
          </View>

          {/* URL Actual */}
          {currentUrl && (
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color="#3b82f6" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>URL actual:</Text>
                <Text style={styles.infoValue}>{currentUrl}</Text>
              </View>
            </View>
          )}

          {/* Input URL */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>URL del Servidor</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="globe-outline"
                size={20}
                color="#64748b"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="http://192.168.1.100:3000"
                placeholderTextColor="#94a3b8"
                value={backendUrl}
                onChangeText={(text) => {
                  setBackendUrl(text);
                  setTestResult(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!isLoading && !isTesting}
              />
            </View>
            <Text style={styles.helperText}>
              Formato: http://IP:PUERTO o https://dominio.com
            </Text>
          </View>

          {/* Presets */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Configuraciones Rápidas</Text>
            <View style={styles.presetGrid}>
              <TouchableOpacity
                style={styles.presetButton}
                onPress={() => loadPreset("production")}
                disabled={isTesting}
              >
                <Ionicons name="cloud" size={24} color="#2563eb" />
                <Text style={styles.presetText}>Producción</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetButton}
                onPress={() => loadPreset("local")}
                disabled={isTesting}
              >
                <Ionicons name="laptop" size={24} color="#2563eb" />
                <Text style={styles.presetText}>Local</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetButton}
                onPress={() => loadPreset("local-android")}
                disabled={isTesting}
              >
                <Ionicons name="phone-portrait" size={24} color="#2563eb" />
                <Text style={styles.presetText}>Android Emu</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Test Result */}
          {testResult && (
            <View
              style={[
                styles.resultBox,
                testResult.success ? styles.resultSuccess : styles.resultError,
              ]}
            >
              <Text style={styles.resultText}>{testResult.message}</Text>
            </View>
          )}

          {/* Botones de acción */}
          <View style={styles.actionSection}>
            <TouchableOpacity
              style={[styles.actionButton, styles.testButton]}
              onPress={testConnection}
              disabled={isTesting || isLoading}
            >
              {isTesting ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color="white"
                />
              )}
              <Text style={styles.actionButtonText}>
                {isTesting ? "Probando..." : "Probar Conexión"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.saveButton,
                (!testResult?.success || isTesting) && styles.disabledButton,
              ]}
              onPress={saveConfiguration}
              disabled={!testResult?.success || isTesting || isLoading}
            >
              <Ionicons name="save-outline" size={20} color="white" />
              <Text style={styles.actionButtonText}>Guardar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.resetButton]}
              onPress={resetToDefault}
              disabled={isTesting || isLoading}
            >
              <Ionicons name="refresh-outline" size={20} color="white" />
              <Text style={styles.actionButtonText}>Restaurar</Text>
            </TouchableOpacity>
          </View>

          {/* Información adicional */}
          <View style={styles.infoSection}>
            <Text style={styles.infoSectionTitle}>ℹ️ Información</Text>
            <Text style={styles.infoText}>
              • Asegúrate de que el servidor esté en ejecución{"\n"}• El puerto
              por defecto es 7300{"\n"}• Usa 10.0.2.2 para emulador Android
              (apunta a localhost){"\n"}• Usa localhost para emulador iOS{"\n"}•
              Para dispositivo físico, usa la IP de tu red local{"\n"}• Prueba
              la conexión antes de guardar
            </Text>
          </View>

          {/* ==================== SECCIÓN GOOGLE VISION OCR ==================== */}
          <View style={styles.divider} />

          <View style={styles.ocrSection}>
            <View style={styles.ocrHeader}>
              <Ionicons name="camera-outline" size={40} color="#10b981" />
              <Text style={styles.ocrTitle}>Servidor Google Vision OCR</Text>
              <Text style={styles.ocrSubtitle}>
                Configura el servidor de extracción de facturas con IA
              </Text>
            </View>

            {/* URL Actual OCR */}
            {currentOcrUrl && (
              <View style={[styles.infoBox, styles.ocrInfoBox]}>
                <Ionicons name="cloud-done" size={20} color="#10b981" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>
                    Servidor OCR configurado:
                  </Text>
                  <Text style={[styles.infoValue, { fontSize: 12 }]}>
                    {currentOcrUrl}
                  </Text>
                </View>
              </View>
            )}

            {/* Input URL OCR */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>URL del Servidor OCR</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="cloud-outline"
                  size={20}
                  color="#64748b"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="http://IP_SERVIDOR:8000/extract/"
                  placeholderTextColor="#94a3b8"
                  value={ocrServerUrl}
                  onChangeText={(text) => {
                    setOcrServerUrl(text);
                    setOcrTestResult(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  editable={!isLoading && !isTestingOcr}
                />
              </View>
              <Text style={styles.helperText}>
                Ejemplo: http://54.159.178.170:8000/extract/
              </Text>
            </View>

            {/* Input API Key */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>API Key</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="key-outline"
                  size={20}
                  color="#64748b"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="tu-api-key-segura"
                  placeholderTextColor="#94a3b8"
                  value={ocrApiKey}
                  onChangeText={(text) => {
                    setOcrApiKey(text);
                    setOcrTestResult(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={false}
                  editable={!isLoading && !isTestingOcr}
                />
              </View>
              <Text style={styles.helperText}>
                Clave de acceso configurada en el servidor Python
              </Text>
            </View>

            {/* Test Result OCR */}
            {ocrTestResult && (
              <View
                style={[
                  styles.resultBox,
                  ocrTestResult.success
                    ? styles.resultSuccess
                    : styles.resultError,
                ]}
              >
                <Text style={styles.resultText}>{ocrTestResult.message}</Text>
              </View>
            )}

            {/* Botones de acción OCR */}
            <View style={styles.actionSection}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.testButton,
                  { backgroundColor: "#10b981" },
                ]}
                onPress={testOCRConnection}
                disabled={isTestingOcr || isLoading}
              >
                {isTestingOcr ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="pulse-outline" size={20} color="white" />
                )}
                <Text style={styles.actionButtonText}>
                  {isTestingOcr ? "Probando OCR..." : "Probar OCR"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: "#059669" },
                  isTestingOcr && styles.disabledButton,
                ]}
                onPress={saveOCRConfiguration}
                disabled={isTestingOcr || isLoading}
              >
                <Ionicons name="save-outline" size={20} color="white" />
                <Text style={styles.actionButtonText}>Guardar OCR</Text>
              </TouchableOpacity>
            </View>

            {/* Información OCR */}
            <View style={[styles.infoSection, { borderColor: "#a7f3d0" }]}>
              <Text style={styles.infoSectionTitle}>
                🤖 Sobre Google Vision OCR
              </Text>
              <Text style={styles.infoText}>
                • Servicio en la nube con Google Cloud Vision API{"\n"}• Extrae
                Total, NIT y Fecha de facturas automáticamente{"\n"}• Mayor
                precisión que el OCR local{"\n"}• Activa "Usar IA" al escanear
                facturas para usarlo{"\n"}• El servidor debe estar ejecutándose
                con main.py
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#64748b",
  },
  header: {
    padding: 20,
    paddingBottom: 30,
  },
  backButton: {
    marginBottom: 20,
  },
  headerContent: {
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1e293b",
    marginTop: 16,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: "#3b82f6",
    fontWeight: "600",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: "#1e40af",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#1e293b",
    paddingVertical: 12,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  helperText: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 8,
    marginLeft: 4,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  presetButton: {
    flex: 1,
    minWidth: "30%",
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  presetText: {
    fontSize: 12,
    color: "#2563eb",
    fontWeight: "600",
    marginTop: 8,
  },
  resultBox: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  resultSuccess: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
  },
  resultError: {
    backgroundColor: "#fef2f2",
    borderColor: "#fca5a5",
  },
  resultText: {
    fontSize: 14,
    textAlign: "center",
  },
  actionSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  testButton: {
    backgroundColor: "#3b82f6",
  },
  saveButton: {
    backgroundColor: "#10b981",
  },
  resetButton: {
    backgroundColor: "#64748b",
  },
  disabledButton: {
    backgroundColor: "#cbd5e1",
    opacity: 0.6,
  },
  actionButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  infoSection: {
    marginHorizontal: 20,
    backgroundColor: "#fafafa",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  infoSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 20,
    marginVertical: 30,
  },
  ocrSection: {
    paddingBottom: 20,
  },
  ocrHeader: {
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  ocrTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#10b981",
    marginTop: 12,
    textAlign: "center",
  },
  ocrSubtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 8,
    textAlign: "center",
  },
  ocrInfoBox: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
  },
});

export default BackendConfigScreen;
