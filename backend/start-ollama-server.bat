@echo off
echo ========================================
echo  SERVIDOR IA OLLAMA - EASYGASTOS
echo ========================================
echo.

REM Verificar si Ollama está corriendo
echo [1/3] Verificando Ollama...
curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Ollama no esta corriendo
    echo Por favor inicia Ollama primero
    pause
    exit /b 1
)
echo ✓ Ollama OK

REM Verificar si el modelo está instalado
echo.
echo [2/3] Verificando modelo llama3.2:3b...
curl -s http://127.0.0.1:11434/api/show -d "{\"name\":\"llama3.2:3b\"}" | findstr "llama3.2" >nul
if %errorlevel% neq 0 (
    echo ADVERTENCIA: Modelo no encontrado
    echo Instalando modelo...
    ollama pull llama3.2:3b
)
echo ✓ Modelo OK

REM Iniciar servidor
echo.
echo [3/3] Iniciando servidor...
echo.
echo ========================================
echo  SERVIDOR LISTO - http://localhost:3000
echo ========================================
echo.
node ollama-server.js
