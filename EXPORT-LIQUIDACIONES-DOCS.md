# 📄 Funcionalidad de Exportación de Liquidaciones

## 🎯 Descripción General

Se ha implementado la funcionalidad para exportar liquidaciones aprobadas a formato CSV, permitiendo generar reportes para SAP o para archivo detallado.

## ✅ Características Implementadas

### 1. **Servicio de Exportación** (`services/ExportService.ts`)

Dos funciones principales:

#### `generateLiquidationCSV()` - Formato SAP
Genera un CSV compatible con el formato corporativo de SAP, siguiendo la estructura del documento de referencia:

**Estructura del archivo:**
```
LIQUIDACION DE GASTOS
NO. DE DOCUMENTO GENERADO SAP, [NUMERO_SAP]

REINTEGRO A FAVOR DE:, [NOMBRE_EMPLEADO]
CODIGO, [CODIGO_EMPLEADO]

[TABLA CON GASTOS]
No, CUENTA CONTABLE, AFECTO IVA, MONTO, CENTRO, ORDEN, SERIE, FACTURA, FECHA, NIT, PROVEEDOR, DESCRIPCION

FECHA DE LIQUIDACION:, [TOTAL], [FECHA]
SOLICITANTE:, [NOMBRE]
TOTAL, [MONTO]
AUTORIZADO POR:, [APROBADOR]
```

**Campos incluidos:**
- No. consecutivo
- Cuenta Contable
- Afecto IVA (12 si tiene IVA, 0 si no)
- Monto
- Centro de Costo (default: 4001010001)
- Orden Interna (default: 2000002387)
- Serie de Factura
- No. de Factura
- Tipo Documento (LG)
- Fecha de Factura
- NIT
- Nombre del Proveedor
- Descripción

#### `generateDetailedLiquidationCSV()` - Formato Detallado
Genera un CSV completo con toda la información de la liquidación y los gastos:

**Secciones:**
1. **Información de Liquidación**
   - ID, Número SAP, Estado, Fechas
   - Empleado, Aprobador
   - Total de gastos y monto

2. **Detalle de Gastos**
   - Todos los campos del gasto
   - ID, Descripción, Monto, Categoría
   - Proveedor, NIT, Factura
   - Departamento, Centro, Cuenta
   - IVA, Moneda, Estado, Notas

3. **Resumen**
   - Cantidad de gastos
   - Suma de montos
   - Suma de IVA
   - Total de liquidación

### 2. **Integración en Pantalla de Detalle**

#### Botón de Exportación
- Aparece **solo cuando la liquidación está aprobada** (`status='approved'`)
- Color verde para distinguirlo de otros botones
- Icono de descarga para claridad visual

#### Flujo de Usuario
1. Usuario abre liquidación aprobada
2. Ve botón "Descargar CSV" (verde)
3. Al presionar, aparece diálogo con 2 opciones:
   - **CSV Formato SAP**: Compatible con sistema corporativo
   - **CSV Detallado**: Información completa
4. Selecciona formato deseado
5. Se genera el archivo
6. Se abre diálogo de compartir del sistema operativo
7. Usuario puede:
   - Enviar por WhatsApp
   - Enviar por Email
   - Guardar en Google Drive
   - Guardar en almacenamiento local
   - Compartir por otras apps

### 3. **Dependencias Instaladas**

```json
"expo-file-system": "~15.x.x"  // Manejo de archivos locales
"expo-sharing": "~13.x.x"       // Compartir archivos
```

## 📱 Uso en la App

### Condiciones para Exportar:
- ✅ Liquidación debe estar en estado `approved`
- ✅ Debe tener al menos 1 gasto
- ✅ Dispositivo debe soportar compartir archivos

### Proceso de Exportación:

```typescript
// 1. Usuario presiona "Descargar CSV"
handleDownloadCSV()

// 2. Aparece Alert con opciones
Alert.alert('Exportar Liquidación', '...')

// 3. Si elige "CSV Formato SAP"
await generateLiquidationCSV(liquidation, expenses)

// 4. Si elige "CSV Detallado"
await generateDetailedLiquidationCSV(liquidation, expenses)

// 5. Se genera archivo y se comparte
await Sharing.shareAsync(fileUri, {...})
```

### Nombres de Archivo:
- **SAP**: `Liquidacion_[ID6digitos]_[timestamp].csv`
- **Detallado**: `Liquidacion_Detallada_[ID6digitos]_[timestamp].csv`

## 🔧 Detalles Técnicos

