/**
 * CARGA E NORMALIZACAO DOS BANCOS
 *
 * Dividido em dois de proposito:
 *
 *   normalizarBancos()  funcao pura, so transforma linha de CSV em Bancos.
 *                       Nao le arquivo, nao conhece disco. Roda no navegador.
 *
 *   carregarBancos()    le os CSVs e chama a de cima. So roda no Node.
 *
 * Sem essa separacao o motor nao entra no app: o navegador nao tem 'node:fs'.
 */

import { lerCSV, type LinhaCSV } from './csv.ts';
import type {
  Bancos, Config, Marcador, Sistema, Regra, Combinacao, Mensagem, Politica,
  Faixa, Registro,
} from './tipos.ts';

/** Os bancos como saem do CSV, antes de virar Bancos. */
export interface BancosBrutos {
  config: LinhaCSV[];
  sistemas: LinhaCSV[];
  regras: LinhaCSV[];
  sintomas: LinhaCSV[];
  emocoes: LinhaCSV[];
  espiritual: LinhaCSV[];
  combinacoes: LinhaCSV[];
  mensagens: LinhaCSV[];
  escopo: LinhaCSV[];
}

function num(valor: string, campo: string, onde: string): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new Error(onde + ': "' + campo + '" nao e numero: "' + valor + '"');
  return n;
}

function sinonimos(valor: string): string[] {
  return valor ? valor.split(';').map((s) => s.trim()).filter(Boolean) : [];
}

export function normalizarBancos(bruto: BancosBrutos): Bancos {
  // ---- config ----
  const chaves: Record<string, string> = {};
  for (const l of bruto.config) chaves[l.chave] = l.valor;

  const config: Config = {
    escala_max: num(chaves.escala_max ?? '3', 'escala_max', 'config.csv'),
    indice_maximo: num(chaves.indice_maximo ?? '10', 'indice_maximo', 'config.csv'),
    indice_casas: num(chaves.indice_casas ?? '0', 'indice_casas', 'config.csv'),
    nota_casas: num(chaves.nota_casas ?? '1', 'nota_casas', 'config.csv'),
    peso_secundario_fator: num(
      chaves.peso_secundario_fator ?? '1', 'peso_secundario_fator', 'config.csv'
    ),
  };

  // ---- sistemas ----
  const sistemas: Sistema[] = bruto.sistemas.map((l) => ({
    id: l.id,
    nome: l.nome,
    cor: l.cor,
    padrao_emocional: l.padrao_emocional,
    impacto_espiritual: l.impacto_espiritual,
  }));

  // ---- regras ----
  const regras = new Map<string, Regra>();
  for (const l of bruto.regras) {
    regras.set(l.sistema, {
      sistema: l.sistema,
      formula: l.formula,
      faixa_baixa_ate: num(l.faixa_baixa_ate, 'faixa_baixa_ate', 'regras.csv'),
      faixa_media_ate: num(l.faixa_media_ate, 'faixa_media_ate', 'regras.csv'),
      peso_indice: num(l.peso_indice, 'peso_indice', 'regras.csv'),
    });
  }

  // ---- marcadores: os tres bancos num formato so ----
  const marcadores: Marcador[] = [];

  for (const l of bruto.sintomas) {
    marcadores.push({
      id: l.id, origem: 'sintoma', rotulo: l.sintoma, pergunta: l.pergunta,
      sistema: l.sistema, peso: num(l.peso, 'peso', 'sintomas.csv'),
      fonte: l.fonte, status: l.status, sinonimos: sinonimos(l.sinonimos),
      secundario: false,
    });
  }

  for (const l of bruto.emocoes) {
    const peso = num(l.peso, 'peso', 'emocoes.csv');
    marcadores.push({
      id: l.id, origem: 'emocao', rotulo: l.emocao, pergunta: l.pergunta,
      sistema: l.sistema_primario, peso,
      fonte: l.fonte, status: l.status, sinonimos: [],
      padrao_emocional: l.padrao_emocional, secundario: false,
    });
    if (l.sistema_secundario) {
      marcadores.push({
        id: l.id, origem: 'emocao', rotulo: l.emocao, pergunta: l.pergunta,
        sistema: l.sistema_secundario, peso: peso * config.peso_secundario_fator,
        fonte: l.fonte, status: l.status, sinonimos: [],
        padrao_emocional: l.padrao_emocional, secundario: true,
      });
    }
  }

  for (const l of bruto.espiritual) {
    marcadores.push({
      id: l.id, origem: 'espiritual', rotulo: l.item, pergunta: l.pergunta,
      sistema: l.sistema, peso: num(l.peso, 'peso', 'espiritual.csv'),
      fonte: l.fonte, status: l.status, sinonimos: [],
      dimensao: l.dimensao, leitura: l.leitura, secundario: false,
    });
  }

  // ---- combinacoes ----
  const combinacoes: Combinacao[] = bruto.combinacoes.map((l) => ({
    id: l.id, condicao: l.condicao, leitura: l.leitura,
    prioridade: num(l.prioridade, 'prioridade', 'combinacoes.csv'),
    fonte: l.fonte, status: l.status,
  }));

  // ---- mensagens ----
  const mensagens: Mensagem[] = bruto.mensagens.map((l) => ({
    sistema: l.sistema, faixa: l.faixa as Faixa, registro: l.registro as Registro,
    texto: l.texto, primeiros_passos: l.primeiros_passos,
    fonte: l.fonte, status: l.status,
  }));

  // ---- politicas de escopo ----
  const politicas: Politica[] = bruto.escopo.map((l) => ({
    id: l.id, padrao: l.padrao, motivo: l.motivo,
    gravidade: l.gravidade as Politica['gravidade'], resposta: l.resposta,
  }));

  return { config, sistemas, regras, marcadores, combinacoes, mensagens, politicas };
}

/** Perguntas unicas do questionario, na ordem: sintomas, emocoes, espiritual. */
export function montarQuestionario(bancos: Bancos) {
  const vistos = new Set<string>();
  const ordem = { sintoma: 0, emocao: 1, espiritual: 2 } as const;
  return bancos.marcadores
    .filter((m) => { if (vistos.has(m.id)) return false; vistos.add(m.id); return true; })
    .sort((a, b) => ordem[a.origem] - ordem[b.origem] || a.id.localeCompare(b.id))
    .map((m) => ({ id: m.id, origem: m.origem, rotulo: m.rotulo, pergunta: m.pergunta }));
}
