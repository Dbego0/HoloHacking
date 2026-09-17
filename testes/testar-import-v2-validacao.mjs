/**
 * VALIDACAO E DRY-RUN DO BACKUP V2 — P0.4a
 *
 * A pergunta desta rodada e uma so: "este pacote e estruturalmente valido, e
 * seria seguro tentar restaurar?" — respondida SEM ESCREVER NADA.
 *
 * Tres coisas que estes testes cobram e que sao faceis de errar:
 *
 *   ORFAO E AVISO, NAO ERRO. O V2 preserva orfaos de proposito: e o dado que
 *   so o backup alcanca. Recusar o pacote por causa dele seria recusar
 *   justamente a copia que o salvaria. E `_sem_paciente` nao e nem erro nem
 *   orfao — tem contagem propria.
 *
 *   NADA DO QUE O PACOTE DIZ DE SI E ACEITO. Hash, contagens e diagnostico
 *   sao todos recalculados. Um pacote que mente sobre as proprias contagens e
 *   exatamente o caso que isto existe para pegar.
 *
 *   TEXTO LIVRE PASSA INTEIRO. `<script>`, aspas, acento e emoji sao conteudo
 *   legitimo de uma resposta. Escapar e responsabilidade da SAIDA; bloquear
 *   aqui seria perder dado do paciente.
 *
 * E o teste mais importante do arquivo e o ultimo: ZERO ESCRITA.
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

/* Semeia um estado real e gera dele um V2 legitimo, que vira a base de todos
   os cenarios: cada teste parte de uma COPIA dele com um defeito injetado. */
await p.evaluate(async () => {
  localStorage.clear();
  const antigos = await window.ArquivoStore.listarTudo();
  await Promise.all(antigos.map(i => window.ArquivoStore.remover(i.id).catch(() => {})));
  const g = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const P = 'holohacking.dados.';
  g(P + 'pacientes', [
    { id: 'pac-A', nome: 'Ana Coração 🙂', created_at: '2026-01-01T10:00:00.000Z',
      telefone: '', observacao: null, arquivado: false, visitas: 0 },
    { id: 'pac-B', nome: 'Bruno Outro', created_at: '2026-01-02T10:00:00.000Z' }
  ]);
  g(P + 'aplicacoes', [
    { id: 'ap-1', paciente_id: 'pac-A', ferramenta_id: 'oq3',
      respostas: { quer: '<script>alert(1)</script> & "aspas" — ✨', consegue: null } },
    { id: 'ap-2', paciente_id: 'pac-FANTASMA', ferramenta_id: 'pqq', respostas: {} }
  ]);
  g(P + 'consultas', [{ id: 'c-1', paciente_id: 'pac-A' }]);
  g(P + 'bloqueios', [{ id: 'b-1', titulo: 'almoço' }]);
  g(P + 'holoscope', [{ id: 'h-1', paciente_id: 'pac-A', score_holos: 43 }]);
  g(P + 'oq3', [{ id: 'o-1', paciente_id: 'pac-A' }]);
  g(P + 'pqq', [{ id: 'q-1', paciente_id: 'pac-A' }]);
  g(P + 'perfil', [{ id: 'pf-1', nome: 'Nutricionista' }]);
  g('holohacking.questionario', {
    'pac-A': { m1: 3, m2: 0, m3: null, m4: false, m5: '' },
    'pac-FANTASMA': { m1: 2 },
    '_sem_paciente': { m1: 1 }
  });
  g('holohacking.pontuacao', { 'pac-A': [{ indice: 43 }, { indice: 61 }] });
  g('holohacking.exames', { 'pac-A': { ferritina: 30, b12: null } });
  localStorage.setItem('holohacking.aparencia', 'escuro');

  const texto = new Blob(['conteúdo 🙂'], { type: 'text/plain' });
  texto.name = 'nota.txt';
  const bin = new Blob([new Uint8Array([0xFF, 0x00, 0x41])],
    { type: 'application/octet-stream' });
  bin.name = 'b.bin';
  const vazio = new Blob([], { type: 'application/pdf' });
  vazio.name = 'v.pdf';
  await window.ArquivoStore.salvar('pac-A', texto, { nome: 'Nota', tipo: 'Outro', data: '2026-02-01' });
  await window.ArquivoStore.salvar('pac-B', bin, { nome: 'Bin', tipo: 'Exame', data: '2026-02-02' });
  await window.ArquivoStore.salvar('pac-A', vazio, { nome: 'Vazio', tipo: 'Exame', data: '2026-02-03' });
});

