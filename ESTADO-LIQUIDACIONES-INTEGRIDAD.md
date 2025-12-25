# Sistema de Integridad de Estados de Liquidaciones

## 📋 Resumen Ejecutivo

Este documento describe el sistema completo de integridad de estados de liquidaciones implementado en EasyGastos, garantizando que:

1. ✅ **Liquidaciones en revisión (submitted) NO se pueden modificar**
2. ✅ **Solo liquidaciones aprobadas (approved) pueden generar CSV**
3. ✅ **Tracking completo de aprobadores y rechazadores**
4. ✅ **Notificaciones automáticas al usuario cuando su liquidación cambia de estado**
5. ✅ **Validación en múltiples capas (UI, servicio local, backend)**

---

## 🔄 Máquina de Estados

```
draft (Borrador)
   ↓ [Enviar al Jefe]
submitted (En Revisión) ← **INMUTABLE** - NO se puede editar
   ↓                    ↓
approved (Aprobada)   rejected (Rechazada)
   ↓                    ↓ [Corregir y Reenviar]
[Generar CSV]         draft (vuelta a borrador editable)
```

### Estados y Comportamiento

| Estado | Puede Editar | Puede Enviar | Puede Generar CSV | Color | Descripción |
|--------|--------------|--------------|-------------------|-------|-------------|
| **draft** | ✅ SÍ | ✅ SÍ | ❌ NO | 🟠 Naranja | Borrador, usuario puede modificar |
| **submitted** | ❌ **NO** | ❌ NO | ❌ NO | 🔵 Azul | En revisión del jefe, **INMUTABLE** |
| **approved** | ❌ **NO** | ❌ NO | ✅ **SÍ** | 🟢 Verde | Aprobada, solo puede generar CSV |
| **rejected** | ✅ SÍ | ✅ SÍ | ❌ NO | 🔴 Rojo | Rechazada, usuario puede corregir |

---

## 🔒 Validaciones de Integridad

### 1. Validación en UI (Nivel Cliente)

**Archivo:** `app/liquidation-detail.tsx`

#### Controles Visuales:
```typescript
const canEdit = canEditLiquidation(liquidation.status); // true solo si draft/rejected
const canSubmit = canSubmitLiquidation(liquidation.status); // true solo si draft/rejected
const canDownloadCSV = canGenerateCSV(liquidation.status); // true solo si approved
```

#### Banners de Estado:

**Liquidación Rechazada (Editable):**
```tsx
{liquidation.status === 'rejected' && (
  <View style={styles.rejectedBanner}>
    <Text>❌ Esta liquidación fue rechazada</Text>
    <Text>Puede editar los gastos, agregar más o eliminarlos</Text>
  </View>
)}
```

**Liquidación en Revisión (INMUTABLE):**
```tsx
{liquidation.status === 'submitted' && (
  <View style={styles.submittedBanner}>
    <Text>⏳ En Revisión</Text>
    <Text>No se puede modificar hasta que sea aprobada o rechazada</Text>
  </View>
)}
```

**Liquidación Aprobada (Solo CSV):**
```tsx
{liquidation.status === 'approved' && (
  <View style={styles.approvedBanner}>
    <Text>✅ ¡Liquidación Aprobada!</Text>
    <Text>Ya puede generar el archivo CSV</Text>
    <TouchableOpacity onPress={handleDownloadCSV}>
      <Text>Descargar CSV</Text>
    </TouchableOpacity>
  </View>
)}
```

---

### 2. Validación en Servicios (Nivel Local)

**Archivo:** `services/LiquidationService.ts`

#### Funciones con Validación Estricta:

**Agregar Gasto a Liquidación:**
```typescript
export const addExpenseToLiquidation = async (
  liquidationId: string,
  expenseId: string,
  userId: string
): Promise<void> => {
  const liquidation = await getLiquidationById(liquidationId, userId);
  
  // VALIDACIÓN: Solo draft/rejected pueden editarse
  if (liquidation.status !== 'draft' && liquidation.status !== 'rejected') {
    throw new Error(
      `No se puede modificar una liquidación en estado "${liquidation.status}". 
       Solo liquidaciones en borrador o rechazadas pueden editarse.`
    );
  }
  // ... resto del código
};
```

