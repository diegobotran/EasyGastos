#!/bin/bash

# 🔍 Script de verificación de configuración para deployment CON PORT FORWARDING
# Ejecutar antes de hacer deployment en producción

echo "🔍 Verificando configuración de deployment con Port Forwarding..."
echo "=================================================================="

# Verificar si estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo "❌ Error: Ejecuta este script desde el directorio backend/"
    exit 1
fi

# Verificar archivo .env
if [ ! -f ".env" ]; then
    echo "⚠️  Advertencia: No se encontró archivo .env"
    echo "   Copia .env.production.example como .env y configúralo"
else
    echo "✅ Archivo .env encontrado"
    
    # Verificar configuraciones críticas para PORT FORWARDING
    if grep -q "NODE_ENV=production" .env; then
        echo "✅ NODE_ENV configurado para producción"
    else
        echo "⚠️  Advertencia: NODE_ENV no está configurado como 'production'"
    fi
    
    if grep -q "BIND_IP=0.0.0.0" .env; then
        echo "✅ BIND_IP configurado para aceptar conexiones externas (0.0.0.0)"
    else
        echo "❌ CRÍTICO: BIND_IP debe ser 0.0.0.0 para port forwarding"
        echo "   Agrega: BIND_IP=0.0.0.0 al archivo .env"
    fi
    
    if grep -q "JWT_SECRET=CAMBIAR" .env; then
        echo "❌ Error: JWT_SECRET no ha sido cambiado"
        echo "   Cambia JWT_SECRET por un valor seguro en .env"
        echo "   Genera uno con: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
    else
        echo "✅ JWT_SECRET configurado"
    fi
fi

# Verificar dependencias
echo ""
echo "📦 Verificando dependencias..."
if npm list --depth=0 >/dev/null 2>&1; then
    echo "✅ Todas las dependencias están instaladas"
else
    echo "❌ Error: Faltan dependencias"
    echo "   Ejecuta: npm install"
fi

# Verificar estructura de archivos
echo ""
echo "📁 Verificando estructura de archivos..."

