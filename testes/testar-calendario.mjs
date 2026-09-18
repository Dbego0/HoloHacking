/**
 * A agenda como calendário.
 *
 * Antes esta tela era uma lista de retornos calculados: última aplicação + 28
 * dias, com um campo de data para marcar outro dia. Respondia "quem sumiu" e
 * não respondia "quando eu atendo essa pessoa" — porque uma data solta não tem
 * hora, não tem duração e não sabe que a terça está bloqueada.
 *
 * O que este teste cobra:
 *
 *   camadas    consulta, bloqueio e sugestão são três coisas diferentes e a
 *              tela não as confunde — a sugestão some assim que vira consulta
 *   grade      a consulta cai na hora certa, na coluna certa, com a altura
 *              proporcional à duração
 *   períodos   Dia, Semana e Mês mostram o mesmo dado em três recortes
 *   marcar     criar, editar e desmarcar gravam de verdade e sobrevivem
 *   choque     duas consultas no mesmo horário avisam, e não impedem
 *   migração   o retorno marcado na versão anterior vira consulta e não some
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { congelarRelogio } from './relogio-fixo.mjs';

const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1500, height: 1300 });
/* A flakiness historica daqui: "Marina, aplicacao ha 26 dias" espera que o
   retorno de 4 semanas (hoje+2) caia dentro da semana exibida (domingo a
   sabado). So e assim quando "hoje" e domingo-quinta — numa sexta ou sabado,
   hoje+2 cai na semana seguinte e a sugestao nunca aparece no grid. Congelar
   o relogio numa quarta-feira fixa elimina essa dependencia do horario real
   sem mudar nenhum calculo de agenda.js/panorama.js. */
await congelarRelogio(p, '2026-09-16T12:00:00');
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
const ok = (c, t) => console.log((c ? '  ok    ' : '  FALHA ') + t);
let falhou = false;
const conferir = (c, t) => { if (!c) falhou = true; ok(c, t); };

const abrir = () => p.evaluate(() =>
  document.querySelector('.nav-item[data-secao="agenda"]').click());

/* ------------------------------------------------------- vazio ----------- */

await abrir();
const vazio = await p.evaluate(() => ({
  texto: document.querySelector('.cal-vazio')?.innerText.replace(/\s+/g, ' ') || '',
  temGrade: !!document.querySelector('.cal-grade'),
  rotulo: document.querySelector('.cal-rotulo').textContent,
}));
conferir(/Nenhuma consulta esta semana/.test(vazio.texto) && !vazio.temGrade,
  'semana vazia mostra o convite, não uma grade em branco: ' + vazio.texto.slice(0, 46));
conferir(/–/.test(vazio.rotulo), 'e o período diz de quando até quando: ' + vazio.rotulo);

/* ----------------------------------------------- montar uma semana ------- */

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
  const datar = (pid, i, q) => {
    const h = JSON.parse(localStorage.getItem('holohacking.pontuacao'));
    h[pid][i].quando = q;
    localStorage.setItem('holohacking.pontuacao', JSON.stringify(h));
  };
  const dias = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  // Marina: aplicação há 26 dias — o retorno de 4 semanas cai daqui a 2
  const marina = await novo('Marina Alves');
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(respostas));
  datar(marina, 0, dias(-26));

  const carla = await novo('Carla Souza');
  const bea = await novo('Beatriz Lima');

  // o domingo desta semana, para posicionar tudo em dias conhecidos
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const dom = new Date(d); dom.setDate(d.getDate() - d.getDay());
  const noDia = i => { const x = new Date(dom); x.setDate(dom.getDate() + i); return x.toISOString().slice(0, 10); };

  await window.DadosLocais.from('consultas').insert({
    paciente_id: carla, data: noDia(1), hora: '09:00', duracao: 60,
    tipo: 'Primeira consulta', nota: '' });
  await window.DadosLocais.from('consultas').insert({
    paciente_id: bea, data: noDia(3), hora: '14:30', duracao: 90,
    tipo: 'Retorno', nota: '' });
  await window.DadosLocais.from('bloqueios').insert({
    data: noDia(1), inicio: '12:00', fim: '13:30', dia_todo: false, motivo: 'Almoço' });
  await window.DadosLocais.from('bloqueios').insert({
    data: noDia(2), dia_todo: true, inicio: '', fim: '', motivo: 'Supervisão' });

  return { marina, carla, bea, seg: noDia(1), ter: noDia(2), qua: noDia(3),
           daquiA2: dias(2) };
}, caso.respostas);

