/**
 * BACKUP V2 — P0.3
 *
 * O V1 leva 8 dos 13 armazenamentos e deixa para tras quatro que ninguem
 * consegue regerar: as respostas, a serie de pontuacoes, os exames e os
 * documentos. O V2 leva as 12 entradas que o manifesto marca exportar:true.
 *
 * O que estes testes cobram, e que e mais do que "o pacote tem tudo":
 *
 *   CAPTURA, NAO TRANSFORMACAO — os bytes voltam identicos, os acentos e os
 *   emoji voltam identicos, e null/0/false/"" nao viram outra coisa. Backup
 *   que "arruma" o dado no caminho e backup que perde dado.
 *
 *   O ORFAO VAI JUNTO — o dado de um paciente que nao existe mais na raiz e
 *   justamente o que so o backup alcanca, ja que nenhuma tela o mostra. O
 *   exportador nao limpa estado inconsistente; o diagnostico informa e nao
 *   decide.
 *
 *   GERAR NAO ESCREVE — localStorage byte a byte e IndexedDB conferidos antes
 *   e depois, e nenhuma chave nova criada.
 *
 * Este arquivo cobra o GERADOR. O importador chegou depois (P0.4b,
 * testar-import-v2-aplicacao) e a ligacao com a tela depois ainda
 * (testar-backup-ui): o botao Exportar hoje chama este V2, nao mais o V1.
 */
import puppeteer from 'puppeteer-core';

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1400, height: 1200 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

/* Texto com acento, cedilha e emoji; e um valor de cada tipo que costuma ser
   coagido em serializacao descuidada. */
const UNICODE = 'Coração ✨ ãéîõü — “aspas” · 日本語 🙂';

/* ==================================================================== */
console.log('');
console.log('  0. UM UNIVERSO COM TUDO O QUE PODE DAR ERRADO');
console.log('');
/* ==================================================================== */

/* Dois pacientes reais, um FANTASMA que nao existe na raiz (orfao), e o
   sentinela. Documentos: texto, bytes binarios nao-UTF8, e um arquivo vazio.
   Os tres com nome e tamanho distintos, porque ArquivoStore.salvar monta o id
   com Date.now() + hash(nome+tamanho) e colide se forem iguais — bug conhecido,
   backlog separado, nao e escopo desta rodada. */
