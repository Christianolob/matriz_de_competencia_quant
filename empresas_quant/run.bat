@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
set "PYTHONIOENCODING=utf-8"

set "PORT=8010"

echo ===============================================
echo  Empresas Quant BR
echo  1) Coleta: BCB IF.data + CVM + data\manual.csv
echo     (cache de 7 dias; use "run.bat --refresh" para forcar)
echo  2) Frontend em http://localhost:%PORT%/ (fallback de porta)
echo  (feche esta janela ou Ctrl+C para parar)
echo ===============================================
echo.

set "PY="
where py >nul 2>&1
if not errorlevel 1 set "PY=py"
if not defined PY (
    where python >nul 2>&1
    if not errorlevel 1 set "PY=python"
)
if not defined PY (
    echo [ERRO] Python nao encontrado no PATH.
    echo Instale em https://www.python.org/downloads/
    pause
    goto :end
)

%PY% pipeline\collect.py %*
if errorlevel 1 (
    if exist data\empresas.json (
        echo [AVISO] Coleta falhou; abrindo com o empresas.json anterior.
    ) else (
        echo [ERRO] Coleta falhou e nao ha data\empresas.json para exibir.
        pause
        goto :end
    )
)

echo.
%PY% server.py %PORT%

:end
endlocal
