@echo off
REM Script de verificación de configuración para deployment en Windows
REM Ejecutar antes de hacer deployment en producción

echo 🔍 Verificando configuración de deployment para EasyGastos...
echo ==================================================

REM Verificar si estamos en el directorio correcto
if not exist "package.json" (
    echo ❌ Error: Ejecuta este script desde el directorio backend/
    pause
    exit /b 1
)

REM Verificar archivo .env
if not exist ".env" (
    echo ⚠️  Advertencia: No se encontró archivo .env
    echo    Copia .env.production.example como .env y configúralo
) else (
    echo ✅ Archivo .env encontrado
    
    REM Verificar configuraciones críticas
    findstr /C:"NODE_ENV=production" .env >nul
    if %errorlevel%==0 (
        echo ✅ NODE_ENV configurado para producción
    ) else (
        echo ⚠️  Advertencia: NODE_ENV no está configurado como 'production'
    )
    
    findstr /C:"JWT_SECRET=CAMBIAR" .env >nul
    if %errorlevel%==0 (
        echo ❌ Error: JWT_SECRET no ha sido cambiado
        echo    Cambia JWT_SECRET por un valor seguro en .env
    ) else (
        echo ✅ JWT_SECRET configurado
    )
)

echo.
echo 📦 Verificando dependencias...
npm list --depth=0 >nul 2>&1
if %errorlevel%==0 (
    echo ✅ Todas las dependencias están instaladas
) else (
    echo ❌ Error: Faltan dependencias
    echo    Ejecuta: npm install
)

echo.
echo 📁 Verificando estructura de archivos...

set files=server.js package.json routes\health.js routes\users.js routes\categories.js routes\expenses.js routes\sync.js routes\manager-links.js database\init.js

for %%f in (%files%) do (
    if exist "%%f" (
        echo ✅ %%f
    ) else (
        echo ❌ Falta: %%f
    )
)

echo.
echo 🌐 Información de red del servidor:
echo Direcciones IP disponibles:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do echo    %%a

echo.
echo 🔌 Verificando puertos...
set PORT=3000
if defined PORT (
    netstat -an | findstr ":%PORT% " >nul
    if %errorlevel%==0 (
        echo ⚠️  Puerto %PORT% ya está en uso
        echo    Procesos usando el puerto:
        netstat -ano | findstr ":%PORT% "
    ) else (
        echo ✅ Puerto %PORT% disponible
    )
)

echo.
echo 🗃️  Verificando MongoDB...
REM En Windows, verificar si MongoDB está ejecutándose
tasklist /FI "IMAGENAME eq mongod.exe" 2>NUL | find /I /N "mongod.exe">NUL
if %errorlevel%==0 (
    echo ✅ MongoDB está ejecutándose
) else (
    echo ❌ MongoDB no está ejecutándose
    echo    Inicia MongoDB desde los servicios de Windows
)

echo.
echo 🔄 Verificando PM2...
where pm2 >nul 2>&1
if %errorlevel%==0 (
    echo ✅ PM2 está instalado
    for /f "tokens=*" %%a in ('pm2 --version 2^>nul') do echo    Versión: %%a
) else (
    echo ⚠️  PM2 no está instalado
    echo    Instala con: npm install -g pm2
)

echo.
echo ==================================================
echo 📋 RESUMEN DE VERIFICACIÓN
echo ==================================================

echo 🎯 Para deployment en Windows Server:
echo.
echo 📱 SIGUIENTE PASO para la app móvil:
echo    1. Identifica la IP pública de este servidor
echo    2. Actualiza config\backend.ts con esa IP
echo    3. Compila la app para producción
echo.
echo 🚀 Para iniciar el servidor:
echo    pm2 start ecosystem.config.js
echo.
echo 🔧 Configuración adicional recomendada:
echo    - Configurar Windows Firewall para permitir puerto 3000
echo    - Configurar MongoDB como servicio de Windows
echo    - Considerar usar IIS como reverse proxy
echo.
echo 📚 Para más información, consulta DEPLOYMENT.md

pause