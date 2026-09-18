/**
 * STORAGE MANIFEST — P0.2
 *
 * O manifesto e infraestrutura: ele DESCREVE o universo persistente, e nesta
 * rodada nao muda o comportamento de nada. Estes testes cobram duas coisas
 * diferentes, e vale nao confundi-las:
 *
 *   1. que o manifesto e COMPLETO e COERENTE — 13 entradas, ids unicos,
 *      nenhuma chave ativa de fora, metadados presentes, classificacao certa;
 *
 *   2. que ele nao mudou nada — as 8 tabelas de dados.js continuam as mesmas,
 *      na mesma ordem, e o app continua abrindo.
 *
 * Os adaptadores e o diagnostico sao somente leitura. O teste prova isso
 * medindo o disco antes e depois de rodar o diagnostico: byte a byte igual.
 */
import puppeteer from 'puppeteer-core';

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1400, height: 1200 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

/* ==================================================================== */
console.log('');
console.log('  1. O MANIFESTO — completo e coerente');
console.log('');
/* ==================================================================== */

const m = await p.evaluate(() => {
  const A = window.Armazenamento;
  return {
    existe: !!A,
    total: A.MANIFESTO.length,
    ids: A.MANIFESTO.map(e => e.id),
    chaves: A.MANIFESTO.map(e => e.chave),
    backends: A.MANIFESTO.map(e => e.backend),
    formas: A.MANIFESTO.map(e => e.forma),
    exportaveis: A.exportaveis().map(e => e.id),
    sensiveis: A.sensiveis().map(e => e.id),
    porPaciente: A.porPaciente().map(e => ({ id: e.id, escopo: e.escopo, campo: e.campoPaciente })),
    semPaciente: A.SEM_PACIENTE,
    marcas: A.MARCAS_DE_MIGRACAO.map(x => x.id),
    legadas: A.CAIXAS_LEGADAS_CONSUMIDAS.map(x => x.id),
    aparencia: A.porId('aparencia'),
    /* todo campo obrigatorio presente em toda entrada */
    faltando: A.MANIFESTO.map(e => {
      const req = ['id', 'backend', 'chave', 'forma', 'categoria', 'pacienteScoped',
                   'exportar', 'importar', 'excluirComPaciente', 'limparTudo',
                   'derivavel', 'sensivel', 'versao'];
      const ausentes = req.filter(k => !Object.prototype.hasOwnProperty.call(e, k));
      return ausentes.length ? { id: e.id, ausentes } : null;
    }).filter(Boolean)
  };
});

/* A — as 13 conhecidas, nem mais nem menos */
const ESPERADAS = ['pacientes', 'aplicacoes', 'consultas', 'bloqueios', 'holoscope',
                   'oq3', 'pqq', 'perfil', 'questionario', 'pontuacao', 'exames',
                   'aparencia', 'arquivos'];
ok(m.existe, 'window.Armazenamento existe');
ok(m.total === 13, 'o manifesto tem exatamente 13 armazenamentos: ' + m.total);
ok(ESPERADAS.every(id => m.ids.indexOf(id) >= 0) && m.ids.length === ESPERADAS.length,
   'e sao os 13 conhecidos, sem sobra nem falta');

/* B — ids unicos */
ok(new Set(m.ids).size === m.ids.length,
   'os ids sao unicos: ' + new Set(m.ids).size + ' de ' + m.ids.length);

/* D — nenhuma chave repetida sem justificativa */
ok(new Set(m.chaves).size === m.chaves.length,
   'e nenhuma chave persistente aparece em duas entradas: ' +
   new Set(m.chaves).size + ' de ' + m.chaves.length);

/* E — metadados obrigatorios */
ok(m.faltando.length === 0,
   'toda entrada declara os 13 metadados obrigatorios' +
   (m.faltando.length ? ': FALTA ' + JSON.stringify(m.faltando) : ''));

