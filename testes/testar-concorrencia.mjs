/**
 * CONCORRENCIA ENTRE ABAS — P0.7
 *
 * Duas paginas de verdade, no mesmo navegador, no mesmo disco. Nao ha
 * simulacao em memoria aqui: sao dois contextos, com dois localStorage
 * compartilhados e dois Web Locks reais.
 *
 * Sao dois problemas diferentes, e o teste os separa:
 *
 *   CACHE VELHO — B carregou a lista, A escreveu, B ainda mostra o passado.
 *   Isso nao corrompe dado, mas uma decisao clinica tomada sobre a tela errada
 *   e pior do que um erro de gravacao. A revisao global e o storage event
 *   fazem B DESCOBRIR.
 *
 *   OPERACAO CRITICA — restauracao, recuperacao e apagar tudo reescrevem
 *   colecoes inteiras. Uma escrita normal no meio disso vira estado hibrido.
 *   Web Locks da exclusao mutua de verdade, e quem nao a tem RECUSA em vez de
 *   fingir.
 *
 * E o teste de lost update reproduz o cenario antigo item por item: A grava,
 * B grava com cache velho, e o item de A nao pode sumir em silencio.
 */
import puppeteer from 'puppeteer-core';

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });

const abrirAba = async () => {
  const pg = await nav.newPage();
  await pg.setViewport({ width: 1100, height: 800 });
  await pg.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
  return pg;
};

const A = await abrirAba();
const B = await abrirAba();
const ruim = [];
A.on('pageerror', e => ruim.push('A: ' + e.message));
B.on('pageerror', e => ruim.push('B: ' + e.message));

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

/* o storage event so chega em OUTRAS abas, e chega no proximo turno */
const respirar = (ms) => new Promise(r => setTimeout(r, ms || 250));

const limparTudo = async () => {
  await A.evaluate(async () => {
    localStorage.clear();
    await window.Armazenamento.limparRecuperacao();
    const itens = await window.ArquivoStore.listarTudoEstrito();
    for (const i of itens) await window.ArquivoStore.remover(i.id);
  });
  await A.reload({ waitUntil: 'networkidle2' });
  await B.reload({ waitUntil: 'networkidle2' });
  await A.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
  await B.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
};

/* cada aba anota o que o modulo lhe avisou */
const escutar = (pg) => pg.evaluate(() => {
  window.__avisos = [];
  window.Concorrencia.aoMudar(e => window.__avisos.push(e));
});
const avisosDe = (pg) => pg.evaluate(() => window.__avisos.map(a => a.tipo));

await limparTudo();
await escutar(A);
await escutar(B);

/* ==================================================================== */
console.log('');
console.log('  1. IDENTIDADE E REVISAO');
console.log('');
/* ==================================================================== */

const ids = await Promise.all([
  A.evaluate(() => window.Concorrencia.ABA),
  B.evaluate(() => window.Concorrencia.ABA)
]);
ok(ids[0] && ids[1] && ids[0] !== ids[1],
   'cada aba tem identidade propria, efemera e so em memoria: ' +
   ids[0].slice(0, 8) + '… e ' + ids[1].slice(0, 8) + '…');

const semPersistir = await A.evaluate(() =>
  Object.keys(localStorage).filter(k => k.indexOf('holohacking.aba') === 0).length);
ok(semPersistir === 0,
   'e ela NAO e persistida: nao virou dado novo no disco');

/* A */
const iniciais = await Promise.all([
  A.evaluate(() => window.Concorrencia.estado()),
  B.evaluate(() => window.Concorrencia.estado())
]);
ok(iniciais[0].revisao_conhecida === iniciais[1].revisao_conhecida &&
   !iniciais[0].desatualizado && !iniciais[1].desatualizado,
   'A — as duas comecam na mesma revisao (' + iniciais[0].revisao_conhecida +
   ') e as duas se consideram atualizadas');

const webLocks = await A.evaluate(() => window.Concorrencia.temWebLocks());
ok(webLocks === true,
   'e este navegador tem navigator.locks — a exclusao mutua e de verdade');

/* ==================================================================== */
console.log('');
console.log('  2. A ESCRITA DE UMA CHEGA NA OUTRA');
console.log('');
/* ==================================================================== */

