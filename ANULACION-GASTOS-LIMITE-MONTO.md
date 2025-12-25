# Nuevas Funcionalidades: Anulación de Gastos y Límite de Monto

## Fecha: Diciembre 22, 2025

## 🎯 Resumen Ejecutivo

Se implementaron dos nuevas funcionalidades críticas para mejorar el control y auditoría de gastos:

1. **Anulación de Gastos**: Permite anular gastos manteniendo registro histórico
2. **Límite de Monto por Gasto**: Valida que cada gasto individual no exceda Q2,500.00 (configurable)

---

## 📋 Funcionalidad 1: Anulación de Gastos

### Descripción
Los gastos ahora pueden ser **anulados** cuando no están incluidos en ninguna liquidación. Los gastos anulados:
- Se mantienen en el sistema como **registro histórico**
- **NO se pueden agregar** a liquidaciones
- **NO se pueden editar** posteriormente
- Requieren una **razón obligatoria** de anulación

### Reglas de Negocio

#### ✅ Se puede anular un gasto cuando:
- `expenseStatus = 'draft'`
- `liquidationId = null` (no está en liquidación)
- El gasto existe en la base de datos

#### ❌ NO se puede anular un gasto cuando:
- Ya está en una liquidación (`liquidationId != null`)
- Ya fue anulado anteriormente (`expenseStatus = 'voided'`)
- Está en estado `in_liquidation` o `approved`

### Flujo de Anulación

```
1. Usuario accede al detalle del gasto
2. Si cumple condiciones → aparece botón "Anular Gasto"
3. Usuario presiona botón
4. Modal solicita "Razón de anulación" (obligatorio)
5. Usuario confirma
6. Sistema marca gasto como 'voided' con:
   - voidedAt: fecha ISO
   - voidedReason: texto ingresado
   - needsSync: true (para backend)
7. Gasto queda en estado anulado permanentemente
```

### Cambios en el Modelo

#### `models/Expense.ts`
```typescript
export type ExpenseStatus = 'draft' | 'in_liquidation' | 'approved' | 'voided';

interface Expense {
  // ... campos existentes
  voidedAt?: string;          // Fecha de anulación (ISO string)
  voidedReason?: string;      // Razón de anulación
}

// Nueva función helper
export function canVoidExpense(expense: Expense): boolean {
  return expense.expenseStatus === 'draft' && !expense.liquidationId;
}
```

#### `services/ExpenseService.ts`
```typescript
export const voidExpense = async (
  id: string, 
  userEmail: string, 
  reason: string
): Promise<void>
```

**Validaciones implementadas:**
1. Razón no vacía
2. Gasto existe
3. No está en liquidación
4. Estado = 'draft'

#### `app/expense-detail.tsx`
- **Botón "Anular Gasto"**: Solo visible si `canVoidExpense(expense) = true`
- **Modal de confirmación**: Solicita razón con TextInput multilínea
- **Banner de anulación**: Muestra fecha y razón si está anulado

#### `app/(tabs)/expenses.tsx`
```typescript
// Modo liquidación filtra gastos anulados
if (liquidationMode && expense.expenseStatus !== 'draft') {
  return false; // Excluye 'voided', 'in_liquidation', 'approved'
}
```

### Base de Datos

#### SQLite (Local)
```sql
ALTER TABLE expenses ADD COLUMN voidedAt TEXT;
ALTER TABLE expenses ADD COLUMN voidedReason TEXT;
```

#### MongoDB (Backend)
```javascript
expenseStatus: { 
  type: String, 
  enum: ['draft', 'in_liquidation', 'approved', 'voided'],
  default: 'draft'
},
voidedAt: { type: String, default: null },
voidedReason: { type: String, default: null },
```

---

## 💰 Funcionalidad 2: Límite de Monto por Gasto

### Descripción
Se estableció un **límite máximo de Q2,500.00** por gasto individual (configurable desde Settings). 

### Reglas de Negocio

#### Importante:
- ✅ **Liquidaciones pueden superar Q2,500** (son suma de múltiples gastos)
- ❌ **Cada gasto individual NO puede exceder el límite**
- ⚙️ **Límite configurable** desde la pestaña "Configuración"
- 📱 **Validación offline-first** (no requiere backend)

### Límites y Restricciones

```typescript
const SETTINGS_CONSTRAINTS = {
  maxExpenseAmount: {
    min: 1,          // Mínimo Q1.00
    max: 100000,     // Máximo Q100,000.00
    default: 2500,   // Por defecto Q2,500.00
  },
};
```

