/**
 * O PQQ dentro do histórico versionado.
 *
 * O QUE ESTAVA ERRADO
 *
 * O PQQ era a última ferramenta fora do modelo de aplicações. Gravava numa
 * tabela própria, uma linha por clique em "Salvar", e a tela mostrava só a
 * mais recente — inclusive quando o clique era para corrigir uma vírgula. O
 * dado ficava; o histórico é que era invisível. E o PQQ é justamente a
 * ferramenta em que comparar o "pra que" de março com o de outubro é a
 * leitura.
 *
 * E HAVIA UMA REGRA ESCONDIDA
 *
 * Com "O verdadeiro" vazio, o Mapa do Propósito pegava a resposta mais
 * profunda preenchida — r5, senão r4, e assim por diante — e a exibia entre
 * aspas como sendo o propósito. Ninguém decidiu que profundidade na escada é
 * propósito. Saiu, e não foi substituída.
 *
 * O que este teste cobra: persistência, histórico, migração, data local, e a
 * ausência daquele fallback. O conteúdo clínico não é assunto aqui porque não
 * mudou — os mesmos sete campos, com os mesmos nomes.
 */
import puppeteer from 'puppeteer-core';

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1400, height: 1400 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

const abrirPQQ = () => p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="mente"]').click();
  document.querySelector('[data-vista="vista-pqq"]').click();
  await new Promise(r => setTimeout(r, 450));
});

const preencher = (v) => p.evaluate(async (x) => {
  const set = (id, val) => {
    const el = document.getElementById(id);
    el.value = val;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  Object.keys(x).forEach(k => set('pqq-' + k, x[k]));
  document.getElementById('btn-salvar-pqq').click();
  await new Promise(r => setTimeout(r, 450));
}, v);

/* ==================================================================== */
console.log('\n  PARTE 1 — persistência e histórico\n');
/* ==================================================================== */

const pid = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Marina Alves';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 400));
  return window.pacienteAtivoId();
});

await abrirPQQ();
await preencher({
  objetivo: 'Emagrecer 8 kg',
  1: 'Para caber no vestido do casamento',
  2: 'Porque me sinto mal nas fotos',
  3: 'Eu evito sair de casa',
  4: 'Representa nao ter desistido de mim',
  5: 'Minha mae dizia que eu era a gordinha',
  verdadeiro: 'Voltar a me reconhecer no espelho'
});

const primeira = await p.evaluate(() => {
  const h = window.Aplicacoes.historico('pqq');
  const a = h[0];
  return {
    quantas: h.length,
    paciente: a.paciente_id, ferramenta: a.ferramenta_id,
    status: a.status, versao: a.versao_ferramenta,
    consulta: a.consulta_id,
    temIniciada: !!a.iniciada_em, temConcluida: !!a.concluida_em,
    temAtualizada: !!a.atualizada_em,
    resultado: a.resultado,
    respostas: a.respostas
  };
});
ok(primeira.quantas === 1, 'salvar cria UMA aplicação: ' + primeira.quantas);
ok(primeira.ferramenta === 'pqq' && primeira.paciente === pid,
   'ligada ao paciente e à ferramenta certos');
ok(primeira.status === 'concluida', 'salvar conclui a aplicação: ' + primeira.status);
ok(primeira.versao !== undefined && primeira.versao !== null,
   'com versão de ferramenta declarada: ' + primeira.versao);
ok(primeira.consulta === null || typeof primeira.consulta === 'string',
   'e com o vínculo de consulta preenchido ou null — nunca inventado');
ok(primeira.temIniciada && primeira.temConcluida && primeira.temAtualizada,
   'com os três carimbos de tempo do modelo');
ok(primeira.resultado === null,
   'resultado é null: o PQQ não deriva síntese, nota nem interpretação');

const CAMPOS = ['objetivo', 'r1', 'r2', 'r3', 'r4', 'r5', 'verdadeiro'];
ok(CAMPOS.every(c => c in primeira.respostas),
   'os sete campos entram em respostas com os mesmos nomes de sempre: ' +
   Object.keys(primeira.respostas).join(', '));
ok(primeira.respostas.r5 === 'Minha mae dizia que eu era a gordinha' &&
   primeira.respostas.verdadeiro === 'Voltar a me reconhecer no espelho',
   'com o conteúdo literal de cada um');

/* ---- editar atualiza; não duplica ------------------------------------ */

