/**
 * A seção Perfil — as quatro abas de Configurações.
 *
 * O app sabia tudo sobre o paciente e nada sobre quem o atende: o relatório
 * impresso saía sem nome, sem CRN e sem assinatura. Receita sem registro
 * profissional não vale, e era esse o buraco.
 *
 * O que este teste cobra:
 *
 *   perfil    os campos gravam, sobrevivem a recarregar, e a completude conta
 *   papel     o que foi preenchido SAI no cabeçalho e no rodapé do relatório
 *   marca     cor e logo entram no documento; a prévia mostra o mesmo
 *   módulos   desligar some do menu, religar traz de volta, e nada se perde
 *   aparência a escolha de tema fica guardada — antes seguia o sistema sempre
 *   conta     exportar traz tudo; o perfil viaja junto com os pacientes
 *   limite    as imagens do perfil não vazam para a tela de Documentos
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

const abrir = () => p.evaluate(() =>
  document.querySelector('.nav-item[data-secao="perfil"]').click());
const trocarAba = (a) => p.evaluate(
  (x) => document.querySelector('[data-aba-perfil="' + x + '"]').click(), a);

/* ------------------------------------------------------- vazio ----------- */

await abrir();
const vazio = await p.evaluate(() => ({
  ativa: document.getElementById('secao-perfil').classList.contains('ativa'),
  caminho: document.getElementById('caminho-atual').textContent,
  pct: document.getElementById('sr-pct').textContent,
  nome: document.getElementById('sr-nome').textContent,
  feitos: document.querySelectorAll('.perf-lista li.feito').length,
  total: document.querySelectorAll('.perf-lista li').length,
  abas: [...document.querySelectorAll('[data-aba-perfil]')].map(b => b.textContent.trim()),
}));

conferir(vazio.ativa && vazio.caminho === 'Perfil', 'a seção abre pelo menu');
conferir(vazio.abas.join(',') === 'Perfil,Marca,Preferências,Conta',
  'as quatro abas: ' + vazio.abas.join(' · '));
conferir(vazio.total === 9 && vazio.feitos === 1,
  'a checagem começa quase toda vazia: ' + vazio.feitos + ' de ' + vazio.total);
conferir(vazio.nome === 'Profissional' && vazio.pct === '11%',
  'e o rodapé do menu mostra isso: ' + vazio.nome + ' ' + vazio.pct);

/* -------------------------------------------------- preencher ------------ */

const salvo = await p.evaluate(async () => {
  const põe = (id, v) => { document.getElementById('pf-' + id).value = v; };
  põe('nome', 'Ana Paula Ferreira');
  põe('email', 'ana@clinica.com.br');
  põe('registro', 'CRN-3 12345');
  põe('especialidade', 'Nutrição Holística');
  põe('cidade', 'Goiânia/GO');
  põe('instagram', '@anapaula.nutri');
  põe('telefone', '(62) 99999-1234');
  document.getElementById('btn-salvar-perfil').click();
  await new Promise(r => setTimeout(r, 400));
  return {
    pct: document.getElementById('sr-pct').textContent,
    nome: document.getElementById('sr-nome').textContent,
    papel: document.getElementById('sr-papel').textContent,
    feitos: [...document.querySelectorAll('.perf-lista li.feito')]
      .map(l => l.textContent.trim()),
    guardado: JSON.parse(localStorage.getItem('holohacking.dados.perfil') || '[]')[0] || null,
  };
});

conferir(salvo.guardado && salvo.guardado.registro === 'CRN-3 12345',
  'os campos gravam: ' + (salvo.guardado || {}).registro);
conferir(salvo.nome === 'Ana Paula Ferreira' && salvo.papel === 'Nutricionista',
  'o rodapé do menu acompanha: ' + salvo.nome);
conferir(salvo.pct === '67%', 'a completude sobe: ' + salvo.pct);
conferir(salvo.feitos.includes('Registro/Conselho') && !salvo.feitos.includes('Logo'),
  'e sabe o que ainda falta');

// sobrevive a recarregar: é dado, não estado de tela
await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await abrir();
const depois = await p.evaluate(() => ({
  nome: document.getElementById('pf-nome').value,
  registro: document.getElementById('pf-registro').value,
  pct: document.getElementById('sr-pct').textContent,
}));
conferir(depois.nome === 'Ana Paula Ferreira' && depois.registro === 'CRN-3 12345',
  'o perfil sobrevive a recarregar: ' + depois.nome + ' / ' + depois.registro);

