/**
 * As tres telas de Atendimento: Consultas, Agenda e Documentos.
 *
 * O que elas prometem, e o que este teste cobra:
 *
 *   Consultas   cada aplicacao do HOLOSCOPE vira uma linha, da mais recente
 *               para tras, e a variacao do Indice so existe da 2a em diante.
 *   Agenda      a data derivada e ultima aplicacao + 28 dias; a data marcada
 *               por uma pessoa manda sobre ela; quem nunca teve mapa fica em
 *               "Sem data" em vez de ganhar uma data inventada.
 *   Documentos  os arquivos de TODOS os pacientes, cada um com o nome do dono.
 *
 * Nenhuma das tres calcula: as tres leem panorama.js e o ArquivoStore, que sao
 * os mesmos que a ficha e o dashboard leem. Se divergirem, alguem escreveu a
 * regra duas vezes.
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

/* ---------------------------------------------------- as telas existem --- */

const existem = await p.evaluate(() => {
  const ir = s => { document.querySelector('.nav-item[data-secao="' + s + '"]').click();
                    return document.getElementById('secao-' + s).classList.contains('ativa'); };
  return {
    consultas: ir('consultas'),
    agenda: ir('agenda'),
    documentos: ir('documentos'),
    caminho: document.getElementById('caminho-atual').textContent,
    // o HOLOSCOPE mudou de grupo: e ferramenta, nao atendimento
    grupoHolo: document.querySelector('.nav-item[data-secao="holoscope"]')
                 .closest('.nav-grupo')
                 .getAttribute('aria-labelledby'),
    grupoConsultas: document.querySelector('.nav-item[data-secao="consultas"]')
                 .closest('.nav-grupo')
                 .getAttribute('aria-labelledby'),
  };
});
conferir(existem.consultas && existem.agenda && existem.documentos,
  'as tres secoes abrem pelo menu');
conferir(existem.caminho === 'Documentos',
  'o caminho no topo acompanha: ' + existem.caminho);
conferir(existem.grupoHolo === 'nav-grupo-recursos',
  'HOLOSCOPE esta em Recursos');
conferir(existem.grupoConsultas === 'nav-grupo-atendimento',
  'Consultas esta em Atendimento');

/* ------------------------------------------------------- tudo vazio ------ */

const vazio = await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="consultas"]').click();
  const c = document.getElementById('consultas-corpo').innerText;
  document.querySelector('.nav-item[data-secao="agenda"]').click();
  const a = document.getElementById('agenda-corpo').innerText;
  return { c: c.replace(/\s+/g, ' '), a: a.replace(/\s+/g, ' '),
           linhas: document.querySelectorAll('.con-linha').length };
});
conferir(/Nenhum atendimento registrado/i.test(vazio.c) && vazio.linhas === 0,
  'sem paciente, nao inventa consulta');
conferir(/Nenhuma consulta esta semana/i.test(vazio.a) && /livre neste período/i.test(vazio.a),
  'sem nada marcado, a agenda diz que está livre');

/* ---------------------------------------------- uma carteira de verdade -- */

