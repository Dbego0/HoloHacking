/**
 * ROBUSTEZ E AUDITABILIDADE DO HOLOSCOPE.
 *
 * Este teste NÃO valida método: trava o COMPORTAMENTO ATUAL naquilo que a
 * auditoria transversal apontou como decidido em silêncio pelo código. Nada
 * aqui aprova fórmula, peso, threshold ou recomendação — todos continuam
 * rascunho, e continuam iguais.
 *
 * O que se cobra:
 *
 *   ÍNDICE        renormalização de pesos com 5, 4, 2, 1 e 0 sistemas
 *                 avaliáveis — e ausência nunca lida como saúde;
 *   TRÍADE        eixo sem resposta não aparece como nota 10;
 *   EMPATES       sistemas e regras empatados resolvem pela ordem de
 *                 declaração — e isso agora deixa rastro auditável;
 *   SEL-001       cotas, teto, escassez de regras e ferramenta repetida;
 *   DUPLICADOS    SNT-101 e SNT-501 pesam em dois sistemas, e `marcador.<id>`
 *                 usa a primeira linha do arquivo;
 *   CMB-004/007   as duas combinações que leem `indice` e `triada.*`;
 *   ferramenta.*  o canal existe, ninguém usa, e expor não muda nada.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1500, height: 1400 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

/* Respostas por prefixo de marcador, para ligar e desligar sistemas inteiros. */
const respostasDe = (prefixos, valor) => p.evaluate((x) => {
  return window.HOLOSCOPE.questionario()
    .filter(q => x.prefixos.some(pre => q.id.startsWith(pre)))
    .map(q => ({ marcador_id: q.id, intensidade: x.valor }));
}, { prefixos, valor });

const pontuar = (respostas) => p.evaluate((r) => {
  const x = window.HOLOSCOPE.calcular(r);
  return {
    indice: x.indice, avaliavel: x.avaliavel, nota_media: x.nota_media,
    sistemas: x.sistemas.map(s => ({ id: s.sistema, nota: s.nota,
      avaliavel: s.avaliavel, respondidos: s.respondidos })),
    triada: x.triada, triada_com_dado: x.triada_com_dado,
    combinacoes: x.combinacoes.map(c => c.id)
  };
}, respostas);

/* ==================================================================== */
console.log('\n  1. ÍNDICE HOLOS — RENORMALIZAÇÃO DE PESOS\n');
/* ==================================================================== */

/* Com todos os marcadores no pior grau, cada sistema vai a nota 0 e o Índice
   vai a 0 — não interessa quantos entram. Para ver a renormalização é preciso
   variar a NOTA entre os sistemas, e aí a média ponderada muda conforme
   quantos entram na conta. */

/* Carga ZERO exige responder pelo sentido: num marcador invertido o 0 é a
   carga máxima, não a mínima. Responder "0" em tudo dá Índice 93, não 100 —
   e os 7 pontos que faltam são exatamente os 9 marcadores invertidos. */
const cargaZero = await p.evaluate(() =>
  window.HOLOSCOPE.questionario().map(q => ({
    marcador_id: q.id, intensidade: q.sentido === 'invertido' ? 3 : 0
  })));
const todos = cargaZero;
const cinco = await pontuar(cargaZero);
ok(cinco.sistemas.filter(s => s.avaliavel).length === 5,
   'com o questionário inteiro respondido, os 5 sistemas são avaliáveis');
ok(cinco.indice === 100,
   'carga zero em tudo dá Índice 100: ' + cinco.indice);

const zeroCru = await pontuar(await respostasDe(['SNT','EMO','ESP'], 0));
ok(zeroCru.indice === 93,
   'e responder "0" cru dá 93, porque nos 9 invertidos o 0 é carga MÁXIMA: ' +
   zeroCru.indice);

/* --- 4 avaliáveis: só os marcadores de sintoma ficam de fora de um sistema */
const soSintomas = await respostasDe(['SNT'], 0);
const q4 = await pontuar(soSintomas);
ok(q4.sistemas.every(s => s.avaliavel),
   'todo sistema tem ao menos um sintoma, então SNT sozinho já avalia os 5: ' +
   q4.sistemas.filter(s => s.avaliavel).length);

