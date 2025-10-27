import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSetupViewModel } from '../hooks/useSetupViewModel'; // Assuming this hook is in hooks/

const SetupScreen = () => {
  const router = useRouter();
  
  // This function will be called from the ViewModel on success
  const onSaveSuccess = () => {
    Alert.alert("Perfil Guardado", "Tu perfil ha sido guardado localmente.");
    router.replace('/unlock'
    ); // Navigate to the unlock screen
  };

  const viewModel = useSetupViewModel();

  return (
    <View style={styles.container}>
      <Text  style={styles.title}>Crear Perfil Local</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Nombre" 
        placeholderTextColor="#888888"
        value={viewModel.profile.firstName}
        onChangeText={(text) => viewModel.updateProfileField('firstName', text)}
        autoCapitalize="words"
      />
      <TextInput
        style={styles.input}
        placeholder="Apellido"
        placeholderTextColor="#888888"
        value={viewModel.profile.lastName}
        onChangeText={(text) => viewModel.updateProfileField('lastName', text)}
        autoCapitalize="words"
      />
      <TextInput
        style={styles.input}
        placeholder="Correo Electrónico"
        placeholderTextColor="#888888"
        value={viewModel.profile.email}
        onChangeText={(text) => viewModel.updateProfileField('email', text)}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Confirmar Correo Electrónico"
        placeholderTextColor="#888888"
        value={viewModel.confirmEmail}
        onChangeText={viewModel.setConfirmEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="PIN de 4 dígitos"
        placeholderTextColor="#888888"
        value={viewModel.pin}
        onChangeText={viewModel.setPin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={4}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirmar PIN"
        placeholderTextColor="#888888"
        value={viewModel.confirmPin}
        onChangeText={viewModel.setConfirmPin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={4}
      />

      
      {viewModel.isLoading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <Button title="Guardar y Continuar" onPress={viewModel.handleSaveProfile} />
      )}
      
      {viewModel.error && <Text style={styles.errorText}>{viewModel.error}</Text>}
    </View>
  );
};

// Add your styles here
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#333333' },
  input: { height: 40, borderColor: 'gray', borderWidth: 1, borderRadius: 5, marginBottom: 15, paddingHorizontal: 10, backgroundColor: 'white', color:'#333333' },
  errorText: { color: 'red', textAlign: 'center', marginTop: 10 },
});

export default SetupScreen;