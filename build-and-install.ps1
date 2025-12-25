# Script para compilar e instalar APK automáticamente en dispositivo conectado
# Uso: .\build-and-install.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  EasyGastos - Build & Install Script  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Verificar dispositivo conectado
Write-Host "📱 Verificando dispositivo conectado..." -ForegroundColor Yellow
$devices = & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
Write-Host $devices

if ($devices -notmatch "device$") {
    Write-Host "❌ ERROR: No hay dispositivo conectado via USB" -ForegroundColor Red
    Write-Host "   Conecta tu dispositivo y habilita la depuración USB" -ForegroundColor Red
    exit 1
}

$deviceId = ($devices -split "`n" | Select-String "device$" | Select-Object -First 1).ToString().Split()[0]
Write-Host "✅ Dispositivo encontrado: $deviceId" -ForegroundColor Green
Write-Host ""

# Paso 2: Compilar APK
Write-Host "🔨 Compilando APK..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\android"

& .\gradlew assembleRelease

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ERROR: Falló la compilación" -ForegroundColor Red
    Set-Location $PSScriptRoot
    exit 1
}

Write-Host "✅ Compilación exitosa" -ForegroundColor Green
Write-Host ""

# Paso 3: Verificar que existe el APK
$apkPath = "$PSScriptRoot\android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apkPath)) {
    Write-Host "❌ ERROR: No se encontró el APK en: $apkPath" -ForegroundColor Red
    Set-Location $PSScriptRoot
    exit 1
}

$apkSize = (Get-Item $apkPath).Length / 1MB
Write-Host "📦 APK generado: $([math]::Round($apkSize, 2)) MB" -ForegroundColor Green
Write-Host ""

# Paso 4: Instalar APK en dispositivo
Write-Host "📲 Instalando APK en dispositivo..." -ForegroundColor Yellow
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r $apkPath

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ERROR: Falló la instalación" -ForegroundColor Red
    Set-Location $PSScriptRoot
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ APK INSTALADA EXITOSAMENTE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "La app ha sido actualizada en tu dispositivo." -ForegroundColor Cyan
Write-Host "Puedes abrirla desde el menú de aplicaciones." -ForegroundColor Cyan
Write-Host ""

# Opcional: Abrir la app automáticamente
$response = Read-Host "¿Deseas abrir la app ahora? (S/N)"
if ($response -eq "S" -or $response -eq "s") {
    Write-Host "🚀 Abriendo app..." -ForegroundColor Yellow
    & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell monkey -p com.masuagt.EasyGastosMobile -c android.intent.category.LAUNCHER 1
    Write-Host "✅ App iniciada" -ForegroundColor Green
}

Set-Location $PSScriptRoot
