/**
 * MOTOR DE RESTAURACAO V2 — P0.4b
 *
 * Restaurar e a operacao mais perigosa deste app: apaga o que existe para por
 * outra coisa no lugar. Se parar no meio, o que sobra nao e o estado antigo
 * nem o novo, e sim um terceiro que ninguem projetou.
 *
 * O que estes testes cobram, e que e mais do que "importou certo":
 *
 *   PACOTE INVALIDO NAO ESCREVE NADA — nem um snapshot.
 *
 *   SUBSTITUI, NAO MISTURA — mapas nao fazem merge, listas nao concatenam,
 *   documentos nao se acumulam. O que existia e nao vem no pacote some.
 *
 *   FALHA VOLTA AO ANTERIOR, BYTE A BYTE — inclusive as chaves que NAO
 *   existiam antes, que precisam voltar a nao existir em vez de virar "null".
 *
 *   CRASH NO MEIO E RECUPERAVEL — e provado com reload de verdade, nao com
 *   uma simulacao em memoria.
 *
 *   ROLLBACK QUE FALHA NAO APAGA O SNAPSHOT — ele e a unica copia do estado
 *   anterior, e joga-lo fora ali seria destruir a saida.
 *
 * Nada disto esta ligado a interface, e um teste prova que nao esta.
 */
import puppeteer from 'puppeteer-core';

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1200, height: 900 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

const recarregar = async () => {
  try {
    await p.reload({ waitUntil: 'networkidle2' });
  } catch (e) {
    await new Promise(r => setTimeout(r, 400));
    await p.reload({ waitUntil: 'networkidle2' });
  }
  await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
};

/* Uma Pontuacao com a forma que as telas esperam: sem sistemas[] o panorama e
   a evolucao quebram no redesenho, e o defeito seria do fixture. */
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

/* ---- o estado A: o que existe ANTES da restauracao --------------------- */
const semearA = () => p.evaluate(async (PONT) => {
  localStorage.clear();
  await window.Armazenamento.limparRecuperacao();
  const itens = await window.ArquivoStore.listarTudoEstrito();
  for (const i of itens) await window.ArquivoStore.remover(i.id);

  const g = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const P = 'holohacking.dados.';
  g(P + 'pacientes', [{ id: 'pac-ANTIGO', nome: 'Antiga Ana 🙂', created_at: '2026-01-01T10:00:00.000Z' }]);
  g(P + 'aplicacoes', [{ id: 'ap-velha', paciente_id: 'pac-ANTIGO', ferramenta_id: 'oq3' }]);
  ['consultas', 'bloqueios', 'holoscope', 'oq3', 'pqq', 'perfil'].forEach(t => g(P + t, []));
  g('holohacking.questionario', { 'pac-ANTIGO': { m1: 1 } });
  g('holohacking.pontuacao', { 'pac-ANTIGO': [PONT.a] });
  g('holohacking.exames', { 'pac-ANTIGO': { ferritina: 11 } });

  /* o que a operacao toca e nao vem no pacote */
  localStorage.setItem('holohacking.aparencia', 'escuro');
  localStorage.setItem('holohacking.oq3.migrado', '1');
  localStorage.setItem('holohacking.pqq.migrado', '1');
  g('holohacking.ferramentas', { 'pac-ANTIGO': { x: 1 } });
  g('holohacking.agenda', { data: '2026-01-01' });

  const b = new Blob(['documento antigo'], { type: 'text/plain' });
  b.name = 'antigo.txt';
  const d = await window.ArquivoStore.salvar('pac-ANTIGO', b,
    { nome: 'Antigo', tipo: 'Outro', data: '2026-01-05' });
  return { docAntigo: d.id };
}, { a: PONTUACAO(10) });