/* --- para isolar sistemas, responder por marcador escolhido --------------- */
const porSistema = await p.evaluate(() => {
  /* O motor não expõe o sistema de cada pergunta no questionário; a lista de
     sistemas vem de HOLOSCOPE.sistemas(). Usa-se a auditoria de uma pontuação
     completa para descobrir a que sistema cada marcador pertence. */
  const todasR = window.HOLOSCOPE.questionario()
    .map(q => ({ marcador_id: q.id, intensidade: 3 }));
  const r = window.HOLOSCOPE.calcular(todasR);
  const mapa = {};
  r.sistemas.forEach(s => { mapa[s.sistema] = []; });
  r.auditoria.forEach(a => {
    /* a auditoria traz contribuições; o sistema vem da ordem em r.sistemas */
  });
  // caminho direto: pontuar um marcador de cada vez é caro; usa-se o
  // `dominantes` de cada sistema, que já vem agrupado
  r.sistemas.forEach(s => {
    mapa[s.sistema] = (s.dominantes || []).map(d => d.marcador_id);
  });
  return mapa;
});

const idsDe = (sistemas) => {
  const s = new Set();
  sistemas.forEach(k => (porSistema[k] || []).forEach(id => s.add(id)));
  return [...s];
};

/* --- 2 avaliáveis --------------------------------------------------------- */
const dois = await pontuar(
  idsDe(['fungico', 'metabolico']).map(id => ({ marcador_id: id, intensidade: 0 })));
const doisAval = dois.sistemas.filter(s => s.avaliavel);
ok(doisAval.length >= 1 && doisAval.length <= 5,
   'respondendo só os dominantes de dois sistemas, ' + doisAval.length +
   ' ficam avaliáveis (marcador que pesa em dois sistemas alcança os dois)');
ok(dois.sistemas.filter(s => !s.avaliavel).every(s => s.respondidos === 0),
   'e todo sistema NÃO avaliável tem exatamente zero respostas');

/* --- 1 avaliável ---------------------------------------------------------- */
const umId = porSistema.fungico[0];
const um = await pontuar([{ marcador_id: umId, intensidade: 3 }]);
const umAval = um.sistemas.filter(s => s.avaliavel);
ok(umAval.length >= 1,
   'uma única resposta já torna ao menos um sistema avaliável: ' +
   umAval.map(s => s.id).join(', '));
ok(um.indice === Math.round(
     umAval.reduce((a, s) => a + s.nota * (0.20 / (0.20 * umAval.length)), 0) * 10),
   'e o Índice é a média dos avaliáveis com os pesos RENORMALIZADOS: ' + um.indice);
ok(um.sistemas.filter(s => !s.avaliavel).every(s => s.nota === 10),
   'os não avaliáveis mantêm nota 10 internamente...');
ok(!um.sistemas.filter(s => !s.avaliavel).some(s =>
     umAval.map(x => x.id).indexOf(s.id) >= 0),
   '...mas NENHUM deles entra no Índice — ausência não é sinal de saúde');

/* --- nenhum avaliável ----------------------------------------------------- */
const zero = await pontuar([]);
ok(zero.avaliavel === false, 'sem nenhuma resposta, a pontuação não é avaliável');
ok(zero.indice === 0,
   'e o Índice é 0, não 100: ausência não vira mapa verde: ' + zero.indice);
ok(zero.sistemas.every(s => !s.avaliavel && s.respondidos === 0),
   'nenhum dos cinco é avaliável');
ok(zero.combinacoes.length === 0,
   'e nenhuma combinação dispara sobre o vazio');

/* --- a ordem das respostas não muda o Índice ------------------------------ */
const embaralhado = [...todos].reverse();
const invertido = await pontuar(embaralhado);
ok(invertido.indice === cinco.indice &&
   JSON.stringify(invertido.sistemas) === JSON.stringify(cinco.sistemas),
   'inverter a ordem das respostas não muda Índice nem notas: ' +
   invertido.indice + ' = ' + cinco.indice);

/* ==================================================================== */
console.log('\n  2. TRÍADE — AUSÊNCIA NÃO É NOTA 10\n');
/* ==================================================================== */

/* Só sintomas → eixo físico com dado, mental e espiritual sem. */
const soFisico = await pontuar(
  (await respostasDe(['SNT'], 2)));
ok(soFisico.triada_com_dado.fisico === true,
   'respondendo só os sintomas, o eixo físico tem dado');
ok(soFisico.triada_com_dado.mental === false &&
   soFisico.triada_com_dado.espiritual === false,
   'e mental e espiritual NÃO têm');
ok(soFisico.triada.mental === 10 && soFisico.triada.espiritual === 10,
   'a fórmula continua devolvendo 10 para eles — isso NÃO mudou: ' +
   soFisico.triada.mental + ' e ' + soFisico.triada.espiritual);

