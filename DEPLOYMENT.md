# 🚀 Guía de Deployment - EasyGastos Backend con Autenticación JWT

## 🔐 Sistema de Autenticación

EasyGastos utiliza **autenticación JWT (JSON Web Tokens)** para proteger el backend:

- ✅ **Registro offline**: Los usuarios se registran en la app sin conexión
- ✅ **Login con PIN**: Autenticación local con PIN de 4 dígitos
- ✅ **Tokens JWT**: Válidos por 48 horas para acceso al backend
- ✅ **Sync automático**: Cuando hay conexión, obtiene token automáticamente
- ✅ **Seguridad**: Todos los endpoints protegidos requieren token válido

## 📋 Pasos para Deployment en Servidor

### 1. Preparar el Servidor

```bash
# Instalar Node.js (versión 18 o superior)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Iniciar MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Instalar PM2 para manejo de procesos
sudo npm install -g pm2
```

### 2. Configurar el Backend

```bash
# Subir archivos al servidor
scp -r backend/ user@tu-servidor:/home/user/easygastos-backend/

# En el servidor
cd /home/user/easygastos-backend/
npm install --production

# Configurar variables de entorno
cp .env.production.example .env
nano .env  # Editar configuración según el servidor
```

### 3. Configurar Firewall

```bash
# Ubuntu/Debian
sudo ufw allow 3000/tcp
sudo ufw allow 22/tcp
sudo ufw allow 27017/tcp  # Solo si MongoDB está en otro servidor
sudo ufw enable

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### 4. Iniciar con PM2

```bash
# Crear archivo de configuración PM2
cat > ecosystem.config.js << EOF
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
    time: true
  }]
};
EOF

# Crear directorio de logs
mkdir -p logs

# Iniciar aplicación
pm2 start ecosystem.config.js

# Configurar PM2 para auto-inicio
pm2 startup
pm2 save
```

### 5. Configurar Usuario Administrador Inicial

```bash
# IMPORTANTE: Ejecutar después de iniciar el servidor
chmod +x setup-admin.sh
./setup-admin.sh

# Sigue las instrucciones para crear el primer usuario manager
# Este usuario podrá crear otros usuarios y tener acceso completo
```

## 📱 Configuración de la App Móvil

### 1. Actualizar Configuración del Backend

Edita el archivo `config/backend.ts`:

```typescript
// En producción, cambiar esta línea:
production: {
  baseUrl: 'http://TU_IP_PUBLICA:3000', // ← Cambiar por la IP real del servidor
  timeout: 15000,
  retries: 5
},
```

### 2. Ejemplo de Configuración Real

```typescript
// Ejemplo si tu servidor tiene IP 203.0.113.5
production: {
  baseUrl: 'http://203.0.113.5:3000',
  timeout: 15000,
  retries: 5
},
```

### 3. Build de la App

```bash
# Para Android
npx expo build:android

# O para APK local
npx expo run:android --variant release
```

## 🔧 Troubleshooting

### Problema: App no se conecta al backend

**Solución:**

1. Verificar que el servidor esté ejecutándose: `pm2 status`
2. Verificar logs del servidor: `pm2 logs easygastos-backend`
3. Probar conectividad: `curl http://TU_IP:3000/health`
4. Verificar firewall: `sudo ufw status`

### Problema: Error de CORS

**Solución:**

- El backend ya está configurado para permitir todas las conexiones en producción
- Verificar que `NODE_ENV=production` esté configurado

### Problema: MongoDB no conecta

**Solución:**

1. Verificar que MongoDB esté ejecutándose: `sudo systemctl status mongod`
2. Verificar logs: `sudo journalctl -u mongod`
3. Verificar configuración en `.env`

## 🌐 Configuración con Dominio (Opcional)

Si tienes un dominio (ej: api.tuempresa.com):

1. **Configurar DNS** para apuntar a tu servidor
2. **Instalar Nginx** como reverse proxy:

```bash
sudo apt install nginx

# Configurar Nginx
sudo nano /etc/nginx/sites-available/easygastos
```

3. **Configuración Nginx:**

```nginx
server {
    listen 80;
    server_name api.tuempresa.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

4. **Actualizar config de la app:**

```typescript
production: {
  baseUrl: 'http://api.tuempresa.com',
  timeout: 15000,
  retries: 5
},
```

## 📊 Monitoreo

```bash
# Ver logs en tiempo real
pm2 logs easygastos-backend

# Ver estado de la aplicación
pm2 status

# Reiniciar si es necesario
pm2 restart easygastos-backend

# Ver métricas
pm2 monit
```

## 🔐 Seguridad Adicional

1. **Cambiar puerto SSH por defecto**
2. **Configurar fail2ban**
3. **Usar certificados SSL con Let's Encrypt**
4. **Configurar backup automático de MongoDB**
5. **Actualizar el JWT_SECRET en producción**

---

**📝 Notas Importantes:**

- La IP del servidor se mostrará automáticamente en los logs al iniciar
- El backend ya está configurado para aceptar conexiones desde cualquier IP
- MongoDB permanece en localhost por seguridad
- Considera usar HTTPS en producción con certificados SSL
