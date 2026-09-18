/**
 * A aba Relatório, dentro da ficha do paciente.
 *
 * Relatório ja era o mais completo dos consumidores: HOLOSCOPE (A) e
 * HOLOSCAN (B) ja existiam, ja sem leitura causal legada (window.Holoscan.
 * texto(), nunca c.leitura) e ja com a Interpretação profissional separada
 * por data-origem="profissional". Esta etapa preenche o que faltava do
 * checklist de 7 partes: Consultas (C) e Documentos (D) como secoes
 * proprias, a data da aplicação em A (antes so a data do relatorio
 * aparecia), o estado vazio com titulo/texto, e a impressão sem o
 * cabecalho/faixa/Jornada clinica da ficha (chrome que nao existia quando
 * o @media print foi escrito).
 *
 * O que este teste cobra:
 *
 *   VAZIO        sem HOLOSCOPE, o titulo/texto pedidos — nao o paragrafo
 *                solto de antes.
 *   HOLOSCOPE    data da aplicação, índice, os cinco sistemas.
 *   HOLOSCAN     estados fixos, nenhuma leitura causal do motor escapando.
 *   CONSULTAS    a nova seção C, com e sem dado.
 *   DOCUMENTOS   a nova seção D (assíncrona — ArquivoStore), com e sem dado.
 *   SEPARACAO    Interpretação profissional continua isolada por
 *                data-origem, sem se misturar com A/B/C/D.
 *   IMPRESSAO    o botão existe e o @media print esconde sidebar, abas e
 *                agora também o cabeçalho/faixa/Jornada clínica da ficha.
 *   NAVEGACAO    trocar de aba e voltar para Relatório não zera a ficha.
 *   RESPONSIVO   420/900/1440, sem scroll horizontal.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1500, height: 1300 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
const ok = (c, t) => console.log((c ? '  ok    ' : '  FALHA ') + t);
let falhou = false;
const conferir = (c, t) => { if (!c) falhou = true; ok(c, t); };

const aba = (x) => p.evaluate(async (n) => {
  document.querySelector('[data-aba="' + n + '"]').click();
  await new Promise(r => setTimeout(r, 250));
}, x);

const abrirFichaDe = (id) => p.evaluate(async (pid) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.querySelector('[data-ficha="' + pid + '"]').click();
  await new Promise(r => setTimeout(r, 300));
}, id);

/* --------------------------------------------------------- um paciente --- */

const pid = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Marina Alves';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(x => setTimeout(x, 300));
  return window.pacienteAtivoId();
});

/* --------------------------------------------------------- sem dados ----- */

await abrirFichaDe(pid);
await aba('relatorio');

const vazio = await p.evaluate(() => {
  const v = document.querySelector('#aba-relatorio .lista-vazia');
  return {
    titulo: v?.querySelector('strong')?.textContent,
    texto: v?.querySelector('span')?.textContent,
    temRelatorio: !!document.getElementById('relatorio'),
  };
});
conferir(vazio.titulo === 'Relatório ainda sem dados suficientes', 'título do estado vazio: ' + vazio.titulo);
conferir(vazio.texto === 'Conclua etapas da jornada clínica para gerar uma consolidação mais completa.',
  'texto do estado vazio: ' + vazio.texto);
conferir(!vazio.temRelatorio, 'sem HOLOSCOPE, o relatório não é montado artificialmente');

/* ------------------------------------------ HOLOSCOPE, consulta, doc ----- */

await p.evaluate(async (respostas) => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(respostas));
  const id = window.pacienteAtivoId();
  localStorage.setItem('holohacking.exames', JSON.stringify({ [id]: { 'EXA-005': 115, 'EXA-015': 78 } }));

  const dias = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  await window.DadosLocais.from('consultas').insert({
    paciente_id: id, data: dias(-10), hora: '09:00', duracao: 60, tipo: 'Retorno', nota: '' });

  const arq = (t, n) => new File([t], n, { type: 'text/plain' });
  await window.ArquivoStore.salvar(id, arq('a', 'Hemograma.pdf'),
    { nome: 'Hemograma.pdf', tipo: 'Exame laboratorial', data: dias(-10) });
}, caso.respostas);

await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await abrirFichaDe(pid);
await aba('relatorio');
await new Promise(r => setTimeout(r, 400)); // ArquivoStore e assincrono

const cheio = await p.evaluate(() => {
  const r = document.getElementById('relatorio');
  const secoes = [...r.querySelectorAll('.rel-parte')].map(s => ({
    origem: s.dataset.origem,
    titulo: s.querySelector('h3').textContent,
  }));
  return {
    secoes,
    aplicadoEm: r.querySelector('.rel-parte h3 + .rel-meta')?.textContent || '',
    indice: r.querySelector('.rel-indice b')?.textContent,
    sistemas: r.querySelectorAll('.rel-sistema').length,
  };
});

conferir(cheio.secoes.length === 5, 'as cinco seções automáticas/profissional existem: ' + cheio.secoes.map(s => s.titulo).join(' | '));
conferir(/Aplicado em \d\d\/\d\d\/\d{4}/.test(cheio.aplicadoEm),
  'a seção A mostra a data da APLICAÇÃO, não só a data do relatório: ' + cheio.aplicadoEm);
conferir(cheio.indice === '43', 'índice HOLOS: ' + cheio.indice);
conferir(cheio.sistemas === 5, 'os cinco sistemas aparecem: ' + cheio.sistemas);

