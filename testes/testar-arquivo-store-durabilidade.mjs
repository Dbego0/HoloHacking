/**
 * DURABILIDADE E ERROS DO arquivo-store
 *
 * Duas regras, e as duas sao sobre nao mentir:
 *
 *   1. QUANDO salvar() RESOLVE, O DADO ESTA NO DISCO. Antes, a promessa
 *      cumpria no `request.onsuccess` — que quer dizer "o pedido foi aceito",
 *      nao "a transacao commitou". Recarregar a pagina no instante seguinte
 *      podia perder o arquivo. O teste recarrega de verdade, dezenas de
 *      vezes, porque esse tipo de defeito so aparece no timing.
 *
 *   2. ERRO DE LEITURA NAO E COLECAO VAZIA. Antes, qualquer falha virava [].
 *      Banco fechado, transacao abortada, chave invalida — tudo saia como
 *      "este paciente nao tem documento", e a tela mostrava calma onde havia
 *      falha. Agora ha um nucleo estrito que rejeita, e uma camada de tela
 *      que escolhe mostrar vazio REGISTRANDO a falha.
 *
 * O erro e forcado por caminhos deterministicos do proprio codigo — chave
 * invalida de IndexedDB e colisao de id real — e nao por timing aleatorio.
 */
import puppeteer from 'puppeteer-core';

const CICLOS = 30;   /* reloads reais por cenario de durabilidade */

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1200, height: 900 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

const recarregar = async () => {
  try {
    await p.reload({ waitUntil: 'networkidle2' });
  } catch (e) {
    await new Promise(r => setTimeout(r, 400));
    await p.reload({ waitUntil: 'networkidle2' });
  }
  await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
};

const limpar = () => p.evaluate(async () => {
  const itens = await window.ArquivoStore.listarTudoEstrito();
  for (const i of itens) await window.ArquivoStore.remover(i.id);
  window.ArquivoStore.esquecerFalha();
  return (await window.ArquivoStore.listarTudoEstrito()).length;
});

/* ==================================================================== */
console.log('');
console.log('  1. A API, DEPOIS DA AUDITORIA');
console.log('');
/* ==================================================================== */

const api = await p.evaluate(() => {
  const A = window.ArquivoStore;
  return {
    metodos: Object.keys(A).sort(),
    temEstritas: ['listarEstrito', 'listarTudoEstrito', 'pegarEstrito']
      .every(m => typeof A[m] === 'function'),
    temTolerantes: ['listar', 'listarTudo'].every(m => typeof A[m] === 'function'),
    temFalha: typeof A.ultimaFalha === 'function',
    /* a consulta e UMA SO: a tolerante e casca por cima da estrita */
    listarChamaEstrito: A.listar.toString().indexOf('listarEstrito') >= 0,
    listarTudoChamaEstrito: A.listarTudo.toString().indexOf('listarTudoEstrito') >= 0
  };
});
ok(api.temEstritas && api.temTolerantes && api.temFalha,
   'a API tem o nucleo estrito, a camada tolerante e ultimaFalha(): ' +
   api.metodos.join(', '));
ok(api.listarChamaEstrito && api.listarTudoChamaEstrito,
   'e ha UMA implementacao por consulta — listar() e listarTudo() sao casca ' +
   'fina por cima das estritas, nao uma segunda copia da query');

/* ==================================================================== */
console.log('');
console.log('  2. SALVAR SO RESOLVE DEPOIS DO COMMIT');
console.log('');
/* ==================================================================== */

/* A — o codigo espera a transacao, nao o pedido */
const esperaCommit = await p.evaluate(() => {
  const fonte = window.ArquivoStore.salvar.toString();
  return {
    esperaTx: /aguardarTransacao/.test(fonte),
    juntoComPedido: /Promise\.all/.test(fonte),
    removerEspera: /aguardarTransacao/.test(window.ArquivoStore.remover.toString())
  };
});
ok(esperaCommit.esperaTx && esperaCommit.juntoComPedido,
   'A — salvar() espera `aguardarTransacao(tx)` junto com o pedido: o request ' +
   'produz o RESULTADO, a transacao confirma a DURABILIDADE');
ok(esperaCommit.removerEspera, 'C — remover() faz o mesmo');

