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
let falhou = false;
const ok = (c,t) => {
  if (!c) falhou = true;
  console.log((c?'  ok    ':'  FALHA ')+t);
};

async function verFicha(){
  const r = await p.evaluate(async () => {
    document.querySelector('.nav-item[data-secao="pacientes"]').click();
    document.getElementById('vista-lista-pacientes').classList.add('hidden');
    document.getElementById('vista-ficha').classList.remove('hidden');
    document.querySelector('[data-aba="visao"]').click();
    window.redesenharFicha();
    await new Promise(x => setTimeout(x, 250));
    const v = document.getElementById('aba-visao');
    const faixa = [...document.querySelectorAll('#ficha-faixa .fic-pilula')]
      .map(e => e.textContent.replace(/\s+/g, ' ').trim());

    // os formularios ficam na aba deles; abrir, ler, e voltar para a visao
    document.querySelector('[data-aba="formularios"]').click();
    await new Promise(x => setTimeout(x, 250));
    const f = document.getElementById('aba-formularios');
    const formularios = [...f.querySelectorAll('.fic-form-topo')]
      .map(e => e.textContent.replace(/\s+/g, ' ').trim());
    const chips = [...f.querySelectorAll('.fic-chip')].map(e => e.textContent);
    document.querySelector('[data-aba="visao"]').click();
    await new Promise(x => setTimeout(x, 250));

    return {
      alertas: [...v.querySelectorAll('.fic-alerta span')].map(e=>e.textContent),
      indice: v.querySelector('.fic-indice b')?.textContent || null,
      triada: [...v.querySelectorAll('.fic-triada span')].map(e=>e.textContent),
      combinada: v.querySelector('.fic-combinada')?.textContent,
      faixa, formularios, chips,
    };
  });
  return r;
}

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
/* Revisao clinica do HOLOSCOPE (decisao 1): nenhuma CMB aparece na
   interface clinica nesta rodada, nem a CMB-001 — ver app.js,
   cmbParaExibir(). */
ok(mapeado.combinada === undefined, 'nao mostra leitura combinada: ' + mapeado.combinada);
ok(mapeado.alertas.some(a=>/nenhuma ferramenta/i.test(a)),
   'ACUSA mapeado sem conduta: ' + (mapeado.alertas.find(a=>/nenhuma ferramenta/i.test(a))||''));
ok(mapeado.formularios.some(l=>/84 de 84 respondidas/.test(l)),
   'o questionario completo aparece em Formularios');

// --- aplica uma ferramenta ---------------------------------------------------
// gatilhos_respostas foi uma das ferramentas retiradas da galeria de Mente na
// rodada de revisao de Corpo/Mente/Espirito; mapa_crencas e uma das duas que
// sobraram (a outra e o PQQ, que tem tela propria, nao generica).
await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="mente"]').click();
  document.querySelector('[data-ferramenta="mapa_crencas"]').click();
  await new Promise(r => setTimeout(r, 350));
  document.getElementById('campo-crencas').value = 'Carboidrato engorda';
  document.querySelector('#vista-gen-mente [data-acao="concluir"]').click();
});
const conduzido = await verFicha();
ok(!conduzido.alertas.some(a=>/nenhuma ferramenta/i.test(a)), 'o alerta some depois da conduta');
ok(conduzido.chips.length === 1, 'lista a ferramenta aplicada: ' + conduzido.chips.join(', '));
ok(conduzido.formularios.some(l=>/1 de 30 aplicadas/.test(l)),
   'conta 1 de 30 ferramentas');

// --- exame que diverge vira alerta -------------------------------------------
await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('vista-lista-pacientes').classList.add('hidden');
  document.getElementById('vista-ficha').classList.remove('hidden');
  document.querySelector('[data-aba="documentos"]').click();
  const l = [...document.querySelectorAll('.ex-linha')].find(x=>x.dataset.exame==='EXA-015');
  l.querySelector('input').value = '78';
  l.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}));
});
const comExame = await verFicha();
/* Revisao clinica do HOLOSCOPE (Holoscan): "nao batem" sugeria que um dos
   dois lados esta errado. panorama.js passou a falar em divergencia — um
   convite a aprofundar, nao veredito. */
ok(comExame.alertas.some(a=>/divergem/i.test(a)),
   'ACUSA divergencia entre relato e exame: ' + (comExame.alertas.find(a=>/diverg/i.test(a))||''));
ok(comExame.faixa.some(l=>/1 preenchidos/.test(l)),
   'a faixa conta os exames preenchidos: ' + (comExame.faixa.find(l=>/preenchid/.test(l))||''));
ok(comExame.faixa.some(l=>/ÚLTIMA APLICAÇÃO/i.test(l) || /Última aplicação/i.test(l)),
   'e diz quando foi a ultima aplicacao');

await nav.close();
console.log(ruim.length?'\n  ERRO: '+ruim[0]:'\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
