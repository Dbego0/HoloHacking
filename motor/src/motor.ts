/**
 * L1 — MOTOR DE PONTUACAO HOLOS
 *
 * Deterministico por construcao: nenhuma chamada de rede, nenhum LLM,
 * nenhuma fonte de aleatoriedade. Mesma entrada devolve a mesma saida, sempre.
 *
 * Nenhuma regra clinica esta escrita neste arquivo. Tudo o que decide numero
 * vem dos CSVs em /bancos. Se voce precisar editar este arquivo para mudar
 * uma regra do metodo, a regra esta no lugar errado.
 */

import type {
  Bancos, Pontuacao, Resposta, NotaSistema, Contribuicao, Marcador, Contexto,
  Faixa, EixoTriada, CombinacaoDisparada,
} from './tipos.ts';

function arred(n: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round((n + Number.EPSILON) * f) / f;
}

const EIXO_POR_ORIGEM: Record<string, EixoTriada> = {
  sintoma: 'fisico',
  emocao: 'mental',
  espiritual: 'espiritual',
};

/**
 * A resposta do paciente virada em carga — o numero que entra na conta.
 *
 * Numa pergunta `direto` os dois sao a mesma coisa. Numa `invertido` ("voce
 * sente que sua vida tem uma direcao clara?") o 3 e a melhor resposta possivel,
 * entao ele tem que entrar como 0 de carga. Antes desta funcao nao entrava: o
 * paciente mais alinhado da consulta saia do questionario com o pior terreno
 * espiritual do banco, e nada no sistema acusava.
 */
export function cargaDaResposta(m: Marcador, resposta: number, escalaMax: number): number {
  return m.sentido === 'invertido' ? escalaMax - resposta : resposta;
}

/**
 * Os sistemas que uma condicao de combinacoes.csv le. Serve para nao avaliar
 * regra que dependa de sistema sem nenhuma resposta.
 */
export function nomesDaCondicao(condicao: string): string[] {
  return condicao
    .split(/\s+(?:E|OU)\s+/)
    .map((t) => NOME_E_OPERADOR.exec(t)?.[1] ?? '')
    .filter(Boolean);
}

/**
 * O vocabulario de uma condicao de combinacoes.csv.
 *
 *   metabolico <= 3                    nota do sistema           0..10
 *   indice <= 40                       Indice HOLOS              0..100
 *   triada.espiritual <= 3             eixo da Triada            0..10
 *   chacra.plexo_solar <= 3            nota do chacra            0..10
 *   marcador.SNT-304 >= 2              a carga daquela resposta  0..3
 *   exame.EXA-005 >= 100               o valor lancado           unidade do exame
 *   ferramenta.energia_vital.ao_acordar <= 3   o que a ferramenta mediu
 *
 * Ate 13/09 so existiam os dois primeiros. Com cinco numeros na mao nao da
 * para escrever a leitura que o material promete — "cortisol elevado +
 * compulsao noturna + padrao de rejeicao" vira, na melhor das hipoteses,
 * "metabolico <= 3 E mental <= 3": o reflexo do achado, nao o achado.
 *
 * A regra que nao muda: condicao que le dado inexistente NAO dispara. Um
 * exame em branco nao vale zero, e uma pergunta sem resposta nao vale "nunca".
 */
const NOME_E_OPERADOR =
  /^\s*([a-z_]+(?:\.[A-Za-z0-9_-]+)*)\s*(>=|<=|==|>|<)\s*(-?\d+(?:\.\d+)?)\s*$/;

/** Avalia uma condicao de combinacoes.csv. Sem eval, sem precedencia: esquerda para direita. */
export function avaliarCondicao(condicao: string, valores: Record<string, number>): boolean {
  const partes = condicao.split(/\s+(E|OU)\s+/);
  let resultado = avaliarTermo(partes[0], valores);
  for (let i = 1; i < partes.length; i += 2) {
    const operador = partes[i];
    const proximo = avaliarTermo(partes[i + 1], valores);
    resultado = operador === 'E' ? resultado && proximo : resultado || proximo;
  }
  return resultado;
}

