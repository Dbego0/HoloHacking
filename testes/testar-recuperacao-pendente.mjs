/**
 * GUARDA DE OPERACAO INCOMPLETA — P0.7b
 *
 * O Web Lock resolve "quem escreve agora", e o navegador o libera quando a aba
 * morre. Isso e uma virtude e tambem o buraco: se a aba morreu NO MEIO de uma
 * restauracao, o lock some, o estado fica pela metade, e a proxima aba pede o
 * lock, consegue na hora, e escreve em cima de um disco que ninguem sabe
 * descrever.
 *
 *     O lock protege o INSTANTE.
 *     O marcador protege o INTERVALO entre o crash e a recuperacao.
 *
 * Por isso um e efemero e o outro e persistente, e por isso nenhum substitui o
 * outro. Sao TRES conceitos separados de proposito:
 *
 *     REVISAO      "outro contexto alterou dados"
 *     ANUNCIO      "uma aba viva esta operando agora"
 *     MARCADOR     "uma operacao ficou pela metade"
 *
 * A ordem e o que da sentido a tudo: snapshot commitado -> marcador ->
 * primeira mutacao. Crash antes do marcador nao deixa pendencia, porque nada
 * foi tocado. Crash depois deixa, e qualquer escrita normal descobre.
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
const ruim = [];
A.on('pageerror', e => ruim.push('A: ' + e.message));
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };
const respirar = (ms) => new Promise(r => setTimeout(r, ms || 250));

const semear = (pg) => pg.evaluate(async () => {
  localStorage.clear();
  await window.Armazenamento.limparRecuperacao();
  const itens = await window.ArquivoStore.listarTudoEstrito();
  for (const i of itens) await window.ArquivoStore.remover(i.id);
  const g = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const P = 'holohacking.dados.';
  g(P + 'pacientes', [{ id: 'pac-LOCAL', nome: 'Antes' }]);
  ['aplicacoes', 'consultas', 'bloqueios', 'holoscope', 'oq3', 'pqq', 'perfil']
    .forEach(t => g(P + t, []));
  g('holohacking.questionario', { 'pac-LOCAL': { m1: 1 } });
  g('holohacking.pontuacao', {});
  g('holohacking.exames', { 'pac-LOCAL': { ferritina: 9 } });
  localStorage.setItem('holohacking.aparencia', 'escuro');
  const b = new Blob(['doc local'], { type: 'text/plain' });
  b.name = 'local.txt';
  await window.ArquivoStore.salvar('pac-LOCAL', b, { nome: 'Local', tipo: 'Outro' });
  return true;
});

/* um pacote V2 valido para restaurar */
const pacote = await (async () => {
  await A.evaluate(async () => {
    localStorage.clear();
    const itens = await window.ArquivoStore.listarTudoEstrito();
    for (const i of itens) await window.ArquivoStore.remover(i.id);
    const g = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    const P = 'holohacking.dados.';
    g(P + 'pacientes', [{ id: 'pac-PACOTE', nome: 'Do pacote' }]);
    ['aplicacoes', 'consultas', 'bloqueios', 'holoscope', 'oq3', 'pqq', 'perfil']
      .forEach(t => g(P + t, []));
    g('holohacking.questionario', {});
    g('holohacking.pontuacao', {});
    g('holohacking.exames', {});
  });
  return await A.evaluate(() => window.Armazenamento.gerarBackupV2());
})();

const OPERACIONAIS = ['holohacking.revisao', 'holohacking.operacao-em-curso',
                      'holohacking.operacao_critica'];
const retrato = (pg) => pg.evaluate(async (fora) => {
  const ls = {};
  Object.keys(localStorage).sort().forEach(k => {
    if (fora.indexOf(k) === -1) ls[k] = localStorage.getItem(k);
  });
  const docs = await window.ArquivoStore.listarTudoEstrito();
  return { ls, docs: docs.map(d => d.id).sort(),
           aparencia: localStorage.getItem('holohacking.aparencia') };
}, OPERACIONAIS);
const mesmoDado = (x, y) => JSON.stringify(x) === JSON.stringify(y);

