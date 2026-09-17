/**
 * ROBUSTEZ DA MIGRAÇÃO LEGADA DO OQ³.
 *
 * O OQ³ antigo gravava uma linha na tabela `oq3` a cada "Salvar". Um paciente
 * acompanhado por um ano tem VÁRIAS linhas — e é justamente isso que a
 * migração precisa devolver, uma aplicação por linha, com a data de cada uma.
 *
 * Este teste não olha conteúdo clínico: olha se a migração perde, duplica ou
 * embaralha registros. Quatro cenários:
 *
 *   1  três linhas do mesmo paciente viram três aplicações distintas;
 *   2  rodar de novo sem a marca do localStorage não duplica nada — a
 *      proteção tem que estar nos dados, não numa chave do navegador;
 *   3  migração parcial (uma linha já migrada, marca ausente) completa as
 *      que faltam sem tocar na que já estava;
 *   4  a tabela de origem nunca é apagada.
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

const PID = 'paciente-historico-longo';

/* As três consultas de Joana ao longo de um ano. Datas distintas de propósito:
   é a ordem histórica que a migração tem que preservar. */
const LINHAS = [
  { id: 'oq3-a', created_at: '2025-02-03T13:00:00.000Z', paciente_id: PID,
    data_consulta: '2025-02-03', quer: 'Dormir melhor',
    precisa: 'Acorda de madrugada', consegue: 'Desligar a tela as 22h',
    alavancas: 'Ritual antes de dormir' },
  { id: 'oq3-b', created_at: '2025-06-11T09:20:00.000Z', paciente_id: PID,
    data_consulta: '2025-06-11', quer: 'Voltar a caminhar',
    precisa: 'Dor no joelho', consegue: 'Quinze minutos por dia',
    alavancas: 'Caminhar com a vizinha' },
  { id: 'oq3-c', created_at: '2025-11-27T16:45:00.000Z', paciente_id: PID,
    data_consulta: '2025-11-27', quer: 'Chegar bem no fim do ano',
    precisa: 'Ansiedade nas festas', consegue: 'Cozinhar no domingo',
    alavancas: 'Combinar o cardapio antes' }
];

const semear = (linhas, aplicacoes) => p.evaluate((x) => {
  localStorage.clear();
  localStorage.setItem('holohacking.dados.pacientes', JSON.stringify([
    { id: x.pid, created_at: '2025-01-02T10:00:00.000Z', nome: 'Joana Antiga' }
  ]));
  localStorage.setItem('holohacking.dados.oq3', JSON.stringify(x.linhas));
  if (x.aplicacoes) {
    localStorage.setItem('holohacking.dados.aplicacoes', JSON.stringify(x.aplicacoes));
  }
}, { pid: PID, linhas, aplicacoes });

