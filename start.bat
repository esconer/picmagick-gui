@echo off
REM One-click launcher for Compakta.
REM Starts the server, waits for it to answer, then opens your browser.

setlocal
cd /d "%~dp0"

where bun >nul 2>&1
if errorlevel 1 (
  echo.
  echo   bun is not installed or not on PATH.
  echo   Install it from https://bun.sh  ^(Windows: powershell -c "irm bun.sh/install.ps1 ^| iex"^)
  echo.
  pause
  exit /b 1
)

echo Starting Compakta...
echo.

REM Run detached so this window can close and the server keeps going.
start "Compakta" /min bun run src\server.ts

REM Wait for the port to answer before opening a browser.
set PORT=5178
for /l %%i in (1,1,40) do (
  curl -s -o nul -w "" http://127.0.0.1:%PORT%/api/status && goto ready
  timeout /t 1 /nobreak >nul
)

:ready
echo Server is up: http://127.0.0.1:%PORT%
start "" http://127.0.0.1:%PORT%
echo Browser opened. Close the minimised "Compakta" window to stop the server.
echo.
pause
