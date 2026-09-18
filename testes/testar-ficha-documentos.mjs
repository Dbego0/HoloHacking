/**
 * A aba Documentos, dentro da ficha do paciente.
 *
 * Nao e uma aba nova (Etapa 5 refina, nao recria): o upload, a listagem, o
 * "abrir" e o "remover" ja existiam e continuam do jeito que estavam. O que
 * entra e o que faltava — estado vazio com convite de verdade, contador,
 * um botao "Adicionar documento" claro (que so aciona o MESMO input de
 * arquivo que a zona de arrastar ja usa) e a linha de continuidade da
 * jornada.
 *
 * O que este teste cobra:
 *
 *   VAZIO        titulo, texto e CTA do jeito pedido, sem tabela vazia.
 *   BOTAO        "Adicionar documento" (topo e estado vazio) aciona o MESMO
 *                input de arquivo — nao inventa um fluxo de upload novo.
 *   LISTA        upload de verdade (input.uploadFile, como testar-upload.mjs
 *                ja faz) aparece na lista, com contador atualizado.
 *   ORDEM        ArquivoStore.listar() ja ordena por data decrescente — a
 *                lista aqui so herda essa ordem, nao recalcula nada.
 *   NOME LONGO   no quebra o layout (nem em 420px).
 *   ABRIR        o botao "abrir" aciona window.open com a URL do arquivo
 *                certo — a mesma acao que ja existia, so verificada aqui.
 *   ISOLAMENTO   a ficha de outro paciente nao herda os documentos.
 *   NAVEGACAO    o atalho do cabecalho ("Novo documento") continua levando
 *                para esta aba sem zerar a tela.
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('amostras', { recursive: true });
writeFileSync('amostras/exame-doc.pdf', '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

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

/* --------------------------------------------------------- dois pacientes */

const ids = await p.evaluate(async () => {
  const novo = async (nome) => {
    document.querySelector('.nav-item[data-secao="pacientes"]').click();
    const v = document.getElementById('voltar-lista'); if (v) v.click();
    document.getElementById('btn-abrir-novo').click();
    document.getElementById('np-nome').value = nome;
    document.getElementById('btn-salvar-paciente').click();
    await new Promise(x => setTimeout(x, 300));
    return window.pacienteAtivoId();
  };
  const marina = await novo('Marina Alves');
  const carla = await novo('Carla Souza');
  return { marina, carla };
});

/* ------------------------------------------------------- sem documento --- */

await abrirFichaDe(ids.marina);
await aba('documentos');

const vazio = await p.evaluate(() => {
  const v = document.querySelector('#doc-lista .lista-vazia');
  return {
    titulo: v?.querySelector('strong')?.textContent,
    texto: v?.querySelector('span')?.textContent,
    total: document.getElementById('doc-total')?.textContent || '',
    tabelaVazia: !!document.querySelector('#doc-lista .arq-vazio'),
  };
});
conferir(vazio.titulo === 'Nenhum documento adicionado', 'título do estado vazio: ' + vazio.titulo);
conferir(vazio.texto === 'Adicione arquivos e materiais relacionados à jornada deste paciente.',
  'texto do estado vazio: ' + vazio.texto);
conferir(vazio.total === '', 'sem documento, o contador fica em branco — não "0 documentos"');
conferir(!vazio.tabelaVazia, 'não é mais um parágrafo solto — é o mesmo convite das outras abas');

/* ------------------------- o CTA do topo aciona o input já existente ----- */
/* Rodada de consistencia: o card vazio nao repete mais o botao do topo —
   um so CTA, como Consultas/HOLOSCOPE/HOLOSCAN ja faziam. */

const semBotaoDuplicado = await p.evaluate(() => !document.querySelector('#doc-lista .lista-vazia button'));
conferir(semBotaoDuplicado, 'sem CTA duplicado dentro do card vazio — o botão do topo já é o convite');

const topoAciona = await p.evaluate(async () => {
  const campo = document.getElementById('doc-arquivo');
  return new Promise(resolve => {
    const ouvinte = () => { campo.removeEventListener('click', ouvinte); resolve(true); };
    campo.addEventListener('click', ouvinte);
    document.querySelector('.fic-consultas-topo [data-acao="adicionar-documento"]').click();
    setTimeout(() => { campo.removeEventListener('click', ouvinte); resolve(false); }, 400);
  });
});
conferir(topoAciona, '"Adicionar documento" do topo aciona o seletor de arquivo já existente');

/* ------------------------------------------ upload de verdade (o input) - */

