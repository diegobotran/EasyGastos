# 📊 Importador de Facturas SAT

Este sistema permite importar facturas SAT desde archivos Excel a MongoDB de forma segura y eficiente.

## 🎯 Características

- ✅ Importa archivos Excel (.xlsx) con estructura de facturas SAT de Guatemala
- ✅ Crea una colección separada (`sat_facturas`) que no afecta la aplicación
- ✅ Detecta automáticamente duplicados por UUID
- ✅ Extrae la sociedad del nombre del archivo
- ✅ Maneja múltiples archivos en una sola ejecución
- ✅ Puede ejecutarse en local o en servidor remoto (AWS)
- ✅ Modo clean para limpiar e importar de nuevo

## 📁 Estructura de Archivos Excel

Los archivos Excel deben tener las siguientes columnas:

```
Fecha de emisión | Número de Autorización | Tipo de DTE (nombre) | Serie | 
Número del DTE | NIT del emisor | Nombre completo del emisor | 
ID del receptor | Nombre completo del receptor | Estado | Moneda | 
Gran Total (Moneda Original) | IVA (monto de este impuesto) | 
Marca de anulado | Fecha de anulación | ... (más columnas de impuestos)
```

### Ejemplo de Fila:
```
2026-02-01 | 8BED926F-D4F9-4BD0-8F51-155AE4AA934D | FACT | 8BED926F | 
3573107664 | 22392394 | CLARO GUATEMALA, SOCIEDAD ANONIMA | 336963 | 
INGENIO TULULA SOCIEDAD ANONIMA | Vigente | GTQ | 835.38 | 89.51 | No | ...
```

## 🚀 Uso Rápido

### 1️⃣ Colocar archivos Excel en la carpeta SAT

```powershell
# Copia tus archivos Excel a esta carpeta
backend\SAT\
```

**Ejemplos de nombres de archivo:**
- `facturas_INGENIO_TULULA_2026.xlsx`
- `CLARO_GUATEMALA_facturas.xlsx`
- `2026_facturas_SAT.xlsx`

> 💡 El sistema extrae automáticamente el nombre de la sociedad del nombre del archivo

### 2️⃣ Ejecutar el script de importación

#### En Local (MongoDB local):
```powershell
.\import-sat-facturas.ps1 -Local
```

#### En Servidor AWS:
```powershell
.\import-sat-facturas.ps1
```

#### Limpiar y volver a importar:
```powershell
.\import-sat-facturas.ps1 -Clean
```

#### Importar un archivo específico:
```powershell
.\import-sat-facturas.ps1 -Local -File "facturas_2026.xlsx"
```

## 📋 Estructura de la Colección MongoDB

Los datos se guardan en la colección `sat_facturas` con la siguiente estructura:

```javascript
{
  // Identificación única
  numeroAutorizacion: "8BED926F-D4F9-4BD0-8F51-155AE4AA934D", // UUID (índice único)
  
  // Datos generales del DTE
  fechaEmision: ISODate("2026-02-01T21:42:52.708Z"),
  tipoDTE: "FACT",
  serie: "8BED926F",
  numeroDTE: "3573107664",
  estado: "Vigente",
  moneda: "GTQ",
  
  // Emisor (Proveedor)
  nitEmisor: "22392394",
  nombreEmisor: "CLARO GUATEMALA, SOCIEDAD ANONIMA",
  clasificacionEmisor: "0",
  codigoEstablecimiento: "1",
  nombreEstablecimiento: "CLARO GUATEMALA",
  
  // Receptor (Cliente)
  idReceptor: "336963",
  nombreReceptor: "INGENIO TULULA SOCIEDAD ANONIMA",
  
  // Certificador
  nitCertificador: "56407734",
  nombreCertificador: "AINNOVA, SOCIEDAD ANONIMA",
  
  // Montos
  granTotal: 835.38,
  iva: 89.51,
  
  // Anulación
  marcaAnulado: false,
  fechaAnulacion: null,
  
  // Otros impuestos (todos en 0 si no aplican)
  impuestoPetroleo: 0,
  impuestoTurismoHospedaje: 0,
  impuestoTurismoPasajes: 0,
  impuestoTimbrePrensa: 0,
  impuestoBomberos: 0,
  impuestoTasaMunicipal: 0,
  impuestoBebidasAlcoholicas: 0,
  impuestoTabaco: 0,
  impuestoCemento: 0,
  impuestoBebidasNoAlcoholicas: 0,
  impuestoTarifaPortuaria: 0,
  
  // Flags adicionales
  exportacion: false,
  ubicacionTemporal: false,
  
  // Metadatos de importación
  importadoEn: ISODate("2026-02-16T10:30:00.000Z"),
  archivoOrigen: "facturas_INGENIO_TULULA_2026.xlsx",
  sociedad: "INGENIO TULULA",
  
  // Timestamps automáticos
  createdAt: ISODate("2026-02-16T10:30:00.000Z"),
  updatedAt: ISODate("2026-02-16T10:30:00.000Z")
}
```

