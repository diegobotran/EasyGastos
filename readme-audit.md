# README-AUDIT — EasyGastosMobile

## 1) Resumen ejecutivo

EasyGastosMobile es una plataforma de gestión de gastos y liquidaciones con enfoque **offline-first**, formada por una app móvil Expo/React Native y un backend Node/Express con MongoDB. La solución cubre ciclo completo: alta de usuario, desbloqueo por PIN, registro de gastos con evidencia, liquidaciones, aprobación por manager, sincronización bidireccional y soporte SAT/IA.

Base técnica sólida en separación por capas y modelos de dominio, pero con brechas importantes en seguridad/configuración y mantenibilidad que conviene atacar antes de escalar.

---

## 2) Qué hace el sistema (visión funcional)

### Flujo de usuario en móvil
- Setup inicial y registro/login en `hooks/useSetupViewModel.ts` y pantalla `app/setup.tsx`.
- Desbloqueo por PIN en `app/unlock.tsx` con verificación en `services/AuthService.ts`.
- Gestión de gastos (alta, edición, detalle, evidencias) en `app/add-expense.tsx`, `app/expense-detail.tsx`, `app/(tabs)/expenses.tsx`.
- Gestión de liquidaciones en `app/liquidation-detail.tsx`, `app/(tabs)/liquidations.tsx`.
- Aprobación de manager en `app/manager-approval.tsx`.
- Chat/historial (asistente y trazas) en `app/expense-chat.tsx`, `app/chat-history.tsx`.

### Flujo backend
- API principal y middlewares en `backend/server.js`.
- Módulos de negocio por rutas: users, expenses, liquidations, categories, sync, sat, uploads en `backend/routes/users.js`, `backend/routes/expenses.js`, `backend/routes/liquidations.js`, `backend/routes/categories.js`, `backend/routes/sync.js`, `backend/routes/sat.js`, `backend/routes/uploads.js`.
- Persistencia Mongo y bootstrap de colecciones/índices en `backend/database/init.js`.

---

## 3) Tecnologías y stack

### Cliente móvil
- Expo + React Native + React en `package.json`.
- Enrutamiento con Expo Router en `package.json`, layout raíz en `app/_layout.tsx`.
- Persistencia local con SQLite en `app/_layout.tsx`, soporte por `package.json`.
- Persistencia segura de PIN con SecureStore en `services/AuthService.ts`.
- AsyncStorage para datos de sesión/config en `services/AuthService.ts`.
- Capacidades de archivos/imágenes/OCR: `package.json`.

### Backend
- Node.js + Express en `backend/package.json` y `backend/server.js`.
- MongoDB + Mongoose en `backend/database/init.js`.
- JWT + bcrypt para auth en `backend/middleware/auth.js`.
- Seguridad base con `helmet`, `rate-limit`, `cors` en `backend/server.js`.
- PM2 y despliegue en `backend/ecosystem.config.js`, `backend/deploy.sh`.
- Servicio IA/Ollama separado en `backend/ollama-server.js`.

---

## 4) Arquitectura y patrones detectados

### 4.1 Cliente
- Patrón MVVM-like: pantallas delgadas + lógica en hooks viewmodel, por ejemplo `app/setup.tsx` con `hooks/useSetupViewModel.ts`, y `app/unlock.tsx` con `hooks/usePinUnlockViewModel.ts`.
- Service Layer para acceso a datos y sync: `services/ExpenseService.ts`, `services/CategoryService.ts`, `services/BackendSyncService.ts`.
- Estado global de autenticación con Context en `context/AuthContext.tsx`.
- Dominio tipado en `models/Expense.ts`, `models/Liquidation.ts`, `models/User.ts`.
- Offline-first con sync asíncrono en `app/add-expense.tsx` y `app/liquidation-detail.tsx`.

### 4.2 Backend
- Monolito modular por rutas (bounded contexts) en `backend/routes`.
- Middleware de auth/rol/restricción de datos en `backend/middleware/auth.js`.
- Persistencia orientada a colecciones de negocio en `backend/database/init.js`.
- Sincronización batch y full-sync en `backend/routes/sync.js`.

---

## 5) Hallazgos críticos, brechas e issues

### Alta prioridad
1. Seguridad de credenciales inconsistente en cliente
   - JWT guardado en AsyncStorage y no unificado totalmente con esquema seguro en `services/AuthService.ts`, coexistiendo con múltiples claves.
   - Riesgo: exposición/deriva de sesión en escenarios de compromiso local.

2. Endpoints backend sensibles sin protección uniforme
   - Perfil y endpoints de logs/estado sync sin mismo nivel de auth/autorización en `backend/routes/users.js` y `backend/routes/sync.js`.
   - Riesgo: acceso indebido a datos operativos.

