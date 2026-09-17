/**
 * BACKUP PELA INTERFACE — o fio entre o botao e o motor V2.
 *
 * O motor V2 (gerar, validar, dry-run, aplicar, rollback, V1) ja era testado
 * por testar-backup-v2, testar-import-v2-validacao, testar-import-v2-aplicacao
 * e testar-import-v1-compatibilidade. O que NINGUEM testava era se a tela
 * chamava esse motor — e ela nao chamava: o botao Exportar produzia um V1 com
 * 8 tabelas, sem as respostas, sem o historico de mapas, sem os exames e sem
 * um unico arquivo.
 *
 * Este arquivo cobra a LIGACAO, nao o motor:
 *
 *   A      o botao gera V2, e nao chama mais DadosLocais.exportar().
 *   B..F   o pacote que a TELA produziu traz as quatro caixas que faltavam,
 *          os documentos, e continua trazendo o que ja vinha.
 *   G      aparencia continua de fora — o manifesto manda, e esta certo.
 *   H      um V1 antigo ainda entra, com o aviso de restauracao parcial.
 *   I      arquivo invalido nao encosta no dado.
 *   J      falha no meio da restauracao e relatada como REVERTIDA, e o dado
 *          volta — a tela nao pode chamar de sucesso o que o motor desfez.
 *   K/L/M  ida e volta: exportar, limpar, importar, e conferir que voltou o
 *          mesmo — inclusive o paciente que nao era o do meio, e inclusive o
 *          snapshot clinico byte a byte (restaurar NAO recalcula nada).
 */
import puppeteer from 'puppeteer-core';

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1400, height: 1100 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };
const UNICODE = 'Coração ✨ ãéîõü 日本語 🙂';

/* Semeia um universo com tudo o que o V1 deixava para tras. */
async function semear() {
  return p.evaluate(async (UNICODE) => {
    localStorage.clear();
    const antigos = await window.ArquivoStore.listarTudo();
    await Promise.all(antigos.map(i => window.ArquivoStore.remover(i.id).catch(() => {})));

    const g = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    const P = 'holohacking.dados.';
    g(P + 'pacientes', [
      { id: 'pac-A', nome: 'Ana ' + UNICODE, created_at: '2026-01-01T10:00:00.000Z', status: 'ativo' },
      { id: 'pac-B', nome: 'Bruno Outro', created_at: '2026-01-02T10:00:00.000Z', status: 'ativo' }
    ]);
    g(P + 'consultas', [{ id: 'c-1', paciente_id: 'pac-A', data: '2026-02-10',
                          hora: '09:00', duracao: 60, tipo: 'Retorno', nota: UNICODE }]);
    g(P + 'aplicacoes', [{ id: 'ap-1', paciente_id: 'pac-B', ferramenta_id: 'oq3',
                           status: 'concluida', respostas: { a: UNICODE, b: null, c: 0 } }]);
    g(P + 'perfil', [{ id: 'eu', nome: 'Nutri ' + UNICODE, registro: 'CRN-99999' }]);
    g(P + 'holoscope', [{ id: 'h-1', paciente_id: 'pac-A', score_holos: 43 }]);
    g(P + 'oq3', []); g(P + 'pqq', []); g(P + 'bloqueios', []);

    /* As QUATRO que o V1 nunca levou. */
    g('holohacking.questionario', { 'pac-A': { 'SNT-101': 3, 'EMO-002': 1 },
                                    '_sem_paciente': { 'SNT-999': 2 } });
    g('holohacking.pontuacao', {
      /* Snapshots com a forma que o motor realmente devolve — `cobertura`
         inclusive. Sem ela, desenharPontuacao() quebra em app.js:2180, que le
         r.cobertura.respondidos sem defesa. Isso e uma fragilidade de verdade
         do render (esta relatada), mas nao e o que ESTE arquivo testa: um
         fixture irreal so trocaria o assunto. */
      'pac-A': [
        { quando: '2026-01-15', versao_estrutura: 2, indice: 43, avaliavel: true,
          cobertura: { respondidos: 2, total: 84, percentual: 2 },
          triada: { fisico: 4.1, mental: 6.2, espiritual: 7.3 },
          triada_com_dado: { fisico: true, mental: true, espiritual: true },
          sistemas: [{ sistema: 'fungico', nome: 'Sistema Fúngico', nota: 2.5,
                       carga: 7.5, faixa: 'baixo', avaliavel: true,
                       respondidos: 2, total_marcadores: 20, dominantes: [] }],
          frequencias: [], territorios: [], combinacoes: [], aprofundamentos: [],
          auditoria: [{ marcador_id: 'SNT-101', peso: 2, resposta: 3, pontos: 6 }],
          interpretacao: { texto: 'Nota clinica ' + UNICODE, quando_escrita: '2026-01-15', versao: 1 } },
        { quando: '2026-02-15', versao_estrutura: 2, indice: 51, avaliavel: true,
          cobertura: { respondidos: 4, total: 84, percentual: 5 },
          triada: { fisico: 5.0, mental: 6.0, espiritual: 7.0 },
          triada_com_dado: { fisico: true, mental: true, espiritual: true },
          sistemas: [], frequencias: [], territorios: [], combinacoes: [],
          aprofundamentos: [], auditoria: [] }
      ],
      'pac-B': [{ quando: '2026-01-20', versao_estrutura: 2, indice: 60, avaliavel: true,
                  cobertura: { respondidos: 1, total: 84, percentual: 1 },
                  triada: { fisico: 6, mental: 6, espiritual: 6 },
                  triada_com_dado: { fisico: true, mental: true, espiritual: true },
                  sistemas: [], frequencias: [], territorios: [], combinacoes: [],
                  aprofundamentos: [], auditoria: [] }]
    });
    g('holohacking.exames', { 'pac-A': { 'EXA-005': 115, 'EXA-016': 0.6 },
                              'pac-B': { 'EXA-020': 600 } });
    g('holohacking.aparencia', { tema: 'escuro' });

    /* Tres arquivos: texto do paciente A, binario do paciente B, e um do
       perfil (a assinatura, que mora sob o sentinela _perfil). */
    const mk = (bytes, nome, mime) => new File([bytes], nome, { type: mime });
    await window.ArquivoStore.salvar('pac-A',
      mk('laudo em texto ' + UNICODE, 'laudo.txt', 'text/plain'),
      { nome: 'Laudo A', tipo: 'Laudo', data: '2026-01-10' });
    await window.ArquivoStore.salvar('pac-B',
      mk(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0xfe, 0x00, 0x01]), 'exame.pdf', 'application/pdf'),
      { nome: 'PDF B', tipo: 'Exame laboratorial', data: '2026-02-01' });
    await window.ArquivoStore.salvar('_perfil',
      mk(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'assinatura.png', 'image/png'),
      { nome: 'Assinatura', tipo: 'Assinatura', data: '2026-01-01' });

    return true;
  }, UNICODE);
}

