@echo off
rem TerraWar 一键启动（Windows 双击运行）
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
echo.
pause