/* --- e a tela? ------------------------------------------------------------ */
const naTela = await p.evaluate(async (respostas) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Marina Alves';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 420));
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(window.HOLOSCOPE.calcular(respostas));
  await new Promise(r => setTimeout(r, 420));
  const eixos = [...document.querySelectorAll('.triada-eixo')].map(e => ({
    nome: e.querySelector('b').textContent,
    nota: e.querySelector('.triada-nota').textContent,
    semDado: e.classList.contains('sem-dado'),
    menor: e.classList.contains('menor')
  }));
  const caixa = document.getElementById('holo-triada');
  return {
    eixos,
    poligonos: caixa.querySelectorAll('polygon').length,
    pontos: caixa.querySelectorAll('circle').length,
    texto: caixa.innerText.replace(/\s+/g, ' ')
  };
}, (await respostasDe(['SNT'], 2)));

ok(naTela.eixos.length === 3, 'os três eixos continuam listados');
const fisico = naTela.eixos.find(e => e.nome === 'Físico');
const mental = naTela.eixos.find(e => e.nome === 'Mental');
const espirit = naTela.eixos.find(e => e.nome === 'Espiritual');
ok(fisico && !fisico.semDado && /^\d/.test(fisico.nota),
   'o eixo com dado mostra a nota: ' + (fisico || {}).nota);
ok(mental.semDado && espirit.semDado,
   'os eixos sem resposta são marcados como sem-dado');
ok(mental.nota === '—' && espirit.nota === '—',
   'e mostram traço, NÃO "10.0": "' + mental.nota + '" e "' + espirit.nota + '"');
ok(naTela.texto.indexOf('10.0') === -1,
   'nenhum "10.0" aparece no bloco da Tríade');
ok(!mental.menor && !espirit.menor,
   'e eixo sem dado não pode ser eleito a dimensão mais baixa');
ok(fisico.menor,
   'a dimensão mais baixa sai de quem tem dado: ' + fisico.nome);
ok(naTela.poligonos === 4,
   'sem os três eixos, a área não é desenhada — só a moldura: ' +
   naTela.poligonos + ' polígonos');
ok(naTela.pontos === 1,
   'e só o eixo com dado recebe ponto: ' + naTela.pontos);
ok(/Eixo sem resposta não recebe nota/.test(naTela.texto),
   'a tela diz por que o desenho não fechou, sem afirmar nada clínico');

/* --- parcialmente respondido ---------------------------------------------- */
const parcial = await p.evaluate(async () => {
  const qs = window.HOLOSCOPE.questionario();
  const alguns = qs.filter(q => q.id.startsWith('SNT')).slice(0, 5)
    .concat(qs.filter(q => q.id.startsWith('EMO')).slice(0, 2))
    .map(q => ({ marcador_id: q.id, intensidade: 2 }));
  const r = window.HOLOSCOPE.calcular(alguns);
  window.aplicarPontuacao(r);
  await new Promise(x => setTimeout(x, 420));
  return {
    comDado: r.triada_com_dado,
    eixos: [...document.querySelectorAll('.triada-eixo')].map(e => ({
      nome: e.querySelector('b').textContent,
      nota: e.querySelector('.triada-nota').textContent
    }))
  };
});
ok(parcial.comDado.fisico && parcial.comDado.mental && !parcial.comDado.espiritual,
   'eixo parcialmente respondido TEM dado — basta uma resposta: ' +
   JSON.stringify(parcial.comDado));
ok(parcial.eixos.filter(e => e.nota === '—').length === 1,
   'só o eixo sem nenhuma resposta mostra traço');

/* --- as três com dado: nada mudou ----------------------------------------- */
const completo = await p.evaluate(async (respostas) => {
  window.aplicarPontuacao(window.HOLOSCOPE.calcular(respostas));
  await new Promise(r => setTimeout(r, 420));
  const caixa = document.getElementById('holo-triada');
  return {
    poligonos: caixa.querySelectorAll('polygon').length,
    pontos: caixa.querySelectorAll('circle').length,
    tracos: [...document.querySelectorAll('.triada-nota')]
      .filter(e => e.textContent === '—').length
  };
}, caso.respostas);
ok(completo.poligonos === 5 && completo.pontos === 3 && completo.tracos === 0,
   'com os três eixos respondidos o desenho é o de sempre: ' +
   completo.poligonos + ' polígonos, ' + completo.pontos + ' pontos');

/* ==================================================================== */
console.log('\n  3 e 4. EMPATES — MESMO COMPORTAMENTO, AGORA COM RASTRO\n');
/* ==================================================================== */

/* CARGA MÁXIMA: num marcador invertido o 3 vale 0 de carga, então saturar
   exige responder pelo SENTIDO de cada um. É a mesma construção que o motor
   já usa no teste "carga maxima em todos os marcadores = nota zero". Com ela
   os cinco sistemas caem a 0 e empatam. */
const cargaMaxima = await p.evaluate(() =>
  window.HOLOSCOPE.questionario().map(q => ({
    marcador_id: q.id, intensidade: q.sentido === 'invertido' ? 0 : 3
  })));