**Eliminar Gasto de Liquidación:**
```typescript
export const removeExpenseFromLiquidation = async (
  liquidationId: string,
  expenseId: string,
  userId: string
): Promise<void> => {
  const liquidation = await getLiquidationById(liquidationId, userId);
  
  // VALIDACIÓN: Solo draft/rejected pueden editarse
  if (!canEditLiquidation(liquidation.status)) {
    throw new Error(
      `No se puede modificar una liquidación ${getLiquidationStatusText(liquidation.status)}. 
       Solo liquidaciones en borrador o rechazadas pueden editarse.`
    );
  }
  // ... resto del código
};
```

**Enviar Liquidación al Jefe:**
```typescript
export const submitLiquidation = async (
  liquidationId: string,
  userId: string
): Promise<Liquidation> => {
  const liquidation = await getLiquidationById(liquidationId, userId);
  
  // VALIDACIÓN: Solo draft/rejected pueden enviarse
  if (!canSubmitLiquidation(liquidation.status)) {
    throw new Error(
      `No se puede enviar una liquidación en estado "${liquidation.status}". 
       Solo liquidaciones en borrador o rechazadas pueden ser enviadas.`
    );
  }
  
  // VALIDACIÓN: Mínimo 1 gasto
  if (liquidation.expenseIds.length === 0) {
    throw new Error('La liquidación debe contener al menos un gasto');
  }
  
  // ... resto del código
};
```

**Actualizar Estado (Manager):**
```typescript
export const updateLiquidationStatus = async (
  liquidationId: string,
  newStatus: LiquidationStatus,
  managerComments?: string
): Promise<void> => {
  const liquidation = await getLiquidationById(liquidationId);
  
  // VALIDACIÓN: Solo submitted → approved/rejected
  if (liquidation.status !== 'submitted' && 
      (newStatus === 'approved' || newStatus === 'rejected')) {
    throw new Error(
      `No se puede cambiar el estado de una liquidación "${liquidation.status}" 
       a "${newStatus}". Solo liquidaciones en revisión pueden aprobarse o rechazarse.`
    );
  }
  // ... resto del código
};
```

---

### 3. Validación en Backend (Nivel Servidor)

**Archivo:** `backend/routes/liquidations.js`

#### Endpoint: Enviar Liquidación (Submit)

```javascript
router.put('/:id/submit', authenticateToken, async (req, res) => {
  const liquidation = await Liquidation.findOne({ id: req.params.id });
  
  // VALIDACIÓN ESTRICTA: Solo draft/rejected pueden enviarse
  if (liquidation.status === 'submitted') {
    return res.status(400).json({ 
      error: 'Esta liquidación ya fue enviada y está en revisión. No se puede reenviar.' 
    });
  }
  
  if (liquidation.status === 'approved') {
    return res.status(400).json({ 
      error: 'Esta liquidación ya fue aprobada. No se puede modificar ni reenviar.' 
    });
  }
  
  // Validar mínimo 1 gasto
  if (!liquidation.expenseIds || liquidation.expenseIds.length === 0) {
    return res.status(400).json({ 
      error: 'La liquidación debe contener al menos un gasto' 
    });
  }
  
  // Actualizar estado
  liquidation.status = 'submitted';
  liquidation.submittedDate = new Date().toISOString().split('T')[0];
  await liquidation.save();
  
  console.log(`✅ Liquidación ${liquidation.id} enviada a revisión`);
  res.json(liquidation);
});
```

#### Endpoint: Aprobar Liquidación (Manager)

