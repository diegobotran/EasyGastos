# 📋 Plantilla de Archivo Excel para Facturas SAT

Esta es una guía de referencia de las columnas que debe tener tu archivo Excel.

## Columnas Requeridas (en este orden)

1. **Fecha de emisión** - Formato: ISO 8601 o fecha de Excel (ej: `2026-02-01T21:42:52.708-06:00`)
2. **Número de Autorización** - UUID único (ej: `8BED926F-D4F9-4BD0-8F51-155AE4AA934D`)
3. **Tipo de DTE (nombre)** - Tipo de documento (ej: `FACT`)
4. **Serie** - Serie de la factura (ej: `8BED926F`)
5. **Número del DTE** - Número del documento (ej: `3573107664`)
6. **Clasificación emisor** - Código clasificación (ej: `0`)
7. **Exportación** - Si/No o Yes/No
8. **Ubicación temporal** - Si/No o Yes/No
9. **NIT del emisor** - NIT del proveedor (ej: `22392394`)
10. **Nombre completo del emisor** - Nombre del proveedor (ej: `CLARO GUATEMALA, SOCIEDAD ANONIMA`)
11. **Código de establecimiento** - Código (ej: `1`)
12. **Nombre del establecimiento** - Nombre (ej: `CLARO GUATEMALA`)
13. **ID del receptor** - ID del cliente (ej: `336963`)
14. **Nombre completo del receptor** - Nombre del cliente (ej: `INGENIO TULULA SOCIEDAD ANONIMA`)
15. **NIT del Certificador** - NIT certificador (ej: `56407734`)
16. **Nombre completo del Certificador** - Nombre (ej: `AINNOVA, SOCIEDAD ANONIMA`)
17. **Estado** - Estado del DTE (ej: `Vigente`)
18. **Moneda** - Código moneda (ej: `GTQ`)
19. **Gran Total (Moneda Original)** - Monto total (ej: `835.38`)
20. **IVA (monto de este impuesto)** - Monto IVA (ej: `89.51`)
21. **Marca de anulado** - Si/No
22. **Fecha de anulación** - Fecha o vacío
23. **Petróleo (monto de este impuesto)** - Monto o 0
24. **Turismo Hospedaje (monto de este impuesto)** - Monto o 0
25. **Turismo Pasajes (monto de este impuesto)** - Monto o 0
26. **Timbre de Prensa (monto de este impuesto)** - Monto o 0
27. **Bomberos (monto de este impuesto)** - Monto o 0
28. **Tasa Municipal (monto de este impuesto)** - Monto o 0
29. **Bebidas alcohólicas (monto de este impuesto)** - Monto o 0
30. **Tabaco (monto de este impuesto)** - Monto o 0
31. **Cemento (monto de este impuesto)** - Monto o 0
32. **Bebidas no Alcohólicas (monto de este impuesto)** - Monto o 0
33. **Tarifa Portuaria (monto de este impuesto)** - Monto o 0

## Ejemplo de Fila Completa

```
2026-02-01T21:42:52.708-06:00 | 8BED926F-D4F9-4BD0-8F51-155AE4AA934D | FACT | 8BED926F | 3573107664 | 0 | No | No | 22392394 | CLARO GUATEMALA, SOCIEDAD ANONIMA | 1 | CLARO GUATEMALA | 336963 | INGENIO TULULA SOCIEDAD ANONIMA | 56407734 | AINNOVA, SOCIEDAD ANONIMA | Vigente | GTQ | 835.38 | 89.51 | No | | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0
```

## Notas Importantes

✅ **Campos Obligatorios:**
- Número de Autorización (UUID)
- Fecha de emisión
- NIT del emisor
- Nombre completo del emisor
- ID del receptor
- Nombre completo del receptor
- Gran Total

✅ **Formatos Aceptados:**
- Fechas: ISO 8601, fecha de Excel, o string parseable
- Números: Con o sin decimales (usar punto como separador)
- Booleanos: Si/No, Sí/No, Yes/No, True/False, 1/0

✅ **Campos Opcionales:**
- Si un campo está vacío, se usará un valor por defecto (0 para números, false para booleanos, string vacío para texto)

✅ **Nombres de Archivo Recomendados:**
- `facturas_NOMBRE_SOCIEDAD_AÑO.xlsx`
- Ejemplo: `facturas_INGENIO_TULULA_2026.xlsx`
- El sistema extrae automáticamente el nombre de la sociedad

## Cómo Exportar desde SAT

1. Accede al portal de la SAT de Guatemala
2. Ve a la sección de consulta de facturas
3. Filtra por fecha, emisor o receptor según necesites
4. Exporta a Excel
5. Verifica que tenga todas las columnas mencionadas arriba
6. Guarda el archivo en `backend\SAT\`
7. Ejecuta el importador

## Validaciones que Realiza el Sistema

✅ Verifica UUID único (no permite duplicados)
✅ Valida formato de fechas
✅ Convierte textos a números automáticamente
✅ Maneja valores vacíos o nulos
✅ Extrae sociedad del nombre del archivo
✅ Registra origen del archivo para trazabilidad

## ¿Qué Pasa si Hay Errores?

- **Fila sin UUID**: Se omite y continúa con las siguientes
- **Fecha inválida**: Se guarda como null
- **Número inválido**: Se guarda como 0
- **Campo faltante opcional**: Se usa valor por defecto

El sistema genera un reporte al final indicando:
- ✅ Cuántas filas se importaron correctamente
- ⚠️ Cuántas tuvieron errores (y en qué fila)
- 📊 Estadísticas generales de la importación