const semeado = await p.evaluate(async (UNICODE) => {
  localStorage.clear();
  const antigos = await window.ArquivoStore.listarTudo();
  await Promise.all(antigos.map(i => window.ArquivoStore.remover(i.id).catch(() => {})));

  const g = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const P = 'holohacking.dados.';

  g(P + 'pacientes', [
    { id: 'pac-A', nome: 'Ana ' + UNICODE, created_at: '2026-01-01T10:00:00.000Z',
      telefone: '', observacao: null, arquivado: false, visitas: 0 },
    { id: 'pac-B', nome: 'Bruno Outro', created_at: '2026-01-02T10:00:00.000Z' }
  ]);
  g(P + 'aplicacoes', [
    { id: 'ap-1', paciente_id: 'pac-A', ferramenta_id: 'oq3', versao: 2,
      status: 'concluida', respostas: { quer: UNICODE, precisa: '', consegue: null } },
    { id: 'ap-2', paciente_id: 'pac-B', ferramenta_id: 'pqq', versao: 1,
      status: 'rascunho', respostas: { objetivo: 'outro' } }
  ]);
  g(P + 'consultas', [{ id: 'c-1', paciente_id: 'pac-A', quando: '2026-02-01T14:00:00.000Z' }]);
  g(P + 'bloqueios', [{ id: 'b-1', titulo: 'almoço' }]);
  g(P + 'holoscope', [{ id: 'h-1', paciente_id: 'pac-A', score_holos: 43, sistemas: [] }]);
  g(P + 'oq3', [{ id: 'o-1', paciente_id: 'pac-A', quer: 'legado' }]);
  g(P + 'pqq', [{ id: 'q-1', paciente_id: 'pac-A', objetivo: 'legado' }]);
  g(P + 'perfil', [{ id: 'pf-1', nome: 'Nutricionista', crn: 'CRN-0000' }]);

  /* mapas: um paciente real, um ORFAO e o sentinela */
  g('holohacking.questionario', {
    'pac-A': { m1: 3, m2: 0, m3: null, m4: false, m5: '' },
    'pac-B': { m1: 1 },
    'pac-FANTASMA': { m1: 2 },
    '_sem_paciente': { m1: 3 }
  });
  g('holohacking.pontuacao', {
    /* interpretacao (revisao clinica do HOLOSCOPE, campo opcional dentro do
       proprio snapshot — sem entrada nova no manifesto) precisa viajar no
       V2 igual a qualquer outro campo do box `pontuacao`, ja que o box
       inteiro e exportar:true. */
    'pac-A': [{ quando: '2026-01-10', indice: 43 },
              { quando: '2026-03-10', indice: 61, versao_estrutura: 2,
                interpretacao: { texto: UNICODE, quando_escrita: '2026-03-10', versao: 1 } }],
    'pac-FANTASMA': [{ quando: '2026-01-01', indice: 9 }]
  });
  g('holohacking.exames', { 'pac-A': { ferritina: 30, b12: null }, 'pac-B': { ferritina: 80 } });

  /* fora do V2, de proposito */
  localStorage.setItem('holohacking.aparencia', 'escuro');
  localStorage.setItem('holohacking.oq3.migrado', '1');
  localStorage.setItem('holohacking.pqq.migrado', '1');
  g('holohacking.ferramentas', { 'pac-A': { x: 1 } });
  g('holohacking.agenda', { data: '2026-02-01' });

  /* --- os documentos ------------------------------------------------- */
  const texto = new Blob([UNICODE], { type: 'text/plain' });
  texto.name = 'nota.txt';
  /* bytes que NAO sao UTF-8 valido: 0xFF 0xFE e um 0x00 no meio */
  const bytes = new Uint8Array([0xFF, 0xFE, 0x00, 0x41, 0x80, 0x7F, 0xC3]);
  const binario = new Blob([bytes], { type: 'application/octet-stream' });
  binario.name = 'binario.bin';
  const vazio = new Blob([], { type: 'application/pdf' });
  vazio.name = 'vazio.pdf';

  const dA = await window.ArquivoStore.salvar('pac-A', texto,
    { nome: 'Nota ' + UNICODE, tipo: 'Outro', data: '2026-02-01' });
  const dB = await window.ArquivoStore.salvar('pac-B', binario,
    { nome: 'Binario', tipo: 'Exame', data: '2026-02-02' });
  const dV = await window.ArquivoStore.salvar('pac-A', vazio,
    { nome: 'Vazio', tipo: 'Exame', data: '2026-02-03' });

  return {
    bytesBinario: [...bytes],
    ids: { texto: dA.id, binario: dB.id, vazio: dV.id }
  };
}, UNICODE);

ok(!!semeado.ids.texto && !!semeado.ids.binario && !!semeado.ids.vazio,
   'semeados 3 documentos: texto, bytes nao-UTF8 e um arquivo vazio');

/* ==================================================================== */
console.log('');
console.log('  1. FORMATO, VERSAO E COBERTURA');
console.log('');
/* ==================================================================== */

const v2 = await p.evaluate(async () => {
  const pacote = await window.Armazenamento.gerarBackupV2();
  const A = window.Armazenamento;
  return {
    formato: pacote.formato,
    versao: pacote.versao,
    criado_em: pacote.criado_em,
    manifesto_versao: pacote.manifesto_versao,
    manifesto_versao_do_modulo: A.MANIFESTO_VERSAO,
    armazenamentos: pacote.armazenamentos,
    exportaveisDoManifesto: A.exportaveis().map(e => e.id),
    chavesDados: Object.keys(pacote.conteudo.dados),
    qtdArquivos: pacote.conteudo.arquivos.length,
    integridade: pacote.integridade,
    diagnostico: pacote.diagnostico,
    tamanho: pacote.tamanho,
    /* o pacote inteiro em texto, para as buscas por ausencia */
    texto: JSON.stringify(pacote)
  };
});

