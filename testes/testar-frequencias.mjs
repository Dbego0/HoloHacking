/**
 * Mapa de Frequencias — a quinta subferramenta.
 *
 * Nota por chacra, lida das MESMAS respostas do questionario pela coluna
 * `chacra` de cada marcador. Nenhuma pergunta nova: e um segundo recorte.
 *
 * Desde 13/09 ele esta PARADO por decisao (config.csv), porque o mapeamento
 * chacra-marcador e proposta e nao metodo. O banco continua inteiro.
 *
 * Duas coisas para travar:
 *   1. parado, a tela nao mostra nada — nem quadro vazio com ar de resultado;
 *   2. o desenho continua certo, para o dia em que a chave for religada.
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

// --- o mapa, das respostas do caso de exemplo ----------------------------
const real = await p.evaluate((respostas) => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  const r = HOLOSCOPE.calcular(respostas);
  window.aplicarPontuacao(r);
  const caixa = document.getElementById('holo-frequencias');
  const card = [...document.querySelectorAll('.holo-subtool')]
    .find(c => /Frequ/.test(c.querySelector('h6').textContent));
  return {
    doMotor: r.frequencias.map(f => f.chacra + '=' + f.nota),
    visivel: !caixa.classList.contains('hidden'),
    linhas: [...caixa.querySelectorAll('.freq-linha')].map(l => ({
      nome: l.querySelector('.freq-nome').childNodes[0].textContent.trim(),
      leitura: l.querySelector('.freq-nome i')?.textContent,
      nota: l.querySelector('.freq-nota').textContent,
      travado: l.classList.contains('travado'),
    })),
    selo: card?.querySelector('.selo-construcao')?.textContent || null,
  };
}, caso.respostas);

ok(real.doMotor.length === 0, 'parado, o motor não devolve mapa nenhum');
ok(!real.visivel && real.linhas.length === 0,
   'e a tela não mostra quadro vazio com ar de resultado');
ok(real.selo === 'em revisão', 'o card avisa que está parado: "' + real.selo + '"');

// --- o desenho, com valores controlados ----------------------------------
// Alimenta a MESMA funcao com um mapa montado a mao, para conferir a
// geometria: a barra mede a nota, e o rodape aponta o mais travado.
const amanha = await p.evaluate((respostas) => {
  const r = HOLOSCOPE.calcular(respostas);
  r.frequencias = [
    { chacra: 'plexo solar', nota: 1.4, leitura: 'poder pessoal contido', ordem: 3, respondidos: 4 },
    { chacra: 'cardíaco',    nota: 5.0, leitura: 'afeto e perdão',        ordem: 4, respondidos: 3 },
    { chacra: 'raiz',        nota: 8.6, leitura: 'sustentação',           ordem: 1, respondidos: 2 },
  ];
  window.aplicarPontuacao(r);
  const caixa = document.getElementById('holo-frequencias');
  return {
    visivel: !caixa.classList.contains('hidden'),
    linhas: [...caixa.querySelectorAll('.freq-linha')].map(l => ({
      nome: l.querySelector('.freq-nome').childNodes[0].textContent.trim(),
      leitura: l.querySelector('.freq-nome i')?.textContent,
      nota: l.querySelector('.freq-nota').textContent,
      largura: l.querySelector('.freq-trilho b').style.width,
      travado: l.classList.contains('travado'),
    })),
    leitura: caixa.querySelector('.freq-leitura')?.textContent.replace(/\s+/g, ' ').trim(),
  };
}, caso.respostas);

ok(amanha.visivel, 'o painel desenha o que recebe');
ok(amanha.linhas.length === 3, amanha.linhas.length + ' chacras desenhados');
ok(amanha.linhas[0].nome === 'plexo solar' && amanha.linhas[0].travado,
   'o primeiro é o mais travado, e vem marcado: ' + amanha.linhas[0].nome);
ok(amanha.linhas[0].largura === '14%', 'a barra mede a nota: 1.4 → ' + amanha.linhas[0].largura);
ok(amanha.linhas[2].largura === '86%', 'e 8.6 → ' + amanha.linhas[2].largura);
ok(amanha.linhas[0].leitura === 'poder pessoal contido', 'cada linha traz a leitura do chacra');
ok(/plexo solar/.test(amanha.leitura || ''), 'e o rodapé aponta o mais travado: ' + amanha.leitura);

// --- pontuando a mao nao ha mapa ------------------------------------------
const aMao = await p.evaluate(async () => {
  document.getElementById('btn-repontuar')?.click();
  await new Promise(r => setTimeout(r, 200));
  return document.getElementById('holo-frequencias').classList.contains('hidden');
});
ok(aMao, 'voltando a pontuar à mão, o mapa some — ele vem das respostas');

await nav.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