/* Roda um cenario: parte do V2 bom, aplica `mexer` numa copia, valida. */
const cenario = (mexer) => p.evaluate(async (fonte) => {
  const bom = await window.Armazenamento.gerarBackupV2();
  const copia = JSON.parse(JSON.stringify(bom));
  const mexido = new Function('pacote', fonte)(copia);
  const alvo = mexido === undefined ? copia : mexido;
  const r = await window.Armazenamento.validarBackupV2(alvo);
  return {
    valido: r.valido, tipo: r.tipo, porque: r.porque,
    erros: r.erros.map(e => ({ codigo: e.codigo, caminho: e.caminho })),
    avisos: r.avisos.map(a => ({ codigo: a.codigo, caminho: a.caminho,
                                 paciente_id: a.paciente_id, quantidade: a.quantidade })),
    resumo: r.resumo,
    aplicado: r.aplicado, escreveu: r.escreveu
  };
}, mexer);

/* Como se o pacote tivesse sido GERADO por uma versao mais nova: depois de
   mexer no conteudo, o hash e as contagens sao refeitos. Sem isso o teste
   estaria medindo "hash divergente", que ja tem cenario proprio. */
const cenarioRegerado = (mexer) => p.evaluate(async (fonte) => {
  const A = window.Armazenamento;
  const bom = await A.gerarBackupV2();
  const copia = JSON.parse(JSON.stringify(bom));
  new Function('pacote', fonte)(copia);
  copia.integridade.sha256_conteudo = await A.sha256DeTexto(
    A.textoCanonico(copia.conteudo));
  const r = await A.validarBackupV2(copia);
  return {
    valido: r.valido,
    erros: r.erros.map(e => ({ codigo: e.codigo, caminho: e.caminho })),
    avisos: r.avisos.map(a => ({ codigo: a.codigo })),
    resumo: r.resumo
  };
}, mexer);

const codigos = (r) => r.erros.map(e => e.codigo);
const temErro = (r, cod) => codigos(r).indexOf(cod) >= 0;
const temAviso = (r, cod) => r.avisos.some(a => a.codigo === cod);

/* ==================================================================== */
console.log('');
console.log('  1. RECONHECIMENTO');
console.log('');
/* ==================================================================== */

/* A — o V2 bom passa */
const bom = await cenario('return pacote;');
ok(bom.valido === true && bom.tipo === 'v2',
   'A — um V2 recem-gerado e VALIDO: erros=' + bom.erros.length);
ok(bom.aplicado === false && bom.escreveu === false,
   'e mesmo valido ele diz aplicado:false e escreveu:false — validar nao e ' +
   'importar. O importador existe (restaurar-backup.js); quem NAO escreve e ' +
   'esta funcao');

/* B — V1 reconhecido, nao confundido com lixo */
const v1 = await p.evaluate(async () => {
  const pacote = window.DadosLocais.exportar();
  const r = await window.Armazenamento.validarBackupV2(pacote);
  return { tipo: r.tipo, valido: r.valido, codigos: r.erros.map(e => e.codigo),
           porque: r.porque };
});
ok(v1.tipo === 'v1_legado' && v1.codigos.join(',') === 'FORMATO_V1_LEGADO',
   'B — um pacote V1 e reconhecido como `v1_legado`, com codigo proprio — ' +
   'nao como erro generico de JSON');
ok(v1.valido === false && /sem discriminador/.test(v1.porque),
   'e diz por que: ' + v1.porque);

/* C — JSON qualquer */
const quaisquer = await p.evaluate(async () => {
  const A = window.Armazenamento;
  const casos = {
    objetoVazio: {},
    arrayNaRaiz: [1, 2, 3],
    numero: 42,
    texto: 'oi',
    nulo: null,
    outroApp: { formato: 'outro-app', versao: 2 },
    semConteudo: { formato: 'holohacking-backup', versao: 2 }
  };
  const saida = {};
  for (const k of Object.keys(casos)) {
    const r = await A.validarBackupV2(casos[k]);
    saida[k] = { tipo: r.tipo, valido: r.valido, cods: r.erros.map(e => e.codigo) };
  }
  return saida;
});
ok(['objetoVazio', 'arrayNaRaiz', 'numero', 'texto', 'nulo', 'outroApp']
     .every(k => quaisquer[k].valido === false && quaisquer[k].tipo === 'desconhecido'),
   'C — objeto vazio, array na raiz, numero, string, null e pacote de outro ' +
   'app: todos recusados como `desconhecido`');
ok(quaisquer.semConteudo.tipo === 'v2' &&
   quaisquer.semConteudo.cods.indexOf('CAMPO_AUSENTE') >= 0,
   'um pacote com o discriminador certo mas SEM conteudo e reconhecido como ' +
   'V2 e recusado por campo ausente — que e a mensagem util');

