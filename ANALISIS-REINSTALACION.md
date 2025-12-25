# 📱 ANÁLISIS: Flujo de Desinstalación/Reinstalación de la App

## 🎯 Escenario

**Usuario Mauricio:**
- ✅ Tiene datos sincronizados en el backend (MongoDB)
  - 1 Liquidación (submitted)
  - 2 Gastos (1 activo, 1 anulado)
  - Categorías
  - Usuario registrado con PIN 1011
- 🗑️ Desinstala la app
  - Se pierde toda la BD local SQLite
  - Se pierde AsyncStorage (usuario guardado, token, etc.)
- ⬇️ Reinstala la app

---

## 🔍 ANÁLISIS DEL FLUJO ACTUAL

### 📋 PASO 1: Primera vez que abre la app

**Archivo:** `app/_layout.tsx` (líneas 89-101)

```typescript
const lastUser = await AuthService.getLastLoggedInUser();
// ❌ Devuelve NULL porque AsyncStorage está vacío

if (lastUser) {
  router.replace({ pathname: '/unlock', params: { email: lastUser.email } });
} else {
  // ✅ Va aquí
  router.replace('/setup');
}
```

**Resultado:** Usuario va a pantalla de **Setup** (crear perfil)

---

### 📋 PASO 2: Usuario en Setup

El usuario tiene **DOS OPCIONES:**

#### Opción A: Poner el MISMO email que tenía antes
```
Email: mauricio.suarez@ronesdeguatemala.com
PIN: 1011 (el mismo que tenía)
```

#### Opción B: Poner un email DIFERENTE
```
Email: mauricio.nuevo@empresa.com
PIN: 5555
```

---

### 📋 PASO 3: ¿Qué pasa en el código?

**Archivo:** `hooks/useSetupViewModel.ts` (líneas 95-180)

```typescript
// PASO 3.1: Verificar si usuario EXISTE en backend
const loginResult = await BackendSyncService.loginAndGetToken(
  profile.email, 
  pin
);

if (loginResult.success) {
  // ✅ USUARIO EXISTE - Puede hacer login
  console.log('✅ Setup: Usuario ya existe en backend - Descargando datos...');
  
  // PASO 3.2: Descargar TODOS los datos del backend
  const authToken = loginResult.token;
  
  // 3.2.1 Descargar categorías
  await BackendSyncService.downloadCategoriesFromBackend(email, authToken);
  
  // 3.2.2 Descargar gastos
  await BackendSyncService.downloadExpensesFromBackend(email, authToken);
  
  // 3.2.3 Descargar liquidaciones
  await BackendSyncService.downloadLiquidationsFromBackend(email, authToken);
  
  // 3.2.4 Si es manager, descargar liquidaciones pendientes de aprobar
  if (user.isManager) {
    await BackendSyncService.downloadPendingLiquidationsForManager(...);
  }
  
} else {
  // ❌ USUARIO NO EXISTE - Registrar nuevo usuario
  const result = await BackendSyncService.syncUserRegistration(user, pin);
}
```

---

## ✅ RESPUESTA A TU PREGUNTA

### Caso 1: Usuario pone el MISMO email con el MISMO PIN

**¿Qué pasa?**
1. ✅ Login exitoso (usuario existe, PIN correcto)
2. ✅ Descarga TODAS sus categorías del backend
3. ✅ Descarga TODOS sus gastos del backend (incluidos los anulados)
4. ✅ Descarga TODAS sus liquidaciones del backend
5. ✅ **RECUPERA TODA SU INFORMACIÓN** 🎉

**Problema potencial:**
- Si el usuario pone el **PIN incorrecto**, el login fallará
- La app intentará REGISTRARLO como nuevo usuario
- El backend rechazará el registro (email ya existe)
- **RESULTADO:** Usuario bloqueado ❌

---

### Caso 2: Usuario pone el MISMO email con PIN DIFERENTE

**¿Qué pasa?**
1. ❌ Login falla (PIN incorrecto)
2. ❌ Intenta registrar al usuario
3. ❌ Backend responde: "Usuario ya existe"
4. ❌ Setup muestra error
5. ❌ **Usuario NO puede acceder a sus datos**

**Solución necesaria:**
- Agregar botón "¿Olvidé mi PIN?"
- Implementar recuperación de PIN por email
- O mostrar mensaje más claro: "Este email ya está registrado. ¿Olvidaste tu PIN?"

---

### Caso 3: Usuario pone un email COMPLETAMENTE DIFERENTE

**¿Qué pasa?**
1. ❌ Login falla (usuario no existe)
2. ✅ Registra nuevo usuario con el nuevo email
3. ✅ Usuario puede usar la app
4. ❌ **NO recupera sus datos antiguos** (están asociados al email anterior)

**Consecuencia:**
- El usuario tiene DOS cuentas ahora
- Datos antiguos en mauricio.suarez@ronesdeguatemala.com
- Datos nuevos en mauricio.nuevo@empresa.com

---

## 🚨 PROBLEMAS IDENTIFICADOS

### Problema 1: PIN Olvidado
**Escenario:** Usuario reinstala y no recuerda su PIN exacto

**Solución actual:** ❌ Ninguna

**Solución recomendada:**
```typescript
// En setup.tsx, agregar:
if (loginResult.error && loginResult.error.includes('credenciales inválidas')) {
  // Mostrar opción de recuperación
  Alert.alert(
    'Usuario Existente',
    'Este correo ya está registrado. ¿Olvidaste tu PIN?',
    [
      { text: 'Intentar de nuevo', style: 'cancel' },
      { text: 'Recuperar PIN', onPress: () => handlePasswordRecovery() }
    ]
  );
}
```

