/**
 * O OQ³ dentro do histórico versionado.
 *
 * O QUE ESTAVA ERRADO
 *
 * O OQ³ era a única das dez ferramentas do Corpo fora do modelo de aplicações.
 * Ele gravava numa tabela própria e a tela mostrava só o registro mais recente
 * — não havia como abrir a aplicação de junho para comparar com a de setembro,
 * que é exatamente para o que a ferramenta serve. O §6.6 pede histórico e o
 * §4.1 diz que "histórico não pode ser apagado silenciosamente".
 *
 * O QUE ESTE TESTE COBRA
 *
 *   PRESERVA     a primeira aplicação continua inteira depois da segunda;
 *   NÃO PISA     começar outra não altera a anterior;
 *   HISTÓRICO    as duas voltam, na ordem, e dá para reabrir cada uma;
 *   PADRÃO       a aplicação carrega paciente, status e os três carimbos de
 *                tempo como as outras nove — e editar atualiza, não duplica;
 *   MIGRAÇÃO     o que foi salvo na tabela antiga volta, com a data que tinha;
 *   NADA NOVO    nenhuma nota, nenhuma síntese, nenhuma interpretação.
 *
 * O conteúdo clínico não é assunto deste teste porque não mudou: os mesmos
 * cinco campos, com os mesmos nomes.
 */
import puppeteer from 'puppeteer-core';

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1400, height: 1400 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

/* ==================================================================== */
/* PARTE 1 — duas aplicações, e a primeira sobrevive                    */
/* ==================================================================== */

const pid = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Marina Alves';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 400));
  return window.pacienteAtivoId();
});

const abrirOQ3 = () => p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="corpo"]').click();
  document.querySelector('[data-vista="vista-oq3"]').click();
  await new Promise(r => setTimeout(r, 450));
});