async function irParaPerfil() {
  await p.evaluate(async () => {
    document.querySelector('.nav-item[data-secao="perfil"]').click();
    await new Promise(r => setTimeout(r, 300));
    const aba = document.querySelector('[data-aba-perfil="conta"], [data-aba="conta"]');
    if (aba) aba.click();
    await new Promise(r => setTimeout(r, 200));
  });
}

await semear();
await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await irParaPerfil();

/* ==================================================================== */
console.log('\n  A — O BOTAO EXPORTAR USA O MOTOR V2\n');
/* ==================================================================== */

const exportado = await p.evaluate(async () => {
  const A = window.Armazenamento;
  /* Espiao: captura o pacote em vez de baixar (download em headless nao ajuda
     ninguem), e marca se a fachada V1 foi chamada como backup. */
  let pacote = null, v1Chamado = false, v2Chamado = false;
  const origBaixar = A.baixarBackupV2;
  const origGerar = A.gerarBackupV2;
  const origV1 = window.DadosLocais.exportar;
  A.gerarBackupV2 = function () { v2Chamado = true; return origGerar.apply(A, arguments); };
  A.baixarBackupV2 = function (pac) { pacote = pac; return { bytes: 123, nome: 'teste.json' }; };
  window.DadosLocais.exportar = function () { v1Chamado = true; return origV1.apply(this, arguments); };

  const botao = document.getElementById('btn-exportar');
  const rotulo = botao ? botao.textContent.trim() : '';
  botao.click();
  await new Promise(r => setTimeout(r, 1500));

  A.baixarBackupV2 = origBaixar; A.gerarBackupV2 = origGerar;
  window.DadosLocais.exportar = origV1;

  return {
    rotulo, v1Chamado, v2Chamado,
    aviso: document.getElementById('conta-aviso').textContent,
    rotuloImportar: (document.getElementById('btn-importar') || {}).textContent,
    formato: pacote && pacote.formato,
    versao: pacote && pacote.versao,
    armazenamentos: pacote ? pacote.armazenamentos : [],
    temHash: !!(pacote && pacote.integridade && pacote.integridade.sha256_conteudo),
    dados: pacote ? Object.keys(pacote.conteudo.dados) : [],
    conteudo: pacote ? pacote.conteudo : null,
    documentos: pacote ? pacote.conteudo.arquivos : []
  };
});

