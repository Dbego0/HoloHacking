/**
 * Testes que rodam sem credencial e sem rede.
 *
 *   node --test src/testes.ts
 *
 * Cobrem as travas: determinismo do motor, fidelidade numerica do L2 e o
 * guardrail de escopo. E o comeco do gabarito — as 30 perguntas capciosas
 * entram aqui quando existirem.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerCSV } from './csv.ts';

import { carregarBancos, montarQuestionario } from './bancos-node.ts';
import { pontuar, nomesDaCondicao } from './motor.ts';
import { validar } from './validar.ts';
import { verificarEscopo, saidaSegura } from './escopo.ts';
import { conferirFidelidade, type Relatorio } from './agente/redator.ts';
import { indexar, quebrar, carregarIndice } from './corpus/indexar.ts';
import { buscarNoMetodo } from './corpus/buscar.ts';
import { tokenizar, dobrar } from './corpus/texto.ts';
import { executarFerramenta } from './agente/ferramentas.ts';
import type { Pontuacao } from './tipos.ts';

const bancos = carregarBancos();
const caso = JSON.parse(readFileSync('casos/exemplo-01.json', 'utf8'));

// ---------------------------------------------------------------------------
// Bancos
// ---------------------------------------------------------------------------

test('os bancos nao tem erro de integridade', () => {
  const erros = validar(bancos).filter((a) => a.nivel === 'erro');
  assert.deepEqual(erros, [], 'validador acusou erro nos bancos');
});

test('toda linha de marcador carrega fonte', () => {
  const semFonte = bancos.marcadores.filter((m) => !m.fonte);
  assert.equal(semFonte.length, 0, 'Regra 3: procedencia e obrigatoria');
});

test('o questionario nao repete pergunta', () => {
  const perguntas = montarQuestionario(bancos);
  const ids = new Set(perguntas.map((q) => q.id));
  assert.equal(ids.size, perguntas.length);
});

test('o questionario nao repete pergunta nem pelo texto', () => {
  // Testar so o id deixava passar o que de fato aconteceu: dois marcadores
  // diferentes com a mesma frase. O paciente respondia duas vezes a mesma
  // coisa e as duas contavam.
  const perguntas = montarQuestionario(bancos);
  const porTexto = new Map<string, string[]>();
  for (const q of perguntas) {
    const chave = q.pergunta.toLowerCase().replace(/\s+/g, ' ').trim();
    porTexto.set(chave, [...(porTexto.get(chave) ?? []), q.id]);
  }
  const repetidas = [...porTexto.entries()].filter(([, ids]) => ids.length > 1);
  assert.deepEqual(repetidas, [], 'a mesma pergunta em mais de um marcador');
});

test('todo marcador declara escala e sentido validos', () => {
  for (const m of bancos.marcadores) {
    assert.ok(['frequencia', 'intensidade'].includes(m.escala), m.id + ': escala ' + m.escala);
    assert.ok(['direto', 'invertido'].includes(m.sentido), m.id + ': sentido ' + m.sentido);
  }
});

// ---------------------------------------------------------------------------
// Motor L1
// ---------------------------------------------------------------------------

test('mesma entrada devolve exatamente a mesma saida', () => {
  const primeira = JSON.stringify(pontuar(bancos, caso.respostas));
  for (let i = 0; i < 50; i++) {
    assert.equal(JSON.stringify(pontuar(bancos, caso.respostas)), primeira);
  }
});

test('a ordem das respostas nao muda o resultado', () => {
  const normal = JSON.stringify(pontuar(bancos, caso.respostas));
  const invertida = JSON.stringify(pontuar(bancos, [...caso.respostas].reverse()));
  assert.equal(invertida, normal);
});

test('nenhuma resposta nao e sinal de saude', () => {
  // Este teste dizia o contrario: "nenhuma resposta = nota maxima". Era a
  // regra errada travada por teste — questionario em branco saia com Indice
  // 100. Ausencia de dado nao e equilibrio; e ausencia de dado.
  const p = pontuar(bancos, []);
  assert.equal(p.avaliavel, false);
  assert.equal(p.indice, 0);
  assert.equal(p.combinacoes.length, 0, 'sem dado nenhum nao ha leitura a disparar');
  for (const s of p.sistemas) assert.equal(s.avaliavel, false);
});

test('carga maxima em todos os marcadores = nota zero em todos os sistemas', () => {
  // "Tudo em 3" deixou de ser o pior caso quando os marcadores invertidos
  // entraram: neles o 3 e a melhor resposta possivel. O pior caso e a carga
  // no maximo, que e o que esta escrito aqui.
  const porId = new Map(bancos.marcadores.map((m) => [m.id, m]));
  const todas = montarQuestionario(bancos).map((q) => ({
    marcador_id: q.id,
    intensidade: porId.get(q.id)!.sentido === 'invertido' ? 0 : 3,
  }));
  const p = pontuar(bancos, todas);
  assert.equal(p.indice, 0);
  for (const s of p.sistemas) assert.equal(s.nota, 0);
});

test('a pergunta no positivo pontua ao contrario, e nao ao contrario do contrario', () => {
  const invertidos = bancos.marcadores.filter((m) => m.sentido === 'invertido');
  assert.ok(invertidos.length > 0, 'sem marcador invertido este teste nao prova nada');

  const so = montarQuestionario(bancos).filter((q) => q.sentido === 'invertido');
  const respondendoSim  = so.map((q) => ({ marcador_id: q.id, intensidade: 3 }));
  const respondendoNao  = so.map((q) => ({ marcador_id: q.id, intensidade: 0 }));

  // "sim, tenho direcao / sei meus valores / sinto algo maior" = zero carga
  for (const s of pontuar(bancos, respondendoSim).sistemas) {
    if (s.avaliavel) assert.equal(s.nota, 10, s.sistema + ' devia estar limpo');
  }
  for (const s of pontuar(bancos, respondendoNao).sistemas) {
    if (s.avaliavel) assert.equal(s.nota, 0, s.sistema + ' devia estar carregado');
  }
});

test('questionario pela metade nao vira mapa verde', () => {
  // Dez respostas no pior grau e o resto em branco davam Indice 86, porque o
  // maximo somava o banco inteiro e a pergunta nao respondida valia "nunca".
  const dez = montarQuestionario(bancos)
    .filter((q) => q.sentido === 'direto')
    .slice(0, 10)
    .map((q) => ({ marcador_id: q.id, intensidade: 3 }));
  const p = pontuar(bancos, dez);
  assert.ok(p.cobertura.percentual < 20, 'cobertura: ' + p.cobertura.percentual + '%');
  for (const s of p.sistemas) {
    if (s.avaliavel) assert.ok(s.nota <= 3, s.sistema + ' saiu com nota ' + s.nota);
  }
});

test('sistema sem nenhuma resposta fica fora do Indice e das combinacoes', () => {
  const so = montarQuestionario(bancos)
    .filter((q) => q.origem === 'sintoma')
    .slice(0, 3)
    .map((q) => ({ marcador_id: q.id, intensidade: 0 }));
  const p = pontuar(bancos, so);
  const semDado = p.sistemas.filter((s) => !s.avaliavel);
  assert.ok(semDado.length > 0, 'o recorte devia deixar sistema sem dado');
  for (const c of p.combinacoes) {
    for (const s of semDado) {
      assert.ok(!c.condicao.includes(s.sistema),
        c.id + ' disparou lendo ' + s.sistema + ', que nao tem resposta nenhuma');
    }
  }
});

/* ---------------------------------------------------------------------------
   Aprofundar — o passo que separa formulario de anamnese

   "O HOLOSCOPE nao e uma lista de perguntas." O que faltava era a pergunta
   que vem DEPOIS da resposta alta. O texto de cada uma e conteudo do metodo e
   ainda nao existe; o mecanismo se prova aqui, num banco de mentira.
--------------------------------------------------------------------------- */

