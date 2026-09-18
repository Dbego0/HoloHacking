/**
 * PACIENTES + SUPABASE — a integracao minima da Fase 1.
 *
 * dados-router.js so manda a tabela `pacientes` para o Supabase (`patients`)
 * quando existe uma sessao Supabase real (window.HoloAuth.sessaoAtiva()).
 * Sem sessao — dev local, ou qualquer teste que nao faca login de verdade —
 * cai para o DadosLocais de sempre, sem tocar em rede.
 *
 *   A  sem sessao (bypass local): cadastrar paciente continua 100% local,
 *      exatamente como antes da Fase 1. Testado de verdade, sem mock —
 *      e a suite inteira de testes ja depende disto continuar assim.
 *
 *   B  COM sessao real (precisa de HOLO_TESTE_EMAIL / HOLO_TESTE_SENHA no
 *      ambiente): cadastrar paciente vai para o Supabase de verdade, some do
 *      localStorage, e window.Panorama/app enxergam ele vindo de la.
 *
 *   C  ISOLAMENTO ENTRE DUAS CONTAS (precisa tambem de HOLO_TESTE_EMAIL_B /
 *      HOLO_TESTE_SENHA_B): a conta B nao ve, nao atualiza e nao remove o
 *      paciente cadastrado pela conta A — testado contra o Postgres real via
 *      RLS, nao simulado.
 *
 * B e C ficam PULADOS, com aviso explicito, se as variaveis de ambiente nao
 * existirem — nunca fingem ter passado. Ver testes/testar-login.mjs para
 * como criar esses usuarios (nao invento credencial nenhuma aqui).
 */
import puppeteer from 'puppeteer-core';

const ok = (c, t) => { globalThis.__falhou = globalThis.__falhou || false; if (!c) globalThis.__falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };
const pulado = (t) => console.log('  ----  ' + t + ' (PULADO — variáveis de ambiente ausentes)');

async function novaAba(browser) {
  const contexto = await browser.createBrowserContext();
  const p = await contexto.newPage();
  await p.setViewport({ width: 1400, height: 1000 });
  const ruim = []; p.on('pageerror', e => ruim.push(e.message));
  await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
  return { contexto, p, ruim };
}

async function cadastrar(p, nome) {
  return p.evaluate(async (nome) => {
    document.querySelector('.nav-item[data-secao="pacientes"]').click();
    document.getElementById('btn-abrir-novo').click();
    document.getElementById('np-nome').value = nome;
    document.getElementById('btn-salvar-paciente').click();
    await new Promise(r => setTimeout(r, 500));
    return window.pacienteAtivoId ? window.pacienteAtivoId() : null;
  }, nome);
}

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });

/* ==================================================================== */
console.log('\n  A — SEM SESSAO: CADASTRO CONTINUA 100% LOCAL\n');
/* ==================================================================== */
{
  const { contexto, p, ruim } = await novaAba(browser);
  await p.click('#saida-dev'); // bypass local — nao cria sessao nenhuma
  await new Promise(r => setTimeout(r, 200));

  const antesSemSessao = await p.evaluate(() => !!(window.HoloAuth && window.HoloAuth.sessaoAtiva()));
  ok(!antesSemSessao, 'sem login real, HoloAuth.sessaoAtiva() e false');

  const nome = 'Paciente Local Fase1 ' + Date.now();
  const pid = await cadastrar(p, nome);
  const r = await p.evaluate((pid) => {
    const local = JSON.parse(localStorage.getItem('holohacking.dados.pacientes') || '[]');
    return {
      estaNoLocalStorage: local.some(x => x.id === pid),
      apareceNaTela: !!document.querySelector('.lista-pacientes, #lista-pacientes')?.textContent,
    };
  }, pid);
  ok(!!pid, 'o cadastro funciona sem sessao: ganhou um id (' + pid + ')');
  ok(r.estaNoLocalStorage, 'e a linha esta em localStorage — dados-router.js caiu para o DadosLocais');
  ok(ruim.length === 0, 'sem erro de JS' + (ruim.length ? ': ' + ruim[0] : ''));
  await contexto.close();
}

/* ==================================================================== */
console.log('\n  B — COM SESSAO REAL: CADASTRO VAI PARA O SUPABASE\n');
/* ==================================================================== */

const EMAIL_A = process.env.HOLO_TESTE_EMAIL;
const SENHA_A = process.env.HOLO_TESTE_SENHA;
const EMAIL_B = process.env.HOLO_TESTE_EMAIL_B;
const SENHA_B = process.env.HOLO_TESTE_SENHA_B;

let pacienteDeA = null; // { id, nome } — usado tambem na secao C

