import { Ionicons } from '@expo/vector-icons';
import { 
  ActivityIndicator, 
  KeyboardAvoidingView,
  Platform,
  ScrollView, 
  StyleSheet, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  View 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSetupViewModel } from '../hooks/useSetupViewModel';

const SetupScreen = () => {
  const viewModel = useSetupViewModel();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Ionicons name="person-add" size={60} color="#2563eb" />
            <Text style={styles.title}>Crear Perfil</Text>
            <Text style={styles.subtitle}>Configura tu cuenta para comenzar</Text>
          </View>

        {/* Sección de Información Personal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información Personal</Text>
          
          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Nombre" 
              placeholderTextColor="#94a3b8"
              value={viewModel.profile.firstName}
              onChangeText={(text) => viewModel.updateProfileField('firstName', text)}
              autoCapitalize="words"
              editable={!viewModel.isLoading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Apellido"
              placeholderTextColor="#94a3b8"
              value={viewModel.profile.lastName}
              onChangeText={(text) => viewModel.updateProfileField('lastName', text)}
              autoCapitalize="words"
              editable={!viewModel.isLoading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="id-card-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Código de Empleado"
              placeholderTextColor="#94a3b8"
              value={viewModel.employeeCode}
              onChangeText={viewModel.setEmployeeCode}
              autoCapitalize="characters"
              editable={!viewModel.isLoading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="card-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Código proveedor colaborador (LIFNR)"
              placeholderTextColor="#94a3b8"
              value={viewModel.lifnr}
              onChangeText={viewModel.setLifnr}
              autoCapitalize="characters"
              editable={!viewModel.isLoading}
            />
          </View>
        </View>

        {/* Sección de Correo Electrónico */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Correo Electrónico</Text>
          
          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="correo@ejemplo.com"
              placeholderTextColor="#94a3b8"
              value={viewModel.profile.email}
              onChangeText={(text) => viewModel.updateProfileField('email', text.toLowerCase())}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!viewModel.isLoading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirmar correo electrónico"
              placeholderTextColor="#94a3b8"
              value={viewModel.confirmEmail}
              onChangeText={(text) => viewModel.setConfirmEmail(text.toLowerCase())}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!viewModel.isLoading}
            />
          </View>
          
          {viewModel.confirmEmail && viewModel.profile.email !== viewModel.confirmEmail && (
            <View style={styles.validationWarning}>
              <Ionicons name="alert-circle" size={16} color="#dc2626" />
              <Text style={styles.validationWarningText}>Los correos no coinciden</Text>
            </View>
          )}
          
          {viewModel.confirmEmail && viewModel.profile.email === viewModel.confirmEmail && (
            <View style={styles.validationSuccess}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text style={styles.validationSuccessText}>Los correos coinciden</Text>
            </View>
          )}
        </View>

        {/* Sección de PIN de Seguridad */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PIN de Seguridad</Text>
          <Text style={styles.sectionSubtitle}>Crea un PIN de 4 dígitos para proteger tu cuenta</Text>
          
          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="PIN de 4 dígitos"
              placeholderTextColor="#94a3b8"
              value={viewModel.pin}
              onChangeText={viewModel.setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              editable={!viewModel.isLoading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirmar PIN"
              placeholderTextColor="#94a3b8"
              value={viewModel.confirmPin}
              onChangeText={viewModel.setConfirmPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              editable={!viewModel.isLoading}
            />
          </View>

          {viewModel.confirmPin && viewModel.pin !== viewModel.confirmPin && (
            <View style={styles.validationWarning}>
              <Ionicons name="alert-circle" size={16} color="#dc2626" />
              <Text style={styles.validationWarningText}>Los PINs no coinciden</Text>
            </View>
          )}
          
          {viewModel.confirmPin && viewModel.pin === viewModel.confirmPin && viewModel.pin.length === 4 && (
            <View style={styles.validationSuccess}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text style={styles.validationSuccessText}>Los PINs coinciden</Text>
            </View>
          )}
        </View>

        {/* Mensaje de Error */}
        {viewModel.error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#dc2626" />
            <Text style={styles.errorText}>{viewModel.error}</Text>
          </View>
        )}

        {/* Botón de Guardar */}
        <TouchableOpacity 
          style={[styles.saveButton, viewModel.isLoading && styles.saveButtonDisabled]}
          onPress={viewModel.handleSaveProfile}
          disabled={viewModel.isLoading}
        >
          {viewModel.isLoading ? (
            <>
              <ActivityIndicator size="small" color="white" />
              <Text style={styles.saveButtonText}>Guardando...</Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="white" />
              <Text style={styles.saveButtonText}>Guardar y Continuar</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Espacio adicional para el teclado */}
        <View style={{ height: 100 }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f8fafc',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 10,
  },
  title: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    color: '#1e293b',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748b',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 3,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
    paddingHorizontal: 14,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingRight: 0,
  },
  picker: {
    flex: 1,
    height: 48,
    color: '#1e293b',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: { 
    flex: 1,
    height: 48,
    fontSize: 15,
    color: '#1e293b',
  },
  validationWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -4,
    marginBottom: 10,
    marginLeft: 4,
  },
  validationWarningText: {
    fontSize: 13,
    color: '#dc2626',
  },
  validationSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -4,
    marginBottom: 10,
    marginLeft: 4,
  },
  validationSuccessText: {
    fontSize: 13,
    color: '#059669',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { 
    flex: 1,
    fontSize: 14,
    color: '#dc2626',
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SetupScreen;
