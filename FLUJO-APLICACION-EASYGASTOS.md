# 📱 Flujo de la Aplicación EasyGastos

**Sistema de Gestión de Gastos Empresariales**  
**Versión:** 1.0.0  
**Fecha:** Diciembre 2025

---

## 📋 Índice

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura General](#arquitectura-general)
3. [Flujo de Usuarios](#flujo-de-usuarios)
4. [Flujo de Gastos](#flujo-de-gastos)
5. [Flujo de Liquidaciones](#flujo-de-liquidaciones)
6. [Funcionalidades Especiales](#funcionalidades-especiales)
7. [Flujo de Sincronización](#flujo-de-sincronización)
8. [Roles y Permisos](#roles-y-permisos)

---

## 1. Resumen Ejecutivo

EasyGastos es una aplicación móvil offline-first para la gestión de gastos empresariales desarrollada en React Native con Expo. Permite a los empleados:

- ✅ Registrar gastos con foto de factura
- ✅ Crear liquidaciones de gastos
- ✅ Solicitar aprobación al jefe directo
- ✅ Exportar liquidaciones aprobadas a CSV (formato SAP)
- ✅ Anular gastos antes de liquidar
- ✅ Trabajar offline con sincronización automática

**Tecnologías:**
- Frontend: React Native + Expo + TypeScript
- Base de datos local: SQLite (expo-sqlite)
- Backend: Node.js + Express + MongoDB
- Gestión de procesos: PM2

---

## 2. Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│                    APLICACIÓN MÓVIL                          │
│                  (React Native + Expo)                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Gastos   │  │Liquidac. │  │Aproba-   │  │Config.   │   │
│  │          │  │          │  │ciones    │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            SQLite (Almacenamiento Local)             │   │
│  │  • expenses  • liquidations  • users  • settings    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         Servicio de Sincronización Automática        │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓ ↑                                 │
└──────────────────────────┼─┼─────────────────────────────────┘
                           │ │
                    HTTPS  │ │  JSON
                           ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js)                         │
│                  AWS EC2 / Servidor Linux                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │  API RESTful     │    │   Autenticación   │              │
│  │  Express + JWT   │    │   JWT + bcrypt    │              │
│  └──────────────────┘    └──────────────────┘              │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                MongoDB (Base de Datos)               │   │
│  │  • users  • expenses  • liquidations  • categories  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Principios de Diseño:

1. **Offline-First**: La app funciona completamente sin conexión
2. **Sincronización Inteligente**: Solo sincroniza cuando hay cambios
3. **Seguridad**: JWT tokens, encriptación bcrypt, validación en capas
4. **Resiliencia**: Reintentos automáticos, manejo de errores
5. **Escalabilidad**: Arquitectura modular, separación de responsabilidades

---

## 3. Flujo de Usuarios

### 3.1 Inicio de Sesión y Configuración

```
┌─────────────────────────────────────────────────────────────┐
│                    PRIMER USO DE LA APP                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Pantalla de Setup (setup.tsx)                               │
│ • Configurar URL del servidor backend                        │
│ • Validar conexión                                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Pantalla de Login                                            │
│ • Email                                                       │
│ • PIN (4-6 dígitos)                                          │
│ • Autenticación con backend                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
                        ┌─────┴─────┐
                        │           │
                   ¿Éxito?       ❌ Error
                        │           │
                        ✅          └─→ Mostrar mensaje
                        │
┌─────────────────────────────────────────────────────────────┐
│ Configurar PIN Local (opcional)                             │
│ • Desbloqueo rápido sin reconexión                          │
│ • Se guarda encriptado localmente                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Dashboard Principal (_layout.tsx)                            │
│ • Tabs: Gastos, Liquidaciones, Configuración                │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Uso Subsecuente

```
App Abre
    ↓
¿PIN configurado?
    ├─→ SÍ → Pantalla PIN → ✅ → Dashboard
    │                      → ❌ → Reintentar
    └─→ NO → Login Backend → ✅ → Dashboard
                            → ❌ → Error
```

---

## 4. Flujo de Gastos

### 4.1 Estados de un Gasto

Los gastos tienen dos campos de estado:

1. **`expenseStatus`** (Campo principal del flujo):
   - `draft` - Borrador (puede editarse/anularse)
   - `in_liquidation` - En liquidación (no se puede modificar)
   - `approved` - Aprobado por jefe (liquidación aprobada)
   - `voided` - Anulado (permanece como historial)

2. **`status`** (Campo legacy - deprecado):
   - Solo se mantiene por compatibilidad
   - **NO se usa** en el flujo actual

### 4.2 Ciclo de Vida de un Gasto

```
┌──────────────────────────────────────────────────────────┐
│ CREACIÓN DE GASTO (add-expense.tsx)                      │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ 1. Capturar Datos Obligatorios:                          │
│    • Descripción                                          │
│    • Monto (validado contra límite Q2,500 por defecto)  │
│    • Fecha del gasto                                      │
│    • Categoría (selección de lista)                      │
│    • Departamento                                         │
│    • Proveedor                                            │
│    • NIT del proveedor                                    │
│    • Serie y No. de factura                              │
│    • Foto de la factura (cámara)                         │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ 2. Validaciones:                                          │
│    ✅ Todos los campos obligatorios completos            │
│    ✅ Monto <= límite configurado (SettingsService)      │
│    ✅ Factura no duplicada (serie + no + fecha + monto)  │
│    ✅ Foto capturada                                      │
└──────────────────────────────────────────────────────────┘
                      ↓
                 ¿Válido?
                      │
           ┌──────────┴──────────┐
           │                     │
          ✅                    ❌
           │                     │
           ↓                     └─→ Mostrar error
┌──────────────────────────────────────────────────────────┐
│ 3. Guardar en SQLite:                                     │
│    • expenseStatus: 'draft'                              │
│    • needsSync: true                                      │
│    • Guardar imagen localmente                            │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ 4. Sincronización Automática:                            │
│    • BackendSyncService detecta needsSync                │
│    • Sube gasto a MongoDB                                 │
│    • Sube imagen de factura                               │
│    • needsSync: false                                     │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ GASTO EN ESTADO 'draft'                                   │
│ • Visible en lista de gastos                             │
│ • Puede verse en detalle                                  │
│ • Puede anularse                                          │
│ • Puede agregarse a liquidación                           │
└──────────────────────────────────────────────────────────┘
```

### 4.3 Acciones Disponibles por Estado

| Estado | Ver | Editar | Anular | Agregar a Liquidación |
|--------|-----|--------|--------|-----------------------|
| `draft` | ✅ | ❌ | ✅ | ✅ |
| `in_liquidation` | ✅ | ❌ | ❌ | ❌ |
| `approved` | ✅ | ❌ | ❌ | ❌ |
| `voided` | ✅ | ❌ | ❌ | ❌ |

### 4.4 Flujo de Anulación de Gastos

```
┌──────────────────────────────────────────────────────────┐
│ Usuario en expense-detail.tsx                             │
│ • Gasto en estado 'draft'                                │
│ • SIN liquidationId                                       │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ Botón "Anular Gasto" visible                             │
│ (solo si canVoidExpense(expense) = true)                 │
└──────────────────────────────────────────────────────────┘
                      ↓ (Usuario presiona)
┌──────────────────────────────────────────────────────────┐
│ Modal de Anulación:                                       │
│ • "Razón de anulación" (TextInput multiline)             │
│ • Razón es OBLIGATORIA                                    │
│ • Botones: "Cancelar" | "Confirmar Anulación"           │
└──────────────────────────────────────────────────────────┘
                      ↓ (Usuario confirma)
┌──────────────────────────────────────────────────────────┐
│ ExpenseService.voidExpense(id, userEmail, reason)        │
│ • Validar: expense.expenseStatus === 'draft'             │
│ • Validar: !expense.liquidationId                         │
│ • Validar: reason no vacío                                │
│ • Actualizar:                                             │
│   - expenseStatus: 'voided'                              │
│   - voidedAt: new Date().toISOString()                   │
│   - voidedReason: reason                                  │
│   - needsSync: true                                       │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ GASTO ANULADO                                             │
│ • Aparece en lista con badge "Anulado" (rojo)           │
│ • Banner rojo en detalle mostrando razón                 │
│ • NO puede agregarse a liquidaciones                      │
│ • Permanece como registro histórico                       │
│ • Se sincroniza con backend                               │
└──────────────────────────────────────────────────────────┘
```

---

## 5. Flujo de Liquidaciones

### 5.1 Estados de una Liquidación

```
draft → submitted → approved
  ↓         ↓
  └────→ rejected ──→ (back to draft)
```

| Estado | Descripción | Puede Editar | Puede Enviar | Puede Generar CSV |
|--------|-------------|--------------|--------------|-------------------|
| `draft` | Borrador, recién creada | ✅ | ✅ | ❌ |
| `submitted` | Enviada al jefe | ❌ | ❌ | ❌ |
| `rejected` | Rechazada por jefe | ✅ | ✅ | ❌ |
| `approved` | Aprobada por jefe | ❌ | ❌ | ✅ |

### 5.2 Creación de Liquidación

```
┌──────────────────────────────────────────────────────────┐
│ Pantalla de Gastos (expenses.tsx)                        │
│ • Usuario presiona botón "Liquidar"                      │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ Modo Liquidación Activado:                               │
│ • Solo muestra gastos con expenseStatus='draft'          │
│ • Checkboxes visibles                                     │
│ • Gastos no-draft aparecen deshabilitados                │
│ • Barra azul superior: "X gastos seleccionados"          │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ Usuario selecciona gastos (checkboxes)                   │
│ • Mínimo 1 gasto requerido                               │
│ • Solo gastos en 'draft' son seleccionables              │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ Botón "Crear Liquidación" (azul)                         │
│ • Solo visible si hay gastos seleccionados               │
└──────────────────────────────────────────────────────────┘
                      ↓ (Usuario presiona)
┌──────────────────────────────────────────────────────────┐
│ LiquidationService.createLiquidation()                   │
│ 1. Crear liquidación:                                     │
│    • id: Date.now().toString()                           │
│    • userId: user.email                                   │
│    • employeeName: nombre completo                        │
│    • expenseIds: array de IDs seleccionados              │
│    • totalAmount: suma de montos                          │
│    • status: 'draft'                                      │
│    • createdDate: fecha ISO                               │
│                                                            │
│ 2. Actualizar gastos:                                     │
│    FOR EACH expenseId:                                    │
│      • expenseStatus: 'in_liquidation'                   │
│      • liquidationId: liquidation.id                      │
│      • needsSync: true                                    │
│                                                            │
│ 3. Guardar en SQLite                                      │
│ 4. Marcar para sincronización                            │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ Alert: "✅ Liquidación Creada"                           │
│ • Muestra: cantidad de gastos y monto total              │
│ • Opciones: "Ver Ahora" | "Más Tarde"                   │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ Sincronización Automática:                               │
│ • BackendSyncService.syncLiquidations()                  │
│ • BackendSyncService.syncExpenses()                      │
│ • Backend actualiza expenseStatus a 'in_liquidation'     │
└──────────────────────────────────────────────────────────┘
```

### 5.3 Envío a Aprobación

```
┌──────────────────────────────────────────────────────────┐
│ liquidation-detail.tsx                                    │
│ • Usuario ve resumen de liquidación                      │
│ • Estado: 'draft' o 'rejected'                           │
│ • Botón "Enviar al Jefe" visible                         │
└──────────────────────────────────────────────────────────┘
                      ↓ (Usuario presiona)
┌──────────────────────────────────────────────────────────┐
│ LiquidationService.submitLiquidation()                   │
│ • Validar: status === 'draft' || 'rejected'              │
│ • Actualizar:                                             │
│   - status: 'submitted'                                   │
│   - submittedDate: fecha actual                           │
│   - managerEmail: email del jefe directo                  │
│   - needsSync: true                                       │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ Sincronización con Backend                               │
│ • Backend recibe liquidación submitted                    │
│ • Jefe puede verla en su panel de aprobaciones           │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ ESPERANDO APROBACIÓN DEL JEFE                            │
│ • Empleado NO puede editar                                │
│ • Empleado puede ver estado                               │
│ • Jefe ve en pantalla "Aprobaciones" (manager-approval)  │
└──────────────────────────────────────────────────────────┘
```

### 5.4 Aprobación por Jefe

```
┌──────────────────────────────────────────────────────────┐
│ Jefe en manager-approval.tsx                             │
│ • Ve lista de liquidaciones pendientes (status=submitted)│
│ • Puede ver detalles de cada liquidación                 │
│ • Ve todos los gastos incluidos                           │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ Jefe decide: APROBAR o RECHAZAR                          │
└──────────────────────────────────────────────────────────┘
           ┌──────────┴──────────┐
           │                     │
       APROBAR               RECHAZAR
           │                     │
           ↓                     ↓
┌─────────────────────┐  ┌─────────────────────┐
│ BackendSync         │  │ Modal: Comentarios  │
│ .approveLiquidation │  │ (OBLIGATORIO)       │
│                     │  └─────────┬───────────┘
│ Backend actualiza:  │            ↓
│ • status: 'approved'│  ┌─────────────────────┐
│ • approvedDate      │  │ BackendSync         │
│ • approvedBy        │  │ .rejectLiquidation  │
│ • managerComments   │  │                     │
│                     │  │ Backend actualiza:  │
│ Actualiza gastos:   │  │ • status: 'rejected'│
│ • expenseStatus:    │  │ • rejectedDate      │
│   'approved'        │  │ • rejectedBy        │
│                     │  │ • managerComments   │
└─────────┬───────────┘  └─────────┬───────────┘
          │                        │
          ↓                        ↓
┌─────────────────────┐  ┌─────────────────────┐
│ LIQUIDACIÓN         │  │ LIQUIDACIÓN         │
│ APROBADA            │  │ RECHAZADA           │
│                     │  │                     │
│ • Empleado recibe   │  │ • Empleado puede:   │
│   notificación      │  │   - Ver comentarios │
│ • Puede generar CSV │  │   - Editar gastos   │
│ • Gastos ahora en   │  │   - Reenviar        │
│   'approved'        │  │                     │
└─────────────────────┘  └─────────────────────┘
```

### 5.5 Exportación a CSV

```
┌──────────────────────────────────────────────────────────┐
│ liquidation-detail.tsx                                    │
│ • Liquidación con status='approved'                       │
│ • Banner verde: "¡Liquidación Aprobada!"                 │
│ • Botón "Descargar CSV" visible                           │
└──────────────────────────────────────────────────────────┘
                      ↓ (Usuario presiona)
┌──────────────────────────────────────────────────────────┐
│ Alert: Selección de Formato                              │
│ • "CSV Formato SAP" - Para importar a SAP                │
│ • "CSV Detallado" - Con toda la información              │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ ExportService.generateLiquidationCSV()                   │
│                                                            │
│ Formato SAP incluye:                                      │
│ • Header con información de liquidación                   │
│ • Tabla con columnas:                                     │
│   - No, CUENTA CONTABLE, AFECTO IVA, MONTO              │
│   - In.CME, CENTRO DE COSTO, ORDEN INTERNA              │
│   - SERIE FACTURA, NO. FACTURA, TP DOC                  │
│   - FECHA FACTURA, NIT, PROVEEDOR, DESCRIPCION          │
│                                                            │
│ Se guarda en:                                             │
│ • Downloads/liquidacion_[id]_[fecha].csv                 │
└──────────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ Sistema de compartir Android                             │
│ • Usuario puede:                                          │
│   - Enviar por WhatsApp                                   │
│   - Enviar por Email                                      │
│   - Guardar en Drive                                      │
│   - Compartir por otras apps                              │
└──────────────────────────────────────────────────────────┘
```

---

## 6. Funcionalidades Especiales

### 6.1 Sistema de Anulación de Gastos

**Propósito:** Permitir anular gastos erróneos manteniendo historial

**Reglas de Negocio:**
1. ✅ Solo gastos en estado `draft` pueden anularse
2. ✅ Solo si NO están en una liquidación (`liquidationId === null`)
3. ✅ Razón de anulación es OBLIGATORIA
4. ✅ El gasto anulado permanece visible con badge "Anulado"
5. ❌ No puede revertirse la anulación

**Implementación:**
- Modelo: `Expense.ts` - Campo `voidedAt`, `voidedReason`
- Servicio: `ExpenseService.voidExpense()`
- UI: `expense-detail.tsx` - Modal de anulación
- Backend: Columnas `voidedAt`, `voidedReason` en MongoDB

**Base de Datos:**
```sql
-- SQLite (móvil)
ALTER TABLE expenses ADD COLUMN voidedAt TEXT;
ALTER TABLE expenses ADD COLUMN voidedReason TEXT;

-- MongoDB (backend)
voidedAt: { type: String, default: null }
voidedReason: { type: String, default: null }
```

### 6.2 Límite de Monto por Gasto

**Propósito:** Evitar gastos individuales excesivos

**Reglas de Negocio:**
1. ✅ Límite por defecto: Q2,500.00
2. ✅ Configurable en pantalla de Settings
3. ✅ Rango permitido: Q1 - Q100,000
4. ✅ Validación antes de guardar gasto
5. ⚠️ Gastos mayores deben dividirse en múltiples facturas

**Implementación:**
- Modelo: `Settings.ts` - `AppSettings`, `SETTINGS_CONSTRAINTS`
- Servicio: `SettingsService.ts` - SQLite storage
- UI: `add-expense.tsx` - Validación en guardado
- UI: `settings.tsx` - Configuración del límite

**Flujo de Validación:**
```typescript
// En add-expense.tsx
const maxExpenseAmount = await SettingsService.getMaxExpenseAmount();
if (!isExpenseAmountValid(parsedAmount, maxExpenseAmount)) {
  Alert.alert('Error', 'El monto no puede exceder Q2,500.00...');
  return;
}
```

### 6.3 Sistema de Notificaciones

**Triggers de Notificaciones:**

1. **Liquidación Enviada** (empleado → jefe)
   - Receptor: Jefe directo
   - Mensaje: "Nueva liquidación de [Empleado] por Q[monto]"

2. **Liquidación Aprobada** (jefe → empleado)
   - Receptor: Empleado
   - Mensaje: "Tu liquidación #[ID] fue aprobada"

3. **Liquidación Rechazada** (jefe → empleado)
   - Receptor: Empleado
   - Mensaje: "Tu liquidación #[ID] fue rechazada: [comentarios]"

**Implementación:**
- Servicio: `NotificationService.ts`
- Integración: Expo Notifications
- Backend: Envía notificaciones después de cambios de estado

### 6.4 Detección de Facturas Duplicadas

**Propósito:** Evitar registrar la misma factura dos veces

**Criterios de Duplicado:**
- ✅ Misma `serie`
- ✅ Mismo `noinvoice`
- ✅ Misma `date`
- ✅ Mismo `amount` (±0.01 tolerancia)

**Flujo:**
```
Guardar Gasto
    ↓
ExpenseService.checkDuplicateExpense()
    ↓
¿Duplicado encontrado?
    ├─→ SÍ → Alert con opciones:
    │         • Ver gasto existente
    │         • Guardar de todos modos
    │         • Cancelar
    └─→ NO → Guardar normalmente
```

---

## 7. Flujo de Sincronización

### 7.1 Estrategia Offline-First

**Principio:** La app funciona completamente offline, sincroniza cuando puede.

```
┌─────────────────────────────────────────────────────────┐
│              OPERACIONES LOCALES (SQLite)               │
│  • Crear gasto → needsSync = true                       │
│  • Crear liquidación → needsSync = true                 │
│  • Anular gasto → needsSync = true                      │
│  • Cambiar estado → needsSync = true                    │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│         BackendSyncService (automático cada 30s)        │
│  • Detecta registros con needsSync = true               │
│  • Intenta sincronizar con backend                      │
└─────────────────────────────────────────────────────────┘
                         ↓
                   ¿Conexión?
                         │
           ┌─────────────┴─────────────┐
           │                           │
          ✅                          ❌
           │                           │
           ↓                           ↓
┌─────────────────────┐    ┌─────────────────────┐
│ SINCRONIZAR         │    │ MANTENER LOCAL      │
│ • POST/PUT backend  │    │ • needsSync = true  │
│ • Esperar respuesta │    │ • Reintentar luego  │
│ • needsSync = false │    │                     │
│ • lastSync = now    │    │                     │
└─────────────────────┘    └─────────────────────┘
```

### 7.2 Orden de Sincronización

```
1. Usuarios (si hay cambios)
   ↓
2. Categorías (si hay cambios)
   ↓
3. Gastos (con needsSync=true)
   ↓
4. Imágenes de facturas (upload)
   ↓
5. Liquidaciones (con needsSync=true)
   ↓
6. Descargar cambios del backend
   ↓
7. Actualizar base de datos local
```

### 7.3 Manejo de Conflictos

**Estrategia: Last-Write-Wins**

```
┌─────────────────────────────────────────────────────────┐
│ Registro local modificado mientras offline               │
│ • serverUpdatedAt: 1640000000                           │
│ • needsSync: true                                        │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Intento de sincronización                               │
│ • Backend responde: serverUpdatedAt: 1640001000         │
└─────────────────────────────────────────────────────────┘
                         ↓
                   ¿Conflicto?
                         │
           ┌─────────────┴─────────────┐
           │                           │
    Local > Backend             Backend > Local
           │                           │
           ↓                           ↓
┌─────────────────────┐    ┌─────────────────────┐
│ SUBIR CAMBIOS       │    │ DESCARGAR CAMBIOS   │
│ • PUT al backend    │    │ • Actualizar local  │
│ • Sobrescribe       │    │ • Perder cambios    │
│                     │    │   locales no sync   │
└─────────────────────┘    └─────────────────────┘
```

---

## 8. Roles y Permisos

### 8.1 Empleado (Usuario Normal)

**Permisos:**
- ✅ Crear gastos
- ✅ Ver sus propios gastos
- ✅ Anular gastos en draft
- ✅ Crear liquidaciones
- ✅ Enviar liquidaciones a aprobación
- ✅ Ver estado de sus liquidaciones
- ✅ Descargar CSV de liquidaciones aprobadas
- ✅ Configurar preferencias
- ❌ Ver gastos de otros usuarios
- ❌ Aprobar/Rechazar liquidaciones
- ❌ Ver liquidaciones de otros

**Pantallas Accesibles:**
- Dashboard
- Gastos (expenses.tsx)
- Agregar Gasto (add-expense.tsx)
- Detalle de Gasto (expense-detail.tsx)
- Liquidaciones (liquidations.tsx)
- Detalle de Liquidación (liquidation-detail.tsx)
- Configuración (settings.tsx)

### 8.2 Manager (Jefe)

**Permisos de Empleado +**
- ✅ Ver liquidaciones pendientes de sus subordinados
- ✅ Aprobar liquidaciones
- ✅ Rechazar liquidaciones (con comentarios obligatorios)
- ✅ Ver historial de liquidaciones de su equipo
- ❌ Editar gastos de otros
- ❌ Crear liquidaciones por otros

**Pantallas Adicionales:**
- Aprobaciones (manager-approval.tsx)

**Identificación de Manager:**
```typescript
// En base de datos
user.isManager = true;
user.managerEmail = null; // No tiene jefe

// Para empleados
employee.isManager = false;
employee.managerEmail = "jefe@empresa.com";
```

### 8.3 Matriz de Permisos

| Acción | Empleado | Manager |
|--------|----------|---------|
| Crear gasto propio | ✅ | ✅ |
| Ver gasto propio | ✅ | ✅ |
| Anular gasto propio (draft) | ✅ | ✅ |
| Crear liquidación propia | ✅ | ✅ |
| Enviar liquidación a jefe | ✅ | ✅ |
| Ver liquidaciones propias | ✅ | ✅ |
| Descargar CSV propios | ✅ | ✅ |
| Ver liquidaciones de equipo | ❌ | ✅ |
| Aprobar liquidaciones | ❌ | ✅ |
| Rechazar liquidaciones | ❌ | ✅ |

---

## 9. Diagramas de Secuencia

### 9.1 Flujo Completo: Crear Gasto → Liquidar → Aprobar → Exportar

```
Empleado          App Móvil         SQLite          Backend         Manager
   │                 │                 │                │               │
   │──add-expense──>│                 │                │               │
   │                 │──validate────>│                │               │
   │                 │<──✅──────────│                │               │
   │                 │──save(draft)──>│                │               │
   │                 │<──✅──────────│                │               │
   │<──✅ guardado──│                 │                │               │
   │                 │                 │                │               │
   │                 │──sync────────────────────────>│               │
   │                 │<──✅──────────────────────────│               │
   │                 │                 │                │               │
   │──liquidar────>│                 │                │               │
   │  (selecciona) │                 │                │               │
   │                 │──create liq.──>│                │               │
   │                 │──update exp───>│ (in_liquidation) │            │
   │<──✅ creada────│                 │                │               │
   │                 │                 │                │               │
   │──enviar a jefe>│                 │                │               │
   │                 │──submit───────>│                │               │
   │                 │──sync────────────────────────>│               │
   │                 │<──✅──────────────────────────│               │
   │<──✅ enviada───│                 │                │               │
   │                 │                 │                │               │
   │                 │                 │        ┌───────────────────>│
   │                 │                 │        │  notificación      │
   │                 │                 │        │                     │
   │                 │                 │        │<────ver pendientes─│
   │                 │                 │        │                     │
   │                 │                 │        │<────aprobar────────│
   │                 │                 │        │  + comentarios     │
   │                 │                 │<──────┤                     │
   │                 │                 │  update status='approved'   │
   │                 │                 │  update expenses='approved' │
   │                 │<──sync pull─────────────│                     │
   │                 │──update local──>│                │               │
   │<──🔔notificado─│                 │                │               │
   │                 │                 │                │               │
   │──ver detalle──>│                 │                │               │
   │                 │──load──────────>│                │               │
   │<──✅ aprobada──│                 │                │               │
   │                 │                 │                │               │
   │──descargar CSV>│                 │                │               │
   │                 │──generate──────>│                │               │
   │                 │──export to file─┘                │               │
   │<──📄 CSV file──│                 │                │               │
   │──compartir────>│ (WhatsApp/Email)│                │               │
```

---

## 10. Tecnologías y Dependencias

### 10.1 Frontend (App Móvil)

**Core:**
- React Native 0.74.x
- Expo SDK 51.x
- TypeScript 5.x
- Expo Router (navegación)

**Base de Datos:**
- expo-sqlite (SQLite local)

**UI/UX:**
- react-native-vector-icons (Ionicons)
- @react-native-picker/picker
- expo-image-picker
- expo-camera

**Networking:**
- fetch API nativo
- AsyncStorage (@react-native-async-storage)

**Utilidades:**
- expo-file-system
- expo-sharing
- expo-notifications
- react-native-reanimated

### 10.2 Backend (Servidor)

**Core:**
- Node.js 18.x+
- Express 4.x
- MongoDB 6.x
- Mongoose 8.x

**Seguridad:**
- jsonwebtoken (JWT)
- bcrypt (hash de passwords)
- express-validator

**Gestión de Procesos:**
- PM2 (process manager)

**Almacenamiento:**
- multer (upload de archivos)
- path/fs (file system)

---

## 11. Configuración y Variables de Entorno

### 11.1 App Móvil

**Archivo:** `config/backend.ts`
```typescript
export const BACKEND_CONFIG = {
  url: 'http://IP_SERVIDOR:3000',
  timeout: 10000
};
```

### 11.2 Backend

**Archivo:** `.env`
```bash
PORT=3000
MONGODB_URI=mongodb://localhost:27017/easygastos
JWT_SECRET=clave_secreta_larga_y_segura
NODE_ENV=production
JWT_EXPIRES_IN=24h
```

---

## 12. Casos de Uso Principales

### Caso 1: Empleado Registra Gasto Offline

**Precondiciones:**
- Usuario autenticado
- Sin conexión a internet
- Tiene foto de factura

**Flujo:**
1. Usuario abre app (ya autenticado con PIN local)
2. Click en "+" → Agregar Gasto
3. Llena formulario y toma foto
4. Click "Guardar"
5. Gasto se guarda en SQLite local
6. Se muestra en lista con estado "Borrador"

**Postcondiciones:**
- Gasto guardado localmente
- needsSync = true
- Cuando haya conexión, se sincronizará automáticamente

### Caso 2: Manager Aprueba Liquidación

**Precondiciones:**
- Usuario es manager
- Tiene liquidaciones pendientes

**Flujo:**
1. Manager abre app
2. Tab "Aprobaciones"
3. Ve lista de liquidaciones pendientes
4. Click en una liquidación
5. Revisa gastos incluidos
6. Click "Aprobar" (o "Rechazar" con comentarios)
7. Confirmación

**Postcondiciones:**
- Liquidación cambia a 'approved'
- Gastos cambian a 'approved'
- Empleado recibe notificación
- Empleado puede generar CSV

### Caso 3: Exportar Liquidación a SAP

**Precondiciones:**
- Liquidación aprobada
- Usuario es dueño de la liquidación

**Flujo:**
1. Usuario abre detalle de liquidación
2. Click "Descargar CSV"
3. Selecciona "CSV Formato SAP"
4. Se genera archivo CSV
5. Sistema muestra opciones de compartir
6. Usuario envía por email a contabilidad

**Postcondiciones:**
- CSV generado con formato SAP
- Listo para importar a sistema contable

---

## 13. Mantenimiento y Monitoreo

### 13.1 Logs del Sistema

**Backend (PM2):**
```bash
pm2 logs easygastos-backend
pm2 logs easygastos-backend --err  # Solo errores
```

**App Móvil:**
```bash
npx expo start
# Logs en consola de Metro Bundler
```

### 13.2 Health Checks

**Endpoint:** `GET /health`
```json
{
  "status": "ok",
  "mongodb": "connected",
  "uptime": 3600
}
```

### 13.3 Backup y Recuperación

**MongoDB:**
```bash
# Backup
mongodump --db easygastos --out /backups/

# Restore
mongorestore --db easygastos /backups/easygastos/
```

**SQLite (móvil):**
- Sincronización automática mantiene datos en backend
- Reinstalar app descarga datos desde backend

---

## 14. Seguridad

### 14.1 Autenticación

- **JWT Tokens** con expiración de 24h
- **Refresh tokens** no implementados (usuario debe reloguear)
- **PIN local** encriptado con bcrypt

### 14.2 Autorización

- Middleware `authenticateToken` en todas las rutas protegidas
- Middleware `requireManager` para rutas de manager
- Validación de ownership en queries (userId check)

### 14.3 Protección de Datos

- Passwords hasheados con bcrypt (rounds: 10)
- JWT secrets en variables de entorno
- SQLite encriptado a nivel de sistema operativo
- HTTPS recomendado para producción

---

## 15. Roadmap y Mejoras Futuras

### Versión 1.1 (Propuesta)
- ✨ Firma digital de aprobaciones
- ✨ Reportes y dashboards
- ✨ Múltiples monedas
- ✨ OCR automático de facturas
- ✨ Integración directa con SAP

### Versión 1.2 (Propuesta)
- ✨ App web para managers
- ✨ Políticas de gastos configurables
- ✨ Workflows de aprobación multinivel
- ✨ Integración con sistemas de viáticos

---

## 16. Contacto y Soporte

**Desarrollador:** [Tu Nombre]  
**Email:** [tu@email.com]  
**Repositorio:** [URL del repo]  
**Documentación:** Este documento

---

**Fin del Documento**

*Última actualización: Diciembre 2025*