/* A, B, C */
ok(v2.formato === 'holohacking-backup',
   'A — discriminador `formato`: "' + v2.formato + '" (o V1 nao tem nenhum)');
ok(v2.versao === 2, 'B — versao: ' + v2.versao);
ok(/^\d{4}-\d{2}-\d{2}T/.test(v2.criado_em),
   'e um timestamp ISO: ' + v2.criado_em);
ok(v2.manifesto_versao === 1 && v2.manifesto_versao === v2.manifesto_versao_do_modulo,
   'C — manifesto_versao gravado e o declarado pelo modulo, nao inferido da ' +
   'quantidade de entradas: ' + v2.manifesto_versao);

/* D — a regra central */
const representados = v2.chavesDados.length + (v2.qtdArquivos >= 0 ? 1 : 0);
ok(v2.exportaveisDoManifesto.length === 12,
   'D — o manifesto marca 12 entradas com exportar:true: ' +
   v2.exportaveisDoManifesto.length);
ok(v2.armazenamentos.join(',') === v2.exportaveisDoManifesto.join(','),
   'e o pacote declara exatamente essas 12, na mesma ordem — lista derivada ' +
   'do manifesto, nao escrita a mao');
ok(representados === 12,
   'representados no conteudo: ' + v2.chavesDados.length + ' em `dados` + ' +
   'a lista `arquivos` = ' + representados);
ok(v2.chavesDados.join(',') ===
   v2.exportaveisDoManifesto.filter(id => id !== 'arquivos').join(','),
   'as 11 de `dados` sao as exportaveis menos a loja: ' + v2.chavesDados.join(', '));

/* E, F — o que NAO entra */
ok(v2.chavesDados.indexOf('aparencia') === -1 && v2.texto.indexOf('aparencia') === -1,
   'E — `aparencia` nao aparece em lugar nenhum do pacote');
ok(v2.texto.indexOf('migrado') === -1,
   'F — nem as marcas de migracao oq3.migrado / pqq.migrado');
ok(v2.texto.indexOf('holohacking.ferramentas') === -1 &&
   v2.texto.indexOf('holohacking.agenda') === -1,
   'nem as caixas legadas ja consumidas (ferramentas, agenda)');
ok(v2.chavesDados.indexOf('oq3') >= 0 && v2.chavesDados.indexOf('pqq') >= 0,
   'mas as TABELAS legadas oq3 e pqq entram, porque o manifesto manda — ' +
   'dado legado nao e marca de migracao');

/* ==================================================================== */
console.log('');
console.log('  2. OS DADOS, COMO ESTAVAM');
console.log('');
/* ==================================================================== */

const dados = await p.evaluate(async () => {
  const pacote = await window.Armazenamento.gerarBackupV2();
  const d = pacote.conteudo.dados;
  return {
    tabelas: ['pacientes', 'aplicacoes', 'consultas', 'bloqueios', 'holoscope',
              'oq3', 'pqq', 'perfil'].map(t => ({ t, n: (d[t] || []).length })),
    /* tudo o que veio do disco, para comparar byte a byte */
    doDisco: {
      pacientes: localStorage.getItem('holohacking.dados.pacientes'),
      aplicacoes: localStorage.getItem('holohacking.dados.aplicacoes'),
      questionario: localStorage.getItem('holohacking.questionario'),
      pontuacao: localStorage.getItem('holohacking.pontuacao'),
      exames: localStorage.getItem('holohacking.exames')
    },
    doPacote: {
      pacientes: JSON.stringify(d.pacientes),
      aplicacoes: JSON.stringify(d.aplicacoes),
      questionario: JSON.stringify(d.questionario),
      pontuacao: JSON.stringify(d.pontuacao),
      exames: JSON.stringify(d.exames)
    },
    pacienteA: d.pacientes.filter(x => x.id === 'pac-A')[0],
    respostasA: d.aplicacoes.filter(x => x.id === 'ap-1')[0].respostas,
    questA: d.questionario['pac-A'],
    chavesQuest: Object.keys(d.questionario).sort(),
    serieA: d.pontuacao['pac-A'],
    chavesPont: Object.keys(d.pontuacao).sort(),
    examesB12: d.exames['pac-A'].b12,
    chavesExames: Object.keys(d.exames).sort()
  };
});