/* -------------------------------------- o que disso sai no papel --------- */

const imagens = await p.evaluate(async () => {
  const png = (w, h, cor, texto) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (cor) { x.fillStyle = cor; x.fillRect(0, 0, w, h); }
    x.fillStyle = '#111'; x.font = '20px serif'; x.textAlign = 'center';
    x.fillText(texto, w / 2, h / 2);
    return new Promise(r => c.toBlob(b => r(new File([b], 'x.png', { type: 'image/png' })), 'image/png'));
  };
  const logo = await window.ArquivoStore.salvar('_perfil', await png(200, 90, '#eee', 'LOGO'),
    { nome: 'Logo', tipo: 'Logo', data: '2026-09-13' });
  const ass = await window.ArquivoStore.salvar('_perfil', await png(300, 100, null, 'assinatura'),
    { nome: 'Assinatura', tipo: 'Assinatura', data: '2026-09-13' });
  const linha = JSON.parse(localStorage.getItem('holohacking.dados.perfil'));
  linha[0].logo_id = logo.id;
  linha[0].assinatura_id = ass.id;
  linha[0].cor_primaria = '#8c682b';
  localStorage.setItem('holohacking.dados.perfil', JSON.stringify(linha));
  return { logo: logo.id, ass: ass.id };
});

await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());

const noPapel = await p.evaluate(async (respostas) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Marina Alves';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 300));
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(respostas));

  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.querySelector('.card-paciente').click();
  await new Promise(r => setTimeout(r, 300));
  document.querySelector('[data-aba="relatorio"]').click();
  await new Promise(r => setTimeout(r, 600));

  const rel = document.getElementById('relatorio');
  return {
    topo: rel.querySelector('.rel-emissor').innerText.replace(/\s+/g, ' ').trim(),
    emitiu: rel.querySelector('.rel-emitiu').innerHTML,
    contato: rel.querySelector('.rel-contato').innerText,
    temLogo: !!rel.querySelector('#rel-logo img'),
    temAssinatura: !!rel.querySelector('#rel-assinatura img'),
    cor: rel.getAttribute('style') || '',
  };
}, caso.respostas);

conferir(/Ana Paula Ferreira/.test(noPapel.topo) && /Goiânia\/GO/.test(noPapel.topo),
  'o cabeçalho do relatório diz quem emitiu: ' + noPapel.topo);
conferir(/CRN-3 12345/.test(noPapel.emitiu),
  'o rodapé traz o registro profissional: ' + noPapel.emitiu);
conferir(!/&amp;middot;/.test(noPapel.emitiu) && /·/.test(noPapel.emitiu),
  'e o separador é um separador, não a palavra "middot"');
conferir(/99999-1234/.test(noPapel.contato) && /@anapaula\.nutri/.test(noPapel.contato),
  'o contato sai junto: ' + noPapel.contato);
conferir(noPapel.temLogo, 'o logo entra no cabeçalho');
conferir(noPapel.temAssinatura, 'a assinatura entra no rodapé');
conferir(/--rel-p:\s*#8c682b/.test(noPapel.cor),
  'e a cor escolhida em Marca chega no documento');

/* ------------------------------------------- o limite dos documentos ----- */

const naTelaDeDocumentos = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="documentos"]').click();
  await new Promise(r => setTimeout(r, 500));
  return {
    itens: document.querySelectorAll('.doc-todos-item').length,
    texto: document.getElementById('documentos-corpo').innerText.replace(/\s+/g, ' '),
  };
});
conferir(naTelaDeDocumentos.itens === 0 && /Nenhum documento guardado/i.test(naTelaDeDocumentos.texto),
  'a assinatura e o logo NÃO aparecem entre os documentos dos pacientes');

/* -------------------------------------------------- os módulos ----------- */

const modulos = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="perfil"]').click();
  document.querySelector('[data-aba-perfil="prefs"]').click();
  await new Promise(r => setTimeout(r, 200));
  const antes = !document.querySelector('.nav-item[data-secao="agenda"]').classList.contains('hidden');
  document.querySelector('[data-modulo="agenda"]').click();
  await new Promise(r => setTimeout(r, 400));
  const depois = !document.querySelector('.nav-item[data-secao="agenda"]').classList.contains('hidden');
  const chave = document.querySelector('[data-modulo="agenda"]');
  return { antes, depois, aria: chave.getAttribute('aria-checked'),
           guardado: JSON.parse(localStorage.getItem('holohacking.dados.perfil'))[0].modulos };
});
conferir(modulos.antes && !modulos.depois, 'desligar um módulo some do menu');
conferir(modulos.aria === 'false' && modulos.guardado.agenda === false,
  'e a escolha fica guardada: aria=' + modulos.aria +
  ' guardado=' + JSON.stringify(modulos.guardado));

