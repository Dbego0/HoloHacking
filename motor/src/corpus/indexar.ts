/**
 * INGESTAO DO CORPUS
 *
 * Le as fontes listadas em corpus/fontes.csv, quebra em trechos e grava
 * corpus/indice.json. Roda offline: nenhuma chamada de rede, nenhum embedding.
 *
 * A regra que atravessa tudo: **todo trecho carrega procedencia**. Arquivo,
 * titulo da fonte, caminho das secoes e linha de inicio. Sem isso o agente
 * afirma coisas sem poder dizer de onde tirou, e ninguem percebe.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerCSV } from '../csv.ts';
import { tokenizar } from './texto.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CAMINHO_INDICE = join(RAIZ, 'corpus', 'indice.json');

export type Autoridade = 'metodo' | 'contexto' | 'referencia';

/** Quanto cada nivel de autoridade pesa quando duas fontes discordam. */
export const PESO_AUTORIDADE: Record<Autoridade, number> = {
  metodo: 1.0,
  contexto: 0.7,
  referencia: 0.4,
};

export interface Trecho {
  id: string;
  texto: string;
  /** Caminho de titulos ate aqui: "Bloco 2 > Estrutura tecnica". */
  secao: string;
  arquivo: string;
  fonte: string;
  autoridade: Autoridade;
  linha: number;
  /** Tokens ja normalizados, para nao retokenizar a cada busca. */
  tokens: string[];
}

export interface Indice {
  gerado_em: string;
  trechos: Trecho[];
  /** Em quantos trechos cada token aparece — o df do BM25. */
  frequencia_documental: Record<string, number>;
  media_tamanho: number;
}

const ALVO_CARACTERES = 900;
const MINIMO_CARACTERES = 120;

/**
 * Quebra markdown respeitando a estrutura: primeiro por titulo, depois por
 * paragrafo, agrupando ate chegar perto do alvo. Nunca corta no meio de uma
 * frase — um trecho cortado ao meio vira uma citacao que nao se sustenta.
 */
export function quebrar(
  conteudo: string,
  arquivo: string,
  fonte: string,
  autoridade: Autoridade
): Trecho[] {
  const linhas = conteudo.split(/\r?\n/);
  const trechos: Trecho[] = [];
  const titulos: string[] = [];

  let acumulado: string[] = [];
  let linhaInicio = 1;
  let n = 0;

  const fechar = () => {
    const texto = acumulado.join('\n').trim();
    acumulado = [];
    if (texto.length < MINIMO_CARACTERES) return;
    trechos.push({
      id: arquivo + '#' + ++n,
      texto,
      secao: titulos.filter(Boolean).join(' > '),
      arquivo,
      fonte,
      autoridade,
      linha: linhaInicio,
      tokens: tokenizar(titulos.join(' ') + ' ' + texto),
    });
  };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const titulo = /^(#{1,6})\s+(.*)$/.exec(linha);

    if (titulo) {
      fechar();
      const nivel = titulo[1].length;
      titulos.length = Math.max(0, nivel - 1);
      titulos[nivel - 1] = titulo[2].replace(/[*_`]/g, '').trim();
      linhaInicio = i + 2;
      continue;
    }

    if (acumulado.length === 0) {
      if (linha.trim() === '') continue;
      linhaInicio = i + 1;
    }
    acumulado.push(linha);

    // Fecha num limite de paragrafo, nunca no meio de uma frase.
    const tamanho = acumulado.join('\n').length;
    if (tamanho >= ALVO_CARACTERES && linha.trim() === '') fechar();
  }
  fechar();

  return trechos;
}

export interface ResultadoIngestao {
  indice: Indice;
  fontes: { arquivo: string; fonte: string; trechos: number; ausente: boolean }[];
}

export function indexar(): ResultadoIngestao {
  const manifesto = lerCSV(
    readFileSync(join(RAIZ, 'corpus', 'fontes.csv'), 'utf8'),
    'corpus/fontes.csv'
  );

  const trechos: Trecho[] = [];
  const fontes: ResultadoIngestao['fontes'] = [];

  for (const linha of manifesto) {
    const caminho = join(RAIZ, linha.arquivo);
    if (!existsSync(caminho)) {
      fontes.push({ arquivo: linha.arquivo, fonte: linha.titulo, trechos: 0, ausente: true });
      continue;
    }
    const autoridade = (linha.autoridade || 'referencia') as Autoridade;
    if (!(autoridade in PESO_AUTORIDADE)) {
      throw new Error(
        'corpus/fontes.csv: autoridade "' + linha.autoridade + '" desconhecida em ' +
        linha.arquivo + '. Use metodo, contexto ou referencia.'
      );
    }
    const doArquivo = quebrar(
      readFileSync(caminho, 'utf8'),
      linha.arquivo,
      linha.titulo,
      autoridade
    );
    trechos.push(...doArquivo);
    fontes.push({
      arquivo: linha.arquivo, fonte: linha.titulo, trechos: doArquivo.length, ausente: false,
    });
  }

  const frequencia: Record<string, number> = {};
  let soma = 0;
  for (const t of trechos) {
    soma += t.tokens.length;
    for (const token of new Set(t.tokens)) {
      frequencia[token] = (frequencia[token] ?? 0) + 1;
    }
  }

  const indice: Indice = {
    // Sem Date.now() aqui seria melhor para reprodutibilidade, mas saber quando
    // o indice foi gerado importa mais: o corpus muda, e o agente responde pelo
    // que estava indexado no dia.
    gerado_em: new Date().toISOString(),
    trechos,
    frequencia_documental: frequencia,
    media_tamanho: trechos.length > 0 ? soma / trechos.length : 0,
  };

  writeFileSync(CAMINHO_INDICE, JSON.stringify(indice), 'utf8');
  return { indice, fontes };
}

let memo: Indice | null = null;

/** Devolve null se o corpus ainda nao foi indexado — quem chama decide o que fazer. */
export function carregarIndice(): Indice | null {
  if (memo) return memo;
  if (!existsSync(CAMINHO_INDICE)) return null;
  memo = JSON.parse(readFileSync(CAMINHO_INDICE, 'utf8')) as Indice;
  return memo;
}
