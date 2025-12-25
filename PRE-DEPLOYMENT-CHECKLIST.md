# ✅ CHECKLIST PRE-DEPLOYMENT - EASYGASTOS

**Fecha:** _____________  
**Responsable:** _____________  
**Versión a Deployar:** _____________  
**Ambiente:** ☐ Desarrollo  ☐ Staging  ☐ Producción  

---

## 📋 PREPARACIÓN GENERAL

### Configuración del Backend

- [ ] **MongoDB instalado y corriendo**
  ```bash
  # Verificar MongoDB
  mongosh --eval "db.adminCommand('ping')"
  ```
  - [ ] Puerto: 27017
  - [ ] Base de datos: `easygastos` creada
  - [ ] Conexión funcional

- [ ] **Variables de entorno configuradas** (`backend/.env`)
  - [ ] `NODE_ENV=production`
  - [ ] `PORT=7300` (o puerto deseado)
  - [ ] `MONGODB_URI=mongodb://localhost:27017/easygastos`
  - [ ] `JWT_SECRET` generado (mínimo 32 caracteres)
  - [ ] `BIND_IP=0.0.0.0`
  - [ ] `ALLOWED_ORIGINS` configurado según necesidad
  - [ ] `RATE_LIMIT_WINDOW_MS=900000`
  - [ ] `RATE_LIMIT_MAX_REQUESTS=1000`
  - [ ] `UPLOAD_PATH=./uploads`
  - [ ] `MAX_FILE_SIZE=10485760`

- [ ] **Dependencias instaladas**
  ```bash
  cd backend
  npm install
  ```

- [ ] **Carpeta de uploads configurada**
  ```bash
  mkdir -p backend/uploads/expenses
  chmod 755 backend/uploads
  ```

- [ ] **Base de datos inicializada**
  ```bash
  cd backend
  npm run init-db
  ```

- [ ] **Usuario administrador creado**
  ```bash
  node backend/create-sample-data.js
  # O crear manualmente el primer usuario manager
  ```

---

## 🔌 VERIFICACIÓN DE RED Y CONECTIVIDAD

### Configuración de Red

- [ ] **IP del servidor identificada**
  - IP Pública: _______________________
  - IP Local: _______________________
  - Puerto: 7300

- [ ] **Firewall configurado**
  ```bash
  # Linux/Mac
  sudo ufw allow 7300/tcp
  
  # Windows (PowerShell como Admin)
  New-NetFirewallRule -DisplayName "EasyGastos Backend" -Direction Inbound -Protocol TCP -LocalPort 7300 -Action Allow
  ```

- [ ] **Puerto abierto y accesible**
  ```bash
  # Desde el mismo servidor
  curl http://localhost:7300/health
  
  # Desde otra máquina en la red
  curl http://IP_DEL_SERVIDOR:7300/health
  ```
  - Respuesta esperada: `{"status":"ok",...}`

- [ ] **Router configurado (si es necesario)**
  - [ ] Port forwarding: Puerto externo 7300 → IP local del servidor:7300
  - [ ] DMZ configurado (alternativa)

---

## 🚀 DEPLOYMENT DEL BACKEND

### Iniciar Servidor

- [ ] **Servidor inicia correctamente**
  ```bash
  cd backend
  npm start
  ```

- [ ] **Logs de inicio exitosos**
  - [ ] ✅ Base de datos inicializada correctamente
  - [ ] 🚀 Servidor EasyGastos ejecutándose en puerto 7300
  - [ ] 📋 Health check disponible
  - [ ] 📊 API Info disponible

- [ ] **Endpoints responden correctamente**
  ```bash
  # Health Check
  curl http://IP_SERVIDOR:7300/health
  
  # API Info
  curl http://IP_SERVIDOR:7300/api
  
  # Root endpoint
  curl http://IP_SERVIDOR:7300/
  ```

### Proceso Persistente (Producción)

- [ ] **PM2 instalado** (recomendado para producción)
  ```bash
  npm install -g pm2
  ```

- [ ] **Aplicación ejecutada con PM2**
  ```bash
  cd backend
  pm2 start ecosystem.config.js
  pm2 save
  pm2 startup
  ```

- [ ] **Auto-reinicio configurado**
  ```bash
  pm2 list  # Verificar que esté corriendo
  pm2 logs easygastos-backend  # Ver logs
  ```

---

## 📱 CONFIGURACIÓN DE LA APP MÓVIL

### Configuración Dinámica del Backend

- [ ] **URL del backend configurada**
  - Opción 1: Desde la app (Recomendado)
    1. Abrir app
    2. Ir a **Settings** → **Configurar Servidor Backend**
    3. Ingresar: `http://IP_SERVIDOR:7300`
    4. Probar conexión ✅
    5. Guardar

  - Opción 2: Hardcoded en código
    1. Editar `config/backend.ts`
    2. Cambiar `DEFAULT_URL`
    3. Recompilar app

