/**
 * A aba HOLOSCOPE, dentro da ficha do paciente.
 *
 * HOLOSCOPE e mapa de investigacao e prioridade, nao diagnostico — nada
 * aqui recalcula indice, sistema ou Triade: so le d.pontuacao/d.historico,
 * que Panorama.doPaciente() ja monta do que o motor e a tela do HOLOSCOPE
 * ja gravaram.
 *
 * O que este teste cobra:
 *
 *   VAZIO       sem aplicacao nenhuma, o convite certo.
 *   ULTIMA      data, indice, os cinco sistemas e o estado de preenchimento
 *               (d.respondidas/d.totalPerguntas — o mesmo dado que a aba
 *               Formularios ja mostra, nao um recalculo novo).
 *   HISTORICO   em ordem decrescente, sem a ultima repetida.
 *   ABRIR       "Abrir resultado" da ultima reusa a mesma janela de
 *               respostas que a aba Formularios ja usa (data-ver="holoscope").
 *   NAVEGACAO   os atalhos levam para a secao certa, sem zerar a tela, e o
 *               paciente certo continua selecionado ao chegar la (o mesmo
 *               #sel-holoscope que toda a tela HOLOSCOPE ja usa).
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
const ok = (c, t) => console.log((c ? '  ok    ' : '  FALHA ') + t);
let falhou = false;
const conferir = (c, t) => { if (!c) falhou = true; ok(c, t); };

const aba = (x) => p.evaluate(async (n) => {
  document.querySelector('[data-aba="' + n + '"]').click();
  await new Promise(r => setTimeout(r, 250));
}, x);

const abrirFichaDe = (id) => p.evaluate(async (pid) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.querySelector('[data-ficha="' + pid + '"]').click();
  await new Promise(r => setTimeout(r, 300));
}, id);

/* ------------------------------------------------- dois pacientes -------- */

const ids = await p.evaluate(async () => {
  const novo = async (nome) => {
    document.querySelector('.nav-item[data-secao="pacientes"]').click();
    const v = document.getElementById('voltar-lista'); if (v) v.click();
    document.getElementById('btn-abrir-novo').click();
    document.getElementById('np-nome').value = nome;
    document.getElementById('btn-salvar-paciente').click();
    await new Promise(x => setTimeout(x, 300));
    return window.pacienteAtivoId();
  };
  // a primeira: se o atalho cair nela por padrao em vez de na pessoa da
  // ficha aberta, o teste de pre-selecao acusa.
  const primeira = await novo('Ana Paula Azevedo');
  const marina = await novo('Marina Alves');
  return { primeira, marina };
});

/* ---------------------------------------------------- sem HOLOSCOPE ------ */

await abrirFichaDe(ids.marina);
await aba('holoscope');

const vazio = await p.evaluate(() => {
  const v = document.querySelector('#aba-holoscope .lista-vazia');
  return {
    titulo: v?.querySelector('strong')?.textContent,
    texto: v?.querySelector('span')?.textContent,
    botao: document.querySelector('#aba-holoscope .fic-consultas-topo button')?.textContent,
    temUltima: !!document.querySelector('#aba-holoscope .dash-titulo'),
    continuidade: document.querySelector('#aba-holoscope .fic-chip')?.textContent,
  };
});
conferir(vazio.titulo === 'Nenhuma aplicação HOLOSCOPE', 'título do estado vazio: ' + vazio.titulo);
conferir(vazio.texto === 'Faça a primeira aplicação para mapear prioridades de investigação.',
  'texto do estado vazio: ' + vazio.texto);
conferir(vazio.botao === 'Iniciar HOLOSCOPE', 'o CTA é "Iniciar HOLOSCOPE": ' + vazio.botao);
conferir(!vazio.temUltima, 'sem aplicação, nenhum bloco "Última aplicação" aparece');
conferir(/HOLOSCAN/.test(vazio.continuidade), 'a continuidade com o HOLOSCAN aparece mesmo vazio: ' + vazio.continuidade);

