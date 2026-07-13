@echo off
setlocal
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" "%~dp0node_modules\next\dist\bin\next" dev -H 127.0.0.1 -p 3001
echo.
echo Preview server stopped. Press any key to close this window.
pause