/* D, E — versoes */
const versoes = await cenario('pacote.versao = 3; return pacote;');
ok(temErro(versoes, 'VERSAO_FUTURA'),
   'D — versao futura recusada com codigo proprio: ' + codigos(versoes).join(', '));
const v0 = await cenario('pacote.versao = 0; return pacote;');
ok(temErro(v0, 'VERSAO_ANTIGA'), 'versao zero idem');
const vStr = await cenario('pacote.versao = "2"; return pacote;');
ok(temErro(vStr, 'CAMPO_TIPO_INVALIDO'),
   'e "2" NAO e 2 — sem coercao silenciosa');

const manif = await cenario('pacote.manifesto_versao = 9; return pacote;');
ok(temErro(manif, 'MANIFESTO_VERSAO_NAO_SUPORTADA'),
   'E — manifesto incompativel tratado explicitamente, com a lista do que se ' +
   'entende: ' + JSON.stringify(manif.erros.find(
     e => e.codigo === 'MANIFESTO_VERSAO_NAO_SUPORTADA') || {}));

/* ==================================================================== */
console.log('');
console.log('  2. ENVELOPE E ARMAZENAMENTOS');
console.log('');
/* ==================================================================== */

const semCampo = await cenario('delete pacote.integridade; return pacote;');
ok(temErro(semCampo, 'CAMPO_AUSENTE'), 'campo obrigatorio ausente e erro');

const campoNovo = await cenario('pacote.contrabando = 1; return pacote;');
ok(temErro(campoNovo, 'CAMPO_DESCONHECIDO_ENVELOPE'),
   'campo desconhecido NO ENVELOPE e erro — o envelope e nosso e esta inteiro ' +
   'especificado');

const dataRuim = await cenario('pacote.criado_em = "ontem"; return pacote;');
ok(temErro(dataRuim, 'CRIADO_EM_INVALIDO'), 'criado_em nao-ISO e erro');

/* F, G */
const faltando = await cenario(
  'pacote.armazenamentos = pacote.armazenamentos.filter(x => x !== "exames");' +
  'delete pacote.conteudo.dados.exames; return pacote;');
ok(temErro(faltando, 'ARMAZENAMENTO_FALTANDO'),
   'F — armazenamento exportavel ausente e erro: ' +
   (faltando.erros.find(e => e.codigo === 'ARMAZENAMENTO_FALTANDO') || {}).caminho);

const estranho = await cenario(
  'pacote.armazenamentos.push("inventado");' +
  'pacote.conteudo.dados.inventado = []; return pacote;');
ok(temErro(estranho, 'ARMAZENAMENTO_DESCONHECIDO'),
   'G — armazenamento que nao esta no manifesto e erro');

const proibido = await cenario(
  'pacote.armazenamentos.push("aparencia");' +
  'pacote.conteudo.dados.aparencia = {}; return pacote;');
ok(temErro(proibido, 'ARMAZENAMENTO_PROIBIDO'),
   '`aparencia` existe no manifesto e NAO e exportavel: codigo proprio, nao ' +
   '"desconhecido"');

const marca = await cenario(
  'pacote.conteudo.dados["oq3.migrado"] = {}; return pacote;');
ok(temErro(marca, 'MARCA_OU_LEGADO_NO_PACOTE'),
   'marca de migracao dentro do pacote e erro — nao e dado');

const dup = await cenario('pacote.armazenamentos.push("exames"); return pacote;');
ok(temErro(dup, 'ARMAZENAMENTO_DUPLICADO'), 'id declarado duas vezes e erro');

/* ORDEM nao e requisito */
const ordem = await cenario('pacote.armazenamentos.reverse(); return pacote;');
ok(ordem.valido === true,
   'e a ORDEM do array de armazenamentos NAO e requisito: invertida, o pacote ' +
   'continua valido — a ordem nao deve virar exigencia acidental do formato');

/* T — consistencia bidirecional */
const declaradoSemConteudo = await cenario(
  'delete pacote.conteudo.dados.exames; return pacote;');
ok(temErro(declaradoSemConteudo, 'ARMAZENAMENTO_DECLARADO_SEM_CONTEUDO'),
   'T — declarar "exames" sem trazer o conteudo e erro');
const conteudoSemDeclarar = await cenario(
  'pacote.armazenamentos = pacote.armazenamentos.filter(x => x !== "arquivos");' +
  'return pacote;');
ok(temErro(conteudoSemDeclarar, 'ARMAZENAMENTO_NAO_DECLARADO'),
   'e trazer `conteudo.arquivos` sem declarar tambem — consistencia nos DOIS ' +
   'sentidos: manifesto <-> declaracao <-> conteudo');

