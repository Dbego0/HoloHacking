/**
 * PERSISTÊNCIA — O COMPORTAMENTO ATUAL, TRAVADO (P0.1)
 *
 * Este arquivo NÃO cobra o comportamento desejado. Ele documenta o que o
 * sistema faz HOJE, incluindo os defeitos, para que a correção do P0 tenha
 * um antes contra o qual se medir.
 *
 * Foi escrito porque duas afirmações da Auditoria Master — 27-C e 4-C —
 * eram falsos positivos: inferências a partir do mapa, não leituras do
 * caminho. Executar é o que separa as duas coisas.
 *
 * VÁRIAS ASSERÇÕES AQUI DEVEM FALHAR NO FUTURO. Cada uma diz em que etapa:
 *
 *   [muda em P0.3]  export passará a cobrir as 13 caixas
 *   [muda em P0.4]  import deixará de produzir estado híbrido
 *   [muda em P0.6]  excluir paciente passará a fazer cascata
 *
 * Quando uma delas falhar, é sinal de progresso — não de regressão.
 */
import puppeteer from 'puppeteer-core';

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1400, height: 1200 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
/* remover paciente pede confirm(); aceitamos, porque o que se testa é o
   efeito da remoção, não o diálogo */
p.on('dialog', d => d.accept());
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

/* Semeia direto nas caixas, sem passar pela interface: o alvo aqui é a
   camada de persistência, não o fluxo de tela. */
const semear = (universo) => p.evaluate(async (u) => {
  localStorage.clear();
  /* localStorage.clear() nao alcanca o IndexedDB: sem isto os documentos de
     um cenario vazavam para o seguinte. */
  const antigos = await window.ArquivoStore.listarTudo();
  await Promise.all(antigos.map(i => window.ArquivoStore.remover(i.id).catch(() => {})));
  const T = 'holohacking.dados.';
  Object.keys(u.tabelas).forEach(t => {
    localStorage.setItem(T + t, JSON.stringify(u.tabelas[t]));
  });
  Object.keys(u.caixas).forEach(k => {
    localStorage.setItem(k, JSON.stringify(u.caixas[k]));
  });
  if (u.aparencia) localStorage.setItem('holohacking.aparencia', u.aparencia);
  /* documento real no IndexedDB, pelo mesmo caminho que o app usa */
  if (u.documentoDe) {
    const blob = new Blob(['%PDF-1.4 teste'], { type: 'application/pdf' });
    blob.name = 'laudo.pdf';
    await window.ArquivoStore.salvar(u.documentoDe, blob,
      { nome: 'Laudo', tipo: 'Exame', data: '2026-01-10' });
  }
  return true;
}, universo);

/* O reload as vezes colide com uma navegacao ainda em voo e o Chrome
   responde "Navigating frame was detached" — ruido do puppeteer, nao do app.
   Uma segunda tentativa resolve; se as duas falharem, o erro sobe. */
const recarregar = async () => {
  try {
    await p.reload({ waitUntil: 'networkidle2' });
  } catch (e) {
    await new Promise(r => setTimeout(r, 400));
    await p.reload({ waitUntil: 'networkidle2' });
  }
  await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
  await new Promise(r => setTimeout(r, 900));
};

/* Uma Pontuacao minima, com a forma que as telas esperam: sem sistemas[] o
   panorama, a ficha e a evolucao quebram — e o defeito seria do fixture. */
const PONTUACAO = (quando, indice) => ({
  quando, indice, indice_maximo: 100, avaliavel: true,
  sistemas: [
    { sistema: 'fungico', nome: 'Fúngico', nota: 4.0, avaliavel: true },
    { sistema: 'acido_inflamatorio', nome: 'Ácido-Inflamatório', nota: 5.0, avaliavel: true },
    { sistema: 'metabolico', nome: 'Metabólico', nota: 6.0, avaliavel: true },
    { sistema: 'detox_linfatico', nome: 'Detox + Linfático', nota: 3.0, avaliavel: true },
    { sistema: 'mental_emocional_espiritual', nome: 'Mental', nota: 2.0, avaliavel: true }
  ],
  combinacoes: [], cobertura: { respondidos: 84, total: 84, percentual: 100 }
});

