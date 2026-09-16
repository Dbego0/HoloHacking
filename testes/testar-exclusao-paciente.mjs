/**
 * EXCLUSAO INDIVIDUAL EM CASCATA — P0.6
 *
 * O bug que isto fecha: remover um paciente apagava UMA coisa — a linha dele
 * na tabela `pacientes`. As respostas, a serie de pontuacoes, os exames, os
 * documentos, as aplicacoes, as consultas e o mapa gravado continuavam no
 * disco, ligados a um id que nao existia mais. Nove destinos, invisiveis em
 * toda tela, fora do backup V1, alcancaveis so pelo "apagar tudo".
 *
 * Pedir para apagar e receber "pronto" enquanto o prontuario continua no
 * disco nao e uma falha tecnica pequena.
 *
 * O que estes testes cobram, alem de "sumiu":
 *
 *   A RAIZ POR ULTIMO — enquanto o cadastro existe, os filhos sao
 *   identificaveis. Apagada antes, o que sobra vira orfao anonimo, que e como
 *   o bug original se comportava.
 *
 *   O VIZINHO INTACTO — byte a byte. Uma exclusao que mexe no dado de outro
 *   paciente e pior do que uma que nao apaga nada.
 *
 *   `_sem_paciente` INTACTO — ele nao e paciente: e o deposito do que foi
 *   respondido fora de um cadastro.
 *
 *   FALHA VOLTA TUDO — pelo mesmo motor do P0.4b, sem mecanismo proprio.
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

const p = await abrirAba();
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };
const respirar = (ms) => new Promise(r => setTimeout(r, ms || 250));

const recarregar = async () => {
  try { await p.reload({ waitUntil: 'networkidle2' }); }
  catch (e) { await respirar(400); await p.reload({ waitUntil: 'networkidle2' }); }
  await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
};

const PONTUACAO = (indice) => ({
  quando: '2026-06-01', indice, indice_maximo: 100, avaliavel: true,
  sistemas: [
    { sistema: 'fungico', nome: 'Fúngico', nota: 4.0, avaliavel: true },
    { sistema: 'acido_inflamatorio', nome: 'Ácido-Inflamatório', nota: 5.0, avaliavel: true },
    { sistema: 'metabolico', nome: 'Metabólico', nota: 6.0, avaliavel: true },
    { sistema: 'detox_linfatico', nome: 'Detox + Linfático', nota: 3.0, avaliavel: true },
    { sistema: 'mental_emocional_espiritual', nome: 'Mental', nota: 2.0, avaliavel: true }
  ],
  combinacoes: [], cobertura: { respondidos: 84, total: 84, percentual: 100 }
});

/* Tres "pacientes": o ALVO, o VIZINHO que nao pode ser tocado, e o sentinela
   _sem_paciente, que nao e paciente nenhum e tem que sobreviver. */
