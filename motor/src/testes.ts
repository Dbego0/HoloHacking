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
import { pontuar } from './motor.ts';
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

test('nenhuma resposta = nota maxima em todos os sistemas', () => {
  const p = pontuar(bancos, []);
  assert.equal(p.indice, p.indice_maximo);
  for (const s of p.sistemas) assert.equal(s.nota, 10);
});

test('tudo na intensidade maxima = nota zero em todos os sistemas', () => {
  const todas = montarQuestionario(bancos).map((q) => ({ marcador_id: q.id, intensidade: 3 }));
  const p = pontuar(bancos, todas);
  assert.equal(p.indice, 0);
  for (const s of p.sistemas) assert.equal(s.nota, 0);
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
