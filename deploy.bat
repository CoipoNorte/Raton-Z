@echo off
setlocal EnableDelayedExpansion
title Raton Z - Production Deployment
cd /d "%~dp0"

echo.
echo   RATON Z - GitHub Pages
echo   ----------------------

:: 1. Validaciones del entorno
where node >nul 2>&1 || (echo ERROR: Instala Node.js 22 o mas reciente. & exit /b 1)
where git >nul 2>&1 || (echo ERROR: Instala Git para Windows. & exit /b 1)
git rev-parse --is-inside-work-tree >nul 2>&1 || (echo ERROR: Clona el repositorio oficial primero. & exit /b 1)
git remote get-url origin >nul 2>&1 || (echo ERROR: Configura el remote origin primero. & exit /b 1)

:: Obtener la rama actual de forma segura
for /f "delims=" %%b in ('git branch --show-current') do set "BRANCH=%%b"
if not "!BRANCH!"=="main" if not "!BRANCH!"=="master" (
  echo ERROR: Debes desplegar desde main o master. Rama actual: !BRANCH!
  exit /b 1
)

echo [1/4] Instalando dependencias limpias (npm ci)...
call npm ci
if errorlevel 1 exit /b 1

echo [2/4] Verificando tipos con TypeScript...
call npx tsc --noEmit
if errorlevel 1 exit /b 1

echo [3/4] Compilando para /Raton-Z/...
call npm run build -- --base /Raton-Z/
if errorlevel 1 (
  echo ERROR: La compilacion fallo. Corrige los errores antes de desplegar.
  exit /b 1
)

echo.
echo El script guardara, hara commit y subira los cambios al repositorio remoto.
choice /c YN /m "¿Continuar y subir a GitHub"
if errorlevel 2 exit /b 0

:: 4. Preparar y subir cambios
git add .
git diff --cached --quiet
if errorlevel 1 (
  set /p "MESSAGE=Mensaje para el commit [Release Raton Z]: "
  if not defined MESSAGE set "MESSAGE=Release Raton Z"
  call git commit -m "!MESSAGE!"
  if errorlevel 1 exit /b 1
)

echo [4/4] Subiendo cambios a GitHub (!BRANCH!)...
git push origin "!BRANCH!"
if errorlevel 1 exit /b 1

echo.
echo ========================================================
echo ¡Build verificado y release subido con exito!
echo Asegurate de tener configurado en GitHub:
echo Settings - Pages - Source: GitHub Actions
echo Sigue el despliegue en: https://github.com/CoipoNorte/Raton-Z/actions
echo URL de tu juego: https://coiponorte.github.io/Raton-Z/
echo ========================================================
pause
endlocal