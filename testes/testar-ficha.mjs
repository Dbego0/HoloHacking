/** A ficha reune o que estava espalhado, e acusa o que ninguem via. */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));
const nav = await puppeteer.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:'new', args:['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({width:1400,height:1100});
const ruim=[]; p.on('pageerror',e=>ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/',{waitUntil:'networkidle2'});
await p.addStyleTag({content:'*{transition:none!important;animation:none!important}'});
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
const ok=(c,t)=>console.log((c?'  ok    ':'  FALHA ')+t);

function verFicha(){ return p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('vista-lista-pacientes').classList.add('hidden');
  document.getElementById('vista-ficha').classList.remove('hidden');
  window.redesenharFicha();
  const r = document.getElementById('ficha-resumo');
  return {
    alertas: [...r.querySelectorAll('.fic-alerta span')].map(e=>e.textContent),
    indice: r.querySelector('.fic-indice b')?.textContent || null,
    triada: [...r.querySelectorAll('.fic-triada span')].map(e=>e.textContent),
    linhas: [...r.querySelectorAll('.fic-linha')].map(e=>e.textContent.replace(/\s+/g,' ').trim()),
    chips: [...r.querySelectorAll('.fic-chip')].map(e=>e.textContent),
    combinada: r.querySelector('.fic-combinada')?.textContent,
  };
}); }

// --- paciente cru: nada aplicado -------------------------------------------
const cru = await verFicha();
ok(cru.alertas.some(a=>/Sem HOLOSCOPE/i.test(a)), 'acusa que nao ha HOLOSCOPE: ' + cru.alertas[0]);
ok(cru.indice === null, 'sem mapa, nao inventa indice');

// --- aplica o questionario --------------------------------------------------
await p.evaluate((r) => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  document.getElementById('btn-abrir-questionario').click();
  const m={}; r.forEach(x=>m[x.marcador_id]=x.intensidade);
  document.querySelectorAll('.q-item').forEach(i=>{
    const v=m[i.dataset.marcador]; if(v!==undefined) i.querySelectorAll('.q-btn')[v].click(); });
  document.querySelector('[data-acao="calcular"]').click();
}, caso.respostas);

const mapeado = await verFicha();
ok(mapeado.indice === '43', 'a ficha mostra o Indice: ' + mapeado.indice);
ok(mapeado.triada.length === 3, 'mostra a Triada: ' + mapeado.triada.join(' '));
ok(/amea/.test(mapeado.combinada||''), 'mostra a leitura combinada');
ok(mapeado.alertas.some(a=>/nenhuma ferramenta/i.test(a)),
   'ACUSA mapeado sem conduta: ' + (mapeado.alertas.find(a=>/nenhuma ferramenta/i.test(a))||''));
ok(mapeado.linhas.some(l=>/84 de 84/.test(l)), 'questionario completo na lista');

// --- aplica uma ferramenta ---------------------------------------------------
await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="mente"]').click();
  document.querySelector('[data-ferramenta="gatilhos_respostas"]').click();
  document.getElementById('campo-gatilho1').value = 'Briga em casa';
  document.querySelector('#vista-gen-mente [data-acao="salvar"]').click();
});
const conduzido = await verFicha();
ok(!conduzido.alertas.some(a=>/nenhuma ferramenta/i.test(a)), 'o alerta some depois da conduta');
ok(conduzido.chips.length === 1, 'lista a ferramenta aplicada: ' + conduzido.chips.join(', '));
ok(conduzido.linhas.some(l=>/1 de 30/.test(l)), 'conta 1 de 30 ferramentas');

// --- exame que diverge vira alerta -------------------------------------------
await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('vista-lista-pacientes').classList.add('hidden');
  document.getElementById('vista-ficha').classList.remove('hidden');
  const l = [...document.querySelectorAll('.ex-linha')].find(x=>x.dataset.exame==='EXA-015');
  l.querySelector('input').value = '78';
  l.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}));
});
const comExame = await verFicha();
ok(comExame.alertas.some(a=>/n[aã]o batem/i.test(a)),
   'ACUSA divergencia entre relato e exame: ' + (comExame.alertas.find(a=>/batem/.test(a))||''));
ok(comExame.linhas.some(l=>/1 preenchidos/.test(l)), 'conta os exames preenchidos');

await nav.close();
console.log(ruim.length?'\n  ERRO: '+ruim[0]:'\n  sem erro de JS');