/* G */
ok(dados.tabelas.every(x => x.n >= 1),
   'G — as 8 tabelas vieram com as linhas: ' +
   dados.tabelas.map(x => x.t + '=' + x.n).join(' '));
ok(dados.doPacote.pacientes === dados.doDisco.pacientes &&
   dados.doPacote.aplicacoes === dados.doDisco.aplicacoes,
   'e o conteudo e IDENTICO ao do disco, serializado na mesma ordem — ' +
   'captura, nao transformacao');

/* H, I, J */
ok(dados.doPacote.questionario === dados.doDisco.questionario,
   'H — o mapa do questionario veio inteiro, identico ao disco');
ok(dados.doPacote.pontuacao === dados.doDisco.pontuacao,
   'I — a serie de pontuacoes idem');
ok(dados.serieA.length === 2 && dados.serieA[0].indice === 43 && dados.serieA[1].indice === 61,
   'e a ORDEM do array foi preservada — nela a ordem e o dado: 43 -> 61');
/* L (revisao clinica do HOLOSCOPE): a interpretacao profissional e um campo
   opcional dentro do MESMO snapshot de pontuacao — nenhuma entrada nova no
   manifesto, entao ela so viaja no V2 se o box inteiro continuar
   exportar:true (ja provado acima) e o campo nao for perdido no caminho. */
ok(dados.serieA[1].interpretacao && dados.serieA[1].interpretacao.texto.indexOf('🙂') >= 0,
   'L — a interpretação profissional (com unicode) viaja dentro do snapshot: "' +
   (dados.serieA[1].interpretacao || {}).texto + '"');
ok(dados.doPacote.exames === dados.doDisco.exames,
   'J — os exames idem');

/* W, X — unicode e coercao */
ok(dados.pacienteA.nome.indexOf('🙂') >= 0 && dados.pacienteA.nome.indexOf('日本語') >= 0 &&
   dados.pacienteA.nome.indexOf('ã') >= 0,
   'W — acentos, aspas tipograficas, ideogramas e emoji voltam inteiros');
ok(dados.respostasA.quer.indexOf('✨') >= 0,
   'inclusive dentro de respostas aninhadas');
ok(dados.pacienteA.observacao === null && dados.pacienteA.telefone === '' &&
   dados.pacienteA.arquivado === false && dados.pacienteA.visitas === 0,
   'X — null continua null, "" continua "", false continua false e 0 continua 0');
ok(dados.questA.m3 === null && dados.questA.m4 === false &&
   dados.questA.m5 === '' && dados.questA.m2 === 0,
   'idem dentro dos mapas: nada virou undefined nem string');
ok(dados.examesB12 === null, 'e um exame sem valor continua null, nao 0');

/* R, S — orfaos e sentinela */
ok(dados.chavesQuest.indexOf('pac-FANTASMA') >= 0 &&
   dados.chavesPont.indexOf('pac-FANTASMA') >= 0,
   'R — a chave ORFA foi PRESERVADA: ' + dados.chavesQuest.join(', ') +
   '. O exportador nao limpa estado inconsistente — esse dado so o backup alcanca');
ok(dados.chavesQuest.indexOf('_sem_paciente') >= 0,
   'S — e o sentinela `_sem_paciente` tambem viaja, quando faz parte de um ' +
   'armazenamento exportavel');

/* V — dois pacientes nao se misturam */
ok(dados.questA.m1 === 3 && dados.chavesQuest.indexOf('pac-B') >= 0,
   'V — cada paciente sob a sua chave, sem mistura: ' + dados.chavesQuest.length +
   ' chaves distintas no questionario');

/* ==================================================================== */
console.log('');
console.log('  3. OS DOCUMENTOS');
console.log('');
/* ==================================================================== */