/* backends e formas dentro do vocabulario */
const d = await p.evaluate(() => {
  const A = window.Armazenamento;
  return {
    backendsValidos: A.MANIFESTO.every(e => Object.values(A.BACKEND).indexOf(e.backend) >= 0),
    formasValidas: A.MANIFESTO.every(e => Object.values(A.FORMA).indexOf(e.forma) >= 0),
    escoposValidos: A.MANIFESTO.every(e => Object.values(A.ESCOPO).indexOf(e.escopo) >= 0),
    tresFormas: {
      lista: A.porForma(A.FORMA.LISTA).length,
      mapa: A.porForma(A.FORMA.MAPA).length,
      loja: A.porForma(A.FORMA.LOJA).length
    }
  };
});
ok(d.backendsValidos && d.formasValidas && d.escoposValidos,
   'backend, forma e escopo de toda entrada saem dos vocabularios declarados');
ok(d.tresFormas.lista === 8 && d.tresFormas.mapa === 4 && d.tresFormas.loja === 1,
   'as tres formas cobrem as 13: lista=' + d.tresFormas.lista +
   ' mapaPorPaciente=' + d.tresFormas.mapa + ' objectStore=' + d.tresFormas.loja);

/* ==================================================================== */
console.log('');
console.log('  2. CHAVES DE FORA, MARCAS E LEGADO');
console.log('');
/* ==================================================================== */

/* C — nenhuma chave persistente ATIVA fora do manifesto. O teste le o proprio
   disco depois de o app ter rodado, e confere cada chave contra o manifesto,
   as marcas de migracao e as caixas legadas ja consumidas. */
const soltas = await p.evaluate(() => {
  const A = window.Armazenamento;
  const conhecidas = new Set([
    ...A.MANIFESTO.map(e => e.chave),
    ...A.MARCAS_DE_MIGRACAO.map(x => x.chave),
    ...A.CAIXAS_LEGADAS_CONSUMIDAS.map(x => x.chave)
  ]);
  return Object.keys(localStorage)
    .filter(k => k.indexOf('holohacking') === 0)
    .filter(k => !conhecidas.has(k));
});
ok(soltas.length === 0,
   'nenhuma chave holohacking.* no disco esta fora do manifesto, das marcas ou ' +
   'do legado' + (soltas.length ? ': ' + JSON.stringify(soltas) : ''));

ok(m.marcas.length === 2 && m.marcas.indexOf('oq3.migrado') >= 0 &&
   m.marcas.indexOf('pqq.migrado') >= 0,
   'as marcas de migracao estao registradas a parte, nao como armazenamento: ' +
   m.marcas.join(', '));
ok(m.legadas.length === 2 && m.legadas.indexOf('ferramentas') >= 0 &&
   m.legadas.indexOf('agenda') >= 0,
   'e as caixas legadas ja consumidas idem: ' + m.legadas.join(', '));

const marcasFora = await p.evaluate(() => {
  const A = window.Armazenamento;
  return A.MARCAS_DE_MIGRACAO.every(x => x.exportar === false && x.importar === false);
});
ok(marcasFora, 'nenhuma marca de migracao entra em backup — nem na ida nem na volta');

/* ==================================================================== */
console.log('');
console.log('  3. CLASSIFICACAO');
console.log('');
/* ==================================================================== */

/* F/G — sensibilidade e o caso aparencia */
ok(m.exportaveis.length === 12,
   'entradas com exportar:true: ' + m.exportaveis.length + ' de 13');
ok(m.exportaveis.indexOf('aparencia') === -1,
   'a unica de fora e aparencia — e essa omissao esta CERTA: preferencia de ' +
   'quem usa este navegador, regeneravel');
ok(m.aparencia.exportar === false && m.aparencia.importar === false,
   'aparencia nao entra no Backup V2 clinico, nem na ida nem na volta');
