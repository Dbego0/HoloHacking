/**
 * COMPATIBILIDADE COM BACKUPS V1 — P0.5
 *
 * O V1 e o que `DadosLocais.exportar()` produz ate hoje: as 8 tabelas da
 * fachada, e so isso. Ele NUNCA guardou questionario, serie de pontuacoes,
 * exames nem documentos.
 *
 * A decisao que define esta etapa, e o que estes testes cobram:
 *
 *   NAO EXISTE O MODO "CONSERVADOR". Escrever as 8 tabelas e deixar
 *   questionario, exames e documentos como estao parece cuidadoso e produz
 *   exatamente o defeito que o P0.1 documentou: os cadastros passam a ser os
 *   do backup, as respostas continuam sendo as da instalacao, e cada resposta
 *   fica pendurada num paciente que talvez nem exista. O unico modo oferecido
 *   e a SUBSTITUICAO LIMPA.
 *
 *   VAZIO NAO E DADO INVENTADO. O V1 nao disse "nao havia exames"; ele nunca
 *   carregou exames. Preservar os locais seria fingir que pertenciam ao
 *   backup. O teste cobra que a API diga isso, com essas palavras.
 *
 *   NAO HA UM SEGUNDO MOTOR. A conversao produz um alvo V2 e entrega ao
 *   P0.4b: snapshot, rollback, crash recovery e exclusividade sao os mesmos,
 *   ja testados. O teste prova que o rollback devolve os quatro grupos locais
 *   que o V1 nem conhecia — porque o snapshot vem do disco, nao do pacote.
 *
 * O fixture principal e um V1 REAL, gerado pelo proprio app.
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
  try { await p.reload({ waitUntil: 'networkidle2' }); }
  catch (e) { await new Promise(r => setTimeout(r, 400)); await p.reload({ waitUntil: 'networkidle2' }); }
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

/* ---- O ESTADO X: rico, com os quatro grupos que o V1 nao leva ---------- */
const semearX = () => p.evaluate(async (PONT) => {
  localStorage.clear();
  await window.Armazenamento.limparRecuperacao();
  const itens = await window.ArquivoStore.listarTudoEstrito();
  for (const i of itens) await window.ArquivoStore.remover(i.id);

  const g = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const P = 'holohacking.dados.';
  g(P + 'pacientes', [
    { id: 'pac-X1', nome: 'Xênia ✨', created_at: '2026-01-01T10:00:00.000Z',
      observacao: null, arquivado: false, visitas: 0, telefone: '' },
    { id: 'pac-X2', nome: 'Segundo X', created_at: '2026-01-02T10:00:00.000Z' }
  ]);
  g(P + 'aplicacoes', [
    { id: 'ap-X1', paciente_id: 'pac-X1', ferramenta_id: 'oq3',
      respostas: { quer: '<b>livre</b> & "aspas" 日本語' }, campo_historico: 'preservar' },
    { id: 'ap-ORFA', paciente_id: 'pac-FANTASMA', ferramenta_id: 'pqq', respostas: {} }
  ]);
  g(P + 'consultas', [{ id: 'c-X', paciente_id: 'pac-X1' }]);
  g(P + 'bloqueios', [{ id: 'b-X', titulo: 'almoço' }]);
  g(P + 'holoscope', [{ id: 'h-X', paciente_id: 'pac-X1', score_holos: 55 }]);
  g(P + 'oq3', [{ id: 'o-legado', paciente_id: 'pac-X1', quer: 'de um oq3 legado',
                  created_at: '2026-05-01T10:00:00.000Z' }]);
  g(P + 'pqq', []);
  g(P + 'perfil', [{ id: 'pf-X', nome: 'Nutricionista X' }]);

  /* OS QUATRO GRUPOS QUE O V1 NUNCA LEVOU — ricos de proposito */
  g('holohacking.questionario', { 'pac-X1': { m1: 3, m2: 0, m3: null } });
  g('holohacking.pontuacao', { 'pac-X1': [PONT.a, PONT.b] });
  g('holohacking.exames', { 'pac-X1': { ferritina: 42, b12: null } });
  const b = new Blob(['laudo local'], { type: 'text/plain' });
  b.name = 'laudo.txt';
  await window.ArquivoStore.salvar('pac-X1', b,
    { nome: 'Laudo local', tipo: 'Exame', data: '2026-02-01' });

  /* e o que a operacao toca */
  localStorage.setItem('holohacking.aparencia', 'escuro');
  localStorage.setItem('holohacking.oq3.migrado', '1');
  localStorage.setItem('holohacking.pqq.migrado', '1');
  g('holohacking.ferramentas', { 'pac-X1': { x: 1 } });
  g('holohacking.agenda', { data: '2026-01-01' });
  return true;
}, { a: PONTUACAO(40), b: PONTUACAO(70) });

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
    bytes[d.id] = [...new Uint8Array(await r.arquivo.arrayBuffer())].join(',');
  }
  return { ls, docs: docs.map(d => d.id).sort(), bytes,
           aparencia: localStorage.getItem('holohacking.aparencia') };
}, OPERACIONAIS);

