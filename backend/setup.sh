#!/bin/bash

echo "🚀 Configurando Backend EasyGastos con MongoDB"
echo "=============================================="

# Verificar si Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado. Por favor instálalo primero."
    exit 1
fi

# Verificar si MongoDB está ejecutándose
if ! command -v mongosh &> /dev/null && ! command -v mongo &> /dev/null; then
    echo "⚠️  MongoDB CLI no encontrado. Asegúrate de que MongoDB esté instalado y ejecutándose."
    echo "   Puedes verificar si está ejecutándose visitando: http://localhost:27017"
fi

# Instalar dependencias
echo "📦 Instalando dependencias..."
npm install

# Verificar conexión a MongoDB
echo "🔌 Verificando conexión a MongoDB..."
node -e "
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/easygastos', {useNewUrlParser: true, useUnifiedTopology: true})
  .then(() => {
    console.log('✅ Conexión a MongoDB exitosa');
    mongoose.disconnect();
  })
  .catch(err => {
    console.log('❌ Error conectando a MongoDB:', err.message);
    console.log('   Asegúrate de que MongoDB esté ejecutándose en localhost:27017');
    process.exit(1);
  });
"

# Crear directorio de uploads si no existe
mkdir -p uploads

echo ""
echo "✅ Backend configurado exitosamente!"
echo ""
echo "📋 Para iniciar el servidor:"
echo "   npm start"
echo ""
echo "🔧 Para desarrollo (con auto-reload):"
echo "   npm run dev"
echo ""
echo "🌐 El servidor estará disponible en:"
echo "   http://localhost:3000"
echo "   Health check: http://localhost:3000/health"
echo ""
echo "📊 Base de datos MongoDB:"
echo "   Host: localhost:27017"
echo "   Database: easygastos"
echo ""