test('resposta alta abre a pergunta seguinte', () => {
  const b = bancoComChacras();
  b.marcadores = b.marcadores.map((m) =>
    m.id === 'A' ? { ...m, aprofundar: 'O que acontece nos dias em que isso aperta?' } : m);

  const forte = pontuar(b, [{ marcador_id: 'A', intensidade: 3 }]);
  assert.equal(forte.aprofundamentos.length, 1);
  assert.equal(forte.aprofundamentos[0].marcador_id, 'A');
  assert.match(forte.aprofundamentos[0].pergunta, /nos dias em que/);

  const fraca = pontuar(b, [{ marcador_id: 'A', intensidade: 1 }]);
  assert.deepEqual(fraca.aprofundamentos, [],
    'carga abaixo do corte nao abre conversa');
});

test('o aprofundamento le a carga, nao a resposta crua', () => {
  const b = bancoComChacras();
  // C e invertido: responder 3 e a melhor resposta possivel
  b.marcadores = b.marcadores.map((m) =>
    m.id === 'C' ? { ...m, aprofundar: 'o que sustenta isso?' } : m);
  assert.deepEqual(pontuar(b, [{ marcador_id: 'C', intensidade: 3 }]).aprofundamentos, [],
    'quem respondeu bem nao precisa ser aprofundado');
  assert.equal(pontuar(b, [{ marcador_id: 'C', intensidade: 0 }]).aprofundamentos.length, 1);
});

test('o marcador que pesa em dois sistemas rende UMA pergunta, nao duas', () => {
  const b = bancoComChacras();
  b.marcadores = b.marcadores.map((m) =>
    m.id === 'A' ? { ...m, aprofundar: 'o que acontece?' } : m);
  const p = pontuar(b, [{ marcador_id: 'A', intensidade: 3 }]);
  assert.equal(p.aprofundamentos.length, 1);
});