const foiPara = await p.evaluate(async () => {
  document.querySelector('#aba-holoscope [data-ir="holoscope"]').click();
  await new Promise(r => setTimeout(r, 300));
  return {
    secaoAtiva: document.querySelector('.secao.ativa')?.id,
    algumaAtiva: document.querySelectorAll('.secao.ativa').length,
    paciente: document.getElementById('sel-holoscope')?.selectedOptions[0]?.textContent,
  };
});
conferir(foiPara.secaoAtiva === 'secao-holoscope' && foiPara.algumaAtiva === 1,
  '"Iniciar HOLOSCOPE" leva para a seção certa, sem zerar a tela: ' + foiPara.secaoAtiva);
conferir(foiPara.paciente === 'Marina Alves',
  'e a pessoa certa já está selecionada lá, não a primeira da lista: ' + foiPara.paciente);

/* ------------------------------------------------- tres aplicacoes ------- */

await p.evaluate(async (respostas) => {
  // Marina ja e a paciente ativa (a ficha dela acabou de estar aberta).
  document.querySelector('.nav-item[data-secao="holoscope"]').click();

  const sentido = {}; HOLOSCOPE.questionario().forEach(q => sentido[q.id] = q.sentido);
  const variar = n => respostas.map(x => ({ marcador_id: x.marcador_id,
    intensidade: sentido[x.marcador_id] === 'invertido'
      ? Math.min(3, Math.max(0, x.intensidade + n))
      : Math.max(0, Math.min(3, x.intensidade - n)) }));

  // Reaplicar no mesmo dia SUBSTITUI a entrada, entao cada data e acertada
  // antes da proxima aplicacao — nao das tres no fim (senao so sobra uma).
  const pid = window.pacienteAtivoId();
  const datar = (i, quando) => {
    const h = JSON.parse(localStorage.getItem('holohacking.pontuacao'));
    h[pid][i].quando = quando;
    localStorage.setItem('holohacking.pontuacao', JSON.stringify(h));
  };

  window.aplicarPontuacao(HOLOSCOPE.calcular(variar(2)));   // mais antiga
  datar(0, '2026-06-01');
  window.aplicarPontuacao(HOLOSCOPE.calcular(variar(1)));   // do meio
  datar(1, '2026-08-01');
  window.aplicarPontuacao(HOLOSCOPE.calcular(respostas));    // mais recente
  datar(2, '2026-09-10');

  // O "estado de preenchimento" (d.respondidas/d.totalPerguntas) vem das
  // respostas guardadas no questionario ao vivo, nao do snapshot — e assim
  // que a aba Formularios ja le. Sem isto aqui, a ultima aplicacao mostraria
  // "não iniciado" mesmo tendo um mapa completo.
  const q = {}; respostas.forEach(r => q[r.marcador_id] = r.intensidade);
  localStorage.setItem('holohacking.questionario', JSON.stringify({ [pid]: q }));
}, caso.respostas);

await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await abrirFichaDe(ids.marina);
await aba('holoscope');

const cheio = await p.evaluate(() => {
  const blocos = [...document.querySelectorAll('#aba-holoscope .dash-bloco-compacto')];
  const de = titulo => blocos.find(b => b.querySelector('.dash-titulo').textContent === titulo);
  const ler = li => ({
    quando: li.querySelector('.dash-quem b').textContent,
    porque: li.querySelector('.dash-porque').textContent,
    botao: li.querySelector('.dash-ir').textContent.replace(/\s*→\s*$/, '').trim(),
  });
  const ultimaBloco = de('Última aplicação');
  const historicoBloco = de('Histórico de aplicações');
  return {
    botaoTopo: document.querySelector('#aba-holoscope .fic-consultas-topo button')?.textContent,
    ultima: ler(ultimaBloco.querySelector('.dash-pendente')),
    ultimaDestacada: !!ultimaBloco.querySelector('.dash-pendente.abrir'),
    sistemas: [...ultimaBloco.querySelectorAll('.fic-sis')].length,
    historico: [...historicoBloco.querySelectorAll('.dash-pendente')].map(ler),
  };
});