## 🔍 Consultas Útiles en MongoDB

### Ver total de facturas importadas:
```javascript
db.sat_facturas.countDocuments()
```

### Ver facturas por sociedad:
```javascript
db.sat_facturas.find({ sociedad: "INGENIO TULULA" })
```

### Ver lista de sociedades:
```javascript
db.sat_facturas.distinct("sociedad")
```

### Ver facturas vigentes vs anuladas:
```javascript
// Vigentes
db.sat_facturas.countDocuments({ marcaAnulado: false })

// Anuladas
db.sat_facturas.countDocuments({ marcaAnulado: true })
```

### Ver facturas por rango de fechas:
```javascript
db.sat_facturas.find({
  fechaEmision: {
    $gte: ISODate("2026-02-01"),
    $lte: ISODate("2026-02-28")
  }
})
```

### Ver facturas de un proveedor específico:
```javascript
db.sat_facturas.find({ 
  nitEmisor: "22392394" 
})
```

### Obtener total de montos por sociedad:
```javascript
db.sat_facturas.aggregate([
  { $group: { 
    _id: "$sociedad", 
    total: { $sum: "$granTotal" },
    cantidad: { $sum: 1 }
  }},
  { $sort: { total: -1 } }
])
```

## 🔧 Mantenimiento

### Actualizar colección con nuevos datos:
```powershell
# Coloca los nuevos archivos Excel en backend\SAT
.\import-sat-facturas.ps1
```
> El sistema detecta duplicados por UUID y solo actualiza si hay cambios

### Limpiar completamente y reimportar:
```powershell
.\import-sat-facturas.ps1 -Clean
```

### Ver estadísticas después de importar:
El script muestra automáticamente:
- ✅ Facturas insertadas
- 🔄 Facturas actualizadas
- ❌ Errores encontrados
- 📈 Total de documentos en la colección
- 📊 Sociedades detectadas
- ✔️ Facturas vigentes vs anuladas

## ⚠️ Notas Importantes

1. **No afecta la app**: Esta colección (`sat_facturas`) es completamente independiente de las colecciones de la aplicación (`expenses`, `liquidations`, etc.)

2. **Duplicados**: El sistema usa el `numeroAutorizacion` (UUID) como clave única. Si importas el mismo archivo dos veces, se actualizarán los registros existentes en lugar de duplicarlos.

3. **Nombre de sociedad**: Se extrae automáticamente del nombre del archivo. Es recomendable usar nombres descriptivos como:
   - ✅ `facturas_INGENIO_TULULA_2026.xlsx`
   - ✅ `CLARO_GUATEMALA_2026.xlsx`
   - ❌ `datos.xlsx` (nombre poco descriptivo)

4. **Formato de fecha**: Las fechas en Excel se convierten automáticamente al formato ISO de MongoDB

5. **Montos numéricos**: Si hay errores en los montos del Excel, se guardan como 0

## 🛠️ Troubleshooting

### Error: "No existe la carpeta backend\SAT"
```powershell
mkdir backend\SAT
```

### Error: "No se encontraron archivos Excel"
- Verifica que los archivos tengan extensión `.xlsx`
- Asegúrate de que estén en `backend\SAT`

### Error: "MongoDB no está corriendo"
```powershell
# En Windows
net start MongoDB

# Verificar
mongosh --eval "db.version()"
```

### Error al conectar al servidor AWS
- Verifica la IP del servidor
- Asegúrate de tener acceso SSH

## 📞 Soporte

Para más información sobre la estructura de las facturas SAT, consulta:
- [VALIDACION-SAT-FEL.md](../VALIDACION-SAT-FEL.md)
- [MANEJO-NITS-FACTURAS.md](../MANEJO-NITS-FACTURAS.md)