await preencher({
  objetivo: 'Emagrecer 8 kg',
  1: 'Para caber no vestido do casamento da minha filha',
  2: 'Porque me sinto mal nas fotos',
  3: 'Eu evito sair de casa',
  4: 'Representa nao ter desistido de mim',
  5: 'Minha mae dizia que eu era a gordinha',
  verdadeiro: 'Voltar a me reconhecer no espelho'
});
const editada = await p.evaluate(() => {
  const h = window.Aplicacoes.historico('pqq');
  return { quantas: h.length, r1: h[0].respostas.r1 };
});
ok(editada.quantas === 1,
   'corrigir a aplicação aberta ATUALIZA — não cria outra: ' + editada.quantas);
ok(/da minha filha/.test(editada.r1), 'e a correção fica guardada');

/* ---- nova aplicação --------------------------------------------------- */

const nova = await p.evaluate(async () => {
  document.getElementById('btn-nova-pqq').click();
  await new Promise(r => setTimeout(r, 450));
  return {
    limpos: ['pqq-objetivo','pqq-1','pqq-5','pqq-verdadeiro']
      .every(id => document.getElementById(id).value === ''),
    quantas: window.Aplicacoes.historico('pqq').length
  };
});
ok(nova.limpos, '"Nova aplicação" abre um formulário em branco');
ok(nova.quantas === 2, 'e a anterior continua lá: ' + nova.quantas + ' aplicações');

await preencher({
  objetivo: 'Manter o peso',
  1: 'Para nao voltar atras',
  2: 'Porque custou muito chegar aqui',
  3: 'Consigo brincar com os netos',
  4: 'Representa constancia',
  5: 'Sempre desisti no meio',
  verdadeiro: 'Provar para mim que eu sustento o que comeco'
});

const duas = await p.evaluate(() => {
  const h = window.Aplicacoes.historico('pqq');
  return {
    quantas: h.length,
    verdadeiros: h.map(a => a.respostas.verdadeiro),
    estados: h.map(a => a.status)
  };
});
ok(duas.quantas === 2,
   'depois de salvar a segunda, continuam duas — nada foi sobrescrito: ' + duas.quantas);
ok(duas.estados.every(s => s === 'concluida'), 'as duas concluídas');
ok(duas.verdadeiros.indexOf('Voltar a me reconhecer no espelho') >= 0,
   'A PRIMEIRA APLICAÇÃO ESTÁ INTEIRA — era o que se perdia de vista antes');
ok(duas.verdadeiros.indexOf('Provar para mim que eu sustento o que comeco') >= 0,
   'e a segunda também');

/* ---- histórico na tela e data local ----------------------------------- */

const naTela = await p.evaluate(async () => {
  const caixa = document.getElementById('pqq-historico');
  const itens = [...caixa.querySelectorAll('[data-pqq-app]')];
  itens[itens.length - 1].click();
  await new Promise(r => setTimeout(r, 300));
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, '0') + '/' +
              String(hoje.getMonth() + 1).padStart(2, '0') + '/' + hoje.getFullYear();
  return {
    visivel: !caixa.classList.contains('hidden'),
    quantos: itens.length,
    verdadeiroDepois: document.getElementById('pqq-verdadeiro').value,
    nota: (document.getElementById('pqq-de-quando') || {}).textContent || '',
    hojeLocal: dia,
    rotulos: itens.map(b => b.querySelector('b').textContent)
  };
});
ok(naTela.visivel && naTela.quantos === 2,
   'a tela lista as duas aplicações: ' + naTela.quantos);
ok(/Voltar a me reconhecer/.test(naTela.verdadeiroDepois),
   'e reabrir a mais antiga traz o conteúdo dela de volta');
ok(naTela.nota.indexOf(naTela.hojeLocal) >= 0,
   'a nota diz de quando é a aplicação, no dia LOCAL e não no UTC: ' +
   naTela.hojeLocal);
ok(naTela.rotulos.every(r => r === naTela.hojeLocal),
   'e o histórico usa a mesma data local: ' + naTela.rotulos.join(' · '));

/* ---- troca de paciente ------------------------------------------------ */

const troca = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Carla Ribeiro';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 450));
  document.querySelector('.nav-item[data-secao="mente"]').click();
  document.querySelector('[data-vista="vista-pqq"]').click();
  await new Promise(r => setTimeout(r, 500));
  const daCarla = window.Aplicacoes.historico('pqq');
  const todas = (window.DadosLocais.exportar().tabelas.aplicacoes || [])
    .filter(a => a.ferramenta_id === 'pqq');
  return {
    campoVazio: document.getElementById('pqq-verdadeiro').value,
    carlaId: window.pacienteAtivoId(),
    carlaEstados: daCarla.map(a => a.status),
    carlaRespostas: daCarla.map(a => JSON.stringify(a.respostas || {})),
    donos: todas.map(a => a.paciente_id + ':' + a.status).sort()
  };
});
ok(troca.campoVazio === '', 'trocar de paciente abre o PQQ em branco, não o da anterior');
/* Abrir a tela abre uma aplicação — é o padrão de todas as ferramentas. O que
   não pode acontecer é ela nascer com a resposta de outra pessoa dentro. */
