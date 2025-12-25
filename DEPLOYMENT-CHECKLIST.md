# ✅ Checklist de Deployment - EasyGastos Backend

## 📋 Pre-Deployment (Windows → Linux)

### 1. Verificación de Archivos a Transferir

**✅ INCLUIR:**
```
backend/
├── database/        # Modelos y configuración DB
├── middleware/      # Autenticación y validación
├── models/          # Modelos de datos
├── routes/          # Endpoints del API
├── scripts/         # Scripts de inicialización
├── server.js        # Servidor principal
├── package.json     # Dependencias
├── ecosystem.config.js  # Configuración PM2
├── .env.production.example  # Plantilla de configuración
├── setup-admin.sh   # Script de configuración inicial
└── deploy.sh        # Script de deployment
```

**❌ NO INCLUIR (se regenerarán en Linux):**
```
❌ node_modules/     # Se instala con npm install en el servidor
❌ .env              # Contiene configuración local de Windows
❌ logs/             # Se crean automáticamente
❌ uploads/          # (opcional, depende si tienes datos)
❌ apks/             # No necesario en el servidor
```

### 2. Alineación Frontend ↔ Backend

**✅ Límite de Gastos: Q3,500.00**
- [x] Frontend: `models/Settings.ts` → default: 3500
- [x] Frontend: `app/add-expense.tsx` → validación: 3500
- [x] Frontend: `app/(tabs)/settings.tsx` → default: 3500
- [x] Backend: `routes/expenses.js` → validación: 3500
- [x] Backend: `database/init.js` → config: 3500

**✅ Validaciones Sincronizadas:**
- [x] Monto mínimo: > Q0.00
- [x] Monto máximo: ≤ Q3,500.00
- [x] Duplicados: serie + noinvoice + fecha + monto
- [x] Liquidaciones: sin límite (suma de gastos)

---

## 🚀 Pasos de Deployment

### Paso 1: Preparar Archivos en Windows

```powershell
# En la carpeta del proyecto
cd c:\Apps\EasyGastosMobile\backend

# Limpiar archivos innecesarios
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force logs -ErrorAction SilentlyContinue
Remove-Item .env -ErrorAction SilentlyContinue

# Verificar que los archivos esenciales existan
Get-ChildItem -Name
```

### Paso 2: Transferir al Servidor Linux

**Opción A: SCP (Secure Copy)**
```powershell
# Desde Windows PowerShell
scp -r c:\Apps\EasyGastosMobile\backend usuario@IP_SERVIDOR:/home/usuario/
```

**Opción B: SFTP**
```powershell
# Usar WinSCP o FileZilla
# Transferir la carpeta backend/ completa (excepto node_modules)
```

**Opción C: Comprimido**
```powershell
# Comprimir
Compress-Archive -Path c:\Apps\EasyGastosMobile\backend\* -DestinationPath backend.zip

# Transferir el ZIP y descomprimir en Linux
scp backend.zip usuario@IP_SERVIDOR:/home/usuario/
```

### Paso 3: En el Servidor Linux

```bash
# Conectarse al servidor
ssh usuario@IP_SERVIDOR

# Ubicar los archivos
cd /home/usuario/backend

# Instalar dependencias (se descargarán las versiones para Linux)
npm install --production

# Configurar variables de entorno
cp .env.production.example .env
nano .env  # Editar JWT_SECRET y otras configuraciones

# Hacer ejecutables los scripts
chmod +x setup-admin.sh
chmod +x deploy.sh

# Ejecutar deployment
./deploy.sh
```

### Paso 4: Inicializar Base de Datos

```bash
# Asegurarse que MongoDB esté corriendo
sudo systemctl status mongod

# Inicializar la base de datos
npm run init-db

# Crear usuario administrador
./setup-admin.sh
```

### Paso 5: Iniciar con PM2

```bash
# Instalar PM2 globalmente (si no está instalado)
sudo npm install -g pm2

# Iniciar la aplicación
pm2 start ecosystem.config.js

# Guardar configuración para auto-inicio
pm2 startup
pm2 save

# Verificar estado
pm2 status
pm2 logs easygastos-backend
```

---

## 🔍 Verificación Post-Deployment

### 1. Verificar que el Servidor Está Corriendo

```bash
# Ver logs en tiempo real
pm2 logs easygastos-backend

# Deberías ver:
# ✅ Servidor ejecutándose en puerto 3000
# ✅ MongoDB conectado
# ✅ IP pública del servidor mostrada
```