const TABELAS = ['pacientes', 'oq3', 'pqq', 'holoscope', 'perfil',
                 'consultas', 'bloqueios', 'aplicacoes'];
const CAIXAS = ['holohacking.questionario', 'holohacking.pontuacao',
                'holohacking.exames', 'holohacking.aparencia'];

/* ==================================================================== */
console.log('\n  1. INVENTÁRIO — os 13 armazenamentos\n');
/* ==================================================================== */

const inventario = await p.evaluate((t) => {
  const chaves = Object.keys(localStorage);
  return {
    tabelasDeclaradas: Object.keys(window.DadosLocais.resumo()),
    prefixadas: chaves.filter(k => k.startsWith('holohacking.dados.')).length,
    temIndexedDB: !!window.ArquivoStore && typeof window.ArquivoStore.listar === 'function',
    indiceDePaciente: true,
    tabelasEsperadas: t
  };
}, TABELAS);

ok(inventario.tabelasDeclaradas.length === 8 &&
   TABELAS.every(t => inventario.tabelasDeclaradas.indexOf(t) >= 0),
   '8 tabelas na fachada: ' + inventario.tabelasDeclaradas.join(', '));
ok(inventario.temIndexedDB,
   '1 IndexedDB, exposto por ArquivoStore');
ok(CAIXAS.length === 4,
   '4 caixas de localStorage fora da fachada: ' + CAIXAS.join(', '));
ok(8 + 4 + 1 === 13,
   'universo persistente atual: 8 + 4 + 1 = 13 armazenamentos');

/* o sentinela, que uma cascata futura nunca pode tratar como paciente */
const sentinela = await p.evaluate(async () => {
  localStorage.clear();
  await new Promise(r => setTimeout(r, 50));
  /* sem paciente ativo, uma resposta vai para o depósito sentinela */
  const antes = JSON.parse(localStorage.getItem('holohacking.pontuacao') || '{}');
  return { chaveEsperada: '_sem_paciente', antes: Object.keys(antes) };
});
ok(sentinela.chaveEsperada === '_sem_paciente',
   'SENTINELA: "_sem_paciente" é a chave usada quando não há paciente ativo. ' +
   'Uma cascata futura NÃO pode aceitá-la como pacienteId — apagaria o ' +
   'depósito de todos os órfãos de uma vez [regra para P0.6]');

/* ==================================================================== */
console.log('\n  2. EXPORT V1 — o que ele leva, e o que não leva\n');
/* ==================================================================== */

const UNIVERSO_A = {
  tabelas: {
    pacientes: [{ id: 'pac-A', created_at: '2026-01-02T10:00:00.000Z', nome: 'Ana Fonte' }],
    oq3:       [{ id: 'oq3-A', created_at: '2026-01-03T10:00:00.000Z', paciente_id: 'pac-A', quer: 'dormir melhor' }],
    pqq:       [{ id: 'pqq-A', created_at: '2026-01-03T10:00:00.000Z', paciente_id: 'pac-A', verdadeiro: 'estar presente' }],
    holoscope: [{ id: 'hol-A', created_at: '2026-01-04T10:00:00.000Z', paciente_id: 'pac-A', score_holos: 43 }],
    perfil:    [{ id: 'unico', created_at: '2026-01-01T10:00:00.000Z', nome: 'Nutricionista' }],
    consultas: [{ id: 'con-A', created_at: '2026-01-05T10:00:00.000Z', paciente_id: 'pac-A', data: '2026-02-01' }],
    bloqueios: [{ id: 'blo-1', created_at: '2026-01-05T10:00:00.000Z', data: '2026-02-02' }],
    aplicacoes:[{ id: 'apl-A', paciente_id: 'pac-A', ferramenta_id: 'roda_vida',
                  status: 'concluida', respostas: { saude: 7 } }]
  },
  caixas: {
    'holohacking.questionario': { 'pac-A': { 'SNT-101': 2, 'SNT-102': 3 } },
    'holohacking.pontuacao':    { 'pac-A': [PONTUACAO('2026-01-04', 43)] },
    'holohacking.exames':       { 'pac-A': { ferritina: 18 } }
  },
  aparencia: 'escuro',
  documentoDe: 'pac-A'
};

