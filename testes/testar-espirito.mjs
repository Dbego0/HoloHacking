/**
 * MÓDULO ESPÍRITO — arquitetura, persistência e governança.
 *
 * Este teste NÃO cobra conteúdo clínico nem simbólico: nada disso foi
 * decidido, e travar o indecidido seria certificar invenção. O que ele cobra:
 *
 *   PERSISTÊNCIA   as nove ferramentas genéricas seguem o modelo de aplicações
 *                  — salvar atualiza, Nova aplicação preserva, o histórico
 *                  volta, e o de uma paciente não aparece na outra;
 *   SEM CÁLCULO    nenhuma delas produz síntese, nota, classificação ou
 *                  recomendação — `resultado` é null em todas;
 *   MAPA           é tela derivada de OQ³ + PQQ: não persiste, não cria
 *                  aplicação própria, não toca HOLOSCOPE nem conduta, e o card
 *                  da ficha diz a verdade sobre o estado real;
 *   LEGADO FORA    os textos de "impacto espiritual" continuam nos bancos e
 *                  saíram da leitura clínica ativa;
 *   TRÍADE         identifica a dimensão mais baixa e para aí — não diz mais
 *                  que é por onde a conduta começa.
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
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

const AS_NOVE = ['roda_vida', 'ritual_mesa', 'carta_futuro', 'inventario_gratidao',
                 'conexao_pertencimento', 'circulo_sentido', 'praticas_contemplativas',
                 'legado', 'alinhamento'];

/* A revisao clinica de Corpo/Mente/Espirito (rodada anterior a esta) reduziu
   a galeria de Espirito a 3 ferramentas: Mapa do Proposito, roda_vida e
   carta_futuro. As outras 7 de AS_NOVE continuam com dado e logica intactos
   em ferramentas.js — so sem card na galeria. O catalogo (abaixo) continua
   com as 9, porque o dado nao foi apagado; so o que se pode ABRIR pela tela
   e o que esta em DISPONIVEIS. */
const DISPONIVEIS = ['roda_vida', 'carta_futuro'];

const novaPaciente = (nome) => p.evaluate(async (n) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = n;
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 420));
  return window.pacienteAtivoId();
}, nome);

const abrirFerr = (id) => p.evaluate(async (x) => {
  document.querySelector('.nav-item[data-secao="espirito"]').click();
  document.querySelector('[data-ferramenta="' + x + '"]').click();
  await new Promise(r => setTimeout(r, 420));
}, id);

const voltar = () => p.evaluate(async () => {
  const b = document.querySelector('#vista-gen-espirito .btn-voltar');
  if (b) b.click();
  await new Promise(r => setTimeout(r, 260));
});

/* ==================================================================== */
console.log('\n  O CATÁLOGO DO ESPÍRITO\n');
/* ==================================================================== */

const cat = await p.evaluate(() => {
  const c = window.CATALOGO_FERRAMENTAS.filter(f => f.modulo === 'espirito');
  return {
    quantas: c.length,
    ids: c.map(f => f.id),
    comResultado: c.filter(f => f.resultado).length,
    comPrazo: c.filter(f => f.reaplicar_dias != null).length,
    ritual: (c.find(f => f.id === 'ritual_mesa') || {}).titulo,
    semPadrao: c.every(f => (f.campos || []).every(x => x.padrao === undefined))
  };
});
ok(cat.quantas === 9, 'as nove do catálogo (a 01 é o Mapa, que tem tela própria): ' + cat.quantas);
ok(AS_NOVE.every(id => cat.ids.indexOf(id) >= 0),
   'todas as nove pelos ids esperados: ' + cat.ids.join(' · '));
ok(cat.comResultado === 0,
   'NENHUMA declara resultado — não há síntese, nota nem classificação no módulo');
