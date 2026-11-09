# Protocolo Zero

**Biblioteca de sobrevivência que funciona sem internet, com um assistente de IA no seu próprio computador.**

Manuais de primeiros socorros, água, energia, alimentos, plantas medicinais, reparos e sobrevivência, enciclopédias e mapas — tudo em português, guardado no seu computador e pronto para usar quando a internet ou os serviços pararem.

> Você baixa tudo enquanto tem internet. Depois, o Protocolo Zero funciona **100% offline**.

---

## O que vem nele

- 📚 **Biblioteca** com centenas de livros, cartilhas e manuais de fontes oficiais e confiáveis (Ministério da Saúde, Fiocruz, Embrapa, Defesa Civil, Corpo de Bombeiros, Exército, universidades e outras).
- 🤖 **Assistente de IA** que responde suas perguntas consultando os arquivos baixados e mostra de onde tirou a resposta.
- 🚨 **Iniciar Protocolo Zero**: escolha a emergência (enchente, apagão, terremoto, guerra, epidemia…) e veja na hora o que fazer, os números de emergência e os livros sobre o assunto.
- 🌍 **Enciclopédias offline**: Wikipédia, Wikilivros, iFixit e outras.
- 🗺️ **Mapas offline** do Brasil, dos estados, de outros países e de continentes inteiros.
- 🥫 **Estoque de emergência** e **Saúde e nutrição**: controle de mantimentos, água e remédios da família.
- 📁 **Seus próprios arquivos**: adicione PDFs, livros, vídeos e fotos que você já tem.
- 💾 **Leve com você**: copie tudo para um pendrive ou HD e abra em outro computador.

---

## O que você precisa

| | Mínimo | Recomendado |
|---|---|---|
| Sistema | Windows 10/11, macOS ou Linux | — |
| Memória (RAM) | 4 GB | 8 GB ou mais |
| Espaço livre | 10 GB (pacote Essencial) | 50 GB ou mais |
| Internet | Só na primeira vez, para baixar | — |

Não precisa instalar nada antes: o Protocolo Zero já abre na primeira vez, e você escolhe lá dentro o que baixar. Depois disso, funciona **sem internet**.

---

## Como instalar

### 1. Baixe o Protocolo Zero

No topo desta página, clique no botão verde **Code** → **Download ZIP**.
Depois, extraia (descompacte) o arquivo em uma pasta do seu computador, por exemplo `Documentos\ProtocoloZero`.

> Quem usa git pode clonar: `git clone https://github.com/cezaraugustodev/protocolo-zero.git`

### 2. Abra

Dentro da pasta, dê **dois cliques** no arquivo do seu sistema:

| Sistema | Arquivo |
|---|---|
| **Windows** | `Iniciar Protocolo Zero.bat` |
| **macOS** | `Iniciar Protocolo Zero.command` (na primeira vez: botão direito → **Abrir**) |
| **Linux** | `iniciar-protocolo-zero.sh` (ou, no terminal: `./iniciar-protocolo-zero.sh`) |

Pronto. No Windows, o Protocolo Zero abre direto no navegador, sem janela preta: o andamento e os avisos aparecem no próprio programa. Para fechar, use **Fechar o Protocolo Zero**, no fim do menu lateral.

---

## Primeiro uso

Na primeira vez, a tela **Configurando o Protocolo Zero** só prepara o programa que faz ele funcionar e logo abre a página inicial. Nada mais é baixado nessa hora.

O **Node.js** (o programa que faz o Protocolo Zero funcionar) já vem junto, para Windows, macOS e Linux, e é preparado sozinho na pasta `runtime`, sem instalar nada no sistema. Se algo der errado, ele é baixado do site oficial; se ainda assim falhar, a própria tela mostra como instalar.

> **Linux:** o motor de IA precisa ser instalado uma vez pelo terminal:
> `curl -fsSL https://ollama.com/install.sh | sh`
> No Windows e no macOS, o Protocolo Zero instala sozinho.

Na página inicial, escolha o que guardar no computador:

- **Escolher o que instalar** — abre **Instalar conteúdo**: a IA, os pacotes **Essencial**, **Padrão** ou **Completo**, ou item por item (livros, enciclopédias, cursos e mapas).
- **Instalar o básico sozinho** — escolhe e baixa a IA que roda bem no seu computador e a biblioteca essencial (cerca de 3 GB).

Os downloads continuam enquanto você usa o Protocolo Zero e aparecem em **Transferências**. Se a conexão cair ou você fechar, na próxima vez eles continuam de onde pararam.

---

## Como usar