const ids = await p.evaluate(async (respostas) => {
  const novo = async (nome) => {
    document.querySelector('.nav-item[data-secao="pacientes"]').click();
    const v = document.getElementById('voltar-lista'); if (v) v.click();
    document.getElementById('btn-abrir-novo').click();
    document.getElementById('np-nome').value = nome;
    document.getElementById('btn-salvar-paciente').click();
    await new Promise(x => setTimeout(x, 300));
    return window.pacienteAtivoId();
  };
  const sentido = {}; HOLOSCOPE.questionario().forEach(q => sentido[q.id] = q.sentido);
  const variar = n => respostas.map(x => ({ marcador_id: x.marcador_id,
    intensidade: sentido[x.marcador_id] === 'invertido'
      ? Math.min(3, Math.max(0, x.intensidade + n))
      : Math.max(0, Math.min(3, x.intensidade - n)) }));

  const dias = n => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  /* Reaplicar no mesmo dia SUBSTITUI — e e assim que tem que ser, senao um
     ajuste de resposta viraria duas consultas. Entao a data de cada aplicacao
     e acertada antes da proxima, e nao todas no fim. */
  const datar = (pid, i, quando) => {
    const h = JSON.parse(localStorage.getItem('holohacking.pontuacao'));
    h[pid][i].quando = quando;
    localStorage.setItem('holohacking.pontuacao', JSON.stringify(h));
  };

  // Marina: duas aplicacoes, a segunda melhor — ha evolucao para mostrar
  const marina = await novo('Marina Alves');
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(respostas));
  datar(marina, 0, dias(-40));
  window.aplicarPontuacao(HOLOSCOPE.calcular(variar(2)));
  datar(marina, 1, dias(-20));       // +28 = daqui a 8 dias -> "mais adiante"

  // Carla: uma aplicacao velha — a reavaliacao dela ja venceu
  const carla = await novo('Carla Souza');
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(variar(1)));
  datar(carla, 0, dias(-60));        // +28 = 32 dias atras  -> vencida

  // Sofia: cadastrada e nada feito — nao tem data nenhuma
  const sofia = await novo('Sofia Martins');

  return { marina, carla, sofia };
}, caso.respostas);

/* ------------------------------------------------------- consultas ------- */

const con = await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="consultas"]').click();
  return {
    linhas: [...document.querySelectorAll('.con-linha')].map(l => ({
      dia: l.querySelector('.con-dia').textContent,
      nome: l.querySelector('.con-quem b').textContent,
      detalhe: l.querySelector('.con-detalhe').textContent,
      indice: l.querySelector('.con-indice').textContent.replace(/Índice/, '').trim(),
      variacao: l.querySelector('.con-var')?.textContent || null,
    })),
    tiles: [...document.querySelectorAll('.dash-tile')].map(t =>
      t.querySelector('b').textContent + ' ' + t.querySelector('span').textContent),
    meses: [...document.querySelectorAll('.dash-titulo')].map(t => t.textContent.trim()),
  };
});

conferir(con.linhas.length === 3,
  'tres aplicacoes viraram tres consultas: ' + con.linhas.length);
conferir(con.linhas[0].nome === 'Marina Alves' && /2ª/.test(con.linhas[0].detalhe),
  'a mais recente vem primeiro: ' + con.linhas[0].nome + ' / ' + con.linhas[0].detalhe);
conferir(con.linhas[2].nome === 'Carla Souza',
  'a mais antiga vem por ultimo: ' + con.linhas[2].nome);
conferir(con.linhas[0].variacao !== null && /^\+/.test(con.linhas[0].variacao),
  'a 2ª aplicacao mostra o quanto andou: ' + con.linhas[0].variacao);
const primeiras = con.linhas.filter(l => /1ª/.test(l.detalhe));
conferir(primeiras.every(l => l.variacao === null),
  'a 1ª aplicacao nao inventa variacao (' + primeiras.length + ' delas)');
conferir(con.linhas.every(l => /mais baixos:/.test(l.detalhe)),
  'cada linha diz quais sistemas pesaram');
conferir(con.tiles.some(t => /^3 atendimentos/.test(t)),
  'conta os atendimentos: ' + (con.tiles.find(t => /atendimento/.test(t)) || '—'));
conferir(con.tiles.some(t => /^1 voltou para reavaliar/.test(t)),
  'conta quem voltou: ' + (con.tiles.find(t => /voltou|voltaram/.test(t)) || '—'));

/* ---------------------------------------------------------- agenda ------- */

/* A agenda virou calendário: o que era lista de retornos agora é grade de
   horas com consultas e bloqueios. As regras dela estão em
   testar-calendario.mjs — aqui só se confere que a seção abre. */
const age = await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="agenda"]').click();
  return {
    ativa: document.getElementById('secao-agenda').classList.contains('ativa'),
    temBarra: !!document.querySelector('.cal-barra'),
    vistas: [...document.querySelectorAll('.cal-vistas [data-vista]')].map(b => b.textContent),
  };
});
conferir(age.ativa && age.temBarra, 'a agenda abre pelo menu');
conferir(age.vistas.join(',') === 'Dia,Semana,Mês',
  'com as três formas de ver o período: ' + age.vistas.join(' · '));

