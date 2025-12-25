# 📱 Sistema de Actualización Automática de APK

## 📋 Resumen

Sistema implementado que permite actualizar la app EasyGastos sin necesidad de reinstalar manualmente en cada dispositivo. Los usuarios pueden verificar y descargar actualizaciones directamente desde la app.

---

## ✅ ¿Qué se implementó?

### 1. **Servicio de Actualización (`UpdateService.ts`)**
- ✅ Verificación de versión disponible en el servidor
- ✅ Descarga automática del APK con barra de progreso
- ✅ Instalación mediante intent de Android
- ✅ Actualización opcional o forzada
- ✅ Manejo de errores y feedback al usuario

### 2. **UI en Settings**
- ✅ Botón "Buscar Actualización" con versión actual
- ✅ Indicador de progreso durante descarga
- ✅ Diseño consistente con el resto de la app
- ✅ No interfiere con funcionalidad existente

### 3. **Backend (Endpoints de API)**
- ✅ `GET /api/app/version` - Información de versión disponible
- ✅ `GET /api/app/download` - Descarga del APK más reciente
- ✅ `POST /api/app/version` - Actualizar info de versión (admin)
- ✅ Directorio `backend/apks/` para almacenar APKs

### 4. **Configuración Android**
- ✅ Permiso `REQUEST_INSTALL_PACKAGES` agregado
- ✅ FileProvider configurado para compartir APKs
- ✅ Intent de instalación funcionando

---

## 🚀 Cómo Usar el Sistema

### **Para los Usuarios (App Móvil)**

1. Abrir la app EasyGastos
2. Ir a **⚙️ Ajustes**
3. Presionar botón **"Buscar Actualización"**
4. Si hay actualización disponible:
   - Ver notas de la versión
   - Elegir "Actualizar" o "Más tarde"
   - Esperar descarga (con progreso)
   - Confirmar instalación cuando Android lo solicite
5. La app se actualizará automáticamente

### **Para los Desarrolladores (Subir Nueva Versión)**

#### **Paso 1: Compilar el APK**
```bash
cd C:\Apps\EasyGastosMobile

# Compilar APK de producción
npm run android -- --variant=release

# O si necesita rebuild completo
npx expo prebuild --clean
cd android
./gradlew assembleRelease
```

El APK se generará en:
```
android/app/build/outputs/apk/release/app-release.apk
```

#### **Paso 2: Copiar APK al servidor**

```bash
# Copiar al servidor (ajustar ruta según su setup)
scp android/app/build/outputs/apk/release/app-release.apk \
    user@200.6.231.237:/path/to/backend/apks/EasyGastos-v1.0.1.apk
```

O si está en Windows y el backend está local:
```powershell
Copy-Item android\app\build\outputs\apk\release\app-release.apk `
    C:\Apps\EasyGastosMobile\backend\apks\EasyGastos-v1.0.1.apk
```

#### **Paso 3: Actualizar versión en el backend**

Editar `backend/routes/app.js`:

```javascript
const CURRENT_APP_VERSION = {
  version: '1.0.1',           // ← Actualizar versión
  buildNumber: 2,             // ← Incrementar build number
  releaseDate: new Date().toISOString(),
  releaseNotes: 'Mejoras en sincronización y corrección de bugs', // ← Describir cambios
  downloadUrl: '/api/app/download',
  minVersion: '1.0.0',
  forceUpdate: false,         // ← true si es obligatoria
};
```

#### **Paso 4: Reiniciar el servidor**

```bash
# Si está usando PM2
pm2 restart easygastos-backend

# O si está corriendo directamente
# Detener con Ctrl+C y ejecutar:
cd backend
node server.js
```

#### **Paso 5: Actualizar versión en app.json**

```json
{
  "expo": {
    "version": "1.0.1",
    "android": {
      "versionCode": 2
    }
  }
}
```

---

## 📊 Flujo de Actualización

```
┌─────────────┐
│   Usuario   │
│ presiona    │
│  "Buscar    │
│ Actualiz."  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│ GET /api/app/version        │
│ ¿Hay nueva versión?         │
└──────┬──────────────────────┘
       │
       ▼
  ┌────┴────┐
  │ ¿Hay    │
  │ update? │
  └─┬─────┬─┘
    │ NO  │ SI
    │     │
    │     ▼
    │  ┌──────────────────┐
    │  │ Mostrar dialog   │
    │  │ con notas        │
    │  └────┬─────────────┘
    │       │
    │       ▼
    │  ┌──────────────────┐
    │  │ Descargar APK    │
    │  │ (con progreso)   │
    │  └────┬─────────────┘
    │       │
    │       ▼
    │  ┌──────────────────┐
    │  │ Abrir instalador │
    │  │ de Android       │
    │  └────┬─────────────┘
    │       │
    ▼       ▼