/* ==================================================================== */
console.log('');
console.log('  1. O MARCADOR NAO E DADO, E NAO E O LOCK');
console.log('');
/* ==================================================================== */

await semear(A);

/* A, B */
const separacao = await A.evaluate(async () => {
  const Ar = window.Armazenamento, C = window.Concorrencia;
  const pac = await Ar.gerarBackupV2();
  return {
    manifesto: Ar.MANIFESTO.length,
    exportaveis: Ar.exportaveis().length,
    noBackup: pac.armazenamentos.length,
    citaMarcador: JSON.stringify(pac).indexOf('operacao_critica') >= 0,
    noManifesto: Ar.MANIFESTO.some(e => e.id === 'operacao_critica'),
    operacionais: C.OPERACIONAIS.map(o => ({ id: o.id, chave: o.chave,
      exportar: o.exportar, importar: o.importar, pacienteScoped: o.pacienteScoped })),
    chaveMarcador: C.CHAVE_MARCADOR, chaveAnuncio: C.CHAVE_ANUNCIO,
    chaveRevisao: C.CHAVE_REVISAO, nomeLock: C.NOME_LOCK
  };
});
ok(separacao.manifesto === 13 && separacao.exportaveis === 12 &&
   separacao.noBackup === 12 && !separacao.noManifesto,
   'A — o marcador NAO faz parte do manifesto: 13 armazenamentos e 12 ' +
   'exportaveis, como antes');
ok(!separacao.citaMarcador,
   'B — e nao entra no Backup V2: a string "operacao_critica" nao aparece no ' +
   'pacote');
const marc = separacao.operacionais.filter(o => o.id === 'operacao_critica')[0];
ok(marc && marc.exportar === false && marc.importar === false &&
   marc.pacienteScoped === false,
   'ele e operacional: nao exporta, nao importa, nao e por paciente');
ok(separacao.chaveMarcador !== separacao.chaveAnuncio &&
   separacao.chaveMarcador !== separacao.chaveRevisao &&
   separacao.operacionais.length === 3,
   'V — os tres conceitos continuam separados: revisao (' +
   separacao.chaveRevisao + '), anuncio (' + separacao.chaveAnuncio +
   ') e marcador (' + separacao.chaveMarcador + ') — mais o Web Lock "' +
   separacao.nomeLock + '", que nao e chave nenhuma');

/* ==================================================================== */
console.log('');
console.log('  2. A ORDEM: SNAPSHOT, MARCADOR, MUTACAO');
console.log('');
/* ==================================================================== */

/* C, D — crash ENTRE o commit do snapshot e o marcador */
await semear(A);
const antesC = await retrato(A);
const entreOsDois = await A.evaluate(async (pac) => {
  window.__op = window.Armazenamento.aplicarBackupV2(pac,
    { travarDeTeste: 'antes_do_marcador' });
  await new Promise(r => setTimeout(r, 300));
  const C = window.Concorrencia;
  const snap = await window.Armazenamento.lerSnapshotOperacional();
  const est = await window.Armazenamento.estadoOperacional();
  return { marcador: C.lerMarcador(), temSnapshot: !!snap,
           estado: est.estado, podeEscrever: est.pode_escrever,
           mensagem: est.mensagem };
}, pacote);
const depoisC = await retrato(A);

ok(entreOsDois.temSnapshot === true && entreOsDois.marcador === null,
   'C — o snapshot commitou ANTES do marcador: neste instante ha snapshot e ' +
   'nao ha marcador');
ok(mesmoDado(antesC, depoisC),
   'D — e NENHUMA mutacao aconteceu ainda: o estado esta byte a byte igual. ' +
   'E por isso que o marcador vem depois do snapshot e antes da primeira ' +
   'escrita');

/* R — e esse estado tem nome */
ok(entreOsDois.estado === 'snapshot_sem_marcador' &&
   entreOsDois.podeEscrever === true,
   'R — o detector classifica: ' + entreOsDois.estado + ', e escrever ' +
   'continua permitido — nao ha o que desfazer');