/* ==================================================================== */
console.log('');
console.log('  3. FORMAS, TIPOS E POLUICAO');
console.log('');
/* ==================================================================== */

/* H */
const formaA = await cenario('pacote.conteudo.dados.pacientes = {}; return pacote;');
ok(temErro(formaA, 'FORMA_INVALIDA'),
   'H — objeto onde o manifesto pede lista e erro');
const formaB = await cenario('pacote.conteudo.dados.questionario = []; return pacote;');
ok(temErro(formaB, 'FORMA_INVALIDA'),
   'e array onde ele pede mapaPorPaciente tambem');
const formaC = await cenario('pacote.conteudo.dados.exames = null; return pacote;');
ok(temErro(formaC, 'FORMA_INVALIDA'), 'null estrutural idem');
const formaD = await cenario('pacote.conteudo.arquivos = {}; return pacote;');
ok(temErro(formaD, 'FORMA_INVALIDA'), 'e objeto onde a loja pede array');

/* J — nao-JSON */
const naoJson = await p.evaluate(async () => {
  const A = window.Armazenamento;
  const base = await A.gerarBackupV2();
  const saida = {};
  for (const [nome, valor] of [['Date', new Date()], ['Map', new Map()],
                               ['Set', new Set()], ['funcao', function () {}]]) {
    const c = JSON.parse(JSON.stringify(base));
    c.conteudo.dados.pacientes[0].estranho = valor;
    const r = await A.validarBackupV2(c);
    saida[nome] = r.erros.map(e => e.codigo).indexOf('VALOR_NAO_JSON') >= 0;
  }
  return saida;
});
ok(Object.keys(naoJson).every(k => naoJson[k]),
   'Date, Map, Set e funcao sao recusados: backup e JSON — ' +
   Object.keys(naoJson).join(', '));

/* I — prototype pollution, em varias profundidades */
const poluicao = await p.evaluate(async () => {
  const A = window.Armazenamento;
  const base = JSON.stringify(await A.gerarBackupV2());
  /* injeta por TEXTO: JSON.parse define __proto__ como propriedade PROPRIA,
     que e exatamente o vetor real — objeto literal so mexeria no prototipo */
  const casos = {
    envelope: base.replace('{"formato"', '{"__proto__":{"x":1},"formato"'),
    dados: base.replace('"pacientes":[', '"pacientes":[{"__proto__":{"x":1}},'),
    respostas: base.replace('"respostas":{', '"respostas":{"constructor":1,'),
    mapa: base.replace('"questionario":{', '"questionario":{"prototype":{"y":1},'),
    documento: base.replace('"arquivos":[', '"arquivos":[{"__proto__":{"z":1}},')
  };
  const saida = {};
  for (const k of Object.keys(casos)) {
    const r = await A.validarBackupV2(JSON.parse(casos[k]));
    const achou = r.erros.filter(e => e.codigo === 'CHAVE_PERIGOSA');
    saida[k] = { pegou: achou.length > 0, caminho: (achou[0] || {}).caminho,
                 valido: r.valido };
  }
  /* e o prototipo global continua limpo */
  saida.protoLimpo = ({}).x === undefined && ({}).y === undefined && ({}).z === undefined;
  return saida;
});
['envelope', 'dados', 'respostas', 'mapa', 'documento'].forEach(k => {
  ok(poluicao[k].pegou && poluicao[k].valido === false,
     'I — chave perigosa pega em ' + k + ': ' + poluicao[k].caminho);
});
ok(poluicao.protoLimpo,
   'e Object.prototype continua limpo — validar nao aplicou nada');

/* K — texto livre com HTML continua valido */
ok(bom.valido === true,
   'K — a resposta semeada contem `<script>alert(1)</script> & "aspas" — ✨` e ' +
   'o pacote e VALIDO: escapar e responsabilidade da saida, bloquear aqui ' +
   'seria perder a resposta do paciente');

/* ids improprios */
const idRuim = await cenario('pacote.conteudo.dados.pacientes[0].id = 42; return pacote;');
ok(temErro(idRuim, 'ID_INVALIDO'), 'id nao-string e erro');
const idEnorme = await cenario(
  'pacote.conteudo.dados.pacientes[0].id = "x".repeat(5000); return pacote;');
ok(temErro(idEnorme, 'ID_INVALIDO'), 'id de comprimento absurdo idem');