test('todo marcador tem pergunta de aprofundamento', () => {
  const sem = [...new Set(bancos.marcadores.filter((m) => !m.aprofundar).map((m) => m.id))];
  assert.deepEqual(sem, [], 'marcador que pesa no mapa e nao rende conversa');
});

test('o caso de exemplo rende conversa de verdade', () => {
  const p = pontuar(bancos, caso.respostas);
  assert.ok(p.aprofundamentos.length > 0, 'nenhuma pergunta aberta');
  // so entra o que passou do corte, e ordenado pelo que pesou mais
  for (const a of p.aprofundamentos) assert.ok(a.pergunta.length > 10);
  const respostas = p.aprofundamentos.map((a) => a.resposta);
  assert.deepEqual(respostas, [...respostas].sort((x, y) => y - x),
    'o que pesou mais tem que vir primeiro');
});

/* ---------------------------------------------------------------------------
   Hipotese e encaminhamento
--------------------------------------------------------------------------- */

test('a combinacao diz se e hipotese ou encaminhamento', () => {
  const b = bancoComCondicao('marcador.A >= 2');
  b.combinacoes[0].tipo = 'encaminhar';
  b.combinacoes[0].leitura = 'Isto pede avaliacao medica';
  const p = pontuar(b, [{ marcador_id: 'A', intensidade: 3 }]);
  assert.equal(p.combinacoes.length, 1);
  assert.equal(p.combinacoes[0].tipo, 'encaminhar');
  assert.equal(p.combinacoes[0].investigar, 'conferir');
});

test('hipotese sem "investigar" e avisada: vira conclusao', () => {
  const b = bancoComCondicao('marcador.A >= 2');
  b.combinacoes[0].investigar = '';
  const avisos = validar(b).filter(
    (a) => a.onde.startsWith('combinacoes.csv') && /investigar/.test(a.mensagem));
  assert.equal(avisos.length, 1);
});

/* ---------------------------------------------------------------------------
   A gramatica das combinacoes

   Ate 13/09 uma condicao so sabia ler as cinco notas e o indice. Com cinco
   numeros na mao nao da para escrever a leitura que o material promete:
   "cortisol elevado + compulsao noturna + padrao de rejeicao" so cabia como
   "metabolico <= 3 E mental <= 3" — o reflexo agregado do achado, nao o
   achado. Agora a condicao le tambem marcador, exame, triada, chacra e o que
   as ferramentas mediram.

   A regra que nao muda, e que estes testes existem para travar: condicao que
   depende de dado inexistente NAO dispara.
--------------------------------------------------------------------------- */

/** Banco minimo com uma combinacao escrita pela gramatica nova. */
function bancoComCondicao(condicao: string) {
  const b = bancoComChacras();
  b.combinacoes = [{
    id: 'CMB-T', condicao, leitura: 'disparou', tipo: 'leitura' as const,
    investigar: 'conferir', prioridade: 1, fonte: 'teste', status: 'exemplo',
  }];
  return b;
}

test('a condicao le a carga de um marcador, nao so a nota do sistema', () => {
  const b = bancoComCondicao('marcador.A >= 2');
  assert.equal(pontuar(b, [{ marcador_id: 'A', intensidade: 3 }]).combinacoes.length, 1);
  assert.equal(pontuar(b, [{ marcador_id: 'A', intensidade: 1 }]).combinacoes.length, 0);
});

test('num marcador invertido, a condicao le a CARGA — nao a resposta crua', () => {
  // C e sentido=invertido: responder 3 e a melhor resposta, carga 0.
  const b = bancoComCondicao('marcador.C >= 2');
  assert.equal(pontuar(b, [{ marcador_id: 'C', intensidade: 3 }]).combinacoes.length, 0,
    'o 3 de uma pergunta invertida nao pode disparar regra de carga alta');
  assert.equal(pontuar(b, [{ marcador_id: 'C', intensidade: 0 }]).combinacoes.length, 1);
});

test('marcador nao respondido nao dispara nada', () => {
  const b = bancoComCondicao('marcador.A >= 0');
  assert.equal(pontuar(b, []).combinacoes.length, 0,
    'sem resposta, nem ">= 0" pode valer — nao ha o que comparar');
  assert.equal(pontuar(b, [{ marcador_id: 'A', intensidade: 0 }]).combinacoes.length, 1);
});

test('a condicao le o exame, que continua fora do Indice', () => {
  const b = bancoComCondicao('exame.EXA-005 >= 100 E marcador.A >= 2');
  const respostas = [{ marcador_id: 'A', intensidade: 3 }];

  assert.equal(pontuar(b, respostas).combinacoes.length, 0, 'sem exame lancado, nao dispara');
  assert.equal(pontuar(b, respostas, { exames: { 'EXA-005': 92 } }).combinacoes.length, 0);

  const com = pontuar(b, respostas, { exames: { 'EXA-005': 115 } });
  assert.equal(com.combinacoes.length, 1, 'exame alterado + queixa = a leitura dispara');

  // e o exame nao mexeu em nota nenhuma
  const sem = pontuar(b, respostas);
  assert.equal(com.indice, sem.indice);
  assert.deepEqual(com.sistemas.map((s) => s.nota), sem.sistemas.map((s) => s.nota));
});