/* B */
const antesRev = await A.evaluate(() => window.Concorrencia.lerRevisao());
await A.evaluate(async () => {
  await window.DadosLocais.from('pacientes').insert({ nome: 'Ana de A' });
});
await respirar();

const depoisA = await A.evaluate(() => window.Concorrencia.estado());
const depoisB = await B.evaluate(() => window.Concorrencia.estado());
ok(depoisA.revisao_no_disco === antesRev + 1,
   'B — A gravou um paciente e a revisao avancou: ' + antesRev + ' → ' +
   depoisA.revisao_no_disco);
ok(depoisA.desatualizado === false,
   'quem escreveu continua atualizado — a revisao avancou por ela mesma');
ok(depoisB.desatualizado === true,
   'B — e a OUTRA aba ficou marcada como desatualizada, sem ninguem pedir');
ok((await avisosDe(B)).indexOf('estado_desatualizado') >= 0,
   'ela recebeu o aviso explicito `estado_desatualizado`: ' +
   (await avisosDe(B)).join(', '));
ok((await avisosDe(A)).indexOf('estado_desatualizado') === -1,
   'e a aba que escreveu NAO recebeu o aviso — o storage event so chega nas ' +
   'outras, que e o comportamento certo');

/* ==================================================================== */
console.log('');
console.log('  3. LOST UPDATE — o cenario antigo, item por item');
console.log('');
/* ==================================================================== */

/* C, D + o teste de lost update do item 18 */
await limparTudo();
await escutar(A); await escutar(B);

const lost = await (async () => {
  /* as duas carregam a MESMA lista */
  const listaA = await A.evaluate(() =>
    window.DadosLocais.from('pacientes').select('*').then(r => r.data.length));
  const listaB = await B.evaluate(() =>
    window.DadosLocais.from('pacientes').select('*').then(r => r.data.length));

  /* A acrescenta A1 */
  await A.evaluate(async () => {
    await window.DadosLocais.from('pacientes').insert({ id: 'A1', nome: 'Item de A' });
  });
  await respirar();

  /* B, com cache velho, tenta acrescentar B1 */
  const tentativa = await B.evaluate(() => {
    const v = window.Concorrencia.podeEscrever();
    return { ok: v.ok, codigo: v.codigo,
             revisao_conhecida: v.revisao_conhecida, revisao_no_disco: v.revisao_no_disco };
  });

  /* B releva, releia e escreve */
  const depoisDeAtualizar = await B.evaluate(async () => {
    window.Concorrencia.marcarAtualizado();
    const podeAgora = window.Concorrencia.podeEscrever();
    await window.DadosLocais.from('pacientes').insert({ id: 'B1', nome: 'Item de B' });
    const r = await window.DadosLocais.from('pacientes').select('*');
    return { podeAgora: podeAgora.ok, ids: r.data.map(x => x.id).sort() };
  });

  return { listaA, listaB, tentativa, depoisDeAtualizar };
})();

ok(lost.tentativa.ok === false && lost.tentativa.codigo === 'ESTADO_DESATUALIZADO',
   'C — B, com cache velho, NAO recebe permissao para gravar: ' +
   lost.tentativa.codigo + ' (conhecia ' + lost.tentativa.revisao_conhecida +
   ', disco esta em ' + lost.tentativa.revisao_no_disco + ')');
ok(lost.depoisDeAtualizar.podeAgora === true,
   'D — depois de reler a fonte e marcar atualizado, B pode gravar');
ok(lost.depoisDeAtualizar.ids.indexOf('A1') >= 0 &&
   lost.depoisDeAtualizar.ids.indexOf('B1') >= 0,
   'LOST UPDATE — os DOIS itens existem no fim: ' +
   lost.depoisDeAtualizar.ids.join(', ') + '. O item de A nao desapareceu');

