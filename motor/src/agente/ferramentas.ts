/**
 * L3 — FERRAMENTAS DO AGENTE
 *
 * Um agente sem ferramentas e um chatbot que chuta. Cada ferramenta aqui e uma
 * funcao de verdade, com resposta verificavel e procedencia.
 *
 * O formato das definicoes segue o esperado pelo campo `tools` da API da Anthropic,
 * entao este arquivo serve tanto ao app quanto a qualquer outro canal.
 */

import type { Bancos, Resposta } from '../tipos.ts';
import { pontuar } from '../motor.ts';
import { montarQuestionario } from '../bancos.ts';
import { verificarEscopo } from '../escopo.ts';
import { buscarNoMetodo } from '../corpus/buscar.ts';

export interface Ferramenta {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ---------------------------------------------------------------------------
// Definicoes
// ---------------------------------------------------------------------------

export const listar_sistemas: Ferramenta = {
  name: 'listar_sistemas',
  description:
    'Lista os 5 sistemas do HOLOSCOPE com nome, padrao emocional e impacto espiritual. ' +
    'Use antes de falar sobre qualquer sistema, para usar o nome exato do metodo.',
  input_schema: { type: 'object', properties: {} },
};

export const consultar_sistema: Ferramenta = {
  name: 'consultar_sistema',
  description:
    'Devolve tudo o que o metodo tem sobre um sistema: definicao, sintomas, emocoes e ' +
    'marcadores espirituais associados, com a fonte de cada linha. Use sempre que a ' +
    'pergunta for sobre um sistema especifico.',
  input_schema: {
    type: 'object',
    properties: {
      sistema: {
        type: 'string',
        description: 'id do sistema, ex: metabolico, fungico, acido_inflamatorio',
      },
    },
    required: ['sistema'],
  },
};

export const montar_questionario: Ferramenta = {
  name: 'montar_questionario',
  description: 'Devolve as perguntas do HOLOSCOPE na ordem de aplicacao.',
  input_schema: { type: 'object', properties: {} },
};

export const pontuar_holoscope: Ferramenta = {
  name: 'pontuar_holoscope',
  description:
    'Calcula o Indice HOLOS e a carga dos 5 sistemas a partir das respostas. ' +
    'O calculo e deterministico e feito em codigo — voce NUNCA deve estimar, ' +
    'arredondar ou inventar uma pontuacao por conta propria. Sempre chame esta ferramenta.',
  input_schema: {
    type: 'object',
    properties: {
      respostas: {
        type: 'array',
        description: 'Uma entrada por marcador respondido',
        items: {
          type: 'object',
          properties: {
            marcador_id: { type: 'string', description: 'ex: SNT-001, EMO-003, ESP-002' },
            intensidade: { type: 'integer', description: '0 nunca, 1 as vezes, 2 frequente, 3 sempre' },
          },
          required: ['marcador_id', 'intensidade'],
        },
      },
    },
    required: ['respostas'],
  },
};

export const explicar_pontuacao: Ferramenta = {
  name: 'explicar_pontuacao',
  description:
    'Mostra linha a linha de onde vieram os pontos de um sistema: qual marcador, ' +
    'que peso, que intensidade e qual a fonte. Use quando alguem perguntar "por que deu esse numero?".',
  input_schema: {
    type: 'object',
    properties: {
      respostas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            marcador_id: { type: 'string' },
            intensidade: { type: 'integer' },
          },
          required: ['marcador_id', 'intensidade'],
        },
      },
      sistema: { type: 'string', description: 'id do sistema a detalhar' },
    },
    required: ['respostas', 'sistema'],
  },
};

export const mensagens_do_sistema: Ferramenta = {
  name: 'mensagens_do_sistema',
  description:
    'Devolve o texto-base aprovado para um sistema numa faixa e num registro ' +
    '(nutri ou paciente). Use como base tonal do que voce escrever — nao invente ' +
    'vocabulario que nao esta no banco.',
  input_schema: {
    type: 'object',
    properties: {
      sistema: { type: 'string' },
      faixa: { type: 'string', description: 'baixo | medio | alto' },
      registro: { type: 'string', description: 'nutri | paciente' },
    },
    required: ['sistema', 'faixa', 'registro'],
  },
};