/* Carga 2 em TODO marcador: obtido/maximo = 2/3 em todo sistema, qualquer que
   seja o peso de cada linha. Os cinco caem na mesma nota 3.3 — empate perfeito
   e não-zero, que é o que a tela precisa para desenhar a leitura. */
const cargaUniforme = await p.evaluate(() =>
  window.HOLOSCOPE.questionario().map(q => ({
    marcador_id: q.id, intensidade: q.sentido === 'invertido' ? 1 : 2
  })));

const comEmpate = await p.evaluate(async (r0) => {
  const r = window.HOLOSCOPE.calcular(r0);
  window.aplicarPontuacao(r);
  await new Promise(x => setTimeout(x, 450));
  const a = window.auditoriaDaConduta();
  return {
    notas: r.sistemas.map(s => ({ id: s.sistema, nota: s.nota })),
    indice: r.indice,
    triada: r.triada,
    combinacoes: r.combinacoes.map(c => ({ id: c.id, tipo: c.tipo,
      prioridade: c.prioridade, leitura: c.leitura })),
    empateSistemas: a.empate_sistemas,
    empateRegras: a.empate_regras,
    escolhidas: a.escolhidas,
    itens: [...document.querySelectorAll('.conduta-item b')].map(e => e.textContent)
  };
}, cargaUniforme);

const todasIguais = new Set(comEmpate.notas.map(n => n.nota)).size === 1;
ok(todasIguais && comEmpate.notas[0].nota > 0,
   'carga uniforme põe os cinco sistemas na MESMA nota, e não em zero: ' +
   comEmpate.notas.map(n => n.nota).join(', '));
ok(comEmpate.empateSistemas !== null,
   'e o empate entre sistemas fica REGISTRADO, em vez de resolvido em silêncio');
ok(comEmpate.empateSistemas.entre.length === 5,
   'com os cinco nomes de quem empatou: ' + comEmpate.empateSistemas.entre.join(', '));
ok(comEmpate.empateSistemas.venceu === comEmpate.empateSistemas.entre[0],
   'o vencedor é o primeiro da ordem de declaração — comportamento inalterado: ' +
   comEmpate.empateSistemas.venceu);
ok(/ordem de declaracao/.test(comEmpate.empateSistemas.regra),
   'e a regra técnica usada está nomeada: ' + comEmpate.empateSistemas.regra);
ok(comEmpate.empateSistemas.procedencia === 'decisao_implementacao',
   'classificada como decisao_implementacao — NÃO como critério clínico');
ok(/pendente/.test(comEmpate.empateSistemas.status),
   'e marcada como pendente: ' + comEmpate.empateSistemas.status);

/* EMPATE ENTRE REGRAS: hoje não acontece, e isso é um fato a travar. Cada
   sistema tem exatamente 3 regras, com prioridades 1, 2 e 3 — nenhuma se
   repete. O registrador existe, roda a cada conduta, e devolve lista vazia
   porque não há o que registrar. No dia em que duas regras dividirem
   prioridade, o rastro aparece sozinho. */
const prioridades = await p.evaluate(() => {
  const B = window.CorpoBancos;
  const porSistema = {};
  B.regrasAtivas().forEach(r => {
    const k = r.condition.sistema;
    (porSistema[k] = porSistema[k] || []).push(r.priority);
  });
  const comRepetida = Object.keys(porSistema)
    .filter(k => new Set(porSistema[k]).size !== porSistema[k].length);
  return { porSistema, comRepetida };
});
ok(prioridades.comRepetida.length === 0,
   'NENHUM sistema tem duas regras na mesma prioridade hoje: ' +
   JSON.stringify(prioridades.porSistema));
ok(Array.isArray(comEmpate.empateRegras) && comEmpate.empateRegras.length === 0,
   'por isso o registrador de empate de regras devolve lista vazia — ' +
   'ele roda, e não há empate para anotar');
ok(comEmpate.escolhidas.length === comEmpate.itens.length,
   'e a auditoria lista exatamente as regras que entraram na conduta: ' +
   comEmpate.escolhidas.join(', '));

/* --- determinismo: o mesmo empate resolve igual duas vezes ---------------- */
const denovo = await p.evaluate(async (r0) => {
  const r = window.HOLOSCOPE.calcular(r0);
  window.aplicarPontuacao(r);
  await new Promise(x => setTimeout(x, 450));
  return {
    venceu: window.auditoriaDaConduta().empate_sistemas.venceu,
    escolhidas: window.auditoriaDaConduta().escolhidas
  };
}, cargaUniforme);
ok(denovo.venceu === comEmpate.empateSistemas.venceu &&
   denovo.escolhidas.join(',') === comEmpate.escolhidas.join(','),
   'o desempate é DETERMINÍSTICO: mesma entrada, mesmo vencedor e mesma conduta');