```javascript
router.put('/:id/approve', 
  authenticateToken, 
  requireManager,
  async (req, res) => {
    const liquidation = await Liquidation.findOne({ id: req.params.id });
    
    // VALIDACIÓN ESTRICTA: Solo submitted puede aprobarse
    if (liquidation.status !== 'submitted') {
      const statusText = liquidation.status === 'draft' ? 'borrador (no enviada)' :
                        liquidation.status === 'approved' ? 'ya aprobada' :
                        liquidation.status === 'rejected' ? 'rechazada' : 'desconocido';
      console.log(`⚠️ Intento de aprobar liquidación ${id} en estado ${liquidation.status}`);
      return res.status(400).json({ 
        error: `No se puede aprobar una liquidación en estado "${statusText}". 
                Solo liquidaciones en revisión pueden ser aprobadas.` 
      });
    }
    
    // Actualizar estado y tracking
    liquidation.status = 'approved';
    liquidation.approvedDate = new Date().toISOString().split('T')[0];
    liquidation.approverEmail = req.user.email; // 🔍 TRACKING
    liquidation.managerComments = req.body.managerComments || null;
    
    await liquidation.save();
    
    // Actualizar gastos a 'approved'
    await Expense.updateMany(
      { id: { $in: liquidation.expenseIds } },
      { $set: { expenseStatus: 'approved' } }
    );
    
    console.log(`✅ Liquidación ${id} aprobada por ${req.user.email}`);
    console.log(`   - Gastos actualizados: ${updateResult.modifiedCount}`);
    console.log(`   - Total aprobado: Q${liquidation.totalAmount}`);
    
    res.json(liquidation);
});
```

#### Endpoint: Rechazar Liquidación (Manager)

```javascript
router.put('/:id/reject', 
  authenticateToken, 
  requireManager,
  async (req, res) => {
    const liquidation = await Liquidation.findOne({ id: req.params.id });
    
    // VALIDACIÓN ESTRICTA: Solo submitted puede rechazarse
    if (liquidation.status !== 'submitted') {
      const statusText = liquidation.status === 'draft' ? 'borrador (no enviada)' :
                        liquidation.status === 'approved' ? 'ya aprobada' :
                        liquidation.status === 'rejected' ? 'ya rechazada' : 'desconocido';
      console.log(`⚠️ Intento de rechazar liquidación ${id} en estado ${liquidation.status}`);
      return res.status(400).json({ 
        error: `No se puede rechazar una liquidación en estado "${statusText}". 
                Solo liquidaciones en revisión pueden ser rechazadas.` 
      });
    }
    
    // Validar que incluya comentarios
    if (!req.body.managerComments) {
      return res.status(400).json({ 
        error: 'Debe incluir un comentario al rechazar la liquidación' 
      });
    }
    
    // Actualizar estado y tracking
    liquidation.status = 'rejected';
    liquidation.rejectedDate = new Date().toISOString().split('T')[0];
    liquidation.rejectedBy = req.user.email; // 🔍 TRACKING
    liquidation.managerComments = req.body.managerComments;
    
    await liquidation.save();
    
    // Devolver gastos a 'in_liquidation' (usuario puede editarlos)
    await Expense.updateMany(
      { id: { $in: liquidation.expenseIds } },
      { $set: { expenseStatus: 'in_liquidation' } }
    );
    
    console.log(`❌ Liquidación ${id} rechazada por ${req.user.email}`);
    console.log(`   - Razón: ${req.body.managerComments}`);
    
    res.json(liquidation);
});
```

---

### 4. Validación en Exportación CSV

**Archivo:** `services/ExportService.ts`

#### Validación Antes de Generar CSV:

```typescript
export const generateLiquidationCSV = async (
  liquidation: Liquidation,
  expenses: Expense[]
): Promise<void> => {
  // VALIDACIÓN CRÍTICA: SOLO liquidaciones aprobadas pueden generar CSV
  if (liquidation.status !== 'approved') {
    throw new Error(
      `No se puede generar CSV. La liquidación debe estar APROBADA 
       (estado actual: ${liquidation.status})`
    );
  }
  
  // ... generar CSV
};

export const generateDetailedLiquidationCSV = async (
  liquidation: Liquidation,
  expenses: Expense[]
): Promise<void> => {
  // VALIDACIÓN CRÍTICA: SOLO liquidaciones aprobadas pueden generar CSV
  if (liquidation.status !== 'approved') {
    throw new Error(
      `No se puede generar CSV. La liquidación debe estar APROBADA 
       (estado actual: ${liquidation.status})`
    );
  }
  
  // ... generar CSV detallado
};
```

---

## 📊 Campos de Tracking

### Modelo de Datos (Local y Backend)

**Archivo:** `models/Liquidation.ts` y `backend/database/init.js`