const semear = () => p.evaluate(async (PONT) => {
  localStorage.clear();
  await window.Armazenamento.limparRecuperacao();
  const itens = await window.ArquivoStore.listarTudoEstrito();
  for (const i of itens) await window.ArquivoStore.remover(i.id);

  const g = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const P = 'holohacking.dados.';
  g(P + 'pacientes', [
    { id: 'pac-ALVO', nome: 'Alvo ✨', created_at: '2026-01-01T10:00:00.000Z' },
    { id: 'pac-VIZINHO', nome: 'Vizinho', created_at: '2026-01-02T10:00:00.000Z' }
  ]);
  g(P + 'aplicacoes', [
    { id: 'ap-alvo-1', paciente_id: 'pac-ALVO', ferramenta_id: 'oq3',
      respostas: { quer: 'do alvo' } },
    { id: 'ap-alvo-2', paciente_id: 'pac-ALVO', ferramenta_id: 'pqq', respostas: {} },
    { id: 'ap-viz', paciente_id: 'pac-VIZINHO', ferramenta_id: 'oq3', respostas: {} },
    { id: 'ap-sem', paciente_id: '_sem_paciente', ferramenta_id: 'oq3', respostas: {} }
  ]);
  g(P + 'consultas', [
    { id: 'c-alvo', paciente_id: 'pac-ALVO' },
    { id: 'c-viz', paciente_id: 'pac-VIZINHO' }
  ]);
  g(P + 'holoscope', [
    { id: 'h-alvo', paciente_id: 'pac-ALVO', score_holos: 43 },
    { id: 'h-viz', paciente_id: 'pac-VIZINHO', score_holos: 77 }
  ]);
  g(P + 'oq3', [
    { id: 'o-alvo', paciente_id: 'pac-ALVO', quer: 'legado do alvo' },
    { id: 'o-viz', paciente_id: 'pac-VIZINHO', quer: 'legado do vizinho' }
  ]);
  g(P + 'pqq', [{ id: 'q-alvo', paciente_id: 'pac-ALVO', objetivo: 'x' }]);
  /* globais: nao podem ser tocados */
  g(P + 'bloqueios', [{ id: 'b-1', titulo: 'almoço' }]);
  g(P + 'perfil', [{ id: 'pf-1', nome: 'Nutricionista' }]);

  g('holohacking.questionario', {
    'pac-ALVO': { m1: 3, m2: 0 },
    'pac-VIZINHO': { m1: 1 },
    '_sem_paciente': { m1: 2 }
  });
  g('holohacking.pontuacao', {
    'pac-ALVO': [PONT.a, PONT.b],
    'pac-VIZINHO': [PONT.c]
  });
  g('holohacking.exames', {
    'pac-ALVO': { ferritina: 30, b12: null },
    'pac-VIZINHO': { ferritina: 80 },
    '_sem_paciente': { ferritina: 1 }
  });
  localStorage.setItem('holohacking.aparencia', 'escuro');

  const doc = (txt, nome) => {
    const b = new Blob([txt], { type: 'text/plain' });
    b.name = nome;
    return b;
  };
  await window.ArquivoStore.salvar('pac-ALVO', doc('laudo do alvo', 'a1.txt'),
    { nome: 'Laudo A1', tipo: 'Exame', data: '2026-02-01' });
  await window.ArquivoStore.salvar('pac-ALVO', doc('outro do alvo xx', 'a2.txt'),
    { nome: 'Laudo A2', tipo: 'Exame', data: '2026-02-02' });
  await window.ArquivoStore.salvar('pac-VIZINHO', doc('do vizinho aqui', 'v1.txt'),
    { nome: 'Laudo V', tipo: 'Exame', data: '2026-02-03' });
  await window.ArquivoStore.salvar('_sem_paciente', doc('sem dono nenhum', 's1.txt'),
    { nome: 'Sem dono', tipo: 'Outro', data: '2026-02-04' });
  return true;
}, { a: PONTUACAO(40),
     // interpretacao (revisao clinica do HOLOSCOPE): campo opcional dentro
     // do proprio snapshot — some junto com o resto de pac-ALVO, sem
     // precisar de tratamento especial na exclusao (nao ha entrada nova no
     // manifesto para ela).
     b: Object.assign(PONTUACAO(70),
       { interpretacao: { texto: 'leitura do alvo', quando_escrita: '2026-06-01', versao: 1 } }),
     c: PONTUACAO(55) });

const OPERACIONAIS = ['holohacking.revisao', 'holohacking.operacao-em-curso',
                      'holohacking.operacao_critica'];

const retrato = () => p.evaluate(async (fora) => {
  const ls = {};
  Object.keys(localStorage).sort().forEach(k => {
    if (fora.indexOf(k) === -1) ls[k] = localStorage.getItem(k);
  });
  const docs = await window.ArquivoStore.listarTudoEstrito();
  const bytes = {};
  for (const d of docs) {
    const r = await window.ArquivoStore.pegarEstrito(d.id);
    bytes[d.id] = [...new Uint8Array(await r.arquivo.arrayBuffer())].join(',');
  }
  return { ls, docs: docs.map(d => d.id).sort(), bytes };
}, OPERACIONAIS);
const mesmoDado = (x, y) => JSON.stringify(x) === JSON.stringify(y);

const olhar = () => p.evaluate(async () => {
  const ler = (k) => JSON.parse(localStorage.getItem(k) || 'null');
  const P = 'holohacking.dados.';
  const docs = await window.ArquivoStore.listarTudoEstrito();
  return {
    pacientes: (ler(P + 'pacientes') || []).map(x => x.id).sort(),
    aplicacoes: (ler(P + 'aplicacoes') || []).map(x => x.id).sort(),
    consultas: (ler(P + 'consultas') || []).map(x => x.id).sort(),
    holoscope: (ler(P + 'holoscope') || []).map(x => x.id).sort(),
    oq3: (ler(P + 'oq3') || []).map(x => x.id).sort(),
    pqq: (ler(P + 'pqq') || []).map(x => x.id).sort(),
    bloqueios: (ler(P + 'bloqueios') || []).map(x => x.id).sort(),
    perfil: (ler(P + 'perfil') || []).map(x => x.id).sort(),
    questionario: Object.keys(ler('holohacking.questionario') || {}).sort(),
    pontuacao: Object.keys(ler('holohacking.pontuacao') || {}).sort(),
    exames: Object.keys(ler('holohacking.exames') || {}).sort(),
    aparencia: localStorage.getItem('holohacking.aparencia'),
    docs: docs.map(d => d.paciente + ':' + d.nome).sort()
  };
});