### 2. Probar Conectividad

```bash
# Desde el mismo servidor
curl http://localhost:3000/health

# Desde otro equipo (reemplaza IP_SERVIDOR)
curl http://IP_SERVIDOR:3000/health

# Respuesta esperada:
# {"status":"ok","timestamp":"..."}
```

### 3. Verificar Firewall

```bash
# Ubuntu/Debian
sudo ufw status
# Debe mostrar: 3000/tcp ALLOW

# Si no está abierto:
sudo ufw allow 3000/tcp
sudo ufw enable
```

### 4. Verificar Base de Datos

```bash
# Conectarse a MongoDB
mongosh

# Usar la base de datos
use easygastos

# Ver colecciones
show collections

# Verificar configuración
db.configs.find().pretty()

# Debería mostrar:
# { "key": "max_expense_amount", "value": "3500", ... }

# Salir
exit
```

---

## 📱 Configurar App Móvil

### 1. Actualizar IP del Backend

Editar `config/backend.ts`:

```typescript
production: {
  baseUrl: 'http://IP_SERVIDOR:3000',  // ← Reemplaza con tu IP real
  timeout: 15000,
  retries: 5
},
```

### 2. Build de la App

```powershell
# Para APK de prueba
npx expo run:android --variant release

# O usar el script
.\build-and-install.ps1
```

---

## 🔧 Troubleshooting

### Problema: node_modules no funciona

**Causa:** Los módulos de Windows no son compatibles con Linux (especialmente los nativos como bcrypt)

**Solución:**
```bash
# Eliminar node_modules
rm -rf node_modules

# Limpiar caché de npm
npm cache clean --force

# Reinstalar
npm install --production
```

### Problema: Error de permisos

**Solución:**
```bash
# Dar permisos a los scripts
chmod +x *.sh

# Verificar propietario de archivos
ls -la
```

### Problema: MongoDB no conecta

**Solución:**
```bash
# Iniciar MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Ver logs
sudo journalctl -u mongod -f
```

### Problema: App no se conecta al backend

**Checklist:**
1. ✅ Servidor corriendo: `pm2 status`
2. ✅ Puerto abierto: `sudo ufw status`
3. ✅ IP correcta en `config/backend.ts`
4. ✅ Conectividad: `curl http://IP:3000/health`

---

## 📊 Monitoreo Continuo

```bash
# Ver logs en tiempo real
pm2 logs easygastos-backend

# Ver estado y uso de recursos
pm2 monit

# Reiniciar si es necesario
pm2 restart easygastos-backend

# Ver procesos
pm2 list
```

---

## ⚠️ IMPORTANTE - No Copiar node_modules

**¿Por qué NO copiar node_modules de Windows a Linux?**

1. **Binarios incompatibles**: Módulos nativos (bcrypt, etc.) están compilados para Windows
2. **Arquitectura diferente**: x64 vs ARM, 32-bit vs 64-bit
3. **Dependencias del sistema**: Rutas y librerías diferentes
4. **Tamaño innecesario**: node_modules puede pesar 200-500 MB
5. **npm install es rápido**: Toma solo 1-2 minutos en el servidor

**✅ Siempre ejecutar `npm install` en el servidor de destino**

---

## ✅ Checklist Final

Antes de considerar el deployment completo:

- [ ] Backend subido al servidor (sin node_modules)
- [ ] `npm install --production` ejecutado en Linux
- [ ] Variables de entorno configuradas (.env)
- [ ] MongoDB corriendo y conectado
- [ ] Base de datos inicializada (npm run init-db)
- [ ] Usuario administrador creado
- [ ] PM2 configurado y aplicación corriendo
- [ ] Firewall configurado (puerto 3000 abierto)
- [ ] Health endpoint responde: `/health`
- [ ] IP del backend configurada en la app móvil
- [ ] App móvil compilada y probada
- [ ] Límite de Q3,500 validado en ambos lados
- [ ] PM2 configurado para auto-inicio (`pm2 startup`)

---

## 📞 Soporte

Si encuentras problemas:

1. Ver logs: `pm2 logs easygastos-backend`
2. Ver errores de MongoDB: `sudo journalctl -u mongod -f`
3. Verificar conectividad: `curl http://localhost:3000/health`
4. Reiniciar servicios:
   ```bash
   pm2 restart easygastos-backend
   sudo systemctl restart mongod
   ```

---

**Última actualización: 23 de diciembre de 2025**
**Límite de gastos: Q3,500.00**
