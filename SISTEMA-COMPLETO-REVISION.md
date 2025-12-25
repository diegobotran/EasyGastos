# 📋 REVISIÓN COMPLETA DEL SISTEMA EASYGASTOS

**Fecha:** 20 de Diciembre, 2025  
**Versión:** 1.0.0  
**Base de Datos:** MongoDB  

---

## 📱 RESUMEN EJECUTIVO

EasyGastos es una aplicación móvil **offline-first** de gestión de gastos empresariales construida con:
- **Frontend:** React Native + Expo SDK ~53.0.20
- **Backend:** Node.js + Express + MongoDB
- **Arquitectura:** Offline-first con sincronización bidireccional
- **Autenticación:** JWT + PIN de 4 dígitos

---

## 🏗️ ARQUITECTURA GENERAL

### Componentes Principales

```
┌─────────────────────────────────────────────────────────┐
│                    MOBILE APP                            │
│  (React Native + Expo)                                  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   SQLite/    │  │  AsyncStorage│  │   Services   │ │
│  │ AsyncStorage │  │   (Config)   │  │              │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         │                  │                  │         │
│         └──────────────────┴──────────────────┘         │
│                           │                              │
└───────────────────────────┼──────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │   HTTP/REST    │
                    │   API Calls    │
                    └───────┬────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│                  BACKEND SERVER                          │
│             (Node.js + Express)                          │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Routes     │  │  Middleware  │  │   Models     │ │
│  │   (API)      │  │   (Auth)     │  │  (MongoDB)   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         │                  │                  │         │
│         └──────────────────┴──────────────────┘         │
│                           │                              │
└───────────────────────────┼──────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │    MongoDB     │
                    │   Database     │
                    └────────────────┘
```

---

## 🔧 CONFIGURACIÓN DEL BACKEND

### 🎯 Sistema de Configuración Dinámica (NUEVO)

La app ahora permite cambiar la URL del backend **sin recompilar**:

#### Archivos de Configuración

1. **`config/backend.ts`** - Configuración dinámica con AsyncStorage
   ```typescript
   - getAPI_BASE_URL(): Promise<string> - Obtiene URL desde AsyncStorage o default
   - reloadBackendURL() - Limpia cache de URL
   - DEFAULT_URL: 'http://200.6.231.237:7300'
   ```

2. **`app/backend-config.tsx`** - Pantalla de configuración visual
   - Cambiar URL del servidor
   - Probar conexión antes de guardar
   - Presets rápidos (Local, Android Emulator, Producción)
   - Restaurar a valores por defecto

3. **`app/(tabs)/settings.tsx`** - Botón para acceder a configuración
   - Nuevo botón "Configurar Servidor Backend"
   - Navegación a `/backend-config`

#### Cómo Cambiar el Servidor

**Opción 1: Desde la App (Recomendado)**
1. Ir a **Settings** → **Configurar Servidor Backend**
2. Ingresar nueva URL: `http://tu-ip:puerto`
3. Presionar **"Probar Conexión"**
4. Si exitoso, presionar **"Guardar"**

**Opción 2: Manualmente (Desarrollo)**
1. Editar `config/backend.ts`:
   ```typescript
   DEFAULT_URL: 'http://tu-nueva-ip:puerto'
   ```
2. Recompilar la app

#### URLs Comunes

- **Producción:** `http://200.6.231.237:7300`
- **Local (PC):** `http://localhost:7300`
- **Android Emulator:** `http://10.0.2.2:7300` (apunta a localhost del host)
- **iOS Emulator:** `http://localhost:7300`
- **Red Local:** `http://192.168.x.x:7300` (IP de tu máquina en la red)

---

## 🔌 ENDPOINTS DEL BACKEND

### Base URL
```
http://200.6.231.237:7300
```

### 📍 Endpoints Disponibles

#### 1. Health Check
```
GET /health
Descripción: Verificar estado del servidor
Autenticación: No requerida
```

