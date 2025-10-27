import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePinUnlockViewModel } from '../hooks/usePinUnlockViewModel';

const PinDot = ({ isActive }: { isActive: boolean }) => (
  <View style={[styles.dot, isActive ? styles.dotActive : {}]} />
);

const UnlockScreen = () => {
  const router = useRouter();
  const { email: initialEmail } = useLocalSearchParams<{ email: string }>();
  const { email } = useLocalSearchParams<{ email: string }>();

  

  const onUnlockSuccess = () => {
    Alert.alert("Éxito", `Bienvenido de nuevo, ${email}`);
    router.replace('/(tabs)/dashboard');
  };
  
  const viewModel = usePinUnlockViewModel({ 
    onUnlockSuccess, 
    email: email
  });
  
  const KeypadButton = ({ value, isBackspace = false }: { value: string, isBackspace?: boolean }) => (
    <TouchableOpacity 
      style={styles.keypadButton} 
      onPress={() => isBackspace ? viewModel.handleDelete() : viewModel.handleKeyPress(value)}
    >
      <Text style={styles.keypadText}>{value}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ingrese su PIN</Text>

      <View style={styles.dotsContainer}>
        {[...Array(4)].map((_, i) => <PinDot key={i} isActive={i < viewModel.pin.length} />)}
      </View>
      
      {/* --- THIS IS THE MISSING UI --- */}
      {viewModel.isLoading ? (
        <ActivityIndicator size="large" color="#2563eb" style={{ height: 50 }}/>
      ) : (
        <Text style={styles.errorText}>{viewModel.error || ' '}</Text>
      )}

      <View style={styles.keypadContainer}>
        {'123456789'.split('').map(digit => <KeypadButton key={digit} value={digit}/>)}
        <View style={styles.keypadButton} />
        <KeypadButton value={'0'} />
        <KeypadButton value={'⌫'} isBackspace={true} />
      </View>
      {/* --- END OF MISSING UI --- */}
    </View>
  );
};

// Your styles object is correct and does not need to change.
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 20 },
  dotsContainer: { flexDirection: 'row', marginBottom: 20 },
  dot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#d1d5db', margin: 10 },
  dotActive: { backgroundColor: '#2563eb' },
  errorText: { color: '#ef4444', fontSize: 16, height: 50, textAlign: 'center' },
  keypadContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: '80%', marginTop: 20 },
  keypadButton: { width: '33.3%', height: 80, justifyContent: 'center', alignItems: 'center' },
  keypadText: { fontSize: 28, color: '#1f2937' },
});

export default UnlockScreen;