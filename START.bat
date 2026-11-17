@echo off
setlocal
cd /d "%~dp0"
echo Starting DevFlow (Backend + Frontend)...
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\dev.ps1"