export const buscar_metodo: Ferramenta = {
  name: 'buscar_metodo',
  description:
    'Busca trechos do metodo (livro, aulas, apostilas) que respondam a pergunta, ' +
    'com a fonte de cada trecho. Use ANTES de responder qualquer duvida clinica. ' +
    'Se voltar vazio, diga que nao esta no metodo — nao complete com conhecimento geral.',
  input_schema: {
    type: 'object',
    properties: {
      pergunta: { type: 'string' },
      sistema: { type: 'string', description: 'opcional, para restringir a busca' },
    },
    required: ['pergunta'],
  },
};

export const verificar_escopo: Ferramenta = {
  name: 'verificar_escopo',
  description:
    'Confere se um texto cruza para ato medico (prescricao, dose, diagnostico de doenca). ' +
    'O sistema ja roda isso automaticamente em toda saida; use quando quiser conferir antes.',
  input_schema: {
    type: 'object',
    properties: { texto: { type: 'string' } },
    required: ['texto'],
  },
};

export const FERRAMENTAS_SUPORTE_CLINICO: Ferramenta[] = [
  listar_sistemas,
  consultar_sistema,
  buscar_metodo,
  montar_questionario,
  pontuar_holoscope,
  explicar_pontuacao,
  mensagens_do_sistema,
  verificar_escopo,
];

export const FERRAMENTAS_CONTEUDO: Ferramenta[] = [
  listar_sistemas,
  consultar_sistema,
  buscar_metodo,
];

// ---------------------------------------------------------------------------
// Execucao
// ---------------------------------------------------------------------------

export function executarFerramenta(
  bancos: Bancos,
  nome: string,
  entrada: Record<string, any>
): unknown {
  switch (nome) {
    case 'listar_sistemas':
      return bancos.sistemas;

    case 'consultar_sistema': {
      const sistema = bancos.sistemas.find((s) => s.id === entrada.sistema);
      if (!sistema) {
        return {
          erro: 'Sistema "' + entrada.sistema + '" nao existe.',
          disponiveis: bancos.sistemas.map((s) => s.id),
        };
      }
      const marcadores = bancos.marcadores
        .filter((m) => m.sistema === sistema.id)
        .map((m) => ({
          id: m.id, origem: m.origem, rotulo: m.rotulo, peso: m.peso,
          pergunta: m.pergunta, fonte: m.fonte, status: m.status,
        }));
      return { sistema, marcadores, regra: bancos.regras.get(sistema.id) };
    }

    case 'montar_questionario':
      return montarQuestionario(bancos);

    case 'pontuar_holoscope':
      return pontuar(bancos, entrada.respostas as Resposta[]);

    case 'explicar_pontuacao': {
      const p = pontuar(bancos, entrada.respostas as Resposta[]);
      const nota = p.sistemas.find((s) => s.sistema === entrada.sistema);
      if (!nota) {
        return { erro: 'Sistema "' + entrada.sistema + '" nao existe.' };
      }
      const linhas = p.auditoria.filter((c) =>
        bancos.marcadores.some((m) => m.id === c.marcador_id && m.sistema === entrada.sistema)
      );
      return {
        sistema: nota.sistema,
        nota: nota.nota,
        faixa: nota.faixa,
        conta:
          'marcado ' + nota.obtido + ' de ' + nota.maximo + ' possiveis => carga ' +
          nota.carga + ' => nota ' + nota.nota + ' (10 - carga)',
        linhas,
      };
    }

    case 'mensagens_do_sistema': {
      const achadas = bancos.mensagens.filter(
        (m) =>
          m.sistema === entrada.sistema &&
          m.faixa === entrada.faixa &&
          m.registro === entrada.registro
      );
      return achadas.length > 0
        ? achadas
        : { erro: 'Nenhuma mensagem cadastrada para essa combinacao.' };
    }

    case 'buscar_metodo':
      // Busca real no corpus indexado. Quando o indice nao existe ou nada casa,
      // devolve um aviso explicito mandando o agente dizer que nao sabe —
      // e nao completar com nutricao generica.
      return buscarNoMetodo(String(entrada.pergunta ?? ''), {
        filtro: entrada.sistema ? String(entrada.sistema) : undefined,
      });

    case 'verificar_escopo':
      return verificarEscopo(bancos, String(entrada.texto ?? ''));

    default:
      return { erro: 'Ferramenta desconhecida: ' + nome };
  }
}