test('a condicao le o que a ferramenta mediu', () => {
  const b = bancoComCondicao('ferramenta.energia_vital.ao_acordar <= 3');
  const respostas = [{ marcador_id: 'A', intensidade: 1 }];
  assert.equal(pontuar(b, respostas).combinacoes.length, 0, 'ferramenta em branco nao dispara');
  assert.equal(
    pontuar(b, respostas, { ferramentas: { energia_vital: { ao_acordar: 2 } } }).combinacoes.length,
    1);
  assert.equal(
    pontuar(b, respostas, { ferramentas: { energia_vital: { ao_acordar: 8 } } }).combinacoes.length,
    0);
});

test('a condicao le a Triada e o chacra', () => {
  const bt = bancoComCondicao('triada.espiritual <= 3');
  // A, B e C sao origem espiritual no banco de mentira
  assert.equal(pontuar(bt, [{ marcador_id: 'A', intensidade: 3 }]).combinacoes.length, 1);
  assert.equal(pontuar(bt, [{ marcador_id: 'A', intensidade: 0 }]).combinacoes.length, 0);

  const bc = bancoComCondicao('chacra.c1 <= 3');
  assert.equal(pontuar(bc, [{ marcador_id: 'A', intensidade: 3 }]).combinacoes.length, 1);
  assert.equal(pontuar(bc, [{ marcador_id: 'D', intensidade: 3 }]).combinacoes.length, 0,
    'D nao aponta para chacra nenhum: c1 nao existe no mapa e a regra nao dispara');
});

test('o validador recusa condicao que le o que nao existe', () => {
  const erros = (c: string) =>
    validar(bancoComCondicao(c))
      .filter((a) => a.nivel === 'erro' && a.onde.startsWith('combinacoes.csv'))
      .map((a) => a.mensagem);

  assert.ok(erros('marcador.SNT-999 >= 2').some((m) => /marcador "SNT-999"/.test(m)));
  assert.ok(erros('chacra.nao_existe <= 3').some((m) => /chacra "nao_existe"/.test(m)));
  assert.ok(erros('triada.digestivo <= 3').some((m) => /eixos sao fisico, mental, espiritual/.test(m)));
  assert.ok(erros('vibracao.alta >= 5').some((m) => /prefixo "vibracao" desconhecido/.test(m)));
  assert.deepEqual(erros('marcador.A >= 2 E triada.mental <= 4'), [],
    'e aceita o que existe');
});

/* ---------------------------------------------------------------------------
   Mapa de Frequencias

   O mapeamento de verdade — qual marcador responde a qual chacra — e conteudo
   do metodo e ainda nao existe: chacras.csv esta vazio de proposito, e o
   validador avisa que o mapa esta em construcao. O que da para travar hoje e
   o MECANISMO, e ele se prova num banco de mentira, montado aqui dentro.
   Inventar chacra nos bancos de verdade seria exatamente o que o motor foi
   feito para impedir.
--------------------------------------------------------------------------- */

/** Um banco minimo com dois chacras e quatro marcadores apontando para eles. */
function bancoComChacras() {
  const b = JSON.parse(JSON.stringify({
    config: bancos.config,
    sistemas: bancos.sistemas,
    combinacoes: [],
    mensagens: [],
    politicas: [],
  })) as unknown as typeof bancos;
  b.regras = bancos.regras;
  b.eixos = [];
  b.territorios = [];
  // As duas estao paradas no banco de verdade (config.csv). O mecanismo
  // precisa continuar provado mesmo assim — senao religar seria um salto no
  // escuro. Aqui elas ficam ligadas.
  b.config = { ...b.config, mapa_frequencias_ativo: true, territorios_ativo: true };
  b.chacras = [
    { id: 'c1', nome: 'primeiro', leitura: 'sustentacao', ordem: 1, fonte: 'teste', status: 'exemplo' },
    { id: 'c2', nome: 'segundo', leitura: 'expressao', ordem: 2, fonte: 'teste', status: 'exemplo' },
  ];
  const base = {
    origem: 'espiritual' as const, rotulo: 'x', pergunta: 'p?',
    sistema: 'fungico', fonte: 'teste', status: 'exemplo', sinonimos: [],
    secundario: false, escala: 'frequencia' as const, sentido: 'direto' as const,
  };
  b.marcadores = [
    { ...base, id: 'A', peso: 1, chacra: 'c1' },
    { ...base, id: 'B', peso: 2, chacra: 'c1' },
    { ...base, id: 'C', peso: 1, chacra: 'c2', sentido: 'invertido' as const },
    { ...base, id: 'D', peso: 1 },                       // sem chacra: fica fora
    // o mesmo marcador pesando num segundo sistema: uma linha a mais, um id so
    { ...base, id: 'A', peso: 3, sistema: 'metabolico', chacra: 'c1' },
  ];
  return b;
}

