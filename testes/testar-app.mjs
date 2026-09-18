/**
 * Roda o app num DOM de verdade e executa o fluxo da demo:
 * abrir ferramenta -> preencher -> salvar -> ver o selo mudar -> reabrir.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const erros = [];

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => erros.push('DOM: ' + e.message));
vc.on('error', (...a) => erros.push('console.error: ' + a.join(' ')));

const html = readFileSync(RAIZ + '/index.html', 'utf8')
  // o CDN do supabase nao carrega aqui; um duble basta para o app iniciar.
  // .auth precisa de forma propria (nao so a cadeia .from().select()...):
  // login.js chama getSession/onAuthStateChange/signInWithPassword/signOut
  // de verdade no carregamento da pagina, mesmo sem ninguem logar aqui.
  .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]*"><\/script>/,
    '<script>' +
    'var _c=new Proxy(function(){},{' +
    '  get:function(t,p){ if(p==="then") return function(r){ r({data:[],error:null}); };' +
    '                     return function(){ return _c; }; },' +
    '  apply:function(){ return _c; }});' +
    'var _auth={' +
    '  getSession:function(){ return Promise.resolve({data:{session:null},error:null}); },' +
    '  onAuthStateChange:function(){ return {data:{subscription:{unsubscribe:function(){}}}}; },' +
    '  signInWithPassword:function(){ return Promise.resolve({data:{session:null},error:{message:"stub"}}); },' +
    '  signOut:function(){ return Promise.resolve({error:null}); }' +
    '};' +
    'window.supabase={createClient:function(){ return {from:function(){ return _c; }, auth:_auth}; }};' +
    'window.scrollTo=function(){};' +
    '</script>')
  .replace(/<script src="\/([^"]+)"><\/script>/g,
    (_, f) => '<script>' + readFileSync(RAIZ + '/' + f, 'utf8') + '</script>');

const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc,
                              url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
await new Promise((r) => window.addEventListener('load', r, { once: true }));

let falhou = false;
const ok = (cond, txt) => {
  if (!cond) falhou = true;
  console.log((cond ? '  ok    ' : '  FALHA ') + txt);
};

/* Abrir uma ferramenta cria a aplicacao antes de desenhar, entao a tela nao
   fica pronta no mesmo tique do clique. */
const respirar = () => new Promise((r) => setTimeout(r, 120));

// ---------------------------------------------------------------- marca
ok(doc.title.includes('HoloHacking'), 'titulo da aba: ' + doc.title);
ok(doc.querySelector('.sidebar-marca .nome')?.textContent.includes('HoloHacking'),
   'marca na sidebar');
ok(doc.querySelectorAll('#logo-simbolo path').length > 10,
   'logo com ' + doc.querySelectorAll('#logo-simbolo path').length + ' tracos');
ok(!!doc.querySelector('.marca-hero'), 'logo no dashboard');

// ------------------------------------------------------------ ferramentas
// A revisao clinica de Corpo/Mente/Espirito reduziu as galerias para 2+2+3
// ferramentas; OQ3/PQQ/Mapa do Proposito usam [data-vista] (tela propria),
// entao sobram 1+1+2 = 4 cards [data-ferramenta] (generico) na tela.
const cards = doc.querySelectorAll('[data-ferramenta]');
ok(cards.length === 4, cards.length + ' ferramentas do catalogo na tela');
ok(doc.body.innerHTML.indexOf('Em breve') === -1, 'nenhuma "Em breve" sobrou');

// abrir uma — gatilhos_respostas foi retirada da galeria de Mente nessa
// revisao; mapa_crencas e uma das duas que sobraram.
const alvo = doc.querySelector('[data-ferramenta="mapa_crencas"]');
alvo.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await respirar();
const vista = doc.getElementById('vista-gen-mente');
ok(!vista.classList.contains('hidden'), 'a ficha abriu');
ok(vista.querySelectorAll('.form-ferramenta .campos .grupo').length === 4,
   'renderizou 4 campos da ferramenta');
ok(doc.querySelector('#secao-mente .galeria-ferramentas').classList.contains('hidden'),
   'a galeria sumiu por tras');

// preencher e salvar
vista.querySelector('#campo-crencas').value = 'Carboidrato engorda';
vista.querySelector('[data-acao="concluir"]')
     .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await respirar();
ok(vista.querySelector('[data-papel="aviso"]').textContent === 'Aplicação concluída.',
   'avisou que concluiu');
ok(alvo.querySelector('.ferr-status').textContent === 'Concluída', 'o selo virou Concluída');

// voltar e reabrir: o texto tem que estar la
vista.querySelector('.btn-voltar').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(vista.classList.contains('hidden'), 'voltou para a galeria');
alvo.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await respirar();
ok(doc.getElementById('vista-gen-mente').querySelector('#campo-crencas').value === 'Carboidrato engorda',
   'o que foi digitado voltou');

/* Reabrir mostra a aplicacao concluida, e diz de quando ela e — sem isso
   pareceria que o formulario abriu em branco e o dado sumiu. */
ok(!!doc.querySelector('.ferr-de-quando'), 'reabrir diz de quando e a aplicacao a vista');

/* "Nova aplicacao" e que comeca outra. Ai sim a anterior vai para o historico:
   e a regra que a caixa antiga nao tinha — antes isso apagava a de antes. */
doc.querySelector('[data-acao="nova"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await respirar();
const vistaNova = doc.getElementById('vista-gen-mente');
ok(vistaNova.querySelector('#campo-crencas').value === '',
   'a aplicacao nova comeca vazia');
ok(vistaNova.querySelectorAll('.ferr-hist-item').length === 1,
   'e a anterior foi para o historico, nao para o lixo');
ok(window.DadosLocais.resumo().aplicacoes === 2,
   'duas aplicacoes guardadas: ' + window.DadosLocais.resumo().aplicacoes);

// --------------------------------------------------- tipos de campo dificeis
const roda = doc.querySelector('[data-ferramenta="roda_vida"]');
roda.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await respirar();
const v2 = doc.getElementById('vista-gen-espirito');
ok(v2.querySelectorAll('input[type="range"]').length === 8, 'Roda Holística da Vida: 8 reguas');
const r = v2.querySelector('#campo-saude');
r.value = '9'; r.dispatchEvent(new window.Event('input', { bubbles: true }));
ok(v2.querySelector('output[data-para="campo-saude"]').textContent === '9',
   'a regua move o numero ao lado');

// botao de escolha unica: diario_emocoes (removida da galeria de Mente) e
// quem tinha esse tipo de campo alcancavel antes; linha_momentum (Corpo,
// mantida) tem o mesmo tipo de campo ("opcoes") no campo estado_confirmado.
await respirar();
const momentum = doc.querySelector('[data-ferramenta="linha_momentum"]');
momentum.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await respirar();
const v3 = doc.getElementById('vista-gen-corpo');
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
process.exit(falhou ? 1 : 0);
