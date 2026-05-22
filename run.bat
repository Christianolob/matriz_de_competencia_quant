@echo off
setlocal
cd /d "%~dp0"

set "PORT=8000"
set "URL=http://localhost:%PORT%/"

echo ===============================================
echo  Quant Competence Matrix
echo  Server at %URL%
echo  Edits in the browser auto-save to data/overrides.js
echo  (close this window or press Ctrl+C to stop)
echo ===============================================
echo.

REM Open the browser after a short delay, in parallel with the server.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%URL%'"

REM 1) Python launcher (preferred -- runs server.py with PUT support)
where py >nul 2>&1
if not errorlevel 1 (
    py server.py %PORT%
    goto :end
)

REM 2) Python on PATH
where python >nul 2>&1
if not errorlevel 1 (
    python server.py %PORT%
    goto :end
)

REM 3) Node fallback via npx serve (read-only -- editor cannot auto-save)
where node >nul 2>&1
if not errorlevel 1 (
    echo [WARN] Falling back to "npx serve" -- editor auto-save is disabled.
    echo        Install Python to enable saving directly to data/overrides.js.
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
