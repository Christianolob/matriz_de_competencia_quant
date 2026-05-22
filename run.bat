@echo off
setlocal
cd /d "%~dp0"

set "PORT=8000"
set "URL=http://localhost:%PORT%/"

echo ===============================================
echo  Quant Competence Matrix
echo  Server at %URL%
echo  (close this window or press Ctrl+C to stop)
echo ===============================================
echo.

REM Open the browser after a short delay, in parallel with the server.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%URL%'"

REM 1) Python launcher
where py >nul 2>&1
if not errorlevel 1 (
    py -m http.server %PORT%
    goto :end
)

REM 2) Python on PATH
where python >nul 2>&1
if not errorlevel 1 (
    python -m http.server %PORT%
    goto :end
)

REM 3) Node via npx serve
where node >nul 2>&1
if not errorlevel 1 (
    npx --yes serve -l %PORT% .
    goto :end
)

echo.
echo [ERROR] Could not find Python or Node on PATH.
echo Install one of the following:
echo   - Python: https://www.python.org/downloads/
echo   - Node:   https://nodejs.org/
echo.
pause

:end
endlocal