```typescript
interface Liquidation {
  id: string;
  userId: string;
  employeeName: string;
  createdDate: string;
  expenseIds: string[];
  totalAmount: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  
  // Campos de tracking de fechas
  submittedDate?: string;      // Fecha de envío
  approvedDate?: string;       // Fecha de aprobación
  rejectedDate?: string;       // Fecha de rechazo
  
  // 🔍 Campos de tracking de usuarios (NUEVOS)
  managerEmail?: string;       // Email del jefe asignado
  approverEmail?: string;      // Email del aprobador (tracking)
  rejectedBy?: string;         // Email del rechazador (tracking)
  
  // 🔍 Campos de tracking de CSV (NUEVOS)
  csvGeneratedAt?: string;     // Fecha de generación de CSV
  csvGeneratedBy?: string;     // Usuario que generó el CSV
  
  // Otros campos
  managerComments?: string;    // Comentarios del jefe
  sapDocNumber?: string;       // Número de documento SAP
}
```

### Esquema SQLite (Local)

```sql
CREATE TABLE IF NOT EXISTS liquidations (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  employeeName TEXT NOT NULL,
  createdDate TEXT NOT NULL,
  expenseIds TEXT NOT NULL,
  totalAmount REAL NOT NULL,
  status TEXT NOT NULL,
  managerEmail TEXT,
  managerComments TEXT,
  submittedDate TEXT,
  approvedDate TEXT,
  rejectedDate TEXT,
  approverEmail TEXT,      -- 🔍 Tracking del aprobador
  rejectedBy TEXT,         -- 🔍 Tracking del rechazador
  csvGeneratedAt TEXT,     -- 🔍 Tracking de generación CSV
  csvGeneratedBy TEXT,     -- 🔍 Tracking de generación CSV
  synced INTEGER DEFAULT 0
);
```

### Esquema MongoDB (Backend)

```javascript
const liquidationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  employeeName: { type: String, required: true },
  createdDate: { type: String, required: true },
  expenseIds: { type: [String], required: true, default: [] },
  totalAmount: { type: Number, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['draft', 'submitted', 'approved', 'rejected'],
    default: 'draft'
  },
  managerEmail: { type: String, default: null },
  managerComments: { type: String, default: null },
  submittedDate: { type: String, default: null },
  approvedDate: { type: String, default: null },
  rejectedDate: { type: String, default: null },
  approverEmail: { type: String, default: null },      // 🔍 Tracking
  rejectedBy: { type: String, default: null },         // 🔍 Tracking
  csvGeneratedAt: { type: Date, default: null },       // 🔍 Tracking
  csvGeneratedBy: { type: String, default: null }      // 🔍 Tracking
}, {
  timestamps: true,
  collection: 'liquidations'
});
```

---

## 🔔 Sistema de Notificaciones

### Notificación Automática al Usuario

**Archivo:** `services/BackendSyncService.ts`

Cuando se sincroniza con el backend y se detecta un cambio de estado:

```typescript
// Detectar cambio de estado
const previousStatus = existingLiquidation.status;
const newStatus = liquidation.status;

// Actualizar estado
await LiquidationService.updateLiquidationStatus(
  liquidation.id,
  liquidation.status,
  liquidation.managerComments
);

// NOTIFICACIÓN: Si cambió a 'approved' o 'rejected', notificar
if (previousStatus === 'submitted' && newStatus === 'approved') {
  console.log(`✅ Liquidación ${liquidation.id} APROBADA - Enviando notificación`);
  await notifyLiquidationApproved(
    liquidation.id,
    liquidation.totalAmount,
    liquidation.approverEmail
  );
} else if (previousStatus === 'submitted' && newStatus === 'rejected') {
  console.log(`❌ Liquidación ${liquidation.id} RECHAZADA - Enviando notificación`);
  await notifyLiquidationRejected(
    liquidation.id,
    liquidation.totalAmount,
    liquidation.managerComments
  );
}
```

### Funciones de Notificación

**Archivo:** `services/NotificationService.ts`