conferir(cheio.botaoTopo === 'Nova aplicação',
  'com histórico, o botão do topo vira "Nova aplicação": ' + cheio.botaoTopo);
conferir(/10\/09\/2026/.test(cheio.ultima.quando), 'a mais recente é a "última aplicação": ' + cheio.ultima.quando);
conferir(/Índice \d+ de \d+/.test(cheio.ultima.porque), 'com o índice: ' + cheio.ultima.porque);
conferir(/respondidas/.test(cheio.ultima.porque), 'e o estado de preenchimento, sem recalcular: ' + cheio.ultima.porque);
conferir(cheio.ultimaDestacada, 'a última vem com destaque visual');
conferir(cheio.ultima.botao === 'Abrir resultado',
  'e a ação da última é "Abrir resultado" (a janela de respostas), não a genérica: ' + cheio.ultima.botao);
conferir(cheio.sistemas === 5, 'os cinco sistemas aparecem resumidos: ' + cheio.sistemas);
conferir(cheio.historico.length === 2, 'as duas anteriores viram "histórico", sem repetir a última: ' + cheio.historico.length);
conferir(/01\/08\/2026/.test(cheio.historico[0].quando) && /01\/06\/2026/.test(cheio.historico[1].quando),
  'ordem decrescente: ' + cheio.historico.map(h => h.quando).join(' · '));
conferir(cheio.historico.every(h => h.botao === 'Ver HOLOSCOPE'),
  'histórico usa a ação genérica, não finge abrir aquele registro específico');

/* ------------------------------------------- "Abrir resultado" funciona -- */

const janela = await p.evaluate(async () => {
  document.querySelector('#aba-holoscope .dash-pendente.abrir [data-ver]').click();
  await new Promise(r => setTimeout(r, 300));
  const j = document.getElementById('fic-janela');
  return { aberta: !j.classList.contains('hidden'), titulo: document.getElementById('fic-janela-titulo').textContent };
});
conferir(janela.aberta && /Marina Alves/.test(janela.titulo),
  '"Abrir resultado" abre a mesma janela de respostas da aba Formulários');
await p.evaluate(() => document.getElementById('fic-janela-fechar').click());

/* -------------------------------------------- "Ver HOLOSCOPE" nao zera -- */

const verHolo = await p.evaluate(async () => {
  const blocos = [...document.querySelectorAll('#aba-holoscope .dash-bloco-compacto')];
  const historico = blocos.find(b => b.querySelector('.dash-titulo').textContent === 'Histórico de aplicações');
  historico.querySelector('.dash-ir').click();
  await new Promise(r => setTimeout(r, 300));
  return {
    secaoAtiva: document.querySelector('.secao.ativa')?.id,
    algumaAtiva: document.querySelectorAll('.secao.ativa').length,
  };
});
conferir(verHolo.secaoAtiva === 'secao-holoscope' && verHolo.algumaAtiva === 1,
  '"Ver HOLOSCOPE" do histórico leva para a seção, sem zerar a tela: ' + verHolo.secaoAtiva);

/* ------------------------------------------------- as duas nao se misturam */

await abrirFichaDe(ids.primeira);
await aba('holoscope');
const outraPessoa = await p.evaluate(() => ({
  vazio: !!document.querySelector('#aba-holoscope .lista-vazia'),
  ultima: !!document.querySelector('#aba-holoscope .dash-titulo'),
}));
conferir(outraPessoa.vazio && !outraPessoa.ultima,
  'a ficha de quem nunca aplicou continua vazia — as duas não se misturam');

/* --------------------------------------------------------------- fim ----- */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
if (ruim.length) falhou = true;
await nav.close();
process.exit(falhou ? 1 : 0);