const idsReais = await p.evaluate(async () => {
  const A = window.Armazenamento;
  const base = await A.gerarBackupV2();
  /* os formatos que ESTE repositorio produz de verdade — nenhum pode ser
     recusado por um padrao inventado */
  const formatos = ['550e8400-e29b-41d4-a716-446655440000',
                    'id-m1x2y3-ab12cd34', 'pac-A', '_sem_paciente'];
  const saida = {};
  for (const id of formatos) {
    const c = JSON.parse(JSON.stringify(base));
    c.conteudo.dados.pacientes[0].id = id;
    const r = await A.validarBackupV2(c);
    saida[id] = r.erros.filter(e => e.codigo === 'ID_INVALIDO').length === 0;
  }
  return saida;
});
ok(Object.keys(idsReais).every(k => idsReais[k]),
   'e nenhum formato de id REAL deste repositorio e recusado — UUID, o ' +
   'fallback id-<b36>, ids importados e o sentinela: ' +
   Object.keys(idsReais).join(' · '));

/* ==================================================================== */
console.log('');
console.log('  4. ORFAOS E O SENTINELA');
console.log('');
/* ==================================================================== */

/* L, M */
ok(bom.valido === true && temAviso(bom, 'ORFAO_PRESERVADO'),
   'L — o pacote tem dado de `pac-FANTASMA`, que nao existe na raiz, e mesmo ' +
   'assim e VALIDO: orfao e AVISO, nunca erro');
ok(bom.erros.length === 0,
   'zero erros — recusar o pacote por causa do orfao seria recusar justamente ' +
   'a copia que salvaria esse dado');
const orfaosVistos = bom.avisos.filter(a => a.codigo === 'ORFAO_PRESERVADO');
ok(orfaosVistos.length >= 2 &&
   orfaosVistos.every(a => a.paciente_id === 'pac-FANTASMA'),
   'e o aviso diz onde e de quem: ' +
   orfaosVistos.map(a => a.caminho.replace('conteudo.dados.', '')).join(', '));

ok(temAviso(bom, 'SEM_PACIENTE_PRESERVADO'),
   'M — `_sem_paciente` tem aviso PROPRIO, com codigo diferente');
ok(!orfaosVistos.some(a => a.paciente_id === '_sem_paciente'),
   'e nao aparece entre os orfaos: nao e paciente removido, e o deposito de ' +
   'quem respondeu fora de um cadastro');
ok(bom.resumo.orfaos.length >= 2 && bom.resumo.sem_paciente.length >= 1,
   'o resumo separa os dois: ' + bom.resumo.orfaos.length + ' orfaos, ' +
   bom.resumo.sem_paciente.length + ' sentinela');

/* ==================================================================== */
console.log('');
console.log('  5. DOCUMENTOS');
console.log('');
/* ==================================================================== */

/* N, O, P */
const b64Ruim = await cenario(
  'pacote.conteudo.arquivos[0].conteudo_base64 = "!!!nao-e-base64!!!"; return pacote;');
ok(temErro(b64Ruim, 'BASE64_INVALIDO'),
   'N — base64 que nao decodifica e erro: ' +
   (b64Ruim.erros.find(e => e.codigo === 'BASE64_INVALIDO') || {}).caminho);

const shaRuim = await cenario(
  'pacote.conteudo.arquivos[0].sha256 = "0".repeat(64); return pacote;');
ok(temErro(shaRuim, 'DOCUMENTO_SHA_DIVERGENTE'),
   'O — SHA de documento que nao confere com os bytes e erro');

const bytesRuim = await cenario(
  'pacote.conteudo.arquivos[0].bytes = 999; return pacote;');
ok(temErro(bytesRuim, 'DOCUMENTO_BYTES_DIVERGENTE'),
   'P — tamanho declarado divergente do decodificado e erro');
const tamanhoRuim = await cenario(
  'pacote.conteudo.arquivos[0].tamanho = 999; return pacote;');
ok(temErro(tamanhoRuim, 'DOCUMENTO_TAMANHO_DIVERGENTE'),
   'e o `tamanho` original tambem e conferido contra os bytes que voltam');

const semCampoDoc = await cenario(
  'delete pacote.conteudo.arquivos[0].mime; return pacote;');
ok(temErro(semCampoDoc, 'DOCUMENTO_CAMPO_AUSENTE'),
   'documento sem campo obrigatorio e erro');

const docs = await p.evaluate(async () => {
  const pacote = await window.Armazenamento.gerarBackupV2();
  const r = await window.Armazenamento.validarBackupV2(pacote);
  const vazio = pacote.conteudo.arquivos.filter(a => a.bytes === 0)[0];
  return { quantos: r.resumo.documentos, bytes: r.resumo.bytes_documentos_reais,
           vazioValido: !!vazio && r.valido, extras: r.resumo.campos_extras_documentos };
});
ok(docs.quantos === 3 && docs.bytes > 0,
   'os 3 documentos foram conferidos, ' + docs.bytes + ' bytes decodificados');