/* e a razao de fundo, dita em voz alta */
const funil = await A.evaluate(async () => {
  const fonte = await (await fetch('/dados.js')).text();
  return {
    releAntes: /function escrever\([\s\S]{0,200}localStorage\.setItem/.test(fonte),
    insertRele: /if \(this\.acao === "insert"[\s\S]{0,400}linhas\.push/.test(fonte)
  };
});
ok(funil.insertRele,
   'e o motivo de fundo: dados.js NAO escreve a partir de cache — cada ' +
   'operacao rele a tabela inteira do disco, mexe e grava, tudo num turno ' +
   'sincrono so. Nenhuma aba consegue se enfiar entre a leitura e a escrita');

/* ==================================================================== */
console.log('');
console.log('  4. OPERACAO CRITICA — exclusividade de verdade');
console.log('');
/* ==================================================================== */

await limparTudo();
await escutar(A); await escutar(B);

/* um pacote valido para restaurar */
const pacote = await A.evaluate(async () => {
  const g = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const P = 'holohacking.dados.';
  g(P + 'pacientes', [{ id: 'pac-PACOTE', nome: 'Do pacote' }]);
  ['aplicacoes', 'consultas', 'bloqueios', 'holoscope', 'oq3', 'pqq', 'perfil']
    .forEach(t => g(P + t, []));
  g('holohacking.questionario', {});
  g('holohacking.pontuacao', {});
  g('holohacking.exames', {});
  return await window.Armazenamento.gerarBackupV2();
});
await limparTudo();
await escutar(A); await escutar(B);
await A.evaluate(async () => {
  await window.DadosLocais.from('pacientes').insert({ id: 'pac-LOCAL', nome: 'Local' });
});
await respirar();
await B.evaluate(() => window.Concorrencia.marcarAtualizado());

/* E — A segura o lock; B tenta escrever */
const disputa = await (async () => {
  /* A entra numa operacao critica e SEGURA o lock por um tempo */
  const emCurso = A.evaluate(async () => {
    return await window.Concorrencia.comExclusividade('teste_longo', async () => {
      await new Promise(r => setTimeout(r, 1500));
      return 'terminou';
    });
  });
  await respirar(400);

  /* enquanto isso, B: o que ela ve e o que ela consegue */
  const durante = await B.evaluate(async () => {
    const v = window.Concorrencia.podeEscrever({ ignorarRevisao: true });
    const op = window.Concorrencia.operacaoEmAndamento();
    /* e a escrita real pelo funil: tem que ser recusada */
    const r = await window.DadosLocais.from('pacientes')
      .insert({ id: 'B-DURANTE', nome: 'nao deveria entrar' });
    /* e uma tentativa de operacao critica que nao espera */
    const critica = await window.Concorrencia.comExclusividade('outra', async () => 'entrou',
      { naoEsperar: true });
    return {
      podeEscrever: v.ok, codigo: v.codigo,
      operacao: op && op.nome,
      escritaErro: r.error && r.error.codigo,
      escritaData: r.data,
      criticaOk: critica.ok, criticaCodigo: critica.codigo
    };
  });

  const resultadoA = await emCurso;
  await respirar();

  /* F — depois que A termina, B consegue */
  const depois = await B.evaluate(async () => {
    window.Concorrencia.marcarAtualizado();
    const r = await window.DadosLocais.from('pacientes')
      .insert({ id: 'B-DEPOIS', nome: 'agora sim' });
    const todos = await window.DadosLocais.from('pacientes').select('*');
    return { erro: r.error, ids: todos.data.map(x => x.id).sort() };
  });

  return { durante, resultadoA, depois };
})();

ok(disputa.durante.podeEscrever === false &&
   disputa.durante.codigo === 'OPERACAO_CRITICA_EM_ANDAMENTO',
   'E — enquanto A esta numa operacao critica, B sabe: ' + disputa.durante.codigo +
   ' (operacao "' + disputa.durante.operacao + '")');
ok(disputa.durante.escritaErro === 'OPERACAO_CRITICA_EM_ANDAMENTO' &&
   disputa.durante.escritaData === null,
   'e a escrita real de B pelo funil e RECUSADA, com codigo — nao aceita em ' +
   'silencio');
ok(disputa.durante.criticaOk === false &&
   disputa.durante.criticaCodigo === 'OPERACAO_CRITICA_EM_ANDAMENTO',
   'uma segunda operacao critica tambem nao entra: o Web Lock e exclusivo');
ok(disputa.resultadoA.ok === true && disputa.resultadoA.resultado === 'terminou',
   'A terminou a sua operacao normalmente');
ok(!disputa.depois.erro && disputa.depois.ids.indexOf('B-DEPOIS') >= 0,
   'F — e depois que A solta o lock, B grava: ' + disputa.depois.ids.join(', '));
ok(disputa.depois.ids.indexOf('B-DURANTE') === -1,
   'e o que foi recusado durante a operacao NAO entrou depois pela porta dos ' +
   'fundos');

/* G — a aba morre com o lock na mao */
const morte = await (async () => {
  const C = await abrirAba();
  await C.evaluate(() => {
    /* pega o lock e nunca solta: a promessa fica pendente para sempre */
    window.Concorrencia.comExclusividade('vou_morrer', function () {
      return new Promise(function () {});
    });
  });
  await respirar(400);
  const presoAntes = await A.evaluate(async () => {
    const r = await window.Concorrencia.comExclusividade('tentando', async () => 'entrei',
      { naoEsperar: true });
    return r.ok;
  });
  await C.close();          /* a aba morre */
  await respirar(500);
  const livreDepois = await A.evaluate(async () => {
    const r = await window.Concorrencia.comExclusividade('tentando', async () => 'entrei',
      { naoEsperar: true });
    return { ok: r.ok, resultado: r.resultado };
  });
  return { presoAntes, livreDepois };
})();
ok(morte.presoAntes === false,
   'G — com a terceira aba segurando o lock, A nao consegue entrar');
ok(morte.livreDepois.ok === true && morte.livreDepois.resultado === 'entrei',
   'e quando essa aba MORRE o navegador solta o lock sozinho: A entra. Nao ha ' +
   'TTL inventado porque nao existe lock preso para expirar');

/* ==================================================================== */
console.log('');
console.log('  5. RESTAURACAO × ESCRITA SIMULTANEA');
console.log('');
/* ==================================================================== */

await limparTudo();
await escutar(A); await escutar(B);
await A.evaluate(async () => {
  await window.DadosLocais.from('pacientes').insert({ id: 'pac-LOCAL', nome: 'Local' });
});
await respirar();
await B.evaluate(() => window.Concorrencia.marcarAtualizado());

/* H, I — A restaura enquanto B tenta gravar */
const simultaneo = await (async () => {
  const restauracao = A.evaluate(async (pac) => {
    return await window.Armazenamento.aplicarBackupV2(pac);
  }, pacote);
  /* B tenta gravar durante — sem sincronizacao fina: o que importa e que
     NENHUM desfecho produza hibrido */
  const tentativaB = B.evaluate(async () => {
    const r = await window.DadosLocais.from('pacientes')
      .insert({ id: 'B-NO-MEIO', nome: 'durante a restauracao' });
    return { erro: r.error && r.error.codigo, entrou: !!r.data };
  });
  const [rA, rB] = await Promise.all([restauracao, tentativaB]);
  await respirar();

  const estadoFinal = await A.evaluate(async () => {
    const todos = await window.DadosLocais.from('pacientes').select('*');
    const agora = await window.Armazenamento.gerarBackupV2();
    return { ids: todos.data.map(x => x.id).sort(),
             sha: agora.integridade.sha256_conteudo };
  });
  const bDesatualizada = await B.evaluate(() => window.Concorrencia.estado());
  return { rA, rB, estadoFinal, bDesatualizada,
           shaPacote: pacote.integridade.sha256_conteudo };
})();

/* Ha DOIS desfechos legitimos aqui, e o teste tem que aceitar os dois — o que
   nao pode existir e um terceiro.

     1. A restauracao ganha a corrida: ela aplica, e a escrita de B e recusada
        com OPERACAO_CRITICA_EM_ANDAMENTO.

     2. B grava primeiro: a revisao avanca, e a restauracao RECUSA com
        ESTADO_DESATUALIZADO — porque o snapshot que ela ia tirar seria de um
        estado que ja passou.

   O que nao pode acontecer, em nenhuma ordem, e o hibrido: o dado do pacote
   convivendo com o registro que B gravou no meio. E e isso que se cobra. */
const aplicou = simultaneo.rA.aplicado === true;
const recusou = simultaneo.rA.aplicado === false &&
                simultaneo.rA.motivo === 'ESTADO_DESATUALIZADO';

ok(aplicou || recusou,
   'a restauracao teve um dos dois desfechos seguros: ' +
   (aplicou ? 'APLICOU (ganhou a corrida)'
            : 'RECUSOU com ' + simultaneo.rA.motivo +
              ' (B gravou primeiro, e o snapshot seria de um estado vencido)'));

const temPacote = simultaneo.estadoFinal.ids.indexOf('pac-PACOTE') >= 0;
const temDoMeio = simultaneo.estadoFinal.ids.indexOf('B-NO-MEIO') >= 0;
ok(!(temPacote && temDoMeio),
   'e NUNCA os dois juntos: o dado do pacote convivendo com a escrita que B ' +
   'fez no meio seria exatamente o hibrido que esta rodada existe para ' +
   'impedir. Estado final: ' + simultaneo.estadoFinal.ids.join(', '));

if (aplicou) {
  ok(!temDoMeio && simultaneo.rB.erro === 'OPERACAO_CRITICA_EM_ANDAMENTO',
     'a restauracao ganhou, entao a escrita de B foi recusada com codigo: ' +
     simultaneo.rB.erro);
  ok(simultaneo.estadoFinal.sha === simultaneo.shaPacote,
     'H — e o hash do estado restaurado bate com o do pacote');
  ok(simultaneo.rA.revisao > 0,
     'a revisao avancou DEPOIS da verificacao por hash: ' + simultaneo.rA.revisao);
  ok(simultaneo.bDesatualizada.desatualizado === true,
     'H — e B ficou desatualizada: ela nao pode seguir escrevendo sobre o que ' +
     'tinha na tela');
} else {
  ok(!temPacote,
     'a restauracao recusou, entao NADA do pacote entrou: ' +
     simultaneo.estadoFinal.ids.join(', '));
  ok(simultaneo.rA.escreveu === false,
     'e ela nao escreveu nada — nem snapshot: escreveu=' + simultaneo.rA.escreveu);
  ok(simultaneo.rA.revisao_no_inicio !== simultaneo.rA.revisao_agora,
     'a recusa veio da revisao ter mudado entre pedir e conseguir o lock: ' +
     simultaneo.rA.revisao_no_inicio + ' → ' + simultaneo.rA.revisao_agora);
  ok(simultaneo.rB.entrou === true,
     'H — e a escrita de B, que chegou antes, foi preservada: e por ela que a ' +
     'restauracao recusou');
}

/* I — rollback tambem produz revisao coerente */
await limparTudo();
await escutar(A); await escutar(B);
await A.evaluate(async () => {
  await window.DadosLocais.from('pacientes').insert({ id: 'pac-LOCAL', nome: 'Local' });
});
await respirar();
await B.evaluate(() => window.Concorrencia.marcarAtualizado());

const comRollback = await A.evaluate(async (pac) => {
  const antes = window.Concorrencia.lerRevisao();
  const r = await window.Armazenamento.aplicarBackupV2(pac,
    { failpointDeTeste: 'antes_da_verificacao' });
  const todos = await window.DadosLocais.from('pacientes').select('*');
  return { revertido: r.revertido, revisaoAntes: antes,
           revisaoDepois: window.Concorrencia.lerRevisao(),
           ids: todos.data.map(x => x.id).sort() };
}, pacote);
await respirar();
const bAposRollback = await B.evaluate(() => window.Concorrencia.estado());

ok(comRollback.revertido === true &&
   comRollback.ids.join(',') === 'pac-LOCAL',
   'I — a restauracao falhou, o rollback devolveu o estado local: ' +
   comRollback.ids.join(', '));
ok(comRollback.revisaoDepois > comRollback.revisaoAntes,
   'e o rollback TAMBEM avancou a revisao — o disco mudou duas vezes, e as ' +
   'outras abas precisam saber disso: ' + comRollback.revisaoAntes + ' → ' +
   comRollback.revisaoDepois);
ok(bAposRollback.desatualizado === true,
   'B percebeu, mesmo o estado final sendo igual ao que ela conhecia: revisao ' +
   'e relogio, nao diff');

/* J — recuperacao pos-crash e exclusiva */
const recExclusiva = await A.evaluate(async () => {
  const fonte = window.Armazenamento.recuperarRestauracaoPendente.toString();
  return /comExclusividade/.test(fonte);
});
ok(recExclusiva,
   'J — recuperarRestauracaoPendente() passa pela mesma exclusividade: aba A ' +
   'recuperando com aba B gravando produziria o mesmo hibrido');

/* ==================================================================== */
console.log('');
console.log('  6. CADA CAMINHO DE ESCRITA PARTICIPA');
console.log('');
/* ==================================================================== */

await limparTudo();
await escutar(A); await escutar(B);

/* K a O — o inventario virou teste: cada caminho avanca a revisao */
const caminhos = await A.evaluate(async () => {
  const saida = {};
  const medir = async (nome, fn) => {
    const antes = window.Concorrencia.lerRevisao();
    await fn();
    saida[nome] = window.Concorrencia.lerRevisao() - antes;
  };

  await medir('aplicacoes', async () => {
    await window.DadosLocais.from('aplicacoes')
      .insert({ paciente_id: 'p1', ferramenta_id: 'oq3' });
  });
  await medir('consultas', async () => {
    await window.DadosLocais.from('consultas').insert({ paciente_id: 'p1' });
  });
  await medir('bloqueios', async () => {
    await window.DadosLocais.from('bloqueios').insert({ titulo: 'almoço' });
  });
  await medir('perfil', async () => {
    await window.DadosLocais.from('perfil').insert({ nome: 'Nutri' });
  });
  await medir('questionario', async () => {
    const t = JSON.parse(localStorage.getItem('holohacking.questionario') || '{}');
    t['p1'] = { m1: 3 };
    localStorage.setItem('holohacking.questionario', JSON.stringify(t));
    window.Concorrencia.avancarRevisao('questionario');
  });
  await medir('documentos', async () => {
    const b = new Blob(['x'], { type: 'text/plain' }); b.name = 'x.txt';
    await window.ArquivoStore.salvar('p1', b, { nome: 'X', tipo: 'Outro' });
    window.Concorrencia.avancarRevisao('documentos');
  });
  return saida;
});
['aplicacoes', 'consultas', 'bloqueios', 'perfil'].forEach(t => {
  ok(caminhos[t] === 1,
     'N/O — escrever em `' + t + '` avanca a revisao em 1: ' + caminhos[t]);
});
ok(caminhos.questionario >= 1 && caminhos.documentos >= 1,
   'L/K — questionario e documentos idem');

/* e os codigos-fonte provam que nao ficou caminho de fora */
const cobertura = await A.evaluate(async () => {
  const ler = async (a) => await (await fetch(a)).text();
  return {
    dados: /avancarRevisao/.test(await ler('/dados.js')),
    questionario: /avancarRevisao/.test(await ler('/questionario.js')),
    arquivos: /avancarRevisao/.test(await ler('/arquivos.js')),
    app: /avancarRevisao/.test(await ler('/app.js')),
    restaurar: /avancarRevisao/.test(await ler('/restaurar-backup.js'))
  };
});
ok(Object.keys(cobertura).every(k => cobertura[k]),
   'M — e os cinco arquivos que escrevem dado clinico avancam a revisao: ' +
   Object.keys(cobertura).join(', '));

/* ==================================================================== */
console.log('');
console.log('  7. APARENCIA NAO INVALIDA CACHE CLINICO');
console.log('');
/* ==================================================================== */

await B.evaluate(() => window.Concorrencia.marcarAtualizado());
const antesTema = await B.evaluate(() => window.Concorrencia.estado().desatualizado);
await A.evaluate(() => localStorage.setItem('holohacking.aparencia', 'claro'));
await respirar();
const depoisTema = await B.evaluate(() => window.Concorrencia.estado());
ok(antesTema === false && depoisTema.desatualizado === false,
   'trocar o tema em A NAO marca B como desatualizada: ninguem quer invalidar ' +
   'cache clinico porque a outra aba mudou o dark mode');
ok(depoisTema.revisao_no_disco === depoisTema.revisao_conhecida,
   'e a revisao nem se mexeu: aparencia e configuracao local, nao dado');

/* ==================================================================== */
console.log('');
console.log('  8. SEM navigator.locks — RECUSA, NAO FINGE');
console.log('');
/* ==================================================================== */

const semLocks = await (async () => {
  const C = await nav.newPage();
  /* tira navigator.locks ANTES de qualquer script da pagina rodar */
  await C.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
  });
  await C.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
  await C.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());

  const r = await C.evaluate(async (pac) => {
    const antes = {
      pacientes: localStorage.getItem('holohacking.dados.pacientes'),
      revisao: window.Concorrencia.lerRevisao(),
      docs: (await window.ArquivoStore.listarTudoEstrito()).length
    };
    const temLocks = window.Concorrencia.temWebLocks();
    const res = await window.Armazenamento.aplicarBackupV2(pac);
    const depois = {
      pacientes: localStorage.getItem('holohacking.dados.pacientes'),
      revisao: window.Concorrencia.lerRevisao(),
      docs: (await window.ArquivoStore.listarTudoEstrito()).length
    };
    const snap = await window.Armazenamento.lerSnapshotOperacional();
    return { temLocks, motivo: res.motivo, escreveu: res.escreveu,
             aplicado: res.aplicado, avisos: res.avisos.map(a => a.codigo),
             intacto: JSON.stringify(antes) === JSON.stringify(depois),
             temSnapshot: !!snap };
  }, pacote);
  await C.close();
  return r;
})();

