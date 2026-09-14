/**
 * PORTA DE ENTRADA DO MOTOR NO NAVEGADOR
 *
 * O motor nao tem dependencia nenhuma e nao fala com a rede, entao roda inteiro
 * dentro do app — sem backend, sem instalar nada. O que muda em relacao ao Node
 * e so de onde vem os bancos:
 *
 *   Node      -> bancos-node.ts le os CSV do disco
 *   Navegador -> este arquivo traz build/bancos.json embutido no pacote
 *
 * A normalizacao e o calculo sao os mesmos nos dois. Nenhuma regra vive aqui.
 *
 * Gera holoscope.js com:
 *   npx esbuild src/navegador.ts --bundle --format=iife --global-name=HOLOSCOPE \
 *     --loader:.json=json --minify --outfile=../../../holos-app/holoscope.js
 */

import brutos from '../build/bancos.json';
import { normalizarBancos, montarQuestionario, type BancosBrutos } from './bancos.ts';
import { pontuar, avaliarCondicao, nomesDaCondicao } from './motor.ts';
import { verificarEscopo } from './escopo.ts';
import { normalizarExames, avaliarExames, confrontar, type Exame } from './exames.ts';
import type { Bancos, Resposta, Pontuacao, Contexto } from './tipos.ts';

const bancos: Bancos = normalizarBancos(brutos as unknown as BancosBrutos);

/** As perguntas do questionario, na ordem: sintomas, emocoes, espiritual. */
export function questionario() {
  return montarQuestionario(bancos);
}

/**
 * Respostas (0 a 3 por marcador) -> Indice, notas, Triada, combinacoes.
 *
 * O `contexto` e opcional e nao entra em nota nenhuma: exame e ferramenta
 * existem ali para as COMBINACOES poderem le-los. E o que permite escrever a
 * leitura sistemica do material — "exame alterado E compulsao noturna E
 * padrao de rejeicao" — em vez de so o reflexo dela nas cinco notas.
 */
export function calcular(respostas: Resposta[], contexto: Contexto = {}): Pontuacao {
  return pontuar(bancos, respostas, contexto);
}

/** Verifica se um texto pede algo fora do escopo da nutricao. */
export function escopo(texto: string) {
  return verificarEscopo(bancos, texto);
}

/** Os 5 sistemas, com padrao emocional e impacto espiritual. */
export function sistemas() {
  return bancos.sistemas;
}

/**
 * Os eixos terapeuticos de cada sistema — a direcao de conduta do material:
 * Neuroregulacao, Reprogramacao Metabolica, Inteligencia Espiritual.
 * Estavam escritos a mao no app.js; agora saem de eixos.csv, onde o Rodrigo
 * alcanca.
 */
export function eixos(sistema?: string) {
  return sistema ? bancos.eixos.filter((e) => e.sistema === sistema) : bancos.eixos;
}

/**
 * Combinacoes disparadas a partir das cinco notas, sem precisar do
 * questionario. E o que permite a tela do HOLOSCOPE — onde a nutricionista
 * ainda pontua a mao — usar as leituras do banco em vez de texto no codigo.
 * As condicoes vem de combinacoes.csv e sao avaliadas contra as notas.
 */
export function combinacoesDeNotas(notas: Record<string, number>) {
  // Ha condicao que fala de "indice" (CMB-004), entao ele precisa estar no
  // mapa. Calculado aqui pela mesma formula do motor, para nao existir uma
  // segunda versao da conta em lugar nenhum.
  const valores: Record<string, number> = { ...notas, indice: indiceDeNotas(notas) };
  return bancos.combinacoes
    // Pontuando a mao so existem as cinco notas: regra que fale de marcador,
    // exame ou ferramenta nao tem como ser avaliada, e nao disparar e o certo.
    .filter((c) => nomesDaCondicao(c.condicao).every((n) => n in valores))
    .filter((c) => avaliarCondicao(c.condicao, valores))
    .sort((a, b) => a.prioridade - b.prioridade)
    .map((c) => ({ id: c.id, leitura: c.leitura, tipo: c.tipo,
                   investigar: c.investigar, condicao: c.condicao, fonte: c.fonte }));
}