#### 2. Usuarios (`/api/users`)
```
POST   /api/users/register
  Body: { firstName, lastName, email, department, pin }
  Respuesta: { success: true, user: {...} }

POST   /api/users/login
  Body: { email, pin }
  Respuesta: { success: true, token: "jwt_token", user: {...} }

GET    /api/users/profile/:email
  Headers: Authorization: Bearer <token>
  Respuesta: { user: {...} }

PUT    /api/users/profile
  Headers: Authorization: Bearer <token>
  Body: { email, firstName, lastName, department, pin (opcional) }
  Respuesta: { success: true, user: {...} }

GET    /api/users/list
  Headers: Authorization: Bearer <token>
  Descripción: Listar todos los usuarios (solo managers)
```

#### 3. Categorías (`/api/categories`)
```
GET    /api/categories?userEmail=<email>
  Headers: Authorization: Bearer <token>
  Respuesta: [{ id, name, userEmail, createdAt, ... }]

POST   /api/categories
  Headers: Authorization: Bearer <token>
  Body: { name, userEmail, icon, color }
  Respuesta: { success: true, category: {...} }

PUT    /api/categories/:id
  Headers: Authorization: Bearer <token>
  Body: { name, icon, color }
  Respuesta: { success: true, category: {...} }

DELETE /api/categories/:id
  Headers: Authorization: Bearer <token>
  Respuesta: { success: true, message: "Categoría eliminada" }

GET    /api/categories/stats/:userEmail
  Headers: Authorization: Bearer <token>
  Respuesta: { totalCategories, categoriesWithExpenses, ... }
```

#### 4. Gastos (`/api/expenses`)
```
GET    /api/expenses?userEmail=<email>
  Headers: Authorization: Bearer <token>
  Respuesta: [{ id, description, amount, category, ... }]

POST   /api/expenses
  Headers: Authorization: Bearer <token>
  Body: { 
    description, amount, date, category, department,
    userEmail, imageuri, noinvoice, serie, supplier,
    vat_number, centro, cuenta, ordenco, totiva, currency
  }
  Respuesta: { success: true, expense: {...} }

GET    /api/expenses/pending-approval
  Headers: Authorization: Bearer <token>
  Query: ?managerEmail=<email>
  Respuesta: [{ id, status: 'pending', ... }]

PUT    /api/expenses/:id/status
  Headers: Authorization: Bearer <token>
  Body: { status: 'approved' | 'rejected' }
  Respuesta: { success: true, expense: {...} }

PUT    /api/expenses/:id/approve
  Headers: Authorization: Bearer <token>
  Body: { approved: true, managerComments: "..." }
  Respuesta: { success: true, expense: {...} }

GET    /api/expenses/stats/:userEmail
  Headers: Authorization: Bearer <token>
  Respuesta: { totalExpenses, totalAmount, byCategory, ... }
```

#### 5. Liquidaciones (`/api/liquidations`)
```
GET    /api/liquidations/user/:userEmail
  Headers: Authorization: Bearer <token>
  Respuesta: [{ id, status, expenses, ... }]

GET    /api/liquidations/manager/:managerEmail
  Headers: Authorization: Bearer <token>
  Respuesta: [{ id, status: 'submitted', ... }]

GET    /api/liquidations/:id
  Headers: Authorization: Bearer <token>
  Respuesta: { id, userEmail, expenses: [...], totalAmount, ... }

POST   /api/liquidations
  Headers: Authorization: Bearer <token>
  Body: {
    userEmail, managerEmail, expenseIds: [...],
    totalAmount, notes, status: 'draft' | 'submitted'
  }
  Respuesta: { success: true, liquidation: {...} }

PUT    /api/liquidations/:id/submit
  Headers: Authorization: Bearer <token>
  Respuesta: { success: true, liquidation: { status: 'submitted' } }

PUT    /api/liquidations/:id/approve
  Headers: Authorization: Bearer <token>
  Body: { managerComments: "..." }
  Respuesta: { success: true, liquidation: { status: 'approved' } }

PUT    /api/liquidations/:id/reject
  Headers: Authorization: Bearer <token>
  Body: { managerComments: "..." }
  Respuesta: { success: true, liquidation: { status: 'rejected' } }

DELETE /api/liquidations/:id
  Headers: Authorization: Bearer <token>
  Respuesta: { success: true, message: "Liquidación eliminada" }

GET    /api/liquidations/:id/csv
  Headers: Authorization: Bearer <token>
  Respuesta: CSV file download

PUT    /api/liquidations/:id
  Headers: Authorization: Bearer <token>
  Body: { expenseIds, totalAmount, notes, status }
  Respuesta: { success: true, liquidation: {...} }
```