const consultasEDocs = await p.evaluate(() => {
  const r = document.getElementById('relatorio');
  const de = titulo => [...r.querySelectorAll('.rel-parte')].find(s => s.querySelector('h3').textContent === titulo);
  const consultas = de('C. Consultas e acompanhamento');
  const docs = de('D. Documentos e materiais');
  return {
    consultasTexto: consultas.textContent.replace(/\s+/g, ' '),
    docsTexto: docs.textContent.replace(/\s+/g, ' '),
  };
});
conferir(/1 consulta registrada/.test(consultasEDocs.consultasTexto) && /Retorno/.test(consultasEDocs.consultasTexto),
  'seção C (Consultas): ' + consultasEDocs.consultasTexto);
conferir(/1 documento registrado/.test(consultasEDocs.docsTexto) && /Hemograma\.pdf/.test(consultasEDocs.docsTexto),
  'seção D (Documentos), já preenchida após a promise do ArquivoStore: ' + consultasEDocs.docsTexto);

const holoscanSecao = await p.evaluate(() => {
  const r = document.getElementById('relatorio');
  const b = [...r.querySelectorAll('.rel-parte')].find(s => /HOLOSCAN/.test(s.querySelector('h3').textContent));
  return [...b.querySelectorAll('p')].map(x => x.textContent.trim());
});
const TEXTOS_FIXOS = [
  'Existe convergência entre o relato do paciente e os dados laboratoriais nesta dimensão.',
  'Relato e dados laboratoriais disponíveis estão convergentes nesta dimensão.',
  'O relato e os dados laboratoriais não estão caminhando na mesma direção neste momento.',
  'Ainda não há dados laboratoriais suficientes para realizar o confronto desta dimensão.',
];
conferir(holoscanSecao.length >= 5, 'a seção B (HOLOSCAN) tem uma linha por sistema: ' + holoscanSecao.length);
conferir(
  holoscanSecao.filter(t => !/^O Holoscan organiza/.test(t))
    .every(t => TEXTOS_FIXOS.some(fixo => t.indexOf(fixo) >= 0)),
  'nenhuma leitura causal do motor escapou — só os quatro textos fixos do Holoscan');

/* -------------------------------------------- interpretação separada ----- */

const interp = await p.evaluate(async () => {
  document.getElementById('rel-interpretacao').value = 'Observação clínica de teste.';
  document.querySelector('[data-acao="salvar-interpretacao"]').click();
  await new Promise(r => setTimeout(r, 200));
  const r = document.getElementById('relatorio');
  const ultima = [...r.querySelectorAll('.rel-parte')].pop();
  return {
    origem: ultima.dataset.origem,
    titulo: ultima.querySelector('h3').textContent,
    misturouComB: /Observação clínica de teste/.test(
      [...r.querySelectorAll('.rel-parte')].slice(0, -1).map(s => s.textContent).join(' ')),
  };
});
conferir(interp.origem === 'profissional' && interp.titulo === 'E. Interpretação profissional',
  'a interpretação profissional é a última seção, com origem marcada: ' + interp.titulo);
conferir(!interp.misturouComB, 'e o texto não vaza para as seções automáticas (A/B/C/D)');

/* --------------------------------------------- impressão sem chrome ------ */

const botaoImprimir = await p.evaluate(() => !!document.querySelector('[data-acao="imprimir"]'));
conferir(botaoImprimir, 'o botão "Imprimir ou salvar em PDF" existe, preservado');

await p.emulateMediaType('print');
const noPrint = await p.evaluate(() => {
  const visivel = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).display !== 'none' : null;
  };
  return {
    sidebar: visivel('.sidebar'),
    abas: visivel('.abas'),
    fichaTopo: visivel('.fic-topo'),
    faixa: visivel('.fic-faixa'),
    jornada: visivel('.fic-jornada-bloco'),
    voltar: visivel('.btn-voltar'),
    relatorioContinua: visivel('#relatorio'),
  };
});
await p.emulateMediaType('screen');
conferir(noPrint.sidebar === false && noPrint.abas === false, 'imprimindo, sidebar e abas somem (já existia)');
conferir(noPrint.fichaTopo === false && noPrint.faixa === false && noPrint.jornada === false && noPrint.voltar === false,
  'e agora o cabeçalho, a faixa, a Jornada clínica e "voltar" da ficha também — não existiam quando o @media print foi escrito');
conferir(noPrint.relatorioContinua === true, 'e o relatório em si continua visível na impressão');

/* --------------------------------------------- navegação não zera a ficha */

await aba('visao');
await aba('relatorio');
const voltouOk = await p.evaluate(() => ({
  abaAtiva: document.querySelector('[data-aba="relatorio"]').classList.contains('ativa'),
  fichaVisivel: !document.getElementById('vista-ficha').classList.contains('hidden'),
  temRelatorio: !!document.getElementById('relatorio'),
}));
conferir(voltouOk.abaAtiva && voltouOk.fichaVisivel && voltouOk.temRelatorio,
  'trocar de aba e voltar para Relatório não zera a ficha');

/* --------------------------------------------------------- responsividade */

for (const largura of [420, 900, 1440]) {
  await p.setViewport({ width: largura, height: 1000 });
  await new Promise(r => setTimeout(r, 150));
  const semScroll = await p.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
  conferir(semScroll, largura + 'px: sem scroll horizontal');
}

/* --------------------------------------------------------------- fim ----- */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
if (ruim.length) falhou = true;
await nav.close();
process.exit(falhou ? 1 : 0);
