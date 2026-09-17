/**
 * O caminho que o produto promete: responder as perguntas e o mapa sair
 * sozinho. Usa o caso de exemplo, cujo resultado no terminal e Indice 43
 * com CMB-001 disparando.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));
const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1500, height: 1100 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
/* Estes testes fotografam um elemento, e a camada de entrada (login.js) o
   cobriria. Dispensa-la aqui nao e autenticar: e descobrir a tela, o mesmo que
   o botao visivel de desenvolvimento faz. */
await p.evaluate(() => window.LoginView && window.LoginView.abrirApp());
await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => {
  if (!c) falhou = true;
  console.log((c ? '  ok    ' : '  FALHA ') + t);
};

// --- a tela abre e monta as 84 --------------------------------------------
const abriu = await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  document.getElementById('btn-abrir-questionario').click();
  return {
    itens: document.querySelectorAll('.q-item').length,
    blocos: [...document.querySelectorAll('.q-bloco-cabeca b')].map(e => e.textContent),
    porBloco: [...document.querySelectorAll('.q-bloco')].map(b => b.querySelectorAll('.q-item').length),
    manualEscondido: document.getElementById('holoscope-manual').classList.contains('hidden'),
  };
});
ok(abriu.itens === 84, abriu.itens + ' perguntas na tela');
ok(abriu.blocos.join(',') === 'BioRoot,NeuroScan,Terreno Espiritual', 'blocos: ' + abriu.blocos.join(' · '));
ok(abriu.porBloco.join(',') === '49,19,16', 'divisao: ' + abriu.porBloco.join(' / '));
ok(abriu.manualEscondido, 'pontuacao manual sai da frente');

// --- responder tres e conferir que grava ----------------------------------
const parcial = await p.evaluate(() => {
  const itens = [...document.querySelectorAll('.q-item')].slice(0, 3);
  itens.forEach(i => i.querySelectorAll('.q-btn')[2].click());
  return {
    conta: document.querySelector('.q-conta').textContent,
    barra: document.querySelector('.q-progresso i').style.width,
    guardado: Object.keys(JSON.parse(localStorage.getItem('holohacking.questionario'))[
      window.pacienteAtivoId() || '_sem_paciente'] || {}).length,
  };
});
ok(parcial.guardado === 3, 'gravou 3 respostas: ' + parcial.conta.trim());
ok(parcial.barra !== '0%' && parcial.barra !== '', 'barra de progresso andou: ' + parcial.barra);

// --- salvamento parcial: recarregar a pagina nao pode perder --------------
await p.reload({ waitUntil: 'networkidle2' });
await p.evaluate(() => window.LoginView && window.LoginView.abrirApp());
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
const depois = await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  document.getElementById('btn-abrir-questionario').click();
  return document.querySelectorAll('.q-btn.marcado').length;
});
ok(depois === 3, 'depois de recarregar, as 3 continuam marcadas: ' + depois);

// --- responder as 84 do caso de exemplo -----------------------------------
const fim = await p.evaluate((respostas) => {
  const mapa = {};
  respostas.forEach(r => { mapa[r.marcador_id] = r.intensidade; });
  document.querySelectorAll('.q-item').forEach(item => {
    const v = mapa[item.dataset.marcador];
    if (v === undefined) return;
    item.querySelectorAll('.q-btn')[v].click();
  });
  const conta = document.querySelector('.q-conta').textContent;
  document.querySelector('[data-acao="calcular"]').click();
  return {
    conta,
    indice: document.getElementById('holo-score-total').textContent,
    origem: document.getElementById('holo-origem').textContent,
    notas: ['fungico','inflamatorio','metabolico','detox','mental']
      .map(s => document.getElementById('val-' + s).textContent),
    travadas: ['fungico','inflamatorio','metabolico','detox','mental']
      .every(s => document.getElementById('holo-' + s).disabled),
    combinadas: [...document.querySelectorAll('.leitura-combinada b')].map(e => e.textContent),
    voltouAoMapa: !document.getElementById('holoscope-manual').classList.contains('hidden'),
  };
}, caso.respostas);

ok(fim.conta.includes('84'), 'respondeu tudo: ' + fim.conta.trim());
ok(fim.indice === '43', 'INDICE = ' + fim.indice + '  (o terminal da 43)');
ok(fim.notas.join(' ') === '6.7 6.7 0.8 6.7 0.7', 'notas exatas: ' + fim.notas.join(' · '));
ok(fim.travadas, 'as reguas viraram resultado, nao entrada');
/* Revisao clinica do HOLOSCOPE (decisao 1): nenhuma CMB aparece na
   interface clinica nesta rodada, nem a CMB-001 (status=confirmado no
   banco, mas sem revisao de tom) — ver app.js, cmbParaExibir(). O motor
   continua disparando as 16 (ver testar-motor.mjs, testar-combinacoes-
   status.mjs); so a tela nunca mais mostra. */
ok(fim.combinadas.length === 0, 'nenhuma leitura combinada na tela: ' + fim.combinadas.length);
ok(fim.voltouAoMapa, 'o questionario fecha e mostra o mapa');
ok(/84/.test(fim.origem), 'diz de onde veio: ' + fim.origem.trim().slice(0, 60));

const el = await p.$('#secao-holoscope');
await el.screenshot({ path: 'questionario-resultado.png' });
await nav.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