ok(m.aparencia.excluirComPaciente === false && m.aparencia.limparTudo === true,
   'nao participa da exclusao de paciente, participa do limpar tudo');
ok(m.aparencia.derivavel === true && m.aparencia.categoria === 'configuracao',
   'e esta classificada como configuracao regeneravel');

const CLINICAS = ['pacientes', 'aplicacoes', 'consultas', 'holoscope', 'oq3', 'pqq',
                  'questionario', 'pontuacao', 'exames', 'arquivos'];
ok(m.sensiveis.length === CLINICAS.length &&
   CLINICAS.every(id => m.sensiveis.indexOf(id) >= 0),
   'sensivel:true em ' + m.sensiveis.length + ' entradas — as que carregam dado ' +
   'de pessoa: ' + m.sensiveis.join(', '));
ok(m.sensiveis.indexOf('bloqueios') === -1 && m.sensiveis.indexOf('perfil') === -1 &&
   m.sensiveis.indexOf('aparencia') === -1,
   'e bloqueios, perfil e aparencia ficam de fora — sao de quem atende ou do ' +
   'navegador, nao do paciente');

const naoDerivaveis = await p.evaluate(() => {
  const A = window.Armazenamento;
  return {
    pontuacao: A.porId('pontuacao').derivavel,
    holoscope: A.porId('holoscope').categoria,
    questionario: A.porId('questionario').derivavel
  };
});
ok(naoDerivaveis.pontuacao === false,
   'pontuacao NAO e derivavel: o questionario guarda um estado so, esta caixa ' +
   'guarda a serie — perdida, a comparacao 4/8/12 semanas vai junto');
ok(naoDerivaveis.holoscope === 'snapshot' && naoDerivaveis.questionario === false,
   'holoscope e snapshot e tambem se trata como fonte; questionario e fonte');

/* ==================================================================== */
console.log('');
console.log('  4. ESCOPO DE PACIENTE E O SENTINELA');
console.log('');
/* ==================================================================== */

/* H — as tres estrategias de identidade */
const porEscopo = (e) => m.porPaciente.filter(x => x.escopo === e).map(x => x.id);
ok(m.porPaciente.length === 9,
   'armazenamentos ligados a paciente: ' + m.porPaciente.length +
   ' (pacientes e a raiz, nao filho; bloqueios, perfil e aparencia sao globais)');

const A_CAMPO = ['aplicacoes', 'consultas', 'holoscope', 'oq3', 'pqq'];
const B_CHAVE = ['questionario', 'pontuacao', 'exames'];
ok(A_CAMPO.every(id => porEscopo('campo_paciente_id').indexOf(id) >= 0) &&
   porEscopo('campo_paciente_id').length === 5,
   'A — campo paciente_id: ' + porEscopo('campo_paciente_id').join(', '));
ok(B_CHAVE.every(id => porEscopo('chave_do_mapa').indexOf(id) >= 0) &&
   porEscopo('chave_do_mapa').length === 3,
   'B — o pacienteId E a chave do mapa: ' + porEscopo('chave_do_mapa').join(', '));
ok(porEscopo('index_paciente').join(',') === 'arquivos',
   'C — IndexedDB, campo `paciente` com index: ' + porEscopo('index_paciente').join(', '));

const raizEGlobais = await p.evaluate(() => {
  const A = window.Armazenamento;
  return {
    raiz: A.porId('pacientes').escopo,
    raizScoped: A.porId('pacientes').pacienteScoped,
    globais: A.MANIFESTO.filter(e => e.escopo === A.ESCOPO.GLOBAL).map(e => e.id)
  };
});
ok(raizEGlobais.raiz === 'raiz' && raizEGlobais.raizScoped === false,
   'pacientes e a RAIZ, nao um filho de si mesma');
ok(raizEGlobais.globais.join(',') === 'bloqueios,perfil,aparencia',
   'globais: ' + raizEGlobais.globais.join(', '));