- [ ] **Probar conexión desde la app**
  - [ ] Health check exitoso
  - [ ] Badge verde o mensaje de éxito

### Build de la App

- [ ] **Dependencias instaladas**
  ```bash
  npm install
  ```

- [ ] **Notificaciones configuradas**
  ```bash
  npm install expo-notifications@~0.30.7
  npx expo prebuild --clean
  ```

- [ ] **Build de desarrollo funcional**
  ```bash
  npx expo start
  ```
  - [ ] App carga sin errores
  - [ ] No hay warnings críticos

- [ ] **Build de producción** (si aplica)
  ```bash
  # Con EAS
  eas build --platform android
  eas build --platform ios
  
  # O compilación local
  npx expo run:android --variant release
  npx expo run:ios --configuration Release
  ```

---

## 🧪 TESTING FUNCIONAL

### Flujo Completo End-to-End

#### 1. Setup y Autenticación
- [ ] **Abrir app por primera vez**
- [ ] **Crear usuario nuevo** (Setup Screen)
  - [ ] Llenar todos los campos
  - [ ] PIN de 4 dígitos
  - [ ] Guardar exitosamente
- [ ] **Sincronizar usuario con backend**
  - [ ] Verificar en MongoDB que usuario existe
  - [ ] Login exitoso con JWT
- [ ] **Cerrar y reabrir app**
  - [ ] Pide PIN (Unlock Screen)
  - [ ] PIN correcto desbloquea app
  - [ ] PIN incorrecto muestra error

#### 2. Categorías
- [ ] **Crear categoría offline**
  - [ ] Guardar localmente
  - [ ] Aparece en lista inmediatamente
- [ ] **Sincronizar categorías**
  - [ ] Settings → Sincronizar
  - [ ] Verificar en MongoDB
  - [ ] needsSync cambia a 0

#### 3. Gastos
- [ ] **Crear gasto completo**
  - [ ] Llenar descripción, monto, fecha
  - [ ] Seleccionar categoría (¡debe verse bien contraste!)
  - [ ] Adjuntar imagen de factura
  - [ ] Llenar datos adicionales (serie, NIT, etc.)
  - [ ] Guardar como BORRADOR
  - [ ] Aparece en lista de gastos
- [ ] **Gasto sincroniza con backend**
  - [ ] Sin internet: queda marcado needsSync=1
  - [ ] Con internet: sincroniza automáticamente
  - [ ] Imagen se sube al servidor
  - [ ] Verificar en MongoDB
- [ ] **Crear gasto en modo offline**
  - [ ] Desactivar WiFi/Datos
  - [ ] Crear gasto
  - [ ] Guardar exitosamente
  - [ ] Activar conexión
  - [ ] Verificar sincronización automática

#### 4. Liquidaciones (Empleado)
- [ ] **Crear liquidación**
  - [ ] Seleccionar múltiples gastos
  - [ ] Ver total calculado correctamente
  - [ ] Guardar como borrador
  - [ ] Aparece en lista de liquidaciones
- [ ] **Enviar liquidación a manager**
  - [ ] Status cambia a "submitted"
  - [ ] Se sincroniza con backend
  - [ ] Manager recibe en su lista

#### 5. Liquidaciones (Manager)
- [ ] **Recibir notificación push**
  - [ ] Badge aparece en dashboard
  - [ ] Notification push llega
  - [ ] Tap en notificación abre Manager Approval
- [ ] **Revisar liquidación**
  - [ ] Ver lista de gastos incluidos
  - [ ] Ver detalles de cada gasto
  - [ ] Ver total
- [ ] **Aprobar liquidación**
  - [ ] Agregar comentarios
  - [ ] Aprobar
  - [ ] Status cambia a "approved"
  - [ ] Empleado recibe actualización
- [ ] **Descargar CSV** (si implementado)
  - [ ] Formato correcto
  - [ ] Todos los datos presentes

#### 6. Sincronización
- [ ] **Sync manual funciona**
  - [ ] Settings → Sincronizar
  - [ ] Mensaje de éxito
  - [ ] Timestamp actualizado
- [ ] **Sync automático funciona**
  - [ ] Cada 5 minutos (background)
  - [ ] Al abrir app
  - [ ] Después de crear elementos
- [ ] **Sync offline-first**
  - [ ] Elementos se guardan sin internet
  - [ ] Se sincronizan cuando vuelve internet
  - [ ] No se pierden datos

---

## 🔐 SEGURIDAD

### Autenticación y Autorización

- [ ] **JWT funciona correctamente**
  - [ ] Token se genera en login
  - [ ] Token válido 24 horas
  - [ ] Token inválido rechaza requests

- [ ] **PIN seguro**
  - [ ] Hasheado con bcrypt en backend
  - [ ] No se muestra en logs
  - [ ] Actualización funciona

