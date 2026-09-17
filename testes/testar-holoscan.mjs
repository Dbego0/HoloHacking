/**
 * HOLOSCAN — a camada de confronto relato x laboratorio, revisao clinica do
 * HOLOSCOPE.
 *
 * O que este teste trava (itens B a G do mandato da revisao):
 *
 *   B/C/D  lancar os 24 exames nao muda nota de sistema nenhuma, nem o
 *          Indice, nem a Triade — o motor ja garantia isso (testar-exames.mjs);
 *          aqui a prova e de ponta a ponta, pela tela.
 *   E      sem nenhum exame lancado, os cinco sistemas aparecem como DADOS
 *          INSUFICIENTES no Holoscan — nao ha bloco vazio nem sistema que
 *          simplesmente some.
 *   F      um caso divergente nao altera a nota exibida do sistema.
 *   G      nenhuma frase da lista de frases banidas (resistencia a insulina,
 *          inflamacao silenciosa, sobrecarga hepatica etc.) aparece em
 *          nenhuma das superficies do Holoscan — nem tela, nem tooltip, nem
 *          relatorio.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1500, height: 1400 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Paciente Holoscan';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 400));
});

await p.evaluate(async (respostas) => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  document.getElementById('btn-abrir-questionario').click();
  const m = {}; respostas.forEach(x => m[x.marcador_id] = x.intensidade);
  document.querySelectorAll('.q-item').forEach(i => {
    const v = m[i.dataset.marcador];
    if (v !== undefined) i.querySelectorAll('.q-btn')[v].click();
  });
  document.querySelector('[data-acao="calcular"]').click();
  await new Promise(r => setTimeout(r, 400));
  document.getElementById('btn-salvar-holoscope').click();
  await new Promise(r => setTimeout(r, 400));
}, caso.respostas);

/* ==================================================================== */
console.log('\n  E — SEM NENHUM EXAME, DADOS INSUFICIENTES\n');
/* ==================================================================== */

const semExame = await p.evaluate(() => {
  const caixa = document.getElementById('holo-holoscan');
  return {
    texto: caixa ? caixa.innerText.replace(/\s+/g, ' ') : '',
    selos: [...(caixa ? caixa.querySelectorAll('.conf-selo') : [])].map(e => e.textContent),
  };
});
ok(semExame.selos.length === 5 && semExame.selos.every(s => /Dados insuficientes/i.test(s)),
   'os cinco sistemas aparecem como Dados insuficientes: ' + semExame.selos.join(', '));
ok(!/convergente|divergente/i.test(semExame.texto.replace(/dados insuficientes/gi, '')),
   'nenhuma palavra de conclusão aparece sem exame nenhum lançado');

/* ==================================================================== */
console.log('\n  B/C/D — EXAMES NÃO ALTERAM NOTA, ÍNDICE NEM TRÍADE\n');
/* ==================================================================== */

const antes = await p.evaluate(() => {
  const r = window.ultimaPontuacao();
  return { indice: r.indice, notas: r.sistemas.map(s => [s.sistema, s.nota]), triada: r.triada };
});

const TODOS_EXAMES = {
  'EXA-001': 0.5, 'EXA-002': 0.5, 'EXA-003': 8, 'EXA-004': 4,
  'EXA-005': 115, 'EXA-006': 4, 'EXA-007': 1, 'EXA-008': 5,
  'EXA-009': 70, 'EXA-010': 60, 'EXA-011': 1.2, 'EXA-012': 1.2,
  'EXA-013': 18, 'EXA-014': 18, 'EXA-015': 78, 'EXA-016': 0.6,
  'EXA-017': 25, 'EXA-018': 0.8, 'EXA-019': 50, 'EXA-020': 600,
  'EXA-021': 100, 'EXA-022': 5, 'EXA-023': 5, 'EXA-024': 14,
};

