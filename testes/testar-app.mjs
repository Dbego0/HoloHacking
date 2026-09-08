/**
 * Roda o app num DOM de verdade e executa o fluxo da demo:
 * abrir ferramenta -> preencher -> salvar -> ver o selo mudar -> reabrir.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';

const RAIZ = 'C:/Users/Equipe Rome/holos-app';
const erros = [];

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => erros.push('DOM: ' + e.message));
vc.on('error', (...a) => erros.push('console.error: ' + a.join(' ')));

const html = readFileSync(RAIZ + '/index.html', 'utf8')
  // o CDN do supabase nao carrega aqui; um duble basta para o app iniciar
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/,
    '<script>' +
    'var _c=new Proxy(function(){},{' +
    '  get:function(t,p){ if(p==="then") return function(r){ r({data:[],error:null}); };' +
    '                     return function(){ return _c; }; },' +
    '  apply:function(){ return _c; }});' +
    'window.supabase={createClient:function(){ return _c; }};' +
    'window.scrollTo=function(){};' +
    '</script>')
  .replace(/<script src="\/([^"]+)"><\/script>/g,
    (_, f) => '<script>' + readFileSync(RAIZ + '/' + f, 'utf8') + '</script>');

const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc,
                              url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
await new Promise((r) => window.addEventListener('load', r, { once: true }));

const ok = (cond, txt) => console.log((cond ? '  ok    ' : '  FALHA ') + txt);

// ---------------------------------------------------------------- marca
ok(doc.title.includes('HoloHacking'), 'titulo da aba: ' + doc.title);
ok(doc.querySelector('.sidebar-marca .nome')?.textContent.includes('HoloHacking'),
   'marca na sidebar');
ok(doc.querySelectorAll('#logo-simbolo path').length > 10,
   'logo com ' + doc.querySelectorAll('#logo-simbolo path').length + ' tracos');
ok(!!doc.querySelector('.marca-hero'), 'logo no dashboard');

// ------------------------------------------------------------ ferramentas
const cards = doc.querySelectorAll('[data-ferramenta]');
ok(cards.length === 27, cards.length + ' ferramentas do catalogo na tela');
ok(doc.body.innerHTML.indexOf('Em breve') === -1, 'nenhuma "Em breve" sobrou');

// abrir uma
const alvo = doc.querySelector('[data-ferramenta="gatilhos_respostas"]');
alvo.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const vista = doc.getElementById('vista-gen-mente');
ok(!vista.classList.contains('hidden'), 'a ficha abriu');
ok(vista.querySelectorAll('.grupo').length === 9, 'renderizou 9 campos');
ok(doc.querySelector('#secao-mente .galeria-ferramentas').classList.contains('hidden'),
   'a galeria sumiu por tras');

// preencher e salvar
vista.querySelector('#campo-gatilho1').value = 'Briga em casa';
vista.querySelector('[data-acao="salvar"]')
     .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(vista.querySelector('[data-papel="aviso"]').textContent === 'Salvo.', 'avisou que salvou');
ok(alvo.querySelector('.ferr-status').textContent === 'Preenchida', 'o selo virou Preenchida');

// voltar e reabrir: o texto tem que estar la
vista.querySelector('.btn-voltar').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(vista.classList.contains('hidden'), 'voltou para a galeria');
alvo.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(doc.getElementById('vista-gen-mente').querySelector('#campo-gatilho1').value === 'Briga em casa',
   'o que foi digitado voltou');

// --------------------------------------------------- tipos de campo dificeis
const roda = doc.querySelector('[data-ferramenta="roda_vida"]');
roda.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const v2 = doc.getElementById('vista-gen-espirito');
ok(v2.querySelectorAll('input[type="range"]').length === 8, 'Roda da Vida: 8 reguas');
const r = v2.querySelector('#campo-saude');
r.value = '9'; r.dispatchEvent(new window.Event('input', { bubbles: true }));
ok(v2.querySelector('output[data-para="campo-saude"]').textContent === '9',
   'a regua move o numero ao lado');

const diario = doc.querySelector('[data-ferramenta="diario_emocoes"]');
diario.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const v3 = doc.getElementById('vista-gen-mente');
const botao = v3.querySelector('.grupo-opcoes .btn-opcao');
botao.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(botao.classList.contains('marcado'), 'botao de escolha unica marca');

// --------------------------------------------------------- o que ja existia
for (const [nome, sel] of [['OQ3', '[data-vista="vista-oq3"]'],
                           ['PQQ', '[data-vista="vista-pqq"]'],
                           ['Mapa do Proposito', '[data-vista="vista-mapa"]']]) {
  const c = doc.querySelector(sel);
  c.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok(!doc.getElementById(c.dataset.vista).classList.contains('hidden'), nome + ' abre');
}

// navegacao principal
for (const b of doc.querySelectorAll('.nav-item')) {
  b.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}
ok(doc.querySelectorAll('.secao.ativa').length === 1, 'navegacao do menu funciona');

console.log('\n' + (erros.length ? 'ERROS:\n' + erros.join('\n') : 'nenhum erro de JS'));
