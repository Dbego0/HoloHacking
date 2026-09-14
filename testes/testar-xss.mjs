/**
 * XSS ARMAZENADO NO HISTÓRICO DO OQ³ E DO PQQ.
 *
 * O que era: o resumo de cada aplicação no histórico — a resposta "O que
 * quer" no OQ³, o "pra que" verdadeiro no PQQ — entrava CRU em innerHTML.
 * Todo o resto do app escapa; estes dois pontos não escapavam. Quem digita
 * é a nutricionista, então hoje seria self-XSS; mas o importar() aceita
 * qualquer JSON de terceiro, e é por aí que vira vetor de verdade.
 *
 * O que se cobra aqui:
 *   - o conteúdo GUARDADO não muda: um "<" continua sendo "<" em respostas;
 *   - a SAÍDA é escapada: o payload aparece como texto;
 *   - nenhum elemento é criado no DOM;
 *   - window.__xss continua intocado.
 *
 * Não há sanitização na entrada, de propósito: escapar na saída é o que
 * preserva a resposta do paciente exatamente como ela foi dita.
 *
 * O mesmo dado chegava cru por um SEGUNDO caminho — o card de OQ³/PQQ na aba
 * Formulários da ficha, que monta um resumo com as mesmas respostas. Os dois
 * caminhos estão fechados, e os dois são cobrados aqui.
 */
import puppeteer from 'puppeteer-core';

const PAYLOAD = '<img src=x onerror="window.__xss=1">';

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1400, height: 1400 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

const novaPaciente = (nome) => p.evaluate(async (n) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = n;
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 420));
  return window.pacienteAtivoId();
});

/* ==================================================================== */
console.log('\n  OQ³ — histórico\n');
/* ==================================================================== */

await novaPaciente('Marina Alves');

const oq3 = await p.evaluate(async (payload) => {
  const set = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  document.querySelector('.nav-item[data-secao="corpo"]').click();
  document.querySelector('[data-vista="vista-oq3"]').click();
  await new Promise(r => setTimeout(r, 450));

  /* primeira aplicação, com o payload no campo que vira resumo do histórico */
  set('oq3-quer', payload);
  set('oq3-precisa', 'texto normal');
  document.getElementById('btn-salvar-oq3').click();
  await new Promise(r => setTimeout(r, 470));

  /* o histórico só desenha a partir da segunda aplicação */
  document.getElementById('btn-nova-oq3').click();
  await new Promise(r => setTimeout(r, 450));
  set('oq3-quer', 'segunda aplicacao');
  document.getElementById('btn-salvar-oq3').click();
  await new Promise(r => setTimeout(r, 470));

  const caixa = document.getElementById('oq3-historico');
  const resumos = [...caixa.querySelectorAll('.ferr-hist-leitura')];
  return {
    visivel: !caixa.classList.contains('hidden'),
    quantos: resumos.length,
    textos: resumos.map(e => e.textContent),
    /* o payload vira elemento? */
    imgs: caixa.querySelectorAll('img').length,
    elementosNoResumo: resumos.reduce((n, e) => n + e.children.length, 0),
    htmlDoResumo: resumos.map(e => e.innerHTML),
    xss: typeof window.__xss,
    /* e o que foi GUARDADO — precisa estar intacto */
    guardado: window.Aplicacoes.historico('oq3')
      .map(a => a.respostas && a.respostas.quer)
  };
}, PAYLOAD);

ok(oq3.visivel && oq3.quantos === 2,
   'o histórico do OQ³ desenha as duas aplicações: ' + oq3.quantos);
ok(oq3.xss === 'undefined',
   'window.__xss NÃO foi definido — o onerror não executou: ' + oq3.xss);
ok(oq3.imgs === 0,
   'nenhum <img> foi criado no histórico: ' + oq3.imgs);
ok(oq3.elementosNoResumo === 0,
   'e o resumo não tem NENHUM elemento filho — é só texto: ' + oq3.elementosNoResumo);
ok(oq3.textos.some(t => t === PAYLOAD),
   'o payload aparece como TEXTO, literal e inteiro: ' +
   JSON.stringify(oq3.textos.find(t => t.indexOf('<img') >= 0) || ''));
ok(oq3.htmlDoResumo.some(h => h.indexOf('&lt;img') >= 0),
   'no HTML ele está escapado: ' +
   (oq3.htmlDoResumo.find(h => h.indexOf('&lt;') >= 0) || '').slice(0, 45));
ok(oq3.guardado.indexOf(PAYLOAD) >= 0,
   'e o conteúdo GUARDADO continua idêntico — nada foi removido da resposta');

