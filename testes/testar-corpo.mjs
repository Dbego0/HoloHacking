/**
 * O Módulo Corpo depois da correção de governança.
 *
 * ESTE TESTE NÃO TRAVA LIMIAR CLÍNICO. A versão anterior travava: cobrava
 * "Reorganizar", "média 3.7", faixas de sono — números que a implementação
 * inventou e declarou como sendo da Especificação Mestre. Um teste assim
 * certifica a invenção e falha quando o método é corrigido, que é o avesso
 * do que ele deveria fazer.
 *
 * O que se cobra aqui são INVARIANTES — coisas que precisam valer qualquer
 * que seja o número que o Rodrigo venha a definir:
 *
 *   NULL         campo não respondido continua null, nunca vira 5.
 *   PROCEDÊNCIA  toda regra declara source e provenance, e nenhuma atribui à
 *                especificação conteúdo que ela não tem.
 *   MOTOR        o que está marcado como não validado não executa.
 *   MOMENTUM     sem confirmação profissional, não há estado.
 *   SONO         sem faixa validada, não há classificação — e a tela não diz
 *                que os quatro estão bem quando só três foram respondidos.
 *   SINAIS       nenhum sinal é eleito automaticamente para aprofundamento.
 *   HÁBITOS      ausência não é transformada em "atrapalha"; a matriz é 2D.
 *   ENERGIA      a queda nunca atravessa um momento sem registro, e a
 *                recorrência só conta os dias com o par completo.
 *   ESTABILIDADE é variação baixa, exige 3 observações, e diz quando não dá.
 *   ROTINA       mede e mostra: nenhum corte de 5h, nenhum corte de 8, e
 *                fome e estresse nunca somados.
 *   DIÁRIO       conta registros e mostra horários reais: nada de "dados
 *                suficientes", nada de manhã/tarde/noite inventados.
 *   REAPLICAÇÃO  só tem prazo onde o documento dá prazo.
 *   LEGADO       regra herdada executa, mas nunca se apresenta como validada.
 *   HISTÓRICO    concluir fecha a aplicação; começar outra guarda a anterior.
 *   LINGUAGEM    a síntese observa; não conclui.
 */
import puppeteer from 'puppeteer-core';

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

/* A revisao clinica de Corpo/Mente/Espirito (rodada anterior a esta) reduziu
   a galeria de Corpo a 2 ferramentas: OQ3 e linha_momentum. As outras 7 que
   este arquivo testa (ritmo_sono, energia_vital, leitura_sinais,
   inventario_habitos, check_comprometimento, mapa_rotina, diario_corporal)
   continuam com dado e logica intactos em ferramentas.js/resultado-corpo.js
   — so nao tem mais card na galeria, e abrirFerramentaPorId() ja se recusa a
   abrir ferramenta sem card (formulario.js). Reabrir via selector direto
   seria simular uma porta que a revisao anterior fechou de proposito.
   abrirFerr() agora devolve se conseguiu abrir; quem chama decide pular. */
const abrirFerr = (id) => p.evaluate(async (x) => {
  document.querySelector('.nav-item[data-secao="corpo"]').click();
  const card = document.querySelector('[data-ferramenta="' + x + '"]');
  if (!card) return false;
  card.click();
  await new Promise(r => setTimeout(r, 400));
  return true;
}, id);

const pular = (id, motivo) => console.log('  --    ' + id + ': ' + motivo);

const voltar = () => p.evaluate(async () => {
  document.querySelector('.btn-voltar').click();
  await new Promise(r => setTimeout(r, 250));
});

await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Marina Alves';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 400));
});

/* ================================================ o catálogo do Corpo ==== */

const cat = await p.evaluate(() => {
  const c = window.CATALOGO_FERRAMENTAS.filter(f => f.modulo === 'corpo');
  return {
    quantas: c.length,
    papeis: [...new Set(c.map(f => f.papel))].sort(),
    comObjetivo: c.filter(f => f.objetivo && f.quando_usar).length,
    comResultado: c.filter(f => f.resultado).length,
    semPadrao: c.every(f =>
      (f.campos || []).every(x => x.padrao === undefined) &&
      (f.lista ? f.lista.campos.every(x => x.padrao === undefined) : true)),
    comPrazo: c.filter(f => f.reaplicar_dias != null)
               .map(f => f.id + '=' + f.reaplicar_dias)
  };
});
ok(cat.quantas === 9, 'as nove do catálogo (a 01 é o OQ³, que tem tela própria): ' + cat.quantas);
ok(cat.papeis.join(',') === 'estrutural,implementacao,investigacao,monitoramento',
   'os quatro papéis da especificação: ' + cat.papeis.join(' · '));
