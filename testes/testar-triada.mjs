import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url),'utf8'));
const nav = await puppeteer.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:'new', args:['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({width:1500,height:1300});
const ruim=[]; p.on('pageerror',e=>ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/',{waitUntil:'networkidle2'});
await p.addStyleTag({content:'*{transition:none!important;animation:none!important}'});
const ok=(c,t)=>console.log((c?'  ok    ':'  FALHA ')+t);

const antes = await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  return document.getElementById('holo-triada').classList.contains('hidden');
});
ok(antes, 'sem questionario, a Triada nao aparece');

const r = await p.evaluate((respostas) => {
  document.getElementById('btn-abrir-questionario').click();
  const mapa = {}; respostas.forEach(x => mapa[x.marcador_id] = x.intensidade);
  document.querySelectorAll('.q-item').forEach(i => {
    const v = mapa[i.dataset.marcador];
    if (v !== undefined) i.querySelectorAll('.q-btn')[v].click();
  });
  document.querySelector('[data-acao="calcular"]').click();
  const c = document.getElementById('holo-triada');
  return {
    visivel: !c.classList.contains('hidden'),
    notas: [...c.querySelectorAll('.triada-nota')].map(e => e.textContent),
    eixos: [...c.querySelectorAll('.triada-eixo b')].map(e => e.textContent),
    menor: c.querySelector('.triada-eixo.menor b')?.textContent,
    leitura: c.querySelector('.triada-leitura')?.textContent.trim(),
    poligonos: c.querySelectorAll('polygon').length,
  };
}, caso.respostas);

ok(r.visivel, 'com o questionario, a Triada aparece');
ok(r.notas.join(' ') === '3.8 3.2 2.0', 'valores do motor: ' + r.notas.join(' · '));
ok(r.eixos.join(',') === 'Físico,Mental,Espiritual', 'eixos: ' + r.eixos.join(' · '));
ok(r.menor === 'Espiritual', 'aponta a dimensao mais baixa: ' + r.menor);
ok(r.poligonos === 5, r.poligonos + ' poligonos (4 da moldura + a area)');

const voltou = await p.evaluate(() => {
  document.getElementById('btn-repontuar').click();
  return document.getElementById('holo-triada').classList.contains('hidden');
});
ok(voltou, 'ao voltar a pontuar a mao, a Triada some');

const el = await p.$('#holo-triada');
await p.evaluate(() => { document.getElementById('btn-abrir-questionario').click();
  document.querySelector('[data-acao="calcular"]').click(); });
const e2 = await p.$('#holo-triada');
if (e2) await e2.screenshot({path:'triada.png'});
await nav.close();
console.log(ruim.length?'\n  ERRO: '+ruim[0]:'\n  sem erro de JS');
