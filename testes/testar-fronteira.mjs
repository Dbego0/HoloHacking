/**
 * A FRONTEIRA: o HOLOSCOPE e avaliacao nutricional, nao diagnostico medico.
 *
 * O motor nunca afirmou doenca — a conta e a soma auditavel do que o paciente
 * relatou. Quem afirmava era a TELA: os cinco cards traziam "Candida, fungos,
 * biofilme", "Resistencia a insulina" e "intoxicacao" como legenda da nota,
 * e a secao prometia "revela em minutos aquilo que levaria meses". Onze
 * perguntas de autorrelato nao sustentam nenhuma das tres.
 *
 * Este teste existe porque isso volta por edicao de texto, nao por bug: basta
 * alguem "melhorar a copy" e a linha e cruzada de novo, em silencio.
 *
 * A decisao D5 (27/08) e a regra: a palavra e "avaliacao integral".
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1500, height: 1200 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => {
  if (!c) falhou = true;
  console.log((c ? '  ok    ' : '  FALHA ') + t);
};

// --- a fronteira esta na tela do mapa, com e sem mapa ---------------------
const semMapa = await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  const f = document.querySelector('.holo-fronteira');
  return f ? f.textContent.replace(/\s+/g, ' ').trim() : null;
});
ok(semMapa !== null, 'a fronteira está na tela antes de qualquer mapa');
ok(/não é exame/i.test(semMapa || '') && /não é diagnóstico médico/i.test(semMapa || ''),
   '  "' + (semMapa || '').slice(0, 96) + '..."');
ok(/avaliação nutricional integral/i.test(semMapa || ''), 'e diz o que ELE é, não só o que não é');

// --- os cards descrevem sinal relatado, nao causa -------------------------
const cards = await p.evaluate(() =>
  [...document.querySelectorAll('.holo-card')].map(c => ({
    nome: c.querySelector('h5').textContent,
    desc: c.querySelector('.holo-desc').textContent,
  })));

const PROIBIDO = [
  /c[âa]ndida/i,            // agente infeccioso
  /resist[êe]ncia a? insulina/i, // condicao que so se afirma com exame
  /intoxica[çc][ãa]o/i,     // nao e entidade clinica
  /sobrecarga hep[áa]tica/i,
  /acidose/i,
];
const acusados = cards.filter(c => PROIBIDO.some(r => r.test(c.desc)));
ok(acusados.length === 0,
   acusados.length === 0
     ? 'nenhum card nomeia agente ou condição como achado'
     : 'card afirmando causa: ' + acusados.map(c => c.nome + ' — ' + c.desc).join(' | '));
cards.forEach(c => console.log('          ' + c.nome + ': ' + c.desc));

ok(cards.some(c => /Mental-Emocional-Espiritual/.test(c.nome)),
   'o card usa o nome inteiro do sistema, como o relatório');

// --- a secao nao promete acuracia diagnostica ----------------------------
const promessa = await p.evaluate(() =>
  document.querySelector('#secao-holoscope .secao-cabeca p')?.textContent || '');
ok(!/levaria meses|revela, em minutos/i.test(promessa),
   'a seção não promete o que nenhum gabarito sustenta');
console.log('          "' + promessa.slice(0, 100) + '..."');

// --- a palavra "diagnostico" so aparece onde ela nega -------------------
const ondeAparece = await p.evaluate(() => {
  const saida = [];
  document.querySelectorAll('body *').forEach(el => {
    if (el.children.length) return;                 // so folhas, para nao contar duas vezes
    const t = (el.textContent || '');
    if (/diagn[óo]stic/i.test(t)) {
      saida.push({ texto: t.replace(/\s+/g, ' ').trim().slice(0, 80),
                   naFronteira: !!el.closest('.holo-fronteira, .rel-fronteira') });
    }
  });
  return saida;
});
const foraDaFronteira = ondeAparece.filter(x => !x.naFronteira);
ok(foraDaFronteira.length === 0,
   foraDaFronteira.length === 0
     ? 'a palavra "diagnóstico" só aparece na frase que a nega (D5)'
     : 'ainda diz diagnóstico: ' + foraDaFronteira.map(x => '"' + x.texto + '"').join(' | '));

// --- o relatorio do paciente carrega a mesma frase ------------------------
const rel = await p.evaluate(async (respostas) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Marina Alves';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 350));
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(respostas));
  await new Promise(r => setTimeout(r, 250));
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.querySelector('.card-paciente').click();
  await new Promise(r => setTimeout(r, 350));
  document.querySelector('[data-aba="relatorio"]').click();
  await new Promise(r => setTimeout(r, 450));
  return {
    fronteira: document.querySelector('.rel-fronteira')?.textContent.replace(/\s+/g, ' ').trim(),
    rodape: document.querySelector('.rel-rodape')?.textContent.replace(/\s+/g, ' ').trim(),
  };
}, caso.respostas);

ok(/não é diagnóstico médico/i.test(rel.fronteira || ''),
   'o registro do paciente traz a fronteira no topo, não no rodapé');
ok(/encaminhada ao médico/i.test(rel.rodape || ''),
   'e o rodapé diz para onde encaminhar: "' + (rel.rodape || '').slice(-58) + '"');

await nav.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