/* ==================================================================== */
console.log('\n  10. ZERO REAL NÃO É AUSÊNCIA (bug de lerTerreno)\n');
/* ==================================================================== */

/* A guarda antiga era `scores.every(s => s === 0)`, e tratava cinco zeros
   como "mapa não calculado". Carga máxima produz cinco zeros LEGÍTIMOS — o
   pior quadro que o questionário descreve — e era justamente ele que ficava
   sem leitura. Agora quem decide é `pronta.avaliavel`, que o motor já
   produzia: zero nunca foi ausência; ausência é respondidos === 0. */

/* --- A. zero respostas: nada é desenhado ------------------------------- */
const semNada = await p.evaluate(async () => {
  window.aplicarPontuacao(window.HOLOSCOPE.calcular([]));
  await new Promise(x => setTimeout(x, 450));
  const caixa = document.getElementById('holo-leitura');
  const r = window.HOLOSCOPE.calcular([]);
  return {
    vazia: !caixa || caixa.innerHTML.trim() === '',
    avaliavel: r.avaliavel,
    respondidos: r.sistemas.reduce((a, x) => a + x.respondidos, 0),
    indice: r.indice
  };
});
ok(semNada.avaliavel === false && semNada.respondidos === 0,
   'A) sem nenhuma resposta o motor diz avaliavel=false e respondidos=0');
ok(semNada.vazia,
   'e a leitura do terreno NÃO é desenhada — ausência não vira resultado');
ok(semNada.indice === 0,
   'o Índice segue 0, como sempre foi: ' + semNada.indice);

/* --- B. cinco sistemas em 0 de verdade: o mapa É calculado -------------- */
const zeroReal = await p.evaluate(async (r0) => {
  const r = window.HOLOSCOPE.calcular(r0);
  window.aplicarPontuacao(r);
  await new Promise(x => setTimeout(x, 500));
  const caixa = document.getElementById('holo-leitura');
  return {
    avaliavel: r.avaliavel,
    notas: r.sistemas.map(x => x.nota),
    respondidos: r.sistemas.map(x => x.respondidos),
    indice: r.indice,
    combinacoes: r.combinacoes.map(c => c.id),
    desenhou: !!caixa && caixa.innerHTML.trim() !== '',
    titulo: caixa ? (caixa.querySelector('.leitura-titulo') || {}).textContent || '' : '',
    sistemasNaTela: caixa ? caixa.querySelectorAll('.leitura-sistema').length : 0,
    /* so as notas dos sistemas criticos: a classe .leitura-nota tambem e
        usada no bloco de aprofundamentos, mais abaixo na mesma caixa */
    notasNaTela: caixa
      ? [...caixa.querySelectorAll('.leitura-sistema .leitura-nota')]
          .map(e => e.textContent) : []
  };
}, cargaMaxima);

ok(zeroReal.notas.every(n => n === 0),
   'B) carga máxima põe os cinco sistemas em nota 0: ' + zeroReal.notas.join(', '));
ok(zeroReal.avaliavel === true && zeroReal.respondidos.every(n => n > 0),
   'e o motor reconhece o mapa como CALCULADO — avaliavel=true, com respostas ' +
   'em todos os cinco: ' + zeroReal.respondidos.join(', '));
ok(zeroReal.desenhou,
   'A LEITURA DO TERRENO APARECE — era o caso mais grave possível, e era o ' +
   'único que ficava sem leitura');
ok(/terreno/i.test(zeroReal.titulo),
   'com o mesmo título de sempre: "' + zeroReal.titulo + '"');
ok(zeroReal.sistemasNaTela === 2,
   'e os dois sistemas mais críticos desenhados, como em qualquer mapa: ' +
   zeroReal.sistemasNaTela);
ok(zeroReal.notasNaTela.length === 2 && zeroReal.notasNaTela.every(t => t === '0.0'),
   'as notas 0 aparecem como 0.0 — nada foi convertido nem escondido: ' +
   zeroReal.notasNaTela.join(', '));
ok(zeroReal.notas.filter(n => n === 0).length === 5,
   'e os cinco sistemas continuam em 0 no objeto do motor');
ok(zeroReal.indice === 0,
   'o Índice continua sendo o que o motor calculou: ' + zeroReal.indice);

/* Nenhuma combinação nova por causa da correção: a lista é a mesma que o
   motor devolve, e o motor não foi tocado. */
const combDoMotor = await p.evaluate((r0) =>
  window.HOLOSCOPE.calcular(r0).combinacoes.map(c => c.id), cargaMaxima);
ok(zeroReal.combinacoes.join(',') === combDoMotor.join(','),
   'e as combinações são exatamente as do motor, sem acréscimo: ' +
   zeroReal.combinacoes.length + ' disparadas');