ok(/nao ha o que desfazer/.test(entreOsDois.mensagem),
   'e explica por que: "' + entreOsDois.mensagem.slice(0, 110) + '…"');

/* limpa o snapshot orfao para seguir */
await A.reload({ waitUntil: 'networkidle2' });
await A.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await A.evaluate(() => window.Armazenamento.limparRecuperacao());

/* ==================================================================== */
console.log('');
console.log('  3. O CENARIO REAL: A MORRE, B TENTA ESCREVER');
console.log('');
/* ==================================================================== */

await semear(A);
/* O boot do app roda as migracoes OQ3/PQQ e grava as marcas. A aba que vai
   comparar depois sera uma aba NOVA, que tambem passa pelo boot — entao o
   retrato "antes" precisa ser de um estado ja booteado, senao a comparacao
   mede o boot em vez de medir a recuperacao. */
await A.reload({ waitUntil: 'networkidle2' });
await A.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
const antesCrash = await retrato(A);

/* E, F — A trava no meio do localStorage e a ABA E FECHADA */
const abaQueMorre = await abrirAba();
await abaQueMorre.evaluate(async (pac) => {
  window.__op = window.Armazenamento.aplicarBackupV2(pac,
    { travarDeTeste: 'apos_localstorage_5' });
  await new Promise(r => setTimeout(r, 400));
}, pacote);
const marcadorAntesDeMorrer = await abaQueMorre.evaluate(() =>
  window.Concorrencia.lerMarcador());
await abaQueMorre.close();
await respirar(500);

ok(marcadorAntesDeMorrer && marcadorAntesDeMorrer.tipo === 'restauracao',
   'E — a operacao travou no meio do localStorage e deixou marcador: fase=' +
   marcadorAntesDeMorrer.fase);

/* B agora: o lock esta livre, mas o estado nao esta */
const B = await abrirAba();
B.on('pageerror', e => ruim.push('B: ' + e.message));

const lockLivre = await B.evaluate(async () => {
  const r = await window.Concorrencia.comExclusividade('so_testando',
    async () => 'consegui', { naoEsperar: true });
  return { ok: r.ok, resultado: r.resultado };
});
ok(lockLivre.ok === true,
   'F — o navegador LIBEROU o Web Lock quando a aba morreu: B o obtem na hora');

/* G a L — e mesmo assim B nao escreve */
const bloqueios = await B.evaluate(async () => {
  const saida = {};
  const C = window.Concorrencia;

  saida.guarda = (() => {
    const v = C.podeEscrever({ ignorarRevisao: true });
    return { ok: v.ok, codigo: v.codigo };
  })();

  const r1 = await window.DadosLocais.from('aplicacoes')
    .insert({ paciente_id: 'p', ferramenta_id: 'oq3' });
  saida.aplicacoes = { erro: r1.error && r1.error.codigo, data: r1.data };

  const r2 = await window.DadosLocais.from('consultas').insert({ paciente_id: 'p' });
  saida.consultas = { erro: r2.error && r2.error.codigo, data: r2.data };

  const r3 = await window.DadosLocais.from('pacientes').insert({ nome: 'novo' });
  saida.pacientes = { erro: r3.error && r3.error.codigo, data: r3.data };

  const r4 = await window.DadosLocais.from('perfil').insert({ nome: 'nutri' });
  saida.perfil = { erro: r4.error && r4.error.codigo, data: r4.data };

  /* questionario e exames escrevem direto, mas consultam a mesma guarda pelo
     modulo — aqui se cobra a guarda que eles usariam */
  saida.questionario = C.podeEscrever({ ignorarRevisao: true }).codigo;
  saida.exames = C.podeEscrever({ ignorarRevisao: true }).codigo;

  /* documentos: IndexedDB */
  const blob = new Blob(['x'], { type: 'text/plain' }); blob.name = 'x.txt';
  try {
    await window.ArquivoStore.salvar('p', blob, { nome: 'X', tipo: 'Outro' });
    saida.documentos = { erro: null, entrou: true };
  } catch (e) {
    saida.documentos = { erro: e.codigo || e.name, entrou: false };
  }
  /* a guarda tem que recusar ANTES de tocar no banco — entao o id nem
     precisa existir para a tentativa valer */
  try {
    await window.ArquivoStore.remover('qualquer-id');
    saida.remover = { erro: null };
  } catch (e) {
    saida.remover = { erro: e.codigo || e.name };
  }
  return saida;
});