### Flujo de Validación

```
1. Usuario ingresa monto en "Agregar Gasto"
2. Usuario presiona "Guardar"
3. Sistema valida:
   a. Monto > 0
   b. Monto es número válido
   c. Monto <= maxExpenseAmount (desde Settings)
4. Si excede → Alert con mensaje explicativo
5. Si cumple → Continúa con guardado normal
```

### Mensaje de Error

```
"El monto no puede exceder Q2,500.00. 
Si necesitas un gasto mayor, divídelo en múltiples gastos."
```

### Cambios Implementados

#### `models/Settings.ts` (NUEVO)
```typescript
export interface AppSettings {
  maxExpenseAmount: number;  // Q2,500.00 por defecto
}

export function isExpenseAmountValid(
  amount: number, 
  maxExpenseAmount: number
): boolean;

export function getExpenseAmountErrorMessage(
  amount: number, 
  maxExpenseAmount: number
): string;
```

#### `services/SettingsService.ts` (NUEVO)
```typescript
// Tabla SQLite para configuraciones
CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
)

// Funciones principales
export const getMaxExpenseAmount = async (): Promise<number>
export const setMaxExpenseAmount = async (amount: number): Promise<void>
export const resetSettings = async (): Promise<void>
```

#### `app/add-expense.tsx`
```typescript
// Validación antes de guardar
const maxExpenseAmount = await SettingsService.getMaxExpenseAmount();
if (!isExpenseAmountValid(parsedAmount, maxExpenseAmount)) {
  const errorMessage = getExpenseAmountErrorMessage(parsedAmount, maxExpenseAmount);
  alert(errorMessage);
  return;
}
```

#### `app/(tabs)/settings.tsx`
Nueva sección en la pestaña de Configuración:

```
💰 Límites de Gastos
├── Monto Máximo por Gasto Individual
├── Input: Q [____.__]
├── Restricciones: Q1.00 - Q100,000.00
└── Botón: "Guardar Límite"
```

**Features de UI:**
- Input numérico con prefijo "Q"
- Validación en tiempo real
- Constraints visibles (min/max)
- Botón deshabilitado durante guardado
- Feedback con Alert al guardar

---

## 🔄 Sincronización con Backend

### Estado Anulado
Cuando un gasto se anula:
1. `needsSync = true` en SQLite local
2. BackendSyncService sincroniza automáticamente
3. Backend recibe:
   - `expenseStatus: 'voided'`
   - `voidedAt: ISO timestamp`
   - `voidedReason: string`

### Configuraciones
- Settings se guardan **solo localmente** (no se sincronizan)
- Cada dispositivo puede tener su propio límite configurado
- Recomendación: Configurar el mismo límite en todos los dispositivos

---

## 📊 Casos de Uso

### Caso 1: Anular Factura Duplicada
```
Usuario crea gasto con factura 001-2024
Descubre que ya existe la misma factura
Accede al gasto duplicado
Presiona "Anular Gasto"
Ingresa razón: "Factura duplicada, ya registrada anteriormente"
Confirma → Gasto queda anulado con registro histórico
```

### Caso 2: Validar Límite de Monto
```
Usuario intenta crear gasto de Q3,000.00
Sistema valida: 3000 > 2500 → Rechaza
Muestra: "El monto no puede exceder Q2,500.00..."
Usuario divide en:
  - Gasto 1: Q1,500.00 ✓
  - Gasto 2: Q1,500.00 ✓
Ambos se agregan a liquidación → Total Q3,000.00 ✓
```

### Caso 3: Configurar Límite Personalizado
```
Administrador accede a "Configuración"
Ve sección "💰 Límites de Gastos"
Actual: Q2,500.00
Cambia a: Q5,000.00
Presiona "Guardar Límite"
Sistema valida (5000 entre 1 y 100000) ✓
Guarda en SettingsService
Alert: "✅ Límite actualizado a Q5,000.00"
```

---

## ✅ Testing Checklist

### Anulación de Gastos
- [ ] Crear gasto en draft → Anular con razón → Verificar estado 'voided'
- [ ] Crear gasto → Agregar a liquidación → Verificar botón "Anular" NO aparece
- [ ] Anular gasto → Verificar aparece en lista con badge "Anulado"
- [ ] Modo liquidación → Verificar gastos anulados NO aparecen
- [ ] Anular gasto → Sincronizar → Verificar en backend tiene voidedAt y voidedReason