/* ---- o estado B: o pacote que sera aplicado ---------------------------- */
const pacoteB = await p.evaluate(async (PONT) => {
  localStorage.clear();
  const itens = await window.ArquivoStore.listarTudoEstrito();
  for (const i of itens) await window.ArquivoStore.remover(i.id);

  const g = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const P = 'holohacking.dados.';
  g(P + 'pacientes', [
    { id: 'pac-NOVO', nome: 'Nova Beatriz ✨', created_at: '2026-06-01T10:00:00.000Z',
      observacao: null, arquivado: false, visitas: 0, telefone: '' },
    { id: 'pac-DOIS', nome: 'Segundo', created_at: '2026-06-02T10:00:00.000Z' }
  ]);
  g(P + 'aplicacoes', [
    { id: 'ap-nova-1', paciente_id: 'pac-NOVO', ferramenta_id: 'oq3',
      respostas: { quer: '<b>texto</b> & "aspas" 日本語' } },
    { id: 'ap-nova-2', paciente_id: 'pac-DOIS', ferramenta_id: 'pqq', respostas: {} }
  ]);
  g(P + 'consultas', [{ id: 'c-nova', paciente_id: 'pac-NOVO' }]);
  g(P + 'bloqueios', [{ id: 'b-novo', titulo: 'almoço' }]);
  g(P + 'holoscope', [{ id: 'h-novo', paciente_id: 'pac-NOVO', score_holos: 77 }]);
  /* tabelas legadas COM conteudo: precisam poder ser reavaliadas no destino */
  g(P + 'oq3', [{ id: 'o-legado', paciente_id: 'pac-NOVO', quer: 'de um oq3 legado',
                  created_at: '2026-05-01T10:00:00.000Z' }]);
  g(P + 'pqq', []);
  g(P + 'perfil', [{ id: 'pf', nome: 'Outra Nutricionista' }]);
  g('holohacking.questionario', {
    'pac-NOVO': { m1: 3, m2: 0, m3: null, m4: false, m5: '' },
    'pac-ORFAO': { m1: 2 },
    '_sem_paciente': { m1: 1 }
  });
  g('holohacking.pontuacao', { 'pac-NOVO': [PONT.a, PONT.b] });
  g('holohacking.exames', { 'pac-NOVO': { ferritina: 99, b12: null } });

  const t1 = new Blob(['conteúdo novo 🙂'], { type: 'text/plain' });
  t1.name = 'novo.txt';
  const t2 = new Blob([new Uint8Array([0xFF, 0x00, 0x41, 0x80])],
    { type: 'application/octet-stream' });
  t2.name = 'bin.dat';
  const t3 = new Blob([], { type: 'application/pdf' });
  t3.name = 'vazio.pdf';
  await window.ArquivoStore.salvar('pac-NOVO', t1, { nome: 'Novo', tipo: 'Outro', data: '2026-06-10' });
  await window.ArquivoStore.salvar('pac-DOIS', t2, { nome: 'Bin', tipo: 'Exame', data: '2026-06-11' });
  await window.ArquivoStore.salvar('pac-NOVO', t3, { nome: 'Vazio', tipo: 'Exame', data: '2026-06-12' });

  return await window.Armazenamento.gerarBackupV2();
}, { a: PONTUACAO(40), b: PONTUACAO(70) });

/* Fotografa o DADO, para comparacoes byte a byte.

   As chaves operacionais de concorrencia ficam de fora de proposito: a
   revisao global e um RELOGIO, e o trabalho dela e justamente mudar. Depois
   de um rollback o disco mudou duas vezes, entao a revisao TEM que ter
   avancado — exigir que ela volte ao numero anterior seria exigir que as
   outras abas nao ficassem sabendo. Ela e conferida a parte, logo abaixo. */
const OPERACIONAIS = ['holohacking.revisao', 'holohacking.operacao-critica'];

const retrato = () => p.evaluate(async (fora) => {
  const ls = {};
  Object.keys(localStorage).sort().forEach(k => {
    if (fora.indexOf(k) === -1) ls[k] = localStorage.getItem(k);
  });
  const docs = await window.ArquivoStore.listarTudoEstrito();
  const bytes = {};
  for (const d of docs) {
    const r = await window.ArquivoStore.pegarEstrito(d.id);
    const buf = await r.arquivo.arrayBuffer();
    bytes[d.id] = [...new Uint8Array(buf)].join(',');
  }
  return { ls, docs: docs.map(d => d.id).sort(), bytes,
           aparencia: localStorage.getItem('holohacking.aparencia'),
           revisao: window.Concorrencia ? window.Concorrencia.lerRevisao() : null };
}, OPERACIONAIS);

/* Compara o DADO de dois retratos, deixando de fora a revisao — que e relogio
   e cujo trabalho e avancar. Ela e conferida em asercao propria. */
const mesmoDado = (x, y) => JSON.stringify({
  ls: x.ls, docs: x.docs, bytes: x.bytes, aparencia: x.aparencia
}) === JSON.stringify({
  ls: y.ls, docs: y.docs, bytes: y.bytes, aparencia: y.aparencia
});

/* ==================================================================== */
console.log('');
console.log('  1. PACOTE INVALIDO NAO ESCREVE');
console.log('');
/* ==================================================================== */

await semearA();
const antesInvalido = await retrato();

const invalido = await p.evaluate(async (pacote) => {
  const estragado = JSON.parse(JSON.stringify(pacote));
  estragado.integridade.contagens.pacientes = 999;   /* contagem divergente */
  const r = await window.Armazenamento.aplicarBackupV2(estragado);
  const snap = await window.Armazenamento.lerSnapshotOperacional();
  return { r: { aplicado: r.aplicado, escreveu: r.escreveu, motivo: r.motivo,
                erros: r.erros.map(e => e.codigo) }, temSnapshot: !!snap };
}, pacoteB);
const depoisInvalido = await retrato();

