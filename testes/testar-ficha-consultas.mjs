/**
 * A aba Consultas, dentro da ficha do paciente.
 *
 * O que este teste cobra:
 *
 *   VAZIO       sem consulta nenhuma, o convite certo — nao uma tabela vazia
 *               sem contexto.
 *   PROXIMA     so consulta MARCADA de verdade (Agenda) vira "proxima" — a
 *               data derivada da reavaliacao de 4 semanas nao entra aqui.
 *   ANTERIORES  em ordem decrescente, sem inventar campo nenhum.
 *   NOVA        o atalho "Nova consulta" (do topo da aba e do estado vazio)
 *               ja abre o formulario com esta pessoa selecionada — o mesmo
 *               bug que zerava a tela em "aba:documentos" existia aqui, so
 *               que como selecao errada de paciente.
 *   NAVEGACAO   "Ver na agenda" leva para a secao certa, sem zerar a tela.
 */
import puppeteer from 'puppeteer-core';

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
  // a primeira pessoa da lista: se "Nova consulta" cair nela por padrao em
  // vez de na pessoa da ficha aberta, o teste de pre-selecao acusa.
  const primeira = await novo('Ana Paula Azevedo');
  const marina = await novo('Marina Alves');
  return { primeira, marina };
});

/* -------------------------------------------------- sem consulta --------- */

await p.evaluate(async (id) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.querySelector('[data-ficha="' + id + '"]').click();
  await new Promise(r => setTimeout(r, 300));
}, ids.marina);
await aba('consultas');

const vazio = await p.evaluate(() => {
  const v = document.querySelector('#aba-consultas .lista-vazia');
  return {
    titulo: v?.querySelector('strong')?.textContent,
    texto: v?.querySelector('span')?.textContent,
    temProxima: !!document.querySelector('#aba-consultas .dash-titulo'),
    continuidade: [...document.querySelectorAll('#aba-consultas .fic-chip')].map(b => b.textContent),
  };
});
conferir(vazio.titulo === 'Nenhuma consulta registrada', 'título do estado vazio: ' + vazio.titulo);
conferir(vazio.texto === 'Registre uma consulta para iniciar o acompanhamento deste paciente.',
  'texto do estado vazio: ' + vazio.texto);
conferir(!vazio.temProxima, 'sem consulta, nenhum bloco "Próxima consulta" aparece');
conferir(vazio.continuidade.join(',') === 'HOLOSCOPE,HOLOSCAN,Documentos',
  'a continuidade clínica discreta aparece mesmo vazio: ' + vazio.continuidade.join(' · '));

/* -------------------------------- "Nova consulta" pre-seleciona a pessoa - */

const preSelecionado = await p.evaluate(async () => {
  document.querySelector('#aba-consultas [data-ir="nova-consulta"]').click();
  await new Promise(r => setTimeout(r, 300));
  return {
    secaoAtiva: document.querySelector('.secao.ativa')?.id,
    paciente: document.getElementById('cf-paciente')?.selectedOptions[0]?.textContent,
  };
});
conferir(preSelecionado.secaoAtiva === 'secao-agenda', 'leva para a agenda: ' + preSelecionado.secaoAtiva);
conferir(preSelecionado.paciente === 'Marina Alves',
  'e o formulário já nasce com esta pessoa, não a primeira da lista: ' + preSelecionado.paciente);

/* --------------------------------------------- marcar consultas de verdade */

await p.evaluate(async (id) => {
  const dias = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  // futura: vira "proxima". duas passadas: viram "anteriores", decrescente.
  await window.DadosLocais.from('consultas').insert({
    paciente_id: id, data: dias(6), hora: '10:00', duracao: 60,
    tipo: 'Reavaliação HOLOSCOPE', nota: 'levar o exame novo' });
  await window.DadosLocais.from('consultas').insert({
    paciente_id: id, data: dias(-40), hora: '09:00', duracao: 60,
    tipo: 'Retorno', nota: '' });
  await window.DadosLocais.from('consultas').insert({
    paciente_id: id, data: dias(-10), hora: '14:30', duracao: 30,
    tipo: 'Retorno', nota: 'Trouxe o hemograma' });
}, ids.marina);