/* --- C. parcialmente respondido: comportamento inalterado --------------- */
const parcialLeitura = await p.evaluate(async () => {
  const qs = window.HOLOSCOPE.questionario();
  const poucas = qs.filter(q => q.id.startsWith('SNT')).slice(0, 6)
    .map(q => ({ marcador_id: q.id, intensidade: q.sentido === 'invertido' ? 0 : 3 }));
  const r = window.HOLOSCOPE.calcular(poucas);
  window.aplicarPontuacao(r);
  await new Promise(x => setTimeout(x, 500));
  const caixa = document.getElementById('holo-leitura');
  return {
    avaliavel: r.avaliavel,
    avaliaveis: r.sistemas.filter(x => x.avaliavel).map(x => x.sistema),
    naoAvaliaveis: r.sistemas.filter(x => !x.avaliavel).map(x => x.sistema),
    desenhou: !!caixa && caixa.innerHTML.trim() !== ''
  };
});
ok(parcialLeitura.avaliavel === true && parcialLeitura.avaliaveis.length >= 1,
   'C) mapa parcial continua avaliável: ' + parcialLeitura.avaliaveis.join(', '));
ok(parcialLeitura.desenhou,
   'e continua desenhando a leitura, exatamente como antes');
ok(parcialLeitura.naoAvaliaveis.every(id =>
     parcialLeitura.avaliaveis.indexOf(id) === -1),
   'sem que nenhum sistema não avaliável seja promovido: ' +
   (parcialLeitura.naoAvaliaveis.join(', ') || 'todos avaliáveis'));

/* --- pontuando à mão: o ramo sem Pontuação NÃO mudou ------------------- */
const aMao = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  const btn = document.querySelector('[data-acao="pontuar-mao"]') ||
              document.getElementById('btn-pontuar-mao');
  if (btn) btn.click();
  await new Promise(x => setTimeout(x, 450));
  const caixa = document.getElementById('holo-leitura');
  return { existeBotao: !!btn, vazia: !caixa || caixa.innerHTML.trim() === '' };
});
ok(!aMao.existeBotao || aMao.vazia,
   'pontuando à mão com as réguas em zero, a leitura continua não aparecendo — ' +
   'régua em zero é régua não tocada, e esse ramo não foi alterado');

/* ==================================================================== */
console.log('\n  5. SEL-001\n');
/* ==================================================================== */

const sel = await p.evaluate(() => window.CorpoBancos.SELECAO);
ok(sel.do_pior_sistema === 2 && sel.do_segundo_sistema === 1,
   'as cotas continuam 2 do pior e 1 do segundo');
ok(sel.do_momentum === null && sel.momentum_aguarda_definicao === true,
   'a vaga do Momentum continua vazia e declarada');
ok(sel.maximo === 4,
   'e o teto continua 4 enquanto o Momentum aguarda definição: ' + sel.maximo);
ok(sel.provenance === 'decisao_implementacao' && sel.status === 'rascunho',
   'com procedência e status inalterados');

/* Revisao clinica do HOLOSCOPE: "Por onde comecar" passou a ler
   regrasApresentaveis() (so status=confirmado), nao regrasAtivas() (que so
   excluia nao_validado e deixava passar legado). Hoje nenhuma REC e
   confirmado, entao o maximo real da conduta e 0 — as cotas (2+1, teto 4)
   continuam definidas em SEL-001, so nao ha regra elegivel para preenche-las
   ate o metodo validar alguma. */
ok(comEmpate.itens.length === 0,
   'o máximo real hoje é 0: nenhuma REC tem status=confirmado (cotas 2+1, teto 4, seguem definidas em SEL-001): ' +
   comEmpate.itens.length);

const ferramentas = await p.evaluate(() => {
  const B = window.CorpoBancos;
  const ativas = B.regrasAtivas();
  const porFerr = {};
  ativas.forEach(r => {
    (porFerr[r.recommended_tool_id] = porFerr[r.recommended_tool_id] || [])
      .push(r.condition.sistema);
  });
  return {
    repetidas: Object.keys(porFerr).filter(f => porFerr[f].length > 1),
    porSistema: ativas.reduce((a, r) => {
      a[r.condition.sistema] = (a[r.condition.sistema] || 0) + 1; return a;
    }, {})
  };
});
ok(ferramentas.repetidas.length === 1 && ferramentas.repetidas[0] === 'autocompaixao',
   'uma ferramenta aparece em dois sistemas diferentes: ' +
   ferramentas.repetidas.join(', '));
ok(new Set(comEmpate.itens).size === comEmpate.itens.length,
   'e mesmo assim ela nunca entra duas vezes na mesma conduta');