const mesmoDado = (x, y) => JSON.stringify(x) === JSON.stringify(y);

const estadoAtual = () => p.evaluate(() => {
  const ler = (k) => JSON.parse(localStorage.getItem(k) || 'null');
  return {
    pacientes: (ler('holohacking.dados.pacientes') || []).map(x => x.id).sort(),
    aplicacoes: (ler('holohacking.dados.aplicacoes') || []).map(x => x.id).sort(),
    questionario: Object.keys(ler('holohacking.questionario') || {}),
    pontuacao: Object.keys(ler('holohacking.pontuacao') || {}),
    exames: Object.keys(ler('holohacking.exames') || {}),
    aparencia: localStorage.getItem('holohacking.aparencia'),
    oq3migrado: localStorage.getItem('holohacking.oq3.migrado'),
    pqqmigrado: localStorage.getItem('holohacking.pqq.migrado'),
    ferramentas: localStorage.getItem('holohacking.ferramentas'),
    agenda: localStorage.getItem('holohacking.agenda')
  };
});

/* ==================================================================== */
console.log('');
console.log('  1. UM V1 DE VERDADE, FEITO PELO PROPRIO APP');
console.log('');
/* ==================================================================== */

await semearX();
const v1 = await p.evaluate(() => window.DadosLocais.exportar());

/* A, B */
const reconhecido = await p.evaluate(async (pac) => {
  const r = await window.Armazenamento.validarBackupV2(pac);
  const v = window.Armazenamento.validarBackupV1(pac);
  return { tipoV2: r.tipo, valido: v.valido, tipo: v.tipo,
           erros: v.erros.map(e => e.codigo),
           avisos: v.avisos.map(a => a.codigo),
           linhas: v.resumo.linhas,
           camposVistos: v.resumo.campos_vistos.aplicacoes };
}, v1);
ok(reconhecido.tipoV2 === 'v1_legado',
   'A — o V2 reconhece o pacote como `v1_legado`, nao como lixo');
ok(reconhecido.valido === true && reconhecido.erros.length === 0,
   'B — e validarBackupV1() o aprova: 0 erros');
ok(Object.keys(reconhecido.linhas).length === 8,
   'as 8 tabelas contadas: ' +
   Object.keys(reconhecido.linhas).map(t => t + '=' + reconhecido.linhas[t]).join(' '));
ok(reconhecido.camposVistos && reconhecido.camposVistos.campo_historico === 1,
   'campos desconhecidos DENTRO das linhas passam inteiros e sao listados — ' +
   'sao dado clinico historico, e reescrever o schema de um registro antigo e ' +
   'perder o que ele guardava');

/* Q — orfao dentro do proprio V1 */
ok(reconhecido.avisos.indexOf('ORFAO_PRESERVADO') >= 0,
   'Q — o orfao que ja estava no V1 vira AVISO, nao erro: nao inventamos o ' +
   'paciente e nao descartamos o dado');

/* C — o plano diz a perda antes de qualquer coisa */
const plano = await p.evaluate((pac) =>
  window.Armazenamento.planejarImportacaoV1(pac), v1);
ok(plano.modo_seguro === 'substituicao_limpa' && plano.rotulo === 'BACKUP PARCIAL LEGADO',
   'C — o plano se identifica como "' + plano.rotulo + '", modo ' +
   plano.modo_seguro + ' — nunca "backup completo"');
ok(plano.restaura.length === 8 &&
   plano.limpa_por_ausencia_no_formato.sort().join(',') ===
     'arquivos,exames,pontuacao,questionario',
   'restaura 8 tabelas e limpa os 4 que o formato nunca teve: ' +
   plano.limpa_por_ausencia_no_formato.join(', '));