await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await p.evaluate(async (id) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.querySelector('[data-ficha="' + id + '"]').click();
  await new Promise(r => setTimeout(r, 300));
}, ids.marina);
await aba('consultas');

const cheio = await p.evaluate(() => {
  const blocos = [...document.querySelectorAll('#aba-consultas .dash-bloco-compacto')];
  const de = titulo => blocos.find(b => b.querySelector('.dash-titulo').textContent === titulo);
  const ler = li => ({
    quando: li.querySelector('.dash-quem b').textContent,
    porque: li.querySelector('.dash-porque').textContent,
  });
  const proximaBloco = de('Próxima consulta');
  const anterioresBloco = de('Consultas anteriores');
  return {
    proxima: proximaBloco ? ler(proximaBloco.querySelector('.dash-pendente')) : null,
    proximaDestacada: !!proximaBloco?.querySelector('.dash-pendente.abrir'),
    anteriores: [...anterioresBloco.querySelectorAll('.dash-pendente')].map(ler),
    semTabelaVaziaSemContexto: !document.querySelector('#aba-consultas .lista-vazia'),
  };
});

conferir(!!cheio.proxima, 'a consulta futura aparece em destaque');
conferir(/às 10:00/.test(cheio.proxima.quando), 'com data e horário: ' + cheio.proxima.quando);
conferir(/Reavaliação HOLOSCOPE/.test(cheio.proxima.porque) && /levar o exame novo/.test(cheio.proxima.porque),
  'tipo e observação, sem inventar campo: ' + cheio.proxima.porque);
conferir(cheio.proximaDestacada, 'e a linha vem com destaque visual');
conferir(cheio.anteriores.length === 2, 'as duas consultas passadas viram "anteriores": ' + cheio.anteriores.length);
conferir(cheio.anteriores[0].porque.includes('Trouxe o hemograma'),
  'ordem decrescente — a mais recente primeiro: ' + cheio.anteriores[0].porque);
conferir(cheio.semTabelaVaziaSemContexto, 'e o estado vazio não aparece mais quando há consulta');

/* --------------------------------------------- "Ver na agenda" nao zera -- */

const verAgenda = await p.evaluate(async () => {
  document.querySelector('#aba-consultas .dash-pendente .dash-ir').click();
  await new Promise(r => setTimeout(r, 250));
  return {
    secaoAtiva: document.querySelector('.secao.ativa')?.id,
    algumaAtiva: document.querySelectorAll('.secao.ativa').length,
  };
});
conferir(verAgenda.secaoAtiva === 'secao-agenda' && verAgenda.algumaAtiva === 1,
  '"Ver na agenda" leva para a agenda, sem zerar a tela: ' + verAgenda.secaoAtiva);

/* ------------------------------------------------- a pessoa errada nao -- */
/* volta para a ficha e confere que a OUTRA pessoa (sem consulta nenhuma)
   continua vendo o estado vazio dela — as duas fichas nao se misturam. */

await p.evaluate(async (id) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.querySelector('[data-ficha="' + id + '"]').click();
  await new Promise(r => setTimeout(r, 300));
}, ids.primeira);
await aba('consultas');
const outraPessoa = await p.evaluate(() => ({
  vazio: !!document.querySelector('#aba-consultas .lista-vazia'),
  proxima: !!document.querySelector('#aba-consultas .dash-titulo'),
}));
conferir(outraPessoa.vazio && !outraPessoa.proxima,
  'a ficha de quem não tem consulta continua vazia — as duas não se misturam');

/* --------------------------------------------------------------- fim ----- */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
if (ruim.length) falhou = true;
await nav.close();
process.exit(falhou ? 1 : 0);
