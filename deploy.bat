@echo off
setlocal
title Raton Z - Production Deployment
cd /d "%~dp0"

echo.
echo   RATON Z - GitHub Pages
echo   ----------------------
where node >nul 2>&1 || (echo ERROR: Install Node.js 22 or newer. & exit /b 1)
where git >nul 2>&1 || (echo ERROR: Install Git for Windows. & exit /b 1)
git rev-parse --is-inside-work-tree >nul 2>&1 || (echo ERROR: Clone the official repository first. & exit /b 1)
git remote get-url origin >nul 2>&1 || (echo ERROR: Configure the origin remote first. & exit /b 1)
for /f "delims=" %%b in ('git branch --show-current') do set "BRANCH=%%b"
if not "%BRANCH%"=="main" if not "%BRANCH%"=="master" (
  echo ERROR: Deploy from main or master. Current branch: %BRANCH%
  exit /b 1
)

echo [1/4] Installing locked dependencies...
call npm ci
if errorlevel 1 exit /b 1
echo [2/4] Checking TypeScript...
call npx tsc --noEmit
if errorlevel 1 exit /b 1
echo [3/4] Building for /Raton-Z/...
call npm run build -- --base /Raton-Z/
if errorlevel 1 exit /b 1

echo.
echo The deployment will commit tracked changes and new project files.
choice /c YN /m "Continue and push to GitHub"
if errorlevel 2 exit /b 0
git add .
git diff --cached --quiet
if errorlevel 1 (
  set /p MESSAGE="Commit message [Release Raton Z]: "
  if not defined MESSAGE set "MESSAGE=Release Raton Z"
  call git commit -m "%%MESSAGE%%"
  if errorlevel 1 exit /b 1
)
echo [4/4] Pushing release...
git push origin "%BRANCH%"
if errorlevel 1 exit /b 1
echo.
echo Build verified and release pushed successfully.
echo Enable Settings - Pages - Source: GitHub Actions in the repository.
echo Follow the deployment: https://github.com/CoipoNorte/Raton-Z/actions
echo Game URL: https://coiponorte.github.io/Raton-Z/
pause
endlocal