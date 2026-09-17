/**
 * CMB — nenhuma combinação aparece como conclusão automática na interface
 * clínica nesta rodada, nem a CMB-001 (status=confirmado no banco, mas cuja
 * redação ainda não passou por revisão de tom com o Rodrigo).
 *
 * O que este teste trava (item H do mandato da revisão clínica):
 *
 *   1. o motor continua retornando as 16 combinações (dado preservado);
 *   2. o banco (combinacoes.csv) continua com as 16 linhas;
 *   3. NENHUMA combinação é renderizada em nenhum dos três consumidores
 *      (tela do HOLOSCOPE, Visão clínica da ficha, relatório impresso) —
 *      nem mesmo a CMB-001, mesmo quando sua condição é satisfeita;
 *   4. o histórico antigo (snapshot salvo antes de existir qualquer noção
 *      de status) continua legível e não é alterado no disco.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1500, height: 1300 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

/* ==================================================================== */
console.log('\n  1/2 — O DADO CONTINUA INTEIRO (motor e banco)\n');
/* ==================================================================== */

const dado = await p.evaluate((respostas) => {
  const r = window.HOLOSCOPE.calcular(respostas);
  return {
    noBanco: window.HOLOSCOPE.resumo().combinacoes,
    disparadas: r.combinacoes.length,
    temCMB001: r.combinacoes.some(c => c.id === 'CMB-001'),
  };
}, caso.respostas);
ok(dado.noBanco === 16, 'o banco (combinacoes.csv) continua com as 16 linhas: ' + dado.noBanco);
ok(dado.disparadas > 0, 'HOLOSCOPE.calcular() continua disparando combinações para o caso de exemplo: ' + dado.disparadas);
ok(dado.temCMB001, 'incluindo a CMB-001, que dispara no caso de exemplo');

/* ==================================================================== */
console.log('\n  3 — NENHUMA APARECE NOS TRÊS CONSUMIDORES\n');
/* ==================================================================== */

await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Paciente CMB';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 400));
});

const naTela = await p.evaluate(async (respostas) => {
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
  return {
    holoLeitura: [...document.querySelectorAll('#holo-leitura .leitura-combinada, #holo-leitura .leitura-item')].length,
    titulos: [...document.querySelectorAll('#holo-leitura .leitura-titulo')].map(e => e.textContent),
  };
}, caso.respostas);
ok(naTela.holoLeitura === 0, 'zero itens de combinação em #holo-leitura: ' + naTela.holoLeitura);
ok(!naTela.titulos.some(t => /Hipótese|Fora do escopo/i.test(t)),
   'nenhum título de bloco de combinação aparece: ' + naTela.titulos.join(' · '));

const naFicha = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('vista-lista-pacientes').classList.add('hidden');
  document.getElementById('vista-ficha').classList.remove('hidden');
  document.querySelector('[data-aba="visao"]').click();
  window.redesenharFicha();
  await new Promise(r => setTimeout(r, 300));
  return document.querySelectorAll('#aba-visao .fic-combinada').length;
});
ok(naFicha === 0, 'zero .fic-combinada na Visão clínica: ' + naFicha);

const noRelatorio = await p.evaluate(async () => {
  document.querySelector('[data-aba="relatorio"]').click();
  await new Promise(r => setTimeout(r, 300));
  return document.querySelectorAll('#relatorio .rel-combinada').length;
});
ok(noRelatorio === 0, 'zero .rel-combinada no relatório: ' + noRelatorio);

/* ==================================================================== */
console.log('\n  4 — HISTÓRICO ANTIGO CONTINUA LEGÍVEL E INALTERADO\n');
/* ==================================================================== */

const legado = await p.evaluate(async () => {
  const pid = window.pacienteAtivoId();
  const antes = localStorage.getItem('holohacking.pontuacao');
  const tudo = JSON.parse(antes);
  // Snapshot "v1": sem status em combinacoes, como era gravado antes desta
  // rodada. CMB-001 presente, sem campo status nenhum no objeto.
  const v1 = {
    quando: '2025-01-10',
    indice: 43, indice_maximo: 100, avaliavel: true,
    cobertura: { respondidos: 84, total: 84, percentual: 100 },
    sistemas: tudo[pid][0].sistemas,
    triada: tudo[pid][0].triada, triada_com_dado: tudo[pid][0].triada_com_dado,
    combinacoes: [
      { id: 'CMB-001', leitura: 'Paciente vivendo em estado crônico de ameaça',
        tipo: 'leitura', investigar: '', prioridade: 1, condicao: 'metabolico <= 3', fonte: 'material' },
    ],
  };
  tudo[pid] = [v1];
  localStorage.setItem('holohacking.pontuacao', JSON.stringify(tudo));
  if (window.Concorrencia) window.Concorrencia.avancarRevisao('pontuacao');

  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  window.redesenharFicha();
  await new Promise(r => setTimeout(r, 300));
  const indiceNaTela = document.querySelector('#aba-visao .fic-indice b')?.textContent;
  const combinadaNaTela = document.querySelectorAll('#aba-visao .fic-combinada').length;

  const depois = localStorage.getItem('holohacking.pontuacao');
  return { indiceNaTela, combinadaNaTela, inalterado: antes !== null && depois === JSON.stringify(tudo) };
});
ok(legado.indiceNaTela === '43', 'snapshot v1 (sem status) renderiza sem erro, Índice 43: ' + legado.indiceNaTela);
ok(legado.combinadaNaTela === 0,
   'e mesmo tendo CMB-001 gravada sem status nenhum, a tela não mostra: ' + legado.combinadaNaTela);
ok(legado.inalterado, 'o snapshot v1 no disco não foi reescrito por ter sido lido/exibido');

await nav.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