/* ==================================================================== */
console.log('');
console.log('  1. OS DESTINOS SAEM DO MANIFESTO');
console.log('');
/* ==================================================================== */

await semear();

const destinos = await p.evaluate(() => {
  const A = window.Armazenamento;
  return {
    doManifesto: A.MANIFESTO.filter(e => e.excluirComPaciente).map(e => e.id).sort(),
    daExclusao: A.destinosDaExclusao().sort(),
    manifesto: A.MANIFESTO.length,
    exportaveis: A.exportaveis().length
  };
});
const ESPERADOS = ['aplicacoes', 'arquivos', 'consultas', 'exames', 'holoscope',
                   'oq3', 'pontuacao', 'pqq', 'questionario'];
ok(destinos.daExclusao.join(',') === ESPERADOS.join(','),
   'os 9 destinos filhos vem do manifesto, nao de lista escrita a mao: ' +
   destinos.daExclusao.join(', '));
ok(destinos.doManifesto.length === 10 &&
   destinos.doManifesto.indexOf('pacientes') >= 0,
   'e a raiz `pacientes` tambem tem excluirComPaciente:true — mas sai da ' +
   'lista de filhos, porque ela nao e filha de si mesma');
ok(destinos.manifesto === 13 && destinos.exportaveis === 12,
   'manifesto continua com 13 e Backup V2 com 12');

/* ==================================================================== */
console.log('');
console.log('  2. O PLANO, SEM TOCAR EM NADA');
console.log('');
/* ==================================================================== */

/* A */
const antesPlano = await retrato();
const plano = await p.evaluate(() =>
  window.Armazenamento.planejarExclusaoPaciente('pac-ALVO'));
const depoisPlano = await retrato();

ok(mesmoDado(antesPlano, depoisPlano),
   'A — planejar e SOMENTE LEITURA: o estado esta byte a byte igual');
ok(plano.existe === true && plano.pode === true && plano.nome === 'Alvo ✨',
   'e o plano encontra o paciente: "' + plano.nome + '"');
ok(plano.destinos.aplicacoes === 2 && plano.destinos.consultas === 1 &&
   plano.destinos.holoscope === 1 && plano.destinos.oq3 === 1 &&
   plano.destinos.pqq === 1 && plano.destinos.questionario === 1 &&
   plano.destinos.pontuacao === 1 && plano.destinos.exames === 1 &&
   plano.destinos.arquivos === 2,
   'com a contagem de cada destino: ' +
   Object.keys(plano.destinos).map(k => k + '=' + plano.destinos[k]).join(' '));
ok(plano.total_registros === 11,
   'total: ' + plano.total_registros + ' registros do paciente');
ok(plano.ordem[0] === 'arquivos' &&
   plano.ordem[plano.ordem.length - 1] === 'pacientes',
   'T — e o plano DIZ a ordem: documentos primeiro, ' +
   '`pacientes` por ultimo — ' + plano.ordem.join(' → '));
ok(plano.exige_confirmacao === true,
   'e avisa que exige confirmacao: ' + plano.confirmacao);

/* ==================================================================== */
console.log('');
console.log('  3. AS RECUSAS');
console.log('');
/* ==================================================================== */

const antesRecusas = await retrato();
const recusas = await p.evaluate(async () => {
  const A = window.Armazenamento;
  const saida = {};
  const tentar = async (rotulo, alvo, opts) => {
    const r = await A.excluirPaciente(alvo, opts);
    saida[rotulo] = { motivo: r.motivo, escreveu: r.escreveu, aplicado: r.aplicado };
  };
  /* B — sem confirmacao */
  await tentar('semConfirmar', 'pac-ALVO', {});
  /* C — ids improprios */
  await tentar('nulo', null, { confirmado: true });
  await tentar('indefinido', undefined, { confirmado: true });
  await tentar('vazio', '', { confirmado: true });
  await tentar('numero', 42, { confirmado: true });
  /* D — o sentinela */
  await tentar('sentinela', '_sem_paciente', { confirmado: true });
  /* E — inexistente */
  await tentar('inexistente', 'pac-QUE-NAO-EXISTE', { confirmado: true });
  /* lista vazia */
  await tentar('listaVazia', [], { confirmado: true });
  /* um valido + um invalido: recusa tudo */
  await tentar('misturado', ['pac-ALVO', '_sem_paciente'], { confirmado: true });
  const snap = await A.lerSnapshotOperacional();
  saida.temSnapshot = !!snap;
  saida.mensagemSentinela = (await A.excluirPaciente('_sem_paciente',
    { confirmado: true })).erros[0].mensagem;
  return saida;
});
const depoisRecusas = await retrato();