await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await abrir();
await p.evaluate(() => new Promise(r => setTimeout(r, 400)));

/* ------------------------------------------------------ a grade ---------- */

const semana = await p.evaluate((ids) => {
  const col = d => document.querySelector('.cal-coluna[data-dia="' + d + '"]');
  const ler = e => ({
    txt: e.innerText.replace(/\n/g, ' | '),
    top: Math.round(parseFloat(e.style.top)),
    alt: Math.round(parseFloat(e.style.height)),
    classe: e.className,
  });
  return {
    colunas: document.querySelectorAll('.cal-coluna').length,
    segunda: [...col(ids.seg).querySelectorAll('.cal-evento')].map(ler),
    quarta: [...col(ids.qua).querySelectorAll('.cal-evento')].map(ler),
    faixa: [...document.querySelectorAll('.cal-faixa-item')]
      .map(e => e.className + ':' + e.textContent.trim()),
    cabecaHoje: !!document.querySelector('.cal-cabeca-dia.hoje'),
  };
}, ids);

conferir(semana.colunas === 7, 'a semana tem sete colunas: ' + semana.colunas);
conferir(semana.cabecaHoje, 'e hoje está marcado no cabeçalho');

const carla = semana.segunda.find(e => /Carla/.test(e.txt));
const almoco = semana.segunda.find(e => /Almoço/.test(e.txt));
const beatriz = semana.quarta.find(e => /Beatriz/.test(e.txt));

/* A grade começa às 7h e cada hora tem 52px: 09:00 são 2 horas depois, 104px.
   Se esta conta quebrar, toda consulta aparece no horário errado. */
conferir(carla && carla.top === 104,
  'a consulta das 09:00 cai 2 horas abaixo do topo: ' + (carla ? carla.top : '—') + 'px');
conferir(carla && carla.alt === 52,
  'e 60 minutos ocupam uma hora de altura: ' + (carla ? carla.alt : '—') + 'px');
conferir(beatriz && beatriz.alt === 78,
  '90 minutos ocupam uma hora e meia: ' + (beatriz ? beatriz.alt : '—') + 'px');
conferir(beatriz && beatriz.top === 390,
  'e as 14:30 caem na meia hora certa: ' + (beatriz ? beatriz.top : '—') + 'px');
conferir(almoco && /bloqueio/.test(almoco.classe) && /consulta/.test(carla.classe),
  'bloqueio e consulta não usam a mesma roupa');

/* O que não tem hora vai para a faixa, e não para dentro da grade: pendurado
   nela, sumia assim que a tela rolava para o horário de trabalho. */
conferir(semana.faixa.some(f => /bloqueio.*Supervisão/.test(f)),
  'o bloqueio de dia inteiro fica na faixa sem hora');
conferir(semana.faixa.some(f => /sugestao.*Marina Alves/.test(f)),
  'e a sugestão de retorno também: ' + (semana.faixa.find(f => /sugestao/.test(f)) || '—'));

/* ------------------------------- a sugestão vira consulta e some --------- */

const virou = await p.evaluate(async () => {
  document.querySelector('.cal-faixa-item.sugestao').click();
  await new Promise(r => setTimeout(r, 250));
  const form = {
    paciente: document.getElementById('cf-paciente').selectedOptions[0].textContent,
    tipo: document.getElementById('cf-tipo').value,
    data: document.getElementById('cf-data').value,
  };
  document.getElementById('cf-hora').value = '11:00';
  document.querySelector('[data-salvar="consulta"]').click();
  await new Promise(r => setTimeout(r, 500));
  return {
    form,
    sugestoes: document.querySelectorAll('.cal-faixa-item.sugestao').length,
    consultas: [...document.querySelectorAll('.cal-evento.consulta')]
      .map(e => e.innerText.replace(/\n/g, ' ')),
  };
});

