# 📱 Guía de Pruebas - Deployment 22/12/2025

## ✅ Pre-Deployment Checklist

- [x] Sin errores de compilación
- [x] Validaciones de estado implementadas
- [x] Notificaciones configuradas
- [x] Tracking de aprobaciones implementado
- [x] Exportación CSV con validación
- [x] Terminología actualizada (Anular vs Quitar)
- [x] UI mejorada con iconos de estado

---

## 🚀 Comandos de Deployment

### Opción 1: Build y Deploy Automático (Recomendado)
```powershell
# Desde la raíz del proyecto
.\build-and-install.ps1
```

### Opción 2: Manual
```powershell
# 1. Actualizar versión
.\update-version.ps1

# 2. Limpiar build anterior
cd android
.\gradlew clean

# 3. Compilar APK
.\gradlew assembleRelease

# 4. Instalar en dispositivo
adb install -r app/build/outputs/apk/release/app-release.apk
```

### Opción 3: Desarrollo (Debug)
```bash
npx expo run:android
```

---

## 🧪 Plan de Pruebas Completo

### TEST 1: Crear Liquidación (Estado: draft)

**Pasos:**
1. ✅ Ir a pestaña "Gastos"
2. ✅ Crear 3-4 gastos de prueba
3. ✅ Seleccionar gastos y crear liquidación
4. ✅ Verificar que aparece en estado "Borrador" con icono 📝

**Verificaciones:**
- Badge naranja con "Borrador"
- Icono `create-outline` visible
- Fecha de creación mostrada
- Total correcto

---

### TEST 2: Visualización en Lista

**Pasos:**
1. ✅ Abrir pestaña "Liquidaciones"
2. ✅ Verificar lista de liquidaciones

**Verificaciones:**
- ✅ Badge de estado con icono visible
- ✅ Color correcto según estado
- ✅ Tamaño de badge más grande (nueva UI)
- ✅ Texto legible (13px, bold)

**Estados a verificar:**
- 🟠 `draft` → Naranja con `create-outline`
- 🔵 `submitted` → Azul con `time-outline`
- 🟢 `approved` → Verde con `checkmark-circle`
- 🔴 `rejected` → Rojo con `close-circle`

---

### TEST 3: Editar Liquidación en Borrador

**Pasos:**
1. ✅ Abrir liquidación en estado "Borrador"
2. ✅ Verificar que se muestran botones de edición

**Botones que DEBEN estar visibles:**
- ✅ "Agregar Gasto"
- ✅ "Quitar" (en cada gasto)
- ✅ "Ver" (ícono de ojo)
- ✅ "Enviar al Jefe"
- ✅ "Eliminar Liquidación"

**Acciones a probar:**
- ✅ Agregar un gasto nuevo
- ✅ Quitar un gasto existente
  - Mensaje: "¿Desea quitar este gasto?"
  - Botón: "Quitar"
- ✅ Ver detalle de gasto
- ✅ Verificar total actualizado

---

### TEST 4: Enviar Liquidación al Jefe (draft → submitted)

**Pasos:**
1. ✅ Abrir liquidación en "Borrador"
2. ✅ Presionar "Enviar al Jefe"

**Verificar Alerta de Confirmación:**
```
Título: "Enviar al Jefe"
Mensaje: "¿Desea enviar esta liquidación al jefe?

Total: Q[monto]
Gastos: [cantidad]

Una vez enviada, no podrá modificarla hasta que el jefe la revise."

Botones: [Cancelar] [Enviar]
```

3. ✅ Confirmar envío
4. ✅ Verificar mensaje de éxito
5. ✅ Verificar que UI se actualiza inmediatamente

**Verificaciones POST-ENVÍO:**
- ✅ Estado cambia a "En Revisión"
- ✅ Badge azul con icono ⏳
- ✅ Fecha de envío visible "Enviada DD/MM/YYYY"

---

### TEST 5: 🔒 CRÍTICO - Liquidación en Revisión ES INMUTABLE

**Pasos:**
1. ✅ Abrir liquidación en estado "En Revisión"

**Banner de Estado DEBE mostrarse:**
```
┌─────────────────────────────────────────┐
│ ⏳ En Revisión                          │
│                                         │
│ Esta liquidación fue enviada al jefe   │
│ y está en proceso de revisión.         │
│ 🔒 NO SE PUEDE MODIFICAR hasta que sea │
│ aprobada o rechazada.                  │
│                                         │
│ ℹ️ Los cambios en el estado se         │
│ sincronizarán automáticamente cuando   │
│ su jefe tome una decisión.             │
└─────────────────────────────────────────┘
```