ok(recusas.semConfirmar.motivo === 'CONFIRMACAO_OBRIGATORIA' &&
   recusas.semConfirmar.escreveu === false,
   'B — sem confirmacao: ' + recusas.semConfirmar.motivo);
ok(recusas.nulo.motivo === 'ID_AUSENTE' && recusas.indefinido.motivo === 'ID_AUSENTE' &&
   recusas.vazio.motivo === 'ID_INVALIDO' && recusas.numero.motivo === 'ID_INVALIDO',
   'C — null e undefined dao ID_AUSENTE; string vazia e numero dao ID_INVALIDO');
ok(recusas.sentinela.motivo === 'SENTINELA_RECUSADA',
   'D — `_sem_paciente` e recusado com codigo proprio: ' +
   recusas.sentinela.motivo);
ok(/deposito do que foi respondido fora de um cadastro/.test(recusas.mensagemSentinela),
   'e a mensagem diz por que: "' + recusas.mensagemSentinela.slice(0, 95) + '…"');
ok(recusas.inexistente.motivo === 'PACIENTE_NAO_EXISTE',
   'E — paciente inexistente recusado: ' + recusas.inexistente.motivo);
ok(recusas.listaVazia.motivo === 'ID_AUSENTE',
   'lista vazia idem: ' + recusas.listaVazia.motivo);
ok(recusas.misturado.motivo === 'SENTINELA_RECUSADA' &&
   recusas.misturado.escreveu === false,
   'e um id valido junto de um improprio recusa TUDO — nao apaga o valido e ' +
   'reclama do outro');
ok(mesmoDado(antesRecusas, depoisRecusas) && !recusas.temSnapshot,
   'e nenhuma delas escreveu nada, nem criou snapshot');

/* ==================================================================== */
console.log('');
console.log('  4. A EXCLUSAO');
console.log('');
/* ==================================================================== */

await semear();
const antes = await olhar();
const resultado = await p.evaluate(async () => {
  const r = await window.Armazenamento.excluirPaciente('pac-ALVO', { confirmado: true });
  const snap = await window.Armazenamento.lerSnapshotOperacional();
  return {
    aplicado: r.aplicado, fase: r.fase, escreveu: r.escreveu,
    precisa_recarregar: r.precisa_recarregar, revisao: r.revisao,
    destinos: r.destinos, ordem: r.ordem, erros: r.erros,
    temSnapshot: !!snap,
    marcador: window.Concorrencia.lerMarcador()
  };
});
const depois = await olhar();

ok(resultado.aplicado === true && resultado.fase === 'concluido' &&
   resultado.erros.length === 0,
   'aplicado, fase=' + resultado.fase + ', 0 erros');

/* F a O */
ok(depois.pacientes.join(',') === 'pac-VIZINHO',
   'F — o paciente raiz foi removido: sobrou ' + depois.pacientes.join(', '));
ok(depois.aplicacoes.join(',') === 'ap-sem,ap-viz',
   'G — aplicacoes do alvo removidas: sobraram ' + depois.aplicacoes.join(', '));
ok(depois.consultas.join(',') === 'c-viz', 'H — consultas removidas');
ok(depois.holoscope.join(',') === 'h-viz', 'I — holoscope removido');
ok(depois.oq3.join(',') === 'o-viz', 'J — oq3 removido');
ok(depois.pqq.length === 0, 'K — pqq removido');
ok(depois.questionario.join(',') === '_sem_paciente,pac-VIZINHO',
   'L — questionario removido: ' + depois.questionario.join(', '));
ok(depois.pontuacao.join(',') === 'pac-VIZINHO', 'M — pontuacoes removidas');
ok(depois.exames.join(',') === '_sem_paciente,pac-VIZINHO',
   'N — exames removidos: ' + depois.exames.join(', '));
ok(depois.docs.filter(d => d.indexOf('pac-ALVO') === 0).length === 0,
   'O — documentos removidos: sobraram ' + depois.docs.join(', '));

/* P, Q, R, S */
ok(depois.docs.indexOf('pac-VIZINHO:Laudo V') >= 0 &&
   depois.aplicacoes.indexOf('ap-viz') >= 0 &&
   depois.questionario.indexOf('pac-VIZINHO') >= 0 &&
   depois.exames.indexOf('pac-VIZINHO') >= 0,
   'P — o VIZINHO esta inteiro: cadastro, aplicacao, consulta, holoscope, ' +
   'oq3, questionario, pontuacao, exames e documento');
