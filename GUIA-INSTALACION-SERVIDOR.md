# 🚀 Guía de Instalación del Backend en Servidor

## 📋 Requisitos Previos

### En tu servidor Linux (Ubuntu/Debian):
```bash
# Verificar que tengas instalado:
node --version    # Debe ser >= v18
npm --version
mongod --version  # MongoDB debe estar corriendo
```

Si falta algo:
```bash
# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar MongoDB
sudo apt-get install -y mongodb

# Iniciar MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod
```

---

## 🔧 Método 1: Instalación Automática (Recomendado)

### Paso 1: Subir el código al servidor

```bash
# Opción A: Via Git
git clone https://github.com/tu-usuario/EasyGastosMobile.git
cd EasyGastosMobile/backend

# Opción B: Via SCP desde tu PC Windows
# En PowerShell:
scp -r C:\Apps\EasyGastosMobile\backend usuario@IP_SERVIDOR:/home/usuario/
```

### Paso 2: Dar permisos de ejecución
```bash
cd /home/usuario/backend
chmod +x deploy.sh
chmod +x get-public-ip.sh
chmod +x setup-admin.sh
```

### Paso 3: Ejecutar deployment automático
```bash
./deploy.sh
```

El script automáticamente:
- ✅ Instala PM2 (gestor de procesos)
- ✅ Configura variables de entorno
- ✅ Inicia el servidor en background
- ✅ Configura auto-inicio al reiniciar servidor
- ✅ Te muestra tu IP pública para configurar la app

### Paso 4: Verificar que funciona
```bash
# Ver estado del servidor
pm2 status

# Ver logs en tiempo real
pm2 logs easygastos-backend

# Hacer un test
curl http://localhost:3000/health
# Debe responder: {"status":"ok"}
```

### Paso 5: Obtener configuración para la app móvil
```bash
./get-public-ip.sh
```

Te mostrará algo como:
```
✅ Tu IP pública es: 123.45.67.89
✅ URL del backend: http://123.45.67.89:3000

📱 Configura tu app móvil con:
   Backend URL: http://123.45.67.89:3000
```

---

## 🔧 Método 2: Instalación Manual

### Paso 1: Preparar directorio
```bash
mkdir -p /var/www/easygastos-backend
cd /var/www/easygastos-backend
```

### Paso 2: Copiar archivos del backend
```bash
# Copiar todos los archivos de la carpeta backend/
cp -r /ruta/origen/backend/* .
```

### Paso 3: Instalar dependencias
```bash
npm install
```

### Paso 4: Configurar variables de entorno
```bash
# Copiar plantilla
cp .env.production.example .env

# Editar archivo (usar nano o vi)
nano .env
```

Contenido del `.env`:
```env
# Puerto del servidor
PORT=3000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/easygastos

# JWT Secret (CAMBIAR a algo seguro y único)
JWT_SECRET=tu_clave_super_secreta_cambiar_esto_123456

# Entorno
NODE_ENV=production
```

### Paso 5: Instalar PM2 (gestor de procesos)
```bash
sudo npm install -g pm2
```

### Paso 6: Iniciar servidor con PM2
```bash
pm2 start server.js --name easygastos-backend

# Configurar auto-inicio
pm2 startup
pm2 save
```

### Paso 7: Verificar funcionamiento
```bash
pm2 status
pm2 logs easygastos-backend
```

---

## 🌐 Configuración de Firewall

Si tienes firewall activo, abre el puerto 3000:

```bash
# UFW (Ubuntu)
sudo ufw allow 3000/tcp
sudo ufw reload

# Firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

---

## 🔐 Crear Usuario Administrador

```bash
./setup-admin.sh
```

O manualmente:
```bash
node -e "
const User = require('./models/User');
const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/easygastos')
  .then(async () => {
    const user = new User({
      email: 'admin@easygastos.com',
      firstName: 'Admin',
      lastName: 'Sistema',
      department: 'IT',
      isManager: true
    });
    user.setPin('1234');
    await user.save();
    console.log('✅ Usuario admin creado');
    process.exit(0);
  });