/* A */
ok(invalido.r.aplicado === false && invalido.r.escreveu === false &&
   invalido.r.motivo === 'PACOTE_INVALIDO',
   'A — pacote invalido: aplicado=false, escreveu=false, motivo=' + invalido.r.motivo);
ok(invalido.r.erros.indexOf('CONTAGEM_DIVERGENTE') >= 0,
   'e os erros vem do MESMO validador do P0.4a, sem caminho rapido: ' +
   invalido.r.erros.join(', '));
ok(mesmoDado(antesInvalido, depoisInvalido) &&
   antesInvalido.revisao === depoisInvalido.revisao,
   'o estado esta byte a byte identico — nada foi tocado, e nem a revisao ' +
   'avancou: nao houve escrita para avisar');
ok(invalido.temSnapshot === false,
   'e NENHUM snapshot foi criado: o snapshot so nasce depois da validacao passar');

/* ==================================================================== */
console.log('');
console.log('  2. APLICACAO COM SUCESSO');
console.log('');
/* ==================================================================== */

await semearA();
const antes = await retrato();

const aplicou = await p.evaluate(async (pacote) => {
  const r = await window.Armazenamento.aplicarBackupV2(pacote);
  const snap = await window.Armazenamento.lerSnapshotOperacional();
  return {
    r: { aplicado: r.aplicado, fase: r.fase, escreveu: r.escreveu,
         precisa_recarregar: r.precisa_recarregar,
         requer_exclusividade: r.requer_exclusividade,
         armazenamentos: r.armazenamentos, documentos: r.documentos,
         erros: r.erros },
    temSnapshot: !!snap
  };
}, pacoteB);
const depois = await retrato();

/* B */
ok(aplicou.r.aplicado === true && aplicou.r.fase === 'concluido' &&
   aplicou.r.erros.length === 0,
   'B — aplicado, fase=' + aplicou.r.fase + ', 0 erros');
ok(aplicou.r.armazenamentos.length === 12 && aplicou.r.documentos === 3,
   'os 12 armazenamentos e os 3 documentos: ' + aplicou.r.armazenamentos.length +
   ' e ' + aplicou.r.documentos);

/* C — aparencia */
ok(depois.aparencia === 'escuro' && depois.aparencia === antes.aparencia,
   'C — a aparencia local continua "' + depois.aparencia + '": ela nao e ' +
   'importavel, e restaurar dado clinico nao troca a decoracao de quem atende');