await p.evaluate(async (valores) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('vista-lista-pacientes').classList.add('hidden');
  document.getElementById('vista-ficha').classList.remove('hidden');
  document.querySelector('[data-aba="documentos"]').click();
  await new Promise(r => setTimeout(r, 300));
  Object.keys(valores).forEach(id => {
    const l = [...document.querySelectorAll('#ex-corpo .ex-linha')].find(x => x.dataset.exame === id);
    if (!l) return;
    const input = l.querySelector('input');
    input.value = String(valores[id]);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 300));
}, TODOS_EXAMES);

const depois = await p.evaluate(() => {
  const r = window.ultimaPontuacao();
  return { indice: r.indice, notas: r.sistemas.map(s => [s.sistema, s.nota]), triada: r.triada };
});

ok(JSON.stringify(antes.indice) === JSON.stringify(depois.indice),
   'Índice idêntico antes/depois de lançar os 24 exames: ' + antes.indice + ' = ' + depois.indice);
ok(JSON.stringify(antes.notas) === JSON.stringify(depois.notas),
   'as cinco notas de sistema continuam idênticas');
ok(JSON.stringify(antes.triada) === JSON.stringify(depois.triada),
   'a Tríade continua idêntica');

/* ==================================================================== */
console.log('\n  F — DIVERGÊNCIA NÃO CORRIGE A NOTA EXIBIDA\n');
/* ==================================================================== */

const divergencia = await p.evaluate(() => {
  const caixa = document.getElementById('holo-holoscan');
  const bloco = [...caixa.querySelectorAll('.holo-dominante-sistema')]
    .find(b => /Detox/.test(b.querySelector('h5').textContent));
  return {
    selo: bloco.querySelector('.conf-selo').textContent,
    notaNaTela: document.getElementById('holo-score-total').textContent,
  };
});
ok(/Divergente/i.test(divergencia.selo),
   'o sistema Detox (relato ok, GGT alterado) aparece como Divergente: ' + divergencia.selo);
ok(divergencia.notaNaTela === String(depois.indice),
   'o Índice na tela continua o do motor, a divergência não o corrige: ' + divergencia.notaNaTela);

/* ==================================================================== */
console.log('\n  G — NENHUMA FRASE BANIDA EM NENHUMA SUPERFÍCIE DO HOLOSCAN\n');
/* ==================================================================== */

const PROIBIDO = [
  /resist[êe]ncia (a|à)?\s?insulina/i,
  /inflama[çc][ãa]o silenciosa/i,
  /processo inflamat[óo]rio ativo/i,
  /carga [áa]cida elevada/i,
  /metila[çc][ãa]o comprometida/i,
  /hiperalerta sustentado/i,
  /sobrecarga hep[áa]tica/i,
  /tireoide pedindo/i,
  /problema de tireoide/i,
];

const superficies = await p.evaluate(() => {
  document.querySelector('[data-aba="relatorio"]').click();
  const rel = document.getElementById('relatorio');
  const tooltips = [...document.querySelectorAll('#ex-corpo .ex-linha[title]')].map(l => l.title);
  return {
    holoscan: document.getElementById('holo-holoscan')?.innerText || '',
    exConfronto: document.getElementById('ex-confronto')?.innerText || '',
    relatorio: rel ? rel.innerText : '',
    tooltips,
  };
});

const varrer = (nome, texto) => {
  const achados = PROIBIDO.filter(re => re.test(texto));
  ok(achados.length === 0,
     nome + ' livre de frases banidas' + (achados.length ? ': ' + achados.map(r => r.source).join(', ') : ''));
};
varrer('#holo-holoscan', superficies.holoscan);
varrer('#ex-confronto', superficies.exConfronto);
varrer('relatório (seção B)', superficies.relatorio);
varrer('tooltips de exame', superficies.tooltips.join(' | '));
ok(superficies.tooltips.length > 0 && superficies.tooltips.every(t => /faixa cadastrada/i.test(t)),
   'os tooltips descrevem valor/faixa, nunca a leitura clínica do CSV: "' +
   (superficies.tooltips[0] || '').slice(0, 90) + '"');

await nav.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
