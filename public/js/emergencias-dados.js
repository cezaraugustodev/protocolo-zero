// Manual rápido por tipo de emergência. Usado na tela "Emergência agora", no "Iniciar Protocolo Zero"
// e pelo servidor (o assistente sabe qual emergência o usuário marcou).
// Só dados (sem DOM): este arquivo também é importado pelo servidor.
// Base: orientações da Defesa Civil (Brasil), Ministério da Saúde, OMS, Cruz Vermelha/IFRC, FEMA/Ready.gov e CDC.
// São orientações gerais: em qualquer emergência, siga primeiro a Defesa Civil e as autoridades locais.
// Sem doses de remédio: o app nunca dá doses; segue sempre as fontes oficiais.

export const GRUPOS_EMERGENCIA = [
  ['natureza', 'Desastres naturais'],
  ['espaco', 'Céu e espaço'],
  ['saude', 'Saúde'],
  ['humana', 'Conflitos e falhas'],
];

// Vale para todas as emergências.
export const BASE_EMERGENCIA = {
  agora: [
    'Mantenha a calma e confira se todos da casa estão bem. Primeiro as pessoas, depois as coisas.',
    'Emergência médica: SAMU 192. Fogo, resgate ou soterramento: Bombeiros 193. Riscos e abrigos: Defesa Civil 199.',
    'Siga as ordens da Defesa Civil e das autoridades. Se mandarem sair, saia.',
    'Ouça rádio a pilha ou à manivela: ele funciona mesmo sem internet e sem energia.',
    'Separe a mochila de emergência: água, comida pronta, documentos, remédios de uso contínuo com receita, lanterna, pilhas, carregador portátil, roupa e dinheiro em espécie.',
    'Combine um ponto de encontro e uma pessoa de contato fora da cidade com a família.',
  ],
  termos: ['primeiros socorros', 'emergencia', 'sobrevivencia', 'defesa civil', 'desastre'],
};

