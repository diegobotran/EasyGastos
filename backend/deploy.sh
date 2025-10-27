#!/bin/bash

# 🚀 Script de deployment automático para EasyGastos Backend
# Ejecutar en el servidor Linux

echo "🚀 Iniciando deployment de EasyGastos Backend..."
echo "================================================"

# Variables de configuración
APP_DIR="/var/www/easygastos-backend"
APP_USER="easygastos"
PORT=3000

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

log_warning() {
    echo "⚠️  $1"
}

# 1. Verificar permisos
if [ "$EUID" -eq 0 ]; then
    log_warning "No ejecutes este script como root. Usa un usuario normal."
fi

# 2. Verificar Node.js
log_info "Verificando Node.js..."
if ! command -v node &> /dev/null; then
    log_error "Node.js no está instalado. Instálalo primero."
fi
NODE_VERSION=$(node --version)
log_success "Node.js $NODE_VERSION encontrado"

# 3. Verificar MongoDB
log_info "Verificando MongoDB..."
if ! systemctl is-active --quiet mongod; then
    log_error "MongoDB no está ejecutándose. Inicia con: sudo systemctl start mongod"
fi
log_success "MongoDB está ejecutándose"

# 4. Crear directorio de aplicación
log_info "Configurando directorio de aplicación..."
if [ ! -d "$APP_DIR" ]; then
    sudo mkdir -p "$APP_DIR"
    sudo chown $USER:$USER "$APP_DIR"
    log_success "Directorio $APP_DIR creado"
else
    log_success "Directorio $APP_DIR ya existe"
fi

# 5. Ir al directorio
cd "$APP_DIR" || log_error "No se pudo acceder al directorio $APP_DIR"

# 6. Instalar dependencias
if [ -f "package.json" ]; then
    log_info "Instalando dependencias..."
    npm install --production || log_error "Error instalando dependencias"
    log_success "Dependencias instaladas"
else
    log_error "No se encontró package.json. ¿Subiste los archivos del backend?"
fi

# 7. Configurar variables de entorno
if [ ! -f ".env" ]; then
    log_info "Configurando variables de entorno..."
    if [ -f ".env.production.example" ]; then
        cp .env.production.example .env
        log_warning "Archivo .env creado desde plantilla. ¡EDÍTALO ANTES DE CONTINUAR!"
        log_warning "Especialmente cambia JWT_SECRET por un valor seguro"
        echo "¿Quieres editar .env ahora? (y/n)"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            nano .env
        fi
    else
        log_error "No se encontró .env.production.example"
    fi
else
    log_success "Archivo .env encontrado"
fi

# 8. Configurar firewall
log_info "Verificando firewall..."
if command -v ufw &> /dev/null; then
    if ! ufw status | grep -q "$PORT/tcp"; then
        log_warning "Puerto $PORT no está abierto en UFW"
        echo "¿Abrir puerto $PORT? (y/n)"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            sudo ufw allow $PORT/tcp
            log_success "Puerto $PORT abierto"
        fi
    else
        log_success "Puerto $PORT ya está abierto"
    fi
fi

# 9. Instalar y configurar PM2
log_info "Configurando PM2..."
if ! command -v pm2 &> /dev/null; then
    log_info "Instalando PM2..."
    sudo npm install -g pm2 || log_error "Error instalando PM2"
fi

# Crear configuración PM2 si no existe
if [ ! -f "ecosystem.config.js" ]; then
    log_info "Creando configuración PM2..."
    cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'easygastos-backend',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
EOF
    log_success "Configuración PM2 creada"
fi

# Crear directorio de logs
mkdir -p logs

# 10. Obtener IP pública
log_info "Obteniendo IP pública del servidor..."
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "No se pudo obtener")
if [ "$PUBLIC_IP" != "No se pudo obtener" ]; then
    log_success "IP pública del servidor: $PUBLIC_IP"
    echo ""
    echo "📱 IMPORTANTE: Actualiza la app móvil con esta configuración:"
    echo "   En config/backend.ts cambiar:"
    echo "   'http://TU_IP_PUBLICA_AQUI:3000' por 'http://$PUBLIC_IP:3000'"
    echo ""
else
    log_warning "No se pudo obtener la IP pública automáticamente"
    echo "Obtén la IP manualmente con: curl ifconfig.me"
fi

# 11. Iniciar aplicación
echo "¿Iniciar la aplicación con PM2? (y/n)"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    # Detener si ya está ejecutándose
    pm2 delete easygastos-backend 2>/dev/null || true
    
    # Iniciar
    pm2 start ecosystem.config.js || log_error "Error iniciando la aplicación"
    
    # Configurar auto-inicio
    pm2 startup --hp $HOME
    pm2 save
    
    log_success "Aplicación iniciada con PM2"
    
    # Mostrar estado
    pm2 status
    
    # Probar la API
    sleep 3
    log_info "Probando la API..."
    if curl -s "http://localhost:$PORT/health" >/dev/null; then
        log_success "API respondiendo correctamente"
        echo ""
        echo "🎉 ¡Deployment completado exitosamente!"
        echo ""
        echo "📊 Comandos útiles:"
        echo "   pm2 status                    - Ver estado"
        echo "   pm2 logs easygastos-backend   - Ver logs"
        echo "   pm2 restart easygastos-backend - Reiniciar"
        echo "   pm2 monit                     - Monitor en tiempo real"
        echo ""
        if [ "$PUBLIC_IP" != "No se pudo obtener" ]; then
            echo "🌐 Tu API está disponible en: http://$PUBLIC_IP:$PORT"
            echo "📋 Health check: http://$PUBLIC_IP:$PORT/health"
        fi
    else
        log_error "La API no está respondiendo. Verifica los logs con: pm2 logs"
    fi
else
    echo "Para iniciar manualmente:"
    echo "pm2 start ecosystem.config.js"
fi

echo ""
echo "✅ Deployment completado. ¡No olvides actualizar la configuración de la app móvil!"