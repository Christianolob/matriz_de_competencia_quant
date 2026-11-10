@echo off
setlocal
cd /d "%~dp0"

set "PORT=8000"

echo ===============================================
echo  Quant Competence Matrix
echo  Starting local server on port %PORT% (auto-fallback if busy)
echo  Edits in the browser auto-save to data/overrides.js
echo  (close this window or press Ctrl+C to stop)
echo ===============================================
echo.

REM Python launcher (preferred -- runs server.py with PUT support and auto-opens the browser).
where py >nul 2>&1
if not errorlevel 1 (
    py server.py %PORT%
    goto :end
)

where python >nul 2>&1
if not errorlevel 1 (
    python server.py %PORT%
    goto :end
)

REM Node fallback via npx serve (read-only -- editor cannot auto-save).
where node >nul 2>&1
if not errorlevel 1 (
    echo [WARN] Falling back to "npx serve" -- editor auto-save is disabled.
    echo        Install Python to enable saving directly to data/overrides.js.
    start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:%PORT%/'"
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