ok(cat.comObjetivo === 9, 'todas dizem para quê servem e quando usar: ' + cat.comObjetivo);
ok(cat.comResultado === 9, 'todas produzem alguma síntese: ' + cat.comResultado);
ok(cat.semPadrao, 'e nenhum campo nasce com valor de fábrica');
ok(cat.comPrazo.join(',') === 'hidratacao_movimento=7',
   'só a ferramenta que o §13.9 manda reaplicar semanalmente tem prazo; ' +
   'nas outras reaplicar_dias é null: ' + (cat.comPrazo.join(' · ') || 'nenhuma'));

/* =========================================== procedência: o campo é honesto */

const proc = await p.evaluate(() => {
  const B = window.CorpoBancos;
  const R = B.RECOMENDACOES;
  const FONTES = Object.keys(B.PROVENIENCIA);
  const SOURCES = ['holoscope', 'oq3', 'momentum', 'ferramenta', 'decisao_profissional'];
  const campos = ['id', 'version', 'source', 'condition', 'recommended_tool_id',
                  'rationale', 'priority', 'status', 'provenance'];
  return {
    quantas: R.length,
    comSchema: R.filter(r => campos.every(c => r[c] !== undefined)).length,
    sourceValido: R.every(r => SOURCES.includes(r.source)),
    provValida: R.every(r => FONTES.includes(r.provenance)),
    atribuidasAEspec: R.filter(r => r.provenance === 'especificacao').length,
    legado: R.filter(r => r.provenance === 'projeto_legado').length,
    minhas: R.filter(r => r.provenance === 'decisao_implementacao').length,
    legadoNaoValidado: R.filter(r => r.status === 'legado_nao_validado').length,
    confirmadas: R.filter(r => B.validada(r)).length,
    rationaleDaEspec: R.filter(r => r.rationale && r.provenance === 'especificacao').length,
    estadoComFaixa: B.MOMENTUM.estados.filter(e => e.ate !== undefined).length,
    sonoComFaixa: B.SONO.indicadores.filter(
      i => i.adequado !== undefined || i.atencao !== undefined || i.prioridade !== undefined).length,
    momentumAutomatico: B.MOMENTUM.classificacao_automatica,
    sonoAutomatico: B.SONO.classificacao_automatica,
    redFlags: B.SINAIS_RED_FLAGS.length,
    frequencia: B.SINAIS_FREQUENCIA.join(',')
  };
});
ok(proc.quantas === 23, 'as 23 regras continuam cadastradas: ' + proc.quantas);
ok(proc.comSchema === 23,
   'e todas seguem o esquema do §18, com source E provenance separados: ' + proc.comSchema);
ok(proc.sourceValido, 'source é sempre uma origem funcional conhecida');
ok(proc.provValida, 'provenance é sempre uma procedência do vocabulário');
ok(proc.atribuidasAEspec === 0,
   'NENHUMA regra atribui a si a Especificação Mestre — porque nenhuma veio de lá');
ok(proc.legado === 15 && proc.minhas === 8,
   '15 herdadas do projeto, 8 escritas pela implementação: ' + proc.legado + ' + ' + proc.minhas);
ok(proc.estadoComFaixa === 0,
   'os estados de Momentum não têm mais faixa numérica — a especificação não dá nenhuma');
ok(proc.sonoComFaixa === 0, 'e os indicadores de sono também não');
ok(proc.momentumAutomatico === false && proc.sonoAutomatico === false,
   'os dois bancos declaram que não classificam automaticamente');
ok(proc.redFlags === 0,
   'e nenhuma red flag foi inventada — a lista do §9.7 aguarda o método');
ok(proc.frequencia === 'Nunca,Ocasional,Frequente,Quase diário',
   'a escala de frequência é a do §9.5, literal: ' + proc.frequencia);
ok(proc.legadoNaoValidado === 15,
   'as 15 herdadas dizem no próprio status que não foram validadas: ' +
   proc.legadoNaoValidado + ' em legado_nao_validado');
ok(proc.confirmadas === 0,
   'NENHUMA das 23 é uma regra validada do método — procedência não é validação');
