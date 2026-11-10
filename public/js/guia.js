// Guia rápido de emergência: disponível mesmo antes de baixar qualquer conteúdo.
// Baseado em orientações do Ministério da Saúde, SAMU, OMS e Cruz Vermelha. Não substitui atendimento profissional.
export const NUMEROS = [
  { n: '192', nome: 'SAMU' },
  { n: '193', nome: 'Bombeiros' },
  { n: '190', nome: 'Polícia' },
  { n: '199', nome: 'Defesa Civil' },
];

export const FICHAS = [
  {
    titulo: 'Parada cardíaca (adulto)', icone: 'coracao', cor: '#c4553a',
    passos: [
      'Confira se a pessoa responde e respira normalmente. Se não, ligue 192 (ou peça para alguém ligar).',
      'Mãos sobrepostas no centro do peito, braços esticados.',
      'Comprima forte e rápido: 5–6 cm de profundidade, 100 a 120 vezes por minuto.',
      'Deixe o peito voltar totalmente entre as compressões. Não pare até chegar ajuda ou a pessoa reagir.',
      'Se houver desfibrilador (DEA), ligue e siga as instruções de voz.',
    ],
    fonte: 'Diretrizes de RCP para leigos (AHA / SBC)',
  },
  {
    titulo: 'Sangramento forte', icone: 'cruz', cor: '#c4553a',
    passos: [
      'Faça pressão direta e firme sobre o ferimento com pano limpo.',
      'Se o pano encharcar, não tire: coloque outro por cima e continue pressionando.',
      'Em braço ou perna com sangramento que não para com pressão, use torniquete 5–7 cm acima do ferimento e anote o horário.',
      'Mantenha a vítima deitada e aquecida, e busque socorro.',
    ],
    fonte: 'Manual de Primeiros Socorros — Fiocruz',
  },
  {
    titulo: 'Queimaduras', icone: 'fogo', cor: '#d49a1f',
    passos: [
      'Resfrie com água corrente fria (não gelada) por 20 minutos.',
      'Retire anéis, relógios e roupas que não estejam grudadas.',
      'Cubra com pano limpo ou filme plástico, sem apertar.',
      'Não use gelo, pasta de dente, manteiga ou pó de café. Não estoure bolhas.',
      'Queimaduras grandes, no rosto, mãos, genitais ou em crianças: atendimento médico.',
    ],
    fonte: 'Ministério da Saúde / Cruz Vermelha',
  },
  {
    titulo: 'Picada de cobra', icone: 'alerta', cor: '#8a5a3a',
    passos: [
      'Afaste-se do animal e mantenha a vítima calma e deitada, se movendo o mínimo.',
      'Lave o local com água e sabão e retire anéis ou calçados apertados.',
      'NÃO faça torniquete, não corte, não chupe e não coloque nada no local.',
      'Leve rapidamente a um hospital: o tratamento é o soro antiofídico.',
      'Se for seguro, fotografe o animal para ajudar na identificação.',
    ],
    fonte: 'Guia de Animais Peçonhentos — Ministério da Saúde',
  },
  {
    titulo: 'Engasgo (adulto consciente)', icone: 'info', cor: '#2f7fa8',
    passos: [
      'Se a pessoa consegue tossir, incentive a tosse.',
      'Se não consegue falar nem respirar: posicione-se atrás dela e abrace-a pela cintura.',
      'Feche uma mão em punho acima do umbigo, cubra com a outra e puxe para dentro e para cima, com força.',
      'Repita até o objeto sair. Se ela desmaiar, ligue 192 e comece a RCP.',
    ],
    fonte: 'Manobra de Heimlich — SAMU',
  },
  {
    titulo: 'Água segura para beber', icone: 'gota', cor: '#2f7fa8',
    passos: [
      'Se a água estiver turva, deixe decantar e coe em pano limpo antes de tratar.',
      'Água muito barrenta: o pó da semente de moringa (árvore comum no Nordeste; fotos e passo a passo na Biblioteca) faz a sujeira descer. Ela só clareia, não mata germes: depois ferva ou use hipoclorito.',
      'Ferva por pelo menos 1 minuto (fervura forte) e deixe esfriar tampada.',
      'Sem fogo: 2 gotas de hipoclorito de sódio 2,5% por litro. Misture e espere 30 minutos.',
      'Água sanitária só se o rótulo indicar uso em água para consumo (sem perfume ou alvejante extra).',
      'Sem nada: garrafa PET transparente cheia de água clara, deitada ao sol forte por 6 horas.',
    ],
    fonte: 'Ministério da Saúde / OMS (método SODIS)',
  },
  {
    titulo: 'Diarreia e desidratação', icone: 'gota', cor: '#5f8a3a',
    passos: [
      'Prefira os sais de reidratação oral (SRO) distribuídos nos postos de saúde.',
      'Soro caseiro: 1 litro de água limpa + 1 colher de chá rasa de sal + 2 colheres de sopa rasas de açúcar.',
      'Ofereça em pequenos goles, várias vezes, após cada evacuação.',
      'Sinais de alerta: sangue nas fezes, sonolência, boca muito seca, sem urinar — procure atendimento.',
    ],
    fonte: 'Ministério da Saúde',
  },
  {
    titulo: 'Kit básico de emergência', icone: 'bussola', cor: '#8a5a3a',
    passos: [
      'Água: 4 litros por pessoa por dia, para pelo menos 3 dias.',
      'Comida que não estraga, abridor de latas, lanterna, pilhas e rádio.',
      'Kit de primeiros socorros, remédios de uso contínuo e cópias de documentos.',
      'Apito, canivete, isqueiro, sacos plásticos, carregador portátil e dinheiro em espécie.',
      'Combine com a família um ponto de encontro e um contato fora da cidade.',
    ],
    fonte: 'Defesa Civil',
  },
];
