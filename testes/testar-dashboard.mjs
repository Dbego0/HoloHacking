/**
 * O dashboard era a apresentacao do metodo — o mesmo texto todo dia, com ou
 * sem paciente. Agora e o trabalho de hoje: quem esta esperando, o tamanho da
 * carteira e o terreno que se repete nela.
 *
 * As regras de pendencia sao as de panorama.js, as mesmas que a ficha usa.
 * Este teste confere que as duas telas contam a mesma historia.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1500, height: 1300 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => {
  if (!c) falhou = true;
  console.log((c ? '  ok    ' : '  FALHA ') + t);
};

// --- carteira vazia: o metodo e a resposta certa --------------------------
const vazio = await p.evaluate(() => ({
  texto: document.getElementById('dash-trabalho').innerText.replace(/\s+/g, ' ').trim(),
  metodo: !document.getElementById('dash-metodo').classList.contains('hidden'),
  pendentes: document.querySelectorAll('#dash-lista-pendentes .dash-pendente').length,
  jornada: document.querySelectorAll('#dash-trabalho .dash-jornada-passo').length,
}));
ok(/nenhum paciente cadastrado/i.test(vazio.texto), 'sem paciente, convida a cadastrar');
ok(/nenhuma consulta agendada/i.test(vazio.texto), 'sem consulta marcada, estado vazio elegante');
ok(vazio.metodo, 'e o método continua à vista — ali ele serve');
ok(vazio.pendentes === 0, 'nenhuma pendência inventada do nada');
ok(vazio.jornada === 3, 'a jornada clínica (HOLOSCOPE → HOLOSCAN → Documentos) sempre aparece');

// --- uma carteira de verdade ---------------------------------------------
await p.evaluate(async (respostas) => {
  const novo = async (nome) => {
    document.querySelector('.nav-item[data-secao="pacientes"]').click();
    const v = document.getElementById('voltar-lista'); if (v) v.click();
    document.getElementById('btn-abrir-novo').click();
    document.getElementById('np-nome').value = nome;
    document.getElementById('btn-salvar-paciente').click();
    await new Promise(x => setTimeout(x, 300));
    return window.pacienteAtivoId();
  };
  const sentido = {}; HOLOSCOPE.questionario().forEach(q => sentido[q.id] = q.sentido);
  const variar = n => respostas.map(x => ({ marcador_id: x.marcador_id,
    intensidade: sentido[x.marcador_id] === 'invertido'
      ? Math.min(3, Math.max(0, x.intensidade + n))
      : Math.max(0, Math.min(3, x.intensidade - n)) }));

  await novo('Marina Alves');                       // mapa hoje, sem conduta
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(respostas));

  const cid = await novo('Carla Souza');             // mapa antigo
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(variar(1)));
  const h = JSON.parse(localStorage.getItem('holohacking.pontuacao'));
  h[cid][0].quando = '2026-07-01';
  localStorage.setItem('holohacking.pontuacao', JSON.stringify(h));

  await novo('Beatriz Lima');
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(variar(2)));

  await novo('Helena Rocha');                        // questionario parado
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  document.getElementById('btn-abrir-questionario').click();
  [...document.querySelectorAll('.q-item')].slice(0, 12).forEach(i => i.querySelectorAll('.q-btn')[2].click());

  await novo('Sofia Martins');                       // nada feito
}, caso.respostas);

const cheio = await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="dashboard"]').click();
  window.redesenharDashboard();
  return {
    metodo: !document.getElementById('dash-metodo').classList.contains('hidden'),
    pendentes: [...document.querySelectorAll('#dash-lista-pendentes .dash-pendente')].map(l => ({
      nome: l.querySelector('b').textContent,
      porque: l.querySelector('.dash-porque').textContent,
      botao: l.querySelector('.dash-ir').textContent.replace(/\s*→\s*$/, '').trim(),
    })),
    tiles: [...document.querySelectorAll('.dash-tile')].map(t =>
      t.querySelector('b').textContent + ' ' + t.querySelector('span').textContent),
    barras: [...document.querySelectorAll('.dash-barra')].map(b =>
      b.querySelector('.dash-barra-nome').textContent + '=' + b.querySelector('.dash-barra-n').textContent),
    recentes: [...document.querySelectorAll('#dash-lista-recentes .dash-pendente b')].map(b => b.textContent),
  };
});

ok(!cheio.metodo, 'com paciente cadastrado, a apresentação do método sai da frente');
ok(cheio.pendentes.length === 5, cheio.pendentes.length + ' pacientes precisando de atenção');
console.log(cheio.pendentes.map(x => '          ' + x.nome + ' — ' + x.porque).join('\n'));
ok(cheio.recentes.length === 3, 'pacientes recentes mostra no máximo 3: ' + cheio.recentes.join(' · '));
ok(cheio.recentes[0] === 'Sofia Martins', 'e o mais novo cadastro vem primeiro: ' + cheio.recentes[0]);

const carla = cheio.pendentes.find(x => /Carla/.test(x.nome));
ok(/reavalia/.test(carla.porque), 'a reavaliação vencida da Carla aparece: ' + carla.porque);
const helena = cheio.pendentes.find(x => /Helena/.test(x.nome));
ok(/12 de 84/.test(helena.porque) && helena.botao === 'Continuar',
   'o questionário parado da Helena convida a continuar: ' + helena.porque);
const sofia = cheio.pendentes.find(x => /Sofia/.test(x.nome));
ok(sofia.botao === 'Aplicar agora', 'quem não tem mapa é chamada para aplicar');

ok(cheio.tiles.join(' | ').includes('5 pacientes'), 'tiles: ' + cheio.tiles.join(' · '));
ok(cheio.tiles.some(t => /3 com HOLOSCOPE/.test(t)), 'conta quem tem mapa');
ok(cheio.barras.length > 0, 'o terreno da carteira: ' + cheio.barras.join(' · '));

// --- o botao leva mesmo ao paciente certo --------------------------------
const ida = await p.evaluate(async () => {
  const b = document.querySelector('#dash-lista-pendentes .dash-pendente .dash-ir');
  const nome = b.closest('.dash-pendente').querySelector('b').textContent;
  b.click();
  await new Promise(r => setTimeout(r, 400));
  return { nome, ativo: window.pacienteAtivoNome(), secao: document.querySelector('.secao.ativa')?.id };
});
ok(ida.ativo === ida.nome, 'clicar na linha troca o paciente ativo: ' + ida.ativo);
ok(ida.secao === 'secao-holoscope', 'e leva para a tela certa: ' + ida.secao);

// --- a ficha tem que contar a mesma historia ------------------------------
const mesma = await p.evaluate(() => {
  const pid = window.pacienteAtivoId();
  const d = window.Panorama.doPaciente(pid);
  return { doPanorama: window.Panorama.alertas(d).map(a => a.texto) };
});
ok(mesma.doPanorama.length > 0, 'ficha e dashboard leem a mesma regra: ' + mesma.doPanorama[0]);

await nav.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
