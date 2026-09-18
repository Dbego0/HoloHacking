/**
 * LOGIN — a tela de entrada, agora com Supabase Auth de verdade (Fase 1).
 *
 * O que este teste trava:
 *
 *   A-C  a tela existe, tem os campos, e a senha nasce mascarada.
 *   D-E  mostrar/ocultar alterna o type e devolve o foco ao campo.
 *   F    a senha nao encosta em localStorage, sessionStorage, dataset ou URL.
 *   G-I  validacao de formato: e-mail obrigatorio, formato, senha obrigatoria.
 *   J    credencial invalida É REJEITADA DE VERDADE pelo Supabase — chamada
 *        de rede real contra o projeto, sem servidor nenhum simulado — e o
 *        app continua bloqueado. Este e o teste mais importante do arquivo:
 *        ele falha no dia em que alguem afrouxar essa checagem.
 *   K    clicar repetido durante o carregamento dispara UMA chamada.
 *   L    "Esqueci minha senha" ainda nao tem fluxo completo (falta pagina de
 *        redirect) e diz isso, sem fingir enviar nada.
 *   M    a tela se comporta em viewport de 375px.
 *   N    nenhuma tela clinica existente foi alterada pela camada de entrada.
 *   O    o atalho de desenvolvimento SO existe (aparece e funciona) em
 *        localhost/127.0.0.1 — testado contra o hostname real de producao
 *        via --host-resolver-rules, nao mockado.
 *
 * O QUE ESTE ARQUIVO NAO TESTA (e por que): login VALIDO com sessao real,
 * restauracao apos refresh e logout end-to-end exigiriam um usuario Supabase
 * de teste que ninguem pediu para eu inventar. testes/testar-supabase-auth.mjs
 * cobre esses casos SE as variaveis de ambiente HOLO_TESTE_EMAIL/HOLO_TESTE_SENHA
 * existirem — e diz claramente "PULADO" quando nao existirem, em vez de fingir
 * que testou.
 */
import puppeteer from 'puppeteer-core';

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1366, height: 900 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
// Nada de senha em log: se algum console.log vazar credencial, aparece aqui.
const consoles = []; p.on('console', m => consoles.push(m.text()));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

const SENHA = 'senha-de-teste-nunca-guardada-9134';

/* ==================================================================== */
console.log('\n  A/B/C — A TELA RENDERIZA, COM CAMPOS, SENHA MASCARADA\n');
/* ==================================================================== */

const inicial = await p.evaluate(() => {
  const t = document.getElementById('tela-login');
  const e = document.getElementById('login-email');
  const s = document.getElementById('login-senha');
  return {
    existe: !!t,
    visivel: !!t && !t.hidden && getComputedStyle(t).display !== 'none',
    email: !!e, senha: !!s,
    tipoSenha: s && s.type,
    autoEmail: e && e.getAttribute('autocomplete'),
    autoSenha: s && s.getAttribute('autocomplete'),
    labelEmail: !!document.querySelector('label[for="login-email"]'),
    labelSenha: !!document.querySelector('label[for="login-senha"]'),
    temEntrar: !!document.getElementById('btn-entrar'),
    temEsqueci: !!document.getElementById('link-esqueci'),
    temManter: !!document.getElementById('login-manter'),
    live: document.getElementById('login-mensagem')?.getAttribute('aria-live'),
    appEscondidoDeLeitor: document.getElementById('app')?.getAttribute('aria-hidden'),
    focoInicial: document.activeElement?.id,
  };
});
ok(inicial.existe && inicial.visivel, 'a tela de entrada aparece ao abrir o sistema');
ok(inicial.email && inicial.senha, 'os campos de e-mail e senha existem');
ok(inicial.tipoSenha === 'password', 'a senha comeca com type=password: ' + inicial.tipoSenha);
ok(inicial.labelEmail && inicial.labelSenha, 'os dois campos tem <label for> de verdade');
ok(inicial.autoEmail === 'username' && inicial.autoSenha === 'current-password',
   'autocomplete correto: ' + inicial.autoEmail + ' / ' + inicial.autoSenha);
ok(inicial.temEntrar && inicial.temEsqueci && inicial.temManter,
   'botao Entrar, link Esqueci minha senha e caixa Manter conectado presentes');