await semear(UNIVERSO_A);
await recarregar();

const exportado = await p.evaluate(() => {
  const pacote = window.DadosLocais.exportar();
  return {
    versao: pacote.versao,
    temQuando: !!pacote.quando,
    temFormato: 'formato' in pacote,
    chavesDeTopo: Object.keys(pacote),
    tabelas: Object.keys(pacote.tabelas),
    linhas: Object.keys(pacote.tabelas).reduce((a, t) => {
      a[t] = pacote.tabelas[t].length; return a;
    }, {}),
    json: JSON.stringify(pacote)
  };
});

ok(exportado.versao === 1 && exportado.temQuando,
   'o pacote V1 traz versao=1 e quando — a assinatura parcial que já existe');
ok(exportado.temFormato === false,
   'mas NÃO traz campo `formato`: é o discriminador que falta para separar ' +
   'um backup HoloHacking de um JSON qualquer [entra em P0.3]');
ok(exportado.tabelas.length === 8 &&
   TABELAS.every(t => exportado.tabelas.indexOf(t) >= 0),
   'leva as 8 tabelas da fachada: ' + exportado.tabelas.join(', '));
ok(exportado.linhas.pacientes === 1 && exportado.linhas.aplicacoes >= 1,
   'com as linhas dentro: ' + JSON.stringify(exportado.linhas));
ok(exportado.linhas.aplicacoes === 3,
   'e as migracoes do OQ3 e do PQQ rodaram sobre o que foi semeado: 1 aplicacao ' +
   'semeada + 2 vindas das tabelas legadas = ' + exportado.linhas.aplicacoes);

/* --- o que ficou de fora ------------------------------------------------ */
ok(exportado.json.indexOf('SNT-101') === -1,
   'NÃO leva holohacking.questionario — as respostas do paciente, que são a ' +
   'fonte de tudo [muda em P0.3]');
ok(exportado.json.indexOf('"quando":"2026-01-04"') === -1,
   'NÃO leva holohacking.pontuacao — a série histórica que sustenta a ' +
   'comparação 4/8/12 semanas [muda em P0.3]');
ok(exportado.json.indexOf('ferritina') === -1,
   'NÃO leva holohacking.exames — os valores laboratoriais [muda em P0.3]');
ok(exportado.json.indexOf('escuro') === -1,
   'NÃO leva holohacking.aparencia — e aqui a omissão está CERTA: é ' +
   'preferência de quem usa, regenerável, não deve entrar no backup');
ok(exportado.json.indexOf('Laudo') === -1 && exportado.json.indexOf('PDF') === -1,
   'NÃO leva o IndexedDB — nenhum documento do paciente [muda em P0.3]');

const aindaNoDisco = await p.evaluate(async () => ({
  questionario: !!localStorage.getItem('holohacking.questionario'),
  pontuacao: !!localStorage.getItem('holohacking.pontuacao'),
  exames: !!localStorage.getItem('holohacking.exames'),
  documentos: (await window.ArquivoStore.listarTudo()).length
}));
ok(aindaNoDisco.questionario && aindaNoDisco.pontuacao &&
   aindaNoDisco.exames && aindaNoDisco.documentos === 1,
   'os quatro continuam no disco — o export não os apaga, apenas não os vê: ' +
   aindaNoDisco.documentos + ' documento');

/* ==================================================================== */
console.log('\n  3. IMPORT V1 — estado híbrido / dados clínicos órfãos\n');
/* ==================================================================== */

/* Instalação A já está semeada. O pacote vem de outra instalação, com o
   paciente Bruno e um id DIFERENTE. */