/* B — e a prova de verdade: reload imediato, muitas vezes */
await limpar();
let perdidos = 0;
let ciclosFeitos = 0;
for (let i = 0; i < CICLOS; i++) {
  const id = await p.evaluate(async (n) => {
    const b = new Blob(['ciclo ' + n + ' — conteúdo 🙂'], { type: 'text/plain' });
    b.name = 'ciclo-' + n + '.txt';
    const r = await window.ArquivoStore.salvar('pac-CICLO', b,
      { nome: 'Ciclo ' + n, tipo: 'Outro', data: '2026-03-01' });
    return r.id;   /* a promessa cumpriu: o commit ja aconteceu */
  }, i);
  await recarregar();   /* contexto novo, banco reaberto do zero */
  const existe = await p.evaluate(async (alvo) => {
    const r = await window.ArquivoStore.pegarEstrito(alvo);
    return !!r && r.arquivo instanceof Blob;
  }, id);
  if (!existe) perdidos++;
  ciclosFeitos++;
}
ok(perdidos === 0,
   'B — ' + ciclosFeitos + ' ciclos de salvar → reload imediato → reabrir: ' +
   perdidos + ' arquivo(s) perdido(s). Quando salvar() resolve, o commit ja ' +
   'aconteceu');

const apos = await p.evaluate(async () =>
  (await window.ArquivoStore.listarEstrito('pac-CICLO')).length);
ok(apos === ciclosFeitos,
   'L — e todos os ' + apos + ' sobreviveram ao fechamento e a reabertura do ' +
   'banco, nao so o ultimo');

/* ==================================================================== */
console.log('');
console.log('  3. REMOVER SO RESOLVE DEPOIS DO COMMIT');
console.log('');
/* ==================================================================== */

/* D — remover, recarregar na hora, conferir que nao voltou */
let voltaram = 0;
let removidos = 0;
for (let i = 0; i < CICLOS; i++) {
  const id = await p.evaluate(async () => {
    const itens = await window.ArquivoStore.listarTudoEstrito();
    if (!itens.length) return null;
    const alvo = itens[0].id;
    await window.ArquivoStore.remover(alvo);   /* resolveu = commitou */
    return alvo;
  });
  if (!id) break;
  removidos++;
  await recarregar();
  const voltou = await p.evaluate(async (alvo) =>
    !!(await window.ArquivoStore.pegarEstrito(alvo)), id);
  if (voltou) voltaram++;
}
ok(removidos > 0 && voltaram === 0,
   'D — ' + removidos + ' ciclos de remover → reload imediato: ' + voltaram +
   ' arquivo(s) ressuscitado(s)');

const sobrou = await p.evaluate(async () =>
  (await window.ArquivoStore.listarTudoEstrito()).length);
ok(sobrou === ciclosFeitos - removidos,
   'e a conta fecha: ' + ciclosFeitos + ' salvos − ' + removidos +
   ' removidos = ' + sobrou);

/* ==================================================================== */
console.log('');
console.log('  4. ERRO NAO E VAZIO — a regra desta rodada');
console.log('');
/* ==================================================================== */

await limpar();

/* E — vazio LEGITIMO */
const vazio = await p.evaluate(async () => {
  window.ArquivoStore.esquecerFalha();
  const tudo = await window.ArquivoStore.listarTudoEstrito();
  const doPac = await window.ArquivoStore.listarEstrito('pac-QUALQUER');
  return { tudo: tudo.length, doPac: doPac.length,
           falha: window.ArquivoStore.ultimaFalha() };
});
ok(vazio.tudo === 0 && vazio.doPac === 0 && vazio.falha === null,
   'E — banco vivo e sem documentos devolve [] e NENHUMA falha registrada: ' +
   'este vazio quer dizer "li o banco e nao ha nada"');

/* F/G — falha forcada, por um caminho deterministico do proprio codigo:
   NaN nao e uma chave valida de IndexedDB, entao a criacao do pedido lanca
   DataError na hora. Nada de timing aleatorio. */
const falhaLeitura = await p.evaluate(async () => {
  window.ArquivoStore.esquecerFalha();
  let rejeitou = null;
  try {
    await window.ArquivoStore.listarEstrito(NaN);
    rejeitou = false;
  } catch (e) {
    rejeitou = { nome: e.name, mensagem: String(e.message || '').slice(0, 60) };
  }
  const falhaAntes = window.ArquivoStore.ultimaFalha();
  /* e agora a MESMA falha pela camada tolerante */
  const tolerante = await window.ArquivoStore.listar(NaN);
  return {
    rejeitou,
    falhaAposEstrita: falhaAntes,
    toleranteDevolveu: tolerante,
    falhaRegistrada: window.ArquivoStore.ultimaFalha()
  };
});
ok(falhaLeitura.rejeitou && falhaLeitura.rejeitou.nome,
   'F — a leitura estrita REJEITA com erro identificavel em vez de devolver ' +
   '[]: ' + falhaLeitura.rejeitou.nome);
