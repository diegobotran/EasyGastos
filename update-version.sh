#!/bin/bash

# Script para subir nueva versión de EasyGastos
# Uso: ./update-version.sh 1.0.1 "Corrección de bugs"

VERSION=$1
RELEASE_NOTES=$2

if [ -z "$VERSION" ]; then
  echo "❌ Error: Debe especificar la versión"
  echo "Uso: ./update-version.sh 1.0.1 \"Descripción de cambios\""
  exit 1
fi

if [ -z "$RELEASE_NOTES" ]; then
  echo "⚠️  Advertencia: No se especificaron notas de versión"
  RELEASE_NOTES="Actualización a versión $VERSION"
fi

echo "🚀 Actualizando EasyGastos a versión $VERSION"
echo ""

# Paso 1: Actualizar app.json
echo "📝 Actualizando app.json..."
# (Requiere jq - instalar con: apt-get install jq)
if command -v jq &> /dev/null; then
  BUILD_NUMBER=$(jq -r '.expo.android.versionCode' app.json)
  NEW_BUILD=$((BUILD_NUMBER + 1))
  
  jq ".expo.version = \"$VERSION\" | .expo.android.versionCode = $NEW_BUILD" app.json > app.json.tmp
  mv app.json.tmp app.json
  
  echo "✅ app.json actualizado: v$VERSION (build $NEW_BUILD)"
else
  echo "⚠️  jq no instalado - actualice app.json manualmente"
fi

# Paso 2: Limpiar y compilar
echo ""
echo "🧹 Limpiando builds anteriores..."
rm -rf android/app/build/outputs/apk

echo "🔨 Compilando APK de release..."
cd android
./gradlew assembleRelease

if [ $? -eq 0 ]; then
  echo "✅ Compilación exitosa"
else
  echo "❌ Error en compilación"
  exit 1
fi

cd ..

# Paso 3: Copiar APK
APK_SOURCE="android/app/build/outputs/apk/release/app-release.apk"
APK_DEST="backend/apks/EasyGastos-v$VERSION.apk"

if [ -f "$APK_SOURCE" ]; then
  echo ""
  echo "📦 Copiando APK..."
  cp "$APK_SOURCE" "$APK_DEST"
  echo "✅ APK copiado: $APK_DEST"
  
  # Mostrar tamaño
  SIZE=$(du -h "$APK_DEST" | cut -f1)
  echo "📊 Tamaño: $SIZE"
else
  echo "❌ APK no encontrado en $APK_SOURCE"
  exit 1
fi

# Paso 4: Actualizar routes/app.js
echo ""
echo "📝 Actualizando backend/routes/app.js..."

# (Esto requiere edición manual, o usar sed con cuidado)
cat > backend/routes/app.js.version << EOF
// ACTUALIZAR ESTAS LÍNEAS EN backend/routes/app.js:

const CURRENT_APP_VERSION = {
  version: '$VERSION',
  buildNumber: $NEW_BUILD,
  releaseDate: new Date().toISOString(),
  releaseNotes: '$RELEASE_NOTES',
  downloadUrl: '/api/app/download',
  minVersion: '1.0.0',
  forceUpdate: false,
};
EOF

echo "⚠️  Actualice manualmente backend/routes/app.js con estos valores:"
cat backend/routes/app.js.version
rm backend/routes/app.js.version

# Paso 5: Resumen
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ VERSIÓN $VERSION PREPARADA"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Pasos siguientes:"
echo "  1. Actualizar CURRENT_APP_VERSION en backend/routes/app.js"
echo "  2. Reiniciar servidor: pm2 restart easygastos-backend"
echo "  3. Probar actualización desde app móvil"
echo ""
echo "📦 APK disponible en: $APK_DEST"
echo "📝 Notas: $RELEASE_NOTES"
echo ""
