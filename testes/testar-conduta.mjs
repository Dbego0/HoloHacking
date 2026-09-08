import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const caso = JSON.parse(readFileSync('caso.json','utf8'));
const nav = await puppeteer.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:'new', args:['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({width:1500,height:1300});
const ruim=[]; p.on('pageerror',e=>ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/',{waitUntil:'networkidle2'});
await p.addStyleTag({content:'*{transition:none!important;animation:none!important}'});
const ok=(c,t)=>console.log((c?'  ok    ':'  FALHA ')+t);

const r = await p.evaluate((respostas) => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  document.getElementById('btn-abrir-questionario').click();
  const m = {}; respostas.forEach(x => m[x.marcador_id] = x.intensidade);
  document.querySelectorAll('.q-item').forEach(i => {
    const v = m[i.dataset.marcador];
    if (v !== undefined) i.querySelectorAll('.q-btn')[v].click();
  });
  document.querySelector('[data-acao="calcular"]').click();
  return {
    itens: [...document.querySelectorAll('.conduta-item b')].map(e => e.textContent),
    ids: [...document.querySelectorAll('[data-abrir]')].map(e => e.dataset.abrir),
    modulos: [...document.querySelectorAll('.conduta-modulo')].map(e => e.textContent),
    porques: [...document.querySelectorAll('.conduta-porque')].map(e => e.textContent),
    criticos: [...document.querySelectorAll('.leitura-cabeca b')].map(e => e.textContent),
  };
}, caso.respostas);

ok(r.itens.length === 3, r.itens.length + ' ferramentas indicadas');
ok(/Metab/.test(r.criticos[0]), 'sistema mais baixo: ' + r.criticos[0]);
console.log('  ---');
r.itens.forEach((n,i) => console.log('    ' + r.modulos[i].padEnd(9) + n + '  — ' + r.porques[i]));
console.log('  ---');
ok(new Set(r.ids).size === r.ids.length, 'sem repetir ferramenta');

// o botao leva mesmo para a ferramenta
const abriu = await p.evaluate(() => {
  document.querySelector('[data-abrir]').click();
  const v = document.querySelector('.vista-ferramenta:not(.hidden)');
  return { id: v ? v.id : null, titulo: v ? v.querySelector('h2')?.textContent.trim() : null };
});
ok(!!abriu.id, 'o botao abre a ferramenta: ' + (abriu.titulo || '-').slice(0,50));

await nav.close();
console.log(ruim.length?'\n  ERRO: '+ruim[0]:'\n  sem erro de JS');
