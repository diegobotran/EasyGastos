# EasyGastos Backoffice

Aplicación web administrativa del MVP2 EP-01 para gestionar:

- Sociedad–NIT;
- Centros;
- Cuentas;
- Órdenes CO;
- vigencia de factura.

## Configuración

Copiar `.env.example` a `.env.local` y configurar la URL del backend cuando no se ejecute en `http://localhost:3000`:

```text
VITE_API_URL=https://backend.example.com
```

El usuario debe existir en EasyGastos y tener `isAdmin = true`. El acceso usa el mismo correo, PIN de cuatro dígitos y JWT de la aplicación móvil.

## Comandos

```text
npm install
npm run dev
npm run build
npm test
npm run test:e2e
```

Las pruebas E2E usan el canal instalado de Microsoft Edge. No requieren conexión a MongoDB porque simulan únicamente las respuestas HTTP necesarias para verificar los recorridos del navegador.

## Integración backend

En desarrollo, el backend admite de forma predeterminada los orígenes `http://localhost:5173` y `http://127.0.0.1:5173`. Para otros dominios se debe configurar `ALLOWED_ORIGINS` en el backend.