ok(cat.comPrazo === 0, 'e nenhuma pede reaplicação sozinha');
ok(cat.semPadrao, 'nenhum campo nasce com valor de fábrica');
ok(cat.ritual === 'Ritual de Presença à Mesa',
   'a crase de "à Mesa" está correta: ' + cat.ritual);

/* ==================================================================== */
console.log('\n  AS NOVE: abrir, salvar, atualizar, nova aplicação\n');
/* ==================================================================== */

const marina = await novaPaciente('Marina Alves');

/* Abre e conclui roda_vida (a unica das DISPONIVEIS que este lote usa —
   carta_futuro fica reservada para o teste de ciclo/isolamento logo abaixo,
   para nao poluir o "fresh start" que aquele teste pressupoe). Antes da
   revisao de Corpo/Mente/Espirito este lote rodava as nove; hoje so roda_vida
   e carta_futuro tem card na galeria, e o modelo de persistencia (abrir,
   salvar, Nova aplicacao, isolamento por paciente) e o mesmo para qualquer
   ferramenta generica — nao precisa das nove para provar isso. */
const todas = await p.evaluate(async (ids) => {
  const saida = [];
  for (const id of ids) {
    document.querySelector('.nav-item[data-secao="espirito"]').click();
    document.querySelector('[data-ferramenta="' + id + '"]').click();
    await new Promise(r => setTimeout(r, 420));
    const vista = document.getElementById('vista-gen-espirito');
    const campos = [...vista.querySelectorAll('.form-ferramenta .campos .grupo')];
    /* escreve no primeiro campo de texto que existir; se a ferramenta só tem
       réguas e opções, move a primeira régua. Não interpreta nada. */
    const texto = vista.querySelector('.form-ferramenta .campos input[type="text"], ' +
                                      '.form-ferramenta .campos textarea');
    if (texto) {
      texto.value = 'marca-' + id;
      texto.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const regua = vista.querySelector('.form-ferramenta .campos input[type="range"]');
      if (regua) {
        regua.value = 7;
        regua.dispatchEvent(new Event('input', { bubbles: true }));
        regua.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    vista.querySelector('[data-acao="concluir"]').click();
    await new Promise(r => setTimeout(r, 430));
    const a = window.Aplicacoes.ultima(id);
    saida.push({
      id, campos: campos.length,
      paciente: a.paciente_id, ferramenta: a.ferramenta_id,
      status: a.status, versao: a.versao_ferramenta, consulta: a.consulta_id,
      iniciada: !!a.iniciada_em, concluida: !!a.concluida_em, atualizada: !!a.atualizada_em,
      resultado: a.resultado,
      sintese: (vista.querySelector('.ferr-sintese') || {}).innerHTML || ''
    });
    document.querySelector('#vista-gen-espirito .btn-voltar').click();
    await new Promise(r => setTimeout(r, 250));
  }
  return saida;
}, ['roda_vida']);

ok(todas.length === 1 && todas.every(t => t.ferramenta === t.id),
   'roda_vida abre e conclui uma aplicação');
ok(todas.every(t => t.paciente === marina),
   'ligada à paciente ativa');
ok(todas.every(t => t.status === 'concluida'),
   'concluir fecha a aplicação');
ok(todas.every(t => t.versao != null),
   'com versao_ferramenta declarada: ' +
   [...new Set(todas.map(t => t.versao))].join(','));
ok(todas.every(t => t.consulta === null || typeof t.consulta === 'string'),
   'consultation_id preenchido ou null — nunca inventado');
ok(todas.every(t => t.iniciada && t.concluida && t.atualizada),
   'os três carimbos de tempo presentes');
ok(todas.every(t => t.resultado === null),
   'RESULTADO NULL: nenhuma ferramenta genérica deriva síntese, score ou classificação');
ok(todas.every(t => t.sintese.trim() === ''),
   'e a caixa de síntese fica vazia — nenhum quadro com ar de resultado');
ok(todas.find(t => t.id === 'roda_vida').campos === 9,
   'os campos são os do catálogo, sem acréscimo: ' + todas.find(t => t.id === 'roda_vida').campos);

/* ---- atualizar não duplica, Nova aplicação preserva ------------------- */

/* circulo_sentido foi retirada da galeria de Espirito nessa revisao;
   carta_futuro (mantida) serve igualmente para provar atualizar-nao-duplica
   e Nova-aplicacao-preserva — o modelo de persistencia e o mesmo para
   qualquer ferramenta generica. */
const ciclo = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="espirito"]').click();
  document.querySelector('[data-ferramenta="carta_futuro"]').click();
  await new Promise(r => setTimeout(r, 420));
  const vista = document.getElementById('vista-gen-espirito');
  const campo = vista.querySelector('#campo-carta');
  campo.value = 'primeira leitura, corrigida';
  campo.dispatchEvent(new Event('change', { bubbles: true }));
  vista.querySelector('[data-acao="concluir"]').click();
  await new Promise(r => setTimeout(r, 430));
  const depoisDeEditar = window.Aplicacoes.historico('carta_futuro').length;

  vista.querySelector('[data-acao="nova"]').click();
  await new Promise(r => setTimeout(r, 430));
  const vazio = document.getElementById('campo-carta').value;
  const campo2 = document.getElementById('campo-carta');
  campo2.value = 'segunda leitura';
  campo2.dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('#vista-gen-espirito [data-acao="concluir"]').click();
  await new Promise(r => setTimeout(r, 430));

  const h = window.Aplicacoes.historico('carta_futuro');
  return {
    depoisDeEditar,
    vazioNaNova: vazio,
    quantas: h.length,
    conteudos: h.map(a => a.respostas.carta),
    estados: h.map(a => a.status)
  };
});
ok(ciclo.depoisDeEditar === 1,
   'salvar de novo ATUALIZA a aplicação aberta — não cria outra: ' + ciclo.depoisDeEditar);
