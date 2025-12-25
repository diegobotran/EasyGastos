#!/bin/bash

# Script para actualizar el backend en el servidor remoto
# Uso: ./update-backend.sh

echo "🚀 Actualizando Backend en Servidor Remoto"
echo "=========================================="

# Variables (ajustar según tu configuración)
SERVER_IP="3.82.200.97"
SERVER_USER="ubuntu"  # o el usuario que uses
BACKEND_DIR="/home/ubuntu/easygastos-backend"  # ajustar según tu instalación

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "📦 Creando paquete de archivos modificados..."

# Crear directorio temporal
TEMP_DIR=$(mktemp -d)
cp middleware/auth.js "$TEMP_DIR/"

echo "✅ Archivos preparados"
echo ""
echo "📤 Para actualizar el servidor, ejecuta estos comandos:"
echo ""
echo "1. Copia el archivo al servidor:"
echo "   scp middleware/auth.js ${SERVER_USER}@${SERVER_IP}:${BACKEND_DIR}/middleware/"
echo ""
echo "2. Reinicia PM2 en el servidor:"
echo "   ssh ${SERVER_USER}@${SERVER_IP} 'cd ${BACKEND_DIR} && pm2 restart easygastos-backend'"
echo ""
echo "3. Verifica que esté corriendo:"
echo "   ssh ${SERVER_USER}@${SERVER_IP} 'pm2 status'"