/* ==================================================================== */
console.log('\n  PQQ — histórico\n');
/* ==================================================================== */

const pqq = await p.evaluate(async (payload) => {
  const set = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  document.querySelector('.nav-item[data-secao="mente"]').click();
  document.querySelector('[data-vista="vista-pqq"]').click();
  await new Promise(r => setTimeout(r, 450));

  /* o resumo do PQQ é `verdadeiro`, com `objetivo` como segunda opção de
     EXIBIÇÃO quando verdadeiro está vazio. Os dois caminhos são testados. */
  set('pqq-verdadeiro', payload);
  set('pqq-objetivo', 'objetivo normal');
  document.getElementById('btn-salvar-pqq').click();
  await new Promise(r => setTimeout(r, 470));

  document.getElementById('btn-nova-pqq').click();
  await new Promise(r => setTimeout(r, 450));
  /* segunda: verdadeiro VAZIO e payload no objetivo — exercita o outro ramo */
  set('pqq-objetivo', payload);
  set('pqq-verdadeiro', '');
  document.getElementById('btn-salvar-pqq').click();
  await new Promise(r => setTimeout(r, 470));

  const caixa = document.getElementById('pqq-historico');
  const resumos = [...caixa.querySelectorAll('.ferr-hist-leitura')];
  return {
    visivel: !caixa.classList.contains('hidden'),
    quantos: resumos.length,
    textos: resumos.map(e => e.textContent),
    imgs: caixa.querySelectorAll('img').length,
    elementosNoResumo: resumos.reduce((n, e) => n + e.children.length, 0),
    htmlDoResumo: resumos.map(e => e.innerHTML),
    xss: typeof window.__xss,
    guardado: window.Aplicacoes.historico('pqq').map(a => ({
      verdadeiro: a.respostas && a.respostas.verdadeiro,
      objetivo: a.respostas && a.respostas.objetivo
    }))
  };
}, PAYLOAD);

ok(pqq.visivel && pqq.quantos === 2,
   'o histórico do PQQ desenha as duas aplicações: ' + pqq.quantos);
ok(pqq.xss === 'undefined',
   'window.__xss continua indefinido depois dos dois ramos: ' + pqq.xss);
ok(pqq.imgs === 0, 'nenhum <img> criado: ' + pqq.imgs);
ok(pqq.elementosNoResumo === 0,
   'nenhum elemento filho em nenhum resumo: ' + pqq.elementosNoResumo);
ok(pqq.textos.filter(t => t === PAYLOAD).length === 2,
   'o payload aparece como texto nos DOIS ramos — via `verdadeiro` e via ' +
   '`objetivo`: ' + pqq.textos.filter(t => t === PAYLOAD).length + ' de 2');
ok(pqq.htmlDoResumo.every(h => h.indexOf('<img') === -1),
   'e em nenhum deles o HTML contém a tag viva');
ok(pqq.guardado.some(g => g.verdadeiro === PAYLOAD) &&
   pqq.guardado.some(g => g.objetivo === PAYLOAD),
   'os dois campos guardados continuam idênticos ao que foi digitado');

/* ==================================================================== */
console.log('');
console.log('  FICHA — aba Formulários, o segundo caminho');
console.log('');
/* ==================================================================== */

/* O card do OQ³/PQQ na ficha monta um resumo (`extra`) com as MESMAS
   respostas e o insere em innerHTML. Era o mesmo payload, da mesma origem,
   noutra tela — e executava.

   `extra` é uma string MISTA: texto autoral com entidades de propósito (o
   separador "&middot;" entre os campos) somado ao dado guardado. Por isso o
   escape mora em cada pedaço que vem do dado, e não num escapar() da string
   inteira, que transformaria os separadores em texto literal. Estas
   asserções cobram os dois lados: o payload inerte E o separador ainda vivo. */
await p.evaluate(async (payload) => {
  const set = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  /* OQ³: payload num campo, texto normal no outro */
  document.querySelector('.nav-item[data-secao="corpo"]').click();
  document.querySelector('[data-vista="vista-oq3"]').click();
  await new Promise(r => setTimeout(r, 450));
  document.getElementById('btn-nova-oq3').click();
  await new Promise(r => setTimeout(r, 450));
  set('oq3-quer', payload);
  set('oq3-precisa', 'texto normal');
  document.getElementById('btn-salvar-oq3').click();
  await new Promise(r => setTimeout(r, 470));
  /* PQQ: idem */
  document.querySelector('.nav-item[data-secao="mente"]').click();
  document.querySelector('[data-vista="vista-pqq"]').click();
  await new Promise(r => setTimeout(r, 450));
  document.getElementById('btn-nova-pqq').click();
  await new Promise(r => setTimeout(r, 450));
  set('pqq-objetivo', payload);
  set('pqq-verdadeiro', 'texto normal');
  document.getElementById('btn-salvar-pqq').click();
  await new Promise(r => setTimeout(r, 470));
}, PAYLOAD);