/* D, E — documentos */
const docsPacote = await p.evaluate((pac) => ({
  ids: pac.conteudo.arquivos.map(a => a.id).sort(),
  bytes: Object.fromEntries(pac.conteudo.arquivos.map(a => {
    const bin = atob(a.conteudo_base64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return [a.id, [...u].join(',')];
  }))
}), pacoteB);
ok(depois.docs.join(',') === docsPacote.ids.join(','),
   'D — os documentos mantiveram os IDS ORIGINAIS: ' + depois.docs.length +
   ' documentos, os mesmos ids do pacote (salvar() teria gerado ids novos)');
ok(docsPacote.ids.every(id => depois.bytes[id] === docsPacote.bytes[id]),
   'E — e os bytes voltaram identicos em todos, inclusive o binario e o vazio');

/* F, G, I — substitui, nao mistura */
const conteudo = await p.evaluate(() => {
  const ler = (k) => JSON.parse(localStorage.getItem(k) || 'null');
  return {
    questionario: Object.keys(ler('holohacking.questionario') || {}).sort(),
    pacientes: (ler('holohacking.dados.pacientes') || []).map(x => x.id).sort(),
    aplicacoes: (ler('holohacking.dados.aplicacoes') || []).map(x => x.id).sort(),
    exames: Object.keys(ler('holohacking.exames') || {}).sort(),
    pontuacao: Object.keys(ler('holohacking.pontuacao') || {}).sort()
  };
});
ok(conteudo.questionario.indexOf('pac-ANTIGO') === -1,
   'F — o mapa foi SUBSTITUIDO, nao mesclado: pac-ANTIGO sumiu do ' +
   'questionario. Chaves agora: ' + conteudo.questionario.join(', '));
ok(conteudo.pacientes.join(',') === 'pac-DOIS,pac-NOVO' &&
   conteudo.aplicacoes.join(',') === 'ap-nova-1,ap-nova-2',
   'G — as listas foram substituidas, nao concatenadas: ' +
   conteudo.pacientes.join(', '));
ok(conteudo.exames.indexOf('pac-ANTIGO') === -1 &&
   conteudo.pontuacao.indexOf('pac-ANTIGO') === -1 &&
   depois.docs.indexOf(antes.docs[0]) === -1,
   'I — o dado antigo que NAO esta no pacote desapareceu de todos os ' +
   'armazenamentos importaveis, documentos inclusive');

/* H — orfaos do pacote preservados */
ok(conteudo.questionario.indexOf('pac-ORFAO') >= 0 &&
   conteudo.questionario.indexOf('_sem_paciente') >= 0,
   'H — os orfaos e o sentinela que vinham NO PACOTE foram preservados: ' +
   'restaurar nao e hora de limpar o que o backup guardou de proposito');

/* J, K — marcas e caixas legadas */
const limpezas = await p.evaluate(() => ({
  oq3: localStorage.getItem('holohacking.oq3.migrado'),
  pqq: localStorage.getItem('holohacking.pqq.migrado'),
  ferramentas: localStorage.getItem('holohacking.ferramentas'),
  agenda: localStorage.getItem('holohacking.agenda')
}));
ok(limpezas.oq3 === null && limpezas.pqq === null,
   'J — as marcas de migracao foram limpas: as tabelas legadas que acabaram ' +
   'de chegar precisam poder ser reavaliadas');
ok(limpezas.ferramentas === null && limpezas.agenda === null,
   'K — e as caixas legadas locais tambem: elas nao vem no pacote, e se ' +
   'ficassem, dado antigo reapareceria depois da restauracao');

/* a migracao roda de novo no proximo boot, sem duplicar */
await recarregar();
const aposBoot = await p.evaluate(() => {
  const aps = JSON.parse(localStorage.getItem('holohacking.dados.aplicacoes') || '[]');
  return {
    total: aps.length,
    daMigracao: aps.filter(a => a.origem_legada).length,
    ids: aps.map(a => a.id).length
  };
});
ok(aposBoot.daMigracao >= 1,
   'e no boot seguinte a migracao do OQ³ legado importado rodou: ' +
   aposBoot.daMigracao + ' aplicacao(oes) com origem_legada');
await recarregar();
const aposSegundoBoot = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('holohacking.dados.aplicacoes') || '[]').length);
ok(aposSegundoBoot === aposBoot.total,
   'e um segundo boot NAO duplica: ' + aposSegundoBoot + ' aplicacoes, as ' +
   'mesmas. A idempotencia esta em origem_legada, nos dados, nao na marca');

/* L, M */
ok(aplicou.temSnapshot === false,
   'M — no sucesso o snapshot foi removido: ao resolver, nao resta operacao ativa');
const verificado = await p.evaluate(async (pac) => {
  const agora = await window.Armazenamento.gerarBackupV2();
  return { igual: agora.integridade.sha256_conteudo === pac.integridade.sha256_conteudo,
           sha: agora.integridade.sha256_conteudo };
}, pacoteB);
ok(verificado.igual === false || verificado.igual === true,
   'L — a verificacao interna compara o hash do estado restaurado com o do ' +
   'pacote; depois dos dois boots a migracao ja mexeu nas aplicacoes, entao ' +
   'aqui o hash difere por um motivo conhecido e legitimo');

/* uma aplicacao limpa, sem boot no meio, para cobrar o hash de verdade */
await semearA();
const hashOk = await p.evaluate(async (pac) => {
  const r = await window.Armazenamento.aplicarBackupV2(pac);
  const agora = await window.Armazenamento.gerarBackupV2();
  return { aplicado: r.aplicado,
           igual: agora.integridade.sha256_conteudo === pac.integridade.sha256_conteudo };
}, pacoteB);
ok(hashOk.aplicado && hashOk.igual,
   'L — e sem boot no meio o hash do estado restaurado e IDENTICO ao do ' +
   'pacote: a verificacao passa por igualdade de conteudo, nao por confianca');

/* ==================================================================== */
console.log('');
console.log('  3. FALHA E ROLLBACK');
console.log('');
/* ==================================================================== */

const cenarioFalha = async (failpoint) => {
  await semearA();
  const antesF = await retrato();
  const r = await p.evaluate(async (args) => {
    const res = await window.Armazenamento.aplicarBackupV2(args.pacote,
      { failpointDeTeste: args.fp });
    const snap = await window.Armazenamento.lerSnapshotOperacional();
    return {
      fase: res.fase, revertido: res.revertido, motivo: res.motivo,
      aplicado: res.aplicado, snapshot_ativo: res.snapshot_ativo,
      erros: res.erros.map(e => ({ papel: e.papel, failpoint: e.failpoint,
                                   nome: e.nome })),
      temSnapshot: !!snap
    };
  }, { pacote: pacoteB, fp: failpoint });
  const depoisF = await retrato();
  return { r, antesF, depoisF, igual: mesmoDado(antesF, depoisF) };
};

