@echo off
chcp 65001 > nul
title ARMUT V2 - Yerel Baglanti ve Kopru Ajani
echo ========================================================
echo   ARMUT V2 -- Yerel Baglanti ve Kopru Ajani (Windows)
echo ========================================================
echo.
echo Bu ajan Cloud'daki yapay zeka ajanlarindan gelen komutlari
echo yerel ortamda calistirip sonuclari guvenle geri aktarir.
echo.
cd /d "%~dp0"

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [HATA] Node.js bulunamadi! Lutfen Node.js yukleyin.
    pause
    exit /b 1
)

echo Yerel baglanti ajani baslatiliyor...
node local-bridge-agent.mjs

pause