/* I — o sentinela */
ok(m.semPaciente === '_sem_paciente',
   'o sentinela esta registrado como valor reservado: ' + m.semPaciente);
ok(m.ids.indexOf('_sem_paciente') === -1 &&
   m.porPaciente.every(x => x.id !== '_sem_paciente'),
   'e NAO aparece como paciente nem como armazenamento — uma cascata que o ' +
   'aceitasse como pacienteId apagaria o deposito de todos os orfaos de uma vez');

/* ==================================================================== */
console.log('');
console.log('  5. dados.js — as 8 tabelas, identicas');
console.log('');
/* ==================================================================== */

/* J */
const tabelas = await p.evaluate(() => window.DadosLocais._tabelas());
ok(tabelas.usadas.join(',') === tabelas.literais.join(','),
   'TABELAS derivadas do manifesto == TABELAS literais, item por item e NA ' +
   'MESMA ORDEM: ' + tabelas.usadas.join(', '));
ok(tabelas.usadas.length === 8, 'sao 8, como antes: ' + tabelas.usadas.length);

const api = await p.evaluate(() => {
  const D = window.DadosLocais;
  return {
    metodos: ['from', 'exportar', 'importar', 'resumo', 'apagarTudo', 'onde']
      .filter(k => k in D),
    resumoTemAsOito: Object.keys(D.resumo()).join(',')
  };
});
ok(api.metodos.length === 6,
   'a API publica de dados.js continua inteira: ' + api.metodos.join(', '));
ok(api.resumoTemAsOito === tabelas.literais.join(','),
   'e resumo() ainda devolve as mesmas 8 chaves, na mesma ordem');

/* ==================================================================== */
console.log('');
console.log('  6. ORDEM DE CARREGAMENTO');
console.log('');
/* ==================================================================== */

const ordem = await p.evaluate(() => {
  const srcs = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
  return {
    total: srcs.length,
    manifesto: srcs.indexOf('/armazenamento.js'),
    concorrencia: srcs.indexOf('/concorrencia.js'),
    validador: srcs.indexOf('/validar-backup.js'),
    restaurador: srcs.indexOf('/restaurar-backup.js'),
    v1: srcs.indexOf('/importar-v1.js'),
    exclusao: srcs.indexOf('/excluir-paciente.js'),
    login: srcs.indexOf('/login.js'),
    dados: srcs.indexOf('/dados.js')
  };
});
ok(ordem.manifesto >= 0, 'armazenamento.js esta no index.html');
ok(ordem.manifesto < ordem.dados,
   'e carrega ANTES de dados.js, que depende dele: posicao ' +
   ordem.manifesto + ' contra ' + ordem.dados);
/* 22 era o numero antes do P0. Cada etapa que acrescenta uma tag sobe este
   numero de proposito: o manifesto (P0.2), o validador (P0.4a) e o motor de
   restauracao (P0.4b). O teste conta para que nenhuma entre sem ninguem
   reparar — e foi exatamente o que ele fez quando login.js entrou, e de novo
   na Fase 1 do Supabase (CDN do supabase-js + supabase-client.js +
   dados-router.js, as tres antes de dados.js/app.js consumirem `sb`). */
ok(ordem.total === 32,
   'o index tem 32 tags de script: 22 de antes do P0 + concorrencia.js + ' +
   'armazenamento.js + validar-backup.js + restaurar-backup.js + ' +
   'importar-v1.js + excluir-paciente.js + login.js + CDN supabase-js + ' +
   'supabase-client.js + dados-router.js — ' + ordem.total);
/* A tela de entrada e a ultima a carregar: nada do app depende dela, e ela
   nao depende de nada do app. Se um dia depender, esta linha cai junto. */
ok(ordem.login === ordem.total - 1,
   'login.js e a ultima tag do index: posicao ' + ordem.login + ' de ' + ordem.total);