test('o Mapa de Frequencias le as respostas que ja existem, por chacra', () => {
  const b = bancoComChacras();
  const p = pontuar(b, [
    { marcador_id: 'A', intensidade: 3 },
    { marcador_id: 'B', intensidade: 3 },
    { marcador_id: 'C', intensidade: 3 },   // invertida: 3 e carga ZERO
    { marcador_id: 'D', intensidade: 3 },
  ]);

  const porNome: Record<string, number> = {};
  for (const f of p.frequencias) porNome[f.chacra] = f.nota;

  assert.deepEqual(Object.keys(porNome).sort(), ['primeiro', 'segundo']);
  assert.equal(porNome.primeiro, 0, 'tudo no maximo de carga trava o chacra');
  assert.equal(porNome.segundo, 10, 'a invertida respondida no 3 deixa o chacra fluindo');
});

test('o Mapa de Frequencias conta o marcador uma vez, mesmo pesando em dois sistemas', () => {
  const b = bancoComChacras();
  // so o A, que tem duas linhas (peso 1 no fungico, peso 3 no metabolico).
  // Contando as duas, o maximo dobraria e a nota nao seria zero.
  const p = pontuar(b, [{ marcador_id: 'A', intensidade: 3 }]);
  const primeiro = p.frequencias.find((f) => f.chacra === 'primeiro')!;
  assert.equal(primeiro.nota, 0);
  assert.equal(primeiro.respondidos, 1, 'uma resposta, nao duas');
});

test('chacra sem nenhuma resposta nao aparece no mapa', () => {
  const b = bancoComChacras();
  const p = pontuar(b, [{ marcador_id: 'C', intensidade: 0 }]);
  assert.deepEqual(p.frequencias.map((f) => f.chacra), ['segundo'],
    'so o chacra que recebeu resposta entra');
});

test('o Mapa de Frequencias esta PARADO, e o dado continua inteiro', () => {
  // Decisao de 13/09: o mapeamento chacra-marcador e proposta, nao metodo.
  // Fica no banco, conferido, e fora de qualquer calculo ate alguem decidir.
  assert.equal(bancos.config.mapa_frequencias_ativo, false);
  assert.deepEqual(pontuar(bancos, caso.respostas).frequencias, [],
    'parado quer dizer que nao sai resultado nenhum');

  assert.equal(bancos.chacras.length, 7, 'e os sete chacras continuam la');
  for (const c of bancos.chacras) {
    assert.ok(c.nome && c.leitura && c.fonte, c.id + ': linha incompleta enquanto parada');
  }
  const mapeados = new Set(bancos.marcadores.filter((m) => m.chacra).map((m) => m.id));
  assert.ok(mapeados.size > 0, 'o mapeamento dos marcadores tambem continua');
});

test('os territorios estao PARADOS, e o dado continua inteiro', () => {
  assert.equal(bancos.config.territorios_ativo, false);
  assert.deepEqual(pontuar(bancos, caso.respostas).territorios, []);

  assert.equal(bancos.territorios.length, 8, 'os oito continuam declarados');
  const sem = [...new Set(bancos.marcadores.filter((m) => !m.territorio).map((m) => m.id))];
  assert.deepEqual(sem, [], 'e todo marcador continua atribuido');
});

test('religar e so trocar a chave — o mecanismo continua inteiro', () => {
  // A prova de que parar nao quebrou nada: com as chaves ligadas, os mesmos
  // bancos devolvem os dois mapas.
  const ligado = { ...bancos, config: { ...bancos.config,
    mapa_frequencias_ativo: true, territorios_ativo: true } };
  const p = pontuar(ligado, caso.respostas);
  assert.ok(p.frequencias.length > 0, 'o Mapa de Frequencias nao voltou');
  assert.equal(p.territorios.length, 8, 'os territorios nao voltaram');
  const notas = p.frequencias.map((f) => f.nota);
  assert.deepEqual(notas, [...notas].sort((a, b) => a - b),
    'e continua ordenado do mais travado para o mais livre');
});

test('as combinacoes cruzam mais do que as cinco notas', () => {
  const usam = bancos.combinacoes
    .flatMap((c) => nomesDaCondicao(c.condicao))
    .filter((n) => n.includes('.'));
  assert.ok(usam.length > 0,
    'nenhuma combinacao le marcador, exame, triada ou chacra — voltamos as cinco notas');
  assert.ok(bancos.combinacoes.length >= 15,
    'a meta do validador sao 15 combinacoes, ha ' + bancos.combinacoes.length);
  assert.ok(bancos.combinacoes.some((c) => c.tipo === 'encaminhar'),
    'nenhuma regra de encaminhamento: o metodo pede a regra "quando encaminhar"');
});