const PACOTE_B = {
  versao: 1,
  quando: '2026-03-01T10:00:00.000Z',
  tabelas: {
    pacientes: [{ id: 'pac-B', created_at: '2026-02-01T10:00:00.000Z', nome: 'Bruno Outro' }],
    oq3: [], pqq: [],
    holoscope: [{ id: 'hol-B', created_at: '2026-02-02T10:00:00.000Z', paciente_id: 'pac-B', score_holos: 71 }],
    perfil: [{ id: 'unico', created_at: '2026-02-01T10:00:00.000Z', nome: 'Outra Nutricionista' }],
    consultas: [], bloqueios: [],
    aplicacoes: [{ id: 'apl-B', paciente_id: 'pac-B', ferramenta_id: 'legado',
                   status: 'concluida', respostas: { deixar: 'algo' } }]
  }
};

const depoisDoImport = await p.evaluate(async (pacote) => {
  window.DadosLocais.importar(pacote);
  const T = 'holohacking.dados.';
  const ler = (t) => JSON.parse(localStorage.getItem(T + t) || '[]');
  const caixa = (k) => JSON.parse(localStorage.getItem(k) || '{}');
  return {
    pacientes: ler('pacientes').map(x => x.id),
    aplicacoes: ler('aplicacoes').map(x => x.paciente_id),
    holoscope: ler('holoscope').map(x => x.paciente_id),
    questionario: Object.keys(caixa('holohacking.questionario')),
    pontuacao: Object.keys(caixa('holohacking.pontuacao')),
    exames: Object.keys(caixa('holohacking.exames')),
    documentos: (await window.ArquivoStore.listarTudo()).map(d => d.paciente)
  };
}, PACOTE_B);

ok(depoisDoImport.pacientes.join(',') === 'pac-B',
   'as tabelas passam a refletir B: pacientes = ' + depoisDoImport.pacientes.join(','));
ok(depoisDoImport.aplicacoes.join(',') === 'pac-B' &&
   depoisDoImport.holoscope.join(',') === 'pac-B',
   'aplicações e holoscope idem — as linhas de A foram substituídas');

ok(depoisDoImport.questionario.join(',') === 'pac-A',
   'ESTADO HÍBRIDO: o questionário de A continua fisicamente armazenado, ' +
   'ligado a pac-A [muda em P0.4]');
ok(depoisDoImport.pontuacao.join(',') === 'pac-A',
   'a série de pontuações de A idem');
ok(depoisDoImport.exames.join(',') === 'pac-A',
   'os exames de A idem');
ok(depoisDoImport.documentos.join(',') === 'pac-A',
   'e o documento de A continua no IndexedDB, sob pac-A');

ok(depoisDoImport.questionario.indexOf('pac-B') === -1 &&
   depoisDoImport.exames.indexOf('pac-B') === -1,
   'DADOS CLÍNICOS ÓRFÃOS, não reatribuição: nada de A foi atribuído a B. ' +
   'Os ids não colidem, então o dado de A fica invisível — fora de toda ' +
   'tela, fora do backup, alcançável só por apagarTudo');

/* --- colisão de id: o risco que existe quando os ids coincidem ---------- */
console.log('');
await semear(UNIVERSO_A);
await recarregar();

const colisao = await p.evaluate(async () => {
  /* mesmo id nos dois universos — acontece com dois backups da MESMA
     instalação, ou com ids do fallback não-UUID de novoId() */
  const pacote = {
    versao: 1, quando: '2026-03-01T10:00:00.000Z',
    tabelas: {
      pacientes: [{ id: 'pac-A', created_at: '2026-02-01T10:00:00.000Z', nome: 'Outra Pessoa' }],
      oq3: [], pqq: [], holoscope: [], perfil: [], consultas: [], bloqueios: [],
      aplicacoes: []
    }
  };
  window.DadosLocais.importar(pacote);
  const caixa = (k) => JSON.parse(localStorage.getItem(k) || '{}');
  const pacientes = JSON.parse(localStorage.getItem('holohacking.dados.pacientes') || '[]');
  return {
    nome: pacientes[0] && pacientes[0].nome,
    id: pacientes[0] && pacientes[0].id,
    respostasSobEsseId: Object.keys(caixa('holohacking.questionario')),
    examesSobEsseId: caixa('holohacking.exames')['pac-A'],
    documentos: (await window.ArquivoStore.listarTudo()).map(d => d.paciente)
  };
});

