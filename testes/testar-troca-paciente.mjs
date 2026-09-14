/**
 * Trocar de paciente tem que trocar a TELA inteira, nao so o nome no seletor.
 *
 * O bug: a Triada e a linha "calculado a partir de 84 respostas" ficavam na
 * tela depois da troca. Abrir a Carla logo depois da Marina mostrava a Triada
 * da Marina com o nome da Carla em cima. E o Indice de quem nunca foi avaliado
 * aparecia como "0 de 100" — numa escala onde 100 e o melhor, o pior resultado
 * possivel.
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
await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => {
  if (!c) falhou = true;
  console.log((c ? '  ok    ' : '  FALHA ') + t);
};

const r = await p.evaluate(async (respostas) => {
  const novo = async (nome) => {
    document.querySelector('.nav-item[data-secao="pacientes"]').click();
    const v = document.getElementById('voltar-lista'); if (v) v.click();
    document.getElementById('btn-abrir-novo').click();
    document.getElementById('np-nome').value = nome;
    document.getElementById('btn-salvar-paciente').click();
    await new Promise(x => setTimeout(x, 350));
  };
  const tela = () => ({
    indice: document.getElementById('holo-score-total').textContent,
    interpretacao: document.getElementById('holo-interpretacao').textContent,
    triada: document.getElementById('holo-triada').classList.contains('hidden')
      ? null : [...document.querySelectorAll('.triada-nota')].map(e => e.textContent).join(' '),
    origem: document.getElementById('holo-origem').innerText.trim(),
    combinadas: document.querySelectorAll('.leitura-combinada').length,
    criticos: document.querySelectorAll('.leitura-cabeca').length,
    travadas: [...document.querySelectorAll('.holo-range-wrap input')].every(i => i.disabled),
  });

  await novo('Marina Alves');
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(respostas));
  await new Promise(x => setTimeout(x, 300));
  const marina = tela();

  await novo('Carla Souza');
  const sel = document.querySelector('.seletor-paciente');
  sel.value = [...sel.options].find(o => /Carla/.test(o.text)).value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(x => setTimeout(x, 400));
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  const carla = tela();

  // e voltar para a Marina tem que trazer o mapa dela de volta
  sel.value = [...sel.options].find(o => /Marina/.test(o.text)).value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(x => setTimeout(x, 400));
  const devolta = tela();

  return { marina, carla, devolta };
}, caso.respostas);

console.log('  Marina: Índice ' + r.marina.indice + ' · Tríada ' + r.marina.triada);
ok(r.marina.indice === '43', 'a Marina tem mapa: Índice ' + r.marina.indice);
ok(r.marina.triada === '4.0 3.3 2.0', 'e Tríada: ' + r.marina.triada);

console.log('\n  Carla, recém-cadastrada:');
ok(r.carla.triada === null, 'a Tríada da Marina sumiu da tela');
ok(r.carla.origem === '', 'a linha de origem da Marina sumiu: "' + r.carla.origem + '"');
ok(r.carla.combinadas === 0, 'nenhuma leitura combinada herdada');
ok(r.carla.criticos === 0, 'nenhum sistema crítico herdado');
ok(r.carla.indice === '—', 'sem mapa o Índice é um traço, não zero: ' + r.carla.indice);
ok(/Aplique o question/.test(r.carla.interpretacao), 'e a tela convida: ' + r.carla.interpretacao);
ok(!r.carla.travadas, 'as réguas destravam para quem ainda não foi pontuado');

console.log('\n  de volta para a Marina:');
ok(r.devolta.indice === '43', 'o Índice dela voltou: ' + r.devolta.indice);
ok(r.devolta.triada === '4.0 3.3 2.0', 'e a Tríada dela também: ' + r.devolta.triada);
ok(r.devolta.combinadas === r.marina.combinadas,
   'e a leitura combinada: ' + r.devolta.combinadas);

await nav.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