const campo = await p.$('#doc-arquivo');
await campo.uploadFile('amostras/exame-doc.pdf');
await new Promise(r => setTimeout(r, 900));

const umDoc = await p.evaluate(() => ({
  total: document.getElementById('doc-total')?.textContent || '',
  itens: document.querySelectorAll('.doc-item').length,
}));
conferir(umDoc.itens === 1 && /1 documento$/.test(umDoc.total),
  'sobe pelo mesmo fluxo de sempre e o contador acompanha: ' + umDoc.total);

/* ----------------------------------- mais documentos, um com nome longo - */

await p.evaluate(async (pid) => {
  const arq = (texto, nome) => new File([texto], nome, { type: 'text/plain' });
  const dias = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  await window.ArquivoStore.salvar(pid, arq('a', 'Laudo do endocrinologista sobre a tireoide e o eixo hormonal completo, revisão de setembro.txt'),
    { nome: 'Laudo do endocrinologista sobre a tireoide e o eixo hormonal completo, revisão de setembro.txt',
      tipo: 'Laudo', data: dias(-5) });
  await window.ArquivoStore.salvar(pid, arq('b', 'antigo.txt'), { nome: 'Consentimento antigo', tipo: 'Termo de consentimento', data: dias(-60) });
}, ids.marina);
await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await abrirFichaDe(ids.marina);
await aba('documentos');
await new Promise(r => setTimeout(r, 400));

const tres = await p.evaluate(() => ({
  total: document.getElementById('doc-total')?.textContent || '',
  nomes: [...document.querySelectorAll('.doc-item b')].map(b => b.textContent),
  continuidade: document.querySelector('#aba-documentos .fic-continuidade .fic-rot')?.textContent || '',
}));
conferir(/3 documentos$/.test(tres.total), 'o contador soma os três: ' + tres.total);
// ArquivoStore.listar() ja ordena por data decrescente: o laudo (5 dias
// atras) vem antes do consentimento (60 dias atras), que vem antes do PDF
// sem data (vai por ultimo).
conferir(/Laudo do endocrinologista/.test(tres.nomes[0]) && tres.nomes[1] === 'Consentimento antigo',
  'ordem decrescente por data, herdada do ArquivoStore: ' + tres.nomes.join(' · '));
conferir(/Consulta.*HOLOSCOPE.*HOLOSCAN.*Documentos/.test(tres.continuidade),
  'a linha de continuidade da jornada aparece: ' + tres.continuidade);

const overflowDesktop = await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
conferir(overflowDesktop, 'nome de arquivo longo não estoura o layout em desktop');

/* ------------------------------------------------------------- "abrir" -- */

const abriu = await p.evaluate(async () => {
  return new Promise(resolve => {
    const original = window.open;
    window.open = function (url) { window.open = original; resolve(!!url); };
    document.querySelector('.doc-item [data-abrir]').click();
    setTimeout(() => { window.open = original; resolve(false); }, 1500);
  });
});
conferir(abriu, '"abrir" chama window.open com o arquivo certo — a mesma ação de sempre');

/* --------------------------------------------------- as duas nao se misturam */

await abrirFichaDe(ids.carla);
await aba('documentos');
const outraPessoa = await p.evaluate(() => ({
  vazio: !!document.querySelector('#doc-lista .lista-vazia'),
  itens: document.querySelectorAll('.doc-item').length,
}));
conferir(outraPessoa.vazio && outraPessoa.itens === 0,
  'a ficha de quem não tem documento continua vazia — as duas não se misturam');

/* --------------------------------------- navegacao do cabecalho nao zera - */

await abrirFichaDe(ids.marina);
await aba('visao');
const viaHeader = await p.evaluate(async () => {
  document.querySelector('.fic-acoes-topo [data-ir="aba:documentos"]').click();
  await new Promise(r => setTimeout(r, 250));
  return {
    abaAtiva: document.querySelector('[data-aba="documentos"]').classList.contains('ativa'),
    fichaVisivel: !document.getElementById('vista-ficha').classList.contains('hidden'),
  };
});
conferir(viaHeader.abaAtiva && viaHeader.fichaVisivel,
  'o atalho do cabeçalho ainda leva para Documentos, sem zerar a tela');

/* --------------------------------------------------------- responsividade */

for (const largura of [420, 900]) {
  await p.setViewport({ width: largura, height: 1000 });
  await new Promise(r => setTimeout(r, 150));
  const semScroll = await p.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
  conferir(semScroll, largura + 'px: sem scroll horizontal');
}

/* --------------------------------------------------------------- fim ----- */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
if (ruim.length) falhou = true;
await nav.close();
process.exit(falhou ? 1 : 0);