ok(exportado.v2Chamado, 'o clique em Exportar chama Armazenamento.gerarBackupV2()');
ok(!exportado.v1Chamado, 'e NAO chama mais DadosLocais.exportar() como backup');
ok(exportado.formato === 'holohacking.backup' || typeof exportado.formato === 'string',
   'o pacote entregue tem o discriminador de formato: ' + exportado.formato);
ok(exportado.versao === 2, 'e diz versao 2: ' + exportado.versao);
ok(exportado.temHash, 'com sha256 do conteudo canonico');
ok(/backup completo/i.test(exportado.rotulo), 'o botao diz o que faz: "' + exportado.rotulo + '"');
ok(/importar backup/i.test(exportado.rotuloImportar || ''),
   'e o de importar tambem: "' + (exportado.rotuloImportar || '').trim() + '"');
ok(/completo/i.test(exportado.aviso), 'o aviso confirma: "' + exportado.aviso + '"');

/* ==================================================================== */
console.log('\n  B/C/D/E — AS QUATRO CAIXAS QUE FALTAVAM, E OS ARQUIVOS\n');
/* ==================================================================== */

const d = exportado.conteudo ? exportado.conteudo.dados : {};
ok(d.questionario && Object.keys(d.questionario).length === 2,
   'B — questionario entra no backup: ' + Object.keys(d.questionario || {}).join(', '));
ok(d.pontuacao && d.pontuacao['pac-A'] && d.pontuacao['pac-A'].length === 2,
   'C — pontuacao entra, com as DUAS aplicacoes de pac-A');
ok(!!(d.pontuacao && d.pontuacao['pac-A'][0].interpretacao),
   'C — e a interpretacao profissional vem junto, dentro do snapshot');
ok(d.exames && d.exames['pac-A'] && d.exames['pac-A']['EXA-005'] === 115,
   'D — exames entram com o valor exato: EXA-005 = ' +
   (d.exames && d.exames['pac-A'] ? d.exames['pac-A']['EXA-005'] : '?'));
ok(exportado.documentos.length === 3,
   'E — os 3 arquivos do IndexedDB entram: ' + exportado.documentos.length);
ok(exportado.documentos.every(a => typeof a.conteudo_base64 === 'string' && a.conteudo_base64.length > 0),
   'E — com o conteudo em base64, nao so o metadado');
ok(exportado.documentos.every(a => typeof a.sha256 === 'string'),
   'E — e cada arquivo com seu proprio sha256');
ok(!!exportado.documentos.find(a => a.paciente === '_perfil'),
   'E — inclusive o arquivo do perfil (assinatura), sob o sentinela _perfil');
ok(!!exportado.documentos.find(a => a.mime === 'application/pdf'),
   'E — e o PDF binario');

/* ==================================================================== */
console.log('\n  F/G — O QUE JA VINHA CONTINUA; APARENCIA CONTINUA FORA\n');
/* ==================================================================== */

['pacientes', 'consultas', 'aplicacoes', 'perfil', 'holoscope', 'oq3', 'pqq', 'bloqueios']
  .forEach(t => ok(Object.prototype.hasOwnProperty.call(d, t), 'F — ' + t + ' continua no backup'));
ok(!Object.prototype.hasOwnProperty.call(d, 'aparencia'),
   'G — aparencia NAO entra: e preferencia deste navegador, nao prontuario');
ok(exportado.armazenamentos.length === 12,
   'sao os 12 armazenamentos exportaveis do manifesto: ' + exportado.armazenamentos.length);

/* ==================================================================== */
console.log('\n  L/K/M — IDA E VOLTA PELA INTERFACE\n');
/* ==================================================================== */

/* Guarda o pacote como texto, limpa TUDO, e importa pelo input de arquivo. */
const antes = await p.evaluate(() => ({
  pacientes: JSON.parse(localStorage.getItem('holohacking.dados.pacientes') || '[]').length,
  questionario: localStorage.getItem('holohacking.questionario'),
  pontuacao: localStorage.getItem('holohacking.pontuacao'),
  exames: localStorage.getItem('holohacking.exames')
}));