conferir(virou.form.paciente === 'Marina Alves' && virou.form.data === ids.daquiA2,
  'clicar na sugestão abre a consulta já com a pessoa e o dia: ' +
  virou.form.paciente + ' / ' + virou.form.data);
conferir(virou.form.tipo === 'Reavaliação HOLOSCOPE',
  'e com o tipo que faz sentido para um retorno de 4 semanas: ' + virou.form.tipo);
conferir(virou.sugestoes === 0,
  'depois de marcada, a sugestão some — ela pedia o que já foi feito');
conferir(virou.consultas.some(c => /Marina Alves/.test(c) && /11:00/.test(c)),
  'e a consulta aparece na grade: ' + (virou.consultas.find(c => /Marina/.test(c)) || '—'));

/* ------------------------------------------------- editar e desmarcar ---- */

const editado = await p.evaluate(async () => {
  const alvo = [...document.querySelectorAll('.cal-evento.consulta')]
    .find(e => /Carla Souza/.test(e.innerText));
  alvo.click();
  await new Promise(r => setTimeout(r, 250));
  const titulo = document.querySelector('.cal-form-topo h3').textContent;
  document.getElementById('cf-hora').value = '10:30';
  document.getElementById('cf-duracao').value = '30';
  document.getElementById('cf-nota').value = 'Levar o exame de sangue';
  document.querySelector('[data-salvar="consulta"]').click();
  await new Promise(r => setTimeout(r, 500));
  const depois = [...document.querySelectorAll('.cal-evento.consulta')]
    .find(e => /Carla Souza/.test(e.innerText));
  return {
    titulo,
    quantas: document.querySelectorAll('.cal-evento.consulta').length,
    top: Math.round(parseFloat(depois.style.top)),
    alt: Math.round(parseFloat(depois.style.height)),
    nota: (window.DadosLocais.exportar().tabelas.consultas
      .find(c => c.hora === '10:30') || {}).nota,
  };
});

conferir(editado.titulo === 'Editar consulta', 'clicar numa consulta abre para editar');
conferir(editado.quantas === 3,
  'editar não cria outra — a semana continua com as três: ' + editado.quantas);
conferir(editado.top === 182 && editado.alt === 26,
  'a mudança de hora e duração desenha diferente: topo ' + editado.top +
  'px, altura ' + editado.alt + 'px');
conferir(editado.nota === 'Levar o exame de sangue', 'e a observação foi gravada');

/* ---------------------------------------------------- choque de horário -- */

const choque = await p.evaluate(async (ids) => {
  document.querySelector('[data-novo="consulta"]').click();
  await new Promise(r => setTimeout(r, 250));
  document.getElementById('cf-data').value = ids.qua;
  document.getElementById('cf-hora').value = '15:00';   // dentro do 14:30+90
  document.querySelector('[data-salvar="consulta"]').click();
  await new Promise(r => setTimeout(r, 600));
  return {
    aviso: document.getElementById('toast').textContent,
    quantas: window.DadosLocais.exportar().tabelas.consultas.length,
  };
}, ids);

conferir(/já havia consulta às 14:30/.test(choque.aviso),
  'marcar em cima de outra avisa: ' + choque.aviso);
conferir(choque.quantas === 4,
  'mas não impede — às vezes é remarcação: ' + choque.quantas + ' consultas');

/* ------------------------------------------------------- os períodos ----- */

const periodos = await p.evaluate(async (ids) => {
  const ver = async (v) => {
    document.querySelector('.cal-vistas [data-vista="' + v + '"]').click();
    await new Promise(r => setTimeout(r, 250));
    return {
      rotulo: document.querySelector('.cal-rotulo').textContent,
      colunas: document.querySelectorAll('.cal-coluna').length,
      celulas: document.querySelectorAll('.cal-celula').length,
      pilulas: document.querySelectorAll('.cal-pilula').length,
    };
  };
  document.getElementById('cal-data').value = ids.seg;
  document.getElementById('cal-data').dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 250));
  return { dia: await ver('dia'), mes: await ver('mes'), semana: await ver('semana') };
}, ids);

conferir(periodos.dia.colunas === 1, 'Dia mostra uma coluna: ' + periodos.dia.colunas);
conferir(/segunda|seg,/i.test(periodos.dia.rotulo) || /\d+ de /.test(periodos.dia.rotulo),
  'e diz que dia é: ' + periodos.dia.rotulo);