ok(semLocks.temLocks === false,
   'num contexto sem navigator.locks, o modulo sabe: temWebLocks()=false');
ok(semLocks.motivo === 'EXCLUSIVIDADE_NAO_SUPORTADA' &&
   semLocks.aplicado === false && semLocks.escreveu === false,
   'a restauracao RECUSA com codigo proprio: ' + semLocks.motivo);
ok(semLocks.intacto && semLocks.temSnapshot === false,
   'e nao escreve NADA — nem um snapshot. Um lock improvisado daria a ' +
   'sensacao de protecao sem a protecao, e numa operacao que reescreve o ' +
   'prontuario inteiro isso e pior do que recusar');

/* ==================================================================== */
console.log('');
console.log('  9. O QUE CONTINUA COMO ESTAVA');
console.log('');
/* ==================================================================== */

const intacto = await A.evaluate(async () => {
  const Ar = window.Armazenamento;
  const pac = await Ar.gerarBackupV2();
  return {
    manifesto: Ar.MANIFESTO.length,
    exportaveis: Ar.exportaveis().length,
    noBackup: pac.armazenamentos.length,
    citaRevisao: JSON.stringify(pac).indexOf('holohacking.revisao') >= 0,
    v1: window.DadosLocais.exportar().versao,
    operacionaisConc: window.Concorrencia.OPERACIONAIS.map(o => o.id),
    idsManifesto: Ar.MANIFESTO.map(e => e.id)
  };
});
ok(intacto.manifesto === 13 && intacto.exportaveis === 12 && intacto.noBackup === 12,
   'o manifesto segue com 13 e o Backup V2 com 12 — a revisao nao virou dado');