ok(ciclo.vazioNaNova === '', '"Nova aplicação" abre em branco');
ok(ciclo.quantas === 2, 'e passa a haver duas: ' + ciclo.quantas);
ok(ciclo.conteudos.indexOf('primeira leitura, corrigida') >= 0 &&
   ciclo.conteudos.indexOf('segunda leitura') >= 0,
   'a primeira continua inteira ao lado da segunda');
ok(ciclo.estados.every(s => s === 'concluida'), 'as duas concluídas');

/* ---- troca de paciente ------------------------------------------------ */

const carla = await novaPaciente('Carla Ribeiro');
const isolamento = await p.evaluate(async (ctx) => {
  document.querySelector('.nav-item[data-secao="espirito"]').click();
  document.querySelector('[data-ferramenta="carta_futuro"]').click();
  await new Promise(r => setTimeout(r, 450));
  const campo = document.getElementById('campo-carta');
  const todas = (window.DadosLocais.exportar().tabelas.aplicacoes || [])
    .filter(a => ctx.ids.indexOf(a.ferramenta_id) >= 0);
  return {
    campo: campo.value,
    daCarla: window.Aplicacoes.historico('carta_futuro').length,
    respostasDaCarla: window.Aplicacoes.historico('carta_futuro')
      .map(a => JSON.stringify(a.respostas || {})),
    daMarina: todas.filter(a => a.paciente_id === ctx.marina).length,
    vazamento: todas.filter(a => a.paciente_id === ctx.carla &&
      JSON.stringify(a.respostas || {}).indexOf('marca-') >= 0).length
  };
}, { ids: AS_NOVE, marina, carla });

ok(isolamento.campo === '',
   'trocar de paciente abre a ferramenta em branco, não com o texto da anterior');
ok(isolamento.respostasDaCarla.every(r => r === '{}' || r === 'null'),
   'o rascunho da nova paciente nasce sem resposta herdada');
ok(isolamento.vazamento === 0,
   'NENHUMA resposta da Marina aparece sob a Carla');
