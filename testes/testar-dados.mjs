/**
 * A camada de dados: sem sessao, o app tem que funcionar inteiro sem tocar
 * num banco remoto de verdade.
 *
 * Ate 13/09 o app.js abria um cliente Supabase real, com a chave escrita nele.
 * Este teste existe para isso nao voltar em silencio: se alguem religar uma
 * CHAMADA de banco remoto (REST/Auth da API), a primeira asserção falha.
 *
 * Fase 1 do Supabase (deliberada, nao um regressao): supabase-client.js
 * carrega a biblioteca supabase-js por CDN em todo carregamento de pagina —
 * e so um arquivo estatico, nao uma chamada de banco, e por isso a unica
 * excecao explicita no filtro abaixo. window.supabaseClient existe a partir
 * daqui, mas sem sessao (ninguem loga neste teste) ele nao faz nenhuma
 * chamada de REST/Auth sozinho — se um dia fizer, isto continua pegando.
 */
import puppeteer from 'puppeteer-core';

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1400, height: 1000 });
let falhou = false;
const ok = (c, t) => {
  if (!c) falhou = true;
  console.log((c ? '  ok    ' : '  FALHA ') + t);
};

const erros = [];
p.on('pageerror', e => erros.push(e.message));

// tudo o que a pagina pedir para fora do servidor local fica registrado
const externos = [];
await p.setRequestInterception(true);
p.on('request', r => {
  const u = r.url();
  if (!u.startsWith('http://127.0.0.1:5500/') && !u.startsWith('data:')) externos.push(u);
  r.continue();
});

await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());

// o CDN do supabase-js (arquivo estatico, sem sessao) e a unica excecao
// deliberada — qualquer chamada de API (REST/Auth, aqui ou em outro banco)
// continua proibida.
const remotos = externos
  .filter(u => !u.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js'))
  .filter(u => /supabase|firebase|amazonaws|\/rest\/v1\//i.test(u));
ok(remotos.length === 0, 'nenhuma chamada de banco remoto foi feita' + (remotos.length ? ': ' + remotos[0] : ''));
ok(await p.evaluate(() => typeof window.DadosLocais === 'object'), 'a camada de dados esta no ar');
ok(await p.evaluate(() => window.DadosLocais.onde === 'neste navegador'),
   'e ela sabe dizer onde guarda');

// --- cadastrar pela interface, como a nutricionista faz --------------------
const criado = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Paciente de Teste';
  document.getElementById('np-queixa').value = 'cansaço no fim do dia';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 400));
  return { cards: document.querySelectorAll('.card-paciente').length,
           ativo: window.pacienteAtivoId(),
           tabelas: window.DadosLocais.resumo() };
});
ok(criado.cards === 1, 'o paciente entrou na lista');
ok(!!criado.ativo, 'e virou o paciente ativo');
ok(criado.tabelas.pacientes === 1, 'uma linha na tabela: ' + JSON.stringify(criado.tabelas));

// --- responder tres perguntas ---------------------------------------------
await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  document.getElementById('btn-abrir-questionario').click();
  [...document.querySelectorAll('.q-item')].slice(0, 3).forEach(i => i.querySelectorAll('.q-btn')[2].click());
});

// --- recarregar nao pode perder nada --------------------------------------
await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
const depois = await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  const nome = document.querySelector('.card-paciente h4')?.textContent;
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  document.getElementById('btn-abrir-questionario').click();
  return { nome, marcados: document.querySelectorAll('.q-btn.marcado').length };
});
ok(depois.nome === 'Paciente de Teste', 'o paciente voltou: ' + depois.nome);
ok(depois.marcados === 3, 'as respostas voltaram: ' + depois.marcados);

// --- exportar e o caminho da migracao para o Supabase ---------------------
const pacote = await p.evaluate(() => {
  const x = window.DadosLocais.exportar();
  return { versao: x.versao, tabelas: Object.keys(x.tabelas).sort().join(','),
           conhecidas: Object.keys(window.DadosLocais.resumo()).sort(),
           pacientes: x.tabelas.pacientes.length };
});
ok(pacote.versao === 1 && pacote.pacientes === 1, 'exportar traz tudo: ' + pacote.pacientes + ' paciente');
/* A lista de tabelas cresce com o app; o que este teste cobra é que o pacote
   leve TODAS elas, e não uma quantidade fixa que envelhece a cada módulo. */
ok(pacote.tabelas === pacote.conhecidas.join(','),
   'exportar leva todas as tabelas: ' + pacote.tabelas);

// --- excluir apaga de verdade ---------------------------------------------
// Remover saiu do X do cartao e foi para o menu de acoes: um clique torto na
// lista nao pode mais apagar a ficha de ninguem.
const removido = await p.evaluate(async () => {
  window.confirm = () => true;
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.querySelector('[data-menu]').click();
  document.querySelector('[data-item="remover"]').click();
  await new Promise(r => setTimeout(r, 400));
  return { cards: document.querySelectorAll('.card-paciente').length,
           tabelas: window.DadosLocais.resumo() };
});
ok(removido.cards === 0 && removido.tabelas.pacientes === 0,
   'remover apaga da tela e do disco: ' + JSON.stringify(removido.tabelas));

await nav.close();
console.log(erros.length ? '\n  ERRO: ' + erros[0] : '\n  sem erro de JS');
process.exit(falhou || erros.length ? 1 : 0);