| No menu | Para quê |
|---|---|
| **Iniciar Protocolo Zero** | Em uma emergência: escolha a situação e veja o que fazer agora, depois, e os materiais sobre ela. |
| **Biblioteca** | Todos os livros e arquivos, separados por categoria e por tipo. A busca procura até dentro dos PDFs. |
| **Assistente** | Pergunte em português. A resposta vem com as fontes; as oficiais têm prioridade. |
| **Enciclopédias** | Wikipédia e outras, sem internet. |
| **Mapas** | Baixe a região que quiser e use offline. Clique no mapa para ver as coordenadas. |
| **Estoque de emergência** | Comida, água, remédios e itens da casa, com validade e duração. |
| **Saúde e nutrição** | Dados da família e necessidades de água e alimentação. |
| **Alimentar biblioteca** | Adicione seus próprios arquivos, com nome e categoria. |
| **Copiar para outro disco** | Leve tudo para um pendrive, HD ou SSD. |
| **Transferências** | Downloads em andamento. Se algo falhar, **Tentar de novo** repete só aquele arquivo. |
| **Ajustes** | IA, aparência, atualizações e inicialização. |

---

## Atualizações

Em **Ajustes → Atualizações** você vê o que há de novo, clica em **Atualizar agora** e pode marcar:

- **Procurar fontes novas sozinho** — uma vez por dia, ao ligar o computador, baixa os livros e manuais novos do seu pacote. Não precisa abrir o programa.
- **Trocar para um modelo de IA melhor quando houver.**
- **Abrir o Protocolo Zero ao ligar o computador.**

A atualização **só acrescenta**. O que você já baixou fica no seu computador, mesmo se a fonte original sair do ar. Seus arquivos, anotações e conversas nunca são alterados.

O **programa** também se atualiza sozinho pelo botão **Atualizar**: quando sai uma versão nova, ele baixa do GitHub só os arquivos que mudaram, confere cada um e mostra **Reiniciar agora** no menu lateral. Seus dados (pasta `dados`) não são tocados.

> **Tem uma cópia anterior a novembro de 2026?** Ela ainda não sabe se atualizar sozinha. Baixe o ZIP de novo uma única vez e substitua os arquivos da pasta, **mantendo a pasta `dados`**. Daí em diante, as próximas versões chegam pelo botão **Atualizar**. (Quem instalou com `git clone` já recebe tudo pelo **Atualizar**.)

---

## Levar no pendrive ou HD

1. Abra **Copiar para outro disco** e escolha o pendrive ou HD.
2. Marque o que levar (os livros e o Node.js já vão; as IAs são opcionais).
3. Clique em **Copiar agora**.

No outro computador, abra a pasta `ProtocoloZero` do pendrive e dê dois cliques em **Iniciar Protocolo Zero**. As instruções também ficam no arquivo `LEIA-ME.txt` da cópia.

Pendrives em **FAT32** não aceitam arquivos maiores que 4 GB. Se o programa avisar, formate em **exFAT**.

---

## Onde ficam os seus dados

Tudo fica na pasta **`dados`**, dentro da pasta do Protocolo Zero: livros baixados, mapas, seus arquivos, anotações e configurações.

- **Backup:** copie a pasta `dados` para outro lugar.
- **Reinstalar ou atualizar:** mantenha a pasta `dados` e substitua o resto.
- **Desinstalar:** apague a pasta do Protocolo Zero. Para remover também as IAs, desinstale o **Ollama** como qualquer programa.

---

## Problemas comuns

| Problema | O que fazer |
|---|---|
| "Não foi possível preparar o Node.js" | Siga as instruções da tela **Configurando**: instale a versão LTS de [nodejs.org](https://nodejs.org) e abra de novo. |
| O navegador não abriu | Abra você mesmo: **http://localhost:4321** |
| A configuração parou com erro | Clique em **Tentar de novo** na tela. Downloads que falharam podem ser repetidos em **Transferências**. |
| O assistente não responde | Em **Ajustes**, veja se o Ollama está **Rodando**. Se não, clique em **Instalar o Ollama** ou abra o aplicativo Ollama. |
| Um download falhou | Em **Transferências**, clique em **Tentar de novo**. |
| PDF sem busca | PDFs escaneados (fotos de páginas) não têm texto para buscar. |
| Pouco espaço | Em **Instalar conteúdo**, desmarque itens que não usa para liberar espaço. |

---

## Sugestões e problemas

O projeto é aberto: qualquer pessoa pode baixar, usar, modificar e compartilhar.

Encontrou um erro, um link quebrado ou tem uma sugestão de livro ou manual? Abra uma **[Issue](../../issues)** contando o que aconteceu.

No momento **não aceito contribuições de código** (pull requests), por falta de tempo para analisá-las — mas as sugestões são lidas e bem-vindas.

---

## Aviso importante

O Protocolo Zero reúne informações para **apoio** e **preparação**. Ele **não substitui** médicos, bombeiros, Defesa Civil nem as autoridades.

- Em uma emergência, ligue **192** (SAMU), **193** (Bombeiros), **190** (Polícia) ou **199** (Defesa Civil).
- O assistente de IA **pode errar**. Confira sempre na fonte indicada; as fontes oficiais têm prioridade.
- Siga sempre as orientações das autoridades locais.

Os livros, manuais e mapas pertencem aos seus autores e são baixados das fontes originais, que são de distribuição livre.

---

## Licença

Código sob a licença [MIT](LICENSE): livre para usar, modificar e distribuir.