const ficha = await p.evaluate(async (PAYLOAD_NO_NAVEGADOR) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  await new Promise(r => setTimeout(r, 350));
  document.querySelector('.card-paciente').click();
  await new Promise(r => setTimeout(r, 450));
  document.querySelector('[data-aba="formularios"]').click();
  await new Promise(r => setTimeout(r, 400));
  const painel = document.getElementById('aba-formularios');
  const extras = [...painel.querySelectorAll('.fic-form-extra')];
  /* O card monta `extra` a partir do registro do paciente em memória —
     hidratado da tabela legada ou derivado das aplicações. É de lá que o
     dado exibido vem, então é lá que se confere se ele continua intacto. */
  const pid = window.pacienteAtivoId();
  const alvo = (window.pacientesTodos() || []).filter(x => x.id === pid)[0] || {};
  const hist = (f) => window.Aplicacoes.historico(f).map(a => a.respostas || {});
  return {
    quantos: extras.length,
    imgs: painel.querySelectorAll('.fic-form-extra img').length,
    elementos: extras.reduce((n, e) => n + e.children.length, 0),
    textos: extras.map(e => e.textContent),
    html: extras.map(e => e.innerHTML),
    xss: typeof window.__xss,
    /* e o que está guardado, byte a byte */
    guardado: {
      quer: alvo.oq3 && alvo.oq3.quer,
      objetivo: alvo.pqq && alvo.pqq.objetivo,
      precisa: alvo.oq3 && alvo.oq3.precisa,
      verdadeiro: alvo.pqq && alvo.pqq.verdadeiro
    },
    /* e na fonte durável, o modelo versionado */
    versionado: {
      oq3: hist('oq3').filter(r => r.quer === PAYLOAD_NO_NAVEGADOR).length,
      pqq: hist('pqq').filter(r => r.objetivo === PAYLOAD_NO_NAVEGADOR).length
    }
  };
}, PAYLOAD);

ok(ficha.quantos > 0,
   'a aba Formulários desenhou os resumos dos cards: ' + ficha.quantos);
ok(ficha.xss === 'undefined',
   'window.__xss continua indefinido depois da ficha — o onerror não ' +
   'executou em NENHUM dos dois caminhos: ' + ficha.xss);
ok(ficha.imgs === 0,
   'nenhum <img> criado na aba Formulários: ' + ficha.imgs);
ok(ficha.elementos === 0,
   'e nenhum resumo tem elemento filho — é só texto: ' + ficha.elementos);
ok(ficha.textos.some(x => x.indexOf(PAYLOAD) >= 0),
   'o payload aparece como TEXTO literal e inteiro no card: ' +
   JSON.stringify((ficha.textos.find(x => x.indexOf('<img') >= 0) || '').slice(0, 60)));
ok(ficha.html.some(h => h.indexOf('&lt;img') >= 0),
   'no HTML ele está escapado: ' +
   (ficha.html.find(h => h.indexOf('&lt;img') >= 0) || '').slice(0, 50));
ok(ficha.html.every(h => h.indexOf('<img') === -1),
   'e em nenhum card o HTML contém a tag viva');
ok(ficha.textos.filter(x => x.indexOf('\u00b7') >= 0).length >= 2,
   'o separador autoral "&middot;" continua sendo separador de verdade nos ' +
   'dois cards e não virou texto — o escape pegou o DADO, não o template: ' +
   ficha.textos.filter(x => x.indexOf('\u00b7') >= 0).length + ' de 2');
ok(ficha.guardado.quer === PAYLOAD && ficha.guardado.precisa === 'texto normal',
   'o que está GUARDADO em oq3 continua byte a byte o que foi digitado — ' +
   'payload inteiro num campo, texto normal no outro');
ok(ficha.guardado.objetivo === PAYLOAD && ficha.guardado.verdadeiro === 'texto normal',
   'idem no PQQ — nada foi removido de nenhuma das respostas');
ok(ficha.versionado.oq3 >= 1 && ficha.versionado.pqq >= 1,
   'e na fonte durável, o modelo versionado, o payload também está inteiro: ' +
   'oq3=' + ficha.versionado.oq3 + ' pqq=' + ficha.versionado.pqq);

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