function avaliarTermo(termo: string, valores: Record<string, number>): boolean {
  const m = NOME_E_OPERADOR.exec(termo ?? '');
  if (!m) {
    throw new Error(
      'Condicao invalida: "' + termo + '". Formato esperado: <sistema> >= <numero>'
    );
  }
  const nome = m[1];
  const operador = m[2];
  const alvo = Number(m[3]);
  if (!(nome in valores)) {
    throw new Error(
      'Condicao usa "' + nome + '", que nao e um sistema conhecido nem "indice". ' +
      'Disponiveis: ' + Object.keys(valores).join(', ')
    );
  }
  const v = valores[nome];
  switch (operador) {
    case '>=': return v >= alvo;
    case '<=': return v <= alvo;
    case '>':  return v > alvo;
    case '<':  return v < alvo;
    case '==': return v === alvo;
    default:   throw new Error('Operador desconhecido: ' + operador);
  }
}

/**
 * A faixa e lida sobre a NOTA (0..10, 10 = muito bom), decidido em 27/08.
 * Entao "baixo" e o sistema em maior desequilibrio e "alto" e o em equilibrio.
 */
function faixaDe(nota: number, baixaAte: number, mediaAte: number): Faixa {
  if (nota <= baixaAte) return 'baixo';
  if (nota <= mediaAte) return 'medio';
  return 'alto';
}