await p.evaluate(async () => {
  const A = window.Armazenamento;
  const pacote = await A.gerarBackupV2();
  window.__texto = A.serializarBackupV2(pacote);
  /* Limpa o universo inteiro, como um navegador novo. */
  localStorage.clear();
  const its = await window.ArquivoStore.listarTudo();
  await Promise.all(its.map(i => window.ArquivoStore.remover(i.id).catch(() => {})));
});

const vazio = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('holohacking.dados.pacientes') || '[]').length);
ok(vazio === 0, 'ambiente limpo antes de importar: ' + vazio + ' pacientes');

await p.evaluate(async () => {
  window.confirm = () => true;               // o dry-run ja perguntou; o teste aceita
  const dt = new DataTransfer();
  dt.items.add(new File([window.__texto], 'backup.json', { type: 'application/json' }));
  const input = document.getElementById('arq-importar');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
/* A tela recarrega sozinha quando o motor diz precisa_recarregar. */
await p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());

const depois = await p.evaluate(async () => ({
  pacientes: JSON.parse(localStorage.getItem('holohacking.dados.pacientes') || '[]'),
  questionario: localStorage.getItem('holohacking.questionario'),
  pontuacao: localStorage.getItem('holohacking.pontuacao'),
  exames: localStorage.getItem('holohacking.exames'),
  aplicacoes: JSON.parse(localStorage.getItem('holohacking.dados.aplicacoes') || '[]').length,
  consultas: JSON.parse(localStorage.getItem('holohacking.dados.consultas') || '[]').length,
  arquivos: (await window.ArquivoStore.listarTudo()).map(a => a.paciente).sort()
}));

ok(depois.pacientes.length === antes.pacientes,
   'L — voltaram os ' + depois.pacientes.length + ' pacientes');
ok(depois.questionario === antes.questionario, 'L — questionario voltou IDENTICO');
ok(depois.exames === antes.exames, 'L — exames voltaram IDENTICOS');
ok(depois.aplicacoes === 1 && depois.consultas === 1,
   'L — aplicacoes e consultas voltaram: ' + depois.aplicacoes + ' / ' + depois.consultas);
ok(depois.arquivos.length === 3, 'L — os 3 arquivos voltaram: ' + depois.arquivos.join(', '));
ok(depois.arquivos.includes('_perfil'), 'L — inclusive o do perfil');

const bruno = depois.pacientes.find(x => x.id === 'pac-B');
ok(!!bruno && bruno.nome === 'Bruno Outro',
   'K — o paciente que nao era o do meio continua inteiro: ' + (bruno && bruno.nome));
ok(JSON.parse(depois.pontuacao)['pac-B'].length === 1,
   'K — e o historico DELE tambem');

/* M — restaurar nao recalcula: o snapshot volta byte a byte, com a
   interpretacao, a triada e a auditoria que estavam la. */
ok(depois.pontuacao === antes.pontuacao,
   'M — o snapshot clinico voltou byte a byte; nada foi recalculado');
const pa = JSON.parse(depois.pontuacao)['pac-A'];
ok(pa[0].interpretacao && /Nota clinica/.test(pa[0].interpretacao.texto),
   'M — a interpretacao profissional sobreviveu');
ok(pa[0].auditoria.length === 1 && pa[0].triada.fisico === 4.1,
   'M — auditoria e triada intactas, com o mesmo numero');

/* ==================================================================== */
console.log('\n  I — ARQUIVO INVALIDO NAO ENCOSTA NO DADO\n');
/* ==================================================================== */

await irParaPerfil();
const invalido = await p.evaluate(async () => {
  const antes = JSON.stringify(localStorage);
  window.confirm = () => true;              // mesmo dizendo sim, nao deve passar
  const resultados = [];
  for (const [nome, texto] of [
    ['nao e JSON', 'isto nao e json {{{'],
    ['JSON sem formato', JSON.stringify({ qualquer: 'coisa' })],
    ['V2 corrompido', JSON.stringify({ formato: 'holohacking.backup', versao: 2,
                                        conteudo: { dados: 'nao e objeto' } })]
  ]) {
    const dt = new DataTransfer();
    dt.items.add(new File([texto], 'x.json', { type: 'application/json' }));
    const input = document.getElementById('arq-importar');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    resultados.push({ nome, aviso: document.getElementById('conta-aviso').textContent });
  }
  return { resultados, mudou: JSON.stringify(localStorage) !== antes };
});
invalido.resultados.forEach(r =>
  ok(/não é um backup|inválido|NADA foi alterado/i.test(r.aviso),
     'I — "' + r.nome + '" e recusado: "' + r.aviso.slice(0, 70) + '"'));
ok(!invalido.mudou, 'I — e o localStorage nao mudou um byte depois das 3 tentativas');

/* ==================================================================== */
console.log('\n  J — FALHA NO MEIO E RELATADA COMO REVERTIDA\n');
/* ==================================================================== */

const rollback = await p.evaluate(async () => {
  const A = window.Armazenamento;
  const antes = localStorage.getItem('holohacking.dados.pacientes');
  const texto = A.serializarBackupV2(await A.gerarBackupV2());
  /* Injeta o failpoint do motor pela porta que ele mesmo oferece. O rollback
     de verdade ja e testado em testar-import-v2-aplicacao; aqui o que se cobra
     e a TELA nao chamar de sucesso o que foi desfeito. */
  const orig = A.aplicarBackupV2;
  A.aplicarBackupV2 = function (pac, op) {
    return orig.call(A, pac, Object.assign({}, op, { failpointDeTeste: 'antes_da_verificacao' }));
  };
  window.confirm = () => true;
  const dt = new DataTransfer();
  dt.items.add(new File([texto], 'b.json', { type: 'application/json' }));
  const input = document.getElementById('arq-importar');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 3000));
  A.aplicarBackupV2 = orig;
  return {
    aviso: document.getElementById('conta-aviso').textContent,
    intacto: localStorage.getItem('holohacking.dados.pacientes') === antes
  };
});
ok(/DEVOLVIDO|revert/i.test(rollback.aviso),
   'J — a tela diz que o estado anterior foi devolvido: "' + rollback.aviso.slice(0, 90) + '"');
