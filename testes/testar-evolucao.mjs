/** Duas aplicacoes: a comparacao aparece. Uma so: nao aparece. */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));
const nav = await puppeteer.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:'new', args:['--hide-scrollbars'] });
const p = await nav.newPage(); await p.setViewport({width:1400,height:1200});
const ruim=[]; p.on('pageerror',e=>ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/',{waitUntil:'networkidle2'});
await p.addStyleTag({content:'*{transition:none!important;animation:none!important}'});
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c,t) => {
  if (!c) falhou = true;
  console.log((c?'  ok    ':'  FALHA ')+t);
};

// primeira aplicacao
const uma = await p.evaluate((r) => {
  localStorage.removeItem('holohacking.pontuacao');
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(r));
  return { escondida: document.getElementById('holo-evolucao').classList.contains('hidden'),
           indice: document.getElementById('holo-score-total').textContent };
}, caso.respostas);
ok(uma.escondida, 'com uma aplicacao so, a evolucao nao aparece');
ok(uma.indice === '43', 'primeira aplicacao: indice ' + uma.indice);

// segunda aplicacao, 12 semanas depois e melhor
const duas = await p.evaluate((r) => {
  // envelhece a primeira para setembro
  const t = JSON.parse(localStorage.getItem('holohacking.pontuacao'));
  const pid = window.pacienteAtivoId() || '_sem_paciente';
  t[pid][0].quando = '2026-06-09';   // 12 semanas antes de hoje
  localStorage.setItem('holohacking.pontuacao', JSON.stringify(t));
  // respostas melhores: duas casas na direcao de MENOS carga. Nos marcadores
  // invertidos essa direcao e para cima, nao para baixo.
  const sentido = {};
  HOLOSCOPE.questionario().forEach(q => { sentido[q.id] = q.sentido; });
  const melhor = r.map(x => ({
    marcador_id: x.marcador_id,
    intensidade: sentido[x.marcador_id] === 'invertido'
      ? Math.min(3, x.intensidade + 2)
      : Math.max(0, x.intensidade - 2),
  }));
  window.aplicarPontuacao(HOLOSCOPE.calcular(melhor));
  const e = document.getElementById('holo-evolucao');
  return {
    visivel: !e.classList.contains('hidden'),
    indices: [...e.querySelectorAll('.evo-um b')].map(x=>x.textContent),
    ganho: e.querySelector('.evo-ganho')?.textContent,
    frase: e.querySelector('.evo-frase')?.textContent.replace(/\s+/g,' ').trim(),
    linhas: [...e.querySelectorAll('.evo-linha')].map(x=>x.textContent.replace(/\s+/g,' ').trim()),
    poligonos: e.querySelectorAll('polygon').length,
    historico: JSON.parse(localStorage.getItem('holohacking.pontuacao'))[pid].length,
  };
}, caso.respostas);

ok(duas.visivel, 'com duas, a evolucao aparece');
ok(duas.historico === 2, 'o historico guarda as duas: ' + duas.historico);
ok(duas.indices.length === 2, 'mostra os dois indices: ' + duas.indices.join(' -> '));
ok(/^\+/.test(duas.ganho||''), 'mostra o ganho: ' + duas.ganho);
ok(/semanas/.test(duas.frase||''), 'frase: ' + duas.frase);
ok(duas.linhas.length === 5, 'os 5 sistemas com o antes, o depois e a diferenca');
ok(duas.poligonos === 6, duas.poligonos + ' poligonos (4 da moldura + antes + depois)');
console.log('    ' + duas.linhas.slice(0,3).join('\n    '));

// reaplicar no mesmo dia nao cria uma terceira
const mesmo = await p.evaluate((r) => {
  window.aplicarPontuacao(HOLOSCOPE.calcular(r));
  const pid = window.pacienteAtivoId() || '_sem_paciente';
  return JSON.parse(localStorage.getItem('holohacking.pontuacao'))[pid].length;
}, caso.respostas);
ok(mesmo === 2, 'reaplicar no mesmo dia substitui, nao acumula: ' + mesmo);

await nav.close();
console.log(ruim.length?'\n  ERRO: '+ruim[0]:'\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