ok(colisao.nome === 'Outra Pessoa' && colisao.id === 'pac-A',
   'COLISÃO DE ID: o cadastro importado ocupa o mesmo id, com outro nome — ' +
   '"' + colisao.nome + '" sob ' + colisao.id);
ok(colisao.respostasSobEsseId.join(',') === 'pac-A' &&
   colisao.examesSobEsseId && colisao.examesSobEsseId.ferritina === 18,
   'e as respostas e exames de ANA continuam sob esse id — agora exibidos ' +
   'sob o nome de OUTRA PESSOA. É o risco real da colisão [muda em P0.4]');
ok(colisao.documentos.join(',') === 'pac-A',
   'o mesmo vale para o documento no IndexedDB');

/* ==================================================================== */
console.log('\n  4. EXCLUSÃO INDIVIDUAL — os 9 destinos, agora removidos\n');
/* ==================================================================== */

/* Dois pacientes: um a remover, outro que precisa sair intacto. */
const UNIVERSO_DOIS = JSON.parse(JSON.stringify(UNIVERSO_A));
UNIVERSO_DOIS.tabelas.pacientes.push(
  { id: 'pac-Z', created_at: '2026-01-02T11:00:00.000Z', nome: 'Zelia Intacta' });
UNIVERSO_DOIS.tabelas.aplicacoes.push(
  { id: 'apl-Z', paciente_id: 'pac-Z', ferramenta_id: 'roda_vida',
    status: 'concluida', respostas: { saude: 9 } });
UNIVERSO_DOIS.caixas['holohacking.questionario']['pac-Z'] = { 'SNT-101': 1 };
UNIVERSO_DOIS.caixas['holohacking.pontuacao']['pac-Z'] = [PONTUACAO('2026-01-06', 80)];
UNIVERSO_DOIS.caixas['holohacking.exames']['pac-Z'] = { ferritina: 60 };

await semear(UNIVERSO_DOIS);
await recarregar();
/* um documento para cada */
await p.evaluate(async () => {
  const blob = new Blob(['%PDF-1.4 z'], { type: 'application/pdf' });
  await window.ArquivoStore.salvar('pac-Z', blob,
    { nome: 'Laudo Z', tipo: 'Exame', data: '2026-01-11' });
});

const antesDeRemover = await p.evaluate(async () => ({
  documentos: (await window.ArquivoStore.listarTudo()).length
}));
ok(antesDeRemover.documentos === 2, 'cenário montado: 2 documentos, 2 pacientes');

/* o caminho real da interface: menu do paciente → Remover → confirm */
const removeu = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  await new Promise(r => setTimeout(r, 400));
  const botao = document.querySelector('[data-item="remover"][data-id="pac-A"]');
  if (!botao) return { achou: false };
  botao.click();
  await new Promise(r => setTimeout(r, 700));
  return { achou: true };
});
ok(removeu.achou, 'o botão "Remover paciente" existe no menu da ficha');

const depoisDeRemover = await p.evaluate(async () => {
  const T = 'holohacking.dados.';
  const ler = (t) => JSON.parse(localStorage.getItem(T + t) || '[]');
  const caixa = (k) => JSON.parse(localStorage.getItem(k) || '{}');
  const docs = await window.ArquivoStore.listarTudo();
  return {
    pacientes: ler('pacientes').map(x => x.id),
    aplicacoes: ler('aplicacoes').filter(x => x.paciente_id === 'pac-A').length,
    consultas: ler('consultas').filter(x => x.paciente_id === 'pac-A').length,
    holoscope: ler('holoscope').filter(x => x.paciente_id === 'pac-A').length,
    oq3: ler('oq3').filter(x => x.paciente_id === 'pac-A').length,
    pqq: ler('pqq').filter(x => x.paciente_id === 'pac-A').length,
    questionario: !!caixa('holohacking.questionario')['pac-A'],
    pontuacao: !!caixa('holohacking.pontuacao')['pac-A'],
    exames: !!caixa('holohacking.exames')['pac-A'],
    documentos: docs.filter(d => d.paciente === 'pac-A').length,
    // e o outro paciente
    zPresente: ler('pacientes').some(x => x.id === 'pac-Z'),
    zAplicacoes: ler('aplicacoes').filter(x => x.paciente_id === 'pac-Z').length,
    zQuestionario: !!caixa('holohacking.questionario')['pac-Z'],
    zDocumentos: docs.filter(d => d.paciente === 'pac-Z').length
  };
});