ok(proc.rationaleDaEspec === 0,
   'e nenhum rationale legado é atribuído à Especificação Mestre');

/* ======================================= o não validado não entra no motor */

const motor = await p.evaluate(() => {
  const B = window.CorpoBancos;
  const ativas = B.regrasAtivas();
  return {
    ativas: ativas.length,
    naoValidadas: B.RECOMENDACOES.filter(r => r.status === 'rascunho_nao_validado').length,
    momentumAtivo: ativas.filter(r => r.condition.tipo === 'momentum').length,
    selecao: B.SELECAO,
    pendencias: B.pendencias().length
  };
});
ok(motor.naoValidadas === 8,
   'as 8 regras de Momentum estão marcadas não validadas: ' + motor.naoValidadas);
ok(motor.ativas === 15, 'e o motor só enxerga as outras 15: ' + motor.ativas);
ok(motor.momentumAtivo === 0,
   'nenhuma regra de Momentum executa hoje — não há mapeamento validado de estado para ferramenta');
ok(motor.selecao && motor.selecao.id === 'SEL-001' &&
   motor.selecao.provenance === 'decisao_implementacao',
   'as cotas da conduta saíram do app.js e viraram dado com procedência');
ok(motor.selecao.do_momentum === null && motor.selecao.momentum_aguarda_definicao === true,
   'a vaga do Momentum está vazia e declarada como tal — não foi redistribuída: ' +
   motor.selecao.do_pior_sistema + ' + ' + motor.selecao.do_segundo_sistema +
   ' + (Momentum: aguarda definição)');
ok(motor.pendencias > 0,
   'e o banco sabe dizer quantas decisões ainda esperam o Rodrigo: ' + motor.pendencias);

/* ==================================== a régua não nasce respondida ======= */

await abrirFerr('linha_momentum');
const reguaVirgem = await p.evaluate(() => {
  const caixa = document.querySelector('.grupo-nota');
  return {
    respondido: caixa.dataset.respondido,
    mostra: caixa.querySelector('output').textContent,
    temLimpar: !!caixa.querySelector('.nota-limpar')
  };
});
ok(reguaVirgem.respondido === '0' && reguaVirgem.mostra === '—',
   'a régua abre como NÃO respondida, mostrando traço e não 5: "' + reguaVirgem.mostra + '"');
ok(!reguaVirgem.temLimpar, 'e não oferece limpar o que ninguém respondeu');

const vazia = await p.evaluate(async () => {
  document.querySelector('[data-acao="concluir"]').click();
  await new Promise(r => setTimeout(r, 450));
  const app = window.Aplicacoes.ultima('linha_momentum');
  const dims = window.CorpoBancos.MOMENTUM.dimensoes.map(d => app.respostas[d.id]);
  return { dims, resultado: app.resultado };
});
ok(vazia.dims.every(v => v === null),
   'concluir sem responder grava null nas seis dimensões, não 5: ' + JSON.stringify(vazia.dims));
ok(vazia.resultado === null, 'e não inventa síntese sobre nada');

/* ============ Momentum: sem confirmação profissional, não há estado ====== */