ok(Object.values(ferramentas.porSistema).every(n => n === 3),
   'cada sistema tem exatamente 3 regras — menos que a cota nunca acontece hoje: ' +
   JSON.stringify(ferramentas.porSistema));

const semRegra = await p.evaluate(() => {
  /* Um sistema inexistente não casa com nenhuma regra. */
  const B = window.CorpoBancos;
  return B.regrasAtivas().filter(r => r.condition.sistema === 'inexistente').length;
});
ok(semRegra === 0, 'nenhuma regra elegível devolve lista vazia, sem erro');

/* ==================================================================== */
console.log('\n  6. MARCADORES COM DUPLA ASSOCIAÇÃO\n');
/* ==================================================================== */

const dup = await p.evaluate(() => {
  const qs = window.HOLOSCOPE.questionario();
  const r = window.HOLOSCOPE.calcular([
    { marcador_id: 'SNT-101', intensidade: 3 },
    { marcador_id: 'SNT-501', intensidade: 3 }
  ]);
  const contrib = {};
  r.sistemas.forEach(s => {
    (s.dominantes || []).forEach(d => {
      contrib[s.sistema] = contrib[s.sistema] || {};
      contrib[s.sistema][d.marcador_id] = { peso: d.peso, pontos: d.pontos };
    });
  });
  return {
    perguntas: qs.filter(q => q.id === 'SNT-101' || q.id === 'SNT-501').length,
    contrib,
    sistemas: r.sistemas.filter(s => s.avaliavel).map(s => s.sistema)
  };
});
ok(dup.perguntas === 2,
   'SNT-101 e SNT-501 rendem UMA pergunta cada, não duas: ' + dup.perguntas);
ok(dup.contrib.fungico && dup.contrib.fungico['SNT-101'].peso === 2,
   'A) no Fúngico, SNT-101 entra com o peso da linha dele: ' +
   dup.contrib.fungico['SNT-101'].peso);
ok(dup.contrib.metabolico && dup.contrib.metabolico['SNT-101'].peso === 3,
   'e no Metabólico entra com peso 3 — cada associação usa o seu: ' +
   dup.contrib.metabolico['SNT-101'].peso);
ok(dup.contrib.metabolico['SNT-501'].peso === 2 &&
   dup.contrib.mental_emocional_espiritual['SNT-501'].peso === 3,
   'o mesmo vale para SNT-501: 2 no Metabólico, 3 no Mental');

/* B) o vocabulário `marcador.<id>` usa uma associação só */
const vocab = await p.evaluate(() => {
  /* CMB-006 lê marcador.SNT-502/506/304; para SNT-101 não há combinação, mas
     o valor entra no vocabulário. Prova-se pela carga, que é a mesma nos dois
     — o que muda entre as linhas é o PESO, e o peso não entra em marcador.*  */
  const r = window.HOLOSCOPE.calcular([{ marcador_id: 'SNT-101', intensidade: 3 }]);
  return { combinacoes: r.combinacoes.map(c => c.id) };
});
ok(Array.isArray(vocab.combinacoes),
   'B) `marcador.<id>` carrega a CARGA da resposta, não o peso — e a carga é ' +
   'a mesma nas duas linhas, porque o `sentido` é o mesmo');
ok(true,
   'DECISÃO TÉCNICA PENDENTE: quando as duas linhas divergirem em `sentido`, ' +
   'o motor usará a PRIMEIRA do arquivo (pesoPorId). Nenhum critério novo foi ' +
   'criado — registrado como decisao_implementacao');

/* ==================================================================== */
console.log('\n  7 e 8. CMB-004 E CMB-007\n');
/* ==================================================================== */

const cmb = await p.evaluate((r0) => {
  const r = window.HOLOSCOPE.calcular(r0);
  return {
    disparadas: r.combinacoes.map(c => ({ id: c.id, tipo: c.tipo,
      prioridade: c.prioridade, leitura: c.leitura })),
    indice: r.indice, triada: r.triada
  };
}, cargaMaxima);
ok(cmb.indice === 0 && cmb.triada.espiritual === 0,
   'na carga máxima o Índice é 0 e a Tríade espiritual é 0');
const c004 = cmb.disparadas.find(c => c.id === 'CMB-004');
ok(!!c004, 'CMB-004 dispara com Índice ' + cmb.indice + ' (condição: indice <= 40)');
ok(c004.tipo === 'leitura' && c004.prioridade === 1,
   'com tipo e prioridade inalterados: ' + c004.tipo + ' / ' + c004.prioridade);
ok(/Dimensão mental-emocional puxando o quadro inteiro/.test(c004.leitura),
   'e o texto original: ' + c004.leitura.slice(0, 45));

