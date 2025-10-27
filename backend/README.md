# EasyGastos Backend API

Backend REST API para el sistema de gestión de gastos empresariales EasyGastos.

## 🏗️ Arquitectura

- **Base de Datos**: MongoDB
- **Framework**: Node.js + Express
- **Autenticación**: PIN encriptado con bcrypt
- **Validación**: express-validator
- **Logging**: morgan + logs de sincronización personalizados

## 📦 Instalación

### Prerrequisitos

1. **Node.js** (v16 o superior)
2. **MongoDB** (v5.0 o superior) ejecutándose en `localhost:27017`

### Configuración Rápida

1. **Windows**:

   ```bash
   cd backend
   setup.bat
   ```

2. **Linux/Mac**:
   ```bash
   cd backend
   chmod +x setup.sh
   ./setup.sh
   ```

### Instalación Manual

```bash
cd backend
npm install
npm start
```

## 🚀 Ejecución

### 🧪 **Para Desarrollo Local:**

```bash
# Desarrollo (con auto-reload)
npm run dev

# O una sola vez para testing
npm start
```

### 🌐 **Para Producción (DEPLOYMENT):**

**❌ NO usar `npm start` en producción** - se cierra cuando cierras la terminal

**✅ Usar PM2 para background:**

```bash
# 1. Instalar PM2 globalmente
sudo npm install -g pm2

# 2. Iniciar con PM2 (en background)
pm2 start ecosystem.config.js

# 3. Configurar auto-inicio
pm2 startup
pm2 save

# 4. Ver estado
pm2 status

# 5. Ver logs en tiempo real
pm2 logs easygastos-backend

# 6. Reiniciar si es necesario
pm2 restart easygastos-backend

# 7. Detener
pm2 stop easygastos-backend
```

### 🔧 **Scripts de Deployment Automatizado:**

```bash
# Para Linux - deployment completo con PM2
./deploy.sh

# Verificar configuración antes del deployment
./check-deployment.sh

# Obtener IP pública para configurar la app
./get-public-ip.sh

# Crear usuario administrador inicial
./setup-admin.sh
```

El servidor estará disponible en `http://localhost:3000`

## 📊 Base de Datos MongoDB

### Configuración

- **Host**: `localhost:27017`
- **Database**: `easygastos`
- **Conexión**: `mongodb://localhost:27017/easygastos`

### Collections

#### `users`

```javascript
{
  email: String (unique),
  firstName: String,
  lastName: String,
  pin: String (encrypted),
  department: String,
  managerEmail: String,
  isManager: Boolean,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date,
  lastLoginAt: Date
}
```

#### `categories`