"
```

---

## 📱 Configurar App Móvil

### Paso 1: Obtener IP pública del servidor
```bash
# En el servidor:
curl -4 ifconfig.me
# O usar el script:
./get-public-ip.sh
```

### Paso 2: Actualizar config/backend.ts
```typescript
// En tu proyecto móvil
export const getAPI_BASE_URL = async (): Promise<string> => {
  // Cambiar por tu IP real:
  return 'http://123.45.67.89:3000';
};
```

### Paso 3: Recompilar y instalar APK
```powershell
# En Windows:
.\build-and-install.ps1
```

---

## 🔧 Comandos Útiles PM2

```bash
# Ver estado
pm2 status

# Ver logs en tiempo real
pm2 logs easygastos-backend

# Ver logs con filtro
pm2 logs easygastos-backend --lines 100

# Reiniciar servidor
pm2 restart easygastos-backend

# Detener servidor
pm2 stop easygastos-backend

# Eliminar de PM2
pm2 delete easygastos-backend

# Monitorear recursos
pm2 monit
```

---

## 🐛 Troubleshooting

### Puerto 3000 ya está en uso
```bash
# Ver qué proceso usa el puerto
sudo lsof -i :3000

# Matar proceso
sudo kill -9 [PID]
```

### MongoDB no está corriendo
```bash
sudo systemctl status mongod
sudo systemctl start mongod
```

### No puedo conectar desde la app móvil
1. Verificar firewall: `sudo ufw status`
2. Verificar que el servidor escucha en todas las interfaces:
   ```bash
   netstat -tuln | grep 3000
   # Debe mostrar: 0.0.0.0:3000
   ```
3. Verificar router (si aplica) - ver `DEPLOYMENT-PORT-FORWARDING.md`

### Error de permisos
```bash
# Dar permisos al directorio
sudo chown -R $USER:$USER /var/www/easygastos-backend
```

---

## 📊 Verificar Instalación

### Test 1: Health check
```bash
curl http://localhost:3000/health
# Respuesta esperada: {"status":"ok"}
```

### Test 2: Registro de usuario
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@test.com",
    "firstName": "Test",
    "lastName": "User",
    "department": "IT",
    "pin": "1234"
  }'
```

### Test 3: Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@test.com",
    "pin": "1234"
  }'
```

---

## 🔄 Actualizar el Backend

Cuando hagas cambios en el código:

```bash
# Opción 1: Con Git
git pull origin main
npm install
pm2 restart easygastos-backend

# Opción 2: Subir archivos y reiniciar
# Después de subir vía SCP:
npm install
pm2 restart easygastos-backend
```

---

## 📝 Notas Importantes

1. **Seguridad:**
   - Cambia el `JWT_SECRET` por algo único y seguro
   - No expongas MongoDB directamente a internet
   - Considera usar HTTPS en producción (requiere certificado SSL)

2. **Respaldos:**
   - Respalda MongoDB regularmente:
     ```bash
     mongodump --db easygastos --out /backup/$(date +%Y%m%d)
     ```

3. **Logs:**
   - PM2 guarda logs en: `~/.pm2/logs/`
   - MongoDB logs: `/var/log/mongodb/`

4. **Performance:**
   - PM2 automáticamente reinicia el servidor si falla
   - Para producción grande, considera usar cluster mode de PM2

---

## ✅ Checklist Final

- [ ] Node.js y MongoDB instalados
- [ ] Backend código copiado al servidor
- [ ] Dependencias instaladas (`npm install`)
- [ ] Variables de entorno configuradas (`.env`)
- [ ] PM2 instalado y servidor iniciado
- [ ] Firewall configurado (puerto 3000 abierto)
- [ ] Health check funcionando (`curl http://localhost:3000/health`)
- [ ] IP pública obtenida
- [ ] App móvil configurada con IP correcta
- [ ] Usuario admin creado

---

## 🆘 Soporte

Si tienes problemas:
1. Revisa logs: `pm2 logs easygastos-backend`
2. Verifica MongoDB: `sudo systemctl status mongod`
3. Prueba conexión local: `curl http://localhost:3000/health`
4. Verifica firewall: `sudo ufw status`