ok(plano.preserva_local.join(',') === 'aparencia',
   'e preserva a aparencia local: ' + plano.preserva_local.join(', '));
ok(plano.perdas_conhecidas.length === 4 &&
   plano.perdas_conhecidas.every(x => /nunca guardou/.test(x.porque)),
   'cada perda diz POR QUE: "' + plano.perdas_conhecidas[0].porque + '" — nao e ' +
   'que o V1 dissesse que nao havia, e que o formato nunca carregou');
ok(plano.exige_confirmacao === true,
   'e o plano avisa que exige confirmacao: ' + plano.confirmacao);

/* a lista dos ausentes e DERIVADA, nao escrita a mao */
const derivada = await p.evaluate(() => {
  const A = window.Armazenamento;
  const naFachada = A.tabelasDaFachada();
  const ausentes = A.gruposAusentesNoV1();
  return { fachada: naFachada.length, ausentes: ausentes.length,
           soma: naFachada.length + ausentes.length,
           exportaveis: A.exportaveis().length };
});
ok(derivada.soma === derivada.exportaveis && derivada.fachada === 8 &&
   derivada.ausentes === 4,
   'e ela e DERIVADA do manifesto: 8 da fachada + 4 ausentes = ' +
   derivada.exportaveis + ' exportaveis. Nenhuma lista escrita a mao');

/* ==================================================================== */
console.log('');
console.log('  2. SEM CONFIRMACAO, NADA ACONTECE');
console.log('');
/* ==================================================================== */

/* D */
const antesSemConfirmar = await retrato();
const semConfirmar = await p.evaluate(async (pac) => {
  const r = await window.Armazenamento.aplicarBackupV1(pac);
  const snap = await window.Armazenamento.lerSnapshotOperacional();
  return { motivo: r.motivo, aplicado: r.aplicado, escreveu: r.escreveu,
           mensagem: r.mensagem, temSnapshot: !!snap };
}, v1);
const depoisSemConfirmar = await retrato();

ok(semConfirmar.motivo === 'CONFIRMACAO_RESTAURACAO_PARCIAL_OBRIGATORIA' &&
   semConfirmar.aplicado === false && semConfirmar.escreveu === false,
   'D — sem confirmacao: ' + semConfirmar.motivo);
ok(mesmoDado(antesSemConfirmar, depoisSemConfirmar) && !semConfirmar.temSnapshot,
   'e ZERO escrita — nem um snapshot');
ok(/questionario|exames/.test(semConfirmar.mensagem),
   'a mensagem lista o que sera perdido, em vez de so recusar: "' +
   semConfirmar.mensagem.slice(0, 90) + '…"');

/* ==================================================================== */
console.log('');
console.log('  3. A CONVERSAO PRODUZ UM V2 DE VERDADE');
console.log('');
/* ==================================================================== */

/* E */
const conversao = await p.evaluate(async (pac) => {
  const c = await window.Armazenamento.converterV1ParaV2Limpo(pac);
  const v = await window.Armazenamento.validarBackupV2(c.pacote);
  return {
    ok: c.ok,
    formato: c.pacote.formato, versao: c.pacote.versao,
    armazenamentos: c.pacote.armazenamentos.length,
    valido: v.valido, erros: v.erros.map(e => e.codigo),
    contagens: c.pacote.integridade.contagens,
    hashOk: /^[0-9a-f]{64}$/.test(c.pacote.integridade.sha256_conteudo),
    diagnostico: c.pacote.diagnostico,
    vazios: {
      questionario: JSON.stringify(c.pacote.conteudo.dados.questionario),
      pontuacao: JSON.stringify(c.pacote.conteudo.dados.pontuacao),
      exames: JSON.stringify(c.pacote.conteudo.dados.exames),
      arquivos: c.pacote.conteudo.arquivos.length
    },
    citaProveniencia: JSON.stringify(c.pacote).indexOf('v1_legado') >= 0
  };
}, v1);

ok(conversao.ok && conversao.formato === 'holohacking-backup' &&
   conversao.versao === 2 && conversao.armazenamentos === 12,
   'E — a conversao produz um pacote V2 com os 12 armazenamentos');
ok(conversao.valido === true && conversao.erros.length === 0,
   'e ele passa no proprio validarBackupV2(), sem nenhum erro');