- [ ] **Roles de usuario**
  - [ ] Employee puede crear gastos/liquidaciones
  - [ ] Manager puede aprobar/rechazar
  - [ ] Separación de permisos funciona

### Rate Limiting

- [ ] **Rate limiting configurado**
  - [ ] 1000 requests por 15 minutos
  - [ ] Respuesta 429 cuando excede límite

---

## 📊 MONITOREO Y LOGS

### Logs del Backend

- [ ] **Logs se generan correctamente**
  ```bash
  pm2 logs easygastos-backend
  # O si ejecutas con npm start
  # Los logs aparecen en consola
  ```

- [ ] **Logs de errores funcionan**
  - [ ] Errores 500 se loguean
  - [ ] Stack traces visibles en desarrollo
  - [ ] Errores ocultos en producción

### Logs de la App

- [ ] **Console logs visibles en desarrollo**
  ```bash
  npx expo start
  # Presionar 'j' para abrir debugger
  ```

- [ ] **Emojis de logs funcionan** 🔧 🌐 📡 ✅ ❌
  - Fácil filtrar por tipo de operación

---

## 🐛 MANEJO DE ERRORES

### Casos de Error Comunes

- [ ] **Sin conexión a internet**
  - [ ] App funciona 100% offline
  - [ ] Mensaje claro al usuario
  - [ ] Sync automático cuando vuelve conexión

- [ ] **Backend caído**
  - [ ] App no crashea
  - [ ] Mensaje: "No se puede conectar al servidor"
  - [ ] Datos locales accesibles

- [ ] **Base de datos no inicializada**
  - [ ] Auto-inicialización funciona
  - [ ] Timeout y retry implementados

- [ ] **Token expirado**
  - [ ] Re-login automático
  - [ ] Usuario no pierde contexto

- [ ] **Imagen muy grande**
  - [ ] Validación de tamaño (< 10MB)
  - [ ] Mensaje de error claro

---

## 📝 DOCUMENTACIÓN

### Documentos Actualizados

- [ ] **README.md actualizado**
  - [ ] Instrucciones de instalación
  - [ ] Comandos de deployment
  - [ ] Configuración de entorno

- [ ] **SISTEMA-COMPLETO-REVISION.md**
  - [ ] Endpoints documentados
  - [ ] Flujos actualizados
  - [ ] Arquitectura clara

- [ ] **DEPLOYMENT.md**
  - [ ] Pasos de deployment detallados
  - [ ] Troubleshooting común

- [ ] **Este checklist completado** ✅

---

## 🎯 VERIFICACIÓN FINAL

### Checklist de Última Hora

- [ ] **Backup de base de datos**
  ```bash
  mongodump --db easygastos --out ./backup-$(date +%Y%m%d)
  ```

- [ ] **Variables sensibles no expuestas**
  - [ ] .env en .gitignore
  - [ ] JWT_SECRET no hardcoded
  - [ ] IPs/passwords no en código

- [ ] **Versión etiquetada en git**
  ```bash
  git tag -a v1.0.0 -m "Release 1.0.0"
  git push origin v1.0.0
  ```

- [ ] **Plan de rollback preparado**
  - [ ] Backup de base de datos guardado
  - [ ] Versión anterior accesible
  - [ ] Procedimiento documentado

- [ ] **Contacto de soporte definido**
  - [ ] Quién responde issues
  - [ ] Horario de soporte
  - [ ] Canales de comunicación

---

## 🚦 GO / NO-GO DECISION

### Criterios Obligatorios (Must-Have)

- [ ] Backend responde en health check
- [ ] MongoDB conectado y funcional
- [ ] App se conecta al backend exitosamente
- [ ] Login funciona correctamente
- [ ] Crear y listar gastos funciona
- [ ] Modo offline funciona
- [ ] Sincronización básica funciona

### Criterios Deseables (Nice-to-Have)

- [ ] Notificaciones push funcionan
- [ ] Proceso persistente con PM2
- [ ] Logs de monitoreo configurados
- [ ] Rate limiting activo
- [ ] Backup automático configurado

### Decisión Final

**Estado:** ☐ GO para Deployment  ☐ NO-GO (revisar issues)

**Notas:**
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________

**Aprobado por:** _____________  
**Fecha:** _____________  
**Firma:** _____________  

---

## 📞 CONTACTOS DE EMERGENCIA

**Backend Issues:**  
Nombre: _____________  
Email: _____________  
Teléfono: _____________  

**Mobile App Issues:**  
Nombre: _____________  
Email: _____________  
Teléfono: _____________  

**Infrastructure/DevOps:**  
Nombre: _____________  
Email: _____________  
Teléfono: _____________  

---

**🎯 IMPORTANTE: No hacer deployment en viernes o antes de vacaciones. Siempre tener a alguien disponible para soporte post-deployment.**