ok(ordem.exclusao > ordem.restaurador,
   'e excluir-paciente.js vem depois do motor, que ele usa: posicao ' +
   ordem.exclusao + ' contra ' + ordem.restaurador);
ok(ordem.v1 > ordem.restaurador,
   'e importar-v1.js vem depois do motor de restauracao, que ele usa: ' +
   'posicao ' + ordem.v1 + ' contra ' + ordem.restaurador);
ok(ordem.concorrencia >= 0 && ordem.concorrencia < ordem.manifesto,
   'e concorrencia.js vem antes de tudo que escreve: posicao ' +
   ordem.concorrencia);
ok(ordem.restaurador > ordem.validador,
   'e restaurar-backup.js vem depois do validador, que ele usa: posicao ' +
   ordem.restaurador + ' contra ' + ordem.validador);
ok(ordem.validador > ordem.manifesto,
   'e validar-backup.js vem DEPOIS de armazenamento.js, que ele estende: ' +
   'posicao ' + ordem.validador + ' contra ' + ordem.manifesto);
ok(ruim.length === 0,
   'e o app inicializa sem erro de JS' + (ruim.length ? ': ' + ruim[0] : ''));

/* ==================================================================== */
console.log('');
console.log('  7. ADAPTADORES — somente leitura');
console.log('');
/* ==================================================================== */

const semear = () => p.evaluate(async () => {
  localStorage.clear();
  const antigos = await window.ArquivoStore.listarTudo();
  await Promise.all(antigos.map(i => window.ArquivoStore.remover(i.id).catch(() => {})));

  const guardar = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const P = 'holohacking.dados.';
  guardar(P + 'pacientes', [
    { id: 'pac-A', nome: 'Ana Fonte', created_at: '2026-01-01T10:00:00.000Z' },
    { id: 'pac-B', nome: 'Bruno Outro', created_at: '2026-01-02T10:00:00.000Z' }
  ]);
  guardar(P + 'aplicacoes', [
    { id: 'ap-1', paciente_id: 'pac-A', ferramenta_id: 'oq3' },
    { id: 'ap-2', paciente_id: 'pac-A', ferramenta_id: 'pqq' },
    { id: 'ap-3', paciente_id: 'pac-B', ferramenta_id: 'oq3' },
    { id: 'ap-4', paciente_id: 'pac-FANTASMA', ferramenta_id: 'oq3' },
    { id: 'ap-5', paciente_id: '_sem_paciente', ferramenta_id: 'oq3' }
  ]);
  guardar(P + 'consultas', [{ id: 'c-1', paciente_id: 'pac-A' }]);
  guardar(P + 'holoscope', [{ id: 'h-1', paciente_id: 'pac-A' }]);
  guardar(P + 'oq3', [{ id: 'o-1', paciente_id: 'pac-A' }]);
  guardar(P + 'pqq', [{ id: 'q-1', paciente_id: 'pac-A' }]);
  guardar(P + 'bloqueios', [{ id: 'b-1', titulo: 'almoco' }]);
  guardar(P + 'perfil', [{ id: 'pf-1', nome: 'Nutricionista' }]);

  guardar('holohacking.questionario', {
    'pac-A': { m1: 3 }, 'pac-B': { m1: 1 }, 'pac-FANTASMA': { m1: 2 }
  });
  guardar('holohacking.pontuacao', { 'pac-A': [{ indice: 50 }], 'pac-FANTASMA': [{ indice: 9 }] });
  guardar('holohacking.exames', { 'pac-A': { ferritina: 30 }, '_sem_paciente': { ferritina: 1 } });
  guardar('holohacking.aparencia', 'escuro');

  /* Dois documentos DIFERENTES de proposito. ArquivoStore.salvar monta o id
     com Date.now() + hash(nome + tamanho) e grava com loja.add(): dois
     arquivos de mesmo nome e mesmo tamanho salvos no mesmo milissegundo
     colidem e a promessa rejeita. E caracteristica do app, nao do manifesto —
     reportada, nao corrigida nesta rodada. Aqui basta nao esbarrar nela. */
  const docA = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' });
  docA.name = 'laudo-a.pdf';
  const docF = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'application/pdf' });
  docF.name = 'laudo-f.pdf';
  await window.ArquivoStore.salvar('pac-A', docA, { nome: 'Laudo A', tipo: 'Exame' });
  await window.ArquivoStore.salvar('pac-FANTASMA', docF, { nome: 'Laudo F', tipo: 'Exame' });
  return true;
});