ok(troca.carlaEstados.join(',') === 'rascunho',
   'a nova paciente ganha um rascunho vazio, como em qualquer ferramenta: ' +
   troca.carlaEstados.join(' + '));
ok(troca.carlaRespostas.every(r => r === '{}' || r === 'null'),
   'e ele nasce sem nenhuma resposta herdada: ' + troca.carlaRespostas.join(' '));
ok(troca.donos.filter(d => d.indexOf(troca.carlaId) === 0).length === 1,
   'só uma aplicação sob a paciente nova');
ok(troca.donos.filter(d => d.indexOf(troca.carlaId) !== 0 &&
                           d.endsWith(':concluida')).length === 2,
   'e as duas concluídas da Marina continuam dela, intactas: ' +
   troca.donos.join(' · '));

/* ==================================================================== */
console.log('\n  PARTE 2 — o Mapa do Propósito sem o fallback\n');
/* ==================================================================== */

/* r1 a r5 respondidos, "O verdadeiro" em branco. Antes, o sistema elegia r5
   como propósito e o exibia entre aspas. Agora não elege nada. */
const semVerdadeiro = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="mente"]').click();
  document.querySelector('[data-vista="vista-pqq"]').click();
  await new Promise(r => setTimeout(r, 450));
  const set = (id, val) => {
    const el = document.getElementById(id);
    el.value = val;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  set('pqq-objetivo', 'Ter mais disposicao');
  set('pqq-1', 'Para acompanhar meus filhos');
  set('pqq-2', 'Porque eu chego em casa sem energia');
  set('pqq-3', 'Perco os fins de semana deitada');
  set('pqq-4', 'Representa estar presente');
  set('pqq-5', 'Meu pai nunca brincou comigo');
  set('pqq-verdadeiro', '');
  document.getElementById('btn-salvar-pqq').click();
  await new Promise(r => setTimeout(r, 450));

  document.querySelector('.nav-item[data-secao="espirito"]').click();
  document.querySelector('[data-vista="vista-mapa"]').click();
  await new Promise(r => setTimeout(r, 450));
  const el = document.getElementById('mapa-proposito');
  return {
    texto: el.textContent,
    vazio: el.classList.contains('vazio'),
    objetivo: document.getElementById('mapa-objetivo').textContent,
    respostas: window.Aplicacoes.ultima('pqq').respostas
  };
});
ok(semVerdedeiroGuard(semVerdadeiro.respostas),
   'as cinco respostas da escada estão preenchidas e "O verdadeiro" vazio');
ok(semVerdadeiro.texto.indexOf('Meu pai nunca brincou comigo') === -1,
   'r5 NÃO é promovido a propósito — o fallback automático não existe mais');
ok(['Para acompanhar meus filhos', 'Porque eu chego em casa sem energia',
    'Perco os fins de semana deitada', 'Representa estar presente']
     .every(t => semVerdadeiro.texto.indexOf(t) === -1),
   'e nenhuma das outras respostas é promovida no lugar dela');
ok(semVerdadeiro.vazio,
   'o Mapa fica sem propósito definido, no estado neutro que já existia');
ok(semVerdadeiro.texto.indexOf('“') === -1,
   'e nada é exibido entre aspas como se fosse fala de propósito');
ok(/Ter mais disposicao/.test(semVerdadeiro.objetivo),
   'o objetivo declarado continua aparecendo normalmente');

function semVerdedeiroGuard(r) {
  return r.r1 && r.r2 && r.r3 && r.r4 && r.r5 && r.verdadeiro === '';
}

/* com "O verdadeiro" preenchido, ele aparece */
const comVerdadeiro = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="mente"]').click();
  document.querySelector('[data-vista="vista-pqq"]').click();
  await new Promise(r => setTimeout(r, 450));
  const el = document.getElementById('pqq-verdadeiro');
  el.value = 'Estar presente para os meus filhos';
  el.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('btn-salvar-pqq').click();
  await new Promise(r => setTimeout(r, 450));
  document.querySelector('.nav-item[data-secao="espirito"]').click();
  document.querySelector('[data-vista="vista-mapa"]').click();
  await new Promise(r => setTimeout(r, 450));
  const m = document.getElementById('mapa-proposito');
  return { texto: m.textContent, vazio: m.classList.contains('vazio') };
});
ok(/Estar presente para os meus filhos/.test(comVerdadeiro.texto) && !comVerdadeiro.vazio,
   'e quando "O verdadeiro" está preenchido, é ele que aparece');

