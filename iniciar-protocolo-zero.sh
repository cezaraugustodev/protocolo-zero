#!/bin/bash
# Protocolo Zero: abre com um clique (Linux).
# O Node.js vem junto (instalar/node). Na primeira vez (ou quando o projeto passa a usar outra versão),
# ele é preparado em runtime/. Só se isso falhar é baixado do site oficial.
cd "$(dirname "$0")"
case "$(uname -m)" in x86_64|amd64) ARQ=x64 ;; aarch64|arm64) ARQ=arm64 ;; *) ARQ="$(uname -m)" ;; esac
PASTA="runtime/linux-$ARQ"
NODE="$PASTA/node"
ARGS=""
if [ -x "$NODE" ] && { [ ! -f instalar/node/versao.txt ] || cmp -s instalar/node/versao.txt "$PASTA/versao.txt"; }; then
  :
else
  mkdir -p runtime
  rm -f runtime/estado.js
  if [ ! -x "$NODE" ]; then
    # Primeira vez: mostra a tela "Configurando" enquanto prepara.
    xdg-open "$PWD/public/configurando.html" >/dev/null 2>&1 &
    ARGS="--sem-navegador"
  fi
  if ! bash instalar/instalar-node.sh "$PWD"; then
    if [ -x "$NODE" ]; then
      :  # não deu para atualizar: segue com a versão anterior
    elif command -v node >/dev/null 2>&1 && node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"; then
      NODE=node
    else
      echo "window.PZ_ESTADO = { etapa: 'falhou' };" > runtime/estado.js
      echo
      echo "Não foi possível preparar o Node.js. Veja as instruções na tela \"Configurando\"."
      echo "Resumo: instale a versão LTS de https://nodejs.org e abra o Protocolo Zero de novo."
      read -r -p "Aperte Enter para sair"; exit 1
    fi
  fi
fi
[ -d ia-modelos ] && export OLLAMA_MODELS="$PWD/ia-modelos"
echo
echo "  Protocolo Zero aberto. Deixe esta janela aberta enquanto usa (fechar = sair)."
echo
"$NODE" server/index.js $ARGS || read -r -p "Aperte Enter para sair"