const preencher = (v) => p.evaluate(async (x) => {
  const set = (id, val) => {
    const el = document.getElementById(id);
    el.value = val;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  set('oq3-data', x.data);
  set('oq3-quer', x.quer);
  set('oq3-precisa', x.precisa);
  set('oq3-consegue', x.consegue);
  set('oq3-alavancas', x.alavancas);
  document.getElementById('btn-salvar-oq3').click();
  await new Promise(r => setTimeout(r, 450));
}, v);

await abrirOQ3();
await preencher({
  data: '2026-06-10',
  quer: 'Emagrecer 8 kg para o casamento da filha',
  precisa: 'Compulsao noturna e sono ruim',
  consegue: 'Cozinhar 3x por semana',
  alavancas: 'Organizar o jantar em familia'
});

const primeira = await p.evaluate(() => {
  const h = window.Aplicacoes.historico('oq3');
  return {
    quantas: h.length,
    app: h[0] && {
      paciente: h[0].paciente_id, ferramenta: h[0].ferramenta_id,
      status: h[0].status, versao: h[0].versao_ferramenta,
      temIniciada: !!h[0].iniciada_em, temConcluida: !!h[0].concluida_em,
      temAtualizada: !!h[0].atualizada_em,
      consulta: h[0].consulta_id,
      resultado: h[0].resultado,
      respostas: h[0].respostas
    }
  };
});
ok(primeira.quantas === 1, 'salvar cria UMA aplicação: ' + primeira.quantas);
ok(primeira.app.ferramenta === 'oq3' && primeira.app.paciente === pid,
   'ligada ao paciente e à ferramenta certos');
ok(primeira.app.status === 'concluida',
   'salvar conclui a aplicação, como nas outras nove: ' + primeira.app.status);
ok(primeira.app.temIniciada && primeira.app.temConcluida && primeira.app.temAtualizada,
   'com os três carimbos de tempo do modelo');
ok(primeira.app.consulta === null || typeof primeira.app.consulta === 'string',
   'e com o vínculo de consulta preenchido ou null — nunca inventado');
ok(primeira.app.resultado === null,
   'resultado é null: o OQ³ não deriva síntese, nota nem interpretação');
ok(primeira.app.respostas.quer === 'Emagrecer 8 kg para o casamento da filha' &&
   primeira.app.respostas.precisa === 'Compulsao noturna e sono ruim' &&
   primeira.app.respostas.consegue === 'Cozinhar 3x por semana' &&
   primeira.app.respostas.alavancas === 'Organizar o jantar em familia' &&
   primeira.app.respostas.data_consulta === '2026-06-10',
   'os cinco campos entram em respostas com os mesmos nomes de sempre');

/* ---- editar a mesma aplicação atualiza; não duplica ------------------- */

await preencher({
  data: '2026-06-10',
  quer: 'Emagrecer 8 kg para o casamento da filha',
  precisa: 'Compulsao noturna, sono ruim e exames alterados',
  consegue: 'Cozinhar 3x por semana',
  alavancas: 'Organizar o jantar em familia'
});
const editada = await p.evaluate(() => {
  const h = window.Aplicacoes.historico('oq3');
  return { quantas: h.length, precisa: h[0].respostas.precisa };
});
ok(editada.quantas === 1,
   'corrigir a aplicação aberta ATUALIZA — não cria outra: ' + editada.quantas);
ok(/exames alterados/.test(editada.precisa),
   'e a correção fica guardada');

/* ---- a segunda aplicação, gesto explícito ---------------------------- */

const segunda = await p.evaluate(async () => {
  document.getElementById('btn-nova-oq3').click();
  await new Promise(r => setTimeout(r, 450));
  return {
    camposLimpos: ['oq3-quer','oq3-precisa','oq3-consegue','oq3-alavancas']
      .every(id => document.getElementById(id).value === ''),
    quantas: window.Aplicacoes.historico('oq3').length,
    estados: window.Aplicacoes.historico('oq3').map(a => a.status)
  };
});
ok(segunda.camposLimpos, '"Nova aplicação" abre um formulário em branco');
ok(segunda.quantas === 2, 'e a anterior continua lá: ' + segunda.quantas + ' aplicações');
ok(segunda.estados.filter(s => s === 'concluida').length === 1 &&
   segunda.estados.filter(s => s === 'rascunho').length === 1,
   'uma concluída e uma em preenchimento: ' + segunda.estados.join(' + '));

await preencher({
  data: '2026-09-14',
  quer: 'Manter o peso e voltar a correr',
  precisa: 'Energia a tarde',
  consegue: 'Caminhar todo dia',
  alavancas: 'Correr com a filha no sabado'
});

const duas = await p.evaluate(() => {
  const h = window.Aplicacoes.historico('oq3');
  return {
    quantas: h.length,
    quers: h.map(a => a.respostas.quer),
    datas: h.map(a => a.respostas.data_consulta),
    estados: h.map(a => a.status)
  };
});
ok(duas.quantas === 2,
   'depois de salvar a segunda, continuam duas — nada foi sobrescrito: ' + duas.quantas);
ok(duas.estados.every(s => s === 'concluida'), 'as duas concluídas');
ok(duas.quers.indexOf('Emagrecer 8 kg para o casamento da filha') >= 0,
   'A PRIMEIRA APLICAÇÃO ESTÁ INTEIRA — era o que se perdia de vista antes');
ok(duas.quers.indexOf('Manter o peso e voltar a correr') >= 0,
   'e a segunda também');
ok(duas.datas.indexOf('2026-06-10') >= 0 && duas.datas.indexOf('2026-09-14') >= 0,
   'cada uma com a sua data de consulta: ' + duas.datas.join(' · '));

/* ---- o histórico na tela --------------------------------------------- */

const naTela = await p.evaluate(async () => {
  const caixa = document.getElementById('oq3-historico');
  const itens = [...caixa.querySelectorAll('[data-oq3-app]')];
  // reabrir a mais antiga tem que trazer o conteúdo dela de volta
  itens[itens.length - 1].click();
  await new Promise(r => setTimeout(r, 300));
  return {
    visivel: !caixa.classList.contains('hidden'),
    quantos: itens.length,
    querDepoisDeReabrir: document.getElementById('oq3-quer').value,
    nota: (document.getElementById('oq3-de-quando') || {}).textContent || ''
  };
});
ok(naTela.visivel && naTela.quantos === 2,
   'a tela lista as duas aplicações: ' + naTela.quantos);
ok(/Emagrecer 8 kg/.test(naTela.querDepoisDeReabrir),
   'e reabrir a mais antiga traz o conteúdo dela de volta');
ok(/aplicação de 10\/06\/2026/.test(naTela.nota),
   'dizendo de quando ela é, para ninguém editar junho achando que é setembro');

/* ---- a ficha e o Mapa leem a mais recente ---------------------------- */

const derivado = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="corpo"]').click();
  await new Promise(r => setTimeout(r, 250));
  const p2 = window.pacientesCarregados && window.pacienteAtivoId();
  const pac = (window.DadosLocais.exportar().tabelas.pacientes || [])
    .find(x => x.id === p2);
  document.querySelector('[data-vista="vista-mapa"]')?.click();
  await new Promise(r => setTimeout(r, 350));
  return {
    mapaQuer: (document.getElementById('mapa-quer') || {}).textContent || '',
    aindaNaTabela: (window.DadosLocais.exportar().tabelas.oq3 || []).length,
    temPaciente: !!pac
  };
});
ok(/Manter o peso/.test(derivado.mapaQuer),
   'o Mapa do Propósito lê a aplicação mais recente: ' +
   derivado.mapaQuer.slice(0, 40));