### Escapado de CSV
Los campos que contienen comas, comillas o saltos de línea se escapan correctamente:
```typescript
if (field.includes(',') || field.includes('"') || field.includes('\n')) {
  return `"${field.replace(/"/g, '""')}"`;
}
```

### Encoding
Se usa UTF-8 para soportar caracteres especiales (ñ, tildes, etc.):
```typescript
await FileSystem.writeAsStringAsync(fileUri, csvContent, {
  encoding: FileSystem.EncodingType.UTF8,
});
```

### Compartir
Se usa la API nativa de compartir del sistema operativo:
```typescript
await Sharing.shareAsync(fileUri, {
  mimeType: 'text/csv',
  dialogTitle: 'Exportar Liquidación de Gastos',
  UTI: 'public.comma-separated-values-text',
});
```

## 📊 Ejemplo de Salida CSV (Formato SAP)

```csv
LIQUIDACION DE GASTOS
NO. DE DOCUMENTO GENERADO SAP,6100002069

REINTEGRO A FAVOR DE:,CHRISTIAN ROLANDO RUIZ OLIVA
CODIGO,2101170

No,CUENTA CONTABLE,AFECTO IVA,MONTO,In.CME de destino,CENTRO DE COSTO,ORDEN INTERNA,SERIE DE FACTURA,NO. DE FACTURA,TP DOC,FECHA DE FACTURA,NIT,NOMBRE DEL PROVEEDOR,DESCRIPCION
1,7121402,12,134.60,,4001010001,2000002387,0,05752,LG,04.03.2025,C/F,Viajala El Salvador,Viaticos
2,7121402,12,211.22,,4001010001,2000002387,0,05998,LG,05.03.2025,C/F,CARIBE HOSPITALITY EL SALVADOR,Hospedaje Arnoldo Merida
3,7121402,12,211.22,,4001010001,2000002387,0,06000,LG,05.03.2025,C/F,CARIBE HOSPITALITY EL SALVADOR,Hospedaje Junior Landaverry
4,7121402,12,211.22,,4001010001,2000002387,0,06001,LG,05.03.2025,C/F,CARIBE HOSPITALITY EL SALVADOR,Hospedaje Christian Ruiz
5,7121402,0,1.00,,4001010001,2000002387,0,337854,LG,04.03.2025,C/F,DESARROLLO COMERCIAL,Parqueo

FECHA DE LIQUIDACION:,769.26,3/14/2024
SOLICITANTE:,Christian Ruiz
TOTAL,769.26
AUTORIZADO POR:,Junior Landaverry

FIRMA:,_________________________,FIRMA:,_________________________
```

## ✅ Ventajas de esta Implementación

1. **📱 Nativo**: Usa APIs nativas de Expo
2. **🔄 Offline**: Funciona sin conexión a internet
3. **📤 Flexible**: Permite compartir por múltiples canales
4. **💾 No ocupa espacio**: Archivos temporales se limpian automáticamente
5. **🎯 Dos formatos**: SAP (corporativo) y Detallado (análisis)
6. **📊 Compatible**: CSV abre en Excel, Google Sheets, Numbers, etc.
7. **🔒 Seguro**: Solo exporta liquidaciones aprobadas
8. **🎨 UX Simple**: 2 toques para compartir archivo

## 🚀 Futuras Mejoras (Opcional)

- [ ] Generar PDF con diseño visual del documento
- [ ] Envío automático por email al aprobador
- [ ] Upload automático a servidor/SAP
- [ ] Exportación masiva de múltiples liquidaciones
- [ ] Plantillas personalizables por empresa
- [ ] Firma digital integrada
- [ ] QR code con ID de liquidación

## 🧪 Testing

Para probar la funcionalidad:

1. Crear una liquidación con varios gastos
2. Enviarla al jefe
3. Aprobarla (desde cuenta de jefe)
4. Abrir detalle de liquidación
5. Presionar "Descargar CSV"
6. Seleccionar formato
7. Verificar que se abre diálogo de compartir
8. Compartir por WhatsApp o email
9. Abrir archivo en Excel/Sheets y verificar formato

## 📝 Notas Importantes

- El botón solo aparece si `liquidation.status === 'approved'`
- Se requiere tener gastos en la liquidación
- El archivo se genera en el directorio temporal del dispositivo
- El sistema operativo limpia archivos temporales automáticamente
- CSV usa `,` como delimitador (estándar internacional)
- Para abrir en Excel en español, usar "Datos > Desde archivo CSV" y seleccionar UTF-8
