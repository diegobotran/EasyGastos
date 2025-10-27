import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDashboardViewModel } from '../../hooks/userDashboardViewModel';
export default function DashboardScreen() {
  const { totalExpenses, pending, approved, rejected, totalAmount, isLoading, userGreeting} = useDashboardViewModel();

  if (isLoading) {
    return <ActivityIndicator size="large" style={styles.centered} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.greeting}>{userGreeting}</Text>

      <View style={styles.cardRow}>
        <View style={styles.card}>
          <Ionicons name="trending-up-outline" size={24} color="#2563eb" />
          <Text style={styles.cardLabel}>Total Gastos</Text>
          <Text style={styles.cardValue}>{totalExpenses}</Text>
        </View>
        <View style={styles.card}>
          <Ionicons name="time-outline" size={24} color="#d97706" />
          <Text style={styles.cardLabel}>Pendientes</Text>
          <Text style={styles.cardValue}>{pending}</Text>
        </View>
      </View>

      <View style={styles.cardRow}>
        <View style={styles.card}>
          <Ionicons name="checkmark-circle-outline" size={24} color="#059669" />
          <Text style={styles.cardLabel}>Aprobados</Text>
          <Text style={styles.cardValue}>{approved}</Text>
        </View>
        <View style={styles.card}>
          <Ionicons name="close-circle-outline" size={24} color="#dc2626" />
          <Text style={styles.cardLabel}>Rechazados</Text>
          <Text style={styles.cardValue}>{rejected}</Text>
        </View>
      </View>

      <View style={styles.totalCard}>
        <Ionicons name="cash-outline" size={24} color="#a855f7" />
        <Text style={styles.cardLabel}>Monto Total</Text>
        <Text style={styles.cardValue}>Q{totalAmount.toFixed(2)}</Text>
      </View>

      <Link href="/add-expense" asChild>
        <TouchableOpacity style={styles.newButton}>
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.newButtonText}>Nuevo Gasto</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: 'white' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 10, color: '#1e293b' },
  greeting: { fontSize: 16, color: '#64748b', marginBottom: 20 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  card: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 8, padding: 15, alignItems: 'center', marginHorizontal: 5 },
  cardLabel: { fontSize: 14, color: '#64748b', marginTop: 10 },
  cardValue: { fontSize: 28, fontWeight: 'bold', marginTop: 5, color: '#1e293b' },
  totalCard: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 15, alignItems: 'center', marginBottom: 20 },
  newButton: { flexDirection: 'row', backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  newButtonText: { color: 'white', fontWeight: 'bold', marginLeft: 5 },
});