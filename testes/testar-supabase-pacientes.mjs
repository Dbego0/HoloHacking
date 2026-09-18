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
 *   D  REFRESH COM SESSAO (bug de reidratacao corrigido nesta rodada):
 *      login, cadastra paciente, da refresh na pagina, confere que o
 *      paciente, o botao "Sair da conta" e a sessao continuam ali. Cobre os
 *      Cenarios A e B do relato original.
 *
 *   E  LOGOUT + REFRESH: signOut() real bloqueia o app, e o refresh depois
 *      dele continua bloqueado. Cenario C do relato.
 *
 * B, C, D e E ficam PULADOS, com aviso explicito, se as variaveis de
 * ambiente nao existirem — nunca fingem ter passado. Ver testes/
 * testar-login.mjs para como criar esses usuarios (nao invento credencial
 * nenhuma aqui).
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

/* ==================================================================== */
console.log('\n  D — REFRESH COM SESSAO: PACIENTE E BOTAO SAIR CONTINUAM\n');
/* ==================================================================== */
// Reproduz o bug relatado em producao: carregarTudo() (app.js) e a aba
// Conta (perfil.js) desenhavam uma unica vez, antes de window.HoloAuth
// saber se havia sessao — apos o refresh, o paciente cadastrado sumia e o
// botao Sair nunca aparecia, mesmo com a sessao real continuando ativa.
// Cobre ao mesmo tempo os Cenarios A e B do relato: um refresh COM sessao
// persistida E' "abrir o app ja com sessao persistida".

if (!EMAIL_A || !SENHA_A) {
  pulado('paciente cadastrado continua visivel depois do refresh');
  pulado('botao "Sair da conta" continua visivel depois do refresh');
  pulado('sessao continua ativa depois do refresh');
} else {
  const { contexto, p, ruim } = await novaAba(browser);
  const entrou = await p.evaluate(async (email, senha) => {
    document.getElementById('login-email').value = email;
    document.getElementById('login-senha').value = senha;
    document.getElementById('form-login').requestSubmit();
    await new Promise(r => setTimeout(r, 1500));
    return document.getElementById('app').getAttribute('aria-hidden') !== 'true';
  }, EMAIL_A, SENHA_A);
  ok(entrou, 'login com HOLO_TESTE_EMAIL entra de verdade');

  let pidRefresh = null;
  if (entrou) {
    const nome = 'Paciente Refresh Fase1.1 ' + Date.now();
    pidRefresh = await cadastrar(p, nome);
    ok(!!pidRefresh, 'cadastro antes do refresh ganhou um id: ' + pidRefresh);

    // o refresh de verdade: navega de novo para a mesma origem. A sessao
    // persistida pelo supabase-js precisa sobreviver, e a UI precisa
    // reidratar sozinha, sem clique nenhum de quem usa o app.
    await p.reload({ waitUntil: 'networkidle2' });
    await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
    // getSession() apos reload nao e instantaneo de verdade (le e valida o
    // token) — uma folga pequena antes de conferir o estado final.
    await new Promise(r => setTimeout(r, 800));

    const depois = await p.evaluate((nomeEsperado) => {
      document.querySelector('.nav-item[data-secao="pacientes"]').click();
      return {
        sessaoAtiva: !!(window.HoloAuth && window.HoloAuth.sessaoAtiva()),
        appLiberado: document.getElementById('app').getAttribute('aria-hidden') !== 'true',
        pacienteNaLista: document.body.textContent.includes(nomeEsperado),
      };
    }, nome);
    ok(depois.sessaoAtiva, 'apos refresh, a sessao continua ativa: HoloAuth.sessaoAtiva() = true');
    ok(depois.appLiberado, 'e o app continua liberado (nao caiu de volta pro login)');
    ok(depois.pacienteNaLista, 'e o paciente cadastrado antes do refresh continua visivel na lista');

    const conta = await p.evaluate(async () => {
      document.querySelector('.nav-item[data-secao="perfil"]').click();
      await new Promise(r => setTimeout(r, 200));
      document.querySelector('[data-aba-perfil="conta"]').click();
      await new Promise(r => setTimeout(r, 200));
      return { temBotaoSair: !!document.getElementById('btn-sair') };
    });
    ok(conta.temBotaoSair, 'e o botão "Sair da conta" continua aparecendo na aba Conta');
  }
  ok(ruim.length === 0, 'sem erro de JS' + (ruim.length ? ': ' + ruim[0] : ''));

  if (pidRefresh) {
    await p.evaluate(async (id) => { await window.supabaseClient.from('patients').delete().eq('id', id); }, pidRefresh);
  }
  await contexto.close();
}

/* ==================================================================== */
console.log('\n  E — LOGOUT + REFRESH: O APP PERMANECE BLOQUEADO\n');
/* ==================================================================== */
// Cenario C do relato: logout real, depois refresh — o app nao pode voltar
// a mostrar dado nenhum so porque a pagina recarregou.

if (!EMAIL_A || !SENHA_A) {
  pulado('signOut() real bloqueia o app de volta para o login');
  pulado('refresh depois do logout continua deslogado');
} else {
  const { contexto, p, ruim } = await novaAba(browser);
  await p.evaluate(async (email, senha) => {
    document.getElementById('login-email').value = email;
    document.getElementById('login-senha').value = senha;
    document.getElementById('form-login').requestSubmit();
    await new Promise(r => setTimeout(r, 1500));
  }, EMAIL_A, SENHA_A);

  const saiu = await p.evaluate(async () => {
    await window.HoloAuth.sair();
    await new Promise(r => setTimeout(r, 500));
    return {
      loginAberto: !document.getElementById('tela-login').hidden,
      appBloqueado: document.getElementById('app').getAttribute('aria-hidden') === 'true',
    };
  });
  ok(saiu.loginAberto && saiu.appBloqueado, 'signOut() real bloqueia o app de volta para o login');

  await p.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));
  const depoisDoRefresh = await p.evaluate(() => ({
    loginAberto: !document.getElementById('tela-login').hidden,
    appBloqueado: document.getElementById('app').getAttribute('aria-hidden') === 'true',
    sessaoAtiva: !!(window.HoloAuth && window.HoloAuth.sessaoAtiva()),
  }));
  ok(depoisDoRefresh.loginAberto && depoisDoRefresh.appBloqueado && !depoisDoRefresh.sessaoAtiva,
     'refresh depois do logout continua bloqueado, sem sessão');
  ok(ruim.length === 0, 'sem erro de JS' + (ruim.length ? ': ' + ruim[0] : ''));
  await contexto.close();
}

await browser.close();
console.log('');
process.exit(globalThis.__falhou ? 1 : 0);