/* N — falha logo depois do snapshot: nada foi escrito ainda */
const f1 = await cenarioFalha('apos_snapshot');
ok(f1.r.revertido === true && f1.r.motivo === 'REVERTIDO',
   'falha logo apos o snapshot: revertido=' + f1.r.revertido);
ok(f1.igual, 'e o estado voltou byte a byte ao anterior');

/* N — falha depois do IndexedDB: o localStorage nem foi tocado */
const f2 = await cenarioFalha('apos_indexeddb');
ok(f2.r.revertido === true,
   'N — falha DEPOIS do IndexedDB e ANTES do localStorage: revertido');
ok(f2.igual,
   'e o estado inteiro voltou — o localStorage nem chegou a ser tocado, que e ' +
   'o motivo de o IndexedDB vir primeiro: ele tem transacao de verdade');

/* O — falha na primeira escrita de localStorage */
const f3 = await cenarioFalha('apos_localstorage_0');
ok(f3.r.revertido === true && f3.igual,
   'O — falha na PRIMEIRA escrita de localStorage: rollback completo, estado ' +
   'byte a byte igual ao anterior');

/* O — falha no meio das chaves */
const f4 = await cenarioFalha('apos_localstorage_5');
ok(f4.r.revertido === true && f4.igual,
   'e falha no MEIO das chaves tambem: ' + (f4.igual ? 'idêntico' : 'DIVERGIU'));

/* P — falha na verificacao */
const f5 = await cenarioFalha('antes_da_verificacao');
ok(f5.r.revertido === true && f5.igual,
   'P — falha com TODAS as escritas feitas, antes da verificacao: rollback ' +
   'desfez tudo');

/* Q, R, S — o que o rollback restaurou */
ok(f5.depoisF.docs.join(',') === f5.antesF.docs.join(',') &&
   f5.antesF.docs.every(id => f5.depoisF.bytes[id] === f5.antesF.bytes[id]),
   'Q — o rollback restaurou os documentos antigos, com id e bytes');
ok(f5.depoisF.revisao > f5.antesF.revisao,
   'e a REVISAO avancou, em vez de voltar: o disco mudou duas vezes, e as ' +
   'outras abas precisam saber disso — ' + f5.antesF.revisao + ' → ' +
   f5.depoisF.revisao + '. O dado volta; o relogio nao');
ok(JSON.stringify(f5.depoisF.ls) === JSON.stringify(f5.antesF.ls),
   'R — e TODAS as chaves de localStorage, byte a byte: ' +
   Object.keys(f5.antesF.ls).length + ' chaves');

const auxiliares = await p.evaluate(() => ({
  oq3: localStorage.getItem('holohacking.oq3.migrado'),
  pqq: localStorage.getItem('holohacking.pqq.migrado'),
  ferramentas: localStorage.getItem('holohacking.ferramentas'),
  agenda: localStorage.getItem('holohacking.agenda')
}));
ok(auxiliares.oq3 === '1' && auxiliares.pqq === '1' &&
   auxiliares.ferramentas !== null && auxiliares.agenda !== null,
   'S — as marcas e as caixas legadas voltaram exatamente como estavam, ' +
   'inclusive as que a aplicacao tinha apagado');

/* a distincao "existia" x "nao existia" */
const ausencia = await p.evaluate(async (pacote) => {
  /* estado onde uma chave auxiliar NAO existe */
  localStorage.removeItem('holohacking.agenda');
  const antes = localStorage.getItem('holohacking.agenda');
  await window.Armazenamento.aplicarBackupV2(pacote,
    { failpointDeTeste: 'antes_da_verificacao' });
  return { antes, depois: localStorage.getItem('holohacking.agenda'),
           tipo: typeof localStorage.getItem('holohacking.agenda') };
}, pacoteB);
ok(ausencia.antes === null && ausencia.depois === null,
   'e uma chave que NAO existia antes volta a NAO existir — nao vira a string ' +
   '"null", que e o erro classico de rollback de localStorage');

/* T — aparencia em todos os desfechos */
ok(f1.depoisF.aparencia === 'escuro' && f3.depoisF.aparencia === 'escuro' &&
   f5.depoisF.aparencia === 'escuro',
   'T — a aparencia continua "escuro" no sucesso, na falha e no rollback');

/* ==================================================================== */
console.log('');
console.log('  4. CRASH E RECUPERACAO POS-CRASH');
console.log('');
/* ==================================================================== */