#### 6. Links Manager-Empleado (`/api/manager-links`)
```
GET    /api/manager-links/employee/:email
  Headers: Authorization: Bearer <token>
  Respuesta: [{ managerEmail, employeeEmail, ... }]

GET    /api/manager-links/manager/:email
  Headers: Authorization: Bearer <token>
  Respuesta: [{ employeeEmail, ... }]

GET    /api/manager-links/direct-manager/:email
  Headers: Authorization: Bearer <token>
  Respuesta: { managerEmail: "..." }

GET    /api/manager-links/department/:department
  Headers: Authorization: Bearer <token>
  Respuesta: [{ email, firstName, lastName, ... }]

POST   /api/manager-links
  Headers: Authorization: Bearer <token>
  Body: { managerEmail, employeeEmail, department }
  Respuesta: { success: true, link: {...} }
```

#### 7. Sincronización (`/api/sync`)
```
POST   /api/sync/full-sync
  Headers: Authorization: Bearer <token>
  Body: { userEmail, categories: [...], expenses: [...] }
  Respuesta: { 
    success: true,
    categoriesSynced: 5,
    expensesSynced: 10
  }

POST   /api/sync/upload
  Headers: Authorization: Bearer <token>
  Body: { userEmail, data: {...} }
  Respuesta: { success: true }

GET    /api/sync/logs/:userEmail
  Headers: Authorization: Bearer <token>
  Respuesta: [{ timestamp, action, status, ... }]

GET    /api/sync/status/:userEmail
  Headers: Authorization: Bearer <token>
  Respuesta: { 
    lastSync: "2025-12-20T10:00:00Z",
    pendingItems: 3
  }
```

#### 8. Uploads (`/api/uploads`)
```
POST   /api/uploads
  Headers: 
    Authorization: Bearer <token>
    Content-Type: multipart/form-data
  Body: FormData with 'file' field
  Respuesta: { 
    success: true,
    url: "http://server/uploads/filename.jpg",
    filename: "filename.jpg"
  }

POST   /api/uploads/expense-image
  Headers: 
    Authorization: Bearer <token>
    Content-Type: multipart/form-data
  Body: FormData with:
    - file: imagen
    - expenseId: string
  Respuesta: { 
    success: true,
    url: "http://server/uploads/expenses/expenseId.jpg"
  }
```

---

## 📊 FLUJOS DE USUARIO

### 1. 🔐 Flujo de Autenticación

```
┌─────────────┐
│   Splash    │
│   Screen    │
└──────┬──────┘
       │
       ▼
┌─────────────┐      No     ┌─────────────┐
│  ¿Usuario   │────────────▶│   Setup     │
│  Existe?    │             │   Screen    │
└──────┬──────┘             └──────┬──────┘
       │ Sí                        │
       │                           │ Registro
       │                           │
       ▼                           ▼
┌─────────────┐             ┌─────────────┐
│   Unlock    │◀────────────│  Guardar    │
│   Screen    │             │  Usuario    │
│  (PIN 4dig) │             └─────────────┘
└──────┬──────┘
       │ PIN Correcto
       ▼
┌─────────────┐
│  Dashboard  │
│   (Tabs)    │
└─────────────┘
```

**Archivos involucrados:**
- `app/_layout.tsx` - Router principal
- `app/setup.tsx` - Registro de usuario
- `app/unlock.tsx` - Pantalla de PIN
- `app/(tabs)/dashboard.tsx` - Dashboard principal
- `services/AuthService.ts` - Lógica de autenticación
- `hooks/useSetupViewModel.ts` - ViewModel de setup

---

### 2. 💰 Flujo de Gastos (Offline-First)