### Límite de Monto
- [ ] Crear gasto Q2,500.00 → Debe guardar ✓
- [ ] Crear gasto Q2,501.00 → Debe rechazar con error
- [ ] Cambiar límite a Q5,000 → Crear gasto Q3,000 → Debe guardar ✓
- [ ] Configurar límite Q100 → Debe rechazar (< min)
- [ ] Configurar límite Q150,000 → Debe rechazar (> max)
- [ ] Crear 2 gastos Q2,500 c/u → Liquidación Q5,000 → Debe permitir ✓

---

## 📝 Notas Técnicas

### Performance
- Validación de límite es **local** (no requiere red)
- Consulta a Settings es **sincrónica** y **rápida** (SQLite)
- No afecta el flujo offline-first de la app

### Migración de BD
Las tablas se crean automáticamente con `CREATE TABLE IF NOT EXISTS`, por lo que:
- Primera ejecución: crea columnas nuevas
- Ejecuciones posteriores: no afecta datos existentes
- Gastos antiguos: `voidedAt` y `voidedReason` serán `null`

### Compatibilidad Backend
- Backend debe actualizarse con enum 'voided'
- Si backend no actualizado: gastos anulados se sincronizan pero pueden causar error
- Recomendación: Actualizar backend ANTES de deployar app

---

## 🚀 Deploy

### Pre-requisitos
1. Actualizar backend con schema modificado
2. Reiniciar servidor Node.js para cargar nuevo schema
3. Probar endpoint POST/PUT de expenses acepta 'voided'

### Pasos de Deploy
```bash
# 1. Instalar dependencias (si es necesario)
npm install

# 2. Build APK
.\build-and-install.ps1

# 3. Instalar en dispositivo
# El script automáticamente instala después del build

# 4. Verificar en Settings la nueva sección "Límites de Gastos"
```

### Rollback Plan
Si hay problemas:
1. Los gastos anulados quedan como 'voided' pero no afectan liquidaciones
2. Se puede remover validación de límite comentando código en add-expense.tsx
3. Backend puede ignorar campo 'voided' si no está actualizado

---

## 📞 Soporte

### Preguntas Frecuentes

**P: ¿Puedo des-anular un gasto?**
R: No, la anulación es permanente. El gasto queda como registro histórico.

**P: ¿Qué pasa si anulo un gasto por error?**
R: Debes crear un nuevo gasto con los mismos datos.

**P: ¿La liquidación puede superar Q2,500?**
R: Sí, el límite es por gasto individual, no por liquidación.

**P: ¿Dónde configuro el límite?**
R: En la pestaña "Configuración" → Sección "💰 Límites de Gastos"

**P: ¿El límite se sincroniza entre dispositivos?**
R: No, cada dispositivo tiene su configuración local. Recomendamos configurar el mismo límite en todos.

---

## 📄 Archivos Modificados

### Frontend (App)
1. `models/Expense.ts` - Tipo 'voided' y función canVoidExpense
2. `models/Settings.ts` - **NUEVO** - Interface de configuración
3. `services/ExpenseService.ts` - Función voidExpense y columnas BD
4. `services/SettingsService.ts` - **NUEVO** - CRUD de configuración
5. `app/expense-detail.tsx` - Botón y modal de anulación
6. `app/(tabs)/expenses.tsx` - Filtro de gastos anulados
7. `app/(tabs)/settings.tsx` - Sección de límites de gastos
8. `app/add-expense.tsx` - Validación de límite de monto

### Backend
1. `backend/database/init.js` - Enum 'voided' y campos voidedAt/voidedReason

---

## ✨ Mejoras Futuras

### Corto Plazo
- [ ] Reporte de gastos anulados con estadísticas
- [ ] Exportar gastos anulados a CSV
- [ ] Filtro "Ver anulados" en lista de gastos

### Mediano Plazo
- [ ] Límites configurables por categoría
- [ ] Límites por departamento
- [ ] Notificaciones cuando se anula un gasto

### Largo Plazo
- [ ] Dashboard de gastos anulados por mes
- [ ] Auditoría completa de anulaciones
- [ ] Sincronización de configuraciones entre dispositivos

---

**Versión:** 1.0.0  
**Autor:** Sistema EasyGastosMobile  
**Última Actualización:** Diciembre 22, 2025
