import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));
const nav = await puppeteer.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:'new', args:['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({width:1500,height:1300});
const ruim=[]; p.on('pageerror',e=>ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/',{waitUntil:'networkidle2'});
await p.addStyleTag({content:'*{transition:none!important;animation:none!important}'});
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c,t) => {
  if (!c) falhou = true;
  console.log((c?'  ok    ':'  FALHA ')+t);
};

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
    aviso: (document.querySelector('.leitura-aviso') || {}).textContent || '',
    validadas: (window.CorpoBancos.RECOMENDACOES || [])
      .filter(r => window.CorpoBancos.validada(r)).length,
    maisBaixo: [...HOLOSCOPE.calcular(respostas).sistemas]
      .sort((a, b) => a.nota - b.nota)[0].nome,
  };
}, caso.respostas);

ok(r.itens.length === 3, r.itens.length + ' ferramentas indicadas');
ok(r.criticos[0] === r.maisBaixo, 'comeca pelo sistema mais baixo: ' + r.criticos[0]);
console.log('  ---');
r.itens.forEach((n,i) => console.log('    ' + r.modulos[i].padEnd(9) + n + '  — ' + r.porques[i]));
console.log('  ---');
ok(new Set(r.ids).size === r.ids.length, 'sem repetir ferramenta');

/* As regras que montam esta lista sao todas herdadas do app anterior, e
   nenhuma passou pelo metodo. A tela precisa dizer isso em voz alta. */
ok(r.validadas === 0, 'nenhuma regra de recomendacao esta validada pelo metodo');
ok(/não foi validada pelo método|Nenhuma foi validada/i.test(r.aviso),
   'e a tela avisa antes da lista: "' + r.aviso.slice(0, 80) + '"');

/* A vaga do Momentum esta declarada vazia em SEL-001: a conduta nao pode
   passar de 3 enquanto nenhuma regra de Momentum for validada. */
ok(r.itens.length <= 3,
   'a vaga do Momentum nao foi redistribuida: ' + r.itens.length + ' ferramentas');

// o botao leva mesmo para a ferramenta
const abriu = await p.evaluate(async () => {
  document.querySelector('[data-abrir]').click();
  await new Promise(r => setTimeout(r, 400));
  const v = document.querySelector('.vista-ferramenta:not(.hidden)');
  return { id: v ? v.id : null, titulo: v ? v.querySelector('h2')?.textContent.trim() : null };
});
ok(!!abriu.id, 'o botao abre a ferramenta: ' + (abriu.titulo || '-').slice(0,50));

await nav.close();
console.log(ruim.length?'\n  ERRO: '+ruim[0]:'\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
