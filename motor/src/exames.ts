/**
 * EXAMES LABORATORIAIS
 *
 * A REGRA QUE GOVERNA ESTE ARQUIVO: exame nunca mexe no Indice HOLOS.
 *
 * Parece contraintuitivo, mas e o unico jeito que funciona. Se o exame
 * entrasse na conta, um paciente que faz a primeira consulta sem exame e volta
 * em 4 semanas com exame teria dois numeros que nao sao a mesma medida — e a
 * promessa de rastrear evolucao em 4, 8 e 12 semanas morreria ali. Ninguem
 * saberia dizer se melhorou ou se o exame entrou na conta.
 *
 * O exame tambem nao pode ser obrigatorio: na primeira consulta o paciente
 * normalmente ainda nao tem nenhum.
 *
 * Entao ele faz outra coisa, que e mais valiosa: CONFRONTA o que o paciente
 * relatou com o que o sangue mostra. Quando os dois concordam, a nutricionista
 * fala com outra seguranca. Quando divergem — o paciente diz que esta bem e a
 * ferritina esta no chao — isso e o achado clinico que uma anamnese sozinha
 * nunca pega.
 *
 * As faixas sao rascunho, montadas da literatura funcional. Elas diferem das
 * faixas do laboratorio de proposito: laboratorio marca doenca, aqui se olha
 * terreno. Precisam da revisao do Rodrigo — o validador avisa.
 */

import type { LinhaCSV } from './csv.ts';

export interface Exame {
  id: string;
  exame: string;
  sistema: string;
  unidade: string;
  ideal_min: number;
  ideal_max: number;
  leitura_baixo: string;
  leitura_alto: string;
  fonte: string;
  status: string;
}

export type Situacao = 'ok' | 'baixo' | 'alto';

export interface ExameAvaliado {
  id: string;
  exame: string;
  sistema: string;
  valor: number;
  unidade: string;
  faixa: string;
  situacao: Situacao;
  leitura: string;
}

export type Concordancia = 'confirma' | 'diverge' | 'sem_exame';

export interface ConfrontoSistema {
  sistema: string;
  nota: number | null;
  exames: number;
  alterados: number;
  concordancia: Concordancia;
  leitura: string;
}

export function normalizarExames(linhas: LinhaCSV[]): Exame[] {
  return linhas.map((l) => ({
    id: l.id,
    exame: l.exame,
    sistema: l.sistema,
    unidade: l.unidade,
    ideal_min: Number(l.ideal_min),
    ideal_max: Number(l.ideal_max),
    leitura_baixo: l.leitura_baixo ?? '',
    leitura_alto: l.leitura_alto ?? '',
    fonte: l.fonte,
    status: l.status,
  }));
}

/** Onde cada valor cai em relacao a faixa ideal. Nada de nota, nada de peso. */
export function avaliarExames(
  exames: Exame[],
  valores: Record<string, number>
): ExameAvaliado[] {
  const fora: ExameAvaliado[] = [];
  for (const e of exames) {
    const v = valores[e.id];
    if (v === undefined || v === null || Number.isNaN(v)) continue;
    const situacao: Situacao = v < e.ideal_min ? 'baixo' : v > e.ideal_max ? 'alto' : 'ok';
    const leitura =
      situacao === 'baixo' ? e.leitura_baixo :
      situacao === 'alto' ? e.leitura_alto : '';
    fora.push({
      id: e.id,
      exame: e.exame,
      sistema: e.sistema,
      valor: v,
      unidade: e.unidade,
      faixa: e.ideal_min + ' a ' + e.ideal_max,
      situacao,
      leitura,
    });
  }
  return fora;
}

/**
 * O que o questionario disse contra o que o sangue diz, sistema a sistema.
 *
 * `notas` sao as do HOLOSCOPE (0 a 10, 10 = muito bom). `limiteBaixo` e a
 * fronteira do que se considera comprometido — vem de regras.csv, nao daqui.
 */
export function confrontar(
  exames: Exame[],
  avaliados: ExameAvaliado[],
  notas: Record<string, number>,
  limiteBaixo = 3
): ConfrontoSistema[] {
  const sistemas = Array.from(new Set(exames.map((e) => e.sistema)));
  return sistemas.map((sistema) => {
    const doSistema = avaliados.filter((a) => a.sistema === sistema);
    const alterados = doSistema.filter((a) => a.situacao !== 'ok').length;
    const nota = notas[sistema] ?? null;

    if (doSistema.length === 0) {
      return {
        sistema, nota, exames: 0, alterados: 0,
        concordancia: 'sem_exame' as Concordancia,
        leitura: 'Sem exame para este sistema.',
      };
    }
    if (nota === null) {
      return {
        sistema, nota, exames: doSistema.length, alterados,
        concordancia: 'sem_exame' as Concordancia,
        leitura: 'Sem questionario para comparar.',
      };
    }

    const relatoRuim = nota <= limiteBaixo;
    const sangueRuim = alterados > 0;

    if (relatoRuim && sangueRuim) {
      return {
        sistema, nota, exames: doSistema.length, alterados,
        concordancia: 'confirma' as Concordancia,
        leitura: 'O que ele relata aparece no exame. ' + alterados + ' de '
               + doSistema.length + ' fora da faixa.',
      };
    }
    if (!relatoRuim && !sangueRuim) {
      return {
        sistema, nota, exames: doSistema.length, alterados,
        concordancia: 'confirma' as Concordancia,
        leitura: 'Relato e exame concordam: sistema sem sinal de alerta.',
      };
    }
    if (!relatoRuim && sangueRuim) {
      return {
        sistema, nota, exames: doSistema.length, alterados,
        concordancia: 'diverge' as Concordancia,
        leitura: 'Ele nao se queixa deste sistema, mas ' + alterados + ' exame(s) '
               + 'estao fora da faixa. Investigar — e o que a anamnese nao pega.',
      };
    }
    return {
      sistema, nota, exames: doSistema.length, alterados,
      concordancia: 'diverge' as Concordancia,
      leitura: 'Ele se queixa deste sistema, mas os exames estao dentro da faixa. '
             + 'O sintoma e anterior ao marcador — ou a causa esta noutro lugar.',
    };
  });
}