ok(conversao.hashOk,
   'com hash SHA-256 calculado pela MESMA infraestrutura do gerador do disco — ' +
   'nao ha uma segunda implementacao de canonicalizacao nem de contagem');
ok(conversao.vazios.questionario === '{}' && conversao.vazios.pontuacao === '{}' &&
   conversao.vazios.exames === '{}' && conversao.vazios.arquivos === 0,
   'os quatro ausentes vao VAZIOS no alvo: {} {} {} e 0 documentos');
ok(conversao.diagnostico.quantidade_orfaos > 0,
   'e o diagnostico do pacote e calculado sobre o CONTEUDO DELE: acusa ' +
   conversao.diagnostico.quantidade_orfaos + ' orfao(s), o que ja vinha no V1');
ok(!conversao.citaProveniencia,
   'a proveniencia NAO foi enfiada no envelope V2: ele rejeita campo ' +
   'desconhecido, e mudar o schema so para carimbar origem custaria mais do ' +
   'que vale. Ela vive no plano e no retorno da operacao');

/* ==================================================================== */
console.log('');
console.log('  4. A RESTAURACAO LIMPA');
console.log('');
/* ==================================================================== */

await semearX();
const antesLimpa = await estadoAtual();
const aplicou = await p.evaluate(async (pac) => {
  const r = await window.Armazenamento.aplicarBackupV1(pac,
    { confirmarRestauracaoParcial: true });
  const snap = await window.Armazenamento.lerSnapshotOperacional();
  return {
    aplicado: r.aplicado, fase: r.fase,
    tipo_origem: r.tipo_origem, restauracao_parcial: r.restauracao_parcial,
    modo: r.modo, rotulo: r.rotulo,
    restaurados: r.restaurados, vazios: r.vazios_por_ausencia_no_formato,
    preservado: r.preservado_local, exclusividade: r.exclusividade,
    precisa_recarregar: r.precisa_recarregar,
    perdas: (r.perdas_conhecidas || []).length,
    temSnapshot: !!snap, erros: r.erros
  };
}, v1);
const depoisLimpa = await estadoAtual();

/* F a J */
ok(aplicou.aplicado === true && aplicou.fase === 'concluido',
   'aplicou, fase=' + aplicou.fase + ', ' + aplicou.erros.length + ' erros');
ok(depoisLimpa.pacientes.join(',') === 'pac-X1,pac-X2' &&
   depoisLimpa.aplicacoes.join(',') === 'ap-ORFA,ap-X1',
   'F — as 8 tabelas vieram do V1, intactas: ' + depoisLimpa.pacientes.join(', '));
const tabelasIguais = await p.evaluate((pac) => {
  const disco = {};
  Object.keys(pac.tabelas).forEach(t => {
    disco[t] = localStorage.getItem('holohacking.dados.' + t);
  });
  return Object.keys(pac.tabelas)
    .every(t => disco[t] === JSON.stringify(pac.tabelas[t]));
}, v1);
ok(tabelasIguais,
   'e byte a byte iguais ao que o V1 trazia — captura, nao transformacao');

ok(depoisLimpa.questionario.length === 0,
   'G — questionario VAZIO: ' + JSON.stringify(depoisLimpa.questionario));
ok(depoisLimpa.pontuacao.length === 0,
   'H — pontuacoes vazias');
ok(depoisLimpa.exames.length === 0,
   'I — exames vazios');
const docsDepois = await p.evaluate(async () =>
  (await window.ArquivoStore.listarTudoEstrito()).length);
ok(docsDepois === 0, 'J — documentos vazios: ' + docsDepois);

/* K */
ok(depoisLimpa.aparencia === 'escuro' && depoisLimpa.aparencia === antesLimpa.aparencia,
   'K — a aparencia local continua "' + depoisLimpa.aparencia + '"');

/* L — o hibrido antigo nao existe mais */
ok(depoisLimpa.questionario.length === 0 &&
   antesLimpa.questionario.length > 0,
   'L — o estado hibrido foi eliminado: antes havia questionario de pac-X1 ' +
   'preso a cadastros que iam ser trocados; agora nao ha resposta pendurada ' +
   'em paciente nenhum');

