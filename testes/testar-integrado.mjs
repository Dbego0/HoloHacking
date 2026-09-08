import puppeteer from 'puppeteer-core';
const nav = await puppeteer.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:'new', args:['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({width:1500,height:1200});
const ruim=[]; p.on('pageerror',e=>ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/',{waitUntil:'networkidle2'});
await p.addStyleTag({content:'*{transition:none!important;animation:none!important}'});
const ok=(c,t)=>console.log((c?'  ok    ':'  FALHA ')+t);

ok(await p.evaluate(()=>!!window.HOLOSCOPE), 'motor carregado dentro do app');
ok(await p.evaluate(()=>HOLOSCOPE.resumo().marcadores)===87, '87 marcadores disponiveis');

/** Pontua os 5 sistemas pela interface e le o que a tela mostra. */
async function pontuar(v){
  await p.evaluate((vals)=>{
    document.querySelector('.nav-item[data-secao="holoscope"]').click();
    ['fungico','inflamatorio','metabolico','detox','mental'].forEach((s,i)=>{
      const el=document.getElementById('holo-'+s);
      el.value=vals[i]; el.dispatchEvent(new Event('input',{bubbles:true}));
    });
  }, v);
  return p.evaluate(()=>({
    indice: document.getElementById('holo-score-total').textContent,
    combinadas: [...document.querySelectorAll('.leitura-combinada b')].map(e=>e.textContent),
    ids: [...document.querySelectorAll('.leitura-combinada span')].map(e=>e.textContent),
  }));
}

// o caso do exemplo, com as notas REAIS do motor
const a = await pontuar([6.7,6.7,0.4,6.7,0.7].map(Math.round));
ok(a.combinadas.length>0, 'combinacao do banco disparou: ' + (a.combinadas[0]||'nenhuma'));
ok((a.ids[0]||'').startsWith('CMB-001'), 'e a CMB-001: ' + (a.ids[0]||'-'));

// paciente saudavel: nao pode disparar nada
const b = await pontuar([9,9,9,9,9]);
ok(b.combinadas.length===0, 'terreno equilibrado nao dispara combinacao');
ok(b.indice==='90', 'indice do saudavel = ' + b.indice);

const el = await p.$('#secao-holoscope');
await el.screenshot({path:'integrado.png'});
await nav.close();
console.log(ruim.length?'\n  ERRO: '+ruim[0]:'\n  sem erro de JS');