export function pontuar(
  bancos: Bancos,
  respostas: Resposta[],
  contexto: Contexto = {},
): Pontuacao {
  const config = bancos.config;

  // Uma resposta por marcador. Resposta duplicada ou fora da escala e erro,
  // nao e para ser tolerada silenciosamente.
  const porId = new Map<string, number>();
  for (const r of respostas) {
    if (porId.has(r.marcador_id)) {
      throw new Error('Resposta duplicada para ' + r.marcador_id);
    }
    if (!Number.isInteger(r.intensidade) || r.intensidade < 0 || r.intensidade > config.escala_max) {
      throw new Error(
        'Intensidade invalida em ' + r.marcador_id + ': ' + r.intensidade +
        ' (esperado inteiro de 0 a ' + config.escala_max + ')'
      );
    }
    porId.set(r.marcador_id, r.intensidade);
  }

  const auditoria: Contribuicao[] = [];
  const sistemas: NotaSistema[] = [];
  const notas: Record<string, number> = {};

  // ---- carga por sistema ----
  for (const sistema of bancos.sistemas) {
    const regra = bancos.regras.get(sistema.id);
    if (!regra) {
      throw new Error('Sem regra em regras.csv para o sistema "' + sistema.id + '"');
    }

    // marcador sem sistema e pergunta de CONTEXTO: entra na cobertura do
    // territorio e nas condicoes, e nao pontua em lugar nenhum. E o que
    // permite perguntar sobre ambiente e rotina sem inventar uma nota para
    // isso — o ambiente explica a conduta, nao mede o corpo.
    const linhas = bancos.marcadores.filter((m) => m.sistema === sistema.id);
    let obtido = 0;
    let maximo = 0;
    let respondidos = 0;
    const contribuicoes: Contribuicao[] = [];

    // O maximo so conta marcador respondido. Somar o banco inteiro fazia a
    // pergunta em branco valer como "nunca": dez respostas no pior grau e 77
    // em branco davam Indice 86, verde na tela. A nota agora e sobre o que a
    // pessoa respondeu, e `cobertura` diz o quanto disso ela respondeu.
    for (const m of linhas) {
      const resposta = porId.get(m.id);
      if (resposta === undefined) continue;
      respondidos++;
      maximo += m.peso * config.escala_max;
      const intensidade = cargaDaResposta(m, resposta, config.escala_max);
      const pontos = m.peso * intensidade;
      obtido += pontos;
      if (pontos > 0) {
        contribuicoes.push({
          marcador_id: m.id,
          rotulo: m.rotulo,
          origem: m.origem,
          peso: m.peso,
          resposta,
          intensidade,
          pontos: arred(pontos, 2),
          fonte: m.fonte,
        });
      }
    }

    // carga = quanto o paciente marcou. nota = o inverso, que e o numero do metodo.
    const avaliavel = respondidos > 0;
    const carga = maximo > 0 ? arred((obtido / maximo) * 10, config.nota_casas) : 0;
    const nota = arred(10 - carga, config.nota_casas);
    notas[sistema.id] = nota;
    auditoria.push(...contribuicoes);

    contribuicoes.sort((a, b) => b.pontos - a.pontos || a.marcador_id.localeCompare(b.marcador_id));

    sistemas.push({
      sistema: sistema.id,
      nome: sistema.nome,
      nota,
      carga,
      faixa: faixaDe(nota, regra.faixa_baixa_ate, regra.faixa_media_ate),
      obtido: arred(obtido, 2),
      maximo: arred(maximo, 2),
      respondidos,
      total_marcadores: linhas.length,
      avaliavel,
      dominantes: contribuicoes.slice(0, 5),
    });
  }

  // ---- Indice HOLOS ----
  // Sistema sem nenhuma resposta fica de fora, e os pesos sao renormalizados
  // entre os que sobraram. Deixa-lo entrar com nota 10 seria o mesmo erro uma
  // camada acima: ausencia de dado nao e sinal de saude.
  const avaliaveis = sistemas.filter((s) => s.avaliavel);
  let somaPesos = 0;
  for (const s of avaliaveis) somaPesos += bancos.regras.get(s.sistema)?.peso_indice ?? 0;

  let notaMedia = 0;
  for (const s of avaliaveis) {
    const regra = bancos.regras.get(s.sistema);
    if (!regra || somaPesos <= 0) continue;
    notaMedia += s.nota * (regra.peso_indice / somaPesos);
  }
  notaMedia = arred(notaMedia, 2);

  const indice = arred(notaMedia * (config.indice_maximo / 10), config.indice_casas);

  // ---- Triada: fisico / mental / espiritual, pela origem do marcador ----
  const triada: Record<EixoTriada, number> = { fisico: 0, mental: 0, espiritual: 0 };
  const triadaComDado: Partial<Record<EixoTriada, boolean>> = {};
  const eixos: EixoTriada[] = ['fisico', 'mental', 'espiritual'];
  for (const eixo of eixos) {
    // Por id, nao por linha: a emocao que pesa num sistema primario e num
    // secundario tem duas linhas e contava duas vezes no eixo mental — nove
    // das vinte emocoes valiam o dobro das outras, e isso nao era regra de
    // lugar nenhum. O peso do eixo e o da linha primaria.
    const vistos = new Set<string>();
    let obtido = 0;
    let maximo = 0;
    for (const m of bancos.marcadores) {
      if (EIXO_POR_ORIGEM[m.origem] !== eixo || m.secundario || vistos.has(m.id)) continue;
      vistos.add(m.id);
      const resposta = porId.get(m.id);
      if (resposta === undefined) continue;
      maximo += m.peso * config.escala_max;
      obtido += m.peso * cargaDaResposta(m, resposta, config.escala_max);
    }
    triada[eixo] = maximo > 0 ? arred(10 - (obtido / maximo) * 10, config.nota_casas) : 10;
    triadaComDado[eixo] = maximo > 0;
  }

  /* ---- Mapa de Frequencias ----

     Nao tem pergunta propria: e um SEGUNDO RECORTE das mesmas respostas. Cada
     marcador declara, na coluna `chacra`, a qual deles responde — e a maioria
     nao responde a nenhum. E dai que sai a leitura que o material chama de
     "conexao invisivel": ela nao e inventada, ela cai fora da mesma tabela.

     Por id, nao por linha, pela mesma razao da Triada: o marcador que pesa em
     dois sistemas tem duas linhas e contaria em dobro. E so marcador
     respondido entra, nos dois lados da conta. */
  const porChacra = new Map<string, { obtido: number; maximo: number; respondidos: number }>();
  const vistosNoChacra = new Set<string>();
  for (const m of bancos.marcadores) {
    if (!config.mapa_frequencias_ativo) break;   // parado: nem calcula
    if (!m.chacra || m.secundario || vistosNoChacra.has(m.id)) continue;
    vistosNoChacra.add(m.id);
    const resposta = porId.get(m.id);
    if (resposta === undefined) continue;
    const atual = porChacra.get(m.chacra) ?? { obtido: 0, maximo: 0, respondidos: 0 };
    atual.maximo += m.peso * config.escala_max;
    atual.obtido += m.peso * cargaDaResposta(m, resposta, config.escala_max);
    atual.respondidos++;
    porChacra.set(m.chacra, atual);
  }
  const frequencias = [...porChacra.entries()]
    .map(([id, v]) => {
      const def = bancos.chacras.find((c) => c.id === id);
      return {
        chacra: def?.nome ?? id,
        nota: v.maximo > 0 ? arred(10 - (v.obtido / v.maximo) * 10, config.nota_casas) : 10,
        leitura: def?.leitura ?? '',
        ordem: def?.ordem ?? 0,
        respondidos: v.respondidos,
      };
    })
    // do mais travado para o mais livre: e onde a conduta comeca
    .sort((a, b) => a.nota - b.nota || a.chacra.localeCompare(b.chacra));

  // ---- Combinacoes ----
  /* O que a condicao pode ler. So entra aqui o que TEM dado — e por isso que
     uma regra sobre exame em branco, ou sobre sistema sem resposta nenhuma,
     simplesmente nao dispara em vez de disparar errado. */
  const valores: Record<string, number> = {};
  for (const s of avaliaveis) valores[s.sistema] = s.nota;
  if (avaliaveis.length > 0) valores.indice = indice;

  for (const eixo of eixos) {
    if (triadaComDado[eixo]) valores['triada.' + eixo] = triada[eixo];
  }
  for (const f of frequencias) {
    const def = bancos.chacras.find((c) => c.nome === f.chacra);
    if (def) valores['chacra.' + def.id] = f.nota;
  }
  // a carga da resposta, nao a resposta crua: numa pergunta invertida o 3 e
  // zero de carga, e a condicao tem que ler a mesma coisa que a nota leu
  const pesoPorId = new Map<string, Marcador>();
  for (const m of bancos.marcadores) if (!pesoPorId.has(m.id)) pesoPorId.set(m.id, m);
  for (const [id, resposta] of porId) {
    const m = pesoPorId.get(id);
    if (m) valores['marcador.' + id] = cargaDaResposta(m, resposta, config.escala_max);
  }
  for (const [id, valor] of Object.entries(contexto.exames ?? {})) {
    if (Number.isFinite(valor)) valores['exame.' + id] = valor;
  }
  for (const [ferr, campos] of Object.entries(contexto.ferramentas ?? {})) {
    for (const [campo, valor] of Object.entries(campos ?? {})) {
      if (Number.isFinite(valor)) valores['ferramenta.' + ferr + '.' + campo] = valor;
    }
  }

  const combinacoes: CombinacaoDisparada[] = bancos.combinacoes
    .filter((c) => nomesDaCondicao(c.condicao).every((n) => n in valores))
    .filter((c) => avaliarCondicao(c.condicao, valores))
    .map((c) => ({
      id: c.id,
      leitura: c.leitura,
      tipo: c.tipo,
      investigar: c.investigar,
      prioridade: c.prioridade,
      condicao: c.condicao,
      fonte: c.fonte,
    }))
    .sort((a, b) => a.prioridade - b.prioridade || a.id.localeCompare(b.id));

  /* ---- Territorios: a cobertura do olhar ----

     Nao e mais uma nota — e o que ficou de fora. "Ampliar e organizar o
     olhar" pede saber onde nao se olhou, e um territorio declarado sem
     nenhuma pergunta apontando para ele e exatamente um buraco. Por id, como
     todo o resto. */
  const porTerritorio = new Map<string, { obtido: number; maximo: number;
                                          respondidos: number; total: number }>();
  const vistosNoTerritorio = new Set<string>();
  for (const m of bancos.marcadores) {
    if (!config.territorios_ativo) break;        // parado: nem calcula
    if (!m.territorio || m.secundario || vistosNoTerritorio.has(m.id)) continue;
    vistosNoTerritorio.add(m.id);
    const atual = porTerritorio.get(m.territorio) ??
      { obtido: 0, maximo: 0, respondidos: 0, total: 0 };
    atual.total++;
    const resposta = porId.get(m.id);
    if (resposta !== undefined) {
      atual.respondidos++;
      // so quem pontua em algum sistema entra na nota do territorio
      if (m.sistema) {
        atual.maximo += m.peso * config.escala_max;
        atual.obtido += m.peso * cargaDaResposta(m, resposta, config.escala_max);
      }
    }
    porTerritorio.set(m.territorio, atual);
  }
  // territorio declarado e sem nenhum marcador tambem aparece: e o buraco
  for (const t of bancos.territorios) {
    if (!config.territorios_ativo) break;
    if (!porTerritorio.has(t.id)) {
      porTerritorio.set(t.id, { obtido: 0, maximo: 0, respondidos: 0, total: 0 });
    }
  }
  const territorios = [...porTerritorio.entries()]
    .map(([id, v]) => {
      const def = bancos.territorios.find((t) => t.id === id);
      return {
        territorio: def?.nome ?? id,
        leitura: def?.leitura ?? '',
        ordem: def?.ordem ?? 0,
        respondidos: v.respondidos,
        total: v.total,
        nota: v.maximo > 0
          ? arred(10 - (v.obtido / v.maximo) * 10, config.nota_casas)
          : null,
      };
    })
    .sort((a, b) => a.ordem - b.ordem || a.territorio.localeCompare(b.territorio));

  /* ---- Aprofundar: a pergunta que vem depois ----

     O passo 4 do metodo. O motor ja sabe o que pesou; aqui ele devolve o que
     perguntar sobre aquilo. So marcador com carga a partir do corte, e so
     quem tem a coluna `aprofundar` preenchida — por id, para o marcador que
     pesa em dois sistemas nao render a mesma pergunta duas vezes. */
  const aprofundamentos: Pontuacao['aprofundamentos'] = [];
  const jaOferecidos = new Set<string>();
  for (const m of bancos.marcadores) {
    if (!m.aprofundar || m.secundario || jaOferecidos.has(m.id)) continue;
    const resposta = porId.get(m.id);
    if (resposta === undefined) continue;
    const carga = cargaDaResposta(m, resposta, config.escala_max);
    if (carga < config.aprofundar_a_partir_de) continue;
    jaOferecidos.add(m.id);
    aprofundamentos.push({
      marcador_id: m.id, rotulo: m.rotulo, origem: m.origem,
      resposta, pergunta: m.aprofundar,
    });
  }
  // o que pesou mais primeiro: e por onde a conversa comeca
  aprofundamentos.sort((a, b) => b.resposta - a.resposta ||
    a.marcador_id.localeCompare(b.marcador_id));

  // ---- Cobertura ----
  const idsConhecidos = new Set(bancos.marcadores.map((m) => m.id));
  const totalPerguntas = idsConhecidos.size;
  let respondidas = 0;
  for (const id of porId.keys()) if (idsConhecidos.has(id)) respondidas++;

  auditoria.sort((a, b) => b.pontos - a.pontos || a.marcador_id.localeCompare(b.marcador_id));

  return {
    indice,
    avaliavel: avaliaveis.length > 0,
    indice_maximo: config.indice_maximo,
    nota_media: notaMedia,
    sistemas,
    triada,
    /* Quais eixos da Triada tem pelo menos uma resposta.

       A formula devolve 10 para eixo sem nenhum marcador respondido — nota
       maxima por ausencia de dado, exatamente o erro que o Indice ja corrige
       um nivel acima com avaliavel. Aqui a conta continua a mesma; o que
       muda e que quem desenha passa a saber a diferenca, e pode mostrar
       "sem dado" em vez de "10". */
    triada_com_dado: {
      fisico: !!triadaComDado.fisico,
      mental: !!triadaComDado.mental,
      espiritual: !!triadaComDado.espiritual,
    },
    frequencias,
    combinacoes,
    cobertura: {
      respondidos: respondidas,
      total: totalPerguntas,
      percentual: totalPerguntas > 0 ? arred((respondidas / totalPerguntas) * 100, 0) : 0,
    },
    territorios,
    aprofundamentos,
    auditoria,
  };
}
