# Sistema de Notificaciones Push - Instrucciones de Instalación

## 📦 Instalación de Dependencias

Para que funcionen las notificaciones push, necesitas instalar `expo-notifications`:

```bash
npm install expo-notifications@~0.30.7
```

O si usas yarn:

```bash
yarn add expo-notifications@~0.30.7
```

Luego, ejecuta:

```bash
npx expo prebuild --clean
```

## 🔔 Características Implementadas

### 1. **Notificaciones Locales para Managers**
- El jefe recibe una notificación push cuando hay liquidaciones pendientes
- Badge en el icono de la app con el número de pendientes
- Sonido, vibración y alertas visuales

### 2. **Control Inteligente de Frecuencia**
- Máximo 1 notificación cada 30 minutos (evita spam)
- Solo notifica cuando AUMENTA el número de pendientes
- No notifica si el usuario ya vio las liquidaciones

### 3. **Configuración Personalizable**
- Usuario puede activar/desactivar notificaciones
- Control de sonido, vibración y badge
- Todo guardado en AsyncStorage

### 4. **Funciona 100% Offline**
- Notificaciones locales (no requiere servidor)
- Se envían desde el dispositivo mismo
- Funciona sin conexión a internet

## 🎯 Flujo de Notificaciones

### Cuando hay liquidaciones nuevas:

1. **Sincronización automática** (cada 5 minutos)
   - Hook `useManagerSync` descarga liquidaciones del backend
   - Compara con el conteo anterior

2. **Detección de nuevas liquidaciones**
   - Si hay más liquidaciones que antes → Envía notificación
   - Si el conteo es igual o menor → No notifica

3. **Notificación al Manager**
   ```
   🔔 Liquidaciones Pendientes
   Tienes 3 liquidaciones esperando tu aprobación
   ```
   - Badge en el icono: "3"
   - Sonido y vibración
   - Tap → Abre pantalla de aprobación

4. **Limpieza automática**
   - Cuando el manager abre la pantalla → Badge se limpia
   - Cuando aprueba/rechaza → Contador se actualiza

## 📱 Permisos Requeridos

### Android
- `android.permission.VIBRATE`
- `android.permission.POST_NOTIFICATIONS` (Android 13+)

### iOS
- Permisos de notificación solicitados automáticamente

## 🔧 Configuración en app.json

Agrega esto a tu `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/images/notification-icon.png",
          "color": "#3b82f6",
          "sounds": ["./assets/sounds/notification.wav"]
        }
      ]
    ],
    "android": {
      "permissions": [
        "android.permission.VIBRATE",
        "android.permission.POST_NOTIFICATIONS"
      ]
    },
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["remote-notification"]
      }
    }
  }
}
```

## 🧪 Testing

### Probar notificaciones en desarrollo:

1. **Iniciar la app**
   ```bash
   npx expo start
   ```

2. **Simular liquidaciones pendientes**
   - Usa el endpoint del backend para crear liquidaciones
   - O modifica el contador localmente en AsyncStorage

3. **Verificar que funciona:**
   - Badge aparece en el icono
   - Notificación push se muestra
   - Tap en notificación → Abre pantalla correcta
   - Badge se limpia al abrir pantalla

## 📝 Archivos Modificados

### Nuevos Archivos:
- ✅ `services/NotificationService.ts` - Servicio completo de notificaciones

### Archivos Modificados:
- ✅ `hooks/useManagerSync.ts` - Integración con notificaciones
- ✅ `app/_layout.tsx` - Inicialización del servicio
- ✅ `app/manager-approval.tsx` - Limpieza de badges
- ✅ `package.json` - Dependencia agregada

## 🎉 Resultado

**El manager ahora:**
- ✅ Recibe notificaciones push cuando hay liquidaciones nuevas
- ✅ Ve badge en el icono con el número de pendientes
- ✅ Puede tocar la notificación para ir directo a aprobar
- ✅ Todo funciona offline-first
- ✅ Control inteligente de frecuencia (sin spam)

**¡Las notificaciones están listas!** 🚀
