/**
 * GUARDRAIL DE ESCOPO
 *
 * Roda em codigo, sobre TODA saida que vai para paciente — nao dentro do prompt.
 * Instrucao em prompt e sugestao. Verificacao em codigo e garantia.
 *
 * As regras vivem em /politicas/escopo.csv para poderem ser editadas sem deploy.
 */

import type { Bancos, Politica } from './tipos.ts';

export interface Achado {
  id: string;
  motivo: string;
  resposta: string;
  trecho: string;
}

export interface ResultadoEscopo {
  permitido: boolean;
  bloqueios: Achado[];
  avisos: Achado[];
}

/** Converte o padrao do CSV (que aceita o prefixo (?i)) em RegExp de JS. */
function compilar(politica: Politica): RegExp {
  let fonte = politica.padrao;
  let flags = 'g';
  if (fonte.startsWith('(?i)')) {
    fonte = fonte.slice(4);
    flags += 'i';
  }
  try {
    return new RegExp(fonte, flags);
  } catch (e) {
    throw new Error(
      'escopo.csv ' + politica.id + ': expressao invalida "' + politica.padrao + '" — ' +
      (e instanceof Error ? e.message : String(e))
    );
  }
}

export function verificarEscopo(bancos: Bancos, texto: string): ResultadoEscopo {
  const bloqueios: Achado[] = [];
  const avisos: Achado[] = [];

  for (const politica of bancos.politicas) {
    const re = compilar(politica);
    const encontrado = re.exec(texto);
    if (!encontrado) continue;

    const achado: Achado = {
      id: politica.id,
      motivo: politica.motivo,
      resposta: politica.resposta,
      trecho: encontrado[0],
    };
    if (politica.gravidade === 'bloqueio') bloqueios.push(achado);
    else avisos.push(achado);
  }

  return { permitido: bloqueios.length === 0, bloqueios, avisos };
}

/**
 * Ponto unico de saida para paciente. Se algo for bloqueado, devolve a resposta
 * da politica no lugar do texto do modelo — nunca o texto original.
 */
export function saidaSegura(
  bancos: Bancos,
  texto: string
): { texto: string; bloqueado: boolean; achados: Achado[] } {
  const r = verificarEscopo(bancos, texto);
  if (!r.permitido) {
    return {
      texto: r.bloqueios.map((b) => b.resposta).join(' '),
      bloqueado: true,
      achados: r.bloqueios,
    };
  }
  return { texto, bloqueado: false, achados: r.avisos };
}