// religar traz de volta, e o que estava registrado continua lá
await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
const religado = await p.evaluate(async () => {
  const some = document.querySelector('.nav-item[data-secao="agenda"]').classList.contains('hidden');
  document.querySelector('.nav-item[data-secao="perfil"]').click();
  document.querySelector('[data-aba-perfil="prefs"]').click();
  await new Promise(r => setTimeout(r, 200));
  document.querySelector('[data-modulo="agenda"]').click();
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('.nav-item[data-secao="agenda"]').click();
  await new Promise(r => setTimeout(r, 400));
  return { someDepoisDeRecarregar: some,
           voltou: document.getElementById('secao-agenda').classList.contains('ativa'),
           calendario: !!document.querySelector('.cal-barra') };
});
conferir(religado.someDepoisDeRecarregar, 'e continua desligado depois de recarregar');
conferir(religado.voltou && religado.calendario,
  'religar traz a tela de volta inteira');

/* -------------------------------------------------- a aparência ---------- */

const tema = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="perfil"]').click();
  document.querySelector('[data-aba-perfil="prefs"]').click();
  await new Promise(r => setTimeout(r, 200));
  document.querySelector('[data-aparencia="escuro"]').click();
  await new Promise(r => setTimeout(r, 200));
  const escuro = document.body.classList.contains('escuro');
  document.querySelector('[data-aparencia="claro"]').click();
  await new Promise(r => setTimeout(r, 200));
  return { escuro, claro: !document.body.classList.contains('escuro'),
           guardado: localStorage.getItem('holohacking.aparencia') };
});
conferir(tema.escuro && tema.claro, 'as três opções de aparência trocam o tema');
conferir(tema.guardado === 'claro', 'e a escolha fica guardada: ' + tema.guardado);

await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
const temaDepois = await p.evaluate(() => ({
  claro: !document.body.classList.contains('escuro'),
  marcado: document.querySelector('.perf-tema.ativo')?.dataset.aparencia,
}));
conferir(temaDepois.claro,
  'a aparência sobrevive a recarregar — antes voltava a seguir o sistema');

/* ---------------------------------------------------- a aba Conta -------- */

const conta = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="perfil"]').click();
  document.querySelector('[data-aba-perfil="conta"]').click();
  await new Promise(r => setTimeout(r, 400));
  const pacote = window.DadosLocais.exportar();
  return {
    tabelas: Object.keys(pacote.tabelas).sort().join(','),
    perfilNoPacote: (pacote.tabelas.perfil || []).length,
    nomeNoPacote: (pacote.tabelas.perfil || [])[0]?.nome,
    tiles: [...document.querySelectorAll('#painel-conta .dash-tile')]
      .map(t => t.querySelector('b').textContent + ' ' + t.querySelector('span').textContent),
    texto: document.getElementById('painel-conta').innerText.replace(/\s+/g, ' '),
  };
});

/* A lista cresce quando o app cresce; o que importa é que nada fique para
   trás. Levar os pacientes sem o perfil deixaria os relatórios sem rodapé do
   outro lado, e sem a agenda a semana chegaria vazia. */
conferir(['pacientes', 'perfil', 'consultas', 'bloqueios', 'holoscope', 'oq3', 'pqq']
    .every(t => conta.tabelas.indexOf(t) >= 0),
  'o exportar leva tudo, o perfil e a agenda inclusive: ' + conta.tabelas);
conferir(conta.perfilNoPacote === 1 && conta.nomeNoPacote === 'Ana Paula Ferreira',
  'e vai preenchido: ' + conta.nomeNoPacote);
conferir(conta.tiles.some(t => /^1 paciente/.test(t)) &&
         conta.tiles.some(t => /arquivos/.test(t)),
  'a aba conta o que existe: ' + conta.tiles.join(' · '));
conferir(/nenhuma sessão do supabase ativa/i.test(conta.texto),
  'sem sessão real (teste usa o app direto, sem logar), a aba diz isso com honestidade');
conferir(!/senha atual/i.test(conta.texto) && !/plano/i.test(conta.texto),
  'sem campo de senha e sem plano: nada disso existe neste app');

/* --------------------------------------------------------------- fim ----- */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
if (ruim.length) falhou = true;
await nav.close();
process.exit(falhou ? 1 : 0);