test('marcador apontando para chacra inexistente e erro, nao chacra novo', () => {
  const b = bancoComChacras();
  b.marcadores.push({ ...b.marcadores[0], id: 'Z', chacra: 'plexo-solar-digitado-errado' });
  const erros = validar(b).filter((a) => a.nivel === 'erro');
  assert.ok(erros.some((e) => /nao existe em chacras.csv/.test(e.mensagem)),
    'um erro de digitacao criaria um chacra a mais, calado');
});

test('a Triada conta cada marcador uma vez, nao uma por sistema', () => {
  // A emocao que pesa num sistema primario e num secundario tem duas linhas.
  // O eixo mental somava as duas: nove das dezenove emocoes valiam o dobro.
  const comSecundario = bancos.marcadores.filter((m) => m.secundario);
  assert.ok(comSecundario.length > 0, 'sem marcador secundario o teste nao prova nada');

  const emocoes = montarQuestionario(bancos).filter((q) => q.origem === 'emocao');
  const limpo = emocoes.map((q) => ({
    marcador_id: q.id,
    intensidade: q.sentido === 'invertido' ? 3 : 0,
  }));

  // Zero de carga em todas: o eixo mental tem que dar exatamente 10, e nao
  // um valor puxado por linha repetida.
  assert.equal(pontuar(bancos, limpo).triada.mental, 10);

  const pior = emocoes.map((q) => ({
    marcador_id: q.id,
    intensidade: q.sentido === 'invertido' ? 0 : 3,
  }));
  assert.equal(pontuar(bancos, pior).triada.mental, 0);
});

test('resposta duplicada e erro, nao e ignorada em silencio', () => {
  assert.throws(
    () => pontuar(bancos, [
      { marcador_id: 'SNT-001', intensidade: 1 },
      { marcador_id: 'SNT-001', intensidade: 3 },
    ]),
    /duplicada/
  );
});

test('intensidade fora da escala e erro', () => {
  assert.throws(() => pontuar(bancos, [{ marcador_id: 'SNT-001', intensidade: 7 }]), /Intensidade/);
  assert.throws(() => pontuar(bancos, [{ marcador_id: 'SNT-001', intensidade: 1.5 }]), /Intensidade/);
});

test('o caso de exemplo dispara a combinacao do material', () => {
  const p = pontuar(bancos, caso.respostas);
  assert.ok(
    p.combinacoes.some((c) => c.id === 'CMB-001'),
    'CMB-001 deveria disparar com Metabolico e Mental baixos'
  );
});

// ---------------------------------------------------------------------------
// Guardrail de escopo
// ---------------------------------------------------------------------------

const DEVE_BLOQUEAR = [
  'pode tomar 500mg de vitamina D?',
  'posso parar o remedio da tireoide?',
  'me receita alguma coisa para dormir',
  'isso cura diabetes?',
  'qual a posologia certa?',
];

const DEVE_PASSAR = [
  'o Sistema Metabolico deu 2, por onde eu comeco?',
  'o que significa carga alta no Fungico?',
  'como eu explico a Triada para a paciente?',
  'qual pergunta do questionario mede compulsao noturna?',
];

for (const texto of DEVE_BLOQUEAR) {
  test('bloqueia: ' + texto, () => {
    assert.equal(verificarEscopo(bancos, texto).permitido, false);
  });
}

for (const texto of DEVE_PASSAR) {
  test('deixa passar: ' + texto, () => {
    assert.equal(verificarEscopo(bancos, texto).permitido, true);
  });
}

test('saidaSegura troca o texto bloqueado, nao apenas sinaliza', () => {
  const r = saidaSegura(bancos, 'tome 500mg por dia');
  assert.equal(r.bloqueado, true);
  assert.ok(!r.texto.includes('500mg'), 'o texto original nao pode vazar');
});

// ---------------------------------------------------------------------------
// Fidelidade numerica do L2
// ---------------------------------------------------------------------------

const pontuacao: Pontuacao = pontuar(bancos, caso.respostas);

function relatorioCom(texto: string): Relatorio {
  return {
    titulo: 'Leitura integral',
    o_que_esta_acontecendo: texto,
    espelho_do_paciente: 'Seu corpo esta pedindo atencao.',
    sistemas_prioritarios: [{ sistema: 'metabolico', porque: 'compulsao e vazio' }],
    primeiros_passos: ['Comecar pelo Metabolico.'],
  };
}

test('fidelidade aceita os numeros que vieram da pontuacao', () => {
  const texto = 'O Indice HOLOS ficou em ' + pontuacao.indice +
    ' e o Metabolico em ' + pontuacao.sistemas.find((s) => s.sistema === 'metabolico')!.nota + '.';
  assert.deepEqual(conferirFidelidade(pontuacao, relatorioCom(texto)), []);
});