ok(bloqueios.guarda.ok === false && bloqueios.guarda.codigo === 'RECUPERACAO_PENDENTE',
   'G — B nao consegue escrever: ' + bloqueios.guarda.codigo);
ok(bloqueios.aplicacoes.erro === 'RECUPERACAO_PENDENTE' &&
   bloqueios.aplicacoes.data === null,
   'H — aplicacao bloqueada, sem escrever');
ok(bloqueios.questionario === 'RECUPERACAO_PENDENTE', 'I — questionario bloqueado');
ok(bloqueios.exames === 'RECUPERACAO_PENDENTE', 'J — exames bloqueados');
ok(bloqueios.documentos.erro === 'RECUPERACAO_PENDENTE' &&
   bloqueios.documentos.entrou === false,
   'K — documento no IndexedDB bloqueado: ' + bloqueios.documentos.erro +
   '. Anexar laudo enquanto outra aba deixou uma restauracao pela metade e ' +
   'escrever num disco cujo estado ninguem sabe descrever');
ok(bloqueios.remover.erro === 'RECUPERACAO_PENDENTE',
   'e remover documento tambem');
ok(bloqueios.consultas.erro === 'RECUPERACAO_PENDENTE' &&
   bloqueios.pacientes.erro === 'RECUPERACAO_PENDENTE' &&
   bloqueios.perfil.erro === 'RECUPERACAO_PENDENTE',
   'L — consultas, pacientes e perfil idem: as 8 tabelas passam pelo mesmo ' +
   'funil, entao a guarda vale para todas');

/* uma nova restauracao tambem e recusada */
const outraRestauracao = await B.evaluate(async (pac) => {
  const r = await window.Armazenamento.aplicarBackupV2(pac);
  return { motivo: r.motivo, escreveu: r.escreveu };
}, pacote);
ok(outraRestauracao.motivo === 'RECUPERACAO_PENDENTE' &&
   outraRestauracao.escreveu === false,
   'e uma nova restauracao tambem recusa: tirar um snapshot do estado atual ' +
   'seria congelar a bagunca');

/* M, N, O — a recuperacao e permitida, limpa o marcador, e libera */
const recuperou = await B.evaluate(async () => {
  const antes = await window.Armazenamento.estadoOperacional();
  const r = await window.Armazenamento.recuperarRestauracaoPendente();
  const depois = await window.Armazenamento.estadoOperacional();
  return {
    estadoAntes: antes.estado, recuperavel: antes.recuperavel,
    revertido: r.revertido, motivo: r.motivo,
    estadoDepois: depois.estado, podeDepois: depois.pode_escrever,
    marcador: window.Concorrencia.lerMarcador(),
    snapshot: !!(await window.Armazenamento.lerSnapshotOperacional())
  };
});
ok(recuperou.estadoAntes === 'recuperacao_pendente' && recuperou.recuperavel === true,
   'M — o detector diz `' + recuperou.estadoAntes + '` e que da para recuperar');
ok(recuperou.revertido === true && recuperou.motivo === 'RECUPERADO',
   'e a recuperacao E permitida, mesmo com a guarda barrando tudo o resto');
ok(recuperou.marcador === null && recuperou.snapshot === false,
   'N — no sucesso o marcador E o snapshot saem: ' +
   JSON.stringify(recuperou.marcador));
ok(recuperou.estadoDepois === 'normal' && recuperou.podeDepois === true,
   'e o estado volta a ' + recuperou.estadoDepois);

const depoisRecuperar = await retrato(B);
const diff = Object.keys(antesCrash.ls)
  .concat(Object.keys(depoisRecuperar.ls))
  .filter((k, i, a) => a.indexOf(k) === i)
  .filter(k => antesCrash.ls[k] !== depoisRecuperar.ls[k]);
