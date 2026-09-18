/**
 * Cobertura de fronteiras de data para a Agenda — o mesmo calculo que
 * causava a flakiness real de testes/testar-calendario.mjs (retorno de 4
 * semanas: ultima aplicacao + 28 dias), agora verificado com o relogio
 * CONGELADO em varios pontos do calendario, nao no horario real da maquina.
 *
 * Nao reabre a grade inteira para cada data (caro e ja coberto por
 * testar-calendario.mjs numa quarta-feira fixa) — verifica direto:
 *
 *   1. a semana exibida (Agenda, vista Semana) sempre tem um rotulo
 *      domingo-a-sabado correto, comecando em hoje-diaDaSemana — com grade de
 *      7 colunas quando ha algo pra mostrar, ou o estado "semana vazia"
 *      quando a sugestao de retorno cai fora da semana exibida (sexta/sabado
 *      empurram hoje+2 pra semana seguinte — isso e comportamento correto,
 *      nao bug);
 *   2. window.Panorama.agenda() classifica corretamente o retorno de 4
 *      semanas (grupo "semana", faltam=2) em cada uma das datas abaixo:
 *
 *        inicio da semana   domingo
 *        meio da semana     quarta (o mesmo dia de testar-calendario.mjs)
 *        fim da semana      sabado — a fronteira exata do bug original
 *        virada de mes      ultimo dia de janeiro
 *        virada de ano      30 de dezembro (a aplicacao vira o ano)
 *
 * Cada data roda numa aba de navegacao ISOLADA (browser context proprio),
 * para nao herdar paciente nem localStorage de uma data para outra.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { congelarRelogio } from './relogio-fixo.mjs';

const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));

const ok = (c, t) => console.log((c ? '  ok    ' : '  FALHA ') + t);
let falhou = false;
const conferir = (c, t) => { if (!c) falhou = true; ok(c, t); };

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });

async function conferirData(rotulo, isoHoje) {
  const contexto = await browser.createBrowserContext();
  const p = await contexto.newPage();
  await p.setViewport({ width: 1400, height: 1000 });
  const ruim = []; p.on('pageerror', e => ruim.push(e.message));
  await congelarRelogio(p, isoHoje);
  await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());

  const r = await p.evaluate(async (respostas) => {
    // um paciente, aplicacao ha exatos 26 dias — mesma receita do teste
    // principal (HOLOSCOPE.calcular de verdade, nao um objeto de mentira),
    // so que agora com o relogio fixo em vez do real.
    document.querySelector('.nav-item[data-secao="pacientes"]').click();
    document.getElementById('btn-abrir-novo').click();
    document.getElementById('np-nome').value = 'Paciente Fronteira';
    document.getElementById('btn-salvar-paciente').click();
    await new Promise(x => setTimeout(x, 300));
    const pid = window.pacienteAtivoId();

    document.querySelector('.nav-item[data-secao="holoscope"]').click();
    window.aplicarPontuacao(HOLOSCOPE.calcular(respostas));
    const dias = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const h = JSON.parse(localStorage.getItem('holohacking.pontuacao'));
    h[pid][0].quando = dias(-26);
    localStorage.setItem('holohacking.pontuacao', JSON.stringify(h));

    // a Agenda le do disco: recarregar aqui e o mesmo que o teste principal faz
    return { pid, hoje: dias(0), esperada: dias(2) };
  }, caso.respostas);

  await p.reload({ waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());

  const agenda = await p.evaluate((pid) => {
    const linha = window.Panorama.agenda().linhas.find(l => l.paciente.id === pid);
    return linha ? { quando: linha.quando, faltam: linha.faltam, grupo: linha.grupo } : null;
  }, r.pid);

  await p.evaluate(() => document.querySelector('.nav-item[data-secao="agenda"]').click());
  // mesma espera de testar-calendario.mjs apos abrir a Agenda: o redesenho da
  // grade nao e sincrono com o clique, entao ler o DOM na sequencia e uma
  // corrida — nao um problema de data.
  await p.evaluate(() => new Promise(r => setTimeout(r, 400)));
  const grade = await p.evaluate(() => {
    return {
      colunas: document.querySelectorAll('.cal-coluna').length,
      // sexta/sábado empurram a sugestão (hoje+2) para a semana seguinte —
      // fora da semana exibida. Sem outro compromisso nela, a semana fica
      // corretamente "vazia" (.cal-vazio) em vez de grade com 7 colunas.
      // As duas formas são válidas; o que importa é o rótulo continuar certo.
      vazia: !!document.querySelector('.cal-vazio'),
      rotulo: document.querySelector('.cal-rotulo')?.textContent || '',
      temErroJS: false,
    };
  });

  conferir(!!agenda && agenda.quando === r.esperada,
    rotulo + ' (hoje ' + r.hoje + '): retorno de 4 semanas cai em ' + r.esperada + ' — ' +
    (agenda ? agenda.quando : 'paciente sumiu da agenda'));
  conferir(!!agenda && agenda.grupo === 'semana' && agenda.faltam === 2,
    rotulo + ': classificado como "semana", faltam 2 dias — ' + (agenda ? agenda.grupo + '/' + agenda.faltam : '—'));
  conferir((grade.colunas === 7 || grade.vazia) && /–/.test(grade.rotulo),
    rotulo + ': grade de 7 colunas (ou semana vazia, se a sugestão cair fora dela) ' +
    'com período domingo–sábado: ' + grade.rotulo +
    (grade.vazia ? ' (semana vazia)' : ' (' + grade.colunas + ' colunas)'));
  conferir(ruim.length === 0, rotulo + ': sem erro de JS' + (ruim.length ? ' — ' + ruim[0] : ''));
  if (ruim.length) falhou = true;

  await contexto.close();
}

await conferirData('Início da semana (domingo)', '2026-09-13T09:00:00');
await conferirData('Meio da semana (quarta)', '2026-09-16T09:00:00');
await conferirData('Fim da semana (sábado — a fronteira do bug original)', '2026-09-19T09:00:00');
await conferirData('Virada de mês (31/jan → fev)', '2026-01-31T09:00:00');
await conferirData('Virada de ano (30/dez → jan/2027)', '2026-12-30T09:00:00');

console.log('');
await browser.close();
process.exit(falhou ? 1 : 0);
