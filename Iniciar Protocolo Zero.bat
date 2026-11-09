@echo off
chcp 65001 >nul
title Protocolo Zero
cd /d "%~dp0"
rem Protocolo Zero: abre com dois cliques (Windows).
rem O Node.js vem junto (instalar\node). Na primeira vez (ou quando o projeto passa a usar outra versao),
rem ele e preparado em runtime\win-x64. So se isso falhar e baixado do site oficial.
set "PZ_NODE=%~dp0runtime\win-x64\node.exe"
set "PZ_ARGS="
if not exist "%PZ_NODE%" goto preparar
if not exist "instalar\node\versao.txt" goto abrir
fc /b "instalar\node\versao.txt" "runtime\win-x64\versao.txt" >nul 2>&1
if not errorlevel 1 goto abrir

:preparar
if not exist "runtime" mkdir "runtime"
if exist "runtime\estado.js" del /q "runtime\estado.js"
rem Primeira vez: mostra a tela "Configurando" enquanto prepara.
if not exist "%PZ_NODE%" start "" "%~dp0public\configurando.html"
if not exist "%PZ_NODE%" set "PZ_ARGS=--sem-navegador"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar\instalar-node.ps1" -Raiz "%~dp0."
if not errorlevel 1 goto abrir
rem Nao deu para atualizar: segue com a versao anterior, se houver.
if exist "%PZ_NODE%" goto abrir
rem Ultimo recurso: Node.js 20 ou mais novo ja instalado no computador.
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)" >nul 2>&1
if errorlevel 1 goto falhou
set "PZ_NODE=node"

:abrir
if exist "%~dp0ia-modelos" set "OLLAMA_MODELS=%~dp0ia-modelos"
echo.
echo  Protocolo Zero aberto. Deixe esta janela aberta enquanto usa (fechar = sair).
echo.
"%PZ_NODE%" server\index.js %PZ_ARGS%
if errorlevel 1 pause
exit /b

:falhou
findstr /c:"antivirus" "runtime\estado.js" >nul 2>&1 && goto antivirus
>"runtime\estado.js" echo window.PZ_ESTADO = { etapa: 'falhou' };
echo.
echo  Nao foi possivel preparar o Node.js. Veja as instrucoes na tela "Configurando".
echo  Resumo: instale a versao LTS de https://nodejs.org e abra o Protocolo Zero de novo.
echo.
pause
exit /b

:antivirus
echo.
echo  Provavel bloqueio do antivirus: ele impediu a preparacao do Node.js.
echo  Adicione esta pasta como excecao no antivirus (ou desative-o por alguns minutos),
echo  abra o Protocolo Zero de novo e, se desativou, ligue o antivirus de novo depois.
echo.
pause
