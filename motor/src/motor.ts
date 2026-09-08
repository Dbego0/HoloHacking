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
  Bancos, Pontuacao, Resposta, NotaSistema, Contribuicao,
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
  const m = /^\s*([a-z_]+)\s*(>=|<=|==|>|<)\s*(-?\d+(?:\.\d+)?)\s*$/i.exec(termo ?? '');
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

export function pontuar(bancos: Bancos, respostas: Resposta[]): Pontuacao {
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

    const linhas = bancos.marcadores.filter((m) => m.sistema === sistema.id);
    let obtido = 0;
    let maximo = 0;
    let respondidos = 0;
    const contribuicoes: Contribuicao[] = [];

    for (const m of linhas) {
      maximo += m.peso * config.escala_max;
      const intensidade = porId.get(m.id);
      if (intensidade === undefined) continue;
      respondidos++;
      const pontos = m.peso * intensidade;
      obtido += pontos;
      if (pontos > 0) {
        contribuicoes.push({
          marcador_id: m.id,
          rotulo: m.rotulo,
          origem: m.origem,
          peso: m.peso,
          intensidade,
          pontos: arred(pontos, 2),
          fonte: m.fonte,
        });
      }
    }

    // carga = quanto o paciente marcou. nota = o inverso, que e o numero do metodo.
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
      dominantes: contribuicoes.slice(0, 5),
    });
  }

  // ---- Indice HOLOS ----
  let somaPesos = 0;
  for (const r of bancos.regras.values()) somaPesos += r.peso_indice;

  let notaMedia = 0;
  for (const s of sistemas) {
    const regra = bancos.regras.get(s.sistema);
    if (!regra) continue;
    notaMedia += s.nota * (regra.peso_indice / somaPesos);
  }
  notaMedia = arred(notaMedia, 2);

  const indice = arred(notaMedia * (config.indice_maximo / 10), config.indice_casas);

  // ---- Triada: fisico / mental / espiritual, pela origem do marcador ----
  const triada: Record<EixoTriada, number> = { fisico: 0, mental: 0, espiritual: 0 };
  const eixos: EixoTriada[] = ['fisico', 'mental', 'espiritual'];
  for (const eixo of eixos) {
    const linhas = bancos.marcadores.filter((m) => EIXO_POR_ORIGEM[m.origem] === eixo);
    let obtido = 0;
    let maximo = 0;
    for (const m of linhas) {
      maximo += m.peso * config.escala_max;
      obtido += m.peso * (porId.get(m.id) ?? 0);
    }
    triada[eixo] = maximo > 0 ? arred(10 - (obtido / maximo) * 10, config.nota_casas) : 10;
  }

  // ---- Mapa de Frequencias: carga por chacra ----
  const porChacra = new Map<string, { obtido: number; maximo: number; leitura: string }>();
  for (const m of bancos.marcadores) {
    if (m.dimensao !== 'chacra') continue;
    const atual = porChacra.get(m.rotulo) ?? { obtido: 0, maximo: 0, leitura: m.leitura ?? '' };
    atual.maximo += m.peso * config.escala_max;
    atual.obtido += m.peso * (porId.get(m.id) ?? 0);
    porChacra.set(m.rotulo, atual);
  }
  const frequencias = [...porChacra.entries()]
    .map(([chacra, v]) => ({
      chacra,
      nota: v.maximo > 0 ? arred(10 - (v.obtido / v.maximo) * 10, config.nota_casas) : 10,
      leitura: v.leitura,
    }))
    .sort((a, b) => a.nota - b.nota || a.chacra.localeCompare(b.chacra));

  // ---- Combinacoes ----
  const valores: Record<string, number> = { ...notas, indice };
  const combinacoes: CombinacaoDisparada[] = bancos.combinacoes
    .filter((c) => avaliarCondicao(c.condicao, valores))
    .map((c) => ({
      id: c.id,
      leitura: c.leitura,
      prioridade: c.prioridade,
      condicao: c.condicao,
      fonte: c.fonte,
    }))
    .sort((a, b) => a.prioridade - b.prioridade || a.id.localeCompare(b.id));

  // ---- Cobertura ----
  const idsConhecidos = new Set(bancos.marcadores.map((m) => m.id));
  const totalPerguntas = idsConhecidos.size;
  let respondidas = 0;
  for (const id of porId.keys()) if (idsConhecidos.has(id)) respondidas++;

  auditoria.sort((a, b) => b.pontos - a.pontos || a.marcador_id.localeCompare(b.marcador_id));

  return {
    indice,
    indice_maximo: config.indice_maximo,
    nota_media: notaMedia,
    sistemas,
    triada,
    frequencias,
    combinacoes,
    cobertura: {
      respondidos: respondidas,
      total: totalPerguntas,
      percentual: totalPerguntas > 0 ? arred((respondidas / totalPerguntas) * 100, 0) : 0,
    },
    auditoria,
  };
}
