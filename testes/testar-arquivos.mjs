/**
 * Exames, documentos e relatorio dentro do app.
 * O caso de exemplo tem Mental 0.7 e Metabolico 0.8 — bem baixos — e os
 * outros tres altos. Entao exame alterado no metabolico deve CONFIRMAR, e
 * exame alterado no detox (nota 6.7) deve DIVERGIR.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));
const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1500, height: 1200 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => {
  if (!c) falhou = true;
  console.log((c ? '  ok    ' : '  FALHA ') + t);
};

// --- a secao existe e abre -------------------------------------------------
const base = await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('vista-lista-pacientes').classList.add('hidden');
  document.getElementById('vista-ficha').classList.remove('hidden');
  document.querySelector('[data-aba="documentos"]').click();
  return {
    visivel: !document.getElementById('ficha-arquivos').classList.contains('hidden'),
    abas: [...document.querySelectorAll('#ficha-arquivos .aba')].map(b => b.textContent.trim()),
    exames: document.querySelectorAll('#ex-corpo .ex-linha').length,
    blocos: [...document.querySelectorAll('#ex-corpo .ex-bloco h4')].map(h => h.textContent),
    cartoes: [...document.querySelectorAll('#aba-documentos .arq-titulo')].map(h => h.textContent),
  };
});
ok(base.visivel, 'a secao Arquivos abre');
ok(base.abas.join(',') === 'Visão clínica,Linha do tempo,Formulários,Documentos,Relatório',
   'as cinco abas: ' + base.abas.join(' · '));
/* Exames e documentos eram duas abas, e a separacao estava errada: os valores
   saem do PDF. Agora e um lugar so, em dois passos. */
ok(base.cartoes.join(' / ') === 'O que o paciente trouxe / Os valores do exame',
   'o papel e os numeros no mesmo lugar: ' + base.cartoes.join(' · '));
ok(base.exames === 24, base.exames + ' exames no formulario');
ok(base.blocos.length === 5, 'agrupados nos ' + base.blocos.length + ' sistemas');

// --- sem mapa, o exame nao tem com o que confrontar ------------------------
const semMapa = await p.evaluate(() => {
  const l = [...document.querySelectorAll('#ex-corpo .ex-linha')]
    .find(x => x.dataset.exame === 'EXA-005');
  l.querySelector('input').value = '115';
  l.querySelector('input').dispatchEvent(new Event('input', { bubbles: true }));
  return {
    marcado: l.classList.contains('alterado'),
    situacao: l.querySelector('.ex-situacao').textContent,
    aviso: document.getElementById('ex-confronto').textContent.trim(),
  };
});
ok(semMapa.marcado && semMapa.situacao === 'acima', 'glicemia 115 marca como acima');
ok(/question[aá]rio/i.test(semMapa.aviso), 'pede o questionario antes de confrontar');

// --- aplica o questionario e volta ----------------------------------------
await p.evaluate((respostas) => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  document.getElementById('btn-abrir-questionario').click();
  const m = {}; respostas.forEach(x => m[x.marcador_id] = x.intensidade);
  document.querySelectorAll('.q-item').forEach(i => {
    const v = m[i.dataset.marcador];
    if (v !== undefined) i.querySelectorAll('.q-btn')[v].click();
  });
  document.querySelector('[data-acao="calcular"]').click();
}, caso.respostas);

const conf = await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('vista-lista-pacientes').classList.add('hidden');
  document.getElementById('vista-ficha').classList.remove('hidden');
  // metabolico esta baixo (0.4) e detox esta alto (6.7)
  const por = {};
  [...document.querySelectorAll('#ex-corpo .ex-linha')].forEach(l => por[l.dataset.exame] = l);
  por['EXA-005'].querySelector('input').value = '115';   // metabolico, alterado
  por['EXA-015'].querySelector('input').value = '78';    // detox GGT, alterado
  por['EXA-005'].querySelector('input').dispatchEvent(new Event('input', { bubbles: true }));
  const itens = [...document.querySelectorAll('.conf-item')];
  return itens.map(i => ({
    sistema: i.querySelector('b').textContent,
    tipo: i.classList.contains('diverge') ? 'diverge' : 'confirma',
    leitura: i.querySelector('.conf-leitura').textContent.trim().slice(0, 60),
  }));
});
const met = conf.find(c => /Metab/.test(c.sistema));
const det = conf.find(c => /Detox/.test(c.sistema));
ok(met && met.tipo === 'confirma', 'metabolico baixo + exame alterado = confirma');
ok(det && det.tipo === 'diverge', 'detox alto + exame alterado = diverge');
if (det) console.log('    divergencia: ' + det.leitura + '...');

// --- documentos ------------------------------------------------------------
// documentos: a area de receber arquivo. O ciclo completo de subir, guardar
// e remover esta em testar-upload.mjs.
const doc = await p.evaluate(() => {
  document.querySelector('[data-aba="documentos"]').click();
  const t = document.getElementById('aba-documentos').textContent;
  return {
    solta: !!document.getElementById('doc-solta'),
    aceita: document.getElementById('doc-arquivo')?.getAttribute('accept') || '',
    avisaOnde: /neste navegador/i.test(t),
  };
});
ok(doc.solta, 'a area de arrastar arquivo existe');
ok(/pdf/.test(doc.aceita) && /jpg|jpeg/.test(doc.aceita), 'aceita PDF e foto: ' + doc.aceita);
ok(doc.avisaOnde, 'a tela diz onde o arquivo fica guardado');

// --- relatorio -------------------------------------------------------------
const rel = await p.evaluate(() => {
  document.querySelector('[data-aba="relatorio"]').click();
  const r = document.getElementById('relatorio');
  return {
    existe: !!r,
    indice: r?.querySelector('.rel-meta b')?.textContent,
    sistemas: r?.querySelectorAll('.rel-sistema').length,
    primeiro: r?.querySelector('.rel-sistema b')?.textContent,
    combinada: r?.querySelector('.rel-combinada')?.textContent.trim(),
    temTriada: !!r?.querySelector('.rel-triada'),
    temExames: /Exames/.test(r?.textContent || ''),
    textoNutri: r?.querySelector('.rel-sistema p')?.textContent.slice(0, 70),
  };
});
ok(rel.existe, 'o relatorio e montado');
ok(rel.indice === '43', 'indice no relatorio: ' + rel.indice);
ok(rel.sistemas === 5, rel.sistemas + ' sistemas, do pior para o melhor');
const maisBaixo = await p.evaluate((respostas) =>
  [...HOLOSCOPE.calcular(respostas).sistemas].sort((a, b) => a.nota - b.nota)[0].nome,
  caso.respostas);
ok(rel.primeiro === maisBaixo, 'comeca pelo mais baixo: ' + rel.primeiro);
ok(rel.temTriada && rel.temExames, 'traz Triada e Exames');
ok(/amea/.test(rel.combinada || ''), 'traz a leitura combinada');

// os dois registros dao textos diferentes
const dois = await p.evaluate(() => {
  const antes = document.querySelector('.rel-sistema p').textContent;
  document.querySelector('[data-registro="paciente"]').click();
  return { antes: antes.slice(0, 50), depois: document.querySelector('.rel-sistema p').textContent.slice(0, 50) };
});
ok(dois.antes !== dois.depois, 'nutricionista e paciente recebem textos diferentes');
console.log('    nutri:    ' + dois.antes + '...');
console.log('    paciente: ' + dois.depois + '...');

await nav.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