3. Secretos y configuración con defaults inseguros/hardcode
   - Fallback JWT en `backend/middleware/auth.js`.
   - Token IA hardcodeado en `backend/ollama-server.js`.
   - URL/IP backend por defecto fija en cliente en `config/backend.ts` y `services/BackendSyncService.ts`.

4. Complejidad excesiva en capa de sincronización cliente
   - Archivo de gran tamaño y responsabilidades múltiples en `services/BackendSyncService.ts`.
   - Riesgo: regresiones, baja testabilidad y alto costo de evolución.

### Media prioridad
5. Inconsistencias potenciales de estado de negocio
   - Coexistencia de `status` y `expenseStatus` en `models/Expense.ts`.
   - Puede provocar transiciones ambiguas entre estado local y estado de aprobación.

6. Duplicidades y deuda en backend
   - Endpoint login duplicado en `backend/routes/users.js`.
   - Riesgo de comportamiento divergente futuro.

7. Bug funcional en versionado APK/API
   - Uso de símbolo no definido en `backend/routes/app.js`.

### Baja prioridad
8. Logging muy verboso en cliente/servicios
   - Uso amplio de logs en `app/_layout.tsx` y `services/BackendSyncService.ts`.

9. Estrategia de timeouts/retries dispersa
   - Configuración no centralizada en `hooks/useExpensesViewModel.ts` y `services/BackendSyncService.ts`.

---

## 6) Puntos de atención arquitectónicos

- La app está bien encaminada hacia un modelo empresarial real (empleado-manager, sincronización offline, trazabilidad), pero necesita endurecimiento de seguridad y gobernanza de configuración.
- El acoplamiento actual de sync/autenticación/config en cliente complica agregar nuevas reglas de negocio sin riesgo.
- El backend tiene buena cobertura funcional pero aún no refleja un baseline de producción estricto en control de acceso, secretos y observabilidad.

---

## 7) Recomendaciones priorizadas (impacto/esfuerzo)

### Fase 1 — 1 a 2 semanas (quick wins)
1. Cerrar brechas de auth en rutas backend
   - Aplicar middleware consistente en `backend/middleware/auth.js` a rutas de `backend/routes/users.js` y `backend/routes/sync.js`.

2. Remover secretos hardcodeados y fallback inseguros
   - Forzar variables obligatorias en `backend/middleware/auth.js` y `backend/ollama-server.js`.

3. Corregir endpoint de versionado
   - Arreglar referencia en `backend/routes/app.js`.

4. Endurecer CORS productivo
   - Reemplazar `origin: true` por allowlist en `backend/server.js`.

5. Unificar almacenamiento de token en móvil
   - Definir una sola estrategia y llaves en `services/AuthService.ts`.

### Fase 2 — 1 a 3 meses (estructural)
6. Particionar sync cliente por dominios
   - Separar `services/BackendSyncService.ts` en módulos (auth-sync, expenses-sync, liquidations-sync, manager-sync).

7. Consolidar máquina de estados de gasto/liquidación
   - Formalizar reglas en `models/Expense.ts` y `models/Liquidation.ts`.

8. Fortalecer observabilidad
   - Logging estructurado, métricas y correlation-id partiendo de `backend/server.js` y colección `sync_logs` en `backend/database/init.js`.

9. Normalizar configuración por entorno
   - Eliminar hardcodes en `backend/database/init.js`, `config/backend.ts`, `services/BackendSyncService.ts`.

10. Mejorar calidad estática y tipado
   - Endurecer reglas en `eslint.config.js`, reducir `any` en hooks como `hooks/useSetupViewModel.ts`.

---

## 8) Evaluación general de madurez

- **Producto/negocio**: Alto potencial, flujo funcional completo para operación de gastos con jerarquía.
- **Arquitectura**: Correcta base modular, con deuda en separación de responsabilidades críticas.
- **Seguridad**: Requiere atención inmediata en autenticación consistente, secretos y CORS.
- **Escalabilidad**: Viable a corto plazo; para crecer necesita modularidad en sync + observabilidad.
- **Mantenibilidad**: Media; afectada por archivos “god object”, duplicidad y convenciones no homogéneas.

---

## 9) Conclusión final

El proyecto está funcionalmente avanzado y bien orientado para un caso real de gestión de gastos corporativos, especialmente por su estrategia offline-first y su flujo manager-empleado. El siguiente salto de calidad no requiere reescritura total: requiere una **fase de hardening** enfocada en seguridad, configuración por entorno, modularización de sincronización y consistencia de estados. Atendiendo esas brechas, EasyGastosMobile puede pasar de una base operativa sólida a una plataforma robusta para evolución continua y despliegue confiable en producción.