/* ---- o PQQ não altera o HOLOSCOPE ------------------------------------- */

const holo = await p.evaluate(() => {
  const t = window.DadosLocais.exportar().tabelas;
  return {
    mapas: (t.holoscope || []).length,
    pontuacao: localStorage.getItem('holohacking.pontuacao')
  };
});
ok(holo.mapas === 0 && (holo.pontuacao === null || holo.pontuacao === '{}'),
   'depois de quatro aplicações de PQQ, nenhum mapa do HOLOSCOPE foi criado ' +
   'nem alterado: o PQQ não toca a pontuação');

/* ==================================================================== */
console.log('\n  PARTE 3 — migração do PQQ legado\n');
/* ==================================================================== */

const PID2 = 'paciente-pqq-antigo';
const LINHAS = [
  { id: 'pqq-a', created_at: '2025-03-04T11:00:00.000Z', paciente_id: PID2,
    objetivo: 'Dormir melhor', r1: 'Para render no trabalho', r2: 'Porque erro muito',
    r3: 'Perco prazos', r4: 'Representa competencia', r5: 'Sempre fui cobrada',
    verdadeiro: 'Parar de provar valor pelo cansaco' },
  { id: 'pqq-b', created_at: '2025-07-19T15:30:00.000Z', paciente_id: PID2,
    objetivo: 'Voltar a cozinhar', r1: 'Para comer melhor', r2: 'Porque como fora',
    r3: 'Gasto demais', r4: 'Representa cuidado', r5: 'Minha avo cozinhava',
    verdadeiro: 'Cuidar de mim como cuidaram de mim' },
  { id: 'pqq-c', created_at: '2025-12-02T08:10:00.000Z', paciente_id: PID2,
    objetivo: 'Fechar o ano bem', r1: 'Para nao recomecar', r2: 'Porque ja recomecei muito',
    r3: 'Me frustro', r4: 'Representa continuidade', r5: 'Sempre parei em dezembro',
    verdadeiro: 'Chegar em janeiro sem divida comigo' }
];

const semear = (aplicacoes) => p.evaluate((x) => {
  localStorage.clear();
  localStorage.setItem('holohacking.dados.pacientes', JSON.stringify([
    { id: x.pid, created_at: '2025-01-02T10:00:00.000Z', nome: 'Joana Antiga' }
  ]));
  localStorage.setItem('holohacking.dados.pqq', JSON.stringify(x.linhas));
  if (x.aplicacoes) {
    localStorage.setItem('holohacking.dados.aplicacoes', JSON.stringify(x.aplicacoes));
  }
}, { pid: PID2, linhas: LINHAS, aplicacoes });

