/**
 * VALIDADOR DOS BANCOS
 *
 * O Rodrigo edita CSV. Este arquivo e o que impede uma edicao dele de quebrar
 * o motor em silencio. Roda antes de qualquer publicacao — e no CI, quando houver.
 */

import type { Bancos } from './tipos.ts';
import { avaliarCondicao } from './motor.ts';

export interface Achado {
  nivel: 'erro' | 'aviso';
  onde: string;
  mensagem: string;
}

export function validar(bancos: Bancos): Achado[] {
  const achados: Achado[] = [];
  const erro = (onde: string, mensagem: string) => achados.push({ nivel: 'erro', onde, mensagem });
  const aviso = (onde: string, mensagem: string) => achados.push({ nivel: 'aviso', onde, mensagem });

  const idsSistema = new Set(bancos.sistemas.map((s) => s.id));

  // --- sistemas x regras, nos dois sentidos ---
  for (const s of bancos.sistemas) {
    if (!bancos.regras.has(s.id)) erro('regras.csv', 'sistema "' + s.id + '" nao tem regra');
  }
  for (const id of bancos.regras.keys()) {
    if (!idsSistema.has(id)) erro('regras.csv', 'regra para sistema inexistente "' + id + '"');
  }

  // --- peso_indice deve somar 1 ---
  let soma = 0;
  for (const r of bancos.regras.values()) soma += r.peso_indice;
  if (Math.abs(soma - 1) > 0.001) {
    aviso('regras.csv', 'peso_indice soma ' + soma.toFixed(3) + ', esperado 1.000 (o motor normaliza, mas a intencao fica ambigua)');
  }

  // --- faixas coerentes ---
  for (const r of bancos.regras.values()) {
    if (!(r.faixa_baixa_ate < r.faixa_media_ate && r.faixa_media_ate < 10)) {
      erro('regras.csv', r.sistema + ': faixas devem obedecer 0 < baixa_ate < media_ate < 10');
    }
  }

  // --- marcadores ---
  const chavesVistas = new Set<string>();
  const perguntaPorId = new Map<string, string>();

  for (const m of bancos.marcadores) {
    const onde = m.origem + ' ' + m.id;

    if (!idsSistema.has(m.sistema)) {
      erro(onde, 'aponta para sistema inexistente "' + m.sistema + '"');
    }
    if (!m.pergunta) erro(onde, 'sem pergunta — nao entra no questionario');
    if (!m.fonte) erro(onde, 'sem fonte — Regra 3: toda linha carrega procedencia');
    if (!m.secundario && (m.peso < 1 || m.peso > 3)) {
      aviso(onde, 'peso ' + m.peso + ' fora da escala 1..3 combinada');
    }

    // mesma linha (id + sistema) duas vezes conta em dobro sem ninguem perceber
    const chave = m.id + '|' + m.sistema + '|' + (m.secundario ? 's' : 'p');
    if (chavesVistas.has(chave)) {
      erro(onde, 'linha duplicada para o sistema "' + m.sistema + '" — pontuaria duas vezes');
    }
    chavesVistas.add(chave);

    // o mesmo id tem que fazer a mesma pergunta em todas as linhas
    const anterior = perguntaPorId.get(m.id);
    if (anterior !== undefined && anterior !== m.pergunta) {
      erro(onde, 'o id ' + m.id + ' aparece com duas perguntas diferentes');
    }
    perguntaPorId.set(m.id, m.pergunta);
  }

  // --- combinacoes ---
  const valoresFalsos: Record<string, number> = { indice: 50 };
  for (const id of idsSistema) valoresFalsos[id] = 5;

  for (const c of bancos.combinacoes) {
    try {
      avaliarCondicao(c.condicao, valoresFalsos);
    } catch (e) {
      erro('combinacoes.csv ' + c.id, e instanceof Error ? e.message : String(e));
    }
    if (!c.leitura) erro('combinacoes.csv ' + c.id, 'sem leitura — dispara e nao diz nada');
    if (!c.fonte) erro('combinacoes.csv ' + c.id, 'sem fonte');
  }
  if (bancos.combinacoes.length < 15) {
    aviso(
      'combinacoes.csv',
      bancos.combinacoes.length + ' combinacoes. Meta minima: 15. E aqui que o produto se diferencia — ' +
      'um sistema que so soma notas entrega o que qualquer formulario entrega.'
    );
  }

  // --- mensagens: 5 sistemas x 3 faixas x 2 registros ---
  const faixas = ['baixo', 'medio', 'alto'] as const;
  const registros = ['nutri', 'paciente'] as const;
  for (const s of bancos.sistemas) {
    for (const f of faixas) {
      for (const r of registros) {
        const achou = bancos.mensagens.some(
          (m) => m.sistema === s.id && m.faixa === f && m.registro === r
        );
        if (!achou) erro('mensagens.csv', 'falta ' + s.id + ' / ' + f + ' / ' + r);
      }
    }
  }

  // --- politicas de escopo ---
  for (const p of bancos.politicas) {
    try {
      new RegExp(p.padrao.startsWith('(?i)') ? p.padrao.slice(4) : p.padrao);
    } catch {
      erro('escopo.csv ' + p.id, 'expressao regular invalida');
    }
    if (!p.resposta) erro('escopo.csv ' + p.id, 'sem resposta — bloquearia sem explicar');
  }

  // --- o Mapa de Frequencias depende de linhas com dimensao=chacra ---
  const chacras = bancos.marcadores.filter((m) => m.dimensao === 'chacra');
  if (chacras.length === 0) {
    aviso(
      'espiritual.csv',
      'nenhuma linha com dimensao=chacra, entao o Mapa de Frequencias sai vazio. ' +
      'Nao e bug: o livro nao menciona chacra em nenhuma das 145 paginas e nao ha ' +
      'outra fonte. Esse mapeamento so pode vir do Rodrigo.'
    );
  }

  // --- o que ainda nao e o metodo ---
  const linhas = [
    ...bancos.marcadores.map((m) => m.status),
    ...bancos.combinacoes.map((c) => c.status),
    ...bancos.mensagens.map((m) => m.status),
  ];
  const conta = (s: string) => linhas.filter((x) => x === s).length;
  const exemplos = conta('exemplo');
  const rascunhos = conta('rascunho');

  if (exemplos > 0) {
    aviso(
      'bancos',
      exemplos + ' de ' + linhas.length + ' linhas com status=exemplo: demonstracao ' +
      'de formato, sem nenhum conteudo clinico atras.'
    );
  }
  if (rascunhos > 0) {
    aviso(
      'bancos',
      rascunhos + ' de ' + linhas.length + ' linhas com status=rascunho: montadas da ' +
      'literatura funcional e do livro, com a fonte em cada linha, esperando o Rodrigo ' +
      'marcar aceito / corrijo / fora.'
    );
  }
  if (exemplos + rascunhos > 0) {
    aviso(
      'bancos',
      'Enquanto houver linha que nao seja status=confirmado, nenhum resultado deste ' +
      'motor pode ser mostrado a paciente.'
    );
  }

  // "indice" nas condicoes esta na escala 0..indice_maximo (hoje 100), nao 0..10.
  // Comparar contra numero pequeno cria regra que nunca dispara, e a falha e
  // silenciosa: a combinacao simplesmente nunca aparece.
  for (const c of bancos.combinacoes) {
    const m = c.condicao.match(/\bindice\s*(<=|<|>=|>|==)\s*(\d+(?:[.,]\d+)?)/);
    if (!m) continue;
    const valor = Number(m[2].replace(',', '.'));
    if (valor <= 10 && bancos.config.indice_maximo > 10) {
      achados.push({
        nivel: 'aviso',
        onde: 'combinacoes.csv ' + c.id,
        mensagem: 'condicao compara "indice" com ' + valor + ', mas o indice vai ate '
          + bancos.config.indice_maximo + '. Provavelmente era para ser '
          + valor * (bancos.config.indice_maximo / 10) + '. Do jeito que esta, a regra quase nunca dispara.',
      });
    }
  }

  return achados;
}