// 1 de roda_vida (lote) + 2 de carta_futuro (ciclo: atualizar + nova aplicação)
ok(isolamento.daMarina === 3,
   'e as aplicações da Marina continuam dela: ' + isolamento.daMarina);

/* ==================================================================== */
console.log('\n  MAPA DO PROPÓSITO — tela derivada, sem persistência\n');
/* ==================================================================== */

const zerado = await p.evaluate(async () => {
  localStorage.clear();
  return true;
});
await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());

const pid = await novaPaciente('Joana Mapa');

const verMapa = () => p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="espirito"]').click();
  document.querySelector('[data-vista="vista-mapa"]').click();
  await new Promise(r => setTimeout(r, 430));
  const t = (id) => {
    const el = document.getElementById(id);
    return { txt: el.textContent, vazio: el.classList.contains('vazio') };
  };
  return {
    quer: t('mapa-quer'), precisa: t('mapa-precisa'), consegue: t('mapa-consegue'),
    alavancas: t('mapa-alavancas'), objetivo: t('mapa-objetivo'),
    proposito: t('mapa-proposito')
  };
});

/* A ficha abre pelo card do paciente; o quadro das ferramentas é a aba
   "Formulários". Pega-se o bloco do Mapa pelo título, para não depender da
   ordem dos cards. */
const verCard = () => p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  await new Promise(r => setTimeout(r, 350));
  document.querySelector('.card-paciente').click();
  await new Promise(r => setTimeout(r, 450));
  document.querySelector('[data-aba="formularios"]').click();
  await new Promise(r => setTimeout(r, 400));
  const cartoes = [...document.querySelectorAll('#aba-formularios .fic-form')];
  const mapa = cartoes.find(c => /Mapa do Propósito/.test(c.textContent));
  if (!mapa) return { achou: false, estado: '', extra: '', classes: '', quantos: cartoes.length };
  return {
    achou: true,
    estado: (mapa.querySelector('.fic-form-estado') || {}).textContent || '',
    extra: (mapa.querySelector('.fic-form-extra') || {}).textContent || '',
    classes: mapa.className,
    botao: (mapa.querySelector('[data-ir]') || {}).textContent || '',
    quantos: cartoes.length
  };
});

/* --- sem nada ---------------------------------------------------------- */
const m0 = await verMapa();
ok(m0.quer.vazio && m0.objetivo.vazio && m0.proposito.vazio,
   'sem OQ³ nem PQQ, todos os blocos do Mapa ficam no estado vazio');
ok(m0.proposito.txt.indexOf('“') === -1,
   'e nada aparece entre aspas como se fosse propósito');

const card0 = await verCard();
ok(card0.achou, 'o card do Mapa existe na aba Formulários: ' + card0.quantos + ' cartões');
ok(card0.estado === 'não aplicado',
   'e diz "não aplicado" — não mais um estado que nada produz: "' + card0.estado + '"');
ok(!/pronto|comecado/.test(card0.classes),
   'sem marca de pronto nem de começado');

/* --- só o OQ³ ---------------------------------------------------------- */
await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="corpo"]').click();
  document.querySelector('[data-vista="vista-oq3"]').click();
  await new Promise(r => setTimeout(r, 450));
  const set = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  set('oq3-quer', 'Voltar a caminhar sem dor');
  set('oq3-precisa', 'Resolver o joelho');
  set('oq3-consegue', 'Vinte minutos por dia');
  set('oq3-alavancas', 'Caminhar com a vizinha');
  document.getElementById('btn-salvar-oq3').click();
  await new Promise(r => setTimeout(r, 470));
});
const m1 = await verMapa();
ok(/Voltar a caminhar sem dor/.test(m1.quer.txt) && !m1.quer.vazio,
   'com o OQ³, os três blocos dele preenchem: ' + m1.quer.txt.slice(0, 40));
