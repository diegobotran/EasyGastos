@echo off
echo 🚀 Configurando Backend EasyGastos con MongoDB
echo ==============================================

rem Verificar si Node.js está instalado
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js no está instalado. Por favor instálalo primero.
    pause
    exit /b 1
)

rem Verificar si MongoDB está ejecutándose
echo 🔌 Verificando conexión a MongoDB...
node -e "const mongoose = require('mongoose'); mongoose.connect('mongodb://localhost:27017/easygastos', {useNewUrlParser: true, useUnifiedTopology: true}).then(() => {console.log('✅ Conexión a MongoDB exitosa'); mongoose.disconnect();}).catch(err => {console.log('❌ Error conectando a MongoDB:', err.message); console.log('   Asegúrate de que MongoDB esté ejecutándose en localhost:27017'); process.exit(1);});"

if %errorlevel% neq 0 (
    echo.
    echo ⚠️  MongoDB no está disponible. 
    echo    Asegúrate de que MongoDB esté instalado y ejecutándose.
    echo    Puedes verificar visitando: http://localhost:27017
    pause
    exit /b 1
)

rem Instalar dependencias
echo 📦 Instalando dependencias...
npm install

rem Crear directorio de uploads si no existe
if not exist uploads mkdir uploads

echo.
echo ✅ Backend configurado exitosamente!
echo.
echo 📋 Para iniciar el servidor:
echo    npm start
echo.
echo 🔧 Para desarrollo (con auto-reload):
echo    npm run dev
echo.
echo 🌐 El servidor estará disponible en:
echo    http://localhost:3000
echo    Health check: http://localhost:3000/health
echo.
echo 📊 Base de datos MongoDB:
echo    Host: localhost:27017
echo    Database: easygastos
echo.
pause