**Botones que NO DEBEN estar visibles:**
- ❌ "Agregar Gasto" → NO VISIBLE
- ❌ "Quitar" en gastos → NO VISIBLE
- ❌ "Enviar al Jefe" → NO VISIBLE
- ❌ "Eliminar Liquidación" → NO VISIBLE
- ❌ "Descargar CSV" → NO VISIBLE

**Acciones SOLO de lectura:**
- ✅ Ver lista de gastos (SOLO lectura)
- ✅ Ver detalle de gasto (botón ojo)
- ✅ Ver total y fechas

**⚠️ PRUEBA DE INTENTO DE MODIFICACIÓN:**
Si de alguna manera se pudiera llamar las funciones (no debería ser posible):
- Intentar agregar gasto → Error: "No se puede modificar una liquidación En Revisión"
- Intentar quitar gasto → Error: "No se puede modificar una liquidación En Revisión"
- Intentar reenviar → Error: "No se puede enviar una liquidación en estado 'submitted'"

---

### TEST 6: Sincronización con Backend

**Pasos:**
1. ✅ Enviar liquidación (queda synced=0 localmente)
2. ✅ Verificar conexión a backend
3. ✅ Esperar sincronización automática (o pull to refresh)
4. ✅ Verificar logs en backend

**Verificaciones Backend:**
```bash
# En el servidor, verificar logs:
✅ Liquidación [id] recibida con status 'submitted'
✅ Liquidación guardada en MongoDB
✅ Fecha de envío registrada
```

**Verificaciones App:**
- ✅ Estado sigue siendo "En Revisión"
- ✅ Datos sincronizados con backend

---

### TEST 7: Manager Aprueba Liquidación (submitted → approved)

**Contexto:** Esta prueba requiere acceso como manager

**Pasos (Como Manager):**
1. ✅ Iniciar sesión con cuenta de manager
2. ✅ Ir a "Aprobaciones Pendientes"
3. ✅ Ver liquidación enviada
4. ✅ Presionar "Aprobar"
5. ✅ Agregar comentarios (opcional)
6. ✅ Confirmar aprobación

**Verificaciones Backend:**
```bash
✅ Liquidación [id] aprobada por manager@empresa.com
   - Estado anterior: submitted
   - Gastos actualizados: [cantidad]
   - Total aprobado: Q[monto]
   - Empleado: [nombre]
```

**Tracking Registrado:**
- ✅ `status` → `'approved'`
- ✅ `approvedDate` → Fecha actual
- ✅ `approverEmail` → Email del manager
- ✅ `managerComments` → Comentarios (si hay)

---

### TEST 8: Notificación al Usuario (Aprobación)

**Pasos (Como Empleado):**
1. ✅ Esperar sincronización automática (o pull to refresh)
2. ✅ Verificar notificación push recibida

**Notificación Esperada:**
```
┌─────────────────────────────────────┐
│ ✅ Liquidación Aprobada             │
│                                     │
│ Su liquidación de Q[monto] fue     │
│ aprobada por [manager@email.com].  │
│ Ya puede generar el CSV.            │
└─────────────────────────────────────┘
```

3. ✅ Abrir app
4. ✅ Verificar estado actualizado a "Aprobada"

**Verificaciones UI:**
- ✅ Badge verde con icono ✅
- ✅ Banner verde de aprobación
- ✅ Botón "Descargar CSV" VISIBLE
- ✅ Comentarios del manager visibles (si hay)

---

### TEST 9: Generar CSV (SOLO desde approved)

**Pasos:**
1. ✅ Abrir liquidación en estado "Aprobada"
2. ✅ Verificar banner verde:
```
┌─────────────────────────────────────────┐
│ ✅ ¡Liquidación Aprobada!              │
│                                         │
│ Esta liquidación fue aprobada por el   │
│ jefe. Ya puede generar el archivo CSV  │
│ para procesar los gastos.              │
└─────────────────────────────────────────┘
```

3. ✅ Presionar "Descargar CSV"
4. ✅ Seleccionar formato:
   - "CSV Formato SAP"
   - "CSV Detallado"

**Verificaciones:**
- ✅ Archivo CSV generado
- ✅ Compartir por WhatsApp/Email/Guardar
- ✅ Verificar contenido del CSV
- ✅ Campos correctos (cuenta, IVA, monto, factura, etc.)

**⚠️ PRUEBA DE VALIDACIÓN:**
- Intentar generar CSV desde "Borrador" → Botón NO visible
- Intentar generar CSV desde "En Revisión" → Botón NO visible
- Intentar generar CSV desde "Rechazada" → Botón NO visible

---

### TEST 10: Manager Rechaza Liquidación (submitted → rejected)

