/**
 * O criterio do plano: pagina em branco no navegador, chamar a pontuacao com
 * o caso de exemplo, ver Indice 42 com CMB-001 disparando — o mesmo que sai
 * hoje no terminal.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));
const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const p = await nav.newPage();
const ruim = []; p.on('pageerror', e => ruim.push(e.message));

// pagina em branco de verdade: so o pacote do motor
await p.setContent('<!doctype html><meta charset="utf-8"><title>motor</title>');
await p.addScriptTag({ url: 'http://127.0.0.1:5500/holoscope.js' });

const r = await p.evaluate((respostas) => {
  const g = window.HOLOSCOPE;
  if (!g) return { erro: 'HOLOSCOPE nao existe' };
  const pt = g.calcular(respostas);
  return {
    resumo: g.resumo(),
    perguntas: g.questionario().length,
    indice: pt.indice,
    cobertura: pt.cobertura.percentual,
    sistemas: pt.sistemas.map(s => s.nome + ' ' + s.nota.toFixed(1)),
    triada: pt.triada,
    combinacoes: pt.combinacoes.map(c => c.id + ' — ' + c.leitura),
    escopoBloqueia: g.escopo('quanto de levotiroxina devo tomar?').permitido,
  };
}, caso.respostas);

const ok = (c, t) => console.log((c ? '  ok    ' : '  FALHA ') + t);
if (r.erro) { console.log('  FALHA', r.erro); process.exit(1); }

ok(r.resumo.marcadores === 87, 'motor carregou ' + r.resumo.marcadores + ' marcadores');
ok(r.perguntas === 87, r.perguntas + ' perguntas montadas');
ok(r.indice === 42, 'INDICE = ' + r.indice + '  (esperado 42)');
ok(r.cobertura === 100, 'cobertura ' + r.cobertura + '%');
ok(r.combinacoes.some(c => c.startsWith('CMB-001')), 'CMB-001 disparou');
ok(r.escopoBloqueia === false, 'escopo bloqueia pergunta de medicamento');
console.log('\n  sistemas: ' + r.sistemas.join(' | '));
console.log('  triada:   ' + Object.entries(r.triada).map(([k,v])=>k+' '+v.toFixed(1)).join(' | '));
console.log('  leitura:  ' + r.combinacoes.join('; '));

await nav.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
