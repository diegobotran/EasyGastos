# Script PowerShell para actualizar versión de EasyGastos
# Uso: .\update-version.ps1 -Version "1.0.1" -ReleaseNotes "Corrección de bugs"

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    
    [Parameter(Mandatory=$false)]
    [string]$ReleaseNotes = "Actualización de la aplicación"
)

Write-Host "🚀 Actualizando EasyGastos a versión $Version" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Actualizar app.json
Write-Host "📝 Actualizando app.json..." -ForegroundColor Yellow

$appJson = Get-Content "app.json" -Raw | ConvertFrom-Json
$currentBuild = $appJson.expo.android.versionCode
$newBuild = $currentBuild + 1

$appJson.expo.version = $Version
$appJson.expo.android.versionCode = $newBuild

$appJson | ConvertTo-Json -Depth 10 | Set-Content "app.json"
Write-Host "✅ app.json actualizado: v$Version (build $newBuild)" -ForegroundColor Green

# Paso 2: Limpiar builds anteriores
Write-Host ""
Write-Host "🧹 Limpiando builds anteriores..." -ForegroundColor Yellow
if (Test-Path "android\app\build\outputs\apk") {
    Remove-Item "android\app\build\outputs\apk" -Recurse -Force
}

# Paso 3: Compilar APK
Write-Host ""
Write-Host "🔨 Compilando APK de release..." -ForegroundColor Yellow
Write-Host "   Esto puede tardar varios minutos..." -ForegroundColor Gray

cd android
& .\gradlew.bat assembleRelease

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Compilación exitosa" -ForegroundColor Green
} else {
    Write-Host "❌ Error en compilación" -ForegroundColor Red
    cd ..
    exit 1
}

cd ..

# Paso 4: Verificar y copiar APK
$apkSource = "android\app\build\outputs\apk\release\app-release.apk"
$apkDest = "backend\apks\EasyGastos-v$Version.apk"

if (Test-Path $apkSource) {
    Write-Host ""
    Write-Host "📦 Copiando APK..." -ForegroundColor Yellow
    Copy-Item $apkSource $apkDest -Force
    Write-Host "✅ APK copiado: $apkDest" -ForegroundColor Green
    
    # Mostrar tamaño
    $size = (Get-Item $apkDest).Length / 1MB
    Write-Host "📊 Tamaño: $([math]::Round($size, 2)) MB" -ForegroundColor Cyan
} else {
    Write-Host "❌ APK no encontrado en $apkSource" -ForegroundColor Red
    exit 1
}

# Paso 5: Generar snippet para actualizar backend
Write-Host ""
Write-Host "📝 Código para actualizar backend/routes/app.js:" -ForegroundColor Yellow
Write-Host ""
Write-Host "const CURRENT_APP_VERSION = {" -ForegroundColor White
Write-Host "  version: '$Version'," -ForegroundColor White
Write-Host "  buildNumber: $newBuild," -ForegroundColor White
Write-Host "  releaseDate: new Date().toISOString()," -ForegroundColor White
Write-Host "  releaseNotes: '$ReleaseNotes'," -ForegroundColor White
Write-Host "  downloadUrl: '/api/app/download'," -ForegroundColor White
Write-Host "  minVersion: '1.0.0'," -ForegroundColor White
Write-Host "  forceUpdate: false," -ForegroundColor White
Write-Host "};" -ForegroundColor White

# Paso 6: Resumen
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "✅ VERSIÓN $Version PREPARADA" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Pasos siguientes:" -ForegroundColor Yellow
Write-Host "  1. Actualizar CURRENT_APP_VERSION en backend\routes\app.js"
Write-Host "  2. Reiniciar servidor backend"
Write-Host "  3. Probar actualización desde app móvil"
Write-Host ""
Write-Host "📦 APK disponible en: $apkDest" -ForegroundColor Cyan
Write-Host "📝 Notas: $ReleaseNotes" -ForegroundColor Cyan
Write-Host ""
