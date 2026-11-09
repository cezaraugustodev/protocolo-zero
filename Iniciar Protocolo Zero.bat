@echo off
rem Protocolo Zero: abre com dois cliques (Windows), sem janela preta.
rem Este arquivo se abre de novo escondido; o andamento e os avisos aparecem no navegador
rem (tela "Configurando" na primeira vez e depois o proprio Protocolo Zero).
rem O Node.js vem junto (instalar\node). Na primeira vez (ou quando o projeto passa a usar outra versao),
rem ele e preparado em runtime\win-x64, sem instalar nada no sistema. So se isso falhar e baixado do site oficial.
if "%PZ_OCULTO%"=="1" goto comecar
set "PZ_OCULTO=1"
set "PZ_BAT=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath $env:PZ_BAT -WorkingDirectory (Split-Path $env:PZ_BAT) -WindowStyle Hidden"
if errorlevel 1 goto comecar
exit /b

:comecar
chcp 65001 >nul
title Protocolo Zero
cd /d "%~dp0"
set "PZ_NODE=%~dp0runtime\win-x64\node.exe"
set "PZ_ARGS="
set "PZ_PAGINA="
if not exist "runtime" mkdir "runtime"
if not exist "%PZ_NODE%" goto preparar
if not exist "instalar\node\versao.txt" goto abrir
fc /b "instalar\node\versao.txt" "runtime\win-x64\versao.txt" >nul 2>&1
if not errorlevel 1 goto abrir

:preparar
if exist "runtime\estado.js" del /q "runtime\estado.js"
rem Primeira vez: mostra a tela "Configurando" enquanto prepara.
if not exist "%PZ_NODE%" call :pagina
if not exist "%PZ_NODE%" set "PZ_ARGS=--sem-navegador"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0instalar\instalar-node.ps1" -Raiz "%~dp0."
if not errorlevel 1 goto abrir
rem Nao deu para atualizar: segue com a versao anterior, se houver.
if exist "%PZ_NODE%" goto abrir
rem Ultimo recurso: Node.js 20 ou mais novo ja instalado no computador.
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)" >nul 2>&1
if errorlevel 1 goto falhou
set "PZ_NODE=node"

:abrir
if exist "%~dp0ia-modelos" set "OLLAMA_MODELS=%~dp0ia-modelos"
rem Para fechar: botao "Fechar o Protocolo Zero" no menu do proprio programa.
"%PZ_NODE%" server\index.js %PZ_ARGS% >"runtime\servidor.log" 2>&1
rem Fechou por erro ao abrir: o servidor grava a etapa "servidor" e a tela "Configurando" explica.
if errorlevel 1 findstr /c:"'servidor'" "runtime\estado.js" >nul 2>&1 && call :pagina
exit /b

:falhou
if not exist "runtime\estado.js" goto falhou-generico
findstr /c:"antivirus" "runtime\estado.js" >nul 2>&1 && goto avisar
:falhou-generico
>"runtime\estado.js" echo window.PZ_ESTADO = { etapa: 'falhou' };
:avisar
call :pagina
exit /b

rem Abre a tela "Configurando" uma vez (ela mostra o andamento, os erros e como resolver).
:pagina
if defined PZ_PAGINA exit /b
set "PZ_PAGINA=1"
start "" "%~dp0public\configurando.html"
exit /b