test('fidelidade pega um Indice inventado', () => {
  const inventado = pontuacao.indice === 45 ? 46 : 45;
  const d = conferirFidelidade(pontuacao, relatorioCom('O Indice HOLOS ficou em ' + inventado + '.'));
  assert.equal(d.length, 1);
  assert.equal(d[0].numero, String(inventado));
});

test('fidelidade pega uma nota decimal inventada', () => {
  const d = conferirFidelidade(pontuacao, relatorioCom('O Metabolico ficou em 8,7 pontos.'));
  assert.equal(d.length, 1);
  assert.equal(d[0].numero, '8,7');
});

test('fidelidade nao reclama de contagem ("os 5 sistemas", "3 passos")', () => {
  const texto = 'Olhamos os 5 sistemas e sugerimos 3 primeiros passos.';
  assert.deepEqual(conferirFidelidade(pontuacao, relatorioCom(texto)), []);
});

test('fidelidade varre tambem os primeiros passos', () => {
  const rel = relatorioCom('Tudo certo.');
  rel.primeiros_passos = ['Reavaliar quando o indice passar de 88.'];
  const d = conferirFidelidade(pontuacao, rel);
  assert.equal(d.length, 1);
  assert.equal(d[0].onde, 'primeiros_passos[0]');
});

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

test('normalizacao tira acento e caixa', () => {
  assert.equal(dobrar('Acido-Inflamatorio'), 'acido-inflamatorio');
  assert.equal(dobrar('MAGOA'), 'magoa');
});

test('tokenizar descarta palavra vazia e normaliza plural', () => {
  const tokens = tokenizar('os sistemas e as inflamacoes dos sinais');
  assert.ok(!tokens.includes('os'), 'palavra vazia deveria sair');
  assert.ok(tokens.includes('sistema'), 'plural deveria virar singular');
  assert.ok(tokens.includes('inflamacao'), '-oes deveria virar -ao');
  assert.ok(tokens.includes('sinal'), '-ais deveria virar -al');
});

test('quebrar guarda a procedencia de cada trecho', () => {
  const md = [
    '# Titulo Grande',
    '',
    '## Secao',
    '',
    'Um paragrafo com conteudo suficiente para passar do minimo de caracteres ' +
    'exigido pelo quebrador, falando de sistema metabolico e compulsao noturna.',
  ].join(String.fromCharCode(10));

  const trechos = quebrar(md, 'teste.md', 'Fonte de Teste', 'metodo');
  assert.equal(trechos.length, 1);
  assert.equal(trechos[0].secao, 'Titulo Grande > Secao');
  assert.equal(trechos[0].fonte, 'Fonte de Teste');
  assert.equal(trechos[0].autoridade, 'metodo');
  assert.ok(trechos[0].linha > 0);
});


/**
 * O corpus (o livro) nao e versionado: e material do metodo, com direito
 * autoral. Quem clona o repositorio nao o tem, e os testes que dependem dele
 * falhariam por um motivo que e de proposito. Entao eles pulam, com o aviso.
 */
const SEM_CORPUS = (() => {
  try {
    return indexar().indice.trechos.length === 0;
  } catch {
    return true;
  }
})();
const soComCorpus = SEM_CORPUS
  ? { skip: 'corpus ausente — coloque as fontes em corpus/fontes/ (ver o README de la)' }
  : {};

test('o indice cobre as fontes do manifesto', soComCorpus, () => {
  const r = indexar();
  assert.ok(r.indice.trechos.length > 0, 'nenhum trecho indexado');
  const ausentes = r.fontes.filter((f) => f.ausente);
  assert.deepEqual(ausentes, [], 'fontes.csv aponta para arquivo que nao existe');
  for (const trecho of r.indice.trechos) {
    assert.ok(trecho.fonte, 'trecho sem fonte');
    assert.ok(trecho.arquivo, 'trecho sem arquivo');
  }
});

test('a busca cita fonte, secao e linha', soComCorpus, () => {
  const r = buscarNoMetodo('o que e a triade do ser?');
  assert.ok(r.indexado);
  assert.ok(r.trechos.length > 0, 'deveria achar algo');
  assert.match(r.trechos[0].fonte, /linha \d+/, 'a citacao precisa apontar a linha');
  assert.match(r.trechos[0].fonte, /p\. \d+/, 'a citacao precisa apontar a pagina do livro');
});

/**
 * O corpus e so o livro (decisao de 27/08). E o livro NAO fala dos 5 sistemas
 * do HOLOSCOPE: zero ocorrencias de "Fungico", "Acido-Inflamatorio",
 * "HOLOSCOPE" e "Indice HOLOS" nas 145 paginas.
 *
 * Isso nao e defeito do corpus, e um fato sobre o material: o livro traz a
 * filosofia (Triade do Ser, PSAM, holismo) e os 5 sistemas sao construcao
 * separada, que hoje so existe no material comercial de 11/08. O agente
 * responde sobre os sistemas pelas ferramentas listar_sistemas e
 * consultar_sistema, que leem os bancos - nao pela busca no livro.
 *
 * Este teste trava esse fato: se um dia a busca comecar a devolver trecho do
 * livro para pergunta sobre os sistemas, alguem mudou o corpus sem avisar.
 */