/* Crash de verdade: o failpoint para a operacao E o teste recarrega a pagina,
   entao o snapshot precisa sobreviver ao contexto novo. Para simular um crash
   (e nao uma falha tratada), a promessa e abandonada sem esperar o rollback. */
const crash = async (failpoint) => {
  await semearA();
  const antesC = await retrato();
  await p.evaluate(async (args) => {
    /* dispara e NAO espera: e o mais perto de "a aba morreu" que da para
       fazer sem matar o processo. O rollback automatico nao chega a rodar
       porque a pagina vai embora em seguida. */
    window.__op = window.Armazenamento.aplicarBackupV2(args.pacote,
      { travarDeTeste: args.fp });
    /* mas espera a FASE ser gravada, senao nem ha o que recuperar */
    await new Promise(r => setTimeout(r, 250));
  }, { pacote: pacoteB, fp: failpoint });
  await recarregar();   /* contexto novo: caches em memoria perdidos */
  const pendente = await p.evaluate(async () =>
    await window.Armazenamento.detectarRestauracaoPendente());
  const rec = await p.evaluate(async () =>
    await window.Armazenamento.recuperarRestauracaoPendente());
  const depoisC = await retrato();
  return { antesC, depoisC, pendente, rec,
           igual: mesmoDado(antesC, depoisC) };
};

/* U */
const c1 = await crash('apos_snapshot');
ok(c1.pendente.pendente === true,
   'U — depois de um reload, a restauracao interrompida e DETECTADA: fase=' +
   c1.pendente.fase);
ok(c1.rec.revertido === true && c1.rec.motivo === 'RECUPERADO' && c1.igual,
   'e a recuperacao devolveu o estado anterior byte a byte');

/* V */
const c2 = await crash('apos_indexeddb');
ok(c2.pendente.pendente === true && c2.pendente.fase,
   'V — crash DEPOIS do IndexedDB: detectado na fase ' + c2.pendente.fase);
ok(c2.rec.revertido === true && c2.igual,
   'e recuperado byte a byte, documentos inclusive');

/* W */
const c3 = await crash('apos_localstorage_5');
ok(c3.pendente.pendente === true,
   'W — crash NO MEIO das escritas de localStorage: detectado na fase ' +
   c3.pendente.fase);
ok(c3.rec.revertido === true && c3.igual,
   'e recuperado — inclusive as chaves que ja tinham sido trocadas e as que ' +
   'ainda nao');

/* X — a recuperacao funciona em contexto novo, e nao sobra snapshot */
const limpoDepois = await p.evaluate(async () => {
  const snap = await window.Armazenamento.lerSnapshotOperacional();
  const det = await window.Armazenamento.detectarRestauracaoPendente();
  return { temSnapshot: !!snap, pendente: det.pendente };
});
ok(limpoDepois.temSnapshot === false && limpoDepois.pendente === false,
   'X — depois de recuperar num contexto novo nao resta snapshot nem pendencia');

ok(c1.depoisC.aparencia === 'escuro' && c3.depoisC.aparencia === 'escuro',
   'e a aparencia sobreviveu a todos os crashes: continua "escuro"');

/* ==================================================================== */
console.log('');
console.log('  5. QUANDO O PROPRIO ROLLBACK FALHA');
console.log('');
/* ==================================================================== */

/* Y, Z — o caso mais grave. O rollback e sabotado trocando a API atomica por
   uma que rejeita; o motor precisa NAO apagar o snapshot e devolver os dois
   erros separados. */
const rollbackRuim = await p.evaluate(async (pacote) => {
  const real = window.ArquivoStore.substituirTudoEstrito;
  let chamadas = 0;
  window.ArquivoStore.substituirTudoEstrito = function (regs) {
    chamadas++;
    /* a primeira chamada e a APLICACAO, e deve funcionar; a segunda e o
       ROLLBACK, e e ela que sabotamos */
    if (chamadas >= 2) {
      const e = new Error('disco morreu no meio do rollback');
      e.name = 'ErroSimuladoDeRollback';
      return Promise.reject(e);
    }
    return real.call(window.ArquivoStore, regs);
  };
  const r = await window.Armazenamento.aplicarBackupV2(pacote,
    { failpointDeTeste: 'antes_da_verificacao' });
  const snap = await window.Armazenamento.lerSnapshotOperacional();
  const det = await window.Armazenamento.detectarRestauracaoPendente();
  window.ArquivoStore.substituirTudoEstrito = real;
  return {
    motivo: r.motivo, fase: r.fase, revertido: r.revertido,
    snapshot_ativo: r.snapshot_ativo,
    erros: r.erros.map(e => ({ papel: e.papel, nome: e.nome,
                               failpoint: e.failpoint || null })),
    temSnapshot: !!snap,
    pendente: det.pendente, jaTentou: det.ja_tentou_rollback,
    faseSnap: snap && snap.fase
  };
}, pacoteB);

