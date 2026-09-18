/**
 * A aba HOLOSCAN, dentro da ficha do paciente.
 *
 * HOLOSCAN e confronto laboratorial, nunca correcao do HOLOSCOPE — os tres
 * estados (Convergente/Divergente/Dados insuficientes) e os textos fixos
 * ja vem de window.Holoscan (arquivos.js), que ja evita a `leitura` causal
 * do motor por design (window.Holoscan.texto, nunca c.leitura). Esta aba
 * so resume o que aquele modulo ja calcula.
 *
 * A receita dos exames (EXA-005=115 no metabolico, EXA-015=78 no detox) e a
 * mesma de testes/testar-arquivos.mjs: no caso.json o metabolico esta baixo
 * (0.8) e o detox esta alto (6.7), entao exame alterado no metabolico
 * CONVERGE e no detox DIVERGE — nao e coincidencia, e o mesmo motor.
 *
 * O que este teste cobra:
 *
 *   VAZIO        sem exame nenhum, o convite certo.
 *   SEM MAPA     exame lancado sem HOLOSCOPE aplicado — nao bloqueia, so avisa.
 *   COM MAPA     ultima coleta com contagem e "confrontado com o mapa de...".
 *   ESTADOS      Convergente, Divergente e Dados insuficientes aparecem, com
 *                o texto FIXO do Holoscan — nunca a leitura causal do motor.
 *   HISTORICO    sem coleta datada persistida, a tela diz isso claramente
 *                em vez de inventar um historico que nao existe.
 *   REGISTRAR    "Registrar exames" abre a aba certa, com o paciente da ficha.
 *   NAVEGACAO    "Ver HOLOSCAN completo" leva para a secao, sem zerar a tela.
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
const ok = (c, t) => console.log((c ? '  ok    ' : '  FALHA ') + t);
let falhou = false;
const conferir = (c, t) => { if (!c) falhou = true; ok(c, t); };

const aba = (x) => p.evaluate(async (n) => {
  document.querySelector('[data-aba="' + n + '"]').click();
  await new Promise(r => setTimeout(r, 250));
}, x);

const abrirFichaDe = (id) => p.evaluate(async (pid) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.querySelector('[data-ficha="' + pid + '"]').click();
  await new Promise(r => setTimeout(r, 300));
}, id);

/* --------------------------------------------------------- um paciente --- */

const pid = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Marina Alves';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(x => setTimeout(x, 300));
  return window.pacienteAtivoId();
});

/* -------------------------------------------------------- sem exame ------ */

await abrirFichaDe(pid);
await aba('holoscan');

const vazio = await p.evaluate(() => {
  const v = document.querySelector('#aba-holoscan .lista-vazia');
  return {
    titulo: v?.querySelector('strong')?.textContent,
    texto: v?.querySelector('span')?.textContent,
    botao: document.querySelector('#aba-holoscan .fic-consultas-topo button')?.textContent,
    avisoSemMapa: document.querySelector('#aba-holoscan .dash-vazio')?.textContent || '',
    temUltima: !!document.querySelector('#aba-holoscan .dash-titulo'),
  };
});
conferir(vazio.titulo === 'Nenhum exame registrado', 'título do estado vazio: ' + vazio.titulo);
conferir(vazio.texto === 'Registre exames para confrontar os dados laboratoriais com o mapa do HOLOSCOPE.',
  'texto do estado vazio: ' + vazio.texto);
conferir(vazio.botao === 'Registrar exames', 'o CTA é "Registrar exames": ' + vazio.botao);
conferir(/existir um mapa/.test(vazio.avisoSemMapa),
  'sem HOLOSCOPE, avisa que o confronto depende do mapa — sem bloquear o registro: ' + vazio.avisoSemMapa);
conferir(!vazio.temUltima, 'sem exame, nenhum bloco "Última coleta" aparece');

const registrar = await p.evaluate(async () => {
  document.querySelector('#aba-holoscan [data-ir="aba:documentos"]').click();
  await new Promise(r => setTimeout(r, 250));
  return {
    abaAtiva: document.querySelector('[data-aba="documentos"]').classList.contains('ativa'),
    fichaVisivel: !document.getElementById('vista-ficha').classList.contains('hidden'),
  };
});
conferir(registrar.abaAtiva && registrar.fichaVisivel,
  '"Registrar exames" abre a aba Documentos desta mesma ficha, sem zerar a tela');

/* -------------------------------------- exames sem HOLOSCOPE (ainda) ----- */

await p.evaluate((id) => {
  localStorage.setItem('holohacking.exames', JSON.stringify({ [id]: { 'EXA-005': 115 } }));
}, pid);
await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await abrirFichaDe(pid);
await aba('holoscan');

const semMapa = await p.evaluate(() => {
  const blocos = [...document.querySelectorAll('#aba-holoscan .dash-bloco-compacto')];
  const ultima = blocos.find(b => b.querySelector('.dash-titulo').textContent === 'Última coleta');
  return {
    resumo: ultima.querySelector('.dash-sub').textContent,
    dadosInsuf: [...document.querySelectorAll('#aba-holoscan .conf-item')]
      .every(i => i.classList.contains('dados_insuficientes')),
  };
});
conferir(/1 exame registrado/.test(semMapa.resumo) && !/confrontado com o mapa/.test(semMapa.resumo),
  'exame sem HOLOSCOPE: conta o exame, sem inventar confronto com mapa: ' + semMapa.resumo);