```
┌─────────────────┐
│  Nuevo Gasto    │
│  (add-expense)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│ Llenar Datos +  │─────▶│  Adjuntar    │
│ Categoría       │      │  Factura     │
└────────┬────────┘      └──────┬───────┘
         │                      │
         │◀─────────────────────┘
         │
         ▼
┌─────────────────┐
│  Guardar Local  │ ✅ INMEDIATO
│  SQLite/Storage │ Usuario ve confirmación
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ¿Conexión       │
│ Internet?       │
└────────┬────────┘
         │
    ┌────┴────┐
    │ Sí      │ No
    ▼         ▼
┌──────┐  ┌──────────────┐
│ Sync │  │ Marcar como  │
│ Auto │  │ needsSync=1  │
└──────┘  └──────┬───────┘
                 │
                 ▼
          ┌──────────────┐
          │ Sync cuando  │
          │ haya Internet│
          └──────────────┘
```

**Archivos involucrados:**
- `app/add-expense.tsx` - Formulario de gastos
- `services/ExpenseService.ts` - CRUD local de gastos
- `services/BackendSyncService.ts` - Sincronización con backend
- `models/Expense.ts` - Modelo de datos

**Estados de un Gasto:**
- `BORRADOR` - Guardado localmente, no enviado
- `ENVIADO_JEFE` - Enviado al manager (local)
- `APROBADO` - Aprobado por manager (backend)
- `RECHAZADO` - Rechazado por manager (backend)

---

### 3. 📦 Flujo de Liquidaciones

```
EMPLEADO                          MANAGER
┌─────────────────┐
│ Seleccionar     │
│ Gastos para     │
│ Liquidación     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Crear Borrador  │
│ status: draft   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Enviar a Jefe   │
│ status:submitted│────────┐
└─────────────────┘        │
                           │
                           ▼
                    ┌─────────────────┐
                    │ Recibe Push     │
                    │ Notification    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Revisar         │
                    │ Liquidación     │
                    └────────┬────────┘
                             │
                        ┌────┴────┐
                        │         │
                     Aprobar  Rechazar
                        │         │
         ┌──────────────┘         └──────────────┐
         ▼                                       ▼
┌─────────────────┐                    ┌─────────────────┐
│ status:approved │                    │ status:rejected │
│ Descarga CSV    │                    │ Puede reenviar  │
└─────────────────┘                    └─────────────────┘
```

**Archivos involucrados:**
- `app/(tabs)/liquidations.tsx` - Lista de liquidaciones
- `app/liquidation-detail.tsx` - Detalle y envío
- `app/manager-approval.tsx` - Aprobación por manager
- `services/LiquidationService.ts` - CRUD local
- `services/NotificationService.ts` - Push notifications
- `hooks/useManagerSync.ts` - Sincronización manager

**Estados de Liquidación:**
- `draft` - Borrador del empleado
- `submitted` - Enviada al manager (pendiente)
- `approved` - Aprobada por manager
- `rejected` - Rechazada por manager

---

### 4. 🔄 Flujo de Sincronización

```
┌─────────────────────────────────────────┐
│        SINCRONIZACIÓN AUTOMÁTICA        │
└─────────────────────────────────────────┘

EMPLEADO:
┌─────────────────┐
│ Al abrir app    │───▶ Sincroniza categorías y gastos
└─────────────────┘

┌─────────────────┐
│ Cada 5 minutos  │───▶ Sync en background
└─────────────────┘

┌─────────────────┐
│ Manual (botón)  │───▶ Settings → Sincronizar
└─────────────────┘

MANAGER:
┌─────────────────┐
│ Cada 5 minutos  │───▶ Verifica liquidaciones pendientes
└─────────────────┘       │
                         ▼
                  ┌──────────────┐
                  │ ¿Hay nuevas? │
                  └──────┬───────┘
                         │ Sí
                         ▼
                  ┌──────────────┐
                  │ Push Notif   │
                  │ + Badge      │
                  └──────────────┘

PROCESO DE SYNC:
1. checkConnection() ─────▶ ¿Backend disponible?
2. loginAndGetToken() ────▶ Obtener JWT
3. syncExpenses() ────────▶ Subir gastos con needsSync=1
4. syncCategories() ──────▶ Subir categorías nuevas
5. downloadExpenses() ────▶ Descargar actualizaciones
6. syncLiquidations() ────▶ Bidireccional
```

**Archivos involucrados:**
- `services/BackendSyncService.ts` - Todas las operaciones de sync
- `hooks/useManagerSync.ts` - Sync automático de managers
- `app/_layout.tsx` - Inicialización de sync en app start