const recarregar = async () => {
  await p.reload({ waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
  await new Promise(r => setTimeout(r, 900));
};

const lerMig = () => p.evaluate((pid) => {
  const h = window.Aplicacoes.historico('pqq', pid);
  return {
    quantas: h.length,
    apps: h.map(a => ({
      verdadeiro: a.respostas && a.respostas.verdadeiro,
      objetivo: a.respostas && a.respostas.objetivo,
      concluida: a.concluida_em, iniciada: a.iniciada_em,
      versao: a.versao_ferramenta, status: a.status,
      resultado: a.resultado, origem: a.origem_legada || null
    })),
    linhasAntigas: (window.DadosLocais.exportar().tabelas.pqq || []).length
  };
}, PID2);

/* --- várias linhas do mesmo paciente ---------------------------------- */
await semear(null);
await recarregar();
const m1 = await lerMig();

ok(m1.quantas === 3, 'as três linhas legadas viram TRÊS aplicações: ' + m1.quantas);
ok(LINHAS.every(l => m1.apps.some(a => a.verdadeiro === l.verdadeiro)),
   'cada uma com o seu conteúdo literal, sem misturar');
ok(LINHAS.every(l => m1.apps.some(a => a.concluida === l.created_at &&
                                       a.iniciada === l.created_at)),
   'e com o created_at real de cada linha, não a data da migração');
ok(m1.apps[0].objetivo === 'Fechar o ano bem' && m1.apps[2].objetivo === 'Dormir melhor',
   'a ordem histórica é respeitada, da mais recente à mais antiga');
ok(m1.apps.every(a => a.versao === '0'), 'todas com versao_ferramenta "0"');
ok(m1.apps.every(a => a.status === 'concluida' && a.resultado === null),
   'concluídas e sem resultado derivado');
ok(m1.apps.every(a => a.origem === 'pqq:' + LINHAS.find(
     l => l.created_at === a.concluida).id),
   'cada aplicação guarda de QUAL linha legada veio: ' +
   m1.apps.map(a => a.origem).sort().join(' · '));
ok(new Set(m1.apps.map(a => a.origem)).size === 3,
   'e as três chaves de origem são distintas');

/* --- execução repetida, sem a marca ----------------------------------- */
const m2 = await p.evaluate(async (pid) => {
  localStorage.removeItem('holohacking.pqq.migrado');
  await window.Aplicacoes.migrarPQQ();
  return window.Aplicacoes.historico('pqq', pid).length;
}, PID2);
ok(m2 === 3, 'rodar de novo sem a marca do localStorage não duplica: ' + m2);

await p.evaluate(() => localStorage.removeItem('holohacking.pqq.migrado'));
await recarregar();
const m3 = await lerMig();
ok(m3.quantas === 3, 'e recarregar sem a marca também não: ' + m3.quantas);

/* --- migração parcial -------------------------------------------------- */
const jaMigrada = [{
  id: 'app-pqq-ja-migrada', created_at: LINHAS[1].created_at,
  paciente_id: PID2, consulta_id: null, ferramenta_id: 'pqq',
  versao_ferramenta: '0', status: 'concluida',
  iniciada_em: LINHAS[1].created_at, concluida_em: LINHAS[1].created_at,
  atualizada_em: LINHAS[1].created_at,
  respostas: {
    objetivo: LINHAS[1].objetivo, r1: LINHAS[1].r1, r2: LINHAS[1].r2,
    r3: LINHAS[1].r3, r4: LINHAS[1].r4, r5: LINHAS[1].r5,
    verdadeiro: LINHAS[1].verdadeiro
  },
  resultado: null, leitura: null, prioridade: null, proximo_passo: null
  /* de propósito SEM origem_legada: é como ficam as migradas por uma versão
     anterior da rotina */
}];

await semear(jaMigrada);
await recarregar();
const m4 = await lerMig();
ok(m4.quantas === 3, 'migração parcial completa as que faltam: ' + m4.quantas);
ok(m4.apps.filter(a => a.verdadeiro === LINHAS[1].verdadeiro).length === 1,
   'a que já estava migrada aparece UMA vez — não foi duplicada');
ok(m4.apps.filter(a => a.origem === null).length === 1,
   'ela continua sem chave de origem, reconhecida pelo carimbo e pela versão "0"');
ok(LINHAS.every(l => m4.apps.some(a => a.concluida === l.created_at)),
   'nenhuma perdeu a sua data');

const m5 = await p.evaluate(async (pid) => {
  localStorage.removeItem('holohacking.pqq.migrado');
  await window.Aplicacoes.migrarPQQ();
  return window.Aplicacoes.historico('pqq', pid).length;
}, PID2);
ok(m5 === 3, 'e uma terceira execução continua em três: ' + m5);

/* --- a origem não é apagada ------------------------------------------- */
ok(m1.linhasAntigas === 3 && m3.linhasAntigas === 3 && m4.linhasAntigas === 3,
   'a tabela `pqq` continua com as três linhas em todos os cenários');
const origem = await p.evaluate(() =>
  (window.DadosLocais.exportar().tabelas.pqq || [])
    .map(o => o.id + '|' + o.created_at + '|' + o.verdadeiro).sort().join(' ; '));
ok(origem === LINHAS.map(l => l.id + '|' + l.created_at + '|' + l.verdadeiro)
     .sort().join(' ; '),
   'e com o conteúdo intacto, linha por linha');

/* --- compatibilidade: p.pqq é a aplicação mais recente ----------------- */
const compat = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="espirito"]').click();
  document.querySelector('[data-vista="vista-mapa"]').click();
  await new Promise(r => setTimeout(r, 450));
  return {
    proposito: document.getElementById('mapa-proposito').textContent,
    objetivo: document.getElementById('mapa-objetivo').textContent
  };
});
ok(/Chegar em janeiro sem divida comigo/.test(compat.proposito) &&
   /Fechar o ano bem/.test(compat.objetivo),
   'o Mapa do Propósito lê a aplicação mais recente, sem saber do histórico');

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