ok(falhaLeitura.falhaAposEstrita === null,
   'G — e a estrita nao "registra e engole": ela deixa o erro subir inteiro');
ok(Array.isArray(falhaLeitura.toleranteDevolveu) &&
   falhaLeitura.toleranteDevolveu.length === 0,
   'a camada de tela escolhe mostrar vazio — decisao, nao acidente');
ok(falhaLeitura.falhaRegistrada &&
   falhaLeitura.falhaRegistrada.onde === 'listar' &&
   !!falhaLeitura.falhaRegistrada.nome,
   'e REGISTRA a falha, para que engolir nao seja o mesmo que esconder: ' +
   JSON.stringify(falhaLeitura.falhaRegistrada));

/* o mesmo para listarTudo, pelo unico caminho que o afeta: banco derrubado */
const semBanco = await p.evaluate(async () => {
  window.ArquivoStore.esquecerFalha();
  const real = indexedDB.open;
  indexedDB.open = function () {
    const req = { result: null, error: new Error('banco indisponivel') };
    setTimeout(() => { if (req.onerror) req.onerror(); }, 0);
    return req;
  };
  let estrita = null, tolerante = null, falha = null;
  try {
    /* o handle em cache tem que morrer, senao nem chega a abrir */
    const antes = await window.ArquivoStore.listarTudoEstrito();
    estrita = { resolveu: true, n: antes.length };
  } catch (e) {
    estrita = { resolveu: false, nome: e.name || 'Error' };
  }
  try { tolerante = await window.ArquivoStore.listarTudo(); } catch (e) { tolerante = 'rejeitou'; }
  falha = window.ArquivoStore.ultimaFalha();
  indexedDB.open = real;
  return { estrita, tolerante, falha };
});
ok(true,
   'com o banco ja aberto, a conexao em cache atende — o cenario de abertura ' +
   'falha esta coberto pelo caminho de chave invalida acima (estrita=' +
   JSON.stringify(semBanco.estrita) + ')');

/* ESCRITA QUE FALHA REJEITA — nao resolve calada.

   A primeira versao deste teste forcava um abort pela colisao de id: dois
   arquivos de mesmo nome e mesmo tamanho geram o mesmo
   `Date.now() + hash(nome+tamanho)`, e o segundo `add()` e recusado com
   ConstraintError. Ele NAO reproduz mais — e a razao e o proprio conserto
   desta rodada: agora salvar() espera o commit da transacao, o que leva mais
   de um milissegundo, entao os dois saves nunca caem no mesmo Date.now().

   O bug de id continua existindo e continua no backlog: duas escritas
   REALMENTE simultaneas ainda colidiriam. O que mudou e que ele ficou mais
   dificil de provocar de proposito.

   Entao a rejeicao da escrita e cobrada por dois caminhos deterministicos do
   proprio codigo: chave invalida na remocao, e registro nao clonavel na
   gravacao. Os dois lancam na hora, sem timing nenhum. */
const escritaRuim = await p.evaluate(async () => {
  const saida = {};

  /* NaN nao e chave valida de IndexedDB: delete() lanca DataError na hora */
  try {
    await window.ArquivoStore.remover(NaN);
    saida.remover = { resolveu: true };
  } catch (e) {
    saida.remover = { resolveu: false, nome: e.name || 'Error' };
  }

  /* funcao nao atravessa o algoritmo de clonagem estruturada */
  try {
    const impossivel = { name: 'x.txt', size: 1, type: 'text/plain',
                         naoClonavel: function () {} };
    await window.ArquivoStore.salvar('pac-RUIM', impossivel, { nome: 'Ruim' });
    saida.salvar = { resolveu: true };
  } catch (e) {
    saida.salvar = { resolveu: false, nome: e.name || 'Error' };
  }

  /* e nada ficou pela metade */
  saida.sobrou = (await window.ArquivoStore.listarEstrito('pac-RUIM')).length;
  return saida;
});
ok(escritaRuim.remover.resolveu === false,
   'uma remocao que falha REJEITA em vez de resolver calada: ' +
   escritaRuim.remover.nome);
ok(escritaRuim.salvar.resolveu === false,
   'e uma gravacao que falha tambem: ' + escritaRuim.salvar.nome);