---

## 🗄️ BASE DE DATOS

### MongoDB Collections

#### 1. `users`
```javascript
{
  _id: ObjectId,
  email: String (unique, indexed),
  firstName: String,
  lastName: String,
  department: String,
  pin: String (hashed with bcrypt),
  role: String ('employee' | 'manager'),
  createdAt: Date,
  updatedAt: Date,
  isActive: Boolean
}
```

#### 2. `categories`
```javascript
{
  _id: ObjectId,
  id: String (UUID, indexed),
  name: String,
  userEmail: String (indexed),
  icon: String,
  color: String,
  createdAt: Date,
  updatedAt: Date,
  isDeleted: Boolean
}
```

#### 3. `expenses`
```javascript
{
  _id: ObjectId,
  id: String (UUID, indexed),
  description: String,
  amount: Number,
  date: Date,
  category: String,
  department: String,
  userEmail: String (indexed),
  imageuri: String,
  noinvoice: String,
  serie: String,
  supplier: String,
  vat_number: String,
  centro: String,
  cuenta: String,
  ordenco: String,
  totiva: Number,
  currency: String,
  status: String ('BORRADOR', 'ENVIADO_JEFE', 'APROBADO', 'RECHAZADO'),
  notes: String,
  createdAt: Date,
  updatedAt: Date
}
```

#### 4. `liquidations`
```javascript
{
  _id: ObjectId,
  id: String (UUID, indexed),
  userEmail: String (indexed),
  managerEmail: String (indexed),
  expenseIds: [String],
  expenses: [Object], // Denormalized expense data
  totalAmount: Number,
  status: String ('draft', 'submitted', 'approved', 'rejected'),
  submittedAt: Date,
  reviewedAt: Date,
  managerComments: String,
  notes: String,
  createdAt: Date,
  updatedAt: Date
}
```

#### 5. `manager_employee_links`
```javascript
{
  _id: ObjectId,
  managerEmail: String (indexed),
  employeeEmail: String (indexed),
  department: String,
  createdAt: Date,
  isActive: Boolean
}
```

### SQLite Local (Mobile)

Las mismas estructuras se replican en SQLite local con columna adicional:
- `needsSync`: INTEGER (0 o 1) - Indica si necesita sincronizar

---

## 🔐 SEGURIDAD

### Autenticación JWT
- Token generado en login: `POST /api/users/login`
- Válido por 24 horas
- Incluye: `{ userId, email, role }`
- Header requerido: `Authorization: Bearer <token>`

### PIN de 4 dígitos
- Almacenado con bcrypt (10 rounds)
- Validación local primero (offline)
- Sincronización con backend al actualizar

### Middleware de Autenticación
```javascript
// backend/middleware/auth.js
- authenticateToken() - Verifica JWT válido
- requireManager() - Solo managers
- canAccessUserData() - Acceso a propios datos
```

---

## 📦 DEPENDENCIAS CLAVE

### Frontend (Mobile)
```json
{
  "expo": "~53.0.20",
  "react-native": "0.79.5",
  "expo-router": "~5.1.4",
  "expo-sqlite": "latest",
  "@react-native-async-storage/async-storage": "^2.2.0",
  "expo-notifications": "~0.30.7",
  "@react-native-picker/picker": "2.10.0",
  "@react-native-ml-kit/text-recognition": "^2.0.0"
}
```

### Backend
```json
{
  "express": "^4.18.2",
  "mongodb": "^6.3.0",
  "jsonwebtoken": "^9.0.2",
  "bcrypt": "^5.1.1",
  "cors": "^2.8.5",
  "helmet": "^7.1.0",
  "express-rate-limit": "^7.1.5",
  "multer": "^1.4.5-lts.1",
  "dotenv": "^17.2.3"
}
```

---

## 🚀 DEPLOYMENT

### Variables de Entorno Backend (.env)

```bash
# Entorno
NODE_ENV=production

# Puerto
PORT=7300

# MongoDB
MONGODB_URI=mongodb://localhost:27017/easygastos

# CORS (en producción permite todo)
ALLOWED_ORIGINS=

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# JWT
JWT_SECRET=tu_jwt_secret_super_seguro_aqui

# Uploads
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# Network
BIND_IP=0.0.0.0
```