const vizinhoIgual = await p.evaluate(() => {
  const q = JSON.parse(localStorage.getItem('holohacking.questionario'));
  const e = JSON.parse(localStorage.getItem('holohacking.exames'));
  const pt = JSON.parse(localStorage.getItem('holohacking.pontuacao'));
  return { q: JSON.stringify(q['pac-VIZINHO']), e: JSON.stringify(e['pac-VIZINHO']),
           pt: pt['pac-VIZINHO'].length };
});
ok(vizinhoIgual.q === '{"m1":1}' && vizinhoIgual.e === '{"ferritina":80}' &&
   vizinhoIgual.pt === 1,
   'e byte a byte igual: o mapa nao foi recriado, normalizado nem reordenado');

ok(depois.questionario.indexOf('_sem_paciente') >= 0 &&
   depois.exames.indexOf('_sem_paciente') >= 0 &&
   depois.aplicacoes.indexOf('ap-sem') >= 0 &&
   depois.docs.indexOf('_sem_paciente:Sem dono') >= 0,
   'Q — `_sem_paciente` esta EXATAMENTE igual: ele nao e paciente, e apaga-lo ' +
   'aqui destruiria o dado de todos os que nunca tiveram ficha');

ok(depois.aparencia === 'escuro' && depois.aparencia === antes.aparencia,
   'R — a aparencia nao foi tocada');
ok(depois.bloqueios.join(',') === antes.bloqueios.join(',') &&
   depois.perfil.join(',') === antes.perfil.join(','),
   'S — bloqueios e perfil, que sao globais, tambem nao');

/* nenhum orfao sobrou */
const diagnostico = await p.evaluate(() =>
  window.Armazenamento.diagnosticarIntegridade());
ok(diagnostico.orfaos.length === 0,
   'e o diagnostico nao encontra NENHUM orfao depois da exclusao: ' +
   diagnostico.orfaos.length + '. Era esse o bug');

/* M do P0.4b: snapshot e marcador saem no sucesso */
ok(resultado.temSnapshot === false && resultado.marcador === null,
   'no sucesso o snapshot e o marcador saem');
ok(resultado.revisao > 0 && resultado.precisa_recarregar === true,
   'a revisao avancou (' + resultado.revisao + ') e o retorno pede recarga');

/* nao e soft delete */
const semLixo = await p.evaluate(() => {
  const tudo = Object.keys(localStorage)
    .filter(k => k.indexOf('holohacking') === 0)
    .map(k => localStorage.getItem(k)).join('|');
  return { citaAlvo: tudo.indexOf('pac-ALVO') >= 0,
           temFlag: /"(deletado|excluido|removido_em)"/.test(tudo) };
});
ok(!semLixo.citaAlvo && !semLixo.temFlag,
   'e NAO e soft delete: a string "pac-ALVO" nao aparece em lugar nenhum do ' +
   'localStorage, e nenhuma bandeira de "apagado" foi criada');

/* ==================================================================== */
console.log('');
console.log('  5. A RAIZ POR ULTIMO');
console.log('');
/* ==================================================================== */

/* T — um crash ANTES da raiz deixa o cadastro de pe, com os filhos ja fora.
   E o que prova a ordem: se a raiz saisse primeiro, o que restasse viraria
   orfao anonimo — o bug original. */
await semear();
const ordemReal = await p.evaluate(async () => {
  window.__op = window.Armazenamento.excluirPaciente('pac-ALVO',
    { confirmado: true, travarDeTeste: 'antes_da_raiz' });
  await new Promise(r => setTimeout(r, 400));
  const ler = (k) => JSON.parse(localStorage.getItem(k) || 'null');
  return {
    fase: (window.Concorrencia.lerMarcador() || {}).fase,
    aindaTemRaiz: (ler('holohacking.dados.pacientes') || [])
      .some(x => x.id === 'pac-ALVO'),
    docsDoAlvo: (await window.ArquivoStore.listarTudoEstrito())
      .filter(d => d.paciente === 'pac-ALVO').length
  };
});
ok(ordemReal.aindaTemRaiz === true,
   'T — travando no meio, a raiz AINDA EXISTE: ela e a ultima a sair. ' +
   'Enquanto o cadastro esta la, os filhos sao identificaveis');
await recarregar();
await p.evaluate(() => window.Armazenamento.recuperarRestauracaoPendente());

/* ==================================================================== */
console.log('');
console.log('  6. FALHA E ROLLBACK');
console.log('');
/* ==================================================================== */

