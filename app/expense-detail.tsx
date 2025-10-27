import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Expense, STATUSES } from '../models/Expense';

export default function ExpenseDetailScreen() {
  const params = useLocalSearchParams();
  const expense: Expense = JSON.parse(params.expense as string); // Parse the passed expense data
  const statusInfo = STATUSES[expense.status];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{expense.description}</Text>

      {/* Status Badge */}
      <View style={[styles.statusBadge, { backgroundColor: statusInfo.backgroundColor }]}>
        <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.text}</Text>
      </View>

      {/* Basic Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Información Básica</Text>
        <DetailRow label="Monto" value={`Q${expense.amount.toFixed(2)}`} />
        <DetailRow label="Fecha" value={expense.date} />
        <DetailRow label="Categoría" value={expense.category} />
        <DetailRow label="Departamento" value={expense.department} />
        <DetailRow label="Moneda" value={expense.currency} />
      </View>

      {/* Supplier Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Proveedor</Text>
        <DetailRow label="Proveedor" value={expense.supplier} />
        <DetailRow label="NIT" value={expense.vat_number} />
      </View>

      {/* Invoice Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Detalles de Factura</Text>
        <DetailRow label="Serie" value={expense.serie} />
        <DetailRow label="No. Factura" value={expense.noinvoice} />
        <DetailRow label="Total IVA" value={`Q${expense.totiva.toFixed(2)}`} />
      </View>

      {/* Accounting Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Información Contable</Text>
        <DetailRow label="Centro" value={expense.centro} />
        <DetailRow label="Cuenta" value={expense.cuenta} />
        <DetailRow label="Orden CO" value={expense.ordenco} />
      </View>

      {/* Notes and Attachment */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notas</Text>
        <Text style={styles.notes}>{expense.notes || 'Sin notas'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Comprobante</Text>
        {expense.imageuri ? (
          <Image source={{ uri: expense.imageuri }} style={styles.image} resizeMode="contain" />
        ) : (
          <Text style={styles.noImage}>Sin comprobante adjunto</Text>
        )}
      </View>
    </ScrollView>
  );
}

// Helper component for detail rows
const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}:</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8fafc' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 10, color: '#2563eb' },
  statusBadge: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 20 },
  statusText: { fontSize: 14, fontWeight: 'bold' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 10, color: '#1e293b' },
  detailRow: { flexDirection: 'row', marginBottom: 8 },
  detailLabel: { fontSize: 16, fontWeight: '500', color: '#374151', width: 120 },
  detailValue: { fontSize: 16, color: '#64748b', flex: 1 },
  notes: { fontSize: 16, color: '#64748b', lineHeight: 24 },
  image: { width: '100%', height: 300, borderRadius: 8, marginBottom: 20 },
  noImage: { fontSize: 16, color: '#64748b', textAlign: 'center' },
});