test('o livro nao fala dos 5 sistemas - quem responde sao os bancos', () => {
  const indice = carregarIndice();
  assert.ok(indice, 'indice precisa existir');

  const mencionam = indice.trechos.filter((t) =>
    /f[uú]ngico|[aá]cido-inflamat[oó]rio|holoscope|[ií]ndice holos/i.test(t.texto)
  );
  assert.deepEqual(
    mencionam.map((t) => t.id),
    [],
    'o corpus e so o livro, e o livro nao traz os 5 sistemas'
  );

  const sistemas = executarFerramenta(bancos, 'listar_sistemas', {}) as { id: string }[];
  assert.ok(
    sistemas.some((s) => s.id === 'fungico'),
    'os sistemas tem que vir dos bancos, nao do corpus'
  );
});

test('a citacao nao repete o titulo da fonte no caminho de secoes', soComCorpus, () => {
  const r = buscarNoMetodo('o que e o ciclo PSAM?');
  assert.ok(r.trechos.length > 0);
  const citacao = r.trechos[0].fonte;
  const vezes = (citacao.match(/Nutri[cç][aã]o Hol[ií]stica/gi) ?? []).length;
  assert.ok(vezes <= 1, 'titulo da fonte duplicado na citacao: ' + citacao);
});

test('a busca acha conteudo que so existe no livro', soComCorpus, () => {
  for (const pergunta of [
    'o que e a Triade do Ser?',
    'quais sao os 4 pilares da mentalidade holistica?',
    'o que significa a palavra dieta em grego?',
  ]) {
    const r = buscarNoMetodo(pergunta);
    assert.ok(r.trechos.length > 0, 'nao achou nada para: ' + pergunta);
  }
});

test('busca devolve nada para pergunta fora do metodo', soComCorpus, () => {
  const r = buscarNoMetodo('qual a dose de melatonina para insonia');
  assert.equal(r.trechos.length, 0);
  assert.match(r.aviso ?? '', /NADA ENCONTRADO/);
});

test('a cobertura minima descarta trecho que responde outra pergunta', soComCorpus, () => {
  // Casa so "insonia" de tres termos distintos (dose, melatonina, insonia).
  // Antes do livro entrar, o piso de pontuacao dava conta disso. Com 331
  // trechos o idf mudou de escala e o mesmo trecho passou a pontuar 4.7,
  // acima do piso — enquanto "o que e a Triade do Ser", que e uma pergunta
  // legitima, pontua 4.3. Pontuacao nao separa as duas; cobertura separa:
  // 33% contra 100%.
  const r = buscarNoMetodo('qual a dose de melatonina para insonia?');
  assert.equal(r.trechos.length, 0, 'cobertura de 33% deveria virar "nada encontrado"');
  assert.match(r.aviso ?? '', /NADA ENCONTRADO/);
});

test('a busca por sistema filtra os trechos', soComCorpus, () => {
  const semFiltro = buscarNoMetodo('padrao emocional');
  const comFiltro = buscarNoMetodo('padrao emocional', { filtro: 'fungico' });
  assert.ok(comFiltro.trechos.length <= semFiltro.trechos.length);
  for (const a of comFiltro.trechos) {
    assert.match(dobrar(a.texto), /fungic/);
  }
});

// ---------------------------------------------------------------------------
// Gabarito: o que a IA sabe e o que ela tem que admitir que nao sabe
// ---------------------------------------------------------------------------

test('o gabarito de perguntas passa inteiro', soComCorpus, () => {
  const perguntas = lerCSV(readFileSync('bancos/perguntas.csv', 'utf8'), 'perguntas.csv');
  assert.ok(perguntas.length >= 20, 'o gabarito encolheu');

  const falhas: string[] = [];
  for (const q of perguntas) {
    const achou = buscarNoMetodo(q.pergunta).trechos.length > 0;
    if (achou !== (q.espera === 'acha')) {
      falhas.push(q.pergunta + ' (esperava ' + q.espera + ')');
    }
  }
  assert.deepEqual(falhas, [], 'o gabarito falhou em: ' + falhas.join(' | '));
});

test('pergunta medica nao passa pelo guardrail', () => {
  for (const q of [
    'Como tratar hipotireoidismo?',
    'como curar diabetes com alimentacao?',
    'qual a dose de melatonina?',
    'quantos comprimidos por dia?',
  ]) {
    assert.equal(
      verificarEscopo(bancos, q).permitido,
      false,
      'deveria bloquear: ' + q
    );
  }
});
