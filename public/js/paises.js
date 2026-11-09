// Países e regiões fora do Brasil para os mapas offline: [oeste, sul, leste, norte] (graus).
// O recorte vem do mesmo mapa mundial (OpenStreetMap via Protomaps); só a área escolhida é baixada.
// Continentes inteiros (sem cruzar a linha de data de 180°; ilhas do Pacífico além dela ficam de fora).
export const CONTINENTES = [
  ['america-sul', 'América do Sul', 'da América do Sul', [-82, -56.1, -34, 13]],
  ['america-central', 'América Central e Caribe', 'da América Central e Caribe', [-118.5, 7, -59.4, 27.5]],
  ['america-norte', 'América do Norte', 'da América do Norte', [-170, 7, -52, 84]],
  ['europa', 'Europa', 'da Europa', [-25, 34, 60, 72]],
  ['africa', 'África', 'da África', [-26, -35, 52, 38]],
  ['asia', 'Ásia', 'da Ásia', [25, -11, 180, 78]],
  ['oceania', 'Oceania', 'da Oceania', [110, -48, 180, 0]],
  ['antartida', 'Antártida', 'da Antártida', [-180, -90, 180, -60]],
];
export const continentePorId = (id) => {
  const c = CONTINENTES.find((x) => x[0] === id);
  return c && { nome: c[1], titulo: `Mapa ${c[2]}`, bbox: c[3], continente: true };
};

export const PAISES = [
  { grupo: 'América do Sul', itens: [
    ['AR', 'Argentina', [-73.6, -55.1, -53.6, -21.8]],
    ['BO', 'Bolívia', [-69.7, -22.9, -57.4, -9.6]],
    ['CL', 'Chile', [-75.8, -56, -66.4, -17.5]],
    ['CO', 'Colômbia', [-79.1, -4.3, -66.8, 12.5]],
    ['EC', 'Equador (continente)', [-81.1, -5, -75.2, 1.5]],
    ['GY', 'Guiana', [-61.4, 1.1, -56.5, 8.6]],
    ['GF', 'Guiana Francesa', [-54.6, 2.1, -51.6, 5.8]],
    ['PY', 'Paraguai', [-62.7, -27.6, -54.2, -19.3]],
    ['PE', 'Peru', [-81.4, -18.4, -68.7, -0]],
    ['SR', 'Suriname', [-58.1, 1.8, -53.9, 6]],
    ['UY', 'Uruguai', [-58.5, -35, -53, -30.1]],
    ['VE', 'Venezuela', [-73.4, 0.6, -59.8, 12.2]],
  ] },
  { grupo: 'Países de língua portuguesa', itens: [
    ['PT', 'Portugal (continente)', [-9.6, 36.9, -6.1, 42.2]],
    ['PT-AZ', 'Açores', [-31.3, 36.9, -24.9, 39.8]],
    ['PT-MA', 'Madeira', [-17.3, 32.6, -16.2, 33.2]],
    ['AO', 'Angola', [11.6, -18.1, 24.1, -4.3]],
    ['MZ', 'Moçambique', [30.2, -26.9, 40.9, -10.4]],
    ['CV', 'Cabo Verde', [-25.4, 14.7, -22.6, 17.3]],
    ['GW', 'Guiné-Bissau', [-16.8, 10.8, -13.6, 12.7]],
    ['ST', 'São Tomé e Príncipe', [6.4, -0.1, 7.5, 1.8]],
    ['TL', 'Timor-Leste', [124, -9.6, 127.4, -8.1]],
  ] },
  { grupo: 'América Central e do Norte', itens: [
    ['MX', 'México', [-118.5, 14.5, -86.7, 32.8]],
    ['US', 'Estados Unidos (48 estados)', [-125, 24.4, -66.9, 49.4]],
    ['CA', 'Canadá (sul, onde vive a maioria)', [-141, 41.7, -52.6, 60]],
    ['CR', 'Costa Rica', [-86, 8, -82.5, 11.3]],
    ['PA', 'Panamá', [-83.1, 7.1, -77.1, 9.7]],
    ['CU', 'Cuba', [-85, 19.8, -74.1, 23.3]],
  ] },
  { grupo: 'Europa', itens: [
    ['ES', 'Espanha (continente)', [-9.4, 35.9, 3.4, 43.8]],
    ['FR', 'França (continente)', [-5.2, 41.3, 9.6, 51.1]],
    ['IT', 'Itália', [6.6, 36.6, 18.6, 47.1]],
    ['DE', 'Alemanha', [5.9, 47.2, 15.1, 55.1]],
    ['GB', 'Reino Unido', [-8.7, 49.9, 1.8, 60.9]],
    ['IE', 'Irlanda', [-10.7, 51.4, -5.9, 55.4]],
    ['NL', 'Países Baixos', [3.3, 50.7, 7.3, 53.6]],
    ['BE', 'Bélgica', [2.5, 49.5, 6.4, 51.5]],
    ['CH', 'Suíça', [5.9, 45.8, 10.5, 47.9]],
  ] },
  { grupo: 'Outros', itens: [
    ['JP', 'Japão', [128.4, 30.2, 146, 45.6]],
    ['ZA', 'África do Sul', [16.4, -34.9, 32.9, -22.1]],
    ['AU', 'Austrália', [112.9, -43.7, 153.7, -10.6]],
  ] },
];

export const paisPorCodigo = (cod) => {
  for (const g of PAISES) for (const [c, nome, bbox] of g.itens) if (c === cod) return { nome, bbox };
  return null;
};
