/**
 * O CRUZAMENTO — o diferencial da ideia original.
 *
 * "Ele nao entrega so 'vitamina D baixa'. Ele entrega leitura sistemica":
 * exame + sintoma + padrao emocional lidos juntos. Ate 13/09 uma combinacao
 * so sabia ler as cinco notas, entao o exemplo do proprio material —
 * "cortisol elevado + compulsao noturna + padrao de rejeicao" — nao era
 * expressavel: virava "metabolico <= 3 E mental <= 3", o reflexo do achado.
 *
 * Agora a condicao le marcador, exame, triada, chacra e o que as ferramentas
 * mediram. Este teste prova que o caminho existe PELA INTERFACE: o que a
 * nutricionista digita chega ao motor.
 *
 * O invariante que nao pode cair junto: exame continua FORA do Indice. Ele
 * cruza, nao pontua.
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

// --- a gramatica esta viva no pacote do navegador ------------------------
const gramatica = await p.evaluate((respostas) => {
  const semContexto = HOLOSCOPE.calcular(respostas);
  const comContexto = HOLOSCOPE.calcular(respostas, {
    exames: { 'EXA-005': 115 },
    ferramentas: { energia_vital: { ao_acordar: 2 } },
  });
  return {
    aceita: true,
    indiceIgual: semContexto.indice === comContexto.indice,
    notasIguais: JSON.stringify(semContexto.sistemas.map(s => s.nota))
              === JSON.stringify(comContexto.sistemas.map(s => s.nota)),
    indice: comContexto.indice,
  };
}, caso.respostas);
ok(gramatica.aceita, 'calcular() aceita o contexto de exame e ferramenta');
ok(gramatica.indiceIgual && gramatica.notasIguais,
   'e o exame continua FORA da conta: Índice ' + gramatica.indice + ' com e sem contexto');

// --- os eixos terapeuticos vieram do banco, nao do codigo ---------------
const eixos = await p.evaluate(async () => {
  const todos = HOLOSCOPE.eixos();
  return {
    total: todos.length,
    nomes: [...new Set(todos.map(e => e.eixo))].sort(),
    doMental: HOLOSCOPE.eixos('mental_emocional_espiritual').map(e => e.eixo),
  };
});
ok(eixos.total > 0, eixos.total + ' eixos terapêuticos vindos de eixos.csv');
ok(eixos.nomes.length === 3, 'os três do material: ' + eixos.nomes.join(' · '));
ok(eixos.doMental.length === 2, 'Mental-Emocional-Espiritual → ' + eixos.doMental.join(' + '));

// --- o que a nutricionista digita chega ao contexto ----------------------
const daTela = await p.evaluate(async () => {
  // cadastra e lanca um exame pela interface
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Marina Alves';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 350));
  document.querySelector('.card-paciente').click();
  await new Promise(r => setTimeout(r, 350));
  document.querySelector('[data-aba="documentos"]').click();
  await new Promise(r => setTimeout(r, 350));

  const campo = document.querySelector('#ex-corpo input[type="number"]');
  const idExame = campo.id || campo.dataset.exame || campo.name;
  campo.value = '115';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  campo.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));

  const ctx = window.Panorama.contexto();
  return {
    idExame,
    exames: ctx.exames,
    quantosExames: Object.keys(ctx.exames).length,
    ferramentas: ctx.ferramentas,
  };
});
ok(daTela.quantosExames > 0,
   'o exame digitado na tela chega ao contexto: ' + JSON.stringify(daTela.exames));
ok(Object.values(daTela.exames).every(v => typeof v === 'number'),
   'e chega como número, não como texto');

/* --- ferramenta: so o que e numero entra --------------------------------

   As respostas viraram aplicacoes datadas. O contexto sai da aplicacao
   CONCLUIDA mais recente — rascunho nao entra, porque o que esta pela metade
   nao pode disparar leitura. */
const daFerramenta = await p.evaluate(async () => {
  const f = window.CATALOGO_FERRAMENTAS.find(x => x.id === 'energia_vital');
  const app = await window.Aplicacoes.nova(f);
  await window.Aplicacoes.concluir(app, {
    qualidade_geral: '7',
    derruba: 'a noite mal dormida',
    dias: [{ acordar: '2', meio_manha: '4' }]
  }, null);
  return window.Panorama.contexto().ferramentas.energia_vital;
});
ok(daFerramenta && daFerramenta.qualidade_geral === 7,
   'a nota da ferramenta entra como número: ' + JSON.stringify(daFerramenta));
ok(!('derruba' in daFerramenta),
   'e o campo de texto fica de fora — não há como cruzar frase');
ok(!('dias' in daFerramenta),
   'e a lista de itens também: uma condição lê um valor, não um array');

/* Rascunho nao chega ao motor. */
const soConcluida = await p.evaluate(async () => {
  const f = window.CATALOGO_FERRAMENTAS.find(x => x.id === 'hidratacao_movimento');
  const app = await window.Aplicacoes.nova(f);
  await window.Aplicacoes.salvarRespostas(app, { copos: '8' }, null);
  return window.Panorama.contexto().ferramentas.hidratacao_movimento || null;
});
ok(soConcluida === null, 'rascunho não chega ao motor');

await nav.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