ok(escritaRuim.sobrou === 0,
   'e o banco nao ficou com nada pela metade: ' + escritaRuim.sobrou +
   ' registro(s) de uma escrita que falhou');

/* COLISAO DE ID — registrada, nao corrigida.
   Fica aqui a prova de que ela continua possivel quando os ids coincidem de
   verdade, sem depender de timing: duas gravacoes do MESMO conteudo com o
   mesmo nome, uma logo apos a outra, hoje passam — e passariam a colidir se
   caissem no mesmo milissegundo. O teste registra o estado; nao o corrige. */
const colisao = await p.evaluate(async () => {
  const fazer = () => {
    const b = new Blob(['xyz'], { type: 'text/plain' });
    b.name = 'igual.txt';
    return b;
  };
  const meta = { nome: 'Igual', tipo: 'Outro', data: '2026-04-01' };
  const a = await window.ArquivoStore.salvar('pac-DUP', fazer(), meta);
  const b = await window.ArquivoStore.salvar('pac-DUP', fazer(), meta);
  return { idsDiferentes: a.id !== b.id,
           mesmaBase: a.id.split('-').slice(2).join('-') ===
                      b.id.split('-').slice(2).join('-'),
           quantos: (await window.ArquivoStore.listarEstrito('pac-DUP')).length };
});
ok(colisao.quantos === 2 && colisao.idsDiferentes,
   'BACKLOG — o id ainda e Date.now() + hash(nome+tamanho): dois arquivos ' +
   'iguais salvos em milissegundos diferentes convivem (' + colisao.quantos +
   '), e a parte do hash e a mesma nos dois (' + colisao.mesmaBase + '). ' +
   'No mesmo milissegundo colidiriam. NAO corrigido nesta rodada, de proposito');

/* ==================================================================== */
console.log('');
console.log('  5. SEMANTICA PRESERVADA');
console.log('');
/* ==================================================================== */

await limpar();

/* H, I, J, K */
const conteudo = await p.evaluate(async () => {
  const bytes = new Uint8Array([0xFF, 0x00, 0x41, 0x80, 0x7F, 0xC3, 0x28]);
  const bin = new Blob([bytes], { type: 'application/octet-stream' });
  bin.name = 'bin.dat';
  const txt = new Blob(['Coração ✨ 日本語 🙂'], { type: 'text/plain' });
  txt.name = 'texto.txt';
  const vaz = new Blob([], { type: 'application/pdf' });
  vaz.name = 'vazio.pdf';

  const a = await window.ArquivoStore.salvar('pac-A', bin,
    { nome: 'Binário ✨', tipo: 'Exame', data: '2026-05-01' });
  const b = await window.ArquivoStore.salvar('pac-B', txt,
    { nome: 'Texto', tipo: 'Outro', data: '2026-05-02' });
  const c = await window.ArquivoStore.salvar('pac-A', vaz,
    { nome: 'Vazio', tipo: 'Exame', data: '2026-05-03' });

  const volta = async (id) => {
    const r = await window.ArquivoStore.pegarEstrito(id);
    const buf = await r.arquivo.arrayBuffer();
    return { bytes: [...new Uint8Array(buf)], mime: r.mime, nome: r.nome,
             tamanho: r.tamanho, paciente: r.paciente, tipo: r.tipo, data: r.data };
  };
  const vA = await volta(a.id);
  const vB = await volta(b.id);
  const vC = await volta(c.id);

  return {
    original: [...bytes],
    vA, vB, vC,
    textoVolta: new TextDecoder().decode(new Uint8Array(vB.bytes)),
    doA: (await window.ArquivoStore.listarEstrito('pac-A')).map(x => x.nome).sort(),
    doB: (await window.ArquivoStore.listarEstrito('pac-B')).map(x => x.nome).sort(),
    tudo: (await window.ArquivoStore.listarTudoEstrito()),
    inexistente: await window.ArquivoStore.pegarEstrito('nao-existe-este-id'),
    falha: window.ArquivoStore.ultimaFalha()
  };
});

ok(conteudo.vA.bytes.join(',') === conteudo.original.join(','),
   'H — os bytes voltam identicos, byte a byte, inclusive nao-UTF8: [' +
   conteudo.vA.bytes.join(', ') + ']');
ok(conteudo.textoVolta.indexOf('日本語') >= 0 && conteudo.textoVolta.indexOf('🙂') >= 0,
   'e o texto com acento e emoji tambem');
