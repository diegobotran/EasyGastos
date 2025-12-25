# Guía de Migración - Nueva IP del Servidor

## 📋 Cambios Realizados

### Antes (URL Vieja):
- IP: `200.6.231.237`
- Puerto: `7300`

### Ahora (URL Nueva):
- IP: `3.82.200.97`
- Puerto: `3000`

## ✅ Archivos Actualizados

1. **config/backend.ts**
   - DEFAULT_URL actualizado
   - Limpieza automática de URLs viejas

2. **services/BackendSyncService.ts**
   - DEFAULT_IP y DEFAULT_PORT actualizados

3. **app/backend-config.tsx**
   - Todas las URLs por defecto actualizadas
   - Presets actualizados
   - Detección y limpieza automática de URLs viejas

4. **app/_layout.tsx**
   - Forzar recarga de URL al iniciar app

## 📱 Para Aplicar los Cambios

### Opción 1: Reinstalar APK (Recomendado)
```powershell
cd C:\Apps\EasyGastosMobile
.\build-and-install.ps1
```

### Opción 2: Limpiar Datos de la App
1. Configuración → Apps → EasyGastos
2. Almacenamiento → Borrar datos
3. Abrir la app nuevamente

### Opción 3: Desde la App (Configuración de Backend)
1. Abrir EasyGastos
2. Ir a "Configuración de Backend"
3. Botón "Restaurar configuración"
4. La URL nueva se aplicará automáticamente

## 🔍 Verificar que Funciona

### En el servidor (logs):
```bash
# Deberías ver requests de tu teléfono, NO solo de Windows
tail -f ~/.pm2/logs/easygastos-backend-out.log
```

### En la app:
- La pantalla de "Configuración de Backend" debe mostrar: `http://3.82.200.97:3000`
- Al hacer "Probar Conexión" debe conectarse exitosamente

## 🐛 Si Sigue Sin Funcionar

1. Verificar que el puerto 3000 está abierto en AWS Security Group
2. Verificar que el backend está corriendo: `pm2 status`
3. Probar desde navegador: http://3.82.200.97:3000/health
4. Revisar logs de la app móvil en tiempo real
