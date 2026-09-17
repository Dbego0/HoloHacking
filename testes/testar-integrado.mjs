import puppeteer from 'puppeteer-core';
const nav = await puppeteer.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:'new', args:['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({width:1500,height:1200});
const ruim=[]; p.on('pageerror',e=>ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/',{waitUntil:'networkidle2'});
/* Estes testes fotografam um elemento, e a camada de entrada (login.js) o
   cobriria. Dispensa-la aqui nao e autenticar: e descobrir a tela, o mesmo que
   o botao visivel de desenvolvimento faz. */
await p.evaluate(() => window.LoginView && window.LoginView.abrirApp());
await p.addStyleTag({content:'*{transition:none!important;animation:none!important}'});
let falhou = false;
const ok = (c,t) => {
  if (!c) falhou = true;
  console.log((c?'  ok    ':'  FALHA ')+t);
};

ok(await p.evaluate(()=>!!window.HOLOSCOPE), 'motor carregado dentro do app');
ok(await p.evaluate(()=>HOLOSCOPE.resumo().marcadores)===84, '84 marcadores disponiveis');

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

/* Revisao clinica do HOLOSCOPE (decisao 1): nenhuma CMB aparece na
   interface clinica nesta rodada — nem a CMB-001, mesmo quando a condicao
   dela e satisfeita aqui (metabolico<=3 E mental_emocional_espiritual<=3).
   O motor continua disparando por baixo (ver testar-motor.mjs); a tela e
   quem nunca mais mostra (app.js, cmbParaExibir()). */
const a = await pontuar([6.7,6.7,0.8,6.7,0.7].map(Math.round));
ok(a.combinadas.length===0,
   'CMB-001 dispararia no motor mas nao aparece na tela: ' + a.combinadas.length);

// paciente saudavel: nao pode disparar nada
const b = await pontuar([9,9,9,9,9]);
ok(b.combinadas.length===0, 'terreno equilibrado nao dispara combinacao');
ok(b.indice==='90', 'indice do saudavel = ' + b.indice);

const el = await p.$('#secao-holoscope');
await el.screenshot({path:'integrado.png'});
await nav.close();
console.log(ruim.length?'\n  ERRO: '+ruim[0]:'\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
