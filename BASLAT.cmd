@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 veya uzeri gerekli. Once Node.js kurun.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"
if errorlevel 1 (
  echo Node.js 22 veya uzeri gerekli.
  pause
  exit /b 1
)
start "ARMUT Cloud-Sync" /min cmd /c "node cloud-hub-sync.mjs"
node server.mjs
pause