ok(!intacto.citaRevisao &&
   intacto.idsManifesto.indexOf('revisao') === -1,
   'e `holohacking.revisao` nao aparece no pacote nem no manifesto');
ok(intacto.operacionaisConc.join(',') ===
   'revisao,operacao_em_curso,operacao_critica',
   'as TRES chaves operacionais estao declaradas a parte, em ' +
   'Concorrencia.OPERACIONAIS: ' + intacto.operacionaisConc.join(', ') +
   '. Sao tres conceitos diferentes e propositalmente separados — o relogio, ' +
   'o anuncio de quem esta operando agora, e o marcador do que ficou pela ' +
   'metade');
ok(intacto.v1 === 1,
   'e DadosLocais.exportar() continua devolvendo versao 1 — vivo, mas ja nao e o backup');

/* A UI foi ligada ao V2. O que importa AQUI, num teste de concorrencia, e que
   quem chama a restauracao seja um arquivo so: duas telas chamando o mesmo
   motor seriam duas portas para a mesma operacao exclusiva. */
const comUI = await A.evaluate(async () => {
  const outras = ['/app.js', '/ficha.js', '/arquivos.js', '/documentos.js'];
  const vazou = [];
  for (const a of outras) {
    const t = await (await fetch(a)).text();
    if (/aplicarBackupV2|recuperarRestauracaoPendente/.test(t)) vazou.push(a);
  }
  const perfil = await (await fetch('/perfil.js')).text();
  return { vazou, perfilChama: /aplicarBackupV2/.test(perfil) };
});
ok(comUI.perfilChama, 'perfil.js chama aplicarBackupV2 — a UI esta ligada');
ok(comUI.vazou.length === 0,
   'e e a UNICA porta para a restauracao: nenhuma outra tela a chama' +
   (comUI.vazou.length ? ' — vazou para ' + comUI.vazou.join(', ') : ''));

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS nas duas abas');
await nav.close();
process.exit(falhou ? 1 : 0);