ok(inicial.live === 'polite', 'a area de mensagem e uma regiao aria-live');
ok(inicial.appEscondidoDeLeitor === 'true', 'o app atras fica aria-hidden enquanto a entrada esta aberta');
ok(inicial.focoInicial === 'login-email', 'o foco comeca no e-mail: ' + inicial.focoInicial);

/* ==================================================================== */
console.log('\n  D/E — MOSTRAR E OCULTAR SENHA\n');
/* ==================================================================== */

const olho = await p.evaluate(async (senha) => {
  const s = document.getElementById('login-senha');
  const b = document.getElementById('btn-olho');
  s.value = senha;
  const antes = { tipo: s.type, pressed: b.getAttribute('aria-pressed'), rotulo: b.getAttribute('aria-label') };
  b.click();
  const revelado = { tipo: s.type, pressed: b.getAttribute('aria-pressed'), rotulo: b.getAttribute('aria-label'),
                     foco: document.activeElement?.id };
  b.click();
  const oculto = { tipo: s.type, pressed: b.getAttribute('aria-pressed'), rotulo: b.getAttribute('aria-label'),
                   foco: document.activeElement?.id, valorIntacto: s.value === senha };
  return { antes, revelado, oculto };
}, SENHA);
ok(olho.revelado.tipo === 'text', 'mostrar senha muda o campo para type=text');
ok(olho.oculto.tipo === 'password', 'ocultar devolve o campo para type=password');
ok(olho.antes.pressed === 'false' && olho.revelado.pressed === 'true' && olho.oculto.pressed === 'false',
   'aria-pressed acompanha o estado: false -> true -> false');
ok(/mostrar/i.test(olho.antes.rotulo) && /ocultar/i.test(olho.revelado.rotulo),
   'aria-label descreve a acao: "' + olho.antes.rotulo + '" -> "' + olho.revelado.rotulo + '"');
ok(olho.revelado.foco === 'login-senha' && olho.oculto.foco === 'login-senha',
   'o foco nao sai do campo de senha ao alternar');
ok(olho.oculto.valorIntacto, 'o que foi digitado continua intacto depois de alternar duas vezes');

/* ==================================================================== */
console.log('\n  G/H/I — VALIDACAO DE FORMATO\n');
/* ==================================================================== */

const validar = (email, senha) => p.evaluate(async (e, s) => {
  const ce = document.getElementById('login-email');
  const cs = document.getElementById('login-senha');
  ce.value = e; cs.value = s;
  document.getElementById('form-login').requestSubmit();
  await new Promise(r => setTimeout(r, 120));
  return {
    erroEmail: document.getElementById('erro-email').hidden ? '' : document.getElementById('erro-email').textContent,
    erroSenha: document.getElementById('erro-senha').hidden ? '' : document.getElementById('erro-senha').textContent,
    invalidoEmail: ce.getAttribute('aria-invalid'),
    invalidoSenha: cs.getAttribute('aria-invalid'),
    mensagem: document.getElementById('login-mensagem').hidden ? '' : document.getElementById('login-mensagem').textContent,
  };
}, email, senha);

const semEmail = await validar('', SENHA);
ok(!!semEmail.erroEmail && semEmail.invalidoEmail === 'true',
   'submit sem e-mail mostra validacao: "' + semEmail.erroEmail + '"');
ok(!semEmail.mensagem, 'e nao chega a falar em servidor quando o formulario nem passou');

const emailTorto = await validar('nao-e-email', SENHA);
ok(!!emailTorto.erroEmail && emailTorto.invalidoEmail === 'true',
   'e-mail invalido mostra validacao: "' + emailTorto.erroEmail + '"');

const semSenha = await validar('pessoa@clinica.com', '');
ok(!!semSenha.erroSenha && semSenha.invalidoSenha === 'true',
   'submit sem senha mostra validacao: "' + semSenha.erroSenha + '"');
ok(!semSenha.erroEmail, 'e o e-mail valido nao e marcado como errado junto');

const digitando = await p.evaluate(async () => {
  const ce = document.getElementById('login-email');
  ce.value = 'p@c.com';
  ce.dispatchEvent(new Event('input', { bubbles: true }));
  return { invalido: ce.getAttribute('aria-invalid'), erro: document.getElementById('erro-email').hidden };
});
ok(!digitando.invalido && digitando.erro, 'digitar de novo limpa o erro daquele campo');

/* ==================================================================== */
console.log('\n  J — CREDENCIAL INVALIDA E REJEITADA DE VERDADE PELO SUPABASE\n');
/* ==================================================================== */