ok(docs.vazioValido,
   'arquivo VAZIO e valido — 0 bytes e base64 "" nao sao defeito');

/* campo extra em documento: forward compatibility preservada */
const docExtra = await cenarioRegerado(
  'pacote.conteudo.arquivos[0].campo_do_futuro = "x";');
ok(docExtra.valido === true &&
   docExtra.resumo.campos_extras_documentos.campo_do_futuro === 1,
   'campo EXTRA num documento nao invalida — o P0.3 preserva de proposito o ' +
   'que ArquivoStore.pegar() devolver, e uma validacao rigida aqui destruiria ' +
   'essa compatibilidade. Ele sai no resumo, para dar para olhar: ' +
   JSON.stringify(docExtra.resumo.campos_extras_documentos));

const regExtra = await cenarioRegerado(
  'pacote.conteudo.dados.pacientes[0].campo_do_futuro = "x";');
ok(regExtra.valido === true &&
   regExtra.resumo.campos_vistos.pacientes.campo_do_futuro === 1,
   'idem num registro clinico: aceito e contabilizado, nunca recusado. Aqui o ' +
   'resumo lista os campos VISTOS, nao "extras" — uma linha de pacientes nao ' +
   'tem esquema declarado, entao nao ha o que chamar de irregular');

/* ==================================================================== */
console.log('');
console.log('  6. HASH, CONTAGENS E DIAGNOSTICO');
console.log('');
/* ==================================================================== */

/* Q, R */
const hashRuim = await cenario(
  'pacote.conteudo.dados.questionario["pac-A"].m1 = 2; return pacote;');
ok(temErro(hashRuim, 'HASH_GLOBAL_DIVERGENTE'),
   'Q — mexer UM valor no conteudo faz o hash global divergir: erro fatal');

const hashNulo = await cenario(
  'pacote.integridade.sha256_conteudo = null; return pacote;');
ok(temAviso(hashNulo, 'HASH_GLOBAL_AUSENTE') &&
   hashNulo.resumo.hash_conferido === false,
   'R — hash ausente (gerador sem crypto.subtle) e AVISO explicito, e o ' +
   'resumo diz hash_conferido:false — nao se finge integridade verificada');
ok(!temErro(hashNulo, 'HASH_GLOBAL_DIVERGENTE'),
   'e nao vira erro de divergencia: sao coisas diferentes e tem codigos ' +
   'diferentes');
ok(bom.resumo.hash_conferido === true,
   'no pacote bom, hash_conferido:true e o recalculo bate: ' +
   (bom.resumo.hash_recalculado || '').slice(0, 16) + '…');

const hashTorto = await cenario(
  'pacote.integridade.sha256_conteudo = "nao-e-hex"; return pacote;');
ok(temErro(hashTorto, 'HASH_GLOBAL_INVALIDO'),
   'hash que nao e SHA-256 em hex e erro de forma');

/* S */
const contagem = await cenario(
  'pacote.integridade.contagens.pacientes = 99; return pacote;');
ok(temErro(contagem, 'CONTAGEM_DIVERGENTE'),
   'S — contagem declarada que nao bate com o recalculo e erro: ' +
   JSON.stringify(contagem.erros.find(e => e.codigo === 'CONTAGEM_DIVERGENTE')));
ok(bom.resumo.contagens_recalculadas.pacientes === 2 &&
   bom.resumo.contagens_recalculadas.pontuacoes_total === 2 &&
   bom.resumo.contagens_recalculadas.arquivos === 3,
   'as contagens sao recalculadas do conteudo do PACOTE, nunca aceitas: ' +
   'pacientes=2, pontuacoes_total=2, arquivos=3');
const semContagens = await cenario(
  'delete pacote.integridade.contagens; return pacote;');
ok(temErro(semContagens, 'CONTAGENS_AUSENTES'),
   'pacote sem contagens e erro — nao ha o que conferir');

/* U */
const diagTorto = await cenario(
  'pacote.diagnostico.quantidade_orfaos = 0; pacote.diagnostico.ok = true; return pacote;');
ok(temAviso(diagTorto, 'DIAGNOSTICO_DIVERGENTE'),
   'U — o diagnostico do pacote NAO e aceito: recalculado sobre o conteudo, a ' +
   'divergencia vira aviso');
ok(diagTorto.resumo.diagnostico_recalculado.quantidade_orfaos > 0,
   'e o recalculo e feito sobre o CONTEUDO DO PACOTE, nao sobre o estado ' +
   'deste navegador: ' +
   JSON.stringify(diagTorto.resumo.diagnostico_recalculado));

