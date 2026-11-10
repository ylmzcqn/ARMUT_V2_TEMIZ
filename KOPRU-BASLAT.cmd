@echo off
title ARMUT PC Bridge (Cloud-to-Local Runner)
echo ========================================================
echo  ARMUT PC Bridge Baslatiliyor...
echo  Bu pencere acik kaldigi surece bulut ajani bilgisayara
echo  guvenli sekilde baglanip komut calistirabilir.
echo ========================================================
cd /d "C:\Users\icanp\.gemini\antigravity\remote-runner"
node runner.mjs
pause