export const EMERGENCIAS = [
  // ---------------- Desastres naturais ----------------
  {
    id: 'enchente', grupo: 'natureza', icone: 'onda', nome: 'Enchente ou inundação',
    resumo: 'Água subindo rápido em ruas, rios ou casas.',
    agora: [
      'Vá para um lugar alto e seguro. Se a Defesa Civil mandar sair, saia na hora.',
      'Nunca atravesse água corrente, a pé ou de carro: 15 cm de água em movimento derrubam uma pessoa e 30 cm podem arrastar um carro.',
      'Se for seguro, desligue a energia na chave geral e feche o registro do gás antes de sair.',
      'Leve documentos e remédios em saco plástico fechado.',
      'Fique longe de fios caídos e de bueiros: a água pode estar com corrente elétrica ou puxar você.',
    ],
    depois: [
      'Só volte para casa quando a Defesa Civil liberar. Confira rachaduras antes de entrar.',
      'Água de enchente é contaminada. Não beba e não use para lavar alimentos; trate a água antes (veja as cartilhas de água).',
      'Use botas e luvas na limpeza. Febre, dor no corpo e na batata da perna dias depois do contato com a água podem ser leptospirose: procure atendimento.',
      'Jogue fora alimentos que tiveram contato com a água da enchente.',
    ],
    termos: ['enchente', 'inundacao', 'cheia', 'agua', 'leptospirose', 'hipoclorito', 'desinfeccao', 'limpeza'],
    perguntas: ['Como limpar a casa depois de uma enchente com segurança?', 'Como tratar a água para beber depois de uma enchente?', 'Quais são os sinais de leptospirose?'],
  },
  {
    id: 'deslizamento', grupo: 'natureza', icone: 'montanha', nome: 'Deslizamento de terra',
    resumo: 'Morro, encosta ou barranco cedendo, em geral com chuva forte.',
    agora: [
      'Sinais de perigo: rachaduras novas em paredes ou no chão, portas que emperram, árvores, postes ou muros tortos, água barrenta brotando, estalos e barulho de terra.',
      'Viu um sinal? Saia de casa na hora e avise os vizinhos e a Defesa Civil (199).',
      'Vá para longe da encosta e do caminho por onde a terra desceria.',
      'Durante chuva forte em área de risco, durma fora de casa (parente, abrigo) se a Defesa Civil avisar.',
    ],
    depois: [
      'Não volte para a área até a Defesa Civil liberar: novos deslizamentos são comuns.',
      'Pessoa soterrada: chame os Bombeiros (193). Não tente cavar sozinho se o terreno estiver instável.',
    ],
    termos: ['deslizamento', 'encosta', 'barranco', 'morro', 'rachadura', 'rachaduras', 'area de risco', 'soterramento', 'defesa civil'],
    perguntas: ['Quais são os sinais de que um morro vai deslizar?', 'Como ajudar uma pessoa resgatada de soterramento até o socorro chegar?'],
  },
  {
    id: 'tempestade', grupo: 'natureza', icone: 'raio', nome: 'Tempestade, vendaval ou raios',
    resumo: 'Chuva forte, ventos, granizo e descargas elétricas.',
    agora: [
      'Fique dentro de uma construção firme, longe de janelas e portas de vidro.',
      'Ouviu trovão? O raio pode cair perto. Saia de campos abertos, piscinas, rios, praias e de baixo de árvores.',
      'Na rua, não fique perto de postes, torres, placas e muros.',
      'Retire da tomada aparelhos eletrônicos. Evite banho de chuveiro elétrico durante raios.',
      'Prenda ou recolha objetos soltos no quintal e na laje.',
    ],
    depois: [
      'Não toque em fios caídos. Avise a companhia de energia.',
      'Pessoa atingida por raio não fica com carga elétrica: pode tocar e começar os primeiros socorros (reanimação se não respirar) e chamar o SAMU 192.',
    ],
    termos: ['tempestade', 'raio', 'vendaval', 'granizo', 'chuva', 'choque eletrico'],
    perguntas: ['O que fazer se alguém for atingido por um raio?', 'Como me proteger de raios se eu estiver em campo aberto?'],
  },
  {
    id: 'tornado', grupo: 'natureza', icone: 'vento', nome: 'Tornado',
    resumo: 'Funil de vento girando, com barulho forte como um trem.',
    agora: [
      'Vá para o cômodo mais interno do andar mais baixo, sem janelas (banheiro, corredor, porão).',
      'Abaixe-se e proteja a cabeça e o pescoço com os braços, colchão ou cobertor.',
      'Carro, trailer e casa leve não protegem. Procure uma construção firme.',
      'Não se abrigue embaixo de viaduto ou ponte: o vento fica ainda mais forte ali.',
      'Sem abrigo: deite em uma vala ou lugar baixo, longe de árvores e carros, e proteja a cabeça.',
    ],
    depois: [
      'Cuidado com pregos, vidros e fios. Use calçado fechado.',
      'Sentiu cheiro de gás? Saia e não acenda nada.',
    ],
    termos: ['tornado', 'vendaval', 'vento', 'abrigo'],
    perguntas: ['Qual o lugar mais seguro da casa durante um tornado?', 'Como fazer um abrigo improvisado contra vento forte?'],
  },
  {
    id: 'ciclone', grupo: 'natureza', icone: 'vento', nome: 'Ciclone ou furacão',
    resumo: 'Ventos muito fortes e chuva por horas, às vezes com ressaca no mar.',
    agora: [
      'Os ciclones costumam ser avisados com antecedência: siga a Defesa Civil e saia cedo se mandarem.',
      'Prenda ou recolha telhas soltas, antenas e objetos do quintal. Feche e proteja as janelas.',
      'Guarde água, comida, lanterna, pilhas e carregue os celulares.',
      'Durante o vento, fique no cômodo mais interno, longe de janelas.',
      'Se o vento parar de repente, pode ser o "olho" do furacão: o vento volta do outro lado. Não saia.',
    ],
    depois: [
      'Fique longe de fios caídos e de árvores tortas.',
      'Na costa, cuidado com ressaca e alagamentos depois da tempestade.',
    ],
    termos: ['ciclone', 'furacao', 'vendaval', 'tempestade', 'vento'],
    perguntas: ['Como preparar a casa para um ciclone?', 'O que guardar em casa antes de um ciclone chegar?'],
  },
  {
    id: 'terremoto', grupo: 'natureza', icone: 'sismo', nome: 'Terremoto',
    resumo: 'Chão tremendo; pode vir com réplicas.',
    agora: [
      'ABAIXE-SE, PROTEJA-SE e SEGURE-SE: fique de joelhos, cubra a cabeça e o pescoço e segure-se embaixo de uma mesa forte.',
      'Não corra para fora enquanto o chão treme: a maioria dos ferimentos vem de coisas que caem.',
      'Fique longe de janelas, espelhos, estantes e paredes externas.',
      'Na rua: vá para um lugar aberto, longe de prédios, postes e fios.',
      'Dirigindo: pare longe de pontes, viadutos e prédios e fique no carro.',
    ],
    depois: [
      'Espere réplicas: elas podem derrubar o que ficou abalado.',
      'Não use elevador. Sentiu cheiro de gás? Feche o registro, abra as janelas e saia.',
      'Perto do mar: depois de um terremoto forte, suba para um lugar alto. Pode vir um tsunami.',
    ],
    termos: ['terremoto', 'sismo', 'tremor', 'soterramento', 'primeiros socorros'],
    perguntas: ['O que fazer logo depois de um terremoto?', 'Como checar se a casa ficou segura depois de um tremor?'],
  },
  {
    id: 'tsunami', grupo: 'natureza', icone: 'onda', nome: 'Tsunami',
    resumo: 'Ondas gigantes depois de terremoto no mar.',
    agora: [
      'Na praia, sentiu um terremoto forte ou viu o mar recuar de repente? Não espere alerta: corra para um lugar alto ou para longe da costa.',
      'Vá a pé se puder: as ruas congestionam.',
      'Sem morro perto? Suba nos andares altos de um prédio forte de concreto.',
      'Nunca vá até a praia para olhar a onda.',
    ],
    depois: [
      'Vêm várias ondas, por horas, e a primeira pode não ser a maior. Só volte quando as autoridades liberarem.',
      'A água que fica é contaminada e cheia de destroços.',
    ],
    termos: ['tsunami', 'maremoto', 'onda', 'costa', 'evacuacao'],
    perguntas: ['Quais são os sinais de que um tsunami vai chegar?', 'Como planejar uma rota de fuga de tsunami?'],
  },
  {
    id: 'vulcao', grupo: 'natureza', icone: 'montanha', nome: 'Erupção de vulcão ou cinzas',
    resumo: 'Lava, gases e chuva de cinzas.',
    agora: [
      'Siga a ordem de evacuação. Fique longe de vales e rios que descem do vulcão.',
      'Com cinzas no ar: fique dentro de casa, feche portas e janelas e desligue o ar-condicionado.',
      'Se precisar sair: use máscara (PFF2/N95 é melhor; um pano úmido ajuda), óculos e roupa de manga comprida.',
      'Evite dirigir: a cinza deixa a pista escorregadia e estraga o motor.',
    ],
    depois: [
      'Cinza acumulada pesa e pode derrubar o telhado. Tire com cuidado e com máscara.',
      'Cubra caixas d\'água e poços para a cinza não contaminar a água.',
    ],
    termos: ['vulcao', 'cinzas', 'erupcao', 'mascara', 'evacuacao'],
    perguntas: ['Como proteger a respiração de cinza vulcânica?'],
  },
  {
    id: 'calor', grupo: 'natureza', icone: 'termometro', nome: 'Calor extremo',
    resumo: 'Ondas de calor; risco maior para idosos, bebês e doentes.',
    agora: [
      'Beba água várias vezes ao dia, mesmo sem sede. Evite bebida alcoólica.',
      'Evite sol e esforço das 10h às 16h. Use roupa leve e clara, chapéu e fique na sombra.',
      'Resfrie a casa: feche janelas e cortinas do lado do sol durante o dia e abra à noite.',
      'Visite idosos e pessoas que moram sozinhas. Nunca deixe crianças ou animais em carro fechado.',
      'Insolação é emergência: pele quente e seca ou suando muito, confusão, desmaio. Chame o SAMU 192, leve para a sombra e resfrie com água e pano molhado.',
    ],
    depois: [
      'Dor de cabeça, tontura, cãibra e cansaço forte são sinais de alerta: descanse na sombra e beba água.',
    ],
    termos: ['calor', 'insolacao', 'desidratacao', 'hidratacao', 'reidratacao', 'agua'],
    perguntas: ['Como reconhecer e tratar insolação?', 'Como fazer soro caseiro segundo o Ministério da Saúde?', 'Como deixar a casa mais fresca sem energia?'],
  },
  {
    id: 'frio', grupo: 'natureza', icone: 'neve', nome: 'Frio extremo, geada ou neve',
    resumo: 'Temperaturas muito baixas; risco de hipotermia.',
    agora: [
      'Vista várias camadas de roupa e cubra cabeça, mãos e pés. Troque roupa molhada logo.',
      'Fiquem todos em um só cômodo e fechem frestas com panos.',
      'NUNCA use carvão, fogareiro, churrasqueira ou gerador dentro de casa: o gás (monóxido de carbono) não tem cheiro e mata.',
      'Hipotermia: tremor forte, fala enrolada, confusão, sono. Leve para lugar quente, tire a roupa molhada, cubra com cobertores e chame o SAMU 192.',
      'Ajude quem mora na rua: indique abrigos da prefeitura.',
    ],
    depois: [
      'Partes do corpo brancas, duras ou dormentes podem estar congeladas: aqueça devagar com água morna (não quente) e procure atendimento.',
    ],
    termos: ['frio', 'hipotermia', 'geada', 'neve', 'aquecimento', 'monoxido'],
    perguntas: ['Como reconhecer e tratar hipotermia?', 'Como me aquecer sem energia e sem risco de gás?'],
  },
  {
    id: 'seca', grupo: 'natureza', icone: 'gota', nome: 'Seca ou falta de água',
    resumo: 'Torneiras secas ou racionamento por muitos dias.',
    agora: [
      'Guarde água para beber primeiro: pelo menos 2 litros por pessoa por dia, mais no calor.',
      'Guarde água limpa em recipientes de plástico limpos e tampados, longe do sol.',
      'Água de fonte duvidosa: filtre e trate antes de beber (ferver ou usar hipoclorito, como manda a cartilha oficial).',
      'Reaproveite: água do banho e da lavagem vai para a descarga e o chão.',
    ],
    depois: [
      'Água guardada da torneira vale por até 6 meses; troque depois disso.',
      'Diarreia com fraqueza, principalmente em crianças e idosos, é sinal de desidratação: dê soro e procure atendimento.',
    ],
    termos: ['agua', 'seca', 'hipoclorito', 'filtro', 'cisterna', 'chuva', 'desinfeccao', 'potavel', 'poco'],
    perguntas: ['Como tratar água para beber sem ferver?', 'Como construir uma cisterna para captar água da chuva?', 'Quanta água guardar por pessoa?'],
  },
  {
    id: 'incendio', grupo: 'natureza', icone: 'fogo', nome: 'Incêndio florestal ou fumaça',
    resumo: 'Fogo no mato chegando perto ou fumaça forte no ar.',
    agora: [
      'Se mandarem sair, saia cedo, com a rota de fuga longe do fogo.',
      'Com fumaça: fique dentro de casa, feche portas e janelas. Máscara PFF2/N95 protege; pano úmido ajuda pouco.',
      'Fumaça no cômodo: abaixe-se perto do chão, onde o ar é mais limpo.',
      'Roupa pegando fogo: PARE, DEITE e ROLE no chão.',
      'Ligue para os Bombeiros (193). Não tente apagar fogo grande sozinho.',
    ],
    depois: [
      'Queimadura: água corrente fria por 20 minutos. Não passe pasta de dente, manteiga ou pó de café. Queimadura grande: SAMU 192.',
      'Falta de ar ou tosse forte depois da fumaça: procure atendimento.',
    ],
    termos: ['incendio', 'fogo', 'queimadura', 'fumaca', 'queimada'],
    perguntas: ['Como tratar uma queimadura segundo os primeiros socorros?', 'Como proteger a casa de um incêndio no mato?'],
  },

  // ---------------- Céu e espaço ----------------
  {
    id: 'asteroide', grupo: 'espaco', icone: 'cometa', nome: 'Meteoro, asteroide ou queda de objeto do espaço',
    resumo: 'Bola de fogo no céu, explosão no ar ou impacto avisado com antecedência.',
    agora: [
      'Asteroides grandes costumam ser vistos com meses ou anos de antecedência: siga a Defesa Civil e os planos de evacuação.',
      'Viu um clarão muito forte no céu? Afaste-se de janelas e proteja-se atrás de uma parede: a onda de choque chega segundos ou minutos depois e quebra vidros.',
      'Não olhe fixo para o clarão.',
      'Não toque em pedaços caídos (podem estar quentes ou ser lixo espacial com combustível tóxico). Avise as autoridades.',
    ],
    depois: [
      'Muitos ferimentos vêm de vidro quebrado: limpe cortes com água limpa e cubra.',
      'Impacto grande pode causar incêndios, tsunami (se cair no mar) e poeira no ar: veja também essas emergências.',
    ],
    termos: ['asteroide', 'meteoro', 'meteorito', 'impacto', 'abrigo', 'ferimento'],
    perguntas: ['O que fazer se um meteoro explodir no céu perto de mim?', 'Como cuidar de cortes por vidro quebrado?'],
  },
  {
    id: 'tempestade-solar', grupo: 'espaco', icone: 'sol', nome: 'Tempestade solar',
    resumo: 'Explosão no Sol que pode derrubar energia, GPS, satélites e comunicações.',
    agora: [
      'Em geral é avisada com 1 a 3 dias. Carregue celulares, baterias e lanternas.',
      'Guarde água: bombas de água param sem energia.',
      'Tenha dinheiro em espécie e mapas em papel ou offline (o Protocolo Zero tem mapas offline).',
      'Desligue da tomada aparelhos sensíveis se houver aviso de pico.',
    ],
    depois: [
      'Siga as dicas de "Apagão" enquanto a energia não voltar.',
    ],
    termos: ['apagao', 'energia', 'gerador', 'solar', 'bateria', 'radio'],
    perguntas: ['Como me preparar para ficar dias sem energia e sem internet?'],
  },

  // ---------------- Saúde ----------------
  {
    id: 'epidemia', grupo: 'saude', icone: 'virus', nome: 'Epidemia ou pandemia',
    resumo: 'Doença se espalhando rápido.',
    agora: [
      'Siga o Ministério da Saúde e a secretaria de saúde da cidade.',
      'Lave as mãos com água e sabão várias vezes por dia. Use máscara se pedirem.',
      'Quem está doente fica em um cômodo separado, com objetos próprios.',
      'Mantenha a vacinação em dia.',
      'Sinais de gravidade (falta de ar, lábios roxos, confusão, desmaio): SAMU 192.',
    ],
    depois: [
      'Limpe superfícies com água sanitária diluída como manda a cartilha oficial.',
    ],
    termos: ['epidemia', 'pandemia', 'doenca', 'infecciosa', 'isolamento', 'higiene', 'vacina', 'mascara'],
    perguntas: ['Como cuidar de um doente em casa sem passar a doença para os outros?', 'Como preparar água sanitária para limpar superfícies?'],
  },
  {
    id: 'quimico', grupo: 'saude', icone: 'quimico', nome: 'Vazamento químico ou nuvem tóxica',
    resumo: 'Acidente com produto químico, cheiro forte, nuvem colorida.',
    agora: [
      'Afaste-se do local, de costas para o vento, e vá para um lugar alto.',
      'Se mandarem ficar em casa: feche portas e janelas, desligue ventiladores e ar-condicionado e vede frestas com pano molhado.',
      'Fique em um cômodo interno, de preferência acima do térreo (muitos gases pesados ficam embaixo).',
      'Teve contato com o produto? Tire a roupa (corte em vez de puxar pela cabeça), lave a pele com muita água e sabão e chame o SAMU 192.',
    ],
    depois: [
      'Não coma alimentos nem beba água que podem ter sido contaminados até as autoridades liberarem.',
    ],
    termos: ['quimico', 'intoxicacao', 'envenenamento', 'toxico', 'contaminacao'],
    perguntas: ['O que fazer em caso de intoxicação por produto químico?', 'Como se proteger dentro de casa de uma nuvem tóxica?'],
  },

  // ---------------- Conflitos e falhas ----------------
  {
    id: 'guerra', grupo: 'humana', icone: 'escudo', nome: 'Guerra ou conflito armado',
    resumo: 'Bombardeios, tiroteios, fronteiras fechadas ou ocupação.',
    agora: [
      'Siga os alertas oficiais e as rotas de fuga indicadas.',
      'Abrigo: subsolo ou cômodo interno, longe de janelas, com paredes grossas.',
      'Tenha a mochila pronta com documentos (em saco plástico), água, comida, remédios e dinheiro.',
      'Combine com a família um ponto de encontro e um contato fora da região.',
      'Não fotografe nem filme tropas ou instalações militares. Não espalhe boatos.',
    ],
    depois: [
      'Não toque em objetos estranhos, bombas que não explodiram ou munição: marque o lugar e avise as autoridades.',
      'Perdeu contato com parentes? A Cruz Vermelha tem um serviço para reencontrar famílias.',
    ],
    termos: ['guerra', 'conflito', 'abrigo', 'ferimento', 'hemorragia', 'primeiros socorros', 'militar', 'sobrevivencia'],
    perguntas: ['Como estancar um sangramento forte?', 'Como montar um abrigo seguro dentro de casa?', 'O que levar numa mochila de fuga?'],
  },
  {
    id: 'nuclear', grupo: 'humana', icone: 'radiacao', nome: 'Ataque nuclear ou radiação',
    resumo: 'Explosão nuclear, acidente em usina ou poeira radioativa.',
    agora: [
      'ENTRE, FIQUE DENTRO, FIQUE INFORMADO: vá para dentro de uma construção firme agora.',
      'Viu um clarão? Não olhe para ele. Deite no chão, cubra a cabeça e espere a onda de choque passar antes de levantar.',
      'Abrigue-se no subsolo ou no meio do prédio, longe de paredes externas e do telhado. Fique pelo menos 24 horas, ou até as autoridades mandarem sair.',
      'Esteve na rua? Tire a roupa de fora (põe em saco fechado), tome banho com sabão e lave o cabelo com xampu, sem condicionador.',
      'Tome iodeto de potássio SÓ se as autoridades de saúde mandarem e como elas mandarem: não protege de tudo e pode fazer mal.',
    ],
    depois: [
      'Use só comida e água de embalagens fechadas ou que estavam dentro de casa.',
      'Fique no rádio para saber quando e para onde sair.',
    ],
    termos: ['nuclear', 'radiacao', 'radioativo', 'abrigo', 'contaminacao'],
    perguntas: ['Como montar um abrigo contra poeira radioativa em casa?', 'Como descontaminar uma pessoa depois de exposição à radiação?'],
  },
  {
    id: 'apagao', grupo: 'humana', icone: 'tomada', nome: 'Apagão',
    resumo: 'Sem energia elétrica por horas, dias ou semanas.',
    agora: [
      'Use lanternas em vez de velas (menos risco de incêndio).',
      'Mantenha geladeira e freezer fechados: a geladeira segura uns 4 horas; o freezer cheio, cerca de 2 dias (metade cheio, 1 dia).',
      'Gerador sempre do lado de fora, longe de portas e janelas: o gás dele mata.',
      'Desligue os aparelhos da tomada para evitar estragos quando a energia voltar. Deixe uma lâmpada ligada para saber quando voltou.',
      'Guarde água: as bombas de água podem parar.',
      'Remédios que ficam na geladeira (como insulina): veja a bula e pergunte ao farmacêutico quanto tempo duram fora dela.',
    ],
    depois: [
      'Alimento que ficou mais de 2 horas acima de 4 °C (carne, leite, ovos, sobras): na dúvida, jogue fora.',
      'Energia solar e baterias ajudam muito em apagões longos: veja a seção de energia.',
    ],
    termos: ['apagao', 'energia', 'eletricidade', 'gerador', 'solar', 'bateria', 'conservacao', 'alimentos', 'refrigeracao'],
    perguntas: ['Como conservar alimentos sem geladeira?', 'Como montar um sistema solar simples para ter luz e carregar o celular?', 'Quanto tempo os alimentos duram na geladeira desligada?'],
  },
  {
    id: 'hacker', grupo: 'humana', icone: 'cadeado', nome: 'Ataque hacker em massa ou colapso digital',
    resumo: 'Bancos, internet, celulares e serviços fora do ar ou invadidos.',
    agora: [
      'Tenha dinheiro em espécie e documentos em papel.',
      'Não clique em links nem responda mensagens pedindo senha, código ou PIX, mesmo de conhecidos. Confirme por telefone ou pessoalmente.',
      'Banco: use só o telefone que está no cartão ou vá à agência.',
      'Troque senhas importantes e ative a verificação em duas etapas quando os serviços voltarem.',
      'Desconecte da internet o que não precisa estar ligado. Guarde cópias de arquivos importantes em pendrive ou HD desconectado.',
      'O Protocolo Zero funciona sem internet: biblioteca, mapas e assistente continuam aqui.',
    ],
    depois: [
      'Confira extratos e compras. Avise o banco de qualquer movimento estranho.',
    ],
    termos: ['seguranca', 'informatica', 'computador', 'senha', 'rede', 'radio'],
    perguntas: ['Como proteger meu computador e meu celular de ataques?', 'Como me comunicar com a família sem internet e sem celular?'],
  },
  {
    id: 'ia', grupo: 'humana', icone: 'robo', nome: 'IAs fora de controle',
    resumo: 'Cenário hipotético: sistemas de IA falhando ou agindo contra as pessoas.',
    agora: [
      'Desconfie de vídeos, áudios e mensagens, mesmo com rosto e voz de conhecidos: podem ser falsos. Combine uma palavra-senha com a família.',
      'Confirme notícias e ordens por canais oficiais e por pessoas, pessoalmente ou no rádio.',
      'Desligue da internet aparelhos e casas "inteligentes" que não precisam dela. Prefira controles manuais.',
      'Tenha papel: mapas, contatos, documentos e anotações importantes impressos.',
      'Siga as dicas de "Ataque hacker" e "Apagão": os efeitos práticos são parecidos.',
      'A IA do Protocolo Zero roda só no seu computador, sem internet, e nunca executa comandos: ela só explica.',
    ],
    depois: [
      'Reencontre a comunidade: vizinhos e grupos locais organizados são a melhor defesa.',
    ],
    termos: ['seguranca', 'informatica', 'radio', 'comunicacao', 'sobrevivencia'],
    perguntas: ['Como saber se um vídeo ou áudio foi feito por IA?', 'Como montar uma rede de comunicação com vizinhos sem internet?'],
  },
  {
    id: 'abastecimento', grupo: 'humana', icone: 'carrinho', nome: 'Falta de comida ou de combustível',
    resumo: 'Mercados vazios, greves, estradas fechadas ou crise longa.',
    agora: [
      'Veja quanto tempo o seu estoque dura no Estoque de emergência.',
      'Divida a comida por dia e por pessoa. Coma primeiro o que estraga mais rápido.',
      'Crianças, gestantes, idosos e doentes têm prioridade.',
      'Combine com vizinhos: trocar e dividir é mais seguro que sair procurando sozinho.',
    ],
    depois: [
      'Comece uma horta (folhas crescem em 30 a 60 dias) e veja criação de galinhas e conservas na Biblioteca.',
      'Acompanhe o peso da família em Saúde e nutrição.',
    ],
    termos: ['alimentos', 'horta', 'cultivo', 'conserva', 'estoque', 'nutricao', 'galinha', 'criacao', 'pesca'],
    perguntas: ['Como fazer uma horta rápida para produzir comida em poucas semanas?', 'Como conservar alimentos sem geladeira?', 'Como dividir a comida para durar mais sem passar fome?'],
  },
  {
    id: 'disturbios', grupo: 'humana', icone: 'pessoas', nome: 'Distúrbios ou violência nas ruas',
    resumo: 'Protestos violentos, saques, toque de recolher.',
    agora: [
      'Fique em casa e longe de janelas. Evite multidões.',
      'Se precisar sair, use rotas alternativas e vá acompanhado. Avise alguém do caminho.',
      'Tenha água, comida e remédios para alguns dias.',
      'Siga o toque de recolher e as orientações da polícia (190).',
    ],
    depois: [
      'Ferimentos: veja primeiros socorros. Sangramento forte: aperte firme com pano limpo e chame o SAMU 192.',
    ],
    termos: ['seguranca', 'primeiros socorros', 'ferimento', 'hemorragia'],
    perguntas: ['Como estancar um sangramento forte?', 'O que ter em casa para passar alguns dias sem sair?'],
  },
];

export const emergenciaPorId = (id) => EMERGENCIAS.find((e) => e.id === id);