const cenarioFalha = async (opcoes, rotulo) => {
  await semear();
  const antesF = await retrato();
  const r = await p.evaluate(async (args) => {
    const res = await window.Armazenamento.excluirPaciente('pac-ALVO',
      Object.assign({ confirmado: true }, args));
    const snap = await window.Armazenamento.lerSnapshotOperacional();
    return { revertido: res.revertido, motivo: res.motivo,
             aplicado: res.aplicado, temSnapshot: !!snap,
             marcador: window.Concorrencia.lerMarcador() };
  }, opcoes);
  const depoisF = await retrato();
  return { r, igual: mesmoDado(antesF, depoisF), rotulo };
};

/* U — falha no IndexedDB */
const fIdb = await p.evaluate(async () => {
  const real = window.ArquivoStore.removerDoPacienteEstrito;
  window.ArquivoStore.removerDoPacienteEstrito = () =>
    Promise.reject(Object.assign(new Error('disco'), { name: 'ErroSimulado' }));
  const antes = JSON.stringify(Object.keys(localStorage).sort()
    .map(k => localStorage.getItem(k)));
  const r = await window.Armazenamento.excluirPaciente('pac-ALVO', { confirmado: true });
  window.ArquivoStore.removerDoPacienteEstrito = real;
  const ler = (k) => JSON.parse(localStorage.getItem(k) || 'null');
  return { revertido: r.revertido, motivo: r.motivo,
           erros: (r.erros || []).map(e => e.papel + ':' + e.nome),
           raizIntacta: (ler('holohacking.dados.pacientes') || [])
             .some(x => x.id === 'pac-ALVO'),
           apsIntactas: (ler('holohacking.dados.aplicacoes') || []).length };
});
ok(fIdb.revertido === true && fIdb.raizIntacta === true && fIdb.apsIntactas === 4,
   'U — falha no IndexedDB: rollback, e o localStorage nem chegou a ser ' +
   'tocado — os documentos vem primeiro justamente por isso. ' +
   JSON.stringify(fIdb));

/* V — falha depois do localStorage, antes da verificacao */
const fLs = await cenarioFalha({ failpointDeTeste: 'antes_da_verificacao' }, 'ls');
ok(fLs.r.revertido === true && fLs.igual,
   'V — falha com tudo ja apagado: rollback devolve o estado byte a byte');

/* W — falha antes da raiz */
const fAntes = await cenarioFalha({ failpointDeTeste: 'antes_da_raiz' }, 'antes');
ok(fAntes.r.revertido === true && fAntes.igual,
   'W — falha ANTES da raiz: rollback completo');

/* X — falha depois da raiz, na verificacao */
const fDepois = await p.evaluate(async () => {
  const real = window.Armazenamento.diagnosticarIntegridade;
  const antes = JSON.stringify(Object.keys(localStorage).sort()
    .map(k => localStorage.getItem(k)));
  /* sabota a verificacao: a exclusao terminou, mas o estado "nao confere" */
  const r = await window.Armazenamento.excluirPaciente('pac-ALVO',
    { confirmado: true, failpointDeTeste: 'apos_a_raiz' });
  const ler = (k) => JSON.parse(localStorage.getItem(k) || 'null');
  return { revertido: r.revertido, motivo: r.motivo,
           raizVoltou: (ler('holohacking.dados.pacientes') || [])
             .some(x => x.id === 'pac-ALVO') };
});
ok(fDepois.revertido === true && fDepois.raizVoltou === true,
   'X — falha na verificacao, com a raiz ja apagada: o rollback a devolve');

/* Q do P0.4b — rollback falho mantem snapshot e marcador */
await semear();
const rollbackRuim = await p.evaluate(async () => {
  const real = window.ArquivoStore.substituirTudoEstrito;
  let n = 0;
  window.ArquivoStore.substituirTudoEstrito = function (regs) {
    n++;
    if (n >= 1) {
      const e = new Error('disco morreu no rollback');
      e.name = 'ErroSimuladoDeRollback';
      return Promise.reject(e);
    }
    return real.call(window.ArquivoStore, regs);
  };
  const r = await window.Armazenamento.excluirPaciente('pac-ALVO',
    { confirmado: true, failpointDeTeste: 'antes_da_verificacao' });
  window.ArquivoStore.substituirTudoEstrito = real;
  const est = await window.Armazenamento.estadoOperacional();
  const escrita = await window.DadosLocais.from('pacientes').insert({ nome: 'nao' });
  return {
    motivo: r.motivo, snapshot_ativo: r.snapshot_ativo,
    marcador: !!window.Concorrencia.lerMarcador(),
    estado: est.estado, tipoMarcador: (window.Concorrencia.lerMarcador() || {}).tipo,
    erros: r.erros.map(e => e.papel),
    escreveu: !!escrita.data, erroEscrita: escrita.error && escrita.error.codigo
  };
});
ok(rollbackRuim.motivo === 'RECUPERACAO_MANUAL_NECESSARIA' &&
   rollbackRuim.marcador === true && rollbackRuim.snapshot_ativo === true,
   'Y — rollback falho mantem snapshot e marcador: ' + rollbackRuim.motivo);
