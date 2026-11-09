# Protocolo Zero - prepara o Node.js no Windows (chamado pelo "Iniciar Protocolo Zero.bat").
# 1. Usa a copia que vem junto com o projeto (instalar\node\node-win-x64.zip).
# 2. Se ela falhar, baixa a MESMA versao do site oficial (nodejs.org) e confere o SHA-256.
# Guarda so o node.exe em runtime\win-x64\ (com versao.txt). Nao instala nada no sistema e nao precisa
# de administrador. Quando o projeto passa a usar outra versao (instalar\node\versao.txt), roda de novo.
# O andamento vai para runtime\estado.js, que a pagina public\configurando.html mostra.
param([Parameter(Mandatory = $true)][string]$Raiz)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # a barra de progresso do PowerShell deixa o download muito lento

$pasta = Join-Path $Raiz 'runtime\win-x64'
$estado = Join-Path $Raiz 'runtime\estado.js'
$arqVersao = Join-Path $Raiz 'instalar\node\versao.txt'
$junto = Join-Path $Raiz 'instalar\node\node-win-x64.zip'
$versao = ''
if (Test-Path $arqVersao) { $versao = (Get-Content $arqVersao -TotalCount 1).Trim() }

function Estado([string]$etapa) {
  Set-Content -Path $estado -Value "window.PZ_ESTADO = { etapa: '$etapa' };" -Encoding ASCII
}

# Extrai o node.exe do zip para runtime\win-x64 e confere se ele abre.
function Instalar([string]$zip, [string]$tmp) {
  $tar = Join-Path $env:SystemRoot 'System32\tar.exe'   # Windows 10+: bem mais rapido que o Expand-Archive
  if (Test-Path $tar) { & $tar -xf $zip -C $tmp 2>$null }
  if (-not (Get-ChildItem $tmp -Recurse -Filter node.exe)) { Expand-Archive -Path $zip -DestinationPath $tmp -Force }
  $exe = Get-ChildItem $tmp -Recurse -Filter node.exe | Select-Object -First 1
  if (-not $exe) { throw 'node.exe nao encontrado no pacote.' }
  Copy-Item $exe.FullName (Join-Path $pasta 'node.exe') -Force
  & (Join-Path $pasta 'node.exe') -e 'process.exit(0)'
  if ($LASTEXITCODE -ne 0) { throw 'O Node.js nao abriu.' }
}

$codigo = 0
$tmp = Join-Path $env:TEMP ('pz-node-' + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Force -Path $pasta, $tmp | Out-Null
  Write-Host ''
  $ok = $false
  if ($versao -and (Test-Path $junto)) {
    Estado 'instalando'
    Write-Host "  Instalando os componentes do Protocolo Zero (Node.js $versao)..."
    try { Instalar $junto $tmp; $ok = $true }
    catch { Write-Host "  A copia que veio junto nao funcionou ($($_.Exception.Message)). Baixando do site oficial..." }
  }
  if (-not $ok) {
    Estado 'baixando'
    Write-Host '  Baixando o Node.js do site oficial (cerca de 30 MB)...'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    if (-not $versao) {
      $indice = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
      $versao = ($indice | Where-Object { $_.lts -and ($_.files -contains 'win-x64-zip') } | Select-Object -First 1).version
    }
    if (-not $versao) { throw 'Nao encontrei uma versao do Node.js para este computador.' }
    $nome = "node-$versao-win-x64"
    $zip = Join-Path $tmp "$nome.zip"
    Invoke-WebRequest "https://nodejs.org/dist/$versao/$nome.zip" -OutFile $zip -UseBasicParsing
    $somas = [string](Invoke-RestMethod "https://nodejs.org/dist/$versao/SHASUMS256.txt")
    $linha = ($somas -split "`n") | Where-Object { $_ -match "\s$([regex]::Escape("$nome.zip"))\s*$" } | Select-Object -First 1
    if (-not $linha) { throw 'Nao foi possivel conferir o arquivo baixado.' }
    $esperado = ($linha.Trim() -split '\s+')[0].ToUpper()
    if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToUpper() -ne $esperado) { throw 'O arquivo baixado veio corrompido. Tente de novo.' }
    $sub = Join-Path $tmp 'baixado'
    New-Item -ItemType Directory -Force -Path $sub | Out-Null
    Instalar $zip $sub
  }
  # Copia o versao.txt do projeto tal como esta: o .bat compara os dois byte a byte.
  if (Test-Path $arqVersao) { Copy-Item $arqVersao (Join-Path $pasta 'versao.txt') -Force }
  else { Set-Content -Path (Join-Path $pasta 'versao.txt') -Value $versao -Encoding ASCII }
  Estado 'pronto'
  Write-Host "  Node.js $versao pronto."
} catch {
  $codigo = 1
  $msg = $_.Exception.Message
  Write-Host "  Nao foi possivel preparar o Node.js: $msg"
  # Arquivo bloqueado, node.exe sumido do pacote ou que nao abre: quase sempre e o antivirus.
  $antivirus = ($_.Exception -is [System.UnauthorizedAccessException]) -or ($msg -match 'negado|denied|sendo usado|being used|bloque|blocked|virus|nao encontrado|nao abriu')
  if ($antivirus) {
    Write-Host '  Provavel bloqueio do antivirus. Veja como resolver na tela "Configurando".'
    try { Estado 'antivirus' } catch {}
  } else {
    try { Estado 'falhou' } catch {}
  }
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
exit $codigo