await semear();

/* K — adaptador lista */
const lista = await p.evaluate(async () => {
  const A = window.Armazenamento;
  const e = A.porId('aplicacoes');
  const ad = A.adaptador(e);
  return {
    forma: ad.forma,
    tudo: ad.lerTudo(e).length,
    doA: ad.doPaciente(e, 'pac-A').map(l => l.id),
    doB: ad.doPaciente(e, 'pac-B').map(l => l.id),
    semA: ad.semOPaciente(e, 'pac-A').map(l => l.id),
    citados: ad.pacientesCitados(e).sort(),
    /* e a raiz, que identifica pelo proprio id */
    raizDoA: A.adaptador(A.porId('pacientes')).doPaciente(A.porId('pacientes'), 'pac-A')
      .map(l => l.nome),
    /* nada foi gravado */
    discoDepois: localStorage.getItem('holohacking.dados.aplicacoes')
  };
});
ok(lista.forma === 'lista' && lista.tudo === 5,
   'adaptador `lista`: le as 5 linhas de aplicacoes');
ok(lista.doA.join(',') === 'ap-1,ap-2',
   'seleciona o paciente certo: pac-A -> ' + lista.doA.join(', '));
ok(lista.doB.join(',') === 'ap-3',
   'e o outro paciente sai intacto e separado: pac-B -> ' + lista.doB.join(', '));
ok(lista.semA.join(',') === 'ap-3,ap-4,ap-5',
   'a versao sem o paciente preserva todo o resto: ' + lista.semA.join(', '));
ok(lista.raizDoA.join(',') === 'Ana Fonte',
   'na tabela raiz ele identifica pelo proprio id, nao por paciente_id');
ok(lista.citados.join(',') === '_sem_paciente,pac-A,pac-B,pac-FANTASMA',
   'e lista os ids citados sem repetir: ' + lista.citados.join(', '));
ok(JSON.parse(lista.discoDepois).length === 5,
   'o disco continua com as 5 linhas — semOPaciente devolve valor, nao grava');

/* L — adaptador mapaPorPaciente */
const mapa = await p.evaluate(() => {
  const A = window.Armazenamento;
  const e = A.porId('questionario');
  const ad = A.adaptador(e);
  const antes = localStorage.getItem(e.chave);
  const doA = ad.doPaciente(e, 'pac-A');
  const sem = ad.semOPaciente(e, 'pac-A');
  return {
    forma: ad.forma,
    chaves: Object.keys(ad.lerTudo(e)).sort(),
    doA: JSON.stringify(doA),
    doB: JSON.stringify(ad.doPaciente(e, 'pac-B')),
    inexistente: ad.doPaciente(e, 'pac-NAO-EXISTE'),
    semChaves: Object.keys(sem).sort(),
    semConteudoB: JSON.stringify(sem['pac-B']),
    /* aparencia e global: a chave nao e paciente */
    aparenciaCitados: A.adaptador(A.porId('aparencia')).pacientesCitados(A.porId('aparencia')),
    igual: localStorage.getItem(e.chave) === antes
  };
});
ok(mapa.forma === 'mapaPorPaciente' && mapa.chaves.join(',') === 'pac-A,pac-B,pac-FANTASMA',
   'adaptador `mapaPorPaciente`: le as chaves do mapa: ' + mapa.chaves.join(', '));