/* Z */
const preservado = await p.evaluate(async () => {
  const pacote = await window.Armazenamento.gerarBackupV2();
  const r = await window.Armazenamento.validarBackupV2(pacote);
  const q = pacote.conteudo.dados.questionario['pac-A'];
  const pa = pacote.conteudo.dados.pacientes[0];
  return { valido: r.valido, m2: q.m2, m3: q.m3, m4: q.m4, m5: q.m5,
           nome: pa.nome, obs: pa.observacao, tel: pa.telefone,
           arq: pa.arquivado, vis: pa.visitas };
});
ok(preservado.valido && preservado.m2 === 0 && preservado.m3 === null &&
   preservado.m4 === false && preservado.m5 === '',
   'Z — null, 0, false e "" atravessam a validacao sem coercao');
ok(preservado.nome.indexOf('🙂') >= 0 && preservado.nome.indexOf('ç') >= 0,
   'e emoji e acento continuam inteiros: "' + preservado.nome + '"');

/* ==================================================================== */
console.log('');
console.log('  7. TEXTO CRU');
console.log('');
/* ==================================================================== */

const texto = await p.evaluate(async () => {
  const A = window.Armazenamento;
  const bomTexto = JSON.stringify(await A.gerarBackupV2());
  const fundo = (n) => '['.repeat(n) + ']'.repeat(n);
  const casos = {
    bom: bomTexto,
    truncado: bomTexto.slice(0, Math.floor(bomTexto.length / 2)),
    vazio: '',
    soEspacos: '   \n  ',
    arrayNaRaiz: '[1,2,3]',
    numero: '42',
    stringJson: '"oi"',
    profundo: fundo(500),
    poluicao: '{"formato":"holohacking-backup","__proto__":{"hackeado":1}}'
  };
  const saida = {};
  for (const k of Object.keys(casos)) {
    const r = await A.analisarTextoBackup(casos[k]);
    saida[k] = { valido: r.valido, tipo: r.tipo, cods: r.erros.map(e => e.codigo) };
  }
  saida.protoLimpo = ({}).hackeado === undefined;
  saida.naoUsaEval = A.analisarTextoBackup.toString().indexOf('eval(') === -1;
  return saida;
});
ok(texto.bom.valido === true, 'o mesmo pacote, como TEXTO, e valido');
ok(texto.truncado.cods.indexOf('JSON_INVALIDO') >= 0,
   'JSON truncado: JSON_INVALIDO');
ok(texto.vazio.cods.indexOf('JSON_VAZIO') >= 0 &&
   texto.soEspacos.cods.indexOf('JSON_VAZIO') >= 0,
   'texto vazio e so-espacos: JSON_VAZIO, com codigo proprio');
ok(!texto.arrayNaRaiz.valido && !texto.numero.valido && !texto.stringJson.valido,
   'array, numero e string na raiz: recusados sem estourar');
ok(!texto.profundo.valido,
   'JSON absurdamente aninhado e recusado sem derrubar a pagina: ' +
   texto.profundo.cods.join(', '));
ok(texto.poluicao.cods.indexOf('CHAVE_PERIGOSA') >= 0 && texto.protoLimpo,
   'e __proto__ vindo por texto e pego, com o prototipo global intacto');
ok(texto.naoUsaEval, 'nada de eval: so JSON.parse');

/* ==================================================================== */
console.log('');
console.log('  8. DRY-RUN');
console.log('');
/* ==================================================================== */

/* V */
const dry = await p.evaluate(async () => {
  const pacote = await window.Armazenamento.gerarBackupV2();
  return await window.Armazenamento.simularImportacaoV2(pacote);
});
ok(dry.valido === true && dry.aplicado === false && dry.escreveu === false,
   'V — o dry-run diz valido:true e, em voz alta, aplicado:false e ' +
   'escreveu:false');
ok(dry.importavel_nesta_versao === undefined &&
   dry.motivo_nao_importavel === undefined,
   'e NAO carrega mais o par obsoleto que dizia que o importador nao existia: ' +
   'ele existe, e o dry-run nao pode afirmar o contrario');
ok(dry.pacientes === 2 && dry.aplicacoes === 2 && dry.documentos === 3,
   'quantos: ' + dry.pacientes + ' pacientes, ' + dry.aplicacoes +
   ' aplicacoes, ' + dry.documentos + ' documentos');