ok(mesmoDado(antesCrash, depoisRecuperar),
   'o estado anterior voltou byte a byte, incluindo os documentos: ' +
   depoisRecuperar.docs.length + ' documento(s)' +
   (diff.length ? ' | DIVERGIU em: ' + diff.map(k => k + ' (' +
     JSON.stringify((antesCrash.ls[k] || '').slice(0, 60)) + ' -> ' +
     JSON.stringify((depoisRecuperar.ls[k] || '').slice(0, 60)) + ')').join(' · ')
     : ' | docs: ' + antesCrash.docs.join(',') + ' -> ' +
       depoisRecuperar.docs.join(',')));

/* O — escrita volta a funcionar */
const voltou = await B.evaluate(async () => {
  window.Concorrencia.marcarAtualizado();
  const r = await window.DadosLocais.from('pacientes').insert({ id: 'depois', nome: 'Depois' });
  return { erro: r.error, entrou: !!r.data };
});
ok(!voltou.erro && voltou.entrou,
   'O — e a escrita normal volta a funcionar');

await B.close();

/* ==================================================================== */
console.log('');
console.log('  4. OS OUTROS PONTOS DE CRASH');
console.log('');
/* ==================================================================== */

const crashEm = async (ponto) => {
  await semear(A);
  const morre = await abrirAba();
  await morre.evaluate(async (args) => {
    window.__op = window.Armazenamento.aplicarBackupV2(args.pac,
      { travarDeTeste: args.ponto });
    await new Promise(r => setTimeout(r, 350));
  }, { pac: pacote, ponto });
  await morre.close();
  await respirar(400);
  const C = await abrirAba();
  const r = await C.evaluate(async () => {
    const est = await window.Armazenamento.estadoOperacional();
    const pode = window.Concorrencia.podeEscrever({ ignorarRevisao: true });
    const escrita = await window.DadosLocais.from('pacientes').insert({ nome: 'x' });
    const rec = await window.Armazenamento.recuperarRestauracaoPendente();
    return { estado: est.estado, fase: est.fase, pode: pode.ok,
             codigo: pode.codigo, escreveu: !!escrita.data,
             recuperou: rec.revertido };
  });
  await C.close();
  return r;
};

for (const ponto of ['apos_snapshot', 'apos_indexeddb', 'apos_localstorage_0',
                     'antes_da_verificacao']) {
  const r = await crashEm(ponto);
  ok(r.estado === 'recuperacao_pendente' && r.pode === false &&
     r.codigo === 'RECUPERACAO_PENDENTE' && r.escreveu === false &&
     r.recuperou === true,
     'crash em `' + ponto + '`: estado=' + r.estado + ' (fase ' + r.fase +
     '), escrita bloqueada, e recuperado');
}

/* ==================================================================== */
console.log('');
console.log('  5. ROLLBACK FALHO E ESTADOS INCONSISTENTES');
console.log('');
/* ==================================================================== */

/* P — rollback bem-sucedido limpa o marcador */
await semear(A);
const rollbackOk = await A.evaluate(async (pac) => {
  const r = await window.Armazenamento.aplicarBackupV2(pac,
    { failpointDeTeste: 'antes_da_verificacao' });
  return { revertido: r.revertido,
           marcador: window.Concorrencia.lerMarcador(),
           snapshot: !!(await window.Armazenamento.lerSnapshotOperacional()),
           pode: window.Concorrencia.podeEscrever({ ignorarRevisao: true }).ok };
}, pacote);
ok(rollbackOk.revertido === true && rollbackOk.marcador === null &&
   rollbackOk.snapshot === false && rollbackOk.pode === true,
   'P — rollback bem-sucedido limpa o marcador e o snapshot, e libera a escrita');