ok(/Caminhar com a vizinha/.test(m1.alavancas.txt), 'e as alavancas também');
ok(m1.objetivo.vazio && m1.proposito.vazio,
   'mas objetivo e propósito continuam vazios — eles vêm do PQQ');

const card1 = await verCard();
ok(card1.estado === 'falta o PQQ',
   'e o card da ficha diz exatamente o que falta: "' + card1.estado + '"');
ok(/comecado/.test(card1.classes) && !/pronto/.test(card1.classes),
   'marcado como começado, não como pronto');
ok(/O Mapa se monta com o OQ³ e o PQQ juntos/.test(card1.extra),
   'e explica o critério em vez de deixar a pessoa adivinhar');

/* --- OQ³ + PQQ ---------------------------------------------------------- */
await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="mente"]').click();
  document.querySelector('[data-vista="vista-pqq"]').click();
  await new Promise(r => setTimeout(r, 450));
  const set = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  set('pqq-objetivo', 'Caminhar 20 minutos');
  set('pqq-1', 'Para sair de casa');
  set('pqq-verdadeiro', 'Voltar a confiar no meu corpo');
  document.getElementById('btn-salvar-pqq').click();
  await new Promise(r => setTimeout(r, 470));
});
const m2 = await verMapa();
ok(/Caminhar 20 minutos/.test(m2.objetivo.txt) && !m2.objetivo.vazio,
   'com o PQQ, o objetivo declarado aparece');
ok(/Voltar a confiar no meu corpo/.test(m2.proposito.txt) && !m2.proposito.vazio,
   'e o "pra que" verdadeiro também');
ok(m2.proposito.txt.indexOf('Para sair de casa') === -1,
   'r1 NÃO é promovido a propósito — o fallback continua ausente');
ok(/Voltar a caminhar sem dor/.test(m2.quer.txt),
   'e as metades do OQ³ continuam lá, juntas com as do PQQ');

const card2 = await verCard();
ok(card2.estado === 'pronto para montar',
   'o card passa a "pronto para montar" — as duas metades existem');
ok(/pronto/.test(card2.classes),
   'e agora sim marcado como pronto');
ok(/As duas metades estão preenchidas/.test(card2.extra),
   'e diz por quê, sem inventar histórico do Mapa');

/* --- o Mapa não persiste nada ------------------------------------------ */
const semPersistencia = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="espirito"]').click();
  document.querySelector('[data-vista="vista-mapa"]').click();
  await new Promise(r => setTimeout(r, 400));
  document.getElementById('btn-atualizar-mapa').click();
  await new Promise(r => setTimeout(r, 400));
  const t = window.DadosLocais.exportar().tabelas;
  return {
    aplicacoesMapa: (t.aplicacoes || []).filter(a => a.ferramenta_id === 'mapa').length,
    tabelaMapa: t.mapa === undefined,
    proposito: document.getElementById('mapa-proposito').textContent,
    holoscope: (t.holoscope || []).length,
    pontuacao: localStorage.getItem('holohacking.pontuacao')
  };
});
ok(semPersistencia.aplicacoesMapa === 0,
   'NENHUMA aplicação com ferramenta_id "mapa" é criada — o Mapa não persiste');
ok(semPersistencia.tabelaMapa, 'e não existe tabela própria dele');
ok(/Voltar a confiar no meu corpo/.test(semPersistencia.proposito),
   'atualizar o mapa redesenha a partir das aplicações, sem guardar nada');
ok(semPersistencia.holoscope === 0 &&
   (semPersistencia.pontuacao === null || semPersistencia.pontuacao === '{}'),
   'e o Mapa não cria nem altera mapa do HOLOSCOPE');

/* --- troca de paciente no Mapa ----------------------------------------- */
await novaPaciente('Outra Paciente');
const m3 = await verMapa();
ok(m3.quer.vazio && m3.proposito.vazio,
   'trocar de paciente esvazia o Mapa — nada da anterior fica na tela');