const docs = await p.evaluate(async (esperado) => {
  const pacote = await window.Armazenamento.gerarBackupV2();
  const arqs = pacote.conteudo.arquivos;

  /* desfaz o base64 e devolve os bytes, para comparar com o original */
  const bytesDe = (b64) => {
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return [...u];
  };

  const porNome = {};
  arqs.forEach(a => { porNome[a.nome.indexOf('Nota') === 0 ? 'texto'
                              : a.nome === 'Binario' ? 'binario' : 'vazio'] = a; });

  /* confere o sha256 individual recalculando a partir do base64 */
  const conferirSha = async (a) => {
    if (!a.conteudo_base64 && a.bytes !== 0) return false;
    const u = new Uint8Array(bytesDe(a.conteudo_base64));
    const buf = await crypto.subtle.digest('SHA-256', u);
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    return hex === a.sha256;
  };

  return {
    quantos: arqs.length,
    campos: Object.keys(porNome.texto).sort(),
    pacientes: arqs.map(a => a.paciente).sort(),
    temBlob: arqs.every(a => typeof a.conteudo_base64 === 'string'),
    naoTemObjetoArquivo: arqs.every(a => !('arquivo' in a)),
    binarioVolta: bytesDe(porNome.binario.conteudo_base64),
    textoVolta: new TextDecoder().decode(new Uint8Array(bytesDe(porNome.texto.conteudo_base64))),
    porArquivo: arqs.map(a => ({ bytes: a.bytes, b64: a.conteudo_base64.length })),
    vazioBytes: porNome.vazio.bytes,
    vazioB64: porNome.vazio.conteudo_base64,
    shaOk: {
      texto: await conferirSha(porNome.texto),
      binario: await conferirSha(porNome.binario),
      vazio: await conferirSha(porNome.vazio)
    },
    shasDistintos: new Set(arqs.map(a => a.sha256)).size,
    nomeUnicode: porNome.texto.nome,
    mimeTexto: porNome.texto.mime,
    dataTexto: porNome.texto.data,
    esperado
  };
}, semeado.bytesBinario);

/* K */
ok(docs.quantos === 3 && docs.temBlob,
   'K — os 3 documentos vieram COM conteudo, nao so metadado');
ok(docs.naoTemObjetoArquivo,
   'e o objeto Blob nao viajou cru: ele virou conteudo_base64');
ok(['id', 'paciente', 'nome', 'tipo', 'data', 'mime', 'tamanho'].every(
     c => docs.campos.indexOf(c) >= 0),
   'cada um com id, paciente, nome, tipo, data, mime e tamanho: ' +
   docs.campos.join(', '));
ok(docs.nomeUnicode.indexOf('🙂') >= 0 && docs.mimeTexto === 'text/plain' &&
   docs.dataTexto === '2026-02-01',
   'metadados preservados, inclusive nome com emoji: "' + docs.nomeUnicode + '"');

/* L — os bytes voltam */
ok(docs.binarioVolta.join(',') === docs.esperado.join(','),
   'L — os bytes NAO-UTF8 voltam identicos do base64: [' +
   docs.binarioVolta.join(', ') + ']');
ok(docs.textoVolta.indexOf('日本語') >= 0 && docs.textoVolta.indexOf('🙂') >= 0,
   'e o texto com emoji volta identico');
ok(docs.vazioBytes === 0 && docs.vazioB64 === '',
   'o arquivo VAZIO volta vazio — 0 bytes e base64 "", nao null nem erro');

/* M */
ok(docs.shaOk.texto && docs.shaOk.binario && docs.shaOk.vazio,
   'M — o SHA-256 de cada documento confere com o SHA dos bytes que voltam ' +
   'do base64: 3 de 3');
ok(docs.shasDistintos === 3,
   'e os tres sao distintos — o hash e do conteudo, nao do registro: ' +
   docs.shasDistintos);

/* V — dois pacientes, dois donos */
ok(docs.pacientes.join(',') === 'pac-A,pac-A,pac-B',
   'V — cada documento com o seu dono, sem mistura: ' + docs.pacientes.join(', '));

/* ==================================================================== */
console.log('');
console.log('  4. HASH GLOBAL E CONTAGENS');
console.log('');
/* ==================================================================== */

