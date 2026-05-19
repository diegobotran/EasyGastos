/**
 * Pantalla de Historial de Conversaciones con IA
 * Muestra todas las conversaciones de los últimos 7 días
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from "react-native";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { ChatHistoryService } from "../services/ChatHistoryService";
import { ChatConversation, groupConversationsByDate } from "../models/ChatHistory";

export default function ChatHistoryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Cargar conversaciones cuando la pantalla está en foco
  useFocusEffect(
    React.useCallback(() => {
      loadConversations();
    }, [user])
  );

  const loadConversations = async () => {
    if (!user?.email) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      await ChatHistoryService.initialize().catch(err => {
        console.log('ℹ️ ChatHistoryService ya inicializado:', err.message);
      });
      const userConversations = await ChatHistoryService.getConversationsByUser(user.email);
      setConversations(userConversations);
      console.log(`✅ Cargadas ${userConversations.length} conversaciones`);
    } catch (error) {
      console.error('❌ Error cargando conversaciones:', error);
      Alert.alert('Error', 'No se pudo cargar el historial');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadConversations();
    setIsRefreshing(false);
  };

  const handleOpenConversation = (conversationId: string) => {
    router.push({
      pathname: '/expense-chat' as any,
      params: { conversationId },
    });
  };

  const handleDeleteConversation = (conversation: ChatConversation) => {
    Alert.alert(
      'Eliminar Conversación',
      `¿Eliminar "${conversation.title}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await ChatHistoryService.deleteConversation(conversation.id);
              setConversations(prev => prev.filter(c => c.id !== conversation.id));
              console.log(`✅ Conversación eliminada: ${conversation.id}`);
            } catch (error) {
              console.error('❌ Error eliminando conversación:', error);
              Alert.alert('Error', 'No se pudo eliminar la conversación');
            }
          },
        },
      ]
    );
  };

  const handleClearOldConversations = async () => {
    if (!user?.email) return;

    Alert.alert(
      'Limpiar Historial Antiguo',
      '¿Eliminar todas las conversaciones mayores a 7 días?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const deletedCount = await ChatHistoryService.deleteOldConversations(user.email);
              await loadConversations();
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
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-GT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatMessagePreview = (messages: any[]) => {
    // Encontrar el primer mensaje del usuario (omitir mensaje de bienvenida)
    const userMessage = messages.find(m => m.type === 'user');
    if (userMessage) {
      return userMessage.text.substring(0, 80) + (userMessage.text.length > 80 ? '...' : '');
    }
    return 'Sin mensajes';
  };

  const renderConversations = () => {
    if (conversations.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color="#CCC" />
          <Text style={styles.emptyText}>No hay conversaciones</Text>
          <Text style={styles.emptySubtext}>
            Inicia una conversación con el asistente para verla aquí
          </Text>
        </View>
      );
    }

    const grouped = groupConversationsByDate(conversations);

    return (
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Hoy */}
        {grouped.today.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hoy</Text>
            {grouped.today.map(conversation => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                onPress={() => handleOpenConversation(conversation.id)}
                onDelete={() => handleDeleteConversation(conversation)}
                formatDate={formatDate}
                formatMessagePreview={formatMessagePreview}
              />
            ))}
          </View>
        )}

        {/* Ayer */}
        {grouped.yesterday.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ayer</Text>
            {grouped.yesterday.map(conversation => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                onPress={() => handleOpenConversation(conversation.id)}
                onDelete={() => handleDeleteConversation(conversation)}
                formatDate={formatDate}
                formatMessagePreview={formatMessagePreview}
              />
            ))}
          </View>
        )}

        {/* Esta semana */}
        {grouped.thisWeek.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Esta semana</Text>
            {grouped.thisWeek.map(conversation => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                onPress={() => handleOpenConversation(conversation.id)}
                onDelete={() => handleDeleteConversation(conversation)}
                formatDate={formatDate}
                formatMessagePreview={formatMessagePreview}
              />
            ))}
          </View>
        )}

        {/* Más antiguas */}
        {grouped.older.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Más antiguas</Text>
            {grouped.older.map(conversation => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                onPress={() => handleOpenConversation(conversation.id)}
                onDelete={() => handleDeleteConversation(conversation)}
                formatDate={formatDate}
                formatMessagePreview={formatMessagePreview}
              />
            ))}
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Historial de Conversaciones',
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerButton}
            >
              <Ionicons name="arrow-back" size={24} color="#007AFF" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={handleClearOldConversations}
              style={styles.headerButton}
            >
              <Ionicons name="trash-outline" size={24} color="#FF3B30" />
            </TouchableOpacity>
          ),
        }}
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Cargando historial...</Text>
        </View>
      ) : (
        renderConversations()
      )}
    </View>
  );
}

interface ConversationItemProps {
  conversation: ChatConversation;
  onPress: () => void;
  onDelete: () => void;
  formatDate: (dateString: string) => string;
  formatMessagePreview: (messages: any[]) => string;
}

function ConversationItem({
  conversation,
  onPress,
  onDelete,
  formatDate,
  formatMessagePreview,
}: ConversationItemProps) {
  return (
    <TouchableOpacity
      style={styles.conversationCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.conversationHeader}>
        <View style={styles.conversationIcon}>
          <Ionicons name="chatbubble-ellipses" size={20} color="#007AFF" />
        </View>
        <View style={styles.conversationInfo}>
          <Text style={styles.conversationTitle} numberOfLines={1}>
            {conversation.title}
          </Text>
          <Text style={styles.conversationPreview} numberOfLines={2}>
            {formatMessagePreview(conversation.messages)}
          </Text>
          <View style={styles.conversationMeta}>
            <Ionicons name="time-outline" size={12} color="#999" />
            <Text style={styles.conversationDate}>
              {formatDate(conversation.updatedAt)}
            </Text>
            <Text style={styles.conversationDot}>•</Text>
            <Text style={styles.conversationMessages}>
              {conversation.messages.length} mensajes
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={onDelete}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={20} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  headerButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  conversationCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  conversationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  conversationInfo: {
    flex: 1,
  },
  conversationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  conversationPreview: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  conversationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  conversationDate: {
    fontSize: 12,
    color: '#999',
    marginLeft: 4,
  },
  conversationDot: {
    fontSize: 12,
    color: '#999',
    marginHorizontal: 6,
  },
  conversationMessages: {
    fontSize: 12,
    color: '#999',
  },
  deleteButton: {
    padding: 4,
    marginLeft: 8,
  },
  bottomPadding: {
    height: 20,
  },
});