if (!EMAIL_A || !SENHA_A) {
  pulado('cadastro autenticado vai para o Supabase');
  pulado('paciente autenticado some do localStorage');
  pulado('Panorama/lista enxergam o paciente vindo do Supabase');
} else {
  const { contexto, p, ruim } = await novaAba(browser);
  const entrou = await p.evaluate(async (email, senha) => {
    document.getElementById('login-email').value = email;
    document.getElementById('login-senha').value = senha;
    document.getElementById('form-login').requestSubmit();
    await new Promise(r => setTimeout(r, 1500));
    return {
      liberado: document.getElementById('app').getAttribute('aria-hidden') !== 'true',
      mensagem: document.getElementById('login-mensagem').textContent,
    };
  }, EMAIL_A, SENHA_A);
  ok(entrou.liberado, 'login com HOLO_TESTE_EMAIL entra de verdade: ' + (entrou.liberado ? 'ok' : entrou.mensagem));

  if (entrou.liberado) {
    const nome = 'Paciente Supabase Fase1 ' + Date.now();
    const pid = await cadastrar(p, nome);
    pacienteDeA = { id: pid, nome };
    const r = await p.evaluate((pid) => {
      const local = JSON.parse(localStorage.getItem('holohacking.dados.pacientes') || '[]');
      return { foraDoLocalStorage: !local.some(x => x.id === pid) };
    }, pid);
    ok(!!pid, 'o cadastro autenticado ganhou um id: ' + pid);
    ok(r.foraDoLocalStorage, 'e NAO foi escrito em localStorage — foi para o Supabase');
  }
  ok(ruim.length === 0, 'sem erro de JS' + (ruim.length ? ': ' + ruim[0] : ''));
  await contexto.close();
}

/* ==================================================================== */
console.log('\n  C — ISOLAMENTO ENTRE DUAS CONTAS (RLS)\n');
/* ==================================================================== */

if (!pacienteDeA) {
  pulado('conta B nao ve o paciente da conta A');
  pulado('conta B nao atualiza o paciente da conta A');
  pulado('conta B nao remove o paciente da conta A');
} else if (!EMAIL_B || !SENHA_B) {
  pulado('conta B nao ve o paciente da conta A (falta HOLO_TESTE_EMAIL_B/SENHA_B)');
  pulado('conta B nao atualiza o paciente da conta A');
  pulado('conta B nao remove o paciente da conta A');
} else {
  const { contexto, p, ruim } = await novaAba(browser);
  const entrouB = await p.evaluate(async (email, senha) => {
    document.getElementById('login-email').value = email;
    document.getElementById('login-senha').value = senha;
    document.getElementById('form-login').requestSubmit();
    await new Promise(r => setTimeout(r, 1500));
    return document.getElementById('app').getAttribute('aria-hidden') !== 'true';
  }, EMAIL_B, SENHA_B);
  ok(entrouB, 'login com HOLO_TESTE_EMAIL_B entra de verdade');

  if (entrouB) {
    const r = await p.evaluate(async (idDeA) => {
      const listaSelect = await window.supabaseClient.from('patients').select('*');
      const vejo = (listaSelect.data || []).some(x => x.id === idDeA);

      const upd = await window.supabaseClient.from('patients')
        .update({ nome: 'sequestrado por B' }).eq('id', idDeA).select();
      const atualizei = (upd.data || []).length > 0;

      const del = await window.supabaseClient.from('patients').delete().eq('id', idDeA).select();
      const removi = (del.data || []).length > 0;

      return { vejo, atualizei, removi, erroUpd: upd.error && upd.error.message, erroDel: del.error && del.error.message };
    }, pacienteDeA.id);

    ok(!r.vejo, 'B faz select() em `patients` e NAO ve o paciente de A');
    ok(!r.atualizei, 'B tenta update() no paciente de A: 0 linhas afetadas (RLS bloqueou)');
    ok(!r.removi, 'B tenta delete() no paciente de A: 0 linhas afetadas (RLS bloqueou)');
  }
  ok(ruim.length === 0, 'sem erro de JS' + (ruim.length ? ': ' + ruim[0] : ''));
  await contexto.close();

  // limpeza: apagar o paciente de teste criado pela conta A, autenticando
  // como A de novo, para nao deixar lixo na base entre rodadas do teste.
  const { contexto: cLimpa, p: pLimpa } = await novaAba(browser);
  await pLimpa.evaluate(async (email, senha) => {
    await window.supabaseClient.auth.signInWithPassword({ email, password: senha });
  }, EMAIL_A, SENHA_A);
  await new Promise(r => setTimeout(r, 500));
  await pLimpa.evaluate(async (id) => {
    await window.supabaseClient.from('patients').delete().eq('id', id);
  }, pacienteDeA.id);
  await cLimpa.close();
}

await browser.close();
console.log('');
process.exit(globalThis.__falhou ? 1 : 0);