required_files=(
    "server.js"
    "package.json"
    "middleware/auth.js"
    "routes/health.js"
    "routes/users.js"
    "routes/categories.js"
    "routes/expenses.js"
    "routes/sync.js"
    "routes/manager-links.js"
    "database/init.js"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ Falta: $file"
    fi
done

# Verificar configuración de red
echo ""
echo "🌐 Información de red del servidor:"
echo "IMPORTANTE: El servidor debe escuchar en 0.0.0.0 para port forwarding"
echo ""
echo "Interfaces de red disponibles:"
ip -4 addr show | grep inet | grep -v 127.0.0.1 | awk '{print "   IP interna: " $2}' | cut -d'/' -f1

# Verificar puertos
echo ""
echo "🔌 Verificando puertos..."
PORT=${PORT:-3000}
if netstat -tuln | grep ":$PORT " >/dev/null; then
    echo "⚠️  Puerto $PORT ya está en uso"
    echo "   Procesos usando el puerto:"
    lsof -i :$PORT 2>/dev/null | head -5
    
    # Verificar si escucha en 0.0.0.0
    if netstat -tuln | grep "0.0.0.0:$PORT " >/dev/null; then
        echo "✅ Puerto $PORT escucha en 0.0.0.0 (perfecto para port forwarding)"
    else
        echo "❌ CRÍTICO: Puerto $PORT NO escucha en 0.0.0.0"
        echo "   Debe escuchar en 0.0.0.0:$PORT para port forwarding"
    fi
else
    echo "✅ Puerto $PORT disponible"
fi

# Verificar MongoDB
echo ""
echo "🗃️  Verificando MongoDB..."
if systemctl is-active --quiet mongod; then
    echo "✅ MongoDB está ejecutándose"
    
    # Verificar conectividad
    if mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
        echo "✅ Conexión a MongoDB exitosa"
    else
        echo "⚠️  No se pudo conectar a MongoDB"
    fi
else
    echo "❌ MongoDB no está ejecutándose"
    echo "   Inicia con: sudo systemctl start mongod"
fi

# Verificar firewall (Ubuntu/Debian)
echo ""
echo "🔥 Verificando firewall para PORT FORWARDING..."
if command -v ufw >/dev/null; then
    if ufw status | grep -q "Status: active"; then
        echo "✅ UFW está activo"
        if ufw status | grep -q "$PORT/tcp"; then
            echo "✅ Puerto $PORT está abierto en UFW"
        else
            echo "❌ CRÍTICO: Puerto $PORT no está abierto en UFW"
            echo "   Abre con: sudo ufw allow $PORT/tcp"
        fi
    else
        echo "⚠️  UFW no está activo"
        echo "   Para port forwarding, considera activar el firewall"
    fi
elif command -v firewall-cmd >/dev/null; then
    echo "✅ FirewallD detectado"
    if firewall-cmd --list-ports | grep -q "$PORT/tcp"; then
        echo "✅ Puerto $PORT está abierto"
    else
        echo "❌ CRÍTICO: Puerto $PORT no está abierto"
        echo "   Abre con: sudo firewall-cmd --permanent --add-port=$PORT/tcp && sudo firewall-cmd --reload"
    fi
else
    echo "⚠️  No se detectó configuración de firewall"
    echo "   Para port forwarding, asegúrate de que el puerto $PORT esté abierto"
fi

# Verificar PM2
echo ""
echo "🔄 Verificando PM2..."
if command -v pm2 >/dev/null; then
    echo "✅ PM2 está instalado"
    pm2_version=$(pm2 --version)
    echo "   Versión: $pm2_version"
else
    echo "⚠️  PM2 no está instalado"
    echo "   Instala con: sudo npm install -g pm2"
fi

# Verificar JWT
echo ""
echo "🔐 Verificando configuración JWT..."
if [ -f "middleware/auth.js" ]; then
    echo "✅ Middleware de autenticación encontrado"
    if grep -q "generateToken" middleware/auth.js; then
        echo "✅ Función generateToken encontrada"
    fi
    if grep -q "authenticateToken" middleware/auth.js; then
        echo "✅ Función authenticateToken encontrada"
    fi
else
    echo "❌ Error: middleware/auth.js no encontrado"
fi

# Resumen final para PORT FORWARDING
echo ""
echo "=================================================================="
echo "📋 RESUMEN DE VERIFICACIÓN PARA PORT FORWARDING"
echo "=================================================================="

# Verificar si todo está listo para port forwarding
all_ok=true
critical_errors=()

if [ ! -f ".env" ] || grep -q "JWT_SECRET=CAMBIAR" .env 2>/dev/null; then
    all_ok=false
    critical_errors+=("JWT_SECRET no configurado")
fi

if ! grep -q "BIND_IP=0.0.0.0" .env 2>/dev/null; then
    all_ok=false
    critical_errors+=("BIND_IP debe ser 0.0.0.0")
fi

if ! npm list --depth=0 >/dev/null 2>&1; then
    all_ok=false
    critical_errors+=("Dependencias faltantes")
fi

if ! systemctl is-active --quiet mongod; then
    all_ok=false
    critical_errors+=("MongoDB no ejecutándose")
fi

if $all_ok; then
    echo "🎉 ¡Todo está listo para deployment con PORT FORWARDING!"
    echo ""
    echo "� CONFIGURACIÓN DE ROUTER/FIREWALL REQUERIDA:"
    echo "   1. Configurar port forwarding: IP_PUBLICA:3000 → SERVIDOR_INTERNO:3000"
    echo "   2. Protocolo: TCP"
    echo "   3. Puerto externo: 3000 (o el que prefieras)"
    echo "   4. Puerto interno: 3000"
    echo ""
    echo "📱 CONFIGURACIÓN DE LA APP:"
    echo "   1. Obtén tu IP pública: curl ifconfig.me"
    echo "   2. Actualiza config/backend.ts con esa IP"
    echo "   3. Compila la app para producción"
    echo ""
    echo "🚀 Para iniciar el servidor:"
    echo "   pm2 start ecosystem.config.js"
    echo ""
    echo "🔍 Para probar desde internet:"
    echo "   curl http://TU_IP_PUBLICA:3000/health"
else
    echo "⚠️  HAY ERRORES CRÍTICOS PARA PORT FORWARDING:"
    for error in "${critical_errors[@]}"; do
        echo "   ❌ $error"
    done
    echo ""
    echo "   Corrige estos problemas antes del deployment"
fi

echo ""
echo "📚 Para más información específica de port forwarding, consulta:"
echo "   DEPLOYMENT-PORT-FORWARDING.md"