ok(!/Restaurado:/.test(rollback.aviso), 'J — e NAO chama de sucesso');
ok(rollback.intacto, 'J — os pacientes continuam exatamente como estavam');

/* ==================================================================== */
console.log('\n  H — O V1 LEGADO AINDA ENTRA, COM O AVISO DA PERDA\n');
/* ==================================================================== */

await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await irParaPerfil();

const v1 = await p.evaluate(async () => {
  /* Um V1 de verdade: versao 1 + tabelas, sem discriminador. */
  const pacoteV1 = { versao: 1, quando: '2026-01-01T00:00:00.000Z', tabelas: {
    pacientes: [{ id: 'v1-p1', nome: 'Paciente do V1', created_at: '2025-06-01T10:00:00.000Z' }],
    consultas: [], aplicacoes: [], bloqueios: [], holoscope: [], oq3: [], pqq: [],
    perfil: [{ id: 'eu', nome: 'Nutri V1' }]
  } };
  /* O texto do confirm fica numa variavel GLOBAL de proposito: quando a
     restauracao der certo a pagina recarrega sozinha, e uma variavel local
     do evaluate morre junto com o contexto antes de conseguirmos ler. */
  window.__confirmV1 = '';
  window.confirm = (msg) => { window.__confirmV1 = msg; return true; };
  const dt = new DataTransfer();
  dt.items.add(new File([JSON.stringify(pacoteV1)], 'antigo.json', { type: 'application/json' }));
  const input = document.getElementById('arq-importar');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  /* Curto: o motor recarrega a pagina ~1,2s depois de aplicar. Lemos o aviso
     ANTES disso e deixamos a navegacao para o lado de fora. */
  await new Promise(r => setTimeout(r, 800));
  return { textoDoAviso: window.__confirmV1,
           aviso: document.getElementById('conta-aviso').textContent };
});
ok(/PARCIAL LEGADO/i.test(v1.textoDoAviso),
   'H — o V1 e reconhecido e anunciado como BACKUP PARCIAL LEGADO');
ok(/respostas do questionário/i.test(v1.textoDoAviso) && /valores de exame/i.test(v1.textoDoAviso),
   'H — e a tela NOMEIA o que sera apagado, em vez de dizer "alguns dados"');
ok(/arquivos/i.test(v1.textoDoAviso), 'H — inclusive os arquivos');

/* A pagina recarrega sozinha depois de aplicar — esperamos a navegacao aqui
   fora, onde o contexto de execucao pode morrer sem levar o teste junto. */
await p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados())
  .catch(() => {});
const depoisV1 = await p.evaluate(() =>
  JSON.parse(localStorage.getItem('holohacking.dados.pacientes') || '[]'));
ok(depoisV1.length === 1 && depoisV1[0].id === 'v1-p1',
   'H — e o V1 foi de fato aplicado: ' + depoisV1.map(x => x.nome).join(', '));

await nav.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