conferir(periodos.mes.celulas === 42,
  'Mês desenha seis semanas cheias: ' + periodos.mes.celulas + ' células');
conferir(periodos.mes.pilulas >= 5,
  'com tudo o que existe no mês: ' + periodos.mes.pilulas + ' marcações');
conferir(periodos.semana.colunas === 7, 'e Semana volta às sete colunas');

/* --------------------------------------------------------- as camadas ---- */

const camadas = await p.evaluate(async () => {
  const contar = () => ({
    consultas: document.querySelectorAll('.cal-evento.consulta').length,
    bloqueios: document.querySelectorAll('.cal-evento.bloqueio').length,
  });
  const antes = contar();
  document.querySelector('[data-camada="bloqueios"]').click();
  await new Promise(r => setTimeout(r, 250));
  const semBloqueio = contar();
  document.querySelector('[data-camada="bloqueios"]').click();
  await new Promise(r => setTimeout(r, 250));
  return { antes, semBloqueio, devolta: contar() };
});

conferir(camadas.antes.bloqueios > 0 && camadas.semBloqueio.bloqueios === 0,
  'desligar a camada esconde os bloqueios');
conferir(camadas.semBloqueio.consultas === camadas.antes.consultas,
  'e não mexe nas consultas');
conferir(camadas.devolta.bloqueios === camadas.antes.bloqueios,
  'religar traz de volta — a camada é filtro, não exclusão');

/* -------------------------------------------------------- desmarcar ------ */

const desmarcado = await p.evaluate(async () => {
  window.confirm = () => true;
  const alvo = [...document.querySelectorAll('.cal-evento.consulta')]
    .find(e => /Carla Souza/.test(e.innerText));
  alvo.click();
  await new Promise(r => setTimeout(r, 250));
  document.querySelector('[data-apagar="consulta"]').click();
  await new Promise(r => setTimeout(r, 500));
  return {
    naTela: [...document.querySelectorAll('.cal-evento.consulta')]
      .filter(e => /Carla Souza/.test(e.innerText)).length,
    noDisco: window.DadosLocais.exportar().tabelas.consultas.length,
  };
});
conferir(desmarcado.naTela === 0 && desmarcado.noDisco === 3,
  'desmarcar apaga da tela e do disco: sobraram ' + desmarcado.noDisco);

/* ------------------------------------------------- a migração do antigo -- */

const migrado = await p.evaluate(async (ids) => {
  // como a versão anterior guardava: uma data solta, sem hora
  const d = new Date(); d.setDate(d.getDate() + 4);
  const dia = d.toISOString().slice(0, 10);
  localStorage.setItem('holohacking.agenda',
    JSON.stringify({ [ids.bea]: { data: dia, nota: 'combinado por telefone' } }));
  return dia;
}, ids);

await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
const depoisDaMigracao = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="agenda"]').click();
  await new Promise(r => setTimeout(r, 600));
  const t = window.DadosLocais.exportar().tabelas.consultas;
  return {
    caixaVelha: localStorage.getItem('holohacking.agenda'),
    total: t.length,
    migrada: t.find(c => /telefone/.test(c.nota || '')) || null,
  };
});

conferir(depoisDaMigracao.migrada && depoisDaMigracao.migrada.data === migrado,
  'o retorno marcado na versão anterior virou consulta: ' +
  (depoisDaMigracao.migrada || {}).data);
conferir(depoisDaMigracao.migrada && depoisDaMigracao.migrada.hora === '09:00',
  'com uma hora, que é o que faltava nele');
conferir(depoisDaMigracao.caixaVelha === null,
  'e a caixa antiga some, para a migração não rodar duas vezes');

// e não roda de novo: recarregar outra vez não duplica
await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
const semDuplicar = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="agenda"]').click();
  await new Promise(r => setTimeout(r, 500));
  return window.DadosLocais.exportar().tabelas.consultas.length;
});
conferir(semDuplicar === depoisDaMigracao.total,
  'recarregar de novo não duplica nada: ' + semDuplicar);

/* --------------------------------------------------------------- fim ----- */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
if (ruim.length) falhou = true;
await nav.close();
process.exit(falhou ? 1 : 0);