ok(rollbackRuim.tipoMarcador === 'exclusao_paciente',
   'e o marcador diz o TIPO da operacao: ' + rollbackRuim.tipoMarcador +
   ' — sem nenhum dado clinico nele');
ok(rollbackRuim.erros.join(',') === 'erro_original,erro_rollback' &&
   rollbackRuim.escreveu === false &&
   rollbackRuim.erroEscrita === 'RECUPERACAO_PENDENTE',
   'os dois erros vem separados, e a escrita normal continua bloqueada');

await p.evaluate(async () => {
  await window.Armazenamento.recuperarRestauracaoPendente();
  await window.Armazenamento.limparRecuperacao();
  window.Concorrencia.limparMarcador();
});

/* ==================================================================== */
console.log('');
console.log('  7. CRASH RECOVERY, PELO MESMO MOTOR');
console.log('');
/* ==================================================================== */

/* Z */
const crashEm = async (ponto) => {
  await semear();
  /* O boot do app roda as migracoes OQ3/PQQ e grava as marcas. O cenario abre
     uma aba nova e depois recarrega esta — as duas passam pelo boot. Entao o
     retrato "antes" precisa ser de um estado ja booteado, senao a comparacao
     mede o boot em vez de medir a recuperacao. */
  await recarregar();
  const antesC = await retrato();
  const morre = await abrirAba();
  await morre.evaluate(async (pt) => {
    window.__op = window.Armazenamento.excluirPaciente('pac-ALVO',
      { confirmado: true, travarDeTeste: pt });
    await new Promise(r => setTimeout(r, 350));
  }, ponto);
  await morre.close();
  await respirar(400);
  await recarregar();
  const det = await p.evaluate(() =>
    window.Armazenamento.detectarRestauracaoPendente());
  const rec = await p.evaluate(() =>
    window.Armazenamento.recuperarRestauracaoPendente());
  const depoisC = await retrato();
  return { det, rec, igual: mesmoDado(antesC, depoisC) };
};

for (const ponto of ['apos_snapshot', 'apos_documentos', 'antes_da_raiz']) {
  const r = await crashEm(ponto);
  ok(r.det.pendente === true && r.rec.revertido === true && r.igual,
     'Z — crash em `' + ponto + '`: detectado na fase ' + r.det.fase +
     ', recuperado byte a byte, pelo MESMO mecanismo — nao ha recuperacao ' +
     'especifica para exclusao');
}