**Pasos (Como Manager):**
1. ✅ Ver liquidación pendiente
2. ✅ Presionar "Rechazar"
3. ✅ **OBLIGATORIO:** Agregar comentarios explicando el rechazo
4. ✅ Confirmar rechazo

**Verificaciones Backend:**
```bash
❌ Liquidación [id] rechazada por manager@empresa.com
   - Razón: [comentarios del manager]
   - Empleado: [nombre]
```

**Tracking Registrado:**
- ✅ `status` → `'rejected'`
- ✅ `rejectedDate` → Fecha actual
- ✅ `rejectedBy` → Email del manager
- ✅ `managerComments` → Razón del rechazo (OBLIGATORIO)

---

### TEST 11: Notificación al Usuario (Rechazo)

**Pasos (Como Empleado):**
1. ✅ Esperar sincronización (o pull to refresh)
2. ✅ Verificar notificación push

**Notificación Esperada:**
```
┌─────────────────────────────────────┐
│ ❌ Liquidación Rechazada            │
│                                     │
│ Su liquidación de Q[monto] fue     │
│ rechazada: [razón del rechazo].    │
│ Puede editarla y volver a enviarla.│
└─────────────────────────────────────┘
```

3. ✅ Abrir app
4. ✅ Verificar estado actualizado a "Rechazada"

---

### TEST 12: 🔴 Editar Liquidación Rechazada (ANULAR gastos)

**Pasos:**
1. ✅ Abrir liquidación en estado "Rechazada"

**Banner de Rechazo DEBE mostrarse:**
```
┌─────────────────────────────────────────┐
│ ❌ Liquidación Rechazada                │
│                                         │
│ Esta liquidación fue rechazada por el  │
│ jefe. Puede editarla, corregir gastos  │
│ o agregar/quitar gastos según los      │
│ comentarios del jefe.                  │
│                                         │
│ Comentarios del jefe:                  │
│ "[razón del rechazo]"                  │
└─────────────────────────────────────────┘
```

**Botones que DEBEN estar visibles:**
- ✅ "Agregar Gasto"
- ✅ **"Anular"** en cada gasto (NO "Quitar")
- ✅ "Ver" (ícono de ojo)
- ✅ "Enviar al Jefe" (para reenviar)

**Acción: Anular Gasto Rechazado**
2. ✅ Presionar botón "Anular" en un gasto

**Alerta de Confirmación Esperada:**
```
Título: "Anular Gasto Rechazado"

Mensaje: "¿Desea anular este gasto de la liquidación rechazada?

Gasto: [descripción]
Monto: Q[monto]

El gasto volverá a estado "Borrador" para que pueda 
corregirlo o incluirlo en otra liquidación."

Botones: [Cancelar] [Anular]
```

3. ✅ Confirmar anulación

**Mensaje de Éxito Esperado:**
```
"Gasto anulado. Ahora puede corregirlo o incluirlo en otra liquidación."
```

**Verificaciones:**
- ✅ Gasto removido de la liquidación
- ✅ Gasto vuelve a estado `draft`
- ✅ Total actualizado
- ✅ Puede agregar otros gastos
- ✅ Puede reenviar la liquidación corregida

---

### TEST 13: Reenviar Liquidación Corregida (rejected → submitted)

**Pasos:**
1. ✅ Corregir gastos en liquidación rechazada
2. ✅ Presionar "Enviar al Jefe"
3. ✅ Confirmar reenvío

**Verificaciones:**
- ✅ Estado cambia a "En Revisión" nuevamente
- ✅ Banner azul aparece
- ✅ Ya no se puede editar
- ✅ Fecha de envío actualizada

---

### TEST 14: Validación de Duplicados

**Pasos:**
1. ✅ Crear un gasto con:
   - Serie: "A"
   - No. Factura: "12345"
   - Fecha: "22/12/2025"
   - Monto: Q100.00

2. ✅ Intentar crear otro gasto IDÉNTICO

**Alerta Esperada:**
```
⚠️ Factura Duplicada

Ya existe un gasto con la misma factura:
Serie: A
No. Factura: 12345
Fecha: 22/12/2025
Monto: Q100.00

¿Desea crear este gasto de todas formas?

[Cancelar] [Crear de Todas Formas]
```

3. ✅ Si el gasto duplicado ya está en una liquidación:

**Error Esperado:**
```
❌ Factura ya en Liquidación

Esta factura ya está incluida en otra liquidación.
No se puede agregar dos veces.

[OK]
```

---

### TEST 15: Filtros en Lista de Liquidaciones

**Pasos:**
1. ✅ Presionar icono de filtro (arriba derecha)
2. ✅ Ver modal de filtros