/* ==================================================================== */
console.log('\n  GOVERNANÇA: legado simbólico fora da leitura ativa\n');
/* ==================================================================== */

const TEXTOS_LEGADOS = [
  'bloqueio no plexo solar',
  'queda de frequência geral',
  'dessintonização do corpo como templo',
  'bloqueio do fluxo',
  'perda de vitalidade e clareza'
];

const leitura = await p.evaluate(async (respostas) => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  document.getElementById('btn-abrir-questionario').click();
  await new Promise(r => setTimeout(r, 400));
  const m = {}; respostas.forEach(x => m[x.marcador_id] = x.intensidade);
  document.querySelectorAll('.q-item').forEach(i => {
    const v = m[i.dataset.marcador];
    if (v !== undefined) i.querySelectorAll('.q-btn')[v].click();
  });
  document.querySelector('[data-acao="calcular"]').click();
  await new Promise(r => setTimeout(r, 500));
  const caixa = document.getElementById('holo-leitura');
  const triada = document.getElementById('holo-triada');
  return {
    leituraTxt: caixa ? caixa.innerText.replace(/\s+/g, ' ') : '',
    temRotulo: caixa ? /impacto espiritual/i.test(caixa.innerHTML) : false,
    triadaTxt: triada ? triada.innerText.replace(/\s+/g, ' ') : '',
    triadaVisivel: triada ? !triada.classList.contains('hidden') : false,
    /* o dado continua chegando à camada de apresentação, só não é exibido */
    noBanco: (window.HOLOSCOPE.sistemas() || [])
      .filter(s => s.impacto_espiritual).length
  };
}, caso.respostas);

ok(!leitura.temRotulo,
   'o rótulo "impacto espiritual" não aparece mais na leitura do terreno');
ok(TEXTOS_LEGADOS.every(t => leitura.leituraTxt.toLowerCase().indexOf(t.toLowerCase()) === -1),
   'e nenhum dos cinco textos legados aparece: ' +
   TEXTOS_LEGADOS.filter(t => leitura.leituraTxt.toLowerCase()
     .indexOf(t.toLowerCase()) >= 0).join(', ') || 'nenhum');
ok(!/plexo solar|frequência|templo/i.test(leitura.leituraTxt),
   'nem os termos soltos: plexo solar, frequência, templo');
ok(leitura.noBanco === 5,
   'MAS os cinco continuam nos bancos, intactos, com fonte e status: ' +
   leitura.noBanco + ' sistemas com impacto_espiritual');

/* --- a Tríade descreve, não prescreve ---------------------------------- */
ok(leitura.triadaVisivel, 'a Tríade HOLOS continua aparecendo');
ok(/Físico/.test(leitura.triadaTxt) && /Mental/.test(leitura.triadaTxt) &&
   /Espiritual/.test(leitura.triadaTxt),
   'com os três eixos');
ok(/Dimensão mais baixa/.test(leitura.triadaTxt),
   'e continua identificando a dimensão mais baixa — isso é descrição');
ok(!/é por onde a conduta começa/i.test(leitura.triadaTxt),
   'MAS não diz mais "é por onde a conduta começa": aquela prescrição não ' +
   'tinha procedência');
ok(!/conduta/i.test(leitura.triadaTxt),
   'a palavra conduta não aparece mais no bloco da Tríade');

/* --- a fórmula não mudou ------------------------------------------------ */
const formula = await p.evaluate((respostas) => {
  const r = window.HOLOSCOPE.calcular(respostas);
  return { triada: r.triada, indice: r.indice };
}, caso.respostas);
ok(formula.triada && typeof formula.triada.espiritual === 'number',
   'o motor continua devolvendo a Tríade calculada: espiritual ' +
   formula.triada.espiritual);
ok(typeof formula.indice === 'number' && formula.indice > 0,
   'e o Índice HOLOS continua sendo calculado: ' + formula.indice);

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