### Comandos de Deployment

#### Backend
```bash
cd backend
npm install
npm run init-db      # Inicializar MongoDB
npm start            # Producción
npm run dev          # Desarrollo con nodemon
```

#### Mobile App
```bash
npm install
npx expo start       # Desarrollo
npx expo prebuild    # Preparar para compilación nativa
eas build            # Build con EAS
```

### Checklist Pre-Deployment

- [ ] Configurar URL del backend en la app
- [ ] Verificar MongoDB esté corriendo
- [ ] Configurar variables de entorno (.env)
- [ ] Generar JWT_SECRET seguro
- [ ] Configurar CORS apropiadamente
- [ ] Verificar permisos de carpeta `uploads/`
- [ ] Probar conexión: `GET /health`
- [ ] Crear usuario admin inicial
- [ ] Probar flujo completo end-to-end
- [ ] Configurar PM2 para proceso persistente

---

## 🧪 TESTING

### Endpoints de Prueba

```bash
# Health Check
curl http://200.6.231.237:7300/health

# Registro de Usuario
curl -X POST http://200.6.231.237:7300/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "firstName": "Test",
    "lastName": "User",
    "department": "IT",
    "pin": "1234"
  }'

# Login
curl -X POST http://200.6.231.237:7300/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "pin": "1234"
  }'
```

### Flujo de Test Completo

1. **Setup Inicial**
   - Abrir app → Setup screen
   - Crear usuario "Test User"
   - Verificar PIN funciona

2. **Crear Categoría**
   - Ir a Categories
   - Agregar "Transporte"
   - Verificar se guarda local
   - Sincronizar manualmente

3. **Crear Gasto**
   - Add Expense
   - Llenar datos + adjuntar imagen
   - Guardar como BORRADOR
   - Verificar aparece en lista

4. **Crear Liquidación**
   - Seleccionar gastos
   - Crear liquidación
   - Enviar a manager
   - Verificar status: submitted

5. **Aprobación Manager**
   - Login como manager
   - Ver notificación push
   - Aprobar liquidación
   - Descargar CSV

---

## 📝 NOTAS IMPORTANTES

### Offline-First
- **SIEMPRE** guardar localmente primero
- Mostrar feedback al usuario inmediatamente
- Sincronizar en background sin bloquear UI
- Marcar elementos con `needsSync=1`

### Sincronización
- No intentar sync si no hay conexión
- Usar timeouts (5s health check, 10s endpoints)
- Manejar conflictos (backend gana)
- Log exhaustivo para debugging

### Notificaciones
- Solo managers reciben notificaciones
- Frecuencia: máximo cada 30 minutos
- Badge se limpia al abrir screen
- Tap en notificación → manager-approval

### Seguridad
- JWT válido 24 horas
- PIN hasheado con bcrypt
- Rate limiting: 1000 req/15min
- CORS configurado según entorno

---

## 🐛 DEBUGGING

### Logs Útiles

```typescript
// Backend Sync
console.log('🌐 BackendSync: ...') 
console.log('📡 BackendSync: ...')
console.log('✅ BackendSync: ...')
console.log('❌ BackendSync: ...')

// Database
console.log('💾 ExpenseService: ...')
console.log('📂 CategoryService: ...')

// Notifications
console.log('🔔 NotificationService: ...')
console.log('📊 ManagerSync: ...')
```

### Problemas Comunes

1. **"Database not initialized"**
   - Solución: Auto-init implementado en services

2. **"No se puede conectar al backend"**
   - Verificar URL correcta
   - Verificar servidor corriendo
   - Verificar firewall/red

3. **"Token inválido"**
   - Re-login para obtener nuevo token
   - Verificar JWT_SECRET coincide

4. **"Gastos no sincroniz an"**
   - Verificar `needsSync=1`
   - Verificar conexión a internet
   - Revisar logs de sync

---

## 📞 CONTACTO Y SOPORTE

**Desarrollador:** GitHub Copilot  
**Fecha de Documento:** 20 Diciembre 2025  
**Versión:** 1.0.0  

---

**🎯 Este documento debe actualizarse con cada cambio significativo en la arquitectura o flujos de la aplicación.**