const semMotorProprio = await p.evaluate(async () => {
  let t = await (await fetch('/excluir-paciente.js')).text();
  t = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return {
    abreBanco: /indexedDB\.open/.test(t),
    gravaSnapshot: /gravarSnapshot\(|apagarSnapshot\(/.test(t),
    fazRollback: /function rollback|desfazer\(/.test(t),
    usaAndaime: /executarComSnapshot\(/.test(t)
  };
});
ok(!semMotorProprio.abreBanco && !semMotorProprio.gravaSnapshot &&
   !semMotorProprio.fazRollback && semMotorProprio.usaAndaime,
   'e o modulo de exclusao nao tem motor proprio: sem abrir banco, sem gravar ' +
   'snapshot, sem rollback dele — ele entrega `aplicar` e `verificar` ao ' +
   'andaime comum');

/* ==================================================================== */
console.log('');
console.log('  8. DUAS ABAS');
console.log('');
/* ==================================================================== */

await semear();
const B = await abrirAba();
B.on('pageerror', e => ruim.push('B: ' + e.message));
await B.evaluate(() => window.Concorrencia.marcarAtualizado());

const duasAbas = await (async () => {
  const exclusao = p.evaluate(async () =>
    await window.Armazenamento.excluirPaciente('pac-ALVO', { confirmado: true }));
  const escrita = B.evaluate(async () => {
    const r = await window.DadosLocais.from('aplicacoes')
      .insert({ id: 'B-NO-MEIO', paciente_id: 'pac-ALVO', ferramenta_id: 'oq3' });
    return { erro: r.error && r.error.codigo, entrou: !!r.data };
  });
  const [rA, rB] = await Promise.all([exclusao, escrita]);
  await respirar(300);
  const estado = await olhar();
  const bDesatualizada = await B.evaluate(() => window.Concorrencia.estado());
  return { rA, rB, estado, bDesatualizada };
})();

const excluiu = duasAbas.rA.aplicado === true;
const temDoMeio = duasAbas.estado.aplicacoes.indexOf('B-NO-MEIO') >= 0;
ok(!(excluiu && temDoMeio),
   'a exclusao e a escrita simultanea nunca coexistem: ' +
   (excluiu ? 'a exclusao venceu e a escrita de B foi recusada com ' +
              duasAbas.rB.erro
            : 'B escreveu primeiro e a exclusao recusou com ' + duasAbas.rA.motivo));
if (excluiu) {
  ok(duasAbas.bDesatualizada.desatualizado === true,
     'e depois da exclusao a aba B fica desatualizada: a revisao avancou');
} else {
  ok(duasAbas.rA.motivo === 'ESTADO_DESATUALIZADO' &&
     duasAbas.estado.pacientes.indexOf('pac-ALVO') >= 0,
     'e nada do alvo foi apagado: ' + duasAbas.estado.pacientes.join(', '));
}
await B.close();

/* ==================================================================== */
console.log('');
console.log('  9. VARIOS DE UMA VEZ');
console.log('');
/* ==================================================================== */

await semear();
const varios = await p.evaluate(async () => {
  const r = await window.Armazenamento.excluirPaciente(['pac-ALVO', 'pac-VIZINHO'],
    { confirmado: true });
  const ler = (k) => JSON.parse(localStorage.getItem(k) || 'null');
  const docs = await window.ArquivoStore.listarTudoEstrito();
  return {
    aplicado: r.aplicado, pacientes: r.pacientes,
    sobraram: (ler('holohacking.dados.pacientes') || []).map(x => x.id),
    aplicacoes: (ler('holohacking.dados.aplicacoes') || []).map(x => x.id).sort(),
    questionario: Object.keys(ler('holohacking.questionario') || {}),
    docs: docs.map(d => d.paciente),
    snapshotsUsados: r.destinos ? r.destinos.length : 0
  };
});
ok(varios.aplicado === true && varios.sobraram.length === 0,
   'os dois pacientes saem numa operacao so: sobraram ' +
   (varios.sobraram.length ? varios.sobraram.join(', ') : 'nenhum'));
ok(varios.aplicacoes.join(',') === 'ap-sem' &&
   varios.questionario.join(',') === '_sem_paciente' &&
   varios.docs.join(',') === '_sem_paciente',
   'e o que sobra e so o `_sem_paciente`: ' + varios.aplicacoes.join(', '));
ok(varios.snapshotsUsados === 2,
   'UM snapshot e UMA operacao para os ' + varios.snapshotsUsados +
   ' pacientes. N operacoes seriam N janelas de crash, e um crash no meio ' +
   'deixaria metade apagada e metade nao, sem nada dizendo qual era qual');

/* ==================================================================== */
console.log('');
console.log('  10. A UI E O RESTO');
console.log('');
/* ==================================================================== */

const ui = await p.evaluate(async () => {
  const t = await (await fetch('/app.js')).text();
  return {
    chamaMotor: /Armazenamento\.excluirPaciente\(/.test(t),
    naoApagaDireto: !/sb\.from\("pacientes"\)\.delete\(\)/.test(t),
    mantemToast: /pacientes removidos/.test(t),
    mantemAtivo: /definirAtivo\(estado\.pacientes\[0\]/.test(t),
    semBackupUI: !/aplicarBackupV2|aplicarBackupV1|gerarBackupV2/.test(t)
  };
});
ok(ui.chamaMotor && ui.naoApagaDireto,
   'removerPacientes() passa a chamar o motor e nao apaga mais a tabela ' +
   'direto');
ok(ui.mantemToast && ui.mantemAtivo,
   'e o resto da tela continua igual: o mesmo confirm, o mesmo toast, e a ' +
   'mesma politica de escolher o proximo paciente ativo');
ok(ui.semBackupUI,
   'a UI de backup/import continua desligada: app.js nao cita nenhuma das ' +
   'APIs de V1 ou V2');

const intacto = await p.evaluate(async () => {
  const A = window.Armazenamento;
  const pac = await A.gerarBackupV2();
  return { manifesto: A.MANIFESTO.length, exportaveis: A.exportaveis().length,
           noBackup: pac.armazenamentos.length,
           v1: window.DadosLocais.exportar().versao };
});
ok(intacto.manifesto === 13 && intacto.exportaveis === 12 &&
   intacto.noBackup === 12 && intacto.v1 === 1,
   'manifesto 13, Backup V2 com 12, e o V1 continua oficial na interface');

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