/* O — marcas e caixas legadas */
ok(depoisLimpa.oq3migrado === null && depoisLimpa.pqqmigrado === null &&
   depoisLimpa.ferramentas === null && depoisLimpa.agenda === null,
   'O — marcas de migracao e caixas legadas limpas, como no V2');

/* V — o retorno nao esconde a perda */
ok(aplicou.tipo_origem === 'v1_legado' && aplicou.restauracao_parcial === true &&
   aplicou.modo === 'substituicao_limpa' && aplicou.rotulo === 'BACKUP PARCIAL LEGADO',
   'V — o retorno declara: tipo_origem=' + aplicou.tipo_origem +
   ', restauracao_parcial=' + aplicou.restauracao_parcial + ', modo=' + aplicou.modo);
ok(aplicou.restaurados.length === 8 && aplicou.vazios.length === 4 &&
   aplicou.perdas === 4 && aplicou.preservado.join(',') === 'aparencia',
   'e lista o que foi restaurado (8), o que ficou vazio porque nunca existiu ' +
   'no formato (4) e o que foi preservado local (aparencia)');
ok(aplicou.precisa_recarregar === true && aplicou.exclusividade === 'web_locks',
   'precisa_recarregar=' + aplicou.precisa_recarregar + ', exclusividade=' +
   aplicou.exclusividade);
ok(aplicou.temSnapshot === false, 'e o snapshot foi removido no sucesso');

/* P — OQ³/PQQ do V1 sao reavaliados sem duplicar */
await recarregar();
const boot1 = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('holohacking.dados.aplicacoes') || '[]'));
await recarregar();
const boot2 = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('holohacking.dados.aplicacoes') || '[]'));
ok(boot1.some(a => a.origem_legada),
   'P — no boot seguinte o OQ³ legado que veio no V1 foi migrado: ' +
   boot1.filter(a => a.origem_legada).length + ' com origem_legada');
ok(boot2.length === boot1.length,
   'e um segundo boot NAO duplica: ' + boot2.length + ' aplicacoes, as mesmas');

/* ==================================================================== */
console.log('');
console.log('  5. ROUNDTRIP — e o que ele NAO promete');
console.log('');
/* ==================================================================== */

await semearX();
const xOriginal = await estadoAtual();
const v1DoX = await p.evaluate(() => window.DadosLocais.exportar());

/* muda tudo */
await p.evaluate(async () => {
  const g = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const P = 'holohacking.dados.';
  g(P + 'pacientes', [{ id: 'pac-OUTRO', nome: 'Completamente outro' }]);
  ['aplicacoes', 'consultas', 'bloqueios', 'holoscope', 'oq3', 'pqq', 'perfil']
    .forEach(t => g(P + t, []));
  g('holohacking.questionario', { 'pac-OUTRO': { m1: 1 } });
  g('holohacking.exames', { 'pac-OUTRO': { ferritina: 1 } });
});
const roundtrip = await p.evaluate(async (pac) => {
  const r = await window.Armazenamento.aplicarBackupV1(pac,
    { confirmarRestauracaoParcial: true });
  return { aplicado: r.aplicado };
}, v1DoX);
const xVolta = await estadoAtual();

ok(roundtrip.aplicado === true &&
   xVolta.pacientes.join(',') === xOriginal.pacientes.join(',') &&
   xVolta.aplicacoes.join(',') === xOriginal.aplicacoes.join(','),
   'as 8 tabelas voltam ao estado X: ' + xVolta.pacientes.join(', '));
ok(xVolta.questionario.length === 0 && xVolta.exames.length === 0 &&
   xOriginal.questionario.length > 0,
   'mas as quatro areas que o V1 nunca conteve ficam VAZIAS — o estado X ' +
   'tinha questionario e exames, e eles nao voltam. Isto NAO e restauracao ' +
   'completa de X, e a API nunca diz que e');

/* ==================================================================== */
console.log('');
console.log('  6. ROLLBACK E CRASH — pelo motor do P0.4b');
console.log('');
/* ==================================================================== */

/* M — o rollback devolve os quatro grupos que o V1 nem conhecia */
await semearX();
const antesRollback = await retrato();
const comFalha = await p.evaluate(async (pac) => {
  const r = await window.Armazenamento.aplicarBackupV1(pac,
    { confirmarRestauracaoParcial: true, failpointDeTeste: 'antes_da_verificacao' });
  return { revertido: r.revertido, motivo: r.motivo };
}, v1);
const depoisRollback = await retrato();
const estadoRollback = await estadoAtual();

