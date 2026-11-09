#!/bin/bash
# Protocolo Zero - prepara o Node.js no macOS e no Linux (chamado pelos iniciadores).
# 1. Usa a cópia que vem junto com o projeto (instalar/node/node-<sistema>-<arq>.tar.xz).
# 2. Se ela falhar, baixa a MESMA versão do site oficial (nodejs.org) e confere o SHA-256.
# Guarda só o binário em runtime/<sistema>-<arq>/node (com versao.txt). Não instala nada no sistema e não
# precisa de administrador. Quando o projeto passa a usar outra versão (instalar/node/versao.txt), roda de novo.
# O andamento vai para runtime/estado.js, que a página public/configurando.html mostra.
set -e
RAIZ="$1"
case "$(uname -s)" in Darwin) SO=darwin ;; *) SO=linux ;; esac
case "$(uname -m)" in x86_64|amd64) ARQ=x64 ;; aarch64|arm64) ARQ=arm64 ;; *) ARQ="" ;; esac
PASTA="$RAIZ/runtime/$SO-$ARQ"
ESTADO="$RAIZ/runtime/estado.js"
ARQ_VERSAO="$RAIZ/instalar/node/versao.txt"
JUNTO="$RAIZ/instalar/node/node-$SO-$ARQ.tar.xz"
VERSAO=""
[ -f "$ARQ_VERSAO" ] && VERSAO="$(head -n 1 "$ARQ_VERSAO" | tr -d '\r\n ')"

mkdir -p "$RAIZ/runtime"
estado() { echo "window.PZ_ESTADO = { etapa: '$1' };" > "$ESTADO"; }
TMP="$(mktemp -d)"
trap 'c=$?; rm -rf "$TMP"; if [ $c -ne 0 ]; then estado falhou; echo "  Não foi possível preparar o Node.js."; fi; exit $c' EXIT
[ -n "$ARQ" ] || { echo "  Processador não suportado: $(uname -m)"; exit 1; }
mkdir -p "$PASTA"

# Põe o binário extraído no lugar e confere se ele abre.
instalar() {
  chmod +x "$1"
  if [ "$SO" = darwin ]; then xattr -d com.apple.quarantine "$1" 2>/dev/null || true; fi
  "$1" -e 'process.exit(0)' && mv -f "$1" "$PASTA/node"
}

echo
OK=""
if [ -n "$VERSAO" ] && [ -f "$JUNTO" ]; then
  estado instalando
  echo "  Instalando os componentes do Protocolo Zero (Node.js $VERSAO)..."
  if tar -xJf "$JUNTO" -C "$TMP" node 2>/dev/null && instalar "$TMP/node"; then OK=1
  else echo "  A cópia que veio junto não funcionou. Baixando do site oficial..."; fi
fi

if [ -z "$OK" ]; then
  estado baixando
  echo "  Baixando o Node.js do site oficial (cerca de 30 MB)..."
  baixar() { if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"; else wget -q "$1" -O "$2"; fi; }
  if [ -z "$VERSAO" ]; then
    # Nome do pacote na lista do nodejs.org: "linux-x64", "osx-arm64-tar"…
    if [ "$SO" = darwin ]; then CHAVE="osx-$ARQ-tar"; else CHAVE="linux-$ARQ"; fi
    baixar https://nodejs.org/dist/index.json "$TMP/index.json"
    # index.json vem do mais novo para o mais antigo; pega o primeiro LTS ("lts":"Nome") com o pacote deste sistema.
    VERSAO="$(tr '{' '\n' < "$TMP/index.json" | grep '"lts":"' | grep "\"$CHAVE\"" | head -1 | sed 's/.*"version":"\(v[0-9.]*\)".*/\1/')"
    [ -n "$VERSAO" ] || { echo "  Não encontrei uma versão do Node.js para este computador."; exit 1; }
  fi
  NOME="node-$VERSAO-$SO-$ARQ"
  baixar "https://nodejs.org/dist/$VERSAO/$NOME.tar.gz" "$TMP/$NOME.tar.gz"
  baixar "https://nodejs.org/dist/$VERSAO/SHASUMS256.txt" "$TMP/SHASUMS256.txt"
  ESPERADO="$(grep " $NOME.tar.gz\$" "$TMP/SHASUMS256.txt" | awk '{print $1}')"
  if command -v sha256sum >/dev/null 2>&1; then REAL="$(sha256sum "$TMP/$NOME.tar.gz" | awk '{print $1}')"; else REAL="$(shasum -a 256 "$TMP/$NOME.tar.gz" | awk '{print $1}')"; fi
  [ -n "$ESPERADO" ] && [ "$REAL" = "$ESPERADO" ] || { echo "  O arquivo baixado veio corrompido. Tente de novo."; exit 1; }
  tar -xzf "$TMP/$NOME.tar.gz" -C "$TMP" "$NOME/bin/node"
  instalar "$TMP/$NOME/bin/node"
fi

# Copia o versao.txt do projeto tal como está: o iniciador compara os dois byte a byte.
if [ -f "$ARQ_VERSAO" ]; then cp "$ARQ_VERSAO" "$PASTA/versao.txt"; else echo "$VERSAO" > "$PASTA/versao.txt"; fi
estado pronto
echo "  Node.js $VERSAO pronto."