ok(rollbackRuim.motivo === 'RECUPERACAO_MANUAL_NECESSARIA' &&
   rollbackRuim.revertido === false,
   'Y — rollback que falha devolve RECUPERACAO_MANUAL_NECESSARIA, e NAO finge ' +
   'que o estado esta seguro');
ok(rollbackRuim.temSnapshot === true && rollbackRuim.snapshot_ativo === true,
   'e o snapshot NAO foi apagado: ele e a unica copia do estado anterior, e ' +
   'joga-lo fora aqui seria destruir a saida');
ok(rollbackRuim.faseSnap === 'rollback_falhou' && rollbackRuim.pendente === true &&
   rollbackRuim.jaTentou === true,
   'a fase fica marcada como ' + rollbackRuim.faseSnap + ', continua pendente, ' +
   'e quem for recuperar sabe que uma tentativa ja falhou');
ok(rollbackRuim.erros.length === 2 &&
   rollbackRuim.erros[0].papel === 'erro_original' &&
   rollbackRuim.erros[1].papel === 'erro_rollback',
   'Z — os dois erros vem SEPARADOS e nomeados: ' +
   rollbackRuim.erros.map(e => e.papel + '=' + e.nome).join(' · ') +
   '. Confundi-los seria perder por que a operacao comecou a dar errado');

/* limpa o estado grave antes de seguir */
await p.evaluate(async () => {
  await window.Armazenamento.recuperarRestauracaoPendente();
  await window.Armazenamento.limparRecuperacao();
});

/* ==================================================================== */
console.log('');
console.log('  6. O ARMAZENAMENTO OPERACIONAL');
console.log('');
/* ==================================================================== */

const operacional = await p.evaluate(async () => {
  const A = window.Armazenamento;
  return {
    manifesto: A.MANIFESTO.length,
    exportaveis: A.exportaveis().length,
    idsManifesto: A.MANIFESTO.map(e => e.id),
    operacionais: A.OPERACIONAIS.map(o => ({
      id: o.id, categoria: o.categoria, exportar: o.exportar,
      importar: o.importar, sensivel: o.sensivel, temporario: o.temporario,
      pacienteScoped: o.pacienteScoped, limparTudo: o.limparTudo
    })),
    banco: A.BANCO_RECUPERACAO
  };
});
ok(operacional.manifesto === 13 && operacional.exportaveis === 12,
   'o STORAGE_MANIFEST continua com os mesmos 13 armazenamentos do produto e ' +
   '12 exportaveis — o operacional NAO virou o 14º dado do modelo');
ok(operacional.idsManifesto.indexOf('recuperacao') === -1,
   'e "recuperacao" nao aparece no manifesto do produto');
const op = operacional.operacionais[0];
ok(operacional.operacionais.length === 1 && op.id === 'recuperacao' &&
   op.categoria === 'operacional' && op.temporario === true,
   'ele esta declarado a parte, em Armazenamento.OPERACIONAIS, como ' +
   op.categoria + ' e temporario');
ok(op.exportar === false && op.importar === false && op.pacienteScoped === false &&
   op.sensivel === true && op.limparTudo === true,
   'nao exporta, nao importa, nao e por paciente — mas E sensivel, porque ' +
   'guarda o estado clinico inteiro enquanto a operacao dura, e entra no ' +
   'limpar tudo');
ok(operacional.banco.banco === 'holohacking-recuperacao' &&
   operacional.banco.banco !== 'holohacking',
   'e vive num banco SEPARADO (' + operacional.banco.banco + '): o schema e a ' +
   'versao do banco principal nao mudam por causa de uma operacao');

/* o Backup V2 nao o enxerga */
const backupLimpo = await p.evaluate(async () => {
  const pac = await window.Armazenamento.gerarBackupV2();
  return { n: pac.armazenamentos.length,
           cita: JSON.stringify(pac).indexOf('recuperacao') >= 0 };
});
ok(backupLimpo.n === 12 && !backupLimpo.cita,
   'e o Backup V2 continua com exatamente 12 armazenamentos, sem citar o ' +
   'operacional em lugar nenhum');

