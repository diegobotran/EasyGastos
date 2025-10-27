#!/bin/bash

# 🌐 Script para obtener IP pública y generar configuración para la app

echo "🌐 Obteniendo IP pública para configuración de la app..."
echo "====================================================="

# Intentar obtener IP pública de múltiples fuentes
echo "🔍 Detectando IP pública..."

# Método 1: ifconfig.me
IP1=$(curl -s --max-time 5 ifconfig.me 2>/dev/null)

# Método 2: ipinfo.io
IP2=$(curl -s --max-time 5 ipinfo.io/ip 2>/dev/null)

# Método 3: httpbin.org
IP3=$(curl -s --max-time 5 httpbin.org/ip 2>/dev/null | grep -oP '"origin":\s*"\K[^"]+' | cut -d',' -f1)

# Método 4: checkip.amazonaws.com
IP4=$(curl -s --max-time 5 checkip.amazonaws.com 2>/dev/null)

# Determinar la IP más confiable
PUBLIC_IP=""
if [[ $IP1 =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    PUBLIC_IP=$IP1
elif [[ $IP2 =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    PUBLIC_IP=$IP2
elif [[ $IP3 =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    PUBLIC_IP=$IP3
elif [[ $IP4 =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    PUBLIC_IP=$IP4
fi

if [ -z "$PUBLIC_IP" ]; then
    echo "❌ No se pudo obtener la IP pública automáticamente"
    echo "🔧 Obtén tu IP manualmente visitando: https://ifconfig.me"
    echo ""
    echo "📝 Luego usa esa IP en la configuración de la app"
    exit 1
fi

echo "✅ IP pública detectada: $PUBLIC_IP"
echo ""

# Mostrar configuración para la app
echo "📱 CONFIGURACIÓN PARA LA APP MÓVIL:"
echo "===================================="
echo ""
echo "Archivo a editar: config/backend.ts"
echo ""
echo "🔧 CAMBIOS REQUERIDOS:"
echo ""
echo "1. En la línea ~11, cambiar:"
echo "   ANTES: return 'http://TU_IP_PUBLICA_AQUI:3000';"
echo "   DESPUÉS: return 'http://$PUBLIC_IP:3000';"
echo ""
echo "2. En la línea ~21, cambiar:"
echo "   ANTES: baseUrl: 'http://TU_IP_PUBLICA_AQUI:3000',"
echo "   DESPUÉS: baseUrl: 'http://$PUBLIC_IP:3000',"
echo ""

# Generar código listo para copiar
echo "📋 CÓDIGO LISTO PARA COPIAR:"
echo "============================"
cat << EOF

// Para getBaseUrl():
return 'http://$PUBLIC_IP:3000';

// Para production.baseUrl:
baseUrl: 'http://$PUBLIC_IP:3000',

EOF

echo ""
echo "🔗 URLS DE PRUEBA:"
echo "=================="
echo ""
echo "Health check: http://$PUBLIC_IP:3000/health"
echo "API info: http://$PUBLIC_IP:3000/api"
echo "Página principal: http://$PUBLIC_IP:3000"
echo ""

# Verificar si el servidor está ejecutándose
echo "🔍 VERIFICANDO CONECTIVIDAD:"
echo "============================"
echo ""

if command -v curl >/dev/null; then
    echo "Probando conexión local al servidor..."
    if curl -s http://localhost:3000/health >/dev/null 2>&1; then
        echo "✅ Servidor responde localmente"
        
        echo "Probando conexión externa..."
        if curl -s --max-time 10 http://$PUBLIC_IP:3000/health >/dev/null 2>&1; then
            echo "✅ Servidor accesible desde internet"
            echo "🎉 ¡Tu backend está listo para la app móvil!"
        else
            echo "❌ Servidor NO accesible desde internet"
            echo "🔧 Verifica:"
            echo "   1. Port forwarding configurado: $PUBLIC_IP:3000 → servidor_interno:3000"
            echo "   2. Firewall del servidor permite puerto 3000"
            echo "   3. Router/ISP permite port forwarding"
        fi
    else
        echo "❌ Servidor no responde localmente"
        echo "🔧 Verifica que el servidor esté ejecutándose:"
        echo "   pm2 status"
        echo "   pm2 logs easygastos-backend"
    fi
else
    echo "⚠️  curl no está instalado, no se puede verificar automáticamente"
    echo "🔧 Instala curl: sudo apt install curl"
fi

echo ""
echo "📚 DOCUMENTACIÓN:"
echo "================="
echo "Ver DEPLOYMENT-PORT-FORWARDING.md para más detalles"
echo ""
echo "🔄 PARA USAR ESTE SCRIPT OTRA VEZ:"
echo "=================================="
echo "./get-public-ip.sh"