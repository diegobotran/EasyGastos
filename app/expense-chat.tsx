/**
 * Pantalla de Chat con IA sobre Gastos
 * Permite hacer consultas sobre los gastos del usuario
 * Con historial persistente de conversaciones (últimos 7 días)
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { getExpenses } from "../services/ExpenseService";
import {
  askChatAssistant,
  prepareExpensesContext,
} from "../services/ChatService";
import { ChatHistoryService } from "../services/ChatHistoryService";
import { ChatConversation } from "../models/ChatHistory";

interface Message {
  id: string;
  type: "user" | "assistant";
  text: string;
  timestamp: Date;
}

export default function ExpenseChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expensesContext, setExpensesContext] = useState<any[]>([]);
  const [currentConversation, setCurrentConversation] = useState<ChatConversation | null>(null);
  const [expensesLoaded, setExpensesLoaded] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Cargar gastos solo UNA VEZ al montar el componente
  useEffect(() => {
    if (!expensesLoaded && user?.email) {
      loadUserExpenses();
    }
  }, [user?.email]);

  // Cargar conversación cuando la pantalla está en foco
  useFocusEffect(
    React.useCallback(() => {
      if (user?.email) {
        loadOrCreateConversation();
      }
    }, [user?.email, params.conversationId])
  );

  const loadOrCreateConversation = async () => {
    if (!user?.email) return;

    try {
      // Inicializar servicio de historial solo una vez
      await ChatHistoryService.initialize().catch(err => {
        console.log('ℹ️ ChatHistoryService ya inicializado o error menor:', err.message);
      });

      // Si se pasó un ID de conversación, cargarla
      if (params.conversationId && typeof params.conversationId === 'string') {
        console.log('📖 Cargando conversación existente:', params.conversationId);
        const conversation = await ChatHistoryService.getConversationById(params.conversationId);
        if (conversation) {
          setCurrentConversation(conversation);
          // Convertir mensajes de la conversación a Messages
          const loadedMessages = conversation.messages.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          }));
          setMessages(loadedMessages);
          console.log(`✅ Conversación cargada: ${conversation.id} con ${loadedMessages.length} mensajes`);
          return;
        } else {
          console.log('⚠️ Conversación no encontrada:', params.conversationId);
        }
      }

      // Si no hay conversationId en params, buscar la conversación más reciente (últimos 7 días)
      if (!params.conversationId) {
        console.log('🔍 Buscando conversación reciente (últimos 7 días)...');
        const recentConversation = await ChatHistoryService.getRecentConversation(user.email);
        
        if (recentConversation) {
          // Existe una conversación reciente, continuar con ella
          console.log(`✅ Conversación reciente encontrada: ${recentConversation.id}`);
          setCurrentConversation(recentConversation);
          const loadedMessages = recentConversation.messages.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          }));
          setMessages(loadedMessages);
          console.log(`✅ Continuando conversación con ${loadedMessages.length} mensajes`);
          return;
        }
      }

      // Solo crear nueva conversación si no hay una reciente
      console.log('📝 Creando nueva conversación (no hay conversaciones recientes)...');
      const userName = user?.firstName || user?.email?.split('@')[0] || 'Usuario';
      const welcomeMessage = {
        id: "welcome",
        type: "assistant" as const,
        text: `¡Bienvenido ${userName}! Soy tu asistente financiero. Puedo ayudarte a analizar tus gastos. ¿Qué te gustaría saber?`,
        timestamp: new Date().toISOString(),
      };

      const newConversation = await ChatHistoryService.createConversation({
        userId: user.email,
        title: 'Nueva conversación',
        messages: [welcomeMessage],
      });

      setCurrentConversation(newConversation);
      setMessages([{
        ...welcomeMessage,
        timestamp: new Date(welcomeMessage.timestamp),
      }]);

      console.log(`✅ Nueva conversación creada: ${newConversation.id}`);
    } catch (error) {
      console.error('❌ Error inicializando chat:', error);
      // Fallback: mensaje de bienvenida sin persistencia
      const userName = user?.firstName || user?.email?.split('@')[0] || 'Usuario';
      setMessages([
        {
          id: "welcome",
          type: "assistant",
          text: `¡Bienvenido ${userName}! Soy tu asistente financiero. Puedo ayudarte a analizar tus gastos. ¿Qué te gustaría saber?`,
          timestamp: new Date(),
        },
      ]);
    }
  };

  const loadUserExpenses = async () => {
    if (expensesLoaded) {
      console.log('✅ Gastos ya cargados, omitiendo recarga');
      return;
    }
    
    try {
      if (!user?.email) return;

      console.log('📥 Cargando gastos para contexto del chat...');
      const expenses = await getExpenses(user.email);
      const contextData = prepareExpensesContext(expenses);
      setExpensesContext(contextData);
      setExpensesLoaded(true);
      console.log(`✅ Cargados ${contextData.length} gastos para contexto`);
    } catch (error) {
      console.error("❌ Error cargando gastos:", error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading || !currentConversation) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      text: inputText.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

    // Guardar mensaje del usuario en la base de datos
    try {
      await ChatHistoryService.addMessage(
        currentConversation.id,
        {
          id: userMessage.id,
          type: userMessage.type,
          text: userMessage.text,
          timestamp: userMessage.timestamp.toISOString(),
        },
        user!.email
      );
    } catch (error) {
      console.error('❌ Error guardando mensaje del usuario:', error);
    }

    // Scroll al final después de agregar el mensaje del usuario
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      // Enviar pregunta al asistente
      const response = await askChatAssistant(
        userMessage.text,
        expensesContext,
      );

      if (response.error) {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: "assistant",
          text: `Lo siento, ocurrió un error: ${response.error}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        
        // Guardar mensaje de error
        await ChatHistoryService.addMessage(
          currentConversation.id,
          {
            id: errorMessage.id,
            type: errorMessage.type,
            text: errorMessage.text,
            timestamp: errorMessage.timestamp.toISOString(),
          },
          user!.email
        );
      } else if (response.response) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: "assistant",
          text: response.response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        
        // Guardar respuesta del asistente
        await ChatHistoryService.addMessage(
          currentConversation.id,
          {
            id: assistantMessage.id,
            type: assistantMessage.type,
            text: assistantMessage.text,
            timestamp: assistantMessage.timestamp.toISOString(),
          },
          user!.email
        );
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        text: "Lo siento, no pude procesar tu pregunta. Intenta nuevamente.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      
      // Guardar mensaje de error
      try {
        await ChatHistoryService.addMessage(
          currentConversation.id,
          {
            id: errorMessage.id,
            type: errorMessage.type,
            text: errorMessage.text,
            timestamp: errorMessage.timestamp.toISOString(),
          },
          user!.email
        );
      } catch (saveError) {
        console.error('❌ Error guardando mensaje de error:', saveError);
      }
    } finally {
      setIsLoading(false);
      // Scroll al final después de recibir la respuesta
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const handleClearChat = () => {
    Alert.alert(
      "Nueva Conversación",
      "¿Quieres iniciar una nueva conversación?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Nueva",
          style: "default",
          onPress: async () => {
            if (!user?.email) return;
            
            try {
              // Crear nueva conversación
              const userName = user?.firstName || user?.email?.split('@')[0] || 'Usuario';
              const welcomeMessage = {
                id: "welcome",
                type: "assistant" as const,
                text: `¡Bienvenido ${userName}! Soy tu asistente financiero. Puedo ayudarte a analizar tus gastos. ¿Qué te gustaría saber?`,
                timestamp: new Date().toISOString(),
              };

              const newConversation = await ChatHistoryService.createConversation({
                userId: user.email,
                title: 'Nueva conversación',
                messages: [welcomeMessage],
              });

              setCurrentConversation(newConversation);
              setMessages([{
                ...welcomeMessage,
                timestamp: new Date(welcomeMessage.timestamp),
              }]);

              console.log(`✅ Nueva conversación creada: ${newConversation.id}`);
            } catch (error) {
              console.error('❌ Error creando nueva conversación:', error);
              Alert.alert('Error', 'No se pudo crear una nueva conversación');
            }
          },
        },
      ],
    );
  };

  const handleViewHistory = () => {
    router.push('/chat-history' as any);
  };

  const handleDeleteOldChats = async () => {
    if (!user?.email) return;

    Alert.alert(
      "Limpiar Historial Antiguo",
      "¿Eliminar conversaciones mayores a 7 días?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              const deletedCount = await ChatHistoryService.deleteOldConversations(user.email);
              Alert.alert(
                'Historial Limpiado',
                `Se eliminaron ${deletedCount} conversaciones antiguas`
              );
            } catch (error) {
              console.error('❌ Error limpiando historial:', error);
              Alert.alert('Error', 'No se pudo limpiar el historial');
            }
          },
        },
      ],
    );
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("es-GT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Asistente de Gastos",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerButton}
            >
              <Ionicons name="arrow-back" size={24} color="#007AFF" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={handleViewHistory}
                style={styles.headerButton}
              >
                <Ionicons name="time-outline" size={24} color="#007AFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleClearChat}
                style={styles.headerButton}
              >
                <Ionicons name="add-circle-outline" size={24} color="#34C759" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={100}
      >
        {/* Mensajes */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() =>
            scrollViewRef.current?.scrollToEnd({ animated: true })
          }
        >
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageBubble,
                message.type === "user"
                  ? styles.userBubble
                  : styles.assistantBubble,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  message.type === "user"
                    ? styles.userText
                    : styles.assistantText,
                ]}
              >
                {message.text}
              </Text>
              <Text
                style={[
                  styles.messageTime,
                  message.type === "user"
                    ? styles.userTime
                    : styles.assistantTime,
                ]}
              >
                {formatTime(message.timestamp)}
              </Text>
            </View>
          ))}

          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.loadingText}>Pensando...</Text>
            </View>
          )}
        </ScrollView>

        {/* Input de mensaje */}
        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Pregunta sobre tus gastos..."
              placeholderTextColor="#999"
              multiline
              maxLength={500}
              editable={!isLoading}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
              ]}
              onPress={handleSendMessage}
              disabled={!inputText.trim() || isLoading}
            >
              <Ionicons
                name="send"
                size={20}
                color={!inputText.trim() || isLoading ? "#CCC" : "#FFF"}
              />
            </TouchableOpacity>
          </View>
          {expensesContext.length > 0 && (
            <Text style={styles.contextInfo}>
              📊 Analizando {expensesContext.length} gastos
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  keyboardView: {
    flex: 1,
  },
  headerButton: {
    padding: 8,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  messageBubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#007AFF",
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#FFF",
    borderBottomLeftRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: "#FFF",
  },
  assistantText: {
    color: "#000",
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
  },
  userTime: {
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "right",
  },
  assistantTime: {
    color: "#999",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  loadingText: {
    marginLeft: 8,
    color: "#666",
    fontSize: 14,
  },
  inputContainer: {
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
    color: "#000",
  },
  sendButton: {
    backgroundColor: "#007AFF",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#E5E5E5",
  },
  contextInfo: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
    textAlign: "center",
  },
});
