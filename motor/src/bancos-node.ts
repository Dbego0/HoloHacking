/**
 * Leitura dos bancos a partir do disco. So roda no Node.
 *
 * O navegador usa src/navegador.ts, que passa os mesmos dados vindos de um JSON
 * embutido. A logica de normalizacao e a mesma nos dois — vive em bancos.ts.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerCSV } from './csv.ts';
import { normalizarBancos, type BancosBrutos } from './bancos.ts';
import type { Bancos } from './tipos.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function carregar(caminhoRelativo: string) {
  return lerCSV(readFileSync(join(RAIZ, caminhoRelativo), 'utf8'), caminhoRelativo);
}

export function carregarBancos(): Bancos {
  const bruto: BancosBrutos = {
    config:      carregar('bancos/config.csv'),
    sistemas:    carregar('bancos/sistemas.csv'),
    regras:      carregar('bancos/regras.csv'),
    sintomas:    carregar('bancos/sintomas.csv'),
    emocoes:     carregar('bancos/emocoes.csv'),
    espiritual:  carregar('bancos/espiritual.csv'),
    combinacoes: carregar('bancos/combinacoes.csv'),
    mensagens:   carregar('bancos/mensagens.csv'),
    escopo:      carregar('politicas/escopo.csv'),
  };
  return normalizarBancos(bruto);
}

export { montarQuestionario } from './bancos.ts';