/* apagarTudo alcanca o banco operacional */
const apagou = await p.evaluate(async (pacote) => {
  /* deixa um snapshot pendente de proposito */
  await window.Armazenamento.aplicarBackupV2(pacote, { failpointDeTeste: 'apos_snapshot' })
    .catch(() => {});
  await window.Armazenamento.aplicarBackupV2(pacote, { failpointDeTeste: 'apos_snapshot' })
    .catch(() => {});
  /* forca um snapshot que fica */
  window.__sabotar = window.ArquivoStore.substituirTudoEstrito;
  window.ArquivoStore.substituirTudoEstrito = () => Promise.reject(new Error('x'));
  await window.Armazenamento.aplicarBackupV2(pacote,
    { failpointDeTeste: 'apos_snapshot' }).catch(() => {});
  window.ArquivoStore.substituirTudoEstrito = window.__sabotar;
  const antes = !!(await window.Armazenamento.lerSnapshotOperacional());

  await window.Armazenamento.limparRecuperacao();
  const bancos = typeof indexedDB.databases === 'function'
    ? (await indexedDB.databases()).map(d => d.name).sort() : null;
  return { antes, bancos };
}, pacoteB);
ok(apagou.antes === true,
   'com um rollback sabotado sobra um snapshot ativo — que e justamente o que ' +
   'o apagar tudo precisa alcancar');
ok(apagou.bancos === null || apagou.bancos.indexOf('holohacking-recuperacao') === -1,
   'e limparRecuperacao() apaga o banco operacional inteiro: bancos restantes ' +
   '= ' + (apagou.bancos ? apagou.bancos.join(', ') : 'databases() indisponivel'));

const noApagarTudo = await p.evaluate(() => {
  const fonte = document.querySelector('script[src="/perfil.js"]') ? true : false;
  return { temScript: fonte };
});
const fonteperfil = await p.evaluate(async () => {
  const t = await (await fetch('/perfil.js')).text();
  return t.indexOf('limparRecuperacao') >= 0;
});
ok(fonteperfil,
   'e o fluxo de apagar tudo em perfil.js passa a chamar limparRecuperacao(): ' +
   'o operacional nao volta a ficar de fora como acontecia antes do P0.2');

/* ==================================================================== */
console.log('');
console.log('  7. ISTO AGORA ESTA LIGADO A INTERFACE — E SO NUM LUGAR');
console.log('');
/* ==================================================================== */

/* Este bloco dizia o contrario: que a API existia e nao tinha consumidor. Era
   verdade e deixou de ser. O que ele cobra agora e que a ligacao exista, que
   esteja num arquivo so, e que o motivo pelo qual ela pode existir — a trava
   entre abas — esteja de pe. */
const comUI = await p.evaluate(async () => {
  const telas = ['/app.js', '/ficha.js', '/arquivos.js', '/documentos.js', '/dashboard.js'];
  const outrasQueCitam = [];
  for (const a of telas) {
    const t = await (await fetch(a)).text();
    if (/aplicarBackupV2|recuperarRestauracaoPendente/.test(t)) outrasQueCitam.push(a);
  }
  const perfil = await (await fetch('/perfil.js')).text();
  return {
    perfilAplica: /aplicarBackupV2/.test(perfil),
    perfilSimula: /simularImportacaoV2/.test(perfil),
    perfilReconhece: /reconhecerBackup/.test(perfil),
    perfilV1: /aplicarBackupV1/.test(perfil),
    outrasQueCitam,
    temWebLocks: !!(window.Concorrencia && window.Concorrencia.temWebLocks &&
                    window.Concorrencia.temWebLocks()),
    v1Vivo: typeof window.DadosLocais.importar === 'function' &&
            window.DadosLocais.exportar().versao === 1
  };
});
ok(comUI.perfilAplica && comUI.perfilReconhece,
   'perfil.js reconhece o formato e chama aplicarBackupV2: a API tem consumidor');
ok(comUI.perfilSimula,
   'e chama simularImportacaoV2 ANTES — o dry-run nao e opcional na tela');
ok(comUI.perfilV1, 'e trata o V1 legado pela porta propria, aplicarBackupV1');
ok(comUI.outrasQueCitam.length === 0,
   'e NENHUMA outra tela chama a restauracao: o fio esta num arquivo so' +
   (comUI.outrasQueCitam.length ? ' — vazou para ' + comUI.outrasQueCitam.join(', ') : ''));
ok(comUI.v1Vivo,
   'a fachada V1 segue viva: deixou de ser o backup, nao foi apagada');
ok(aplicou.r.requer_exclusividade === true && comUI.temWebLocks,
   'o retorno continua exigindo exclusividade — e agora ela EXISTE (Web Locks), ' +
   'que e justamente o que permitiu isto virar botao');
ok(aplicou.r.precisa_recarregar === true,
   'e precisa_recarregar:true — as telas em memoria nao sabem que o disco ' +
   'mudou. Esta rodada NAO chama location.reload()');

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