ok(dry.orfaos >= 2 && dry.registros_orfaos >= 2 && dry.sem_paciente >= 1,
   'orfaos: ' + dry.orfaos + ' destino(s), ' + dry.registros_orfaos +
   ' registro(s); sentinela: ' + dry.sem_paciente);
ok(dry.substituidos.length === 12 &&
   dry.substituidos.every(s => s.id && s.forma !== undefined || s.id === 'arquivos'),
   'quais armazenamentos SERIAM substituidos: ' + dry.substituidos.length);
ok(dry.preservados.length === 1 && dry.preservados[0].id === 'aparencia',
   'e qual seria preservado: ' + dry.preservados[0].id + ' — ' +
   dry.preservados[0].porque);
ok(dry.hashes.global_conferido === true && dry.hashes.documentos_conferidos === true,
   'hashes verificados: global e o de cada documento');
ok(dry.tamanho.bytes_pacote > 0 && dry.tamanho.limite_tecnico === null,
   'tamanho medido (' + dry.tamanho.bytes_pacote + ' bytes) e limite tecnico ' +
   'NULO — nenhum maximo foi inventado; ha onde por quando houver evidencia');
ok(Array.isArray(dry.avisos) && dry.avisos.length > 0,
   'e os avisos viajam junto: ' +
   [...new Set(dry.avisos.map(a => a.codigo))].join(', '));

/* ==================================================================== */
console.log('');
console.log('  9. ZERO ESCRITA — o teste que importa');
console.log('');
/* ==================================================================== */

/* W, X, Y */
const zero = await p.evaluate(async () => {
  const retrato = () => {
    const o = {};
    Object.keys(localStorage).sort().forEach(k => { o[k] = localStorage.getItem(k); });
    return JSON.stringify(o);
  };
  const A = window.Armazenamento;

  const antes = retrato();
  const chavesAntes = Object.keys(localStorage).sort().join('|');
  const docsAntes = await window.ArquivoStore.listarTudo();
  const blobsAntes = await Promise.all(docsAntes.map(async d =>
    (await window.ArquivoStore.pegar(d.id)).arquivo.size));
  const pacienteAntes = window.pacienteAtivoId ? window.pacienteAtivoId() : null;
  const secaoAntes = document.querySelector('.nav-item.ativo')
    ? document.querySelector('.nav-item.ativo').dataset.secao : null;

  /* tudo o que esta rodada criou, incluindo os caminhos de erro */
  const pacote = await A.gerarBackupV2();
  await A.validarBackupV2(pacote);
  await A.analisarBackupV2(pacote);
  await A.simularImportacaoV2(pacote);
  await A.analisarTextoBackup(JSON.stringify(pacote));
  await A.validarBackupV2(window.DadosLocais.exportar());
  await A.validarBackupV2({ lixo: true });
  await A.analisarTextoBackup('{quebrado');
  await A.validarBackupV2(JSON.parse('{"formato":"holohacking-backup","__proto__":{"x":1}}'));

  const docsDepois = await window.ArquivoStore.listarTudo();
  const blobsDepois = await Promise.all(docsDepois.map(async d =>
    (await window.ArquivoStore.pegar(d.id)).arquivo.size));

  const proibidas = ['snapshot', 'transaction', 'lock', 'revision', 'revisao',
                     'restore', 'restaur', 'import'];
  return {
    intacto: retrato() === antes,
    chavesIguais: Object.keys(localStorage).sort().join('|') === chavesAntes,
    quantas: Object.keys(localStorage).length,
    docsIguais: docsDepois.length === docsAntes.length,
    blobsIguais: blobsDepois.join(',') === blobsAntes.join(','),
    pacienteIgual: (window.pacienteAtivoId ? window.pacienteAtivoId() : null) === pacienteAntes,
    secaoIgual: (document.querySelector('.nav-item.ativo')
      ? document.querySelector('.nav-item.ativo').dataset.secao : null) === secaoAntes,
    novasChaves: Object.keys(localStorage)
      .filter(k => proibidas.some(x => k.toLowerCase().indexOf(x) >= 0))
  };
});

ok(zero.intacto,
   'W — o localStorage esta BYTE A BYTE identico depois de 9 validacoes, ' +
   'incluindo os caminhos de erro');
ok(zero.chavesIguais && zero.novasChaves.length === 0,
   'nenhuma chave nova: nem snapshot, nem lock, nem transaction, nem revision, ' +
   'nem restore, nem import — ' + zero.quantas + ' chaves, as mesmas');
ok(zero.docsIguais && zero.blobsIguais,
   'X — o IndexedDB tem a mesma contagem e os blobs o mesmo tamanho');
ok(zero.pacienteIgual && zero.secaoIgual,
   'Y — paciente ativo e secao da tela inalterados');

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
