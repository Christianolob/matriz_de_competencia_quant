@echo off
setlocal
cd /d "%~dp0"

REM ===============================================================
REM  Quant Competence Matrix - exporta a arvore como PNG gigante.
REM
REM  Renderiza export.html (so a arvore, sem titulo/editor) num
REM  navegador headless e salva matrix.png em alta resolucao,
REM  pronto para dar zoom em todos os pontos e caminhos.
REM
REM  Resolucao: passe a escala como argumento (padrao 4).
REM    export_image.bat        -> 9600 x 7200   (escala 4)
REM    export_image.bat 6      -> 14400 x 10800 (escala 6)
REM ===============================================================

echo ===============================================
echo  Gerando imagem em alta resolucao...
echo ===============================================
echo.

REM --- Localiza o Python (faz todo o trabalho em export_image.py) ---
set "PY="
where py >nul 2>&1 && set "PY=py"
if not defined PY ( where python >nul 2>&1 && set "PY=python" )
if not defined PY (
  echo [ERRO] Python nao encontrado no PATH.
  echo        Instale em https://www.python.org/downloads/
  pause
  exit /b 1
)

%PY% "%~dp0export_image.py" %*

if errorlevel 1 (
  echo.
  echo [ERRO] Falha ao gerar a imagem.
  pause
  exit /b 1
)

exit /b 0