---

### Problema 2: Confusión de Usuario
**Escenario:** Usuario no sabe si ya estaba registrado

**Solución actual:** ❌ No hay indicación clara

**Solución recomendada:**
```typescript
// Agregar verificación de email ANTES del setup completo
const checkEmailButton = (
  <TouchableOpacity onPress={async () => {
    const exists = await BackendSyncService.checkUserExists(email);
    if (exists) {
      Alert.alert(
        'Usuario Encontrado',
        'Este correo ya está registrado. Ingresa tu PIN para recuperar tus datos.',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert(
        'Usuario Nuevo',
        'Este correo está disponible. Puedes crear una nueva cuenta.',
        [{ text: 'OK' }]
      );
    }
  }}>
    <Text>¿Ya tengo cuenta?</Text>
  </TouchableOpacity>
);
```

---

### Problema 3: Descarga en Background No Esperada
**Archivo:** `useSetupViewModel.ts` líneas 115-160

**Código actual:**
```typescript
// Descarga en background (no bloqueante)
Promise.resolve().then(async () => {
  await BackendSyncService.downloadCategoriesFromBackend(...);
  await BackendSyncService.downloadExpensesFromBackend(...);
  // ...
}).catch((error) => {
  console.error('⚠️ Setup: Error en descarga background (no crítico):', error);
});

// Continúa inmediatamente SIN ESPERAR
router.replace({ pathname: '/unlock', params: { email: profile.email } });
```

**Problema:**
- El usuario navega a `/unlock` ANTES de que terminen de descargarse sus datos
- Va a dashboard y NO VE sus gastos/liquidaciones aún
- Puede crear gastos duplicados pensando que no tiene nada

**Solución recomendada:**
```typescript
// Mostrar progreso de descarga
setIsLoading(true);
setSyncStatus('Descargando tus datos del servidor...');

const results = await Promise.all([
  BackendSyncService.downloadCategoriesFromBackend(email, authToken),
  BackendSyncService.downloadExpensesFromBackend(email, authToken),
  BackendSyncService.downloadLiquidationsFromBackend(email, authToken)
]);

const totalDownloaded = results.reduce((sum, r) => sum + (r.count || 0), 0);

Alert.alert(
  'Datos Recuperados',
  `Se descargaron ${totalDownloaded} registros de tu cuenta anterior.\n\n` +
  `✅ Categorías\n✅ Gastos\n✅ Liquidaciones`,
  [{ text: 'Continuar', onPress: () => router.replace('/unlock') }]
);
```

---

## ✅ RESUMEN

### Flujo CORRECTO actual (si todo va bien):
1. Usuario reinstala app
2. Va a Setup
3. Pone mismo email + mismo PIN
4. ✅ Login exitoso
5. ✅ Descarga datos en background
6. ✅ Recupera todo (eventualmente)

### Problemas a considerar:
1. ⚠️ Si olvida PIN → Bloqueado sin recuperación
2. ⚠️ Descarga en background → Usuario no ve datos inmediatamente
3. ⚠️ Sin indicación clara si email ya existe
4. ⚠️ No hay validación de que el usuario puso el PIN correcto antes de continuar

---

## 🎯 RECOMENDACIONES (Sin implementar, solo análisis)

### Recomendación 1: Validación Explícita
Mostrar claramente si el usuario ya existe ANTES de completar el setup.

### Recomendación 2: Descarga Sincrónica
Esperar a que termine la descarga de datos antes de navegar al dashboard.

### Recomendación 3: Recuperación de PIN
Implementar sistema de recuperación (email, pregunta secreta, etc).

### Recomendación 4: Indicador Visual
```
"Recuperando tus datos..."
[████████░░] 80%
Descargados: 25 gastos, 5 categorías, 3 liquidaciones
```

### Recomendación 5: Opción "Ya tengo cuenta"
En setup, agregar botón:
```
[ Crear Nueva Cuenta ]
[ Ya tengo cuenta - Recuperar datos ]
```

---

## 📊 TABLA COMPARATIVA

| Escenario | Email | PIN | Resultado | Datos Recuperados |
|-----------|-------|-----|-----------|-------------------|
| ✅ Ideal | Mismo | Correcto | Login exitoso | ✅ Todos |
| ⚠️ Problema | Mismo | Incorrecto | Registro falla | ❌ Ninguno |
| ⚠️ Problema | Diferente | Cualquiera | Nueva cuenta | ❌ Datos antiguos perdidos |
| ✅ Manager | Mismo | Correcto | Login + Manager data | ✅ Todos + Liquidaciones de empleados |

---

## 🔧 CÓDIGO ACTUAL FUNCIONA SI:
1. Usuario recuerda su email exacto
2. Usuario recuerda su PIN exacto (4 dígitos)
3. Usuario espera a que termine la descarga en background
4. Backend está disponible durante el setup

## ❌ CÓDIGO FALLA SI:
1. Usuario olvida su PIN
2. Usuario escribe email diferente
3. Usuario crea gastos antes de que termine la descarga
4. Backend está offline durante el setup

---

**Conclusión:** El flujo actual **SÍ recupera los datos**, pero puede ser confuso para el usuario y no tiene protección contra PIN olvidado.