const semEstado = await p.evaluate(async () => {
  document.querySelector('[data-acao="nova"]').click();
  await new Promise(r => setTimeout(r, 450));
  const v = { energia: 4, carga: 7, controle: 3, suporte: 5, espaco: 3, estabilidade: 4 };
  Object.keys(v).forEach(k => {
    const r = document.getElementById('campo-' + k);
    r.value = v[k];
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('[data-acao="rascunho"]').click();
  await new Promise(r => setTimeout(r, 400));
  const s = document.querySelector('.ferr-sintese');
  const res = window.Aplicacoes.rascunho('linha_momentum').resultado;
  return {
    estado: s.querySelector('.res-estado').innerText.replace(/\s+/g, ' '),
    aguardando: !!s.querySelector('.res-estado.aguardando'),
    estadoSugerido: res.estado_sugerido,
    temMedia: res.media !== undefined,
    temSustentam: res.sustentam !== undefined,
    confirmado: res.estado_confirmado,
    temOpcoes: !!document.querySelector('[data-campo="campo-estado_confirmado"]')
  };
});
ok(semEstado.estadoSugerido === null && semEstado.confirmado === null,
   'com as seis dimensões respondidas, o sistema ainda NÃO declara estado');
ok(!semEstado.temMedia,
   'não há média das dimensões — o §14.6 proíbe derivar o estado de um número só');
ok(!semEstado.temSustentam,
   'nem "sustentam/limitam" derivados: esses são os campos de texto de quem atende');
ok(semEstado.aguardando && /Ainda não definido/.test(semEstado.estado),
   'e a tela mostra a lacuna em vez de um estado neutro');
ok(!/Preservar|Reorganizar|Construir|Expandir/.test(semEstado.estado),
   'nenhum dos quatro estados aparece como leitura do sistema: ' + semEstado.estado);
ok(semEstado.temOpcoes, 'os quatro estados aparecem como escolha de quem atende');

const comEstado = await p.evaluate(async () => {
  const g = document.querySelector('[data-campo="campo-estado_confirmado"]');
  [...g.querySelectorAll('button')].find(b => b.dataset.valor === 'Reorganizar').click();
  const t = document.getElementById('campo-justificativa_estado');
  t.value = 'Controle sobre a rotina e espaço mental são os dois mais baixos.';
  t.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('[data-acao="rascunho"]').click();
  await new Promise(r => setTimeout(r, 400));
  return {
    texto: document.querySelector('.ferr-sintese').innerText.replace(/\s+/g, ' '),
    estado: window.Aplicacoes.rascunho('linha_momentum').resultado.estado_confirmado
  };
});
ok(comEstado.estado && comEstado.estado.id === 'reorganizar',
   'depois de escolhido, o estado fica guardado como confirmação profissional');
ok(/estado confirmado por você/i.test(comEstado.texto),
   'e a tela diz de quem é a leitura, em vez de fingir que foi do sistema');
ok(/retirar barreiras/.test(comEstado.texto),
   'a conduta do §14.5 aparece — ela é do documento, e essa parte não mudou');

/* ============================== sono: quatro indicadores, zero classificação */

await voltar();
if (await abrirFerr('ritmo_sono')) {
const tiposSono = await p.evaluate(() => ({
  deita: document.getElementById('campo-deita').type,
  acorda: document.getElementById('campo-acorda').type,
  grupos: [...document.querySelectorAll('.ferr-grupo-titulo')].map(h => h.textContent.trim())
}));
ok(tiposSono.deita === 'time' && tiposSono.acorda === 'time',
   'os horários do sono são campos de hora — §11.4: ' + tiposSono.deita);
ok(tiposSono.grupos.length >= 4,
   'e a ferramenta vem em seções: ' + tiposSono.grupos.slice(0, 4).join(' · '));

const sono = await p.evaluate(async () => {
  document.getElementById('campo-deita').value = '23:30';
  document.getElementById('campo-dorme').value = '00:45';
  document.getElementById('campo-acorda').value = '06:15';
  ['campo-deita', 'campo-dorme', 'campo-acorda'].forEach(id =>
    document.getElementById(id).dispatchEvent(new Event('change', { bubbles: true })));
  const marcar = (campo, valor) => {
    const g = document.querySelector('[data-campo="campo-' + campo + '"]');
    [...g.querySelectorAll('button')].find(x => x.dataset.valor === valor)?.click();
  };
  marcar('variacao', 'Mais de 2 horas');
  marcar('latencia', 'Mais de 30 minutos');
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('[data-acao="rascunho"]').click();
  await new Promise(r => setTimeout(r, 400));
  const s = document.querySelector('.ferr-sintese');
  return {
    texto: s.innerText.replace(/\s+/g, ' '),
    niveis: s.querySelectorAll('.res-nivel').length,
    semDado: s.querySelectorAll('.res-indicador.sem-dado').length,
    res: window.Aplicacoes.rascunho('ritmo_sono').resultado
  };
});
ok(/5\.5h/.test(sono.texto),
   'a duração é calculada dos horários, atravessando a meia-noite: 5.5h');
const quatro = ['Duração', 'Regularidade', 'Continuidade', 'Recuperação'];
ok(quatro.every(n => sono.texto.indexOf(n) >= 0),
   'os quatro indicadores do §11.5 aparecem separados');
ok(!/nota geral|score/i.test(sono.texto), 'e nenhuma nota única resume os quatro');
ok(sono.niveis === 0 && sono.res.classifica === false,
   'NENHUM deles é classificado em adequado/atenção/prioridade: não há faixa validada');
ok(sono.res.observados === 3 && sono.semDado === 1,
   'três foram observados e o quarto diz que ficou sem resposta: ' + sono.res.observados + ' de 4');
ok(/3 de 4 indicadores têm dados/.test(sono.texto),
   'e a frase conta os observados em vez de afirmar que os quatro estão bem');
ok(!/apareceram adequados/i.test(sono.texto),
   'a frase antiga, que afirmava quatro quando avaliara menos, não existe mais');

} else { pular('ritmo_sono', 'fora da galeria desde a revisao de Corpo/Mente/Espirito'); }

/* ============ energia: a queda não atravessa momento sem registro ======== */

await voltar();
if (await abrirFerr('energia_vital')) {

const dois = await p.evaluate(async () => {
  const dia = (i, v) => Object.keys(v).forEach(k => {
    const r = document.getElementById('campo-dias-' + i + '-' + k);
    if (!r) return;
    r.value = v[k];
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  dia(0, { acordar: 8, pos_almoco: 3, fim_tarde: 5, noite: 4 });
  document.querySelector('[data-mais-item]').click();
  await new Promise(r => setTimeout(r, 350));
  dia(1, { acordar: 7, pos_almoco: 3, fim_tarde: 6, noite: 4 });
  await new Promise(r => setTimeout(r, 400));
  return document.querySelector('.ferr-sintese').innerText.replace(/\s+/g, ' ');
});
ok(/Dados insuficientes para avaliar estabilidade/.test(dois),
   'com 2 observações por momento, a estabilidade não é calculada — e a tela diz isso');

const lista = await p.evaluate(async () => {
  document.querySelector('[data-mais-item]').click();
  await new Promise(r => setTimeout(r, 350));
  ['acordar', 'pos_almoco'].forEach((k, n) => {
    const r = document.getElementById('campo-dias-2-' + k);
    r.value = [8, 3][n];
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 450));
  document.querySelector('[data-acao="rascunho"]').click();
  await new Promise(r => setTimeout(r, 400));
  return {
    itens: document.querySelectorAll('.ferr-item').length,
    sintese: document.querySelector('.ferr-sintese').innerText.replace(/\s+/g, ' '),
    res: window.Aplicacoes.rascunho('energia_vital').resultado
  };
});
ok(lista.itens === 3, 'dá para acrescentar dias: ' + lista.itens);
ok(/3 dias registrados/.test(lista.sintese), 'e a síntese conta os três');
ok(lista.res.maior_queda.de === 'fim da tarde' && lista.res.maior_queda.para === 'à noite',
   'a maior queda é entre dois momentos REALMENTE consecutivos: ' +
   lista.res.maior_queda.de + ' → ' + lista.res.maior_queda.para);
ok(!/de ao acordar/.test(lista.sintese),
   'e nunca costura "ao acordar" com "depois do almoço" pulando o meio da manhã vazio');
ok(lista.res.serie.find(m => m.id === 'meio_manha').media === null,
   'o momento sem registro continua na série, vazio, em vez de sumir');
ok(lista.res.recorrencia.de === 2 && lista.res.dias === 3,
   'a recorrência só conta os dias com o par completo: ' +
   lista.res.recorrencia.de + ' pares em ' + lista.res.dias + ' dias registrados');
ok(/em 2 de 2 dias/.test(lista.sintese),
   'ou seja, "2 de 2" — não "2 de 3", que subestimaria a repetição');
ok(lista.res.estabilidade && lista.res.estabilidade.id === 'pos_almoco' &&
   lista.res.estabilidade.desvio === 0,
   'estabilidade é a MENOR variação, por desvio-padrão — não a maior média: ' +
   (lista.res.estabilidade || {}).nome);
ok(lista.res.estabilidade.registros >= lista.res.min_observacoes,
   'e só é declarada com pelo menos ' + lista.res.min_observacoes + ' observações');
ok(!/Maior estabilidade/.test(lista.sintese),
   'a frase antiga, que chamava de estável o momento de maior média, não existe mais');
ok(!/por causa|porque|indica|significa/i.test(lista.sintese),
   'a linguagem observa e não conclui');

/* ============================= histórico: nada sobrescreve =============== */

const hist = await p.evaluate(async () => {
  document.querySelector('[data-acao="concluir"]').click();
  await new Promise(r => setTimeout(r, 450));
  const deQuando = !!document.querySelector('.ferr-de-quando');
  document.querySelector('[data-acao="nova"]').click();
  await new Promise(r => setTimeout(r, 450));
  const apps = window.Aplicacoes.historico('energia_vital');
  return {
    deQuando,
    quantas: apps.length,
    estados: apps.map(a => a.status).sort(),
    primeiraTemDias: (apps.find(a => a.status === 'concluida').respostas.dias || []).length
  };
});
ok(hist.deQuando, 'reabrir mostra de quando é a aplicação, em vez de abrir em branco');
ok(hist.quantas === 2 && hist.estados.join(',') === 'concluida,rascunho',
   'começar outra guarda a anterior: ' + hist.estados.join(' + '));
ok(hist.primeiraTemDias === 3,
   'e a anterior continua com os três dias dentro: ' + hist.primeiraTemDias);

} else { pular('energia_vital', 'fora da galeria desde a revisao de Corpo/Mente/Espirito'); }

/* ============= sinais: nenhuma prioridade automática ==================== */

await voltar();
if (await abrirFerr('leitura_sinais')) {
const sinais = await p.evaluate(async () => {
  const texto = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const regua = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const opcao = (campo, valor) => {
    const g = document.querySelector('[data-campo="campo-' + campo + '"]');
    [...g.querySelectorAll('button')].find(b => b.dataset.valor === valor)?.click();
  };
  texto('campo-sinais-0-nome', 'Inchaço depois do almoço');
  regua('campo-sinais-0-intensidade', 9);
  opcao('sinais-0-frequencia', 'Quase diário');
  await new Promise(r => setTimeout(r, 450));
  document.querySelector('[data-acao="rascunho"]').click();
  await new Promise(r => setTimeout(r, 400));
  return {
    texto: document.querySelector('.ferr-sintese').innerText.replace(/\s+/g, ' '),
    res: window.Aplicacoes.rascunho('leitura_sinais').resultado,
    opcoesFrequencia: [...document.querySelectorAll(
      '[data-campo="campo-sinais-0-frequencia"] button')].map(b => b.dataset.valor)
  };
});
ok(sinais.opcoesFrequencia.join(',') === 'Nunca,Ocasional,Frequente,Quase diário',
   'a escala do formulário é a do §9.5: ' + sinais.opcoesFrequencia.join(' · '));
ok(sinais.res.para_aprofundar === undefined && sinais.res.sem_prioridade_automatica === true,
   'um sinal quase diário com intensidade 9 NÃO é eleito para aprofundamento pelo sistema');
ok(sinais.res.intensos === undefined,
   'e não há mais recorte por "intensidade 7 ou mais" — esse 7 era invenção da implementação');
ok(/a prioridade do método/i.test(sinais.texto),
   'a tela diz de quem é a decisão: acompanhar, aprofundar, correlacionar, encaminhar');
ok(sinais.res.por_frequencia.some(f => f.nome === 'Quase diário' && f.quantos === 1),
   'o que a síntese faz é contar, na escala do método: ' +
   JSON.stringify(sinais.res.por_frequencia));

} else { pular('leitura_sinais', 'fora da galeria desde a revisao de Corpo/Mente/Espirito'); }

/* ============= hábitos: matriz 2D, e ausência não vira "atrapalha" ======= */

await voltar();
if (await abrirFerr('inventario_habitos')) {
const habitos = await p.evaluate(async () => {
  const texto = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const regua = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const opcao = (campo, valor) => {
    const g = document.querySelector('[data-campo="campo-' + campo + '"]');
    [...g.querySelectorAll('button')].find(b => b.dataset.valor === valor)?.click();
  };
  texto('campo-habitos-0-habito', 'Alongar de manhã');
  regua('campo-habitos-0-impacto', 6);
  regua('campo-habitos-0-viabilidade', 6);
  opcao('habitos-0-consistencia', 'Não acontece');
  document.querySelector('[data-mais-item]').click();
  await new Promise(r => setTimeout(r, 350));
  texto('campo-habitos-1-habito', 'Marmita no domingo');
  regua('campo-habitos-1-impacto', 10);
  regua('campo-habitos-1-viabilidade', 2);
  opcao('habitos-1-consistencia', 'Consistente');
  await new Promise(r => setTimeout(r, 450));
  document.querySelector('[data-acao="rascunho"]').click();
  await new Promise(r => setTimeout(r, 400));
  const s = document.querySelector('.ferr-sintese');
  return {
    texto: s.innerText.replace(/\s+/g, ' '),
    temMatriz: !!s.querySelector('.res-matriz svg'),
    pontos: s.querySelectorAll('.mx-ponto').length,
    res: window.Aplicacoes.rascunho('inventario_habitos').resultado
  };
});
ok(habitos.res.matriz.every(h => h.alavancagem === undefined),
   'não existe mais "alavancagem = impacto + viabilidade": uma soma não é uma matriz');
ok(habitos.res.candidatos === undefined && habitos.res.sem_ordenacao_automatica === true,
   'e o sistema não ordena candidatos — (10,2) e (6,6) não são comparáveis por soma');
ok(habitos.temMatriz && habitos.pontos === 2,
   'a matriz do §12.6 é desenhada em dois eixos, um ponto por hábito: ' + habitos.pontos);
ok(habitos.res.ausentes === undefined && habitos.res.sustentam === undefined,
   'o campo "ausentes" sumiu: um hábito que não acontece não é um hábito que atrapalha');
ok(!/atrapalha/i.test(habitos.texto),
   'e a tela não afirma o que nenhum campo mede');
ok(habitos.res.por_consistencia.some(c => c.nome === 'Não acontece' && c.quantos === 1),
   'o que resta é a contagem do que foi relatado: ' +
   JSON.stringify(habitos.res.por_consistencia));

} else { pular('inventario_habitos', 'fora da galeria desde a revisao de Corpo/Mente/Espirito'); }

/* ============= compromisso: nenhum corte de confiança =================== */

await voltar();
if (await abrirFerr('check_comprometimento')) {
const compromisso = await p.evaluate(async () => {
  const texto = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const regua = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  texto('campo-acordos-0-acao', 'Caminhar 10 minutos depois do almoço');
  regua('campo-acordos-0-importancia', 9);
  regua('campo-acordos-0-confianca', 3);
  regua('campo-acordos-0-dificuldade', 7);
  await new Promise(r => setTimeout(r, 450));
  document.querySelector('[data-acao="rascunho"]').click();
  await new Promise(r => setTimeout(r, 400));
  return {
    texto: document.querySelector('.ferr-sintese').innerText.replace(/\s+/g, ' '),
    res: window.Aplicacoes.rascunho('check_comprometimento').resultado,
    temPergunta: !!document.getElementById('campo-aumentar_confianca')
  };
});
ok(compromisso.res.frageis === undefined && compromisso.res.sugestao === undefined,
   'confiança 3 NÃO dispara alerta nenhum: o corte em 7 não tinha fonte');
ok(compromisso.res.sem_limiar_de_confianca === true,
   'e a síntese declara que não há limiar validado');
ok(!/Redesenhe a ação/.test(compromisso.texto),
   'a frase do §15.8 não é disparada automaticamente enquanto não houver regra');
ok(compromisso.temPergunta,
   'mas a pergunta do §15.7 continua ali, para qualquer nota — ela não depende de limiar');
ok(/confiança média/.test(compromisso.texto), 'as notas aparecem como foram dadas');

} else { pular('check_comprometimento', 'fora da galeria desde a revisao de Corpo/Mente/Espirito'); }

/* ============= rotina: mede e mostra, sem classificar =================== */

await voltar();
if (await abrirFerr('mapa_rotina')) {
const rotina = await p.evaluate(async () => {
  const texto = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const regua = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const opcao = (campo, valor) => {
    const g = document.querySelector('[data-campo="campo-' + campo + '"]');
    [...g.querySelectorAll('button')].find(b => b.dataset.valor === valor)?.click();
  };
  /* 4h30 entre as duas refeições, e picos de 6 e 5. Sob os limiares antigos
     — 5h, fome 8, estresse 8 — NADA disto apareceria na tela. */
  texto('campo-eventos-0-inicio', '08:00');
  texto('campo-eventos-0-titulo', 'Café da manhã');
  opcao('eventos-0-tipo', 'Refeição');
  regua('campo-eventos-0-fome', 3);
  regua('campo-eventos-0-estresse', 2);
  document.querySelector('[data-mais-item]').click();
  await new Promise(r => setTimeout(r, 350));
  texto('campo-eventos-1-inicio', '12:30');
  texto('campo-eventos-1-titulo', 'Almoço');
  opcao('eventos-1-tipo', 'Refeição');
  regua('campo-eventos-1-fome', 6);
  regua('campo-eventos-1-estresse', 5);
  await new Promise(r => setTimeout(r, 450));
  document.querySelector('[data-acao="rascunho"]').click();
  await new Promise(r => setTimeout(r, 400));
  return {
    texto: document.querySelector('.ferr-sintese').innerText.replace(/\s+/g, ' '),
    res: window.Aplicacoes.rascunho('mapa_rotina').resultado
  };
});
ok(rotina.res.maior_intervalo && rotina.res.maior_intervalo.min === 270,
   'o intervalo entre refeições é calculado sempre: ' +
   (rotina.res.maior_intervalo || {}).texto);
ok(/Maior intervalo observado entre refeições: 4h30/.test(rotina.texto),
   'e aparece na tela com 4h30 — abaixo do corte de 5h que existia antes');
ok(!/intervalo longo|muito tempo|crítico|preocupante/i.test(rotina.texto),
   'sem adjetivo: o sistema não diz que o intervalo é longo');
ok(rotina.res.pico_fome.valor === 6 && rotina.res.pico_estresse.valor === 5,
   'fome e estresse aparecem pelo máximo registrado, não por um corte em 8: ' +
   rotina.res.pico_fome.valor + ' e ' + rotina.res.pico_estresse.valor);
ok(rotina.texto.indexOf('Maior fome registrada 6/10 em 12:30') >= 0 &&
   rotina.texto.indexOf('Maior estresse registrado 5/10 em 12:30') >= 0,
   'e com o horário em que ocorreram, cada um na sua escala');
ok(rotina.res.observacoes.filter(o => o.indexOf('Maior fome') >= 0).length === 0,
   'e uma vez só — o pico é cartão, não é também frase');
ok(rotina.res.janela_vulneravel === undefined,
   'a "janela vulnerável" sumiu: somar fome com estresse criava uma terceira escala');
ok(!/carregada|vulner/i.test(rotina.texto),
   'e a tela não fala de janela carregada nem de vulnerabilidade');
ok(rotina.res.sem_limiar === true && !/Fome 8 ou mais|Estresse 8 ou mais/.test(rotina.texto),
   'nenhum limiar sobrou na rotina');

} else { pular('mapa_rotina', 'fora da galeria desde a revisao de Corpo/Mente/Espirito'); }

/* ============= diário: horários reais, sem agrupamento ================== */

await voltar();
if (await abrirFerr('diario_corporal')) {
const diario = await p.evaluate(async () => {
  const texto = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const regua = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  texto('campo-registros-0-quando', '2026-09-10');
  texto('campo-registros-0-hora', '09:00');
  regua('campo-registros-0-fome', 4);
  regua('campo-registros-0-energia', 7);
  document.querySelector('[data-mais-item]').click();
  await new Promise(r => setTimeout(r, 350));
  texto('campo-registros-1-quando', '2026-09-10');
  texto('campo-registros-1-hora', '20:00');
  regua('campo-registros-1-fome', 8);
  regua('campo-registros-1-energia', 3);
  await new Promise(r => setTimeout(r, 450));
  document.querySelector('[data-acao="rascunho"]').click();
  await new Promise(r => setTimeout(r, 400));
  return {
    texto: document.querySelector('.ferr-sintese').innerText.replace(/\s+/g, ' '),
    res: window.Aplicacoes.rascunho('diario_corporal').resultado
  };
});
ok(diario.res.suficiente === undefined,
   'não existe mais "dados suficientes a partir de 5 registros"');
ok(!/ainda não há padrão|começa a aparecer/i.test(diario.texto),
   'e a tela não declara que 2 registros são pouco — ninguém definiu quanto basta');
ok(diario.res.por_periodo === undefined && diario.res.sem_agrupamento === true,
   'os cortes manhã/tarde/noite sumiram: agrupar é onde o padrão nasce');
ok(!/manhã|tarde|noite/i.test(diario.texto),
   'nenhum período inventado aparece na tela');
ok(diario.res.por_hora.length === 2 &&
   diario.res.por_hora[0].hora === '09:00' && diario.res.por_hora[1].hora === '20:00',
   'os horários reais ficam, em ordem de relógio: ' +
   diario.res.por_hora.map(x => x.hora).join(' · '));
ok(/09:00/.test(diario.texto) && /20:00/.test(diario.texto),
   'e aparecem na tela como foram dados');
ok(/2 registros/.test(diario.texto) && /1 dia/.test(diario.texto),
   'o que o sistema afirma é a contagem: N registros em X dias');
} else { pular('diario_corporal', 'fora da galeria desde a revisao de Corpo/Mente/Espirito'); }

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