const recarregar = async () => {
  await p.reload({ waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
  await new Promise(r => setTimeout(r, 900));
};

const ler = () => p.evaluate((pid) => {
  const h = window.Aplicacoes.historico('oq3', pid);
  return {
    quantas: h.length,
    apps: h.map(a => ({
      quer: a.respostas && a.respostas.quer,
      iniciada: a.iniciada_em,
      concluida: a.concluida_em,
      versao: a.versao_ferramenta,
      status: a.status,
      resultado: a.resultado,
      paciente: a.paciente_id,
      origem: a.origem_legada || null
    })),
    linhasAntigas: (window.DadosLocais.exportar().tabelas.oq3 || []).length
  };
}, PID);

/* ==================================================================== */
console.log('\n  CENÁRIO 1 — três linhas legadas do mesmo paciente\n');
/* ==================================================================== */

await semear(LINHAS, null);
await recarregar();
const c1 = await ler();

ok(c1.quantas === 3,
   'as três linhas viram TRÊS aplicações — nenhuma some: ' + c1.quantas);
ok(['Dormir melhor', 'Voltar a caminhar', 'Chegar bem no fim do ano']
     .every(q => c1.apps.some(a => a.quer === q)),
   'cada uma com o seu conteúdo, sem misturar: ' +
   c1.apps.map(a => a.quer).join(' · '));
ok(c1.apps.every(a => a.paciente === PID), 'todas sob o mesmo paciente');
ok(LINHAS.every(l => c1.apps.some(a => a.concluida === l.created_at &&
                                       a.iniciada === l.created_at)),
   'e com o created_at real de cada linha, não a data da migração');
ok(c1.apps.every(a => a.versao === '0'),
   'todas marcadas versao_ferramenta "0" — anteriores ao catálogo versionado');
ok(c1.apps.every(a => a.status === 'concluida' && a.resultado === null),
   'concluídas, e sem resultado derivado');

/* historico() devolve da mais recente para a mais antiga */
ok(c1.apps[0].quer === 'Chegar bem no fim do ano' &&
   c1.apps[2].quer === 'Dormir melhor',
   'a ordem histórica é respeitada, da mais recente à mais antiga: ' +
   c1.apps.map(a => (a.concluida || '').slice(0, 10)).join(' > '));

/* O mecanismo que impede a duplicação mora no dado, e dá para vê-lo. */
ok(c1.apps.every(a => a.origem === 'oq3:' + LINHAS.find(
     l => l.created_at === a.concluida).id),
   'cada aplicação guarda de QUAL linha legada ela veio: ' +
   c1.apps.map(a => a.origem).sort().join(' · '));
ok(new Set(c1.apps.map(a => a.origem)).size === 3,
   'e as três chaves de origem são distintas — uma por linha');

/* ==================================================================== */
console.log('\n  CENÁRIO 2 — rodar de novo sem a marca do localStorage\n');
/* ==================================================================== */

/* A marca existe para poupar trabalho. Ela NÃO pode ser a única coisa que
   impede a duplicação: outro navegador, outra sessão, ou um localStorage
   limpo pela metade chegam aqui sem ela. */
const c2a = await p.evaluate(async (pid) => {
  localStorage.removeItem('holohacking.oq3.migrado');
  await window.Aplicacoes.migrarOQ3();
  return window.Aplicacoes.historico('oq3', pid).length;
}, PID);
ok(c2a === 3,
   'chamar a migração de novo, sem a marca, não duplica nada: ' + c2a);

/* E o mesmo por outro caminho: marca removida + recarga completa da página,
   que é o que acontece noutro navegador com os mesmos dados. */
await p.evaluate(() => localStorage.removeItem('holohacking.oq3.migrado'));
await recarregar();
const c2b = await ler();
ok(c2b.quantas === 3,
   'recarregar sem a marca também não duplica: ' + c2b.quantas);
ok(new Set(c2b.apps.map(a => a.quer)).size === 3,
   'e as três continuam distintas, uma por linha legada');

/* ==================================================================== */
console.log('\n  CENÁRIO 3 — migração parcial, sem marca\n');
/* ==================================================================== */

/* O estado mais perigoso: alguém já migrou UMA das três (numa versão anterior
   do app, antes de existir o campo que marca a origem), a marca não está lá, e
   a migração roda de novo. Ela precisa completar as duas que faltam sem tocar
   na que já existe. */
const jaMigrada = [{
  id: 'app-ja-migrada',
  created_at: LINHAS[1].created_at,
  paciente_id: PID,
  consulta_id: null,
  ferramenta_id: 'oq3',
  versao_ferramenta: '0',
  status: 'concluida',
  iniciada_em: LINHAS[1].created_at,
  concluida_em: LINHAS[1].created_at,
  atualizada_em: LINHAS[1].created_at,
  respostas: {
    data_consulta: LINHAS[1].data_consulta, quer: LINHAS[1].quer,
    precisa: LINHAS[1].precisa, consegue: LINHAS[1].consegue,
    alavancas: LINHAS[1].alavancas
  },
  resultado: null, leitura: null, prioridade: null, proximo_passo: null
  /* de propósito SEM origem_legada: é como ficaram as migradas por uma
     versão anterior desta rotina */
}];

await semear(LINHAS, jaMigrada);
await recarregar();
const c3 = await ler();

ok(c3.quantas === 3,
   'as duas que faltavam entram, e o total continua três: ' + c3.quantas);
ok(c3.apps.filter(a => a.quer === 'Voltar a caminhar').length === 1,
   'a que já estava migrada aparece UMA vez — não foi duplicada');
ok(c3.apps.filter(a => a.quer === 'Dormir melhor').length === 1 &&
   c3.apps.filter(a => a.quer === 'Chegar bem no fim do ano').length === 1,
   'as outras duas foram migradas, uma vez cada');
ok(LINHAS.every(l => c3.apps.some(a => a.concluida === l.created_at)),
   'nenhuma perdeu a sua data');

/* e rodar mais uma vez sobre o estado já completo continua estável */
const c3b = await p.evaluate(async (pid) => {
  localStorage.removeItem('holohacking.oq3.migrado');
  await window.Aplicacoes.migrarOQ3();
  return window.Aplicacoes.historico('oq3', pid).length;
}, PID);
ok(c3b === 3, 'e uma terceira execução continua em três: ' + c3b);

/* A que já estava migrada veio de uma versão que não gravava a origem: ela é
   reconhecida pelo carimbo, e é isso que a protege de entrar de novo. */
const c3c = await p.evaluate((pid) => {
  const h = window.Aplicacoes.historico('oq3', pid);
  const antiga = h.find(a => a.respostas.quer === 'Voltar a caminhar');
  return { origem: antiga.origem_legada || null, versao: antiga.versao_ferramenta };
}, PID);
ok(c3c.origem === null && c3c.versao === '0',
   'a já migrada continua sem chave de origem, reconhecida pelo carimbo e ' +
   'pela versão "0" — é o caminho de compatibilidade com o que já foi migrado');

/* ==================================================================== */
console.log('\n  CENÁRIO 4 — a origem não é apagada\n');
/* ==================================================================== */

ok(c1.linhasAntigas === 3 && c2b.linhasAntigas === 3 && c3.linhasAntigas === 3,
   'a tabela `oq3` continua com as três linhas em todos os cenários: ' +
   [c1.linhasAntigas, c2b.linhasAntigas, c3.linhasAntigas].join(' · '));

const origemIntacta = await p.evaluate(() =>
  (window.DadosLocais.exportar().tabelas.oq3 || [])
    .map(o => o.id + '|' + o.created_at + '|' + o.quer).sort().join(' ; '));
ok(origemIntacta === LINHAS.map(l => l.id + '|' + l.created_at + '|' + l.quer)
     .sort().join(' ; '),
   'e com o conteúdo intacto, linha por linha');

/* ------------------------------------------------------------------ fim - */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
await nav.close();
process.exit(falhou ? 1 : 0);
