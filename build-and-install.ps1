# Script para compilar e instalar APK automáticamente en dispositivo conectado
# Uso: .\build-and-install.ps1

# Asegurar que siempre ejecute desde la carpeta raíz del proyecto
Set-Location $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  EasyGastos - Build & Install Script  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[INFO] Este script SOLO compila e instala el APK" -ForegroundColor Cyan
Write-Host "   NO modifica el código fuente de la app" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Verificar ADB
Write-Host "[1/5] Verificando Android SDK..." -ForegroundColor Yellow
$adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adbPath)) {
    Write-Host "ERROR: No se encontro ADB en: $adbPath" -ForegroundColor Red
    Write-Host "   Asegurate de tener Android SDK instalado" -ForegroundColor Red
    exit 1
}
Write-Host "OK  ADB encontrado" -ForegroundColor Green
Write-Host ""



# Paso 2: Limpiar caché de Metro (bundle JS)
#Write-Host "[2/5] Limpiando cache de Metro bundler..." -ForegroundColor Yellow
#Set-Location $PSScriptRoot
#$metroCachePaths = @(
    #"$env:TEMP\metro-*",
    #"$env:TEMP\haste-map-*",
   # "$PSScriptRoot\.expo\web\cache"
#)
#foreach ($cachePath in $metroCachePaths) {
 #   if (Test-Path $cachePath) {
 #       Remove-Item -Recurse -Force $cachePath -ErrorAction SilentlyContinue
  #      Write-Host "   >> Eliminado: $cachePath" -ForegroundColor DarkGray
  #  }
#}
#Write-Host "OK  Cache de Metro limpiada" -ForegroundColor Green
#Write-Host ""

# Paso 3: Limpiar build anterior de Gradle
#Write-Host "[3/5] Limpiando build anterior (Gradle clean)..." -ForegroundColor Yellow
#Set-Location "$PSScriptRoot\android"
#& .\gradlew.bat clean
#if ($LASTEXITCODE -ne 0) {
#    Write-Host "WARN Gradle clean fallo, continuando de todas formas..." -ForegroundColor Yellow
#}
#Write-Host "OK  Build anterior limpiada" -ForegroundColor Green
#Write-Host ""
#Set-Location $PSScriptRoot



# Paso 4: Compilar APK
Write-Host "[4/5] Compilando APK (build limpio)..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\android"
$env:NODE_ENV = "production"

& .\gradlew.bat assembleRelease --console=plain

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Fallo la compilacion" -ForegroundColor Red
    Set-Location $PSScriptRoot
    exit 1
}

Write-Host "OK  Compilacion exitosa" -ForegroundColor Green
Write-Host ""

# Paso 6: Verificar que existe el APK
$apkPath = "$PSScriptRoot\android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apkPath)) {
    Write-Host "ERROR: No se encontro el APK en: $apkPath" -ForegroundColor Red
    Set-Location $PSScriptRoot
    exit 1
}

$apkSize = (Get-Item $apkPath).Length / 1MB
Write-Host "[5/5] APK generado: $([math]::Round($apkSize, 2)) MB" -ForegroundColor Green
Write-Host "      Ubicacion: $apkPath" -ForegroundColor DarkGray
Write-Host ""

# Paso 5b: Instalar en dispositivo si está conectado
Write-Host "Verificando dispositivo para instalar..." -ForegroundColor Yellow
$devices = & $adbPath devices

if ($devices -match "unauthorized") {
    Write-Host ""
    Write-Host "AVISO: Dispositivo conectado pero NO AUTORIZADO" -ForegroundColor Yellow
    Write-Host "  >> Acepta el popup 'Permitir depuracion USB' en tu celular" -ForegroundColor Yellow
    Write-Host "  >> Luego instala manualmente: adb install -r `"$apkPath`"" -ForegroundColor Cyan
} elseif ($devices -notmatch "device$") {
    Write-Host "AVISO: No hay dispositivo USB conectado." -ForegroundColor Yellow
    Write-Host "   El APK fue generado correctamente en:" -ForegroundColor Cyan
    Write-Host "   $apkPath" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   Para instalar luego, conecta el celular y ejecuta:" -ForegroundColor Cyan
    Write-Host "   adb install -r `"$apkPath`"" -ForegroundColor White
} else {
    $deviceId = ($devices -split "`n" | Select-String "device$" | Select-Object -First 1).ToString().Split()[0]
    Write-Host "OK  Dispositivo encontrado: $deviceId" -ForegroundColor Green
    Write-Host "Instalando APK..." -ForegroundColor Yellow
    & $adbPath install -r $apkPath

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Fallo la instalacion" -ForegroundColor Red
        Set-Location $PSScriptRoot
        exit 1
    }

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  >>> APK INSTALADA EXITOSAMENTE <<<" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "La app ha sido actualizada en tu dispositivo." -ForegroundColor Cyan
    Write-Host "Puedes abrirla desde el menu de aplicaciones." -ForegroundColor Cyan
    Write-Host ""

    $response = Read-Host "Deseas abrir la app ahora? (S/N)"
    if ($response -eq "S" -or $response -eq "s") {
        Write-Host "Abriendo app..." -ForegroundColor Yellow
        & $adbPath shell monkey -p com.masuagt.EasyGastosMobile -c android.intent.category.LAUNCHER 1
        Write-Host "OK  App iniciada" -ForegroundColor Green
    }
}

Set-Location $PSScriptRoot
