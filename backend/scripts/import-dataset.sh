#!/bin/bash

# Script para importar CSV a MongoDB en Ubuntu
# Uso: ./import-dataset.sh [ruta-al-csv]

CSV_FILE="${1:-~/DATA_2025.csv}"
DB_NAME="easygastos"
COLLECTION_NAME="dataset"

echo "=========================================="
echo "IMPORTAR DATASET A MONGODB"
echo "=========================================="
echo ""
echo "Base de datos: $DB_NAME"
echo "Colección: $COLLECTION_NAME"
echo "Archivo CSV: $CSV_FILE"
echo ""

# Verificar que el archivo existe
if [ ! -f "$CSV_FILE" ]; then
    echo "❌ Error: Archivo no encontrado: $CSV_FILE"
    exit 1
fi

echo "✅ Archivo encontrado"
echo ""

# Preguntar si quiere eliminar datos existentes
read -p "¿Eliminar datos existentes en la colección? (s/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo "🗑️  Importando con --drop (eliminará datos existentes)..."
    mongoimport \
        --db "$DB_NAME" \
        --collection "$COLLECTION_NAME" \
        --type csv \
        --headerline \
        --drop \
        --file "$CSV_FILE"
else
    echo "📥 Importando (se agregarán a los datos existentes)..."
    mongoimport \
        --db "$DB_NAME" \
        --collection "$COLLECTION_NAME" \
        --type csv \
        --headerline \
        --file "$CSV_FILE"
fi

# Verificar el resultado
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Importación completada exitosamente"
    echo ""
    echo "📊 Verificando cantidad de registros..."
    
    RECORD_COUNT=$(mongosh "$DB_NAME" --quiet --eval "db.$COLLECTION_NAME.countDocuments()")
    echo "Total de registros en la colección: $RECORD_COUNT"
    
    echo ""
    echo "📋 Mostrando un registro de ejemplo:"
    mongosh "$DB_NAME" --quiet --eval "db.$COLLECTION_NAME.findOne()"
    
else
    echo ""
    echo "❌ Error durante la importación"
    exit 1
fi

echo ""
echo "=========================================="
echo "IMPORTACIÓN COMPLETADA"
echo "=========================================="