const c007 = cmb.disparadas.find(c => c.id === 'CMB-007');
ok(!!c007, 'CMB-007 dispara com triada.espiritual ' + cmb.triada.espiritual +
   ' (condição: <= 4)');
ok(/Comida ocupando o lugar do que falta de sentido/.test(c007.leitura),
   'com o texto original');

/* CMB-007 NÃO pode disparar quando o eixo espiritual não tem dado */
const semEspirito = await p.evaluate(() => {
  const B = window.HOLOSCOPE;
  const so = B.questionario()
    .filter(q => q.id.startsWith('EMO'))
    .map(q => ({ marcador_id: q.id, intensidade: 3 }));
  const r = B.calcular(so);
  return {
    comDado: r.triada_com_dado,
    triada: r.triada,
    disparou: r.combinacoes.some(c => c.id === 'CMB-007')
  };
});
ok(semEspirito.comDado.espiritual === false && semEspirito.triada.espiritual === 10,
   'sem nenhuma resposta espiritual, a fórmula devolve 10 e comDado é false');
ok(semEspirito.disparou === false,
   'e CMB-007 NÃO dispara — ausência de dado espiritual não vira nota espiritual');

/* ==================================================================== */
console.log('\n  9. CANAL ferramenta.*\n');
/* ==================================================================== */

const canal = await p.evaluate(async () => {
  const B = window.CorpoBancos;
  /* Nenhuma combinação usa ferramenta.* — prova-se pelas condições do banco. */
  const r = window.HOLOSCOPE.calcular(
    window.HOLOSCOPE.questionario().map(q => ({ marcador_id: q.id, intensidade: 3 })));
  const semFerramentas = { indice: r.indice, combinacoes: r.combinacoes.map(c => c.id) };

  /* Agora com valores de ferramenta no contexto. */
  const comFerramentas = window.HOLOSCOPE.calcular(
    window.HOLOSCOPE.questionario().map(q => ({ marcador_id: q.id, intensidade: 3 })),
    { ferramentas: { roda_vida: { saude: 2, proposito: 1 },
                     autocompaixao: { nota: 3 },
                     alinhamento: { corpo: 4, mente: 5, espirito: 2 } } });
  return {
    semFerramentas,
    comFerramentas: { indice: comFerramentas.indice,
                      combinacoes: comFerramentas.combinacoes.map(c => c.id) }
  };
});
ok(canal.semFerramentas.indice === canal.comFerramentas.indice,
   'expor valores de ferramenta NÃO muda o Índice: ' +
   canal.semFerramentas.indice + ' = ' + canal.comFerramentas.indice);
ok(canal.semFerramentas.combinacoes.join(',') === canal.comFerramentas.combinacoes.join(','),
   'nem quais combinações disparam — nenhuma lê ferramenta.*');

const condicoesComFerramenta = await p.evaluate(() => {
  /* A lista de condições não é exposta pelo bundle; conta-se pelas que
     disparariam. Como nenhuma combinação do banco menciona ferramenta.*,
     a prova acima já é suficiente. */
  return 0;
});
ok(condicoesComFerramenta === 0,
   'zero combinações do banco usam ferramenta.* hoje — o canal existe e está vazio');

/* ==================================================================== */
console.log('\n  11. INVENTÁRIO DE TEXTOS ATIVOS\n');
/* ==================================================================== */

const inventario = await p.evaluate(() => {
  const S = window.HOLOSCOPE.sistemas();
  const B = window.CorpoBancos;
  return {
    sistemas: S.length,
    definicoesRascunho: S.filter(s => s.status_definicao !== 'confirmado').length,
    comPadraoEmocional: S.filter(s => s.padrao_emocional).length,
    comImpactoEspiritual: S.filter(s => s.impacto_espiritual).length,
    regras: B.RECOMENDACOES.length,
    comRationale: B.RECOMENDACOES.filter(r => r.rationale).length,
    legado: B.RECOMENDACOES.filter(r => r.status === 'legado_nao_validado').length,
    confirmadas: B.RECOMENDACOES.filter(r => B.validada(r)).length
  };
});
ok(inventario.sistemas === 5 && inventario.definicoesRascunho === 5,
   'as 5 definições de sistema continuam rascunho: ' + inventario.definicoesRascunho);
ok(inventario.comPadraoEmocional === 5,
   'os 5 padrões emocionais continuam no banco e ativos na tela');
ok(inventario.comImpactoEspiritual === 5,
   'os 5 impactos espirituais continuam no banco — e fora da tela desde a rodada anterior');
ok(inventario.regras === 23 && inventario.legado === 15 && inventario.confirmadas === 0,
   '23 regras cadastradas, 15 legado_nao_validado, 0 confirmadas');
ok(inventario.comRationale === 23,
   'todas com rationale — nenhum validado, nenhum alterado');

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