```javascript
{
  id: String (UUID),
  userEmail: String,
  name: String,
  icon: String,
  centro: String,
  cuenta: String,
  ordenco: String,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

#### `expenses`

```javascript
{
  id: String (UUID),
  userEmail: String,
  description: String,
  amount: Number,
  date: String,
  category: String,
  status: String,
  supplier: String,
  vat_number: String,
  department: String,
  notes: String,
  noinvoice: String,
  serie: String,
  centro: String,
  cuenta: String,
  ordenco: String,
  managerEmail: String,
  imageuri: String,
  totiva: Number,
  currency: String,
  approvalComments: String,
  approvedAt: Date,
  approvedBy: String,
  rejectedAt: Date,
  rejectedBy: String,
  createdAt: Date,
  updatedAt: Date
}
```

#### `sync_logs`

```javascript
{
  userEmail: String,
  entityType: String,
  entityId: String,
  action: String,
  success: Boolean,
  errorMessage: String,
  createdAt: Date
}
```

## 🛠️ API Endpoints

### Health Check

```
GET /health
```

### Usuarios

```
POST   /api/users/register      # Registrar usuario
PUT    /api/users/profile       # Actualizar perfil
POST   /api/users/login         # Autenticar usuario
GET    /api/users/profile/:email # Obtener perfil
GET    /api/users/list          # Listar usuarios (managers)
```

### Categorías

```
POST   /api/categories          # Crear categoría
GET    /api/categories          # Obtener categorías por usuario
PUT    /api/categories/:id      # Actualizar categoría
DELETE /api/categories/:id      # Eliminar categoría (soft delete)
GET    /api/categories/stats/:userEmail # Estadísticas
```

### Gastos

```
POST   /api/expenses            # Crear gasto
GET    /api/expenses            # Obtener gastos por usuario
GET    /api/expenses/pending-approval # Gastos pendientes (managers)
PUT    /api/expenses/:id/status # Actualizar estado
PUT    /api/expenses/:id/approve # Aprobar/Rechazar gasto
GET    /api/expenses/stats/:userEmail # Estadísticas
```

### Sincronización

```
POST   /api/sync/full-sync      # Sincronización completa
POST   /api/sync/upload         # Subir datos desde app
GET    /api/sync/logs/:userEmail # Logs de sincronización
GET    /api/sync/status/:userEmail # Estado de sincronización
```

## 🔐 Autenticación

### Registro de Usuario

```javascript
POST /api/users/register
{
  "email": "usuario@empresa.com",
  "firstName": "Juan",
  "lastName": "Pérez",
  "pin": "1234",
  "department": "Ventas"
}
```

### Login

```javascript
POST /api/users/login
{
  "email": "usuario@empresa.com",
  "pin": "1234"
}
```

## 🔄 Flujo de Sincronización

### 1. Registro Offline-First

1. App registra usuario localmente
2. Backend recibe sincronización cuando hay internet
3. Backend asigna manager basado en departamento
4. App recibe confirmación y actualiza datos locales

### 2. Sincronización de Categorías

1. App crea categorías offline
2. Backend recibe y procesa categorías
3. Backend devuelve categorías actualizadas de otros dispositivos

### 3. Flujo de Gastos y Aprobación

1. Usuario crea gasto (estado: `BORRADOR`)
2. Usuario envía gasto (estado: `ENVIADO_JEFE`)
3. Manager recibe notificación
4. Manager aprueba/rechaza (estado: `APROBADO_JEFE`/`RECHAZADO_JEFE`)
5. Finanzas procesa (estado: `APROBADO_FINANZAS`/`RECHAZADO_FINANZAS`)
6. Contabilidad registra (estado: `CONTABILIZADO`)

## 📈 Estados de Gastos

```javascript
const STATUSES = {
  BORRADOR: "Borrador",
  ENVIADO_JEFE: "Enviado al Jefe",
  APROBADO_JEFE: "Aprobado por Jefe",
  RECHAZADO_JEFE: "Rechazado por Jefe",
  APROBADO_FINANZAS: "Aprobado por Finanzas",
  RECHAZADO_FINANZAS: "Rechazado por Finanzas",
  CONTABILIZADO: "Contabilizado en SAP",
  ERROR_SAP: "Error en SAP",
};
```

## 🛡️ Seguridad

- **Rate Limiting**: 100 requests por IP cada 15 minutos
- **CORS**: Configurado para permitir solicitudes desde la app móvil
- **Helmet**: Headers de seguridad HTTP
- **Validación**: Todos los inputs son validados y sanitizados
- **PIN Encryption**: PINs encriptados con bcrypt

## 📝 Logs

Los logs de sincronización se guardan en la collection `sync_logs` con:

- Tipo de entidad (USER, CATEGORY, EXPENSE, etc.)
- Acción realizada (CREATE, UPDATE, DELETE, SYNC, etc.)
- Resultado (success/error)
- Timestamp

## 🔧 Configuración de Red

Para acceder desde dispositivos móviles en la misma red:

1. Obtener IP local del servidor:

   ```bash
   ipconfig  # Windows
   ifconfig  # Linux/Mac
   ```

2. Configurar la IP en la app móvil (Settings)

3. Asegurar que el firewall permite conexiones al puerto 3000

## 📱 Integración con App Móvil

La app móvil debe configurar la IP del backend en:

- **Settings** → **Configuración IP**
- Usar PIN local para proteger la configuración
- Ejemplo: `192.168.1.100:3000`

## 🐛 Troubleshooting

### MongoDB no conecta

```bash
# Verificar que MongoDB esté ejecutándose
mongosh  # o mongo en versiones anteriores

# En Windows, iniciar servicio
net start MongoDB

# Verificar puerto
netstat -an | findstr :27017
```

### App no puede conectar al backend

1. Verificar IP local del servidor
2. Verificar firewall
3. Probar health check: `http://IP:3000/health`
4. Verificar CORS en server.js

### Errores de sincronización

- Revisar logs en `/api/sync/logs/:userEmail`
- Verificar validación de datos
- Comprobar estado de MongoDB