/* N, O, P */
const hash = await p.evaluate(async () => {
  const A = window.Armazenamento;
  const p1 = await A.gerarBackupV2();
  const p2 = await A.gerarBackupV2();

  /* N — o hash gravado confere com o recalculo do conteudo */
  const recalculado = await A.sha256DeTexto(A.textoCanonico(p1.conteudo));

  /* o hash NAO cobre o proprio campo de hash: mexer so na integridade nao
     muda o hash do conteudo */
  const comOutraIntegridade = JSON.parse(JSON.stringify(p1));
  comOutraIntegridade.integridade.sha256_conteudo = 'mentira';
  const aindaIgual = await A.sha256DeTexto(A.textoCanonico(comOutraIntegridade.conteudo));

  /* O — mesmo conteudo, chaves em ordem trocada: mesmo hash */
  const embaralhado = JSON.parse(JSON.stringify(p1.conteudo));
  const trocado = {};
  Object.keys(embaralhado).reverse().forEach(k => { trocado[k] = embaralhado[k]; });
  const hashEmbaralhado = await A.sha256DeTexto(A.textoCanonico(trocado));

  /* P — um valor alterado: hash diferente */
  const mexido = JSON.parse(JSON.stringify(p1.conteudo));
  mexido.dados.questionario['pac-A'].m1 = 2;
  const hashMexido = await A.sha256DeTexto(A.textoCanonico(mexido));

  /* e a ordem DENTRO de um array e dado, nao acidente: inverter muda o hash */
  const invertido = JSON.parse(JSON.stringify(p1.conteudo));
  invertido.dados.pontuacao['pac-A'].reverse();
  const hashInvertido = await A.sha256DeTexto(A.textoCanonico(invertido));

  return {
    sha1: p1.integridade.sha256_conteudo,
    sha2: p2.integridade.sha256_conteudo,
    recalculado, aindaIgual, hashEmbaralhado, hashMexido, hashInvertido,
    algoritmo: p1.integridade.algoritmo,
    tamanhoHex: (p1.integridade.sha256_conteudo || '').length,
    canonico: A.textoCanonico({ b: 1, a: { d: 4, c: 3 } })
  };
});

ok(hash.tamanhoHex === 64,
   'N — o hash e um SHA-256 em hex: ' + hash.tamanhoHex + ' caracteres');
ok(hash.sha1 === hash.recalculado,
   'e ele confere com o recalculo do conteudo: ' + hash.sha1.slice(0, 16) + '…');
ok(hash.algoritmo === 'sha256(json-canonico(conteudo))',
   'o pacote diz COMO conferir, para o outro lado nao ter que adivinhar: ' +
   hash.algoritmo);
ok(hash.aindaIgual === hash.sha1,
   'o hash NAO cobre o proprio campo de hash — mexer em `integridade` nao o ' +
   'muda, que e o unico jeito de a conta fechar');

ok(hash.canonico === '{"a":{"c":3,"d":4},"b":1}',
   'O — a canonicalizacao ordena chaves em qualquer profundidade: ' + hash.canonico);
ok(hash.hashEmbaralhado === hash.sha1,
   'entao o mesmo conteudo com as chaves em outra ordem da o MESMO hash');
ok(hash.sha1 === hash.sha2,
   'e duas geracoes seguidas do mesmo estado dao o mesmo hash — determinismo');

ok(hash.hashMexido !== hash.sha1,
   'P — UM valor alterado (m1: 3 -> 2) muda o hash: ' +
   hash.hashMexido.slice(0, 16) + '…');
ok(hash.hashInvertido !== hash.sha1,
   'e inverter a ordem de um ARRAY tambem muda — nele a ordem e o dado');

/* Q — contagens */
const cont = v2.integridade.contagens;
ok(cont.pacientes === 2 && cont.aplicacoes === 2 && cont.consultas === 1 &&
   cont.holoscope === 1 && cont.perfil === 1 && cont.bloqueios === 1,
   'Q — contagens das listas conferem: ' +
   'pacientes=' + cont.pacientes + ' aplicacoes=' + cont.aplicacoes);