ok(mapa.doA === '{"m1":3}' && mapa.doB === '{"m1":1}',
   'seleciona a chave certa, e so ela: pac-A -> ' + mapa.doA);
ok(mapa.inexistente === null,
   'paciente sem chave devolve null, nao um objeto vazio que se confundiria ' +
   'com "respondeu e deu vazio"');
ok(mapa.semChaves.join(',') === 'pac-B,pac-FANTASMA' && mapa.semConteudoB === '{"m1":1}',
   'a versao sem o paciente preserva os outros inteiros: ' + mapa.semChaves.join(', '));
ok(mapa.aparenciaCitados.length === 0,
   'numa caixa global a chave nao e paciente — aparencia nao cita ninguem');
ok(mapa.igual, 'e o disco continua identico: o adaptador nao grava');

/* M — adaptador objectStore */
const loja = await p.evaluate(async () => {
  const A = window.Armazenamento;
  const e = A.porId('arquivos');
  const ad = A.adaptador(e);
  const antes = (await window.ArquivoStore.listarTudo()).length;
  const doA = await ad.doPaciente(e, 'pac-A');
  const doF = await ad.doPaciente(e, 'pac-FANTASMA');
  const chavesA = await ad.chavesDoPaciente(e, 'pac-A');
  const citados = await ad.pacientesCitados(e);
  return {
    forma: ad.forma, disponivel: ad.disponivel(),
    descricao: e.loja,
    tudo: (await ad.lerTudo()).length,
    doA: doA.map(i => i.nome), doF: doF.map(i => i.nome),
    chavesA: chavesA.length, chaveEhId: chavesA.every(k => typeof k === 'string'),
    citados: citados.sort(),
    depois: (await window.ArquivoStore.listarTudo()).length, antes
  };
});
ok(loja.forma === 'objectStore' && loja.disponivel,
   'adaptador `objectStore`: disponivel via ArquivoStore');
ok(loja.descricao.banco === 'holohacking' && loja.descricao.nome === 'arquivos' &&
   loja.descricao.keyPath === 'id' && loja.descricao.indice === 'paciente',
   'o manifesto DESCREVE como listar: banco/loja/keyPath/index — ' +
   JSON.stringify(loja.descricao));
ok(loja.tudo === 2 && loja.doA.join(',') === 'Laudo A',
   'lista por paciente sem misturar: pac-A -> ' + loja.doA.join(', '));
ok(loja.doF.join(',') === 'Laudo F',
   'e o outro dono sai separado: pac-FANTASMA -> ' + loja.doF.join(', '));
ok(loja.chavesA === 1 && loja.chaveEhId,
   'identifica as chaves do paciente — o que uma transacao futura precisaria: ' +
   loja.chavesA);
ok(loja.citados.join(',') === 'pac-A,pac-FANTASMA',
   'ids citados: ' + loja.citados.join(', '));
ok(loja.antes === loja.depois && loja.depois === 2,
   'e os 2 documentos continuam la: o adaptador NAO remove nada [a remocao ' +
   'real e P0.6, e de proposito nao existe ainda]');

/* ==================================================================== */
console.log('');
console.log('  8. DIAGNOSTICO — somente leitura');
console.log('');
/* ==================================================================== */

/* N + O */
const diag = await p.evaluate(async () => {
  /* retrato do disco inteiro ANTES */
  const retrato = () => {
    const o = {};
    Object.keys(localStorage).sort().forEach(k => { o[k] = localStorage.getItem(k); });
    return JSON.stringify(o);
  };
  const antes = retrato();
  const docsAntes = (await window.ArquivoStore.listarTudo()).length;
  const r = await window.Armazenamento.diagnosticarIntegridade();
  return {
    r,
    intacto: retrato() === antes,
    docsIguais: (await window.ArquivoStore.listarTudo()).length === docsAntes
  };
});

