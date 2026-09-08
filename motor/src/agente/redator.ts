/**
 * L2 — REDATOR DO RELATORIO
 *
 * Recebe a pontuacao JA CALCULADA e escreve sobre ela. Nao recebe as respostas
 * cruas do paciente, de proposito: sem elas nao tem como repontuar.
 *
 * Duas travas depois da geracao:
 *   1. fidelidade numerica — todo numero do texto tem que existir na pontuacao
 *   2. guardrail de escopo — no texto que vai para o paciente
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Bancos, Pontuacao } from '../tipos.ts';
import { saidaSegura, type Achado } from '../escopo.ts';
import { REDATOR, FERRAMENTA_EMITIR_RELATORIO } from './prompts.ts';
import { MODELO } from './cliente.ts';

export interface Relatorio {
  titulo: string;
  o_que_esta_acontecendo: string;
  espelho_do_paciente: string;
  sistemas_prioritarios: { sistema: string; porque: string }[];
  primeiros_passos: string[];
  conversar_na_consulta?: string[];
}

export interface DivergenciaNumerica {
  numero: string;
  onde: string;
  trecho: string;
}

export interface ResultadoRedator {
  relatorio: Relatorio;
  /** Numeros no texto que nao existem na pontuacao. Vazio = passou. */
  divergencias: DivergenciaNumerica[];
  /** Achados do guardrail no texto destinado ao paciente. */
  achados: Achado[];
  bloqueado: boolean;
  uso: { entrada: number; saida: number };
}

// ---------------------------------------------------------------------------
// Fidelidade numerica
// ---------------------------------------------------------------------------

/**
 * Numeros permitidos: os que saem da pontuacao, mais os inteiros de 0 a 10,
 * que aparecem legitimamente em contagem ("os 5 sistemas", "3 primeiros passos").
 *
 * A checagem e assimetrica de proposito:
 *   - todo DECIMAL precisa existir na pontuacao (e onde a invencao aparece)
 *   - inteiros so sao cobrados acima de 10 (abaixo disso sao quase sempre contagem)
 */
function numerosPermitidos(p: Pontuacao): Set<string> {
  const set = new Set<string>();
  const add = (n: number) => {
    set.add(String(n));
    set.add(n.toFixed(1));
    set.add(String(Math.round(n)));
  };

  add(p.indice);
  add(p.indice_maximo);
  add(p.nota_media);
  for (const s of p.sistemas) {
    add(s.nota);
    add(s.carga);
  }
  for (const v of Object.values(p.triada)) add(v);
  for (const f of p.frequencias) add(f.nota);
  for (let i = 0; i <= 10; i++) add(i);

  return set;
}

export function conferirFidelidade(p: Pontuacao, relatorio: Relatorio): DivergenciaNumerica[] {
  const permitidos = numerosPermitidos(p);
  const divergencias: DivergenciaNumerica[] = [];

  const campos: [string, string][] = [
    ['titulo', relatorio.titulo],
    ['o_que_esta_acontecendo', relatorio.o_que_esta_acontecendo],
    ['espelho_do_paciente', relatorio.espelho_do_paciente],
    ...relatorio.sistemas_prioritarios.map(
      (s, i) => ['sistemas_prioritarios[' + i + ']', s.porque] as [string, string]
    ),
    ...relatorio.primeiros_passos.map(
      (t, i) => ['primeiros_passos[' + i + ']', t] as [string, string]
    ),
    ...(relatorio.conversar_na_consulta ?? []).map(
      (t, i) => ['conversar_na_consulta[' + i + ']', t] as [string, string]
    ),
  ];

  for (const [onde, texto] of campos) {
    if (!texto) continue;
    for (const achado of texto.matchAll(/\d+(?:[.,]\d+)?/g)) {
      const bruto = achado[0];
      const normalizado = bruto.replace(',', '.');
      const ehDecimal = normalizado.includes('.');
      const valor = Number(normalizado);

      if (!ehDecimal && valor <= 10) continue; // contagem, nao pontuacao
      if (permitidos.has(normalizado) || permitidos.has(String(valor))) continue;

      const i = achado.index ?? 0;
      divergencias.push({
        numero: bruto,
        onde,
        trecho: texto.slice(Math.max(0, i - 40), i + bruto.length + 40).trim(),
      });
    }
  }
  return divergencias;
}

// ---------------------------------------------------------------------------
// Geracao
// ---------------------------------------------------------------------------

/** O que o L2 ve. Repare no que NAO esta aqui: as respostas do paciente. */
function montarEntrada(bancos: Bancos, p: Pontuacao) {
  return {
    indice: p.indice,
    indice_maximo: p.indice_maximo,
    escala: 'quanto maior, melhor',
    sistemas: p.sistemas.map((s) => ({
      id: s.sistema,
      nome: s.nome,
      nota: s.nota,
      faixa: s.faixa,
      dominantes: s.dominantes.map((d) => ({ rotulo: d.rotulo, origem: d.origem })),
    })),
    triada: p.triada,
    mapa_de_frequencias: p.frequencias,
    combinacoes_disparadas: p.combinacoes.map((c) => ({
      leitura: c.leitura,
      prioridade: c.prioridade,
    })),
    cobertura: p.cobertura,
    textos_base_aprovados: p.sistemas.flatMap((s) =>
      bancos.mensagens
        .filter((m) => m.sistema === s.sistema && m.faixa === s.faixa)
        .map((m) => ({
          sistema: s.sistema,
          registro: m.registro,
          texto: m.texto,
          primeiros_passos: m.primeiros_passos,
        }))
    ),
  };
}

export async function redigirRelatorio(
  bancos: Bancos,
  p: Pontuacao
): Promise<ResultadoRedator> {
  const cliente = new Anthropic();

  const resposta = await cliente.beta.messages.create({
    model: MODELO,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: REDATOR, cache_control: { type: 'ephemeral' } }],
    tools: [FERRAMENTA_EMITIR_RELATORIO],
    // Saida forcada pelo schema: o modelo nao tem outra forma de responder.
    tool_choice: { type: 'tool', name: 'emitir_relatorio' },
    messages: [
      {
        role: 'user',
        content:
          'Escreva o relatório para esta avaliação integral:\n\n' +
          JSON.stringify(montarEntrada(bancos, p), null, 2),
      },
    ],
  });

  if (resposta.stop_reason === 'refusal') {
    throw new Error(
      'A API recusou gerar o relatório (categoria: ' +
        (resposta.stop_details?.category ?? 'não informada') + ').'
    );
  }

  const bloco = resposta.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === 'tool_use' && b.name === 'emitir_relatorio'
  );
  if (!bloco) {
    throw new Error('O modelo não chamou emitir_relatorio. stop_reason: ' + resposta.stop_reason);
  }

  const relatorio = bloco.input as Relatorio;
  const divergencias = conferirFidelidade(p, relatorio);
  const seguro = saidaSegura(bancos, relatorio.espelho_do_paciente);

  if (seguro.bloqueado) relatorio.espelho_do_paciente = seguro.texto;

  return {
    relatorio,
    divergencias,
    achados: seguro.achados,
    bloqueado: seguro.bloqueado,
    uso: {
      entrada: resposta.usage.input_tokens ?? 0,
      saida: resposta.usage.output_tokens ?? 0,
    },
  };
}
