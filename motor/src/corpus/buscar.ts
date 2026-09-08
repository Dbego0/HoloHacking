/**
 * BUSCA NO METODO — BM25 sobre o corpus indexado.
 *
 * Sem embeddings e sem rede, de proposito. Numa base de vocabulario controlado
 * como a do método — cinco sistemas, um conjunto fechado de sintomas e emoções —
 * a busca lexical acerta quase sempre, roda em milissegundos e é auditável:
 * dá para explicar por que um trecho apareceu. Busca semântica por embeddings
 * é uma melhoria depois, não um pré-requisito.
 *
 * A pontuação final multiplica o BM25 pelo peso de autoridade da fonte, então
 * o livro do Rodrigo ganha de uma transcrição de live quando os dois falam
 * da mesma coisa.
 */

import { tokenizar } from './texto.ts';
import { carregarIndice, PESO_AUTORIDADE, type Trecho, type Autoridade } from './indexar.ts';

const K1 = 1.5;
const B = 0.75;

/**
 * Piso de relevancia. Abaixo disso a busca prefere devolver "nada encontrado"
 * a devolver um trecho fraco.
 *
 * O motivo: um trecho que casou uma palavra so ("nutricionista") vira, na mao do
 * agente, uma citacao com fonte — e ele responde com ar de autoridade sobre algo
 * que o metodo nao diz. Ruido com procedencia e pior que silencio.
 *
 * Reajustar quando o corpus real entrar: com mais trechos, o idf muda de escala.
 */
const PONTUACAO_MINIMA = 1.5;

/** Alem do piso, descarta o que ficou muito atras do primeiro colocado. */
const FRACAO_DO_TOPO = 0.2;

/**
 * Fracao minima dos termos distintos da pergunta que o trecho precisa casar.
 *
 * O piso de pontuacao sozinho nao resolve, e o corpus real provou isso: quando
 * o livro entrou, "qual a dose de melatonina para insonia" passou a casar so
 * "insonia" de tres termos e pontuar 4.7 - acima do piso. E "o que e a Triade
 * do Ser" casa um termo so e pontua 4.3, sendo uma pergunta perfeitamente boa.
 * Pontuacao nao separa as duas; cobertura separa: 33% contra 100%.
 *
 * Casar menos da metade do que foi perguntado quer dizer que o trecho responde
 * outra pergunta.
 */
const COBERTURA_MINIMA = 0.5;

export interface Achado {
  texto: string;
  fonte: string;
  secao: string;
  linha: number;
  autoridade: Autoridade;
  pontuacao: number;
  /** Quais palavras da pergunta casaram — deixa a busca auditável. */
  casou: string[];
}

export interface ResultadoBusca {
  trechos: Achado[];
  indexado: boolean;
  aviso?: string;
}

export interface OpcoesBusca {
  limite?: number;
  /** Filtra por sistema: só trechos que mencionem esse termo. */
  filtro?: string;
}

const AVISO_SEM_INDICE =
  'CORPUS NAO INDEXADO. O livro e as transcricoes ainda nao foram entregues ou o ' +
  'indice nao foi gerado (node src/cli.ts indexar). Responda que isso ainda nao ' +
  'esta no metodo indexado — nao complete com conhecimento geral.';

const AVISO_SEM_RESULTADO =
  'NADA ENCONTRADO no metodo indexado para essa pergunta. Diga que nao esta no ' +
  'metodo e sugira perguntar ao Rodrigo. Nao complete com nutricao generica.';

export function buscarNoMetodo(pergunta: string, opcoes: OpcoesBusca = {}): ResultadoBusca {
  const indice = carregarIndice();
  if (!indice || indice.trechos.length === 0) {
    return { trechos: [], indexado: false, aviso: AVISO_SEM_INDICE };
  }

  const termos = tokenizar(pergunta);
  if (termos.length === 0) {
    return { trechos: [], indexado: true, aviso: AVISO_SEM_RESULTADO };
  }

  const N = indice.trechos.length;
  const distintos = new Set(termos);

  /**
   * Quantos termos o trecho precisa casar.
   *
   * Meia cobertura resolve pergunta longa, mas nao resolve pergunta curta:
   * "como tratar hipotireoidismo" tem dois termos, e casar so "tratar" — palavra
   * comum no livro — ja daria 50%. O resultado era uma pergunta medica recebendo
   * citacao do livro, que e exatamente o que nao pode acontecer.
   *
   * Com dois termos ou menos, exige os dois. Nao ha meia resposta possivel.
   */
  const exigidos =
    distintos.size <= 2 ? distintos.size : Math.ceil(distintos.size * COBERTURA_MINIMA);
  const limite = opcoes.limite ?? 5;
  const filtro = opcoes.filtro ? tokenizar(opcoes.filtro) : [];

  const pontuados: Achado[] = [];

  for (const trecho of indice.trechos) {
    if (filtro.length > 0 && !filtro.some((f) => trecho.tokens.includes(f))) continue;

    let pontos = 0;
    const casou: string[] = [];

    for (const termo of distintos) {
      const tf = contar(trecho.tokens, termo);
      if (tf === 0) continue;
      casou.push(termo);

      const df = indice.frequencia_documental[termo] ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const norma = 1 - B + B * (trecho.tokens.length / (indice.media_tamanho || 1));
      pontos += idf * ((tf * (K1 + 1)) / (tf + K1 * norma));
    }

    if (pontos === 0) continue;
    if (casou.length < exigidos) continue;
    pontos *= PESO_AUTORIDADE[trecho.autoridade] ?? 0.4;

    pontuados.push({
      texto: trecho.texto,
      fonte: citar(trecho),
      secao: trecho.secao,
      linha: trecho.linha,
      autoridade: trecho.autoridade,
      pontuacao: Math.round(pontos * 1000) / 1000,
      casou,
    });
  }

  pontuados.sort((a, b) => b.pontuacao - a.pontuacao || a.fonte.localeCompare(b.fonte));

  const topo = pontuados[0]?.pontuacao ?? 0;
  const melhores = pontuados
    .filter((a) => a.pontuacao >= PONTUACAO_MINIMA && a.pontuacao >= topo * FRACAO_DO_TOPO)
    .slice(0, limite);

  return melhores.length > 0
    ? { trechos: melhores, indexado: true }
    : { trechos: [], indexado: true, aviso: AVISO_SEM_RESULTADO };
}

function contar(tokens: string[], termo: string): number {
  let n = 0;
  for (const t of tokens) if (t === termo) n++;
  return n;
}

/**
 * A citacao que o agente vai repetir na resposta.
 *
 * Descarta os niveis do caminho de secoes que so repetem o titulo da fonte:
 * o livro tem um H1 com o proprio nome, e sem isso a citacao sai
 * "Livro X - Livro X > Capitulo 3 > p. 77", que e ruido puro.
 */
function citar(t: Trecho): string {
  const daFonte = new Set(tokenizar(t.fonte));
  const secao = t.secao
    .split(' > ')
    .filter((nivel) => {
      const tokens = tokenizar(nivel);
      if (tokens.length === 0) return true; // "p. 77" nao tem token: mantem
      const repetidos = tokens.filter((x) => daFonte.has(x)).length;
      return repetidos / tokens.length < 0.6;
    })
    .join(' > ');

  const partes = [t.fonte];
  if (secao) partes.push(secao);
  partes.push('linha ' + t.linha);
  return partes.join(' · ');
}
