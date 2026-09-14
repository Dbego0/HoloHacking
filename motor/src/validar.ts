/**
 * VALIDADOR DOS BANCOS
 *
 * O Rodrigo edita CSV. Este arquivo e o que impede uma edicao dele de quebrar
 * o motor em silencio. Roda antes de qualquer publicacao — e no CI, quando houver.
 */

import type { Bancos } from './tipos.ts';
import { avaliarCondicao, nomesDaCondicao } from './motor.ts';

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

  // --- a definicao de cada sistema ---
  // Sem ela o produto mostra uma nota e nao consegue dizer do que ela fala.
  for (const s of bancos.sistemas) {
    if (!s.definicao) {
      erro('sistemas.csv ' + s.id, 'sem definicao: a tela mostra a nota e nao ' +
        'diz o que o sistema e');
    } else if (!s.fonte_definicao) {
      erro('sistemas.csv ' + s.id, 'definicao sem fonte — Regra 3');
    }
  }
  const porRevisar = bancos.sistemas.filter((s) => s.status_definicao !== 'confirmado');
  if (porRevisar.length > 0) {
    aviso('sistemas.csv',
      porRevisar.length + ' de ' + bancos.sistemas.length + ' definicoes de sistema ' +
      'ainda sao rascunho, escritas por quem programou: ' +
      porRevisar.map((s) => s.id).join(', ') + '. Sao o campo que o Rodrigo precisa ' +
      'confirmar antes de qualquer coisa — e a tela ja as mostra, marcadas.');
  }

  // --- sistemas x regras, nos dois sentidos ---
  for (const s of bancos.sistemas) {
    if (!bancos.regras.has(s.id)) erro('regras.csv', 'sistema "' + s.id + '" nao tem regra');
  }
  for (const id of bancos.regras.keys()) {
    if (!idsSistema.has(id)) erro('regras.csv', 'regra para sistema inexistente "' + id + '"');
  }

  // --- eixos terapeuticos ---
  for (const e of bancos.eixos) {
    const onde = 'eixos.csv ' + e.sistema + '/' + (e.eixo || '?');
    if (!idsSistema.has(e.sistema)) erro(onde, 'aponta para sistema inexistente "' + e.sistema + '"');
    if (!e.eixo) erro(onde, 'sem nome de eixo');
    if (!e.praticas) aviso(onde, 'sem praticas: o eixo aparece na tela sem dizer o que fazer');
    if (!e.fonte) erro(onde, 'sem fonte — Regra 3: toda linha carrega procedencia');
  }
  for (const s of bancos.sistemas) {
    if (!bancos.eixos.some((e) => e.sistema === s.id)) {
      aviso('eixos.csv', s.id + ' nao tem nenhum eixo terapeutico: a tela mostra a nota ' +
        'e nao diz por onde conduzir.');
    }
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

    // sistema vazio e legitimo: e pergunta de contexto, que cobre territorio
    // e nao pontua. Sistema ESCRITO ERRADO nao e.
    if (m.sistema && !idsSistema.has(m.sistema)) {
      erro(onde, 'aponta para sistema inexistente "' + m.sistema + '"');
    }
    if (!m.sistema && !m.territorio) {
      erro(onde, 'sem sistema e sem territorio: nao pontua e nao cobre nada — ' +
        'a pergunta seria feita e jogada fora');
    }
    if (!m.pergunta) erro(onde, 'sem pergunta — nao entra no questionario');

    // Pergunta aberta nao cabe em quatro botoes. "Que historia voce conta
    // sobre si mesmo?" so tem resposta em texto — na escala 0..3 ela vira
    // um numero que nao quer dizer nada.
    if (/^(que|qual|quais|quanto|quantas|quantos|como|onde|quem)\b/i.test(m.pergunta)) {
      erro(onde, 'pergunta aberta ("' + m.pergunta.slice(0, 40) + '...") — ' +
        'nao tem resposta na escala de 0 a ' + bancos.config.escala_max);
    }
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

  // --- a mesma pergunta em dois ids ---
  // O paciente responde duas vezes e as duas contam. Quando o mesmo sintoma
  // pesa em dois sistemas, o jeito certo e repetir o ID com outro sistema e
  // outro peso — ai a pergunta aparece uma vez e pontua nos dois.
  const idsPorPergunta = new Map<string, Set<string>>();
  for (const m of bancos.marcadores) {
    const chave = m.pergunta.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!chave) continue;
    const atual = idsPorPergunta.get(chave) ?? new Set<string>();
    atual.add(m.id);
    idsPorPergunta.set(chave, atual);
  }
  for (const [pergunta, ids] of idsPorPergunta) {
    if (ids.size > 1) {
      erro('questionario', 'a mesma pergunta em ' + ids.size + ' marcadores (' +
        [...ids].sort().join(', ') + '): "' + pergunta.slice(0, 50) + '...". ' +
        'Se e o mesmo sinal pesando em dois sistemas, repita o id — nao crie outro.');
    }
  }

  /* --- combinacoes ---

     Uma condicao pode ler mais do que as cinco notas desde 13/09. O validador
     confere que cada nome existe de verdade: "marcador.SNT-999" ou
     "chacra.plexo-solra" nao viram erro em tempo de execucao — a condicao
     simplesmente nunca dispara, calada, e a leitura clinica some do mapa sem
     ninguem descobrir. */
  const idsMarcador = new Set(bancos.marcadores.map((m) => m.id));
  const idsChacra = new Set(bancos.chacras.map((c) => c.id));
  const idsExame = new Set(
    ((bancos as unknown as { exames?: { id: string }[] }).exames ?? []).map((e) => e.id)
  );
  const EIXOS_TRIADA = new Set(['fisico', 'mental', 'espiritual']);

  const valoresFalsos: Record<string, number> = { indice: 50 };
  for (const id of idsSistema) valoresFalsos[id] = 5;

  for (const c of bancos.combinacoes) {
    for (const nome of nomesDaCondicao(c.condicao)) {
      const onde = 'combinacoes.csv ' + c.id;
      const ponto = nome.indexOf('.');
      if (ponto < 0) {
        if (nome !== 'indice' && !idsSistema.has(nome)) {
          erro(onde, '"' + nome + '" nao e sistema nem "indice"');
        }
        valoresFalsos[nome] = valoresFalsos[nome] ?? 5;
        continue;
      }
      const prefixo = nome.slice(0, ponto);
      const resto = nome.slice(ponto + 1);
      if (prefixo === 'triada') {
        if (!EIXOS_TRIADA.has(resto)) erro(onde, 'triada."' + resto + '" — os eixos sao fisico, mental, espiritual');
      } else if (prefixo === 'chacra') {
        if (!idsChacra.has(resto)) erro(onde, 'le o chacra "' + resto + '", que nao existe em chacras.csv');
      } else if (prefixo === 'marcador') {
        if (!idsMarcador.has(resto)) erro(onde, 'le o marcador "' + resto + '", que nao existe nos bancos');
      } else if (prefixo === 'exame') {
        if (idsExame.size > 0 && !idsExame.has(resto)) {
          erro(onde, 'le o exame "' + resto + '", que nao existe em exames.csv');
        }
      } else if (prefixo === 'ferramenta') {
        aviso(onde, 'le "' + nome + '": o motor nao conhece o catalogo de ferramentas, ' +
          'entao o id e o campo nao podem ser conferidos aqui. Se estiverem errados a ' +
          'regra nunca dispara — confira contra ferramentas.js.');
      } else {
        erro(onde, 'prefixo "' + prefixo + '" desconhecido. Use triada., chacra., ' +
          'marcador., exame. ou ferramenta.');
      }
      valoresFalsos[nome] = valoresFalsos[nome] ?? 1;
    }
    try {
      avaliarCondicao(c.condicao, valoresFalsos);
    } catch (e) {
      erro('combinacoes.csv ' + c.id, e instanceof Error ? e.message : String(e));
    }
    if (!c.leitura) erro('combinacoes.csv ' + c.id, 'sem leitura — dispara e nao diz nada');
    if (!c.fonte) erro('combinacoes.csv ' + c.id, 'sem fonte');
    if (c.tipo !== 'leitura' && c.tipo !== 'encaminhar') {
      erro('combinacoes.csv ' + c.id, 'tipo "' + c.tipo + '" — use leitura ou encaminhar');
    }
    // Uma hipotese sem o que conferir vira achado fechado, que e exatamente o
    // que o metodo manda nao fazer.
    if (c.tipo === 'leitura' && !c.investigar) {
      aviso('combinacoes.csv ' + c.id,
        'sem "investigar": a leitura aparece como conclusao, e nao como hipotese a conferir.');
    }
  }

  // --- aprofundar: a pergunta que vem depois ---
  const comAprofundar = new Set(
    bancos.marcadores.filter((m) => m.aprofundar).map((m) => m.id)
  );
  const idsUnicos = new Set(bancos.marcadores.map((m) => m.id));
  if (comAprofundar.size === 0) {
    aviso('questionario',
      'nenhum dos ' + idsUnicos.size + ' marcadores tem a coluna "aprofundar": o passo ' +
      '"aprofundar" do metodo esta EM CONSTRUCAO. O motor ja sabe quais respostas ' +
      'vieram altas e oferece a pergunta seguinte — falta escreve-la. Sem ela o ' +
      'questionario e uma lista de perguntas, que e o que o metodo pede para nao ser.');
  } else if (comAprofundar.size < idsUnicos.size) {
    aviso('questionario',
      comAprofundar.size + ' de ' + idsUnicos.size + ' marcadores tem pergunta de ' +
      'aprofundamento. Os outros pesam no mapa e nao rendem conversa.');
  }
  if (bancos.config.aprofundar_a_partir_de < 1 ||
      bancos.config.aprofundar_a_partir_de > bancos.config.escala_max) {
    erro('config.csv', 'aprofundar_a_partir_de = ' + bancos.config.aprofundar_a_partir_de +
      ', fora da escala 1..' + bancos.config.escala_max);
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

  // --- marcador invertido: o rotulo tem que descrever a carga, nao a virtude ---
  // O rotulo e o que aparece em "dominantes" e no relatorio. Numa pergunta
  // invertida ("voce sente que sua vida tem uma direcao clara?") o que pontua
  // e a AUSENCIA — entao o rotulo certo e "ausencia de direcao", nao "direcao
  // clara". Nao da para verificar isso em codigo; fica o lembrete de revisao.
  const invertidos = bancos.marcadores.filter((m) => m.sentido === 'invertido');
  const idsInvertidos = new Set(invertidos.map((m) => m.id));
  if (idsInvertidos.size > 0) {
    aviso('questionario', idsInvertidos.size + ' marcadores com sentido=invertido (' +
      [...idsInvertidos].sort().join(', ') + '): a pergunta esta no positivo e o 3 ' +
      'vale 0 de carga. Conferir que o rotulo de cada um descreve a falta, nao a virtude.');
  }

  // --- territorios do olhar ---
  const idsTerritorio = new Set(bancos.territorios.map((t) => t.id));
  for (const t of bancos.territorios) {
    if (!t.nome) erro('territorios.csv ' + t.id, 'sem nome');
    if (!t.fonte) erro('territorios.csv ' + t.id, 'sem fonte — Regra 3');
  }
  for (const m of bancos.marcadores) {
    if (m.territorio && !idsTerritorio.has(m.territorio)) {
      erro(m.origem + ' ' + m.id,
        'aponta para o territorio "' + m.territorio + '", que nao existe em territorios.csv');
    }
  }
  for (const t of bancos.territorios) {
    if (!bancos.marcadores.some((m) => m.territorio === t.id)) {
      aviso('territorios.csv ' + t.id,
        '"' + (t.nome || t.id) + '" nao tem nenhuma pergunta apontando para ele: ' +
        'e um buraco no olhar, nao um territorio equilibrado.');
    }
  }
  if (!bancos.config.territorios_ativo && bancos.territorios.length > 0) {
    aviso('config.csv',
      'os territorios do olhar estao PARADOS (territorios_ativo=nao): ' +
      bancos.territorios.length + ' declarados e ' +
      new Set(bancos.marcadores.filter((m) => m.territorio).map((m) => m.id)).size +
      ' marcadores marcados continuam no banco, conferidos, e nao aparecem na tela. ' +
      'Religar e trocar a celula em config.csv.');
  }
  if (bancos.territorios.length === 0) {
    aviso('territorios.csv',
      'os territorios do olhar estao EM CONSTRUCAO: nenhum declarado. O metodo ' +
      'organiza o paciente em corpo, mente, emocoes, comportamento, sistema nervoso, ' +
      'ambiente e historia — e o app so cobre os tres blocos do questionario. ' +
      'Declarar aqui e marcar a coluna "territorio" dos marcadores mostra o que ' +
      'o olhar esta deixando de fora.');
  }

  // --- o Mapa de Frequencias ---
  for (const c of bancos.chacras) {
    if (!c.nome) erro('chacras.csv ' + c.id, 'sem nome — apareceria em branco no mapa');
    if (!c.fonte) erro('chacras.csv ' + c.id, 'sem fonte — Regra 3: toda linha carrega procedencia');
    if (!c.leitura) {
      aviso('chacras.csv ' + c.id, 'sem leitura: o mapa mostra a nota e nao diz o que ela quer dizer');
    }
  }

  // marcador apontando para chacra que nao existe: erro de digitacao viraria
  // um chacra novo, calado, com uma pergunta so dentro dele
  const marcados = bancos.marcadores.filter((m) => m.chacra);
  for (const m of marcados) {
    if (!idsChacra.has(m.chacra!)) {
      erro(m.origem + ' ' + m.id,
        'aponta para o chacra "' + m.chacra + '", que nao existe em chacras.csv');
    }
  }

  // chacra declarado e sem nenhuma pergunta apontando para ele sai sempre
  // vazio do calculo — e aparece como ausencia, nao como equilibrio
  for (const c of bancos.chacras) {
    if (!marcados.some((m) => m.chacra === c.id)) {
      aviso('chacras.csv ' + c.id,
        '"' + (c.nome || c.id) + '" nao tem nenhum marcador apontando para ele: ' +
        'nunca vai aparecer no Mapa de Frequencias.');
    }
  }

  if (!bancos.config.mapa_frequencias_ativo && bancos.chacras.length > 0) {
    aviso('config.csv',
      'o Mapa de Frequencias esta PARADO (mapa_frequencias_ativo=nao): ' +
      bancos.chacras.length + ' chacras e ' +
      new Set(bancos.marcadores.filter((m) => m.chacra).map((m) => m.id)).size +
      ' marcadores mapeados continuam no banco, conferidos, e nao entram em ' +
      'calculo nenhum. Religar e trocar a celula em config.csv.');
  }
  if (bancos.chacras.length === 0) {
    aviso(
      'chacras.csv',
      'o Mapa de Frequencias esta EM CONSTRUCAO: nenhum chacra declarado, entao ' +
      'ele sai vazio e a tela avisa isso. O motor ja sabe calcular — falta o ' +
      'mapeamento, que so pode vir do Rodrigo: preencher chacras.csv e marcar a ' +
      'coluna "chacra" dos marcadores que respondem a cada um.'
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