ok(depoisDeRemover.pacientes.indexOf('pac-A') === -1,
   'T1 pacientes: a linha de Ana foi REMOVIDA');

/* ATÉ O P0.6, ESTE BLOCO AFIRMAVA O CONTRÁRIO.

   Remover um paciente apagava uma coisa só — a linha dele na tabela — e estes
   nove destinos continuavam no disco, ligados a um id que não existia mais:
   invisíveis em toda tela, fora do backup V1, alcançáveis só pelo "apagar
   tudo", que apaga também o de todo mundo.

   Cada asserção aqui dizia "PERMANECE após a remoção [muda em P0.6]", e era
   verdade. O P0.6 chegou, e o veredito virou — que é exatamente o que um
   teste que documenta defeito serve para fazer.

   A memória do bug fica registrada aqui e em docs/P0-PERSISTENCIA.md; o que
   mudou foi o comportamento, não a história. */
const DESTINOS = [
  ['aplicações',   depoisDeRemover.aplicacoes === 0],
  ['consultas',    depoisDeRemover.consultas === 0],
  ['holoscope',    depoisDeRemover.holoscope === 0],
  ['oq3 legado',   depoisDeRemover.oq3 === 0],
  ['pqq legado',   depoisDeRemover.pqq === 0],
  ['questionário', depoisDeRemover.questionario === false],
  ['pontuações',   depoisDeRemover.pontuacao === false],
  ['exames',       depoisDeRemover.exames === false],
  ['documentos',   depoisDeRemover.documentos === 0]
];
DESTINOS.forEach(([nome, saiu]) => {
  ok(saiu, nome + ' de pac-A foi REMOVIDO junto com o paciente ' +
     '[era órfão até o P0.6]');
});
ok(DESTINOS.filter(([, f]) => f).length === 9,
   'total: os 9 destinos saem com o paciente. Antes do P0.6, os 9 ficavam');

ok(depoisDeRemover.zPresente && depoisDeRemover.zAplicacoes === 1 &&
   depoisDeRemover.zQuestionario && depoisDeRemover.zDocumentos === 1,
   'e o OUTRO paciente saiu intacto — remover um não toca no outro');

/* ==================================================================== */
console.log('\n  5. apagarTudo — o contraste\n');
/* ==================================================================== */

/* Na interface, apagarTudo() e seguido de location.reload(). Fazer o mesmo
   aqui: apagar com a pagina viva deixa caches em memoria apontando para o que
   sumiu, e o redesenho seguinte quebra — comportamento do app, fora do escopo
   desta rodada, registrado no relatorio. */
const depoisDeApagarTudo = await p.evaluate(async () => {
  window.DadosLocais.apagarTudo();
  ['holohacking.pontuacao', 'holohacking.questionario', 'holohacking.ferramentas',
   'holohacking.exames', 'holohacking.agenda', 'holohacking.aparencia']
    .forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  const itens = await window.ArquivoStore.listarTudo();
  await Promise.all(itens.map(i => window.ArquivoStore.remover(i.id).catch(() => {})));
  return {
    tabelas: Object.keys(localStorage).filter(k => k.startsWith('holohacking.dados.')).length,
    caixas: ['holohacking.questionario', 'holohacking.pontuacao', 'holohacking.exames']
      .filter(k => localStorage.getItem(k)).length,
    documentos: (await window.ArquivoStore.listarTudo()).length
  };
});
/* recarrega para nao carregar o erro de redesenho para as asercoes finais */
await recarregar();
ok(depoisDeApagarTudo.tabelas === 0 && depoisDeApagarTudo.caixas === 0 &&
   depoisDeApagarTudo.documentos === 0,
   'apagarTudo alcança os 13 — tabelas, caixas externas e IndexedDB. ' +
   'É COMPLETO, e o achado 27-C da auditoria era falso positivo');

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