**Notificación de Aprobación:**
```typescript
export const notifyLiquidationApproved = async (
  liquidationId: string,
  totalAmount: number,
  approverName?: string
): Promise<void> => {
  const approverText = approverName ? ` por ${approverName}` : '';
  
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '✅ Liquidación Aprobada',
      body: `Su liquidación de Q${totalAmount.toFixed(2)} fue aprobada${approverText}. 
             Ya puede generar el CSV.`,
      data: { 
        type: 'liquidation_approved',
        liquidationId,
        totalAmount 
      },
      sound: true,
      badge: 1,
    },
    trigger: null, // Inmediata
  });
};
```

**Notificación de Rechazo:**
```typescript
export const notifyLiquidationRejected = async (
  liquidationId: string,
  totalAmount: number,
  reason?: string
): Promise<void> => {
  const reasonText = reason ? `: ${reason}` : '';
  
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '❌ Liquidación Rechazada',
      body: `Su liquidación de Q${totalAmount.toFixed(2)} fue rechazada${reasonText}. 
             Puede editarla y volver a enviarla.`,
      data: { 
        type: 'liquidation_rejected',
        liquidationId,
        totalAmount,
        reason 
      },
      sound: true,
      badge: 1,
    },
    trigger: null, // Inmediata
  });
};
```

---

## 📝 Flujo Completo de Usuario

### Escenario 1: Aprobación Exitosa

1. **Usuario crea liquidación** (status: `draft`)
   - Puede agregar/quitar gastos
   - Puede editar detalles
   
2. **Usuario envía al jefe** (status: `submitted`)
   - ❌ **NO puede editar** (inmutable)
   - ❌ NO puede generar CSV
   - Banner azul: "En Revisión - No se puede modificar"
   
3. **Jefe aprueba liquidación** (status: `approved`)
   - Backend actualiza estado
   - Backend registra `approverEmail`
   - Backend actualiza gastos a `'approved'`
   
4. **Usuario recibe notificación**
   - 🔔 "✅ Su liquidación de Q1,234.56 fue aprobada por jefe@empresa.com"
   - App sincroniza automáticamente
   
5. **Usuario genera CSV** (status: `approved`)
   - ✅ Botón "Descargar CSV" disponible
   - ✅ Puede generar formato SAP o detallado
   - Banner verde: "¡Aprobada! Ya puede generar CSV"

### Escenario 2: Rechazo y Corrección

1. **Usuario envía liquidación** (status: `submitted`)
   - Banner azul: "En Revisión"
   
2. **Jefe rechaza liquidación** (status: `rejected`)
   - Backend actualiza estado
   - Backend registra `rejectedBy`
   - Backend devuelve gastos a `'in_liquidation'`
   
3. **Usuario recibe notificación**
   - 🔔 "❌ Su liquidación fue rechazada: Falta comprobante del viaje"
   - App sincroniza automáticamente
   
4. **Usuario corrige liquidación** (status: `rejected`)
   - ✅ Banner rojo: "Rechazada - Puede editar"
   - ✅ Puede agregar/quitar gastos
   - ✅ Puede editar detalles
   
5. **Usuario reenvía** (status: `submitted`)
   - Vuelve a estado "En Revisión"
   - Ciclo se repite

---

## 🧪 Casos de Prueba

### Test 1: Intentar Editar Liquidación en Revisión
```
DADO que tengo una liquidación en estado "submitted"
CUANDO intento agregar un gasto
ENTONCES recibo error "No se puede modificar una liquidación En Revisión"
```

### Test 2: Intentar Generar CSV de Liquidación No Aprobada
```
DADO que tengo una liquidación en estado "submitted"
CUANDO intento generar CSV
ENTONCES el botón "Descargar CSV" NO está visible
Y si intento llamar la función directamente
ENTONCES recibo error "La liquidación debe estar APROBADA"
```

### Test 3: Aprobar Liquidación Borrador
```
DADO que tengo una liquidación en estado "draft"
CUANDO el jefe intenta aprobarla
ENTONCES recibe error "No se puede aprobar una liquidación borrador (no enviada)"
```

### Test 4: Reenviar Liquidación Ya Aprobada
```
DADO que tengo una liquidación en estado "approved"
CUANDO intento enviarla nuevamente
ENTONCES recibo error "Esta liquidación ya fue aprobada. No se puede modificar"
```