/* ==================================================================== */
/* PARTE 2 — o OQ³ antigo, salvo na tabela própria, volta               */
/* ==================================================================== */

/* Antes desta correção o OQ³ gravava em `oq3`, uma linha por vez que alguém
   salvava. Os dados nunca sumiram da tabela — sumiu o acesso a eles. A
   migração devolve cada linha como aplicação concluída, com o created_at
   real, e não apaga a tabela de origem. */
const migrado = await p.evaluate(async () => {
  localStorage.clear();

  const pid2 = 'paciente-antigo-1';
  localStorage.setItem('holohacking.dados.pacientes', JSON.stringify([
    { id: pid2, created_at: '2025-01-10T10:00:00.000Z', nome: 'Joana Antiga' }
  ]));
  localStorage.setItem('holohacking.dados.oq3', JSON.stringify([
    { id: 'oq3-velho-1', created_at: '2025-03-02T14:30:00.000Z', paciente_id: pid2,
      data_consulta: '2025-03-02', quer: 'Dormir melhor',
      precisa: 'Parar de acordar de madrugada', consegue: 'Desligar a tela as 22h',
      alavancas: 'Ritual antes de dormir' }
  ]));
  return pid2;
});

await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await p.waitForFunction(
  () => window.Aplicacoes && window.Aplicacoes.historico('oq3', 'paciente-antigo-1').length > 0,
  { timeout: 8000 }).catch(() => {});

const recuperado = await p.evaluate(() => {
  const h = window.Aplicacoes.historico('oq3', 'paciente-antigo-1');
  const tabelas = window.DadosLocais.exportar().tabelas;
  return {
    quantas: h.length,
    app: h[0] || null,
    linhasAntigas: (tabelas.oq3 || []).length,
    marca: localStorage.getItem('holohacking.oq3.migrado')
  };
});
ok(recuperado.quantas === 1,
   'o OQ³ salvo na tabela antiga voltou como aplicação: ' + recuperado.quantas);
ok(recuperado.app && recuperado.app.respostas.quer === 'Dormir melhor' &&
   recuperado.app.respostas.precisa === 'Parar de acordar de madrugada' &&
   recuperado.app.respostas.consegue === 'Desligar a tela as 22h' &&
   recuperado.app.respostas.alavancas === 'Ritual antes de dormir',
   'com os cinco campos intactos, sem reinterpretar nada');
ok(recuperado.app.concluida_em === '2025-03-02T14:30:00.000Z',
   'E COM A DATA REAL do registro antigo, não a data da migração: ' +
   recuperado.app.concluida_em);
ok(recuperado.app.versao_ferramenta === '0',
   'marcada como versão 0 — anterior ao catálogo versionado');
ok(recuperado.app.status === 'concluida' && recuperado.app.resultado === null,
   'concluída, e sem resultado derivado');
ok(recuperado.linhasAntigas === 1,
   'a tabela `oq3` NÃO foi apagada: ela continua sendo a origem: ' +
   recuperado.linhasAntigas + ' linha');
ok(recuperado.marca === '1',
   'e uma marca impede a migração de rodar duas vezes');

/* rodar de novo não duplica */
await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await new Promise(r => setTimeout(r, 900));
const denovo = await p.evaluate(() =>
  window.Aplicacoes.historico('oq3', 'paciente-antigo-1').length);
ok(denovo === 1, 'e recarregar a página não duplica a migração: ' + denovo);

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