/* Q — rollback falho MANTEM o marcador */
await semear(A);
const rollbackRuim = await A.evaluate(async (pac) => {
  const real = window.ArquivoStore.substituirTudoEstrito;
  let n = 0;
  window.ArquivoStore.substituirTudoEstrito = function (regs) {
    n++;
    if (n >= 2) {
      const e = new Error('disco morreu no rollback');
      e.name = 'ErroSimuladoDeRollback';
      return Promise.reject(e);
    }
    return real.call(window.ArquivoStore, regs);
  };
  const r = await window.Armazenamento.aplicarBackupV2(pac,
    { failpointDeTeste: 'antes_da_verificacao' });
  window.ArquivoStore.substituirTudoEstrito = real;
  const est = await window.Armazenamento.estadoOperacional();
  const escrita = await window.DadosLocais.from('pacientes').insert({ nome: 'nao' });
  return {
    motivo: r.motivo, revertido: r.revertido,
    marcador: window.Concorrencia.lerMarcador(),
    snapshot: !!(await window.Armazenamento.lerSnapshotOperacional()),
    estado: est.estado, fase: est.fase, jaTentou: est.ja_tentou_rollback,
    escreveu: !!escrita.data, erroEscrita: escrita.error && escrita.error.codigo
  };
}, pacote);

ok(rollbackRuim.motivo === 'RECUPERACAO_MANUAL_NECESSARIA' &&
   rollbackRuim.revertido === false,
   'Q — o rollback falhou: ' + rollbackRuim.motivo);
ok(rollbackRuim.marcador !== null && rollbackRuim.snapshot === true,
   'e o marcador E o snapshot PERMANECEM: os dois sao a unica saida, e ' +
   'joga-los fora aqui seria destrui-la');
ok(rollbackRuim.estado === 'recuperacao_pendente' &&
   rollbackRuim.fase === 'rollback_falhou' && rollbackRuim.jaTentou === true,
   'o estado continua pendente, na fase ' + rollbackRuim.fase +
   ', e quem for tentar de novo sabe que uma tentativa ja falhou');
ok(rollbackRuim.escreveu === false &&
   rollbackRuim.erroEscrita === 'RECUPERACAO_PENDENTE',
   'e a aplicacao NAO continua gravando em cima de um estado cuja recuperacao ' +
   'falhou: ' + rollbackRuim.erroEscrita);

/* limpa o estado grave */
await A.evaluate(async () => {
  await window.Armazenamento.recuperarRestauracaoPendente();
  await window.Armazenamento.limparRecuperacao();
  window.Concorrencia.limparMarcador();
});

/* S — marcador sem snapshot */
await semear(A);
const semSnapshot = await A.evaluate(async () => {
  /* fixture inconsistente de proposito: marcador sem o snapshot que ele
     promete. Na ordem que o codigo usa isso nao consegue acontecer — so por
     corrupcao ou por alguem mexer na mao. */
  window.Concorrencia.marcarOperacaoIncompleta({
    id: 'restauracao-atual', tipo: 'restauracao',
    fase: 'aplicando_localstorage', snapshot_id: 'restauracao-atual'
  });
  const est = await window.Armazenamento.estadoOperacional();
  const pode = window.Concorrencia.podeEscrever({ ignorarRevisao: true });
  const escrita = await window.DadosLocais.from('pacientes').insert({ nome: 'x' });
  const rec = await window.Armazenamento.recuperarRestauracaoPendente();
  return {
    estado: est.estado, codigo: est.codigo, pode: pode.ok,
    recuperavel: est.recuperavel, mensagem: est.mensagem,
    escreveu: !!escrita.data, erroEscrita: escrita.error && escrita.error.codigo,
    recMotivo: rec.motivo
  };
});
ok(semSnapshot.estado === 'marcador_sem_snapshot' &&
   semSnapshot.codigo === 'ESTADO_OPERACIONAL_INCONSISTENTE',
   'S — marcador sem snapshot e classificado: ' + semSnapshot.codigo);
ok(semSnapshot.pode === false && semSnapshot.escreveu === false &&
   semSnapshot.erroEscrita === 'RECUPERACAO_PENDENTE',
   'e impede escrita — nao da para recuperar o que nao foi guardado, e ' +
   'escrever por cima seria escrever sobre um estado que ninguem sabe ' +
   'descrever');
ok(semSnapshot.recuperavel === false,
   'e o detector NAO finge que ha restauracao possivel: recuperavel=false');

await A.evaluate(() => window.Concorrencia.limparMarcador());