ok(comFalha.revertido === true,
   'a restauracao V1 falhou e o rollback rodou: ' + comFalha.motivo);
ok(mesmoDado(antesRollback, depoisRollback),
   'M — e o estado voltou byte a byte, incluindo os QUATRO grupos que o V1 ' +
   'nem conhecia: o snapshot vem do disco local, nao do pacote');
ok(estadoRollback.questionario.length > 0 && estadoRollback.exames.length > 0 &&
   depoisRollback.docs.length > 0,
   'questionario, exames e documentos anteriores estao de volta: ' +
   estadoRollback.questionario.join(', ') + ' · ' + depoisRollback.docs.length +
   ' documento(s)');
ok(estadoRollback.oq3migrado === '1' && estadoRollback.ferramentas !== null,
   'e as marcas e caixas legadas tambem');

/* N — crash recovery, pelo mesmo mecanismo */
const crash = async (ponto) => {
  await semearX();
  const antesC = await retrato();
  await p.evaluate(async (args) => {
    window.__op = window.Armazenamento.aplicarBackupV1(args.pac,
      { confirmarRestauracaoParcial: true, travarDeTeste: args.ponto });
    await new Promise(r => setTimeout(r, 300));
  }, { pac: v1, ponto });
  await recarregar();
  const pendente = await p.evaluate(() =>
    window.Armazenamento.detectarRestauracaoPendente());
  const rec = await p.evaluate(() =>
    window.Armazenamento.recuperarRestauracaoPendente());
  const depoisC = await retrato();
  return { pendente, rec, igual: mesmoDado(antesC, depoisC) };
};

const c1 = await crash('apos_snapshot');
ok(c1.pendente.pendente === true && c1.rec.revertido === true && c1.igual,
   'N — crash apos o snapshot: detectado na fase ' + c1.pendente.fase +
   ' e recuperado byte a byte');
const c2 = await crash('apos_indexeddb');
ok(c2.pendente.pendente === true && c2.rec.revertido === true && c2.igual,
   'crash apos o IndexedDB: fase ' + c2.pendente.fase + ', recuperado');
const c3 = await crash('apos_localstorage_5');
ok(c3.pendente.pendente === true && c3.rec.revertido === true && c3.igual,
   'crash no meio do localStorage: fase ' + c3.pendente.fase + ', recuperado');