### Test 5: Tracking de Aprobador
```
DADO que el jefe "jefe@empresa.com" aprueba una liquidación
CUANDO se consulta la liquidación
ENTONCES el campo "approverEmail" contiene "jefe@empresa.com"
```

### Test 6: Notificación de Aprobación
```
DADO que una liquidación cambia de "submitted" a "approved"
CUANDO se sincroniza con el backend
ENTONCES el usuario recibe una notificación push
Y la notificación contiene el monto y el nombre del aprobador
```

---

## ✅ Checklist de Implementación

- [x] Estados definidos en modelo TypeScript
- [x] Helpers de validación (`canEditLiquidation`, `canSubmitLiquidation`, `canGenerateCSV`)
- [x] Validación en servicios locales (LiquidationService)
- [x] Validación en backend (routes/liquidations.js)
- [x] Validación en exportación CSV (ExportService)
- [x] Banners visuales en UI (rejectedBanner, submittedBanner, approvedBanner)
- [x] Campos de tracking en modelo (approverEmail, rejectedBy, csvGeneratedAt, csvGeneratedBy)
- [x] Campos de tracking en SQLite local
- [x] Campos de tracking en MongoDB backend
- [x] Notificaciones de aprobación
- [x] Notificaciones de rechazo
- [x] Detección de cambio de estado en sincronización
- [x] Logging detallado en backend
- [x] Mensajes de error descriptivos

---

## 🎯 Beneficios del Sistema

1. **Integridad de Datos**: Las liquidaciones en revisión no pueden ser modificadas, garantizando que el jefe revisa exactamente lo que el usuario envió

2. **Auditoría Completa**: Tracking de quién aprobó/rechazó cada liquidación, cuándo y por qué

3. **Experiencia de Usuario**: Notificaciones automáticas mantienen al usuario informado sin necesidad de revisar constantemente

4. **Validación Multicapa**: Errores son detectados en UI, servicio local y backend, previniendo estados inconsistentes

5. **Mensajes Claros**: Cada validación fallida proporciona un mensaje descriptivo que explica por qué no se puede realizar la acción

6. **Control de CSV**: Solo liquidaciones aprobadas pueden generar archivos CSV, asegurando que solo gastos autorizados se procesan en SAP

---

## 📚 Archivos Relacionados

### Frontend (React Native)
- `app/liquidation-detail.tsx` - UI con banners de estado
- `app/(tabs)/liquidations.tsx` - Lista de liquidaciones con indicadores
- `models/Liquidation.ts` - Tipos e interfaces TypeScript
- `services/LiquidationService.ts` - Lógica de negocio local
- `services/ExportService.ts` - Generación de CSV con validación
- `services/NotificationService.ts` - Notificaciones push
- `services/BackendSyncService.ts` - Sincronización y detección de cambios

### Backend (Node.js + MongoDB)
- `backend/routes/liquidations.js` - Endpoints con validación estricta
- `backend/database/init.js` - Esquemas de MongoDB
- `backend/middleware/auth.js` - Autenticación JWT

---

## 🔍 Monitoreo y Logs

### Logs de Aprobación
```
✅ Liquidación 1234567890123 aprobada por jefe@empresa.com
   - Estado anterior: submitted
   - Gastos actualizados: 5
   - Total aprobado: Q1234.56
   - Empleado: Juan Pérez
```

### Logs de Rechazo
```
❌ Liquidación 1234567890123 rechazada por jefe@empresa.com
   - Razón: Falta comprobante del viaje del día 15
   - Empleado: Juan Pérez
```

### Logs de Validación
```
⚠️ Intento de aprobar liquidación 1234567890123 en estado draft
→ Error: No se puede aprobar una liquidación borrador (no enviada)
```

---

## 📞 Soporte y Mantenimiento

Para cualquier duda o modificación del sistema de integridad de estados:

1. Revisar este documento completo
2. Verificar logs en backend y app móvil
3. Comprobar que todos los niveles de validación están activos
4. Testear flujo completo antes de desplegar cambios

---

**Última Actualización:** $(Get-Date -Format "yyyy-MM-dd")
**Versión del Sistema:** 1.0
**Estado:** ✅ Implementado y Funcionando