/* ==================================================================== */
console.log('');
console.log('  6. STORAGE EVENT E APARENCIA');
console.log('');
/* ==================================================================== */

/* T */
await semear(A);
const D = await abrirAba();
await D.evaluate(() => {
  window.__avisos = [];
  window.Concorrencia.aoMudar(e => window.__avisos.push(e.tipo));
});
await A.evaluate(() => window.Concorrencia.marcarOperacaoIncompleta({
  id: 'x', tipo: 'restauracao', fase: 'aplicando_localstorage', snapshot_id: 'x'
}));
await respirar(400);
const avisouCriar = await D.evaluate(() => ({
  avisos: window.__avisos.slice(),
  pendente: window.Concorrencia.estado().recuperacao_pendente
}));
await A.evaluate(() => window.Concorrencia.limparMarcador());
await respirar(400);
const avisouLimpar = await D.evaluate(() => ({
  avisos: window.__avisos.slice(),
  pendente: window.Concorrencia.estado().recuperacao_pendente
}));

ok(avisouCriar.avisos.indexOf('recuperacao_pendente') >= 0 &&
   avisouCriar.pendente === true,
   'T — quando outra aba cria o marcador, esta recebe `recuperacao_pendente`');
ok(avisouLimpar.avisos.indexOf('recuperacao_encerrada') >= 0 &&
   avisouLimpar.pendente === false,
   'e `recuperacao_encerrada` quando ele sai: ' + avisouLimpar.avisos.join(', '));

/* U */
const antesTema = await D.evaluate(() => window.Concorrencia.estado());
await A.evaluate(() => localStorage.setItem('holohacking.aparencia', 'claro'));
await respirar(300);
const depoisTema = await D.evaluate(() => window.Concorrencia.estado());
ok(depoisTema.recuperacao_pendente === false &&
   depoisTema.desatualizado === antesTema.desatualizado &&
   depoisTema.revisao_no_disco === antesTema.revisao_no_disco,
   'U — a aparencia continua independente: mudar o tema nao cria marcador ' +
   'nem mexe na revisao');
await D.close();

/* ==================================================================== */
console.log('');
console.log('  7. APAGAR TUDO');
console.log('');
/* ==================================================================== */

/* estado normal: apagarTudo leva marcador e snapshot junto */
await semear(A);
const apagouNormal = await A.evaluate(async () => {
  await window.Armazenamento.limparRecuperacao();
  window.Concorrencia.limpar();
  const bancos = typeof indexedDB.databases === 'function'
    ? (await indexedDB.databases()).map(d => d.name) : null;
  return {
    marcador: localStorage.getItem('holohacking.operacao_critica'),
    revisao: localStorage.getItem('holohacking.revisao'),
    bancos: bancos
  };
});
ok(apagouNormal.marcador === null && apagouNormal.revisao === null &&
   (apagouNormal.bancos === null ||
    apagouNormal.bancos.indexOf('holohacking-recuperacao') === -1),
   'em estado normal, limpar leva marcador, revisao e o banco operacional: ' +
   'bancos restantes = ' +
   (apagouNormal.bancos ? apagouNormal.bancos.join(', ') : 'indisponivel'));

/* com pendencia: o caminho e explicito, nao silencioso */
const caminhoExplicito = await A.evaluate(async () => {
  const t = await (await fetch('/perfil.js')).text();
  return {
    avisaAntes: /Havia uma restauração incompleta/.test(t),
    leOMarcador: /lerMarcador\(\)/.test(t),
    limpaDepois: /limparRecuperacao\(\)/.test(t) && /Concorrencia\.limpar\(\)/.test(t)
  };
});
ok(caminhoExplicito.leOMarcador && caminhoExplicito.avisaAntes &&
   caminhoExplicito.limpaDepois,
   'e com pendencia o caminho e EXPLICITO: apagarTudo le o marcador, avisa ' +
   'que havia uma restauracao incompleta e que nao havera como recuperar, e ' +
   'so entao apaga tudo junto. Seguir em silencio seria esconder que houve ' +
   'uma operacao pela metade');

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