// Chamada de rede real contra o projeto Supabase configurado em
// supabase-client.js — nao ha stub nem simulacao aqui. Um e-mail que quase
// certamente nao existe garante rejeicao independente de qualquer usuario
// real ja cadastrado.
const invalido = await p.evaluate(async () => {
  document.getElementById('login-email').value =
    'ninguem-existe-de-verdade-' + Date.now() + '@holohacking.test';
  document.getElementById('login-senha').value = 'senha-com-certeza-errada-123456';
  document.getElementById('form-login').requestSubmit();
  await new Promise(r => setTimeout(r, 1500));
  const t = document.getElementById('tela-login');
  return {
    mensagem: document.getElementById('login-mensagem').textContent,
    telaAindaAberta: !t.hidden && getComputedStyle(t).display !== 'none',
    appAindaEscondido: document.getElementById('app').getAttribute('aria-hidden') === 'true',
  };
});
ok(invalido.telaAindaAberta, 'a tela de entrada continua aberta depois de credencial invalida');
ok(invalido.appAindaEscondido, 'a aplicacao nao foi liberada');
ok(/incorretos/i.test(invalido.mensagem),
   'a mensagem e clara sobre o que aconteceu: "' + invalido.mensagem + '"');
ok(!/SEM_SERVIDOR|não conectada ao servidor/i.test(invalido.mensagem),
   'e nao fala mais em "servidor desconectado" — o servidor existe e respondeu');

/* ==================================================================== */
console.log('\n  F — A SENHA NAO E ARMAZENADA EM LUGAR NENHUM\n');
/* ==================================================================== */

const vazou = await p.evaluate((senha) => {
  const achados = [];
  const varrer = (loja, nome) => {
    try {
      for (let i = 0; i < loja.length; i++) {
        const k = loja.key(i);
        if (String(k).includes(senha) || String(loja.getItem(k)).includes(senha)) achados.push(nome + ':' + k);
      }
    } catch (e) { /* navegador anonimo */ }
  };
  varrer(localStorage, 'localStorage');
  varrer(sessionStorage, 'sessionStorage');
  if (document.cookie.includes(senha)) achados.push('cookie');
  if (location.href.includes(senha)) achados.push('url');
  document.querySelectorAll('*').forEach(el => {
    for (const k in el.dataset) if (String(el.dataset[k]).includes(senha)) achados.push('dataset:' + k);
    // o atributo value no HTML; o .value vivo do input e do navegador, nao nosso
    const attr = el.getAttribute && el.getAttribute('value');
    if (attr && attr.includes(senha)) achados.push('atributo value');
  });
  if (document.documentElement.outerHTML.includes(senha)) achados.push('html');
  return achados;
}, SENHA);
ok(vazou.length === 0, 'a senha nao aparece em storage, cookie, URL, dataset nem HTML' +
   (vazou.length ? ': ' + vazou.join(', ') : ''));
ok(!consoles.some(t => t.includes(SENHA)), 'a senha nao foi impressa no console');

/* ==================================================================== */
console.log('\n  K — CLIQUE REPETIDO NAO DISPARA VARIAS CHAMADAS\n');
/* ==================================================================== */

const repetido = await p.evaluate(async (senha) => {
  let chamadas = 0;
  const original = window.AuthService.entrar;
  // segura a resposta para que a janela de "carregando" seja observavel
  window.AuthService.entrar = function (c) {
    chamadas++;
    return new Promise(r => setTimeout(() => r({ ok: false, motivo: 'SEM_SERVIDOR',
      mensagem: 'Autenticação ainda não conectada ao servidor.' }), 250));
  };
  document.getElementById('login-email').value = 'pessoa@clinica.com';
  document.getElementById('login-senha').value = senha;
  const b = document.getElementById('btn-entrar');
  const f = document.getElementById('form-login');
  f.requestSubmit();
  const desabilitado = b.disabled;
  // mais quatro tentativas enquanto a primeira ainda esta no ar
  f.requestSubmit(); f.requestSubmit(); b.click(); b.click();
  await new Promise(r => setTimeout(r, 450));
  window.AuthService.entrar = original;
  return { chamadas, desabilitado, liberadoDepois: !b.disabled };
}, SENHA);
ok(repetido.chamadas === 1, 'cinco tentativas durante o carregamento = 1 chamada: ' + repetido.chamadas);
ok(repetido.desabilitado, 'o botao fica desabilitado durante o carregamento');
ok(repetido.liberadoDepois, 'e volta a funcionar quando a resposta chega');