ok(cont.questionario === 4 && cont.exames === 2 && cont.pontuacao === 2,
   'dos mapas, o numero de CHAVES: questionario=' + cont.questionario +
   ' (2 reais + 1 orfao + o sentinela)');
ok(cont.pontuacoes_total === 3,
   'e a serie tem contagem propria — 2 medidas de pac-A + 1 do orfao = ' +
   cont.pontuacoes_total + '. O numero de pacientes com serie nao diz quantas ' +
   'medidas existem');
ok(cont.arquivos === 3 && cont.bytes_documentos > 0,
   'documentos=' + cont.arquivos + ', ' + cont.bytes_documentos + ' bytes');

/* diagnostico junto ao pacote */
ok(v2.diagnostico.ok === false && v2.diagnostico.quantidade_orfaos > 0,
   'o diagnostico viaja no pacote e ACUSA os orfaos: ' +
   v2.diagnostico.quantidade_orfaos + ' — sem impedir o export e sem ' +
   'descartar nada');
ok(v2.diagnostico.quantidade_sem_paciente > 0 &&
   Object.keys(v2.diagnostico).length === 3,
   'e o sentinela sai em contagem separada, sem informacao clinica no ' +
   'diagnostico: ' + Object.keys(v2.diagnostico).join(', '));

/* ==================================================================== */
console.log('');
console.log('  5. TAMANHO — medido, nao limitado');
console.log('');
/* ==================================================================== */

const t = v2.tamanho;
ok(t.bytes_documentos_originais > 0 && t.bytes_documentos_base64 > t.bytes_documentos_originais,
   'os tres numeros existem: ' + t.bytes_documentos_originais + ' bytes de ' +
   'documento viram ' + t.bytes_documentos_base64 + ' em base64');
const b64Esperado = docs.porArquivo.reduce((n, a) => n + Math.ceil(a.bytes / 3) * 4, 0);
ok(t.bytes_documentos_base64 === b64Esperado,
   'e a conta do base64 fecha exatamente, arquivo por arquivo — ceil(bytes/3)*4: ' +
   t.bytes_documentos_base64 + ' = ' + b64Esperado);
ok(docs.porArquivo.every(a => a.b64 === Math.ceil(a.bytes / 3) * 4),
   'cada arquivo individualmente: ' +
   docs.porArquivo.map(a => a.bytes + '->' + a.b64).join(' '));
ok(t.bytes_documentos_base64 / t.bytes_documentos_originais > 1.33,
   'o custo e de ~4/3 MAIS o padding de cada arquivo, que com arquivo pequeno ' +
   'pesa: ' + (t.bytes_documentos_base64 / t.bytes_documentos_originais).toFixed(2) +
   'x aqui. E o numero que vai decidir se precisamos de zip, nao um limite ' +
   'inventado agora');
ok(t.bytes_conteudo_json > 0 && t.bytes_pacote_json > t.bytes_conteudo_json,
   'e o pacote inteiro e medido: conteudo=' + t.bytes_conteudo_json +
   ' pacote=' + t.bytes_pacote_json + ' bytes');
ok(!('limite' in t) && !('maximo' in t),
   'nenhum limiar de MB foi inventado — os numeros servem para DECIDIR depois ' +
   'se precisa de aviso, zip ou export em varios arquivos');

/* ==================================================================== */
console.log('');
console.log('  6. GERAR NAO ESCREVE');
console.log('');
/* ==================================================================== */

