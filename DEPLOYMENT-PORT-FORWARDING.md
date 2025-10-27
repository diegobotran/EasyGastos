# 🌐 Checklist para Deployment con IP Pública y Port Forwarding

## ✅ **CONFIGURACIÓN DEL SERVIDOR (Verificar antes del deployment)**

### **1. Variables de Entorno (.env en el servidor):**

```bash
# CONFIGURACIÓN CRÍTICA PARA PRODUCCIÓN
NODE_ENV=production
PORT=3000
BIND_IP=0.0.0.0  # ✅ CRÍTICO: Permite conexiones externas

# Base de datos (localhost en el servidor)
MONGODB_URI=mongodb://localhost:27017/easygastos

# JWT Secret (CAMBIAR por uno seguro)
JWT_SECRET=GENERAR_SECRETO_SEGURO_64_CARACTERES

# CORS (en producción se permite todo automáticamente)
ALLOWED_ORIGINS=*

# Rate limiting para producción
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=500
```

### **2. Port Forwarding en Router/Firewall:**

```
✅ Puerto externo: 3000 (o el que prefieras)
✅ Puerto interno: 3000 (del servidor)
✅ Protocolo: TCP
✅ IP destino: IP interna del servidor Linux
```

### **3. Firewall del Servidor Linux:**

```bash
# Ubuntu/Debian (UFW)
sudo ufw allow 3000/tcp
sudo ufw allow ssh
sudo ufw enable

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload
```

## 📱 **CONFIGURACIÓN DE LA APP MÓVIL**

### **Archivo a modificar: `config/backend.ts`**

**ANTES del deployment, cambiar:**

```typescript
// LÍNEA 11 - En getBaseUrl():
return 'http://TU_IP_PUBLICA:3000';

// LÍNEA 21 - En production.baseUrl:
baseUrl: 'http://TU_IP_PUBLICA:3000',
```

**DESPUÉS del deployment, usar tu IP real:**

```typescript
// Ejemplo si tu IP pública es 203.0.113.45:
return 'http://203.0.113.45:3000';

// Y también en production:
baseUrl: 'http://203.0.113.45:3000',
```

## 🔧 **PASOS DE DEPLOYMENT OPTIMIZADOS**

### **1. En tu Servidor Linux:**

```bash
# 1. Deployment automático
./deploy.sh

# 2. Generar JWT secret seguro
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
echo "JWT_SECRET=$JWT_SECRET" >> .env

# 3. Configurar producción
echo "NODE_ENV=production" >> .env
echo "BIND_IP=0.0.0.0" >> .env

# 4. Reiniciar con nueva configuración
pm2 restart easygastos-backend

# 5. Crear usuario administrador
./setup-admin.sh

# 6. Verificar que escucha en todas las interfaces
netstat -tuln | grep :3000
# Debe mostrar: 0.0.0.0:3000
```

### **2. Verificación de Conectividad:**

```bash
# DESDE EL SERVIDOR (interno):
curl http://localhost:3000/health

# DESDE INTERNET (externo):
curl http://TU_IP_PUBLICA:3000/health
# Debe retornar: {"status":"ok","timestamp":"..."}
```

### **3. En la App (después de tener la IP):**

```typescript
// 1. Editar config/backend.ts con tu IP real
// 2. Compilar app para producción
// 3. Probar conectividad desde el móvil
```

## 🚨 **PROBLEMAS COMUNES Y SOLUCIONES**

### **❌ "Connection refused" desde internet:**

```bash
# Verificar que el servidor escucha en 0.0.0.0:
netstat -tuln | grep :3000

# Si muestra 127.0.0.1:3000, cambiar BIND_IP:
echo "BIND_IP=0.0.0.0" >> .env
pm2 restart easygastos-backend
```

### **❌ "Timeout" desde la app:**

```bash
# 1. Verificar port forwarding en router
# 2. Verificar firewall del servidor:
sudo ufw status

# 3. Verificar que el puerto está abierto:
sudo ss -tuln | grep :3000
```

### **❌ "CORS error" en la app:**

```bash
# Verificar que NODE_ENV=production:
grep NODE_ENV .env

# Si no está, agregarlo:
echo "NODE_ENV=production" >> .env
pm2 restart easygastos-backend
```

### **❌ "Token expirado" frecuentemente:**

```bash
# Verificar que el JWT_SECRET es consistente:
grep JWT_SECRET .env

# Si cambió, regenerar token en la app
```

## 📊 **COMANDOS DE MONITOREO**

### **Estado del servidor:**

```bash
pm2 status
pm2 logs easygastos-backend --lines 50
```

### **Conexiones activas:**

```bash
sudo ss -tuln | grep :3000
sudo netstat -an | grep :3000
```

### **Logs del sistema:**

```bash
tail -f /var/log/syslog | grep easy
journalctl -u mongod -f
```

## 🎯 **CONFIGURACIÓN FINAL PERFECTA**

**Tu setup final debe ser:**

- ✅ Servidor escucha en `0.0.0.0:3000`
- ✅ Router hace port forwarding: `IP_PUBLICA:3000 → SERVIDOR_INTERNO:3000`
- ✅ Firewall permite puerto 3000
- ✅ App configurada con `http://IP_PUBLICA:3000`
- ✅ JWT_SECRET único y seguro
- ✅ NODE_ENV=production

**¡Con esta configuración funcionará perfectamente con port forwarding!** 🎉