/* ==================================================================== */
console.log('\n  L — ESQUECI MINHA SENHA NAO SIMULA RECUPERACAO\n');
/* ==================================================================== */

const esqueci = await p.evaluate(async () => {
  const antesLS = localStorage.length;
  document.getElementById('link-esqueci').click();
  await new Promise(r => setTimeout(r, 200));
  return {
    mensagem: document.getElementById('login-mensagem').textContent,
    urlIntacta: !location.hash || location.hash === '#',
    storageIntacto: localStorage.length === antesLS,
  };
});
ok(/recuperação de senha ainda não está disponível/i.test(esqueci.mensagem),
   'a mensagem e neutra e honesta: "' + esqueci.mensagem + '"');
ok(!/enviamos|verifique seu e-mail|link de recuperação foi/i.test(esqueci.mensagem),
   'nao afirma ter enviado nada');
ok(esqueci.storageIntacto, 'e nao grava nada ao clicar');

/* ==================================================================== */
console.log('\n  M — VIEWPORT MOBILE (375px)\n');
/* ==================================================================== */

await p.setViewport({ width: 375, height: 720 });
await new Promise(r => setTimeout(r, 200));
const mobile = await p.evaluate(() => {
  const c = document.querySelector('.login-cartao');
  const b = document.getElementById('btn-entrar');
  const s = document.getElementById('login-senha');
  const o = document.getElementById('btn-olho');
  const rc = c.getBoundingClientRect(), rb = b.getBoundingClientRect();
  const rs = s.getBoundingClientRect(), ro = o.getBoundingClientRect();
  return {
    cartaoCabe: rc.left >= 0 && rc.right <= window.innerWidth,
    larguraUtil: Math.round((rc.width / window.innerWidth) * 100),
    botaoVisivel: rb.width > 0 && rb.left >= 0 && rb.right <= window.innerWidth,
    alturaBotao: Math.round(rb.height),
    olhoDentroDoCampo: ro.right <= rs.right + 1 && ro.left > rs.left,
    espacoParaTexto: Math.round(ro.left - rs.left),
    alvoOlho: Math.round(Math.min(ro.width, ro.height)),
    semScrollHorizontal: document.documentElement.scrollWidth <= window.innerWidth,
  };
});
ok(mobile.cartaoCabe && mobile.semScrollHorizontal,
   'o cartao cabe em 375px sem rolagem horizontal');
ok(mobile.larguraUtil >= 85, 'ocupa praticamente a largura util: ' + mobile.larguraUtil + '%');
ok(mobile.botaoVisivel && mobile.alturaBotao >= 44,
   'o botao Entrar continua acessivel e com altura de toque: ' + mobile.alturaBotao + 'px');
ok(mobile.olhoDentroDoCampo && mobile.espacoParaTexto > 200,
   'o botao do olho nao come o campo de senha: sobram ' + mobile.espacoParaTexto + 'px de texto');
ok(mobile.alvoOlho >= 32, 'o alvo de toque do olho tem ' + mobile.alvoOlho + 'px');

for (const largura of [768, 1366, 1920]) {
  await p.setViewport({ width: largura, height: 900 });
  await new Promise(r => setTimeout(r, 120));
  const r = await p.evaluate(() => {
    const c = document.querySelector('.login-cartao').getBoundingClientRect();
    return { cabe: c.left >= 0 && c.right <= window.innerWidth && c.top >= 0,
             semScroll: document.documentElement.scrollWidth <= window.innerWidth };
  });
  ok(r.cabe && r.semScroll, 'em ' + largura + 'px o cartao cabe inteiro e nao estoura');
}
await p.setViewport({ width: 1366, height: 900 });

/* ==================================================================== */
console.log('\n  N — NENHUMA TELA CLINICA FOI ALTERADA\n');
/* ==================================================================== */