const orfaosPor = {};
diag.r.orfaos.forEach(o => { orfaosPor[o.armazenamento] = o; });

ok(diag.r.ok === false,
   'com orfaos semeados, o diagnostico diz ok:false');
ok(diag.r.orfaos.every(o => o.paciente_id === 'pac-FANTASMA'),
   'e todos os orfaos apontam para o id que nao existe na raiz: pac-FANTASMA');
ok(!!orfaosPor.aplicacoes && orfaosPor.aplicacoes.quantidade === 1,
   'detecta orfao em `aplicacoes` (campo paciente_id): ' +
   (orfaosPor.aplicacoes || {}).quantidade + ' registro(s)');
ok(!!orfaosPor.questionario && !!orfaosPor.pontuacao,
   'detecta orfao nos mapas — questionario e pontuacao (chave do mapa)');
ok(!!orfaosPor.arquivos && orfaosPor.arquivos.quantidade === 1,
   'e no IndexedDB (index paciente): ' + (orfaosPor.arquivos || {}).quantidade +
   ' documento(s)');
ok(diag.r.sem_paciente.length === 2,
   '_sem_paciente sai em lista PROPRIA, nao como orfao: ' +
   diag.r.sem_paciente.map(x => x.armazenamento).join(', '));
ok(diag.r.orfaos.every(o => o.paciente_id !== '_sem_paciente'),
   'e nao aparece entre os orfaos em lugar nenhum — nao e paciente removido, ' +
   'e o deposito de quem respondeu fora de um cadastro');
ok(typeof diag.r.totais.pacientes === 'number' && diag.r.totais.pacientes === 2,
   'o retorno e estruturado e auditavel: totais.pacientes = ' + diag.r.totais.pacientes);
ok(diag.r.alterou_dado === false && diag.intacto && diag.docsIguais,
   'e o diagnostico NAO alterou nada: localStorage byte a byte igual, e os ' +
   'documentos do IndexedDB intactos');

/* os 9 destinos que a exclusao deixa para tras sao alcancaveis pelo manifesto */
const noveDestinos = await p.evaluate(() => {
  const A = window.Armazenamento;
  return A.MANIFESTO
    .filter(e => e.excluirComPaciente && e.id !== 'pacientes')
    .map(e => e.id);
});
ok(noveDestinos.length === 9,
   'o manifesto declara os 9 destinos que uma exclusao precisa alcancar alem ' +
   'do cadastro: ' + noveDestinos.join(', '));
ok(noveDestinos.every(id => ['aplicacoes', 'consultas', 'holoscope', 'oq3', 'pqq',
                             'questionario', 'pontuacao', 'exames', 'arquivos']
                             .indexOf(id) >= 0),
   'e sao exatamente os 9 que o teste de persistencia mostrou ficando orfaos hoje');

/* P — estado limpo */
const limpo = await p.evaluate(async () => {
  localStorage.clear();
  const antigos = await window.ArquivoStore.listarTudo();
  await Promise.all(antigos.map(i => window.ArquivoStore.remover(i.id).catch(() => {})));
  const P = 'holohacking.dados.';
  localStorage.setItem(P + 'pacientes', JSON.stringify([{ id: 'pac-A', nome: 'Ana Fonte' }]));
  localStorage.setItem(P + 'aplicacoes', JSON.stringify([{ id: 'ap-1', paciente_id: 'pac-A' }]));
  localStorage.setItem('holohacking.questionario', JSON.stringify({ 'pac-A': { m1: 3 } }));
  return await window.Armazenamento.diagnosticarIntegridade();
});
ok(limpo.ok === true,
   'estado coerente — todo dado ligado a um paciente que existe — devolve ok:true');
ok(limpo.orfaos.length === 0 && limpo.sem_paciente.length === 0,
   'sem orfaos e sem sentinela: ' + limpo.orfaos.length + ' e ' +
   limpo.sem_paciente.length);

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