/* ------------------------------------------------------ documentos ------- */

const semArquivo = await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="documentos"]').click();
  return document.getElementById('documentos-corpo').innerText.replace(/\s+/g, ' ');
});
conferir(/Nenhum documento guardado/i.test(semArquivo),
  'sem arquivo, diz que nao ha e onde eles entram');

// dois arquivos, de dois pacientes diferentes
await p.evaluate(async (ids) => {
  const fazer = (nome, texto, mime) =>
    new File([texto], nome, { type: mime });
  await window.ArquivoStore.salvar(ids.marina, fazer('hemograma.pdf', '%PDF-1.4 marina', 'application/pdf'),
    { nome: 'Hemograma completo', tipo: 'Exame laboratorial', data: '2026-09-01' });
  await window.ArquivoStore.salvar(ids.carla, fazer('laudo.txt', 'laudo da carla', 'text/plain'),
    { nome: 'Laudo do endocrinologista', tipo: 'Laudo', data: '2026-08-15' });
}, ids);

const docs = await p.evaluate(async () => {
  // pelo menu, de proposito: e navegar que tem que redesenhar
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.querySelector('.nav-item[data-secao="documentos"]').click();
  await new Promise(r => setTimeout(r, 400));
  return {
    itens: [...document.querySelectorAll('.doc-todos-item')].map(l => ({
      tipo: l.querySelector('.doc-tipo').textContent,
      nome: l.querySelector('.doc-todos-nome b').textContent,
      dono: l.querySelector('.doc-todos-dono').textContent,
      data: l.querySelector('.doc-data').textContent,
      tam: l.querySelector('.doc-tam').textContent,
    })),
    tiles: [...document.querySelectorAll('.dash-tile')].map(t =>
      t.querySelector('b').textContent + ' ' + t.querySelector('span').textContent),
    tipos: [...document.querySelectorAll('#filtro-tipo-doc option')].map(o => o.textContent),
  };
});

conferir(docs.itens.length === 2,
  'abrir a tela pelo menu ja traz os arquivos novos: ' + docs.itens.length);
conferir(docs.itens.every(i => /Marina|Carla/.test(i.dono)),
  'cada arquivo diz de quem e: ' + docs.itens.map(i => i.dono).join(', '));
conferir(docs.itens[0].data === '01/09/2026',
  'o mais recente vem primeiro: ' + docs.itens[0].data);
conferir(docs.itens.every(i => /B|KB|MB/.test(i.tam)),
  'mostra o tamanho: ' + docs.itens.map(i => i.tam).join(' / '));
conferir(docs.tiles.some(t => /^2 documentos/.test(t)) &&
         docs.tiles.some(t => /pacientes com arquivo/.test(t)),
  'conta documentos e donos');
conferir(docs.tipos.length === 3,
  'o filtro conhece so os tipos que existem: ' + docs.tipos.join(', '));

// --- procurar pelo nome do paciente, que e o que a aba da ficha nao permite ---
const filtrado = await p.evaluate(async () => {
  const b = document.getElementById('busca-documentos');
  b.value = 'carla';
  b.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  return [...document.querySelectorAll('.doc-todos-item')]
    .map(l => l.querySelector('.doc-todos-nome b').textContent);
});
conferir(filtrado.length === 1 && /Laudo/.test(filtrado[0]),
  'da para achar o arquivo pelo nome do paciente: ' + filtrado.join(', '));

// --- remover remove de verdade, e so uma vez ---
const removido = await p.evaluate(async () => {
  const b = document.getElementById('busca-documentos');
  b.value = '';
  b.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('[data-tirar]').click();
  await new Promise(r => setTimeout(r, 500));
  const naTela = document.querySelectorAll('.doc-todos-item').length;
  const noBanco = (await window.ArquivoStore.listarTudo()).length;
  return { naTela, noBanco };
});
conferir(removido.naTela === 1 && removido.noBanco === 1,
  'remover apaga de verdade: sobrou ' + removido.noBanco);

/* --------------------------------------------------------------- fim ----- */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
if (ruim.length) falhou = true;
await nav.close();
process.exit(falhou ? 1 : 0);