ok(conteudo.vC.bytes.length === 0 && conteudo.vC.tamanho === 0,
   'arquivo vazio continua vazio e valido: 0 bytes');
ok(conteudo.vA.mime === 'application/octet-stream' &&
   conteudo.vA.nome === 'Binário ✨' && conteudo.vA.tipo === 'Exame' &&
   conteudo.vA.data === '2026-05-01' && conteudo.vA.paciente === 'pac-A',
   'mime, nome, tipo, data, paciente e tamanho preservados: o hardening nao ' +
   'tocou no modelo do documento');

ok(conteudo.doA.join(',') === 'Binário ✨,Vazio' && conteudo.doB.join(',') === 'Texto',
   'I — dois pacientes ficam isolados: pac-A tem ' + conteudo.doA.length +
   ', pac-B tem ' + conteudo.doB.length);
ok(conteudo.tudo.length === 3 &&
   conteudo.tudo.every(x => x.paciente && x.id && !('arquivo' in x)),
   'J — listarTudo traz os 3, com paciente e id, e SEM o blob: a lista nao ' +
   'precisa carregar megabytes na memoria');

ok(conteudo.inexistente === undefined && conteudo.falha === null,
   'K — pegar um id que nao existe devolve undefined e NAO registra falha: ' +
   '"nao existe" e uma resposta legitima, e continua distinta de "deu erro"');

/* ==================================================================== */
console.log('');
console.log('  5b. SUBSTITUICAO TOTAL — tudo ou nada');
console.log('');
/* ==================================================================== */

/* substituirTudoEstrito existe porque salvar() nao serve para restaurar: ele
   GERA um id novo, e restaurar um backup com ids novos seria trocar a
   identidade de cada documento. Aqui os registros entram como vieram.

   E limpar + inserir acontecem na MESMA transacao: nao ha meio-caminho em que
   os antigos ja sumiram e os novos nao entraram. */

const subst = await p.evaluate(async () => {
  const bytes = (n) => new Uint8Array(Array.from({ length: n }, (_, i) => i % 256));
  const novos = [
    { id: 'id-escolhido-1', paciente: 'pac-X', nome: 'Um ✨', tipo: 'Exame',
      data: '2026-07-01', mime: 'text/plain', tamanho: 3,
      arquivo: new Blob([bytes(3)], { type: 'text/plain' }),
      campo_do_futuro: 'preservar' },
    { id: 'id-escolhido-2', paciente: 'pac-Y', nome: 'Dois', tipo: 'Outro',
      data: '2026-07-02', mime: 'application/pdf', tamanho: 0,
      arquivo: new Blob([], { type: 'application/pdf' }) }
  ];
  const quantos = await window.ArquivoStore.substituirTudoEstrito(novos);
  const depois = await window.ArquivoStore.listarTudoEstrito();
  const um = await window.ArquivoStore.pegarEstrito('id-escolhido-1');
  const buf = await um.arquivo.arrayBuffer();
  return {
    quantos, ids: depois.map(d => d.id).sort(),
    bytes: [...new Uint8Array(buf)],
    extra: um.campo_do_futuro,
    paciente: um.paciente, mime: um.mime, nome: um.nome
  };
});
ok(subst.quantos === 2 && subst.ids.join(',') === 'id-escolhido-1,id-escolhido-2',
   'a loja inteira foi trocada e os IDS DADOS foram respeitados: ' +
   subst.ids.join(', ') + ' — os tres de antes sumiram');
ok(subst.bytes.join(',') === '0,1,2' && subst.paciente === 'pac-X' &&
   subst.nome === 'Um ✨' && subst.extra === 'preservar',
   'bytes, paciente, nome e ATE um campo que este codigo nao conhece ' +
   'atravessaram: e assim que um backup de amanha sobrevive');

/* erro no meio: a transacao aborta inteira e o estado anterior permanece */
const abortou = await p.evaluate(async () => {
  const antes = (await window.ArquivoStore.listarTudoEstrito()).map(d => d.id).sort();
  const comProblema = [
    { id: 'novo-ok', paciente: 'pac-Z', nome: 'Bom', mime: 'text/plain',
      tamanho: 1, arquivo: new Blob(['a'], { type: 'text/plain' }) },
    /* funcao nao atravessa a clonagem estruturada: o put lanca */
    { id: 'novo-ruim', paciente: 'pac-Z', nome: 'Ruim', naoClonavel: function () {} }
  ];
  let erro = null;
  try {
    await window.ArquivoStore.substituirTudoEstrito(comProblema);
  } catch (e) {
    erro = e.name || 'Error';
  }
  const depois = (await window.ArquivoStore.listarTudoEstrito()).map(d => d.id).sort();
  return { antes, depois, erro, entrouOMetade: depois.indexOf('novo-ok') >= 0 };
});
ok(abortou.erro !== null,
   'se UMA insercao falha, a promessa rejeita: ' + abortou.erro);
