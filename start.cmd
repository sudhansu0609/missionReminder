@echo off
rem Double-click friendly wrapper. Same arguments as start.ps1:
rem   start            desktop app
rem   start mobile     Expo dev server
rem   start test       behaviour tests
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