/**
 * Indice HOLOS a partir das cinco notas — a mesma conta que pontuar() faz:
 *   nota_media = Sum(nota x peso_indice)
 *   indice     = nota_media x (indice_maximo / 10)
 * A tela tinha isso escrito a mao como "soma x 2". Funcionava porque os pesos
 * sao 0,20 e o maximo e 100, mas era uma segunda copia da regra esperando para
 * divergir — foi assim que a escala invertida passou despercebida.
 */
export function indiceDeNotas(notas: Record<string, number>): number {
  let media = 0;
  for (const [sistema, regra] of bancos.regras) {
    media += (notas[sistema] ?? 0) * regra.peso_indice;
  }
  const bruto = media * (bancos.config.indice_maximo / 10);
  const casas = bancos.config.indice_casas;
  return Math.round(bruto * 10 ** casas) / 10 ** casas;
}

/**
 * A mensagem do banco para um sistema numa faixa, no registro pedido.
 *
 * As faixas sao 'baixo' | 'medio' | 'alto' e os registros 'nutri' | 'paciente',
 * como estao em mensagens.csv. Eu tinha escrito 'baixa/media/alta' aqui: nunca
 * casava, e a funcao devolvia null calada — o relatorio saia com os cinco
 * sistemas e nenhum texto.
 */
export function mensagem(sistema: string, nota: number, registro: 'nutri' | 'paciente') {
  const regra = bancos.regras.get(sistema);
  const faixa = !regra ? 'medio'
    : nota <= regra.faixa_baixa_ate ? 'baixo'
    : nota <= regra.faixa_media_ate ? 'medio' : 'alto';
  const m = bancos.mensagens.find(
    (x) => x.sistema === sistema && x.faixa === faixa && x.registro === registro
  );
  return m ? { texto: m.texto, primeiros_passos: m.primeiros_passos, faixa, fonte: m.fonte } : null;
}

/* ---------------------------------------------------------------- exames --

   Exame NUNCA entra no Indice. Ele confronta o que o paciente relatou com o
   que o sangue mostra — e a divergencia entre os dois e o achado que uma
   anamnese sozinha nao pega. Ver src/exames.ts.
*/

const exames: Exame[] = normalizarExames(
  ((brutos as unknown as Record<string, unknown[]>).exames ?? []) as never
);

/** Os exames do banco, para montar o formulario. */
export function listaDeExames() {
  return exames.map((e) => ({
    id: e.id, exame: e.exame, sistema: e.sistema, unidade: e.unidade,
    faixa: e.ideal_min + ' a ' + e.ideal_max,
  }));
}

/** Valores digitados -> onde cada um cai, e o confronto com o questionario. */
export function lerExames(valores: Record<string, number>, notas: Record<string, number> = {}) {
  const avaliados = avaliarExames(exames, valores);
  const limite = bancos.regras.values().next().value?.faixa_baixa_ate ?? 3;
  return {
    exames: avaliados,
    alterados: avaliados.filter((a) => a.situacao !== 'ok').length,
    confronto: confrontar(exames, avaliados, notas, limite),
  };
}

/** Quantos marcadores existem, por origem. Util para conferir o pacote. */
export function resumo() {
  const porOrigem: Record<string, number> = {};
  const vistos = new Set<string>();
  for (const m of bancos.marcadores) {
    if (vistos.has(m.id)) continue;
    vistos.add(m.id);
    porOrigem[m.origem] = (porOrigem[m.origem] ?? 0) + 1;
  }
  return {
    marcadores: vistos.size,
    por_origem: porOrigem,
    sistemas: bancos.sistemas.length,
    combinacoes: bancos.combinacoes.length,
    mensagens: bancos.mensagens.length,
  };
}