┌──────────────┐
│ Usuario      │
│ confirma e   │
│ instala      │
└──────────────┘
```

---

## 🔧 Configuración Avanzada

### **Actualización Forzada**

Si una versión es crítica y **todos deben actualizar**:

```javascript
// En backend/routes/app.js
const CURRENT_APP_VERSION = {
  version: '1.1.0',
  buildNumber: 5,
  forceUpdate: true,  // ← Activar actualización obligatoria
  releaseNotes: '⚠️ Actualización de seguridad crítica - REQUERIDA',
};
```

El usuario **no podrá usar la app** hasta que actualice.

### **Versión Mínima Requerida**

```javascript
minVersion: '1.0.5',  // Versiones anteriores no funcionarán
```

### **Actualización Automática al Inicio**

El servicio ya incluye verificación al inicio:

```typescript
// En UpdateService.ts - ya implementado
export const checkForUpdatesOnStartup = async () => {
  // Verifica automáticamente al abrir la app
  // Solo muestra dialog si es actualización forzada
};
```

Para activarlo, agregar en `app/_layout.tsx`:

```typescript
import * as UpdateService from '../services/UpdateService';

// En el useEffect inicial
useEffect(() => {
  UpdateService.checkForUpdatesOnStartup();
}, []);
```

---

## 📱 Experiencia del Usuario

### **Cuando NO hay actualización:**
```
✓ Actualizado
Ya tienes la última versión (1.0.0)

[OK]
```

### **Cuando HAY actualización opcional:**
```
🆕 Actualización disponible

Versión 1.0.1

• Mejoras en sincronización
• Corrección de bugs
• Nueva UI para categorías

[Más tarde]  [Actualizar]
```

### **Cuando HAY actualización forzada:**
```
⚠️ Actualización requerida

Versión 1.1.0 - CRÍTICA

Esta actualización es obligatoria para
continuar usando la app.

• Parche de seguridad crítico
• Compatibilidad con nuevo backend

[Actualizar]
```

### **Durante la descarga:**
```
📥 Descargando actualización...

████████░░░░░░░░░░ 45%

[Cancelar no disponible]
```

---

## 🔐 Seguridad y Permisos

### **Permisos de Android:**
- `REQUEST_INSTALL_PACKAGES` - Para instalar APKs
- Usuario debe confirmar instalación (Android 8+)

### **FileProvider:**
Configurado en `AndroidManifest.xml` para compartir APK de forma segura entre procesos.

### **Descarga Segura:**
- Solo APKs firmados con el mismo certificado funcionarán
- Android verifica la firma antes de instalar

---

## 🐛 Troubleshooting

### **"No se puede instalar la actualización"**
✅ Verificar que el APK esté firmado
✅ Comprobar permisos en Android
✅ Revisar que FileProvider esté configurado

### **"Error descargando actualización"**
✅ Verificar conectividad
✅ Comprobar que el APK existe en `backend/apks/`
✅ Revisar logs del servidor

### **"Actualización se queda en 0%"**
✅ Verificar espacio en dispositivo
✅ Comprobar URL de descarga en backend
✅ Revisar CORS en servidor

### **"Android no muestra instalador"**
✅ Verificar permiso REQUEST_INSTALL_PACKAGES
✅ Comprobar que el APK no esté corrupto
✅ Revisar logs: `adb logcat | grep EasyGastos`

---

## 📝 Notas Importantes

### ✅ **Ventajas del Sistema:**
- No requiere reinstalación manual
- Actualización en segundos
- Control de versiones centralizado
- Rollout controlado (pueden subir gradualmente)
- Feedback visual al usuario

### ⚠️ **Limitaciones:**
- Solo funciona en Android (iOS requiere App Store)
- Usuario debe confirmar instalación manualmente (seguridad de Android)
- Requiere permisos de instalación
- APK completo (~30-60 MB) vs updates JS (~1-5 MB)

### 💡 **Mejoras Futuras Posibles:**
- [ ] Actualización diferencial (solo cambios)
- [ ] Cache de APKs descargados
- [ ] Programar actualización para horario específico
- [ ] Estadísticas de adopción de versiones
- [ ] Notificación push cuando hay update disponible
- [ ] A/B testing de versiones

---

## 🎯 Checklist de Despliegue

Antes de subir una nueva versión:

- [ ] Compilar APK de release firmado
- [ ] Probar APK en dispositivo físico
- [ ] Copiar APK a `backend/apks/`
- [ ] Actualizar `CURRENT_APP_VERSION` en `backend/routes/app.js`
- [ ] Actualizar `version` y `versionCode` en `app.json`
- [ ] Reiniciar servidor backend
- [ ] Probar actualización desde app móvil
- [ ] Verificar que instalación funciona correctamente
- [ ] Documentar cambios en release notes

---

## 📞 Soporte

Si tienen problemas con el sistema de actualización:
1. Revisar logs del servidor: `pm2 logs easygastos-backend`
2. Revisar logs de la app: `adb logcat | grep EasyGastos`
3. Verificar endpoint: `curl http://200.6.231.237:7300/api/app/version`

---

**✅ Sistema implementado y funcionando correctamente**  
**🚀 Listo para usar en producción**