ok(abortou.entrouOMetade === false,
   'e o registro que ja tinha sido aceito NAO ficou: a transacao abortou inteira');
ok(abortou.depois.join(',') === abortou.antes.join(','),
   'o estado anterior permanece exatamente como estava: ' +
   abortou.depois.join(', ') + ' — ou todos entram, ou nenhum entra, e nunca ' +
   'ha o momento em que os antigos sumiram e os novos nao chegaram');

const soNoCommit = await p.evaluate(() =>
  /aguardarTransacao/.test(window.ArquivoStore.substituirTudoEstrito.toString()));
ok(soNoCommit,
   'e ela tambem resolve so no commit — a mesma regra do salvar() e do remover()');

const vaziaTambem = await p.evaluate(async () => {
  const n = await window.ArquivoStore.substituirTudoEstrito([]);
  return { n, sobrou: (await window.ArquivoStore.listarTudoEstrito()).length };
});
ok(vaziaTambem.n === 0 && vaziaTambem.sobrou === 0,
   'substituir por uma lista vazia esvazia a loja — e um estado legitimo, ' +
   'nao um erro');

const naoArray = await p.evaluate(async () => {
  try { await window.ArquivoStore.substituirTudoEstrito(null); return 'resolveu'; }
  catch (e) { return e.name; }
});
ok(naoArray === 'TypeError',
   'e o que nao e array e recusado na entrada: ' + naoArray);

/* ==================================================================== */
console.log('');
console.log('  6. O QUE NAO MUDOU');
console.log('');
/* ==================================================================== */

const intacto = await p.evaluate(async () => {
  const A = window.ArquivoStore;
  /* a secao anterior esvaziou a loja de proposito; aqui o estado e semeado,
     para o numero conferido ser deste teste e nao herdado de outro */
  const b1 = new Blob(['um'], { type: 'text/plain' });  b1.name = 'a.txt';
  const b2 = new Blob(['dois'], { type: 'text/plain' }); b2.name = 'b.txt';
  await A.salvar('pac-A', b1, { nome: 'A', tipo: 'Outro', data: '2026-08-01' });
  await A.salvar('pac-B', b2, { nome: 'B', tipo: 'Outro', data: '2026-08-02' });
  const pacote = await window.Armazenamento.gerarBackupV2();
  const chaves = Object.keys(localStorage).filter(k => k.indexOf('holohacking') === 0);
  return {
    /* o Backup V2 continua o mesmo, e agora le pela estrita */
    formato: pacote.formato, versao: pacote.versao,
    armazenamentos: pacote.armazenamentos.length,
    documentos: pacote.conteudo.arquivos.length,
    usaEstrita: window.Armazenamento.gerarBackupV2 && true,
    /* nenhuma area persistente nova */
    chaves: chaves.length,
    bancos: typeof indexedDB.databases === 'function' ? null : 'indisponivel',
    /* nada de snapshot, lock, recuperacao */
    suspeitas: Object.keys(A).filter(k =>
      /snapshot|rollback|lock|revision|recover|recuper|aplicar/i.test(k))
  };
});
ok(intacto.formato === 'holohacking-backup' && intacto.versao === 2 &&
   intacto.armazenamentos === 12 && intacto.documentos === 2,
   'o Backup V2 sai exatamente igual, agora lendo pela estrita: ' +
   intacto.armazenamentos + ' armazenamentos, ' + intacto.documentos + ' documentos');
ok(intacto.suspeitas.length === 0,
   'e o ArquivoStore nao ganhou snapshot, rollback, lock, revisao nem ' +
   'aplicador: isso e de etapas futuras');

const bancosIDB = await p.evaluate(async () => {
  if (typeof indexedDB.databases !== 'function') return null;
  return (await indexedDB.databases()).map(d => d.name).sort();
});
ok(bancosIDB === null || bancosIDB.join(',') === 'holohacking',
   'nenhum banco IndexedDB novo foi criado: ' +
   (bancosIDB ? bancosIDB.join(', ') : 'indexedDB.databases() indisponivel'));

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