conferir(semMapa.dadosInsuf, 'e todos os cinco sistemas ficam "dados insuficientes" sem mapa');

/* ---------------------------------------------- HOLOSCOPE + exames ------- */

await p.evaluate(async (respostas) => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(respostas));
  const id = window.pacienteAtivoId();
  localStorage.setItem('holohacking.exames', JSON.stringify({
    [id]: { 'EXA-005': 115, 'EXA-015': 78 } // metabolico converge, detox diverge — mesma receita de testar-arquivos.mjs
  }));
}, caso.respostas);

await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await abrirFichaDe(pid);
await aba('holoscan');

const cheio = await p.evaluate(() => {
  const blocos = [...document.querySelectorAll('#aba-holoscan .dash-bloco-compacto')];
  const de = titulo => blocos.find(b => b.querySelector('.dash-titulo').textContent === titulo);
  const ultima = de('Última coleta');
  const itens = [...document.querySelectorAll('#aba-holoscan .conf-item')].map(i => ({
    sistema: i.querySelector('b').textContent,
    estado: i.querySelector('.conf-selo').textContent,
    leitura: i.querySelector('.conf-leitura').textContent.trim(),
    classe: i.className,
  }));
  return {
    resumo: ultima.querySelector('.dash-sub').textContent,
    contagem: [...ultima.querySelectorAll('.fic-sis')].map(s => s.textContent.trim()),
    itens,
    historico: de('Histórico de coletas').querySelector('.dash-vazio').textContent,
    continuidade: [...document.querySelectorAll('#aba-holoscan .fic-continuidade .fic-rot')].map(s => s.textContent),
  };
});

conferir(/2 exames registrados/.test(cheio.resumo) && /confrontado com o mapa de/.test(cheio.resumo),
  'com HOLOSCOPE, a última coleta mostra a contagem e o mapa confrontado: ' + cheio.resumo);
conferir(cheio.contagem.some(c => /Convergentes\s*1/.test(c.replace(/\s+/g, ' '))),
  'conta convergentes: ' + cheio.contagem.join(' · '));
conferir(cheio.contagem.some(c => /Divergentes\s*1/.test(c.replace(/\s+/g, ' '))),
  'conta divergentes: ' + cheio.contagem.join(' · '));
conferir(cheio.contagem.some(c => /Dados insuficientes\s*3/.test(c.replace(/\s+/g, ' '))),
  'conta dados insuficientes (os 3 sistemas sem exame lançado): ' + cheio.contagem.join(' · '));

const metabolico = cheio.itens.find(i => /Metab/.test(i.sistema));
const detox = cheio.itens.find(i => /Detox/.test(i.sistema));
conferir(metabolico && metabolico.estado === 'Convergente' && /convergente/.test(metabolico.classe),
  'metabólico (baixo no caso, exame alterado) converge: ' + (metabolico && metabolico.estado));
conferir(detox && detox.estado === 'Divergente' && /divergente/.test(detox.classe),
  'detox (alto no caso, exame alterado) diverge: ' + (detox && detox.estado));

const TEXTOS_FIXOS = [
  'Existe convergência entre o relato do paciente e os dados laboratoriais nesta dimensão.',
  'Relato e dados laboratoriais disponíveis estão convergentes nesta dimensão.',
  'O relato e os dados laboratoriais não estão caminhando na mesma direção neste momento.',
  'Ainda não há dados laboratoriais suficientes para realizar o confronto desta dimensão.',
];
conferir(cheio.itens.every(i => TEXTOS_FIXOS.includes(i.leitura)),
  'todo texto é um dos quatro fixos do Holoscan — nenhuma leitura causal do motor escapou: ' +
  cheio.itens.map(i => i.leitura.slice(0, 30)).join(' | '));

conferir(/não há coleta por data persistida/.test(cheio.historico),
  'sem coleta datada, a tela diz isso em vez de inventar histórico: ' + cheio.historico);

conferir(cheio.continuidade.join(' · ').includes('HOLOSCOPE') && cheio.continuidade.join(' · ').includes('HOLOSCAN'),
  'a relação HOLOSCOPE → mapa / HOLOSCAN → confronto aparece: ' + cheio.continuidade.join(' · '));

/* ---------------------------------------- "Ver HOLOSCAN completo" nao zera */

const verHoloscan = await p.evaluate(async () => {
  document.querySelector('#aba-holoscan [data-ir="holoscan"]').click();
  await new Promise(r => setTimeout(r, 300));
  return {
    secaoAtiva: document.querySelector('.secao.ativa')?.id,
    algumaAtiva: document.querySelectorAll('.secao.ativa').length,
    paciente: document.getElementById('sel-holoscan')?.selectedOptions[0]?.textContent,
  };
});
conferir(verHoloscan.secaoAtiva === 'secao-holoscan' && verHoloscan.algumaAtiva === 1,
  '"Ver HOLOSCAN completo" leva para a seção, sem zerar a tela: ' + verHoloscan.secaoAtiva);
conferir(verHoloscan.paciente === 'Marina Alves',
  'e chega lá com a pessoa certa selecionada: ' + verHoloscan.paciente);

/* --------------------------------------------------------------- fim ----- */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
if (ruim.length) falhou = true;
await nav.close();
process.exit(falhou ? 1 : 0);