**Opciones de filtro:**
- ✅ "Todas" → Muestra todas
- ✅ "Borradores" → Solo draft
- ✅ "Enviadas" → Solo submitted
- ✅ "Aprobadas" → Solo approved
- ✅ "Rechazadas" → Solo rejected

3. ✅ Seleccionar cada filtro
4. ✅ Verificar que lista se actualiza correctamente
5. ✅ Verificar contador de liquidaciones en badge

---

### TEST 16: Pull to Refresh

**Pasos:**
1. ✅ En lista de liquidaciones
2. ✅ Hacer gesto de "pull down"
3. ✅ Verificar spinner de carga
4. ✅ Verificar sincronización con backend

**Verificaciones:**
- ✅ Liquidaciones actualizadas
- ✅ Estados sincronizados
- ✅ Notificaciones activadas si hay cambios

---

### TEST 17: Modo Offline

**Pasos:**
1. ✅ Desactivar Wi-Fi y datos móviles
2. ✅ Crear una liquidación
3. ✅ Enviar al jefe
4. ✅ Verificar que se guarda localmente

**Verificaciones:**
- ✅ Liquidación guardada con `synced=0`
- ✅ Estado "En Revisión" localmente
- ✅ Mensaje: "Se sincronizará cuando tenga conexión"

5. ✅ Reactivar conexión
6. ✅ Hacer pull to refresh
7. ✅ Verificar sincronización automática

---

## 📊 Checklist de Pruebas

### Funcionalidad Básica
- [ ] Crear liquidación
- [ ] Ver lista de liquidaciones
- [ ] Filtrar por estado
- [ ] Pull to refresh

### Estados y Transiciones
- [ ] draft → submitted (enviar)
- [ ] submitted → approved (jefe aprueba)
- [ ] submitted → rejected (jefe rechaza)
- [ ] rejected → submitted (reenviar corregida)

### Validación de Inmutabilidad
- [ ] submitted NO permite editar
- [ ] submitted NO muestra botones de edición
- [ ] Intentar agregar gasto → Error
- [ ] Intentar quitar gasto → Error
- [ ] Intentar reenviar → Error

### Terminología
- [ ] draft: Botón "Quitar" en gastos
- [ ] rejected: Botón "Anular" en gastos
- [ ] Mensaje correcto según estado

### Exportación CSV
- [ ] Solo visible en estado "approved"
- [ ] Genera CSV formato SAP
- [ ] Genera CSV detallado
- [ ] Campos correctos

### Notificaciones
- [ ] Notificación al aprobar
- [ ] Notificación al rechazar
- [ ] Contenido correcto

### Tracking
- [ ] approverEmail registrado
- [ ] rejectedBy registrado
- [ ] Fechas correctas

### Sincronización
- [ ] Sincronización online
- [ ] Modo offline funciona
- [ ] Sincronización automática

### UI/UX
- [ ] Iconos de estado visibles
- [ ] Badges más grandes y legibles
- [ ] Banners informativos
- [ ] Fechas formateadas correctamente

---

## 🐛 Problemas Conocidos a Verificar

1. **Sincronización Lenta**
   - Verificar tiempo de respuesta del backend
   - Logs en consola para debugging

2. **Notificaciones**
   - Verificar permisos en Android
   - Probar con app en background
   - Probar con app cerrada

3. **CSV en Android**
   - Verificar permisos de escritura
   - Probar compartir por WhatsApp
   - Probar guardar en descargas

---

## 📝 Notas para el Tester

### Logs a Monitorear
```bash
# En el dispositivo (logcat)
adb logcat | grep -E "Liquidation|BackendSync|Notification"

# En el backend
tail -f /var/log/easygastos/server.log
```

### Cuentas de Prueba
```
Empleado:
- Email: empleado@test.com
- PIN: 1234

Manager:
- Email: manager@test.com
- PIN: 5678
```

### URLs Backend
```
Producción: https://[tu-servidor]:3001
Desarrollo: http://localhost:3001
```

---

## ✅ Criterios de Éxito

- [ ] Todas las funcionalidades básicas funcionan
- [ ] Liquidación en "En Revisión" es 100% inmutable
- [ ] Terminología correcta ("Anular" para rechazadas)
- [ ] Notificaciones funcionan correctamente
- [ ] CSV se genera solo desde "Aprobadas"
- [ ] Sin crashes ni errores en runtime
- [ ] UI responsiva y clara
- [ ] Sincronización confiable

---

**Fecha:** 22/12/2025
**Versión:** [verificar en app.json]
**Tester:** _____________
**Estado:** [ ] APROBADO [ ] REQUIERE AJUSTES
