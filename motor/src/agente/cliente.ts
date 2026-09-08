/**
 * L3 — O LAÇO DO AGENTE
 *
 * Laço manual, e não o tool runner do SDK, de proposito: as definicoes em
 * ferramentas.ts sao JSON Schema puro para poderem ser reaproveitadas pelo app,
 * pelo WhatsApp e por qualquer outro canal. O tool runner exigiria redefinir
 * tudo em Zod e amarraria as ferramentas a este arquivo — o oposto de
 * "um nucleo, adaptadores finos".
 *
 * Toda saida passa por saidaSegura() antes de voltar. O guardrail roda em
 * codigo, fora do prompt.
 */

import Anthropic, {
  APIConnectionError,
  APIError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import type { Bancos } from '../tipos.ts';
import { saidaSegura, type Achado } from '../escopo.ts';
import {
  executarFerramenta,
  FERRAMENTAS_SUPORTE_CLINICO,
  FERRAMENTAS_CONTEUDO,
  type Ferramenta,
} from './ferramentas.ts';
import { SUPORTE_CLINICO, CONTEUDO } from './prompts.ts';

export const MODELO = 'claude-opus-5';

export type TipoAgente = 'suporte_clinico' | 'conteudo';

const PERFIS: Record<TipoAgente, { sistema: string; ferramentas: Ferramenta[] }> = {
  suporte_clinico: { sistema: SUPORTE_CLINICO, ferramentas: FERRAMENTAS_SUPORTE_CLINICO },
  conteudo: { sistema: CONTEUDO, ferramentas: FERRAMENTAS_CONTEUDO },
};

export interface ChamadaDeFerramenta {
  nome: string;
  entrada: Record<string, unknown>;
  saida: unknown;
}

export interface RespostaAgente {
  texto: string;
  bloqueado: boolean;
  achados: Achado[];
  ferramentas: ChamadaDeFerramenta[];
  iteracoes: number;
  uso: { entrada: number; saida: number; cache_lido: number };
  historico: Anthropic.MessageParam[];
}

export interface OpcoesConversa {
  agente: TipoAgente;
  /** Continua uma conversa: passe o `historico` da resposta anterior. */
  historico?: Anthropic.MessageParam[];
  /** Trava de seguranca contra laco infinito. */
  maxIteracoes?: number;
  /** 'low' a 'max'. Omitido = 'high', o padrao da API. */
  esforco?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  aoChamarFerramenta?: (chamada: ChamadaDeFerramenta) => void;
}

let clienteMemo: Anthropic | null = null;
function cliente(): Anthropic {
  // Sem apiKey explicito: o SDK resolve de ANTHROPIC_API_KEY,
  // de ANTHROPIC_AUTH_TOKEN ou de um perfil de `ant auth login`.
  if (!clienteMemo) clienteMemo = new Anthropic();
  return clienteMemo;
}

function textoDe(conteudo: Anthropic.ContentBlock[]): string {
  return conteudo
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export async function conversar(
  bancos: Bancos,
  mensagem: string,
  opcoes: OpcoesConversa
): Promise<RespostaAgente> {
  const perfil = PERFIS[opcoes.agente];
  const maxIteracoes = opcoes.maxIteracoes ?? 12;

  const mensagens: Anthropic.MessageParam[] = [
    ...(opcoes.historico ?? []),
    { role: 'user', content: mensagem },
  ];

  const ferramentasUsadas: ChamadaDeFerramenta[] = [];
  const uso = { entrada: 0, saida: 0, cache_lido: 0 };
  let iteracoes = 0;

  while (iteracoes < maxIteracoes) {
    iteracoes++;

    const resposta = await cliente().beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      // Fallback de recusa no servidor: se um classificador recusar o pedido,
      // a API roteia para um modelo alternativo em vez de devolver nada.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      ...(opcoes.esforco ? { output_config: { effort: opcoes.esforco } } : {}),
      // O prompt do sistema e estavel: cacheia e economiza a cada turno.
      system: [{ type: 'text', text: perfil.sistema, cache_control: { type: 'ephemeral' } }],
      tools: perfil.ferramentas,
      messages: mensagens,
    });

    uso.entrada += resposta.usage.input_tokens ?? 0;
    uso.saida += resposta.usage.output_tokens ?? 0;
    uso.cache_lido += resposta.usage.cache_read_input_tokens ?? 0;

    // Sempre conferir stop_reason antes de ler content.
    if (resposta.stop_reason === 'refusal') {
      const categoria = resposta.stop_details?.category ?? 'nao informada';
      return {
        texto:
          'O pedido foi recusado pelos classificadores de segurança da API ' +
          '(categoria: ' + categoria + '). Reformule ou encaminhe ao Rodrigo.',
        bloqueado: true,
        achados: [],
        ferramentas: ferramentasUsadas,
        iteracoes,
        uso,
        historico: mensagens,
      };
    }

    // Ferramenta de servidor bateu no limite de iteracoes: reenviar para continuar.
    if (resposta.stop_reason === 'pause_turn') {
      mensagens.push({ role: 'assistant', content: resposta.content });
      continue;
    }

    const chamadas = resposta.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    if (chamadas.length === 0) {
      mensagens.push({ role: 'assistant', content: resposta.content });
      const bruto = textoDe(resposta.content);
      const seguro = saidaSegura(bancos, bruto);
      return {
        texto: seguro.texto,
        bloqueado: seguro.bloqueado,
        achados: seguro.achados,
        ferramentas: ferramentasUsadas,
        iteracoes,
        uso,
        historico: mensagens,
      };
    }

    mensagens.push({ role: 'assistant', content: resposta.content });

    // Todos os tool_result voltam numa mensagem so. Separar em varias ensina o
    // modelo a parar de chamar ferramentas em paralelo.
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const chamada of chamadas) {
      // O input vem como JSON ja desserializado pelo SDK — nunca casar string crua.
      const entrada = (chamada.input ?? {}) as Record<string, unknown>;
      let saida: unknown;
      let erro = false;
      try {
        saida = executarFerramenta(bancos, chamada.name, entrada);
      } catch (e) {
        erro = true;
        saida = { erro: e instanceof Error ? e.message : String(e) };
      }

      const registro: ChamadaDeFerramenta = { nome: chamada.name, entrada, saida };
      ferramentasUsadas.push(registro);
      opcoes.aoChamarFerramenta?.(registro);

      resultados.push({
        type: 'tool_result',
        tool_use_id: chamada.id,
        content: JSON.stringify(saida),
        ...(erro ? { is_error: true } : {}),
      });
    }

    mensagens.push({ role: 'user', content: resultados });
  }

  return {
    texto:
      'O agente atingiu o limite de ' + maxIteracoes + ' iterações sem concluir. ' +
      'Provavelmente ficou em laço chamando ferramentas.',
    bloqueado: true,
    achados: [],
    ferramentas: ferramentasUsadas,
    iteracoes,
    uso,
    historico: mensagens,
  };
}

/**
 * Traduz o erro do SDK em algo que a nutricionista consiga entender.
 * Do mais especifico para o mais generico: colapsar tudo num catch so
 * perde a diferenca entre o que vale a pena repetir (429, 5xx, conexao)
 * e o que nunca vai dar certo repetindo (401, 404).
 */
export function explicarErro(e: unknown): string {
  if (e instanceof AuthenticationError) {
    return 'Credencial inválida ou ausente. Defina ANTHROPIC_API_KEY no ambiente.';
  }
  if (e instanceof NotFoundError) {
    return 'Modelo ou recurso não encontrado: ' + e.message;
  }
  if (e instanceof RateLimitError) {
    return 'Limite de uso da API atingido. Tente de novo em alguns segundos.';
  }
  if (e instanceof APIConnectionError) {
    return 'Não consegui falar com a API — verifique a conexão.';
  }
  if (e instanceof APIError) {
    return 'A API respondeu ' + e.status + ': ' + e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
