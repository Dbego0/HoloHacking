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

/* Revisao clinica do HOLOSCOPE (decisao 3): "Por onde começar" passou a ler
   regrasApresentaveis() (so status=confirmado), nao regrasAtivas() (que so
   excluia nao_validado e deixava passar REC-001..015, status=legado).
   Motivo duplo: nenhuma dessas 15 regras foi validada pelo metodo, E os
   recommended_tool_id delas apontavam para ferramentas que a revisao de
   Corpo/Mente/Espirito ja retirou da galeria (mapa_rotina, diario_corporal,
   gatilhos_respostas, etc.) — "Por onde começar" era uma porta dos fundos
   ativa reabrindo o que foi fechado de proposito. Hoje, com 0 REC
   confirmada, a lista fica vazia e a tela diz isso em voz alta. */
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
    criticos: [...document.querySelectorAll('.prio-linha')]
      .map(e => e.querySelector('.prio-nome').childNodes[0].textContent.trim()),
    aviso: (document.querySelector('.leitura-aviso') || {}).textContent || '',
    apresentaveis: window.CorpoBancos.regrasApresentaveis().length,
    validadas: (window.CorpoBancos.RECOMENDACOES || [])
      .filter(r => window.CorpoBancos.validada(r)).length,
    maisBaixo: [...HOLOSCOPE.calcular(respostas).sistemas]
      .sort((a, b) => a.nota - b.nota)[0].nome,
  };
}, caso.respostas);

ok(r.itens.length === 0, r.itens.length + ' ferramentas indicadas (esperado 0: nenhuma REC confirmada)');
ok(r.ids.length === 0, 'nenhum [data-abrir] na tela — sem porta dos fundos para ferramenta oculta: ' + r.ids.length);
ok(r.criticos[0] === r.maisBaixo, 'o Mapa de Prioridades comeca pelo sistema mais baixo: ' + r.criticos[0]);

ok(r.validadas === 0 && r.apresentaveis === 0,
   'nenhuma regra de recomendacao esta validada pelo metodo: ' + r.validadas + ' validadas, ' + r.apresentaveis + ' apresentaveis');
ok(/desativadas até serem validadas pelo método/i.test(r.aviso),
   'e a tela avisa que as sugestões estão desativadas: "' + r.aviso.slice(0, 90) + '"');

await nav.close();
console.log(ruim.length?'\n  ERRO: '+ruim[0]:'\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
