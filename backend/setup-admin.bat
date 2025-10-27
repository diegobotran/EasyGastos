@echo off
REM Script para configurar usuario administrador inicial en Windows
REM Ejecutar después del deployment para crear el primer usuario con tokens

echo 🔐 Configurando usuario administrador inicial...
echo ================================================

REM Verificar que estamos en el directorio correcto
if not exist "server.js" (
    echo ❌ Error: Ejecuta este script desde el directorio backend/
    pause
    exit /b 1
)

REM Verificar que MongoDB esté ejecutándose
tasklist /FI "IMAGENAME eq mongod.exe" 2>NUL | find /I /N "mongod.exe">NUL
if %errorlevel% neq 0 (
    echo ❌ MongoDB no está ejecutándose. Inícialoo desde los servicios de Windows
    pause
    exit /b 1
)

REM Verificar variables de entorno
if not exist ".env" (
    echo ❌ Archivo .env no encontrado. Configúralo primero.
    pause
    exit /b 1
)

REM Verificar JWT_SECRET
findstr /C:"JWT_SECRET=CAMBIAR" .env >nul
if %errorlevel%==0 (
    echo ❌ JWT_SECRET no ha sido configurado. Edita .env con un secreto seguro.
    pause
    exit /b 1
)

echo ℹ️  Creando usuario administrador inicial...

REM Solicitar datos del usuario
set /p ADMIN_EMAIL="📧 Email del administrador: "
set /p ADMIN_FIRST_NAME="👤 Nombre: "
set /p ADMIN_LAST_NAME="👤 Apellido: "
set /p ADMIN_DEPARTMENT="🏢 Departamento: "
set /p ADMIN_PIN="🔑 PIN (4 dígitos): "

REM Crear script Node.js temporal
(
echo const mongoose = require('mongoose'^);
echo const bcrypt = require('bcrypt'^);
echo const jwt = require('jsonwebtoken'^);
echo require('dotenv'^).config(^);
echo.
echo // Conectar a MongoDB
echo mongoose.connect(process.env.MONGODB_URI ^|^| 'mongodb://localhost:27017/easygastos'^);
echo.
echo // Definir modelo User
echo const userSchema = new mongoose.Schema({
echo   email: { type: String, required: true, unique: true },
echo   firstName: { type: String, required: true },
echo   lastName: { type: String, required: true },
echo   pin: { type: String, required: true },
echo   department: String,
echo   managerEmail: String,
echo   isManager: { type: Boolean, default: false },
echo   isActive: { type: Boolean, default: true },
echo   createdAt: { type: Date, default: Date.now },
echo   lastLoginAt: Date
echo }^);
echo.
echo const User = mongoose.model('User', userSchema^);
echo.
echo async function createAdmin(^) {
echo   try {
echo     const email = '%ADMIN_EMAIL%';
echo     const firstName = '%ADMIN_FIRST_NAME%';
echo     const lastName = '%ADMIN_LAST_NAME%';
echo     const department = '%ADMIN_DEPARTMENT%';
echo     const pin = '%ADMIN_PIN%';
echo.
echo     // Verificar si el usuario ya existe
echo     const existingUser = await User.findOne({ email }^);
echo     if (existingUser^) {
echo       console.log('❌ El usuario ya existe'^);
echo       process.exit(1^);
echo     }
echo.
echo     // Crear hash del PIN
echo     const hashedPin = await bcrypt.hash(pin, 10^);
echo.
echo     // Crear usuario administrador
echo     const adminUser = new User({
echo       email,
echo       firstName,
echo       lastName,
echo       pin: hashedPin,
echo       department,
echo       isManager: true,
echo       isActive: true,
echo       lastLoginAt: new Date(^)
echo     }^);
echo.
echo     await adminUser.save(^);
echo.
echo     // Generar token JWT
echo     const token = jwt.sign(
echo       {
echo         userId: adminUser._id,
echo         email: adminUser.email,
echo         firstName: adminUser.firstName,
echo         lastName: adminUser.lastName
echo       },
echo       process.env.JWT_SECRET ^|^| 'fallback_secret',
echo       { 
echo         expiresIn: '48h',
echo         issuer: 'easygastos-backend',
echo         audience: 'easygastos-app'
echo       }
echo     ^);
echo.
echo     console.log('✅ Usuario administrador creado exitosamente'^);
echo     console.log('📋 Detalles:'^);
echo     console.log(`   Email: ${email}`^);
echo     console.log(`   Nombre: ${firstName} ${lastName}`^);
echo     console.log(`   Departamento: ${department}`^);
echo     console.log(`   Es Manager: Sí`^);
echo     console.log(`   Token JWT: ${token}`^);
echo     console.log(''^);
echo     console.log('📱 Para probar en la app:'^);
echo     console.log(`   Email: ${email}`^);
echo     console.log(`   PIN: ${pin}`^);
echo     console.log(''^);
echo     console.log('🔗 Para probar con curl:'^);
echo     console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:3000/api/users/profile/${email}`^);
echo.
echo     process.exit(0^);
echo   } catch (error^) {
echo     console.error('❌ Error creando usuario administrador:', error^);
echo     process.exit(1^);
echo   }
echo }
echo.
echo createAdmin(^);
) > temp_create_admin.js

REM Ejecutar script
echo ℹ️  Ejecutando creación de usuario...
node temp_create_admin.js

REM Limpiar archivo temporal
del temp_create_admin.js

echo.
echo 🎉 Usuario administrador configurado exitosamente
echo.
echo 📱 Siguiente paso:
echo    1. Usar este email y PIN en la app para hacer login
echo    2. La app obtendrá automáticamente el token JWT
echo    3. El token será válido por 48 horas
echo.
echo 🔧 Comandos útiles:
echo    - Ver logs: pm2 logs easygastos-backend
echo    - Reiniciar: pm2 restart easygastos-backend
echo    - Probar API: curl http://localhost:3000/health

pause