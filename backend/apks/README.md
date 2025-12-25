# Directorio para APKs

Este directorio contiene los archivos APK de la aplicación móvil EasyGastos.

## Uso

1. Cuando compile una nueva versión de la app, copie el APK generado aquí
2. El servidor automáticamente servirá el APK más reciente basándose en la fecha de modificación
3. Actualice la versión en `backend/routes/app.js` en la variable `CURRENT_APP_VERSION`

## Ejemplo

```bash
# Después de compilar la app
cp ~/EasyGastosMobile/android/app/build/outputs/apk/release/app-release.apk ./backend/apks/EasyGastos-v1.0.1.apk

# Actualizar versión en app.js
# CURRENT_APP_VERSION.version = '1.0.1'
# CURRENT_APP_VERSION.buildNumber = 2
```

## Seguridad

⚠️ Este directorio está servido públicamente. Asegúrese de:
- Solo subir APKs firmados y seguros
- Mantener una copia de respaldo
- Eliminar versiones antiguas periódicamente para ahorrar espacio