const semMotorProprio = await p.evaluate(async () => {
  let t = await (await fetch('/importar-v1.js')).text();
  /* Os comentarios do modulo FALAM de snapshot, lock e IndexedDB — justamente
     para dizer que ele nao os implementa. Medir a prosa daria o contrario do
     que se quer saber, entao os comentarios saem antes da conta. */
  t = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return {
    /* as PRIMITIVAS de cada mecanismo, nao as palavras */
    abreBanco: /indexedDB\.open/.test(t),
    lojaPropria: /objectStore\(|substituirTudoEstrito\(/.test(t),
    gravaSnapshot: /gravarSnapshot\(|lerSnapshot\(|apagarSnapshot\(/.test(t),
    pegaLock: /navigator\.locks|comExclusividade\(/.test(t),
    mexeNoDisco: /localStorage\.(setItem|removeItem|clear)/.test(t),
    chamaV2: /aplicarBackupV2\(/.test(t)
  };
});
ok(!semMotorProprio.abreBanco && !semMotorProprio.lojaPropria &&
   !semMotorProprio.gravaSnapshot && !semMotorProprio.pegaLock &&
   !semMotorProprio.mexeNoDisco && semMotorProprio.chamaV2,
   'e o modulo V1 NAO tem motor proprio — desconsiderando os comentarios, ele ' +
   'nao abre banco, nao toca em object store, nao grava snapshot, nao pede ' +
   'lock e nao escreve no localStorage. Ele converte e chama ' +
   'aplicarBackupV2(): o P0.4b faz o trabalho');

/* ==================================================================== */
console.log('');
console.log('  7. RECUSAS');
console.log('');
/* ==================================================================== */

/* R, S — malformados */
const malformados = await p.evaluate(async (bom) => {
  const A = window.Armazenamento;
  const clone = () => JSON.parse(JSON.stringify(bom));
  const casos = {};
  let c;
  /* uma tabela DE VERDADE: exames nunca esteve no V1, entao apagar "exames"
     de tabelas nao muda nada — foi assim que este caso passou batido na
     primeira versao deste teste */
  c = clone(); delete c.tabelas.consultas; casos.tabelaFaltando = c;
  c = clone(); delete c.tabelas.pacientes; casos.semPacientes = c;
  c = clone(); c.tabelas.inventada = []; casos.tabelaExtra = c;
  c = clone(); c.tabelas.consultas = {}; casos.naoEhArray = c;
  c = clone(); c.versao = '1'; casos.versaoString = c;
  c = clone(); delete c.tabelas; casos.semTabelas = c;
  c = clone(); c.tabelas.pacientes = [{ id: 42 }]; casos.idNumero = c;
  c = clone(); c.tabelas.pacientes = ['nao e objeto']; casos.linhaString = c;
  casos.jsonQualquer = { qualquer: 'coisa' };
  casos.arrayNaRaiz = [1, 2, 3];
  casos.ehV2 = { formato: 'holohacking-backup', versao: 2 };
  casos.poluicao = JSON.parse(
    '{"versao":1,"tabelas":{"pacientes":[{"id":"x","__proto__":{"hack":1}}]}}');

  const saida = {};
  for (const k of Object.keys(casos)) {
    const v = A.validarBackupV1(casos[k]);
    saida[k] = { valido: v.valido, cods: v.erros.map(e => e.codigo) };
  }
  saida.protoLimpo = ({}).hack === undefined;
  return saida;
}, v1);

['tabelaFaltando', 'semPacientes', 'tabelaExtra', 'naoEhArray', 'versaoString',
 'semTabelas', 'idNumero', 'linhaString', 'jsonQualquer', 'arrayNaRaiz',
 'ehV2', 'poluicao'].forEach(k => {
  ok(malformados[k].valido === false,
     'R — ' + k + ' recusado: ' + malformados[k].cods.join(', '));
});
ok(malformados.versaoString.cods.indexOf('CAMPO_TIPO_INVALIDO') >= 0,
   'e "1" nao e 1 — sem coercao silenciosa');
ok(malformados.ehV2.cods.indexOf('NAO_E_V1') >= 0,
   'um V2 mandado para ca tem codigo proprio, nao "malformado"');
ok(malformados.poluicao.cods.indexOf('CHAVE_PERIGOSA') >= 0 &&
   malformados.protoLimpo,
   'S — prototype pollution recusada, com Object.prototype intacto');

/* e nenhum deles escreve */
const antesRecusa = await retrato();
const nadaEscrito = await p.evaluate(async (bom) => {
  const A = window.Armazenamento;
  const c = JSON.parse(JSON.stringify(bom));
  delete c.tabelas.consultas;
  const r = await A.aplicarBackupV1(c, { confirmarRestauracaoParcial: true });
  const snap = await A.lerSnapshotOperacional();
  return { motivo: r.motivo, escreveu: r.escreveu, temSnapshot: !!snap };
}, v1);
const depoisRecusa = await retrato();
ok(nadaEscrito.motivo === 'PACOTE_V1_INVALIDO' && nadaEscrito.escreveu === false &&
   !nadaEscrito.temSnapshot && mesmoDado(antesRecusa, depoisRecusa),
   'e um V1 invalido nao escreve NADA, nem com confirmacao: ' +
   nadaEscrito.motivo);

/* T — sem Web Locks */
const semLocks = await (async () => {
  const C = await nav.newPage();
  await C.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
  });
  await C.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
  await C.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
  const r = await C.evaluate(async (pac) => {
    const antes = localStorage.getItem('holohacking.dados.pacientes');
    const res = await window.Armazenamento.aplicarBackupV1(pac,
      { confirmarRestauracaoParcial: true });
    const snap = await window.Armazenamento.lerSnapshotOperacional();
    return { motivo: res.motivo, escreveu: res.escreveu, aplicado: res.aplicado,
             intacto: localStorage.getItem('holohacking.dados.pacientes') === antes,
             temSnapshot: !!snap };
  }, v1);
  await C.close();
  return r;
})();
ok(semLocks.motivo === 'EXCLUSIVIDADE_NAO_SUPORTADA' &&
   semLocks.aplicado === false && semLocks.escreveu === false && semLocks.intacto &&
   !semLocks.temSnapshot,
   'T — sem navigator.locks o V1 recusa igual ao V2: ' + semLocks.motivo +
   ', zero escrita, nenhum snapshot');

/* U — duas abas */
const duasAbas = await (async () => {
  await semearX();
  const B = await nav.newPage();
  await B.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
  await B.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());

  const restauracao = p.evaluate(async (pac) =>
    await window.Armazenamento.aplicarBackupV1(pac,
      { confirmarRestauracaoParcial: true }), v1);
  const escrita = B.evaluate(async () => {
    const r = await window.DadosLocais.from('pacientes')
      .insert({ id: 'B-NO-MEIO', nome: 'durante' });
    return { erro: r.error && r.error.codigo, entrou: !!r.data };
  });
  const [rA, rB] = await Promise.all([restauracao, escrita]);
  const ids = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('holohacking.dados.pacientes') || '[]')
      .map(x => x.id).sort());
  await B.close();
  return { rA: { aplicado: rA.aplicado, motivo: rA.motivo }, rB, ids };
})();
const veioDoV1 = duasAbas.ids.indexOf('pac-X1') >= 0;
const temDoMeio = duasAbas.ids.indexOf('B-NO-MEIO') >= 0;
ok(!(veioDoV1 && temDoMeio) ||
   duasAbas.rA.aplicado === false,
   'U — duas abas nunca produzem hibrido: estado final ' +
   duasAbas.ids.join(', ') + ' (restauracao ' +
   (duasAbas.rA.aplicado ? 'aplicou' : 'recusou com ' + duasAbas.rA.motivo) + ')');

/* ==================================================================== */
console.log('');
console.log('  8. O QUE CONTINUA COMO ESTAVA');
console.log('');
/* ==================================================================== */

const intacto = await p.evaluate(async () => {
  const A = window.Armazenamento;
  const pac = await A.gerarBackupV2();
  return {
    manifesto: A.MANIFESTO.length,
    exportaveis: A.exportaveis().length,
    noBackup: pac.armazenamentos.length,
    v1Oficial: typeof window.DadosLocais.importar === 'function' &&
               window.DadosLocais.exportar().versao === 1
  };
});
ok(intacto.manifesto === 13, 'X — o manifesto continua com 13 armazenamentos');
ok(intacto.exportaveis === 12 && intacto.noBackup === 12,
   'Y — e o Backup V2 continua com 12: o V1 nao mexeu em nada disso');
ok(intacto.v1Oficial,
   'o importador legado DadosLocais.importar() continua existindo e intocado');

/* Z — a rodada de UI aconteceu: este bloco dizia que nenhuma tela chamava o
   caminho novo, e avisava que a troca viria depois. Veio. Agora ele cobra que
   a troca esteja feita, e feita num lugar so. */
const comUI = await p.evaluate(async () => {
  const outras = ['/app.js', '/ficha.js', '/arquivos.js', '/documentos.js'];
  const vazou = [];
  for (const a of outras) {
    const t = await (await fetch(a)).text();
    if (/aplicarBackupV1|planejarImportacaoV1|converterV1ParaV2Limpo|aplicarBackupV2/.test(t)) {
      vazou.push(a);
    }
  }
  const perfil = await (await fetch('/perfil.js')).text();
  return {
    vazou,
    perfilPlaneja: /planejarImportacaoV1/.test(perfil),
    perfilAplicaV1: /aplicarBackupV1/.test(perfil),
    perfilConfirmaParcial: /confirmarRestauracaoParcial/.test(perfil),
    /* a chamada da fachada como importador: `banco().importar(pacote)` */
    perfilAindaChamaLegado: /banco\(\)\s*\.\s*importar\s*\(/.test(perfil)
  };
});
ok(comUI.perfilPlaneja && comUI.perfilAplicaV1,
   'Z — perfil.js passou a planejar e aplicar o V1 pelo caminho novo');
ok(comUI.perfilConfirmaParcial,
   'Z — e passa confirmarRestauracaoParcial, que so se passa depois de avisar');
ok(!comUI.perfilAindaChamaLegado,
   'Z — e nao chama mais banco().importar(): o atalho legado saiu da tela');
ok(comUI.vazou.length === 0,
   'Z — nenhuma OUTRA tela chama o caminho novo: ' +
   (comUI.vazou.length ? 'vazou para ' + comUI.vazou.join(', ') : 'nenhuma'));

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