const app = await p.evaluate(async () => {
  window.LoginView.abrirApp();
  await new Promise(r => setTimeout(r, 200));
  const secoes = [...document.querySelectorAll('.secao')].map(s => s.id);
  const navs = [...document.querySelectorAll('.nav-item')].map(b => b.dataset.secao);
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  const holoscope = document.getElementById('secao-holoscope').classList.contains('ativa');
  document.querySelector('.nav-item[data-secao="holoscan"]').click();
  const holoscan = document.getElementById('secao-holoscan').classList.contains('ativa');
  return {
    telaFechada: document.getElementById('tela-login').hidden,
    appLiberado: !document.getElementById('app').getAttribute('aria-hidden'),
    secoes, navs, holoscope, holoscan,
    // a camada de entrada nao pode ter virado uma secao do app
    loginNaoEhSecao: !secoes.includes('tela-login') && !navs.includes('login'),
  };
});
/* Lista nominal, nao contagem: um numero certo com a secao errada passaria. */
const SECOES = ['secao-dashboard', 'secao-holoscope', 'secao-holoscan', 'secao-pacientes',
                'secao-consultas', 'secao-agenda', 'secao-documentos', 'secao-perfil',
                'secao-corpo', 'secao-mente', 'secao-espirito'];
const MENU = ['dashboard', 'pacientes', 'consultas', 'agenda', 'documentos',
              'holoscope', 'holoscan', 'corpo', 'mente', 'espirito', 'perfil'];
const faltando = SECOES.filter(s => !app.secoes.includes(s));
const sobrando = app.secoes.filter(s => !SECOES.includes(s));

ok(app.telaFechada && app.appLiberado, 'a saida de desenvolvimento descobre o app');
ok(faltando.length === 0 && sobrando.length === 0,
   'as ' + SECOES.length + ' secoes clinicas continuam exatamente as mesmas' +
   (faltando.length ? ' | sumiu: ' + faltando.join(', ') : '') +
   (sobrando.length ? ' | apareceu: ' + sobrando.join(', ') : ''));
ok(JSON.stringify(app.navs) === JSON.stringify(MENU),
   'o menu continua com os mesmos ' + MENU.length + ' itens, na mesma ordem: ' + app.navs.join(', '));
ok(app.holoscope && app.holoscan, 'HOLOSCOPE e HOLOSCAN continuam abrindo pelo menu');
ok(app.loginNaoEhSecao, 'a tela de entrada nao virou secao nem item de menu');

await nav.close();

/* ==================================================================== */
console.log('\n  O — O ATALHO DE DESENVOLVIMENTO SO EXISTE EM LOCALHOST\n');
/* ==================================================================== */

// --host-resolver-rules mapeia o hostname REAL de producao para o servidor
// local: location.hostname vira "holohacking.com.br" de verdade — nao um
// mock de string, o proprio navegador resolve assim. E o teste mais real
// que da para fazer sem ter feito o deploy ainda.
const navProd = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--hide-scrollbars', '--host-resolver-rules=MAP holohacking.com.br 127.0.0.1']
});
const pProd = await navProd.newPage();
const ruimProd = []; pProd.on('pageerror', e => ruimProd.push(e.message));
await pProd.goto('http://holohacking.com.br:5500/', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 300));

const antesDeForcar = await pProd.evaluate(() => ({
  hostname: location.hostname,
  blocoExiste: !!document.querySelector('.login-dev'),
  blocoVisivel: !!document.querySelector('.login-dev') && !document.querySelector('.login-dev').hidden,
}));
ok(antesDeForcar.hostname === 'holohacking.com.br', 'o teste roda mesmo contra o hostname real: ' + antesDeForcar.hostname);
ok(antesDeForcar.blocoExiste && !antesDeForcar.blocoVisivel,
   'o bloco do atalho fica escondido (hidden) fora de localhost');

// Simula alguem reabrindo o bloco pelo devtools e clicando mesmo assim — a
// defesa que importa de verdade nao e o CSS, e o clique recusar.
const depoisDeForcar = await pProd.evaluate(() => {
  var bloco = document.querySelector('.login-dev');
  if (bloco) bloco.hidden = false;
  var botao = document.getElementById('saida-dev');
  if (botao) botao.click();
  return {
    telaAindaAberta: !document.getElementById('tela-login').hidden,
    appAindaEscondido: document.getElementById('app').getAttribute('aria-hidden') === 'true',
  };
});
ok(depoisDeForcar.telaAindaAberta && depoisDeForcar.appAindaEscondido,
   'mesmo reexibido via devtools e clicado, o app NAO libera fora de localhost');
ok(ruimProd.length === 0, 'sem erro de JS ao carregar com o hostname de producao' + (ruimProd.length ? ': ' + ruimProd[0] : ''));

await navProd.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
