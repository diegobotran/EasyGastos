#!/bin/bash

# 🔐 Script para configurar usuario administrador inicial
# Ejecutar después del deployment para crear el primer usuario con tokens

echo "🔐 Configurando usuario administrador inicial..."
echo "================================================"

# Función para mostrar mensajes
log_info() {
    echo "ℹ️  $1"
}

log_success() {
    echo "✅ $1"
}

log_error() {
    echo "❌ $1"
    exit 1
}

# Verificar que estamos en el directorio correcto
if [ ! -f "server.js" ]; then
    log_error "Ejecuta este script desde el directorio backend/"
fi

# Verificar que MongoDB esté ejecutándose
if ! systemctl is-active --quiet mongod; then
    log_error "MongoDB no está ejecutándose. Inicia con: sudo systemctl start mongod"
fi

# Verificar variables de entorno
if [ ! -f ".env" ]; then
    log_error "Archivo .env no encontrado. Configúralo primero."
fi

# Verificar JWT_SECRET
if grep -q "JWT_SECRET=CAMBIAR" .env; then
    log_error "JWT_SECRET no ha sido configurado. Edita .env con un secreto seguro."
fi

log_info "Creando usuario administrador inicial..."

# Datos del usuario administrador
read -p "📧 Email del administrador: " ADMIN_EMAIL
read -p "👤 Nombre: " ADMIN_FIRST_NAME
read -p "👤 Apellido: " ADMIN_LAST_NAME
read -p "🏢 Departamento: " ADMIN_DEPARTMENT
read -s -p "🔑 PIN (4 dígitos): " ADMIN_PIN
echo

# Validar PIN
if [[ ! $ADMIN_PIN =~ ^[0-9]{4}$ ]]; then
    log_error "El PIN debe ser exactamente 4 dígitos"
fi

# Crear script Node.js temporal para crear usuario
cat > temp_create_admin.js << EOF
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/easygastos');

// Definir modelo User
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  pin: { type: String, required: true },
  department: String,
  managerEmail: String,
  isManager: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: Date
});

const User = mongoose.model('User', userSchema);

async function createAdmin() {
  try {
    const email = '$ADMIN_EMAIL';
    const firstName = '$ADMIN_FIRST_NAME';
    const lastName = '$ADMIN_LAST_NAME';
    const department = '$ADMIN_DEPARTMENT';
    const pin = '$ADMIN_PIN';

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('❌ El usuario ya existe');
      process.exit(1);
    }

    // Crear hash del PIN
    const hashedPin = await bcrypt.hash(pin, 10);

    // Crear usuario administrador
    const adminUser = new User({
      email,
      firstName,
      lastName,
      pin: hashedPin,
      department,
      isManager: true,
      isActive: true,
      lastLoginAt: new Date()
    });

    await adminUser.save();

    // Generar token JWT
    const token = jwt.sign(
      {
        userId: adminUser._id,
        email: adminUser.email,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { 
        expiresIn: '48h',
        issuer: 'easygastos-backend',
        audience: 'easygastos-app'
      }
    );

    console.log('✅ Usuario administrador creado exitosamente');
    console.log('📋 Detalles:');
    console.log(\`   Email: \${email}\`);
    console.log(\`   Nombre: \${firstName} \${lastName}\`);
    console.log(\`   Departamento: \${department}\`);
    console.log(\`   Es Manager: Sí\`);
    console.log(\`   Token JWT: \${token}\`);
    console.log('');
    console.log('📱 Para probar en la app:');
    console.log(\`   Email: \${email}\`);
    console.log(\`   PIN: \${pin}\`);
    console.log('');
    console.log('🔗 Para probar con curl:');
    console.log(\`curl -H "Authorization: Bearer \${token}" http://localhost:3000/api/users/profile/\${email}\`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creando usuario administrador:', error);
    process.exit(1);
  }
}

createAdmin();
EOF

# Ejecutar script
log_info "Ejecutando creación de usuario..."
node temp_create_admin.js

# Limpiar archivo temporal
rm temp_create_admin.js

log_success "Configuración completada"

echo ""
echo "🎉 Usuario administrador configurado exitosamente"
echo ""
echo "📱 Siguiente paso:"
echo "   1. Usar este email y PIN en la app para hacer login"
echo "   2. La app obtendrá automáticamente el token JWT"
echo "   3. El token será válido por 48 horas"
echo ""
echo "🔧 Comandos útiles:"
echo "   - Ver logs: pm2 logs easygastos-backend"
echo "   - Reiniciar: pm2 restart easygastos-backend"
echo "   - Probar API: curl http://localhost:3000/health"