/* T, U */
const leitura = await p.evaluate(async () => {
  const retrato = () => {
    const o = {};
    Object.keys(localStorage).sort().forEach(k => { o[k] = localStorage.getItem(k); });
    return JSON.stringify(o);
  };
  const chaves = () => Object.keys(localStorage).sort().join('|');

  const antes = retrato();
  const chavesAntes = chaves();
  const docsAntes = await window.ArquivoStore.listarTudo();
  const pacienteAntes = window.pacienteAtivoId ? window.pacienteAtivoId() : null;

  await window.Armazenamento.gerarBackupV2();
  await window.Armazenamento.gerarBackupV2();

  const docsDepois = await window.ArquivoStore.listarTudo();
  /* os blobs continuam legiveis e do mesmo tamanho depois de lidos */
  const tamanhos = await Promise.all(docsDepois.map(async (d) => {
    const r = await window.ArquivoStore.pegar(d.id);
    return r && r.arquivo ? r.arquivo.size : -1;
  }));

  return {
    intacto: retrato() === antes,
    chavesIguais: chaves() === chavesAntes,
    quantasChaves: Object.keys(localStorage).length,
    docsIguais: docsDepois.length === docsAntes.length,
    blobsLegiveis: tamanhos.every(x => x >= 0),
    pacienteIgual: (window.pacienteAtivoId ? window.pacienteAtivoId() : null) === pacienteAntes
  };
});

ok(leitura.intacto,
   'U — o localStorage esta byte a byte identico depois de gerar o V2 duas vezes');
ok(leitura.chavesIguais,
   'nenhuma chave de persistencia NOVA foi criada: ' + leitura.quantasChaves +
   ' chaves, as mesmas de antes');
ok(leitura.docsIguais && leitura.blobsLegiveis,
   'o IndexedDB tem a mesma contagem e os blobs continuam legiveis — ler o ' +
   'arrayBuffer nao consumiu nada');
ok(leitura.pacienteIgual, 'e o paciente ativo nao mudou');

const semRastro = await p.evaluate(() => {
  const proibidas = ['instalacao', 'installation', 'snapshot', 'transaction',
                     'lock', 'revisao', 'revision', 'backup'];
  return Object.keys(localStorage)
    .filter(k => proibidas.some(x => k.toLowerCase().indexOf(x) >= 0));
});
ok(semRastro.length === 0,
   'T — nenhum id de instalacao, snapshot, marcador de transacao, lock ou ' +
   'revisao global foi criado: isso e de etapas futuras');

/* ==================================================================== */
console.log('');
console.log('  7. O V1 CONTINUA EXISTINDO — MAS NAO E MAIS O BACKUP');
console.log('');
/* ==================================================================== */

const v1 = await p.evaluate(() => {
  const pacote = window.DadosLocais.exportar();
  return {
    versao: pacote.versao,
    temFormato: 'formato' in pacote,
    tabelas: Object.keys(pacote.tabelas).length,
    temQuestionario: JSON.stringify(pacote).indexOf('holohacking.questionario') >= 0,
    v2Existe: typeof window.Armazenamento.gerarBackupV2 === 'function',
    baixarExiste: typeof window.Armazenamento.baixarBackupV2 === 'function'
  };
});
ok(v1.versao === 1 && !v1.temFormato && v1.tabelas === 8,
   'DadosLocais.exportar() continua existindo e intocado: versao ' + v1.versao +
   ', ' + v1.tabelas + ' tabelas, sem campo `formato`');
ok(!v1.temQuestionario,
   'e continua incompleto do mesmo jeito — o V2 nao o consertou por acidente');
ok(v1.v2Existe && v1.baixarExiste, 'e o V2 continua exposto como API');

/* A tela mudou de motor. A fachada NAO foi apagada — dados.js e a camada de
   persistencia do app inteiro, e outras coisas dependem dela. O que deixou de
   existir e trata-la como backup. */
const quemChama = await p.evaluate(async () => {
  const perfil = await (await fetch('/perfil.js')).text();
  return {
    perfilChamaV2: /gerarBackupV2/.test(perfil),
    perfilUsaV1ComoBackup: /banco\(\)\.exportar\(\)|b\.exportar\(\)/.test(perfil),
    fachadaViva: typeof window.DadosLocais.exportar === 'function'
  };
});
ok(quemChama.perfilChamaV2,
   'o botao Exportar de perfil.js chama gerarBackupV2 — o V2 tem consumidor de UI');
ok(!quemChama.perfilUsaV1ComoBackup,
   'e NAO chama mais a fachada como backup: o V1 parou de ser o pacote oficial');
ok(quemChama.fachadaViva,
   'mas DadosLocais.exportar() segue vivo — deixou de ser backup, nao foi apagado');

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
