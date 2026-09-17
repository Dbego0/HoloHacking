/**
 * As partes novas da ficha: a faixa de situação, a linha do tempo, os
 * formulários e a janela de respostas.
 *
 * O que cada uma resolve:
 *
 *   FAIXA        as quatro perguntas que se faz antes de atender — quando foi
 *                a última, quando é a próxima, o que está aberto, o que já foi
 *                entregue — tinham resposta em quatro lugares diferentes.
 *   LINHA        o app guardava os pedaços com data (aplicação, consulta,
 *                documento) e nunca os tinha posto na mesma régua.
 *   FORMULÁRIOS  no método o HOLOSCOPE É um formulário; os quatro do método
 *                estavam espalhados por três seções do menu.
 *   RESPOSTAS    o app calculava a nota e guardava as 84 respostas numa caixa
 *                que nenhuma tela abria. Depois de aplicar, ninguém conseguia
 *                reler o que a pessoa tinha respondido.
 *
 * E o que ele cobra que NÃO seja feito: ferramenta preenchida não tem data,
 * então não pode aparecer na linha do tempo com uma data inventada.
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
await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
const ok = (c, t) => console.log((c ? '  ok    ' : '  FALHA ') + t);
let falhou = false;
const conferir = (c, t) => { if (!c) falhou = true; ok(c, t); };

const aba = (x) => p.evaluate(async (n) => {
  document.querySelector('[data-aba="' + n + '"]').click();
  await new Promise(r => setTimeout(r, 300));
}, x);

/* ---------------------------------------------- montar uma ficha cheia --- */

await p.evaluate(async (respostas) => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Marina Alves';
  document.getElementById('np-telefone').value = '+55 62 99999-1234';
  document.getElementById('np-email').value = 'marina.alves@email.com';
  document.getElementById('np-sexo').value = 'F';
  document.getElementById('np-nascimento').value = '1983-10-23';
  document.getElementById('np-queixa').value = 'Compulsão noturna há dois anos.';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 350));
  const pid = window.pacienteAtivoId();

  // o questionario respondido, direto na caixa que o questionario usa
  const q = {}; respostas.forEach(r => q[r.marcador_id] = r.intensidade);
  localStorage.setItem('holohacking.questionario', JSON.stringify({ [pid]: q }));

  const dias = n => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  };
  const datar = (i, d) => {
    const h = JSON.parse(localStorage.getItem('holohacking.pontuacao'));
    h[pid][i].quando = d;
    localStorage.setItem('holohacking.pontuacao', JSON.stringify(h));
  };

  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  window.aplicarPontuacao(HOLOSCOPE.calcular(respostas));
  datar(0, dias(-92));
  const s = {}; HOLOSCOPE.questionario().forEach(x => s[x.id] = x.sentido);
  window.aplicarPontuacao(HOLOSCOPE.calcular(respostas.map(x => ({
    marcador_id: x.marcador_id,
    intensidade: s[x.marcador_id] === 'invertido'
      ? Math.min(3, x.intensidade + 2) : Math.max(0, x.intensidade - 2) }))));
  datar(1, dias(-8));

  // uma ferramenta (sem data — é o que não pode virar linha do tempo)
  localStorage.setItem('holohacking.ferramentas',
    JSON.stringify({ [pid]: { oq3: { quer: 'Dormir a noite inteira' } } }));
  localStorage.setItem('holohacking.exames',
    JSON.stringify({ [pid]: { 'EXA-001': 105 } }));

  await window.DadosLocais.from('consultas').insert({
    paciente_id: pid, data: dias(6), hora: '10:00', duracao: 60,
    tipo: 'Reavaliação HOLOSCOPE', nota: 'levar o exame novo' });

  const png = () => {
    const c = document.createElement('canvas'); c.width = 80; c.height = 40;
    return new Promise(r => c.toBlob(b => r(new File([b], 'x.png', { type: 'image/png' })), 'image/png'));
  };
  await window.ArquivoStore.salvar(pid, await png(),
    { nome: 'Hemograma completo', tipo: 'Exame laboratorial', data: dias(-40) });
}, caso.respostas);

await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.querySelector('.card-paciente').click();
  await new Promise(r => setTimeout(r, 400));
});

/* ------------------------------------------------------ o cabeçalho ------ */

const topo = await p.evaluate(() => ({
  nome: document.getElementById('ficha-nome').textContent,
  status: document.getElementById('ficha-status').textContent,
  contato: document.getElementById('ficha-contato').innerHTML,
  sobre: document.getElementById('ficha-sobre').textContent,
  detalhesFechados: document.getElementById('ficha-detalhes').classList.contains('hidden'),
  acoes: [...document.querySelectorAll('.fic-acoes-topo button')].map(b => b.textContent.trim()),
}));

conferir(topo.nome === 'Marina Alves' && topo.status === 'Ativo',
  'o cabeçalho traz nome e situação: ' + topo.nome + ' / ' + topo.status);
conferir(/href="tel:/.test(topo.contato) && /href="mailto:/.test(topo.contato),
  'telefone e e-mail viram link — a ficha é aberta para falar com a pessoa');
conferir(/Cadastrado em \d\d\/\d\d\/\d{4}/.test(topo.contato),
  'e a data de cadastro aparece no cabeçalho: ' + topo.contato);
conferir(/42 anos/.test(topo.sobre) && /Feminino/.test(topo.sobre),
  'e a linha "sobre" resume quem é: ' + topo.sobre);
conferir(topo.detalhesFechados, 'os detalhes do cadastro começam fechados');
conferir(topo.acoes.join(',') === 'Nova consulta,Registrar exames,Novo documento,Aplicar HOLOSCOPE',
  'as ações ficam no topo, não no fim da página: ' + topo.acoes.join(' · '));

// "Registrar exames" e "Novo documento" iam para "aba:documentos" — o clique
// so ia parar la se a rota "aba:" fosse tratada tambem para botao estatico
// do cabecalho (antes so ficha.js sabia disso; zerava a tela inteira).
const abriuDocumentos = await p.evaluate(async () => {
  document.querySelector('.fic-acoes-topo [data-ir="aba:documentos"]').click();
  await new Promise(r => setTimeout(r, 200));
  const r = {
    abaAtiva: document.querySelector('[data-aba="documentos"]').classList.contains('ativa'),
    fichaVisivel: !document.getElementById('vista-ficha').classList.contains('hidden'),
  };
  document.querySelector('[data-aba="visao"]').click();
  return r;
});
conferir(abriuDocumentos.abaAtiva && abriuDocumentos.fichaVisivel,
  'e "Registrar exames"/"Novo documento" abrem a aba certa, sem zerar a tela');

// ------------------------------------------------------ a jornada clinica --

const jornada = await p.evaluate(() => ({
  passos: [...document.querySelectorAll('.fic-jornada .dash-jornada-passo b')]
    .map(b => b.textContent),
}));
conferir(jornada.passos.join(',') === 'Paciente,Consulta,HOLOSCOPE,HOLOSCAN,Documentos',
  'a jornada clínica mostra o encadeamento: ' + jornada.passos.join(' · '));

const detalhes = await p.evaluate(async () => {
  document.getElementById('ficha-ver-detalhes').click();
  await new Promise(r => setTimeout(r, 150));
  return {
    aberto: !document.getElementById('ficha-detalhes').classList.contains('hidden'),
    texto: document.getElementById('ficha-detalhes').innerText.replace(/\s+/g, ' '),
  };
});
conferir(detalhes.aberto && /Compulsão noturna/.test(detalhes.texto),
  'e abrem com o que foi digitado no cadastro');

/* --------------------------------------------------------- a faixa ------- */

const faixa = await p.evaluate(() => {
  const um = rot => [...document.querySelectorAll('#ficha-faixa .fic-pilula')]
    .find(e => new RegExp(rot, 'i').test(e.querySelector('.fic-pilula-rot').textContent));
  const ler = e => e ? { txt: e.querySelector('b').textContent, cls: e.className } : null;
  return {
    ultima: ler(um('última aplicação')),
    proxima: ler(um('próxima consulta')),
    aberto: ler(um('em aberto')),
    exames: ler(um('exames')),
    docs: ler(um('documentos')),
  };
});

conferir(/há 8 dias/.test(faixa.ultima.txt),
  'a faixa diz quando foi a última aplicação: ' + faixa.ultima.txt);
conferir(/às 10:00/.test(faixa.proxima.txt) && /em 6 dias/.test(faixa.proxima.txt),
  'e quando é a próxima consulta: ' + faixa.proxima.txt);
conferir(/pendência/.test(faixa.aberto.txt) && /alerta/.test(faixa.aberto.cls),
  'o que está em aberto acende: ' + faixa.aberto.txt);
conferir(/1 preenchidos/.test(faixa.exames.txt), 'conta os exames: ' + faixa.exames.txt);
conferir(/1 arquivo/.test(faixa.docs.txt), 'e os documentos: ' + faixa.docs.txt);

/* ------------------------------------------- visão geral: exames e docs -- */

await new Promise(r => setTimeout(r, 200)); // ArquivoStore.listar() e assincrono
const visaoResumo = await p.evaluate(() => {
  const blocos = [...document.querySelectorAll('#aba-visao .dash-bloco-compacto')];
  const de = titulo => blocos.find(b => b.querySelector('.dash-titulo').textContent === titulo);
  const exames = de('Exames');
  const docs = de('Documentos recentes');
  return {
    exames: exames.textContent.replace(/\s+/g, ' ').trim(),
    docItens: [...docs.querySelectorAll('.dash-pendente b')].map(b => b.textContent),
  };
});
conferir(/1 valor registrado/.test(visaoResumo.exames), 'Visão geral resume os exames: ' + visaoResumo.exames);
conferir(visaoResumo.docItens.includes('Hemograma completo'),
  'e os documentos recentes: ' + visaoResumo.docItens.join(' · '));

/* --------------------------------------------------- a linha do tempo ---- */

await aba('linha');
const linha = await p.evaluate(() => ({
  eventos: [...document.querySelectorAll('#aba-linha .fic-evento')].map(e => ({
    txt: e.innerText.replace(/\n/g, ' | '),
    cls: e.className,
  })),
  meses: [...document.querySelectorAll('#aba-linha .fic-tempo-mes')].map(e => e.textContent),
  nota: document.querySelector('#aba-linha .dash-sub')?.textContent || '',
}));

conferir(linha.eventos.length === 5,
  'a linha do tempo junta o que tem data: ' + linha.eventos.length + ' registros');
conferir(/Consulta marcada/.test(linha.eventos[0].txt) && /futuro/.test(linha.eventos[0].cls),
  'o que ainda vai acontecer vem primeiro e se marca como futuro: ' +
  linha.eventos[0].txt.slice(0, 40));
conferir(linha.eventos.some(e => /2ª aplicação do HOLOSCOPE/.test(e.txt) && /Índice 88/.test(e.txt)),
  'a aplicação do mapa traz o Índice daquele dia');
conferir(linha.eventos.some(e => /Hemograma/.test(e.txt) && /documento/.test(e.cls)),
  'o documento entra na mesma régua');
conferir(linha.eventos.some(e => /1ª aplicação/.test(e.txt) && /há 3 meses/.test(e.txt)),
  'e a primeira aplicação fica lá atrás, com o tempo em palavras');
conferir(linha.meses.length >= 3, 'agrupado por mês: ' + linha.meses.join(' · '));

/* Ferramenta aplicada passou a ser um registro datado — antes era um objeto
   sobrescrito sem data nenhuma, e por isso não podia entrar aqui. */
conferir(linha.eventos.some(e => /aplicada/.test(e.txt) && /ferramenta/.test(e.cls)),
  'ferramenta aplicada entra na linha do tempo, agora que tem data');

/* E a data é a do calendário de quem olha, não a do UTC: um registro feito às
   21h no Brasil não pode aparecer como sendo de amanhã. */
const hojeLocal = (() => {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' +
         String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
})();
const daFerramenta = linha.eventos.find(e => /aplicada/.test(e.txt));
conferir(daFerramenta && daFerramenta.txt.indexOf(hojeLocal) >= 0,
  'e com a data local, não a do UTC: ' + (daFerramenta || {}).txt);

/* ----------------------------------------------------- os formulários ---- */

await aba('formularios');
const forms = await p.evaluate(() => ({
  cartoes: [...document.querySelectorAll('#aba-formularios .fic-form')].map(e => ({
    txt: e.textContent.replace(/\s+/g, ' ').trim(),
    cls: e.className,
    temVer: !!e.querySelector('[data-ver]'),
  })),
  ferramentas: document.querySelector('#aba-formularios .fic-forms-rodape')
    .textContent.replace(/\s+/g, ' ').trim(),
}));

conferir(forms.cartoes.length === 4,
  'os quatro formulários do método num lugar só: ' + forms.cartoes.length);
conferir(/HOLOSCOPE/.test(forms.cartoes[0].txt) && /84 de 84 respondidas/.test(forms.cartoes[0].txt),
  'o HOLOSCOPE é tratado como formulário, que é o que ele é: ' +
  forms.cartoes[0].txt.slice(0, 70));
conferir(/pronto/.test(forms.cartoes[0].cls), 'e o completo se marca como pronto');
conferir(forms.cartoes[0].temVer, 'só quem tem resposta oferece "Ver respostas"');
conferir(!forms.cartoes[2].temVer || /não aplicado/.test(forms.cartoes[2].txt),
  'quem não foi respondido não finge que foi');
conferir(/Índice 88/.test(forms.cartoes[0].txt),
  'o cartão do HOLOSCOPE diz qual mapa saiu dele');
conferir(/1 de 30 aplicadas/.test(forms.ferramentas),
  'e as ferramentas ficam à parte — são conduta, não formulário: ' +
  forms.ferramentas.slice(0, 60));

/* ------------------------------------------------ a janela de respostas -- */

const janela = await p.evaluate(async () => {
  document.querySelector('#aba-formularios [data-ver]').click();
  await new Promise(r => setTimeout(r, 350));
  const j = document.getElementById('fic-janela');
  return {
    aberta: !j.classList.contains('hidden'),
    titulo: document.getElementById('fic-janela-titulo').textContent,
    sub: document.getElementById('fic-janela-sub').textContent,
    indice: j.querySelector('.fic-res-topo b')?.textContent || '',
    sistemas: j.querySelectorAll('.fic-res-sis').length,
    blocos: [...j.querySelectorAll('.fic-bloco-titulo')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    respostas: j.querySelectorAll('.fic-resposta').length,
    primeira: j.querySelector('.fic-resposta')?.textContent.replace(/\s+/g, ' ').trim() || '',
    invertidas: j.querySelectorAll('.fic-pergunta i').length,
  };
});

conferir(janela.aberta && /Marina Alves/.test(janela.titulo),
  'a janela abre com as respostas daquela pessoa');
conferir(/84 de 84 perguntas respondidas/.test(janela.sub),
  'e diz quantas são: ' + janela.sub.slice(0, 44));
conferir(/Índice HOLOS 88/.test(janela.indice) && janela.sistemas === 5,
  'o resultado vem primeiro, como no papel: ' + janela.indice);
conferir(janela.respostas === 84,
  'e todas as respostas estão lá — a caixa que nenhuma tela abria: ' + janela.respostas);
conferir(janela.blocos.length === 3,
  'agrupadas nos três blocos em que foram respondidas: ' + janela.blocos.join(' · '));
conferir(/\d/.test(janela.primeira) && /Nunca|Às vezes|Frequente|Sempre|Nada|Um pouco|Bastante|Muito/
    .test(janela.primeira),
  'cada uma com o número e a palavra da escala: ' + janela.primeira.slice(-40));
conferir(janela.invertidas > 0,
  'e as de sentido invertido se identificam — responder alto ali é sinal bom: ' +
  janela.invertidas + ' delas');

const fechou = await p.evaluate(async () => {
  document.getElementById('fic-janela-fechar').click();
  await new Promise(r => setTimeout(r, 150));
  return document.getElementById('fic-janela').classList.contains('hidden');
});
conferir(fechou, 'e a janela fecha');

/* ----------------------------------- a ficha nova não perdeu o que havia -- */

await aba('documentos');
const juntos = await p.evaluate(() => ({
  exames: document.querySelectorAll('#ex-corpo .ex-linha').length,
  cartoes: [...document.querySelectorAll('#aba-documentos .arq-titulo')].map(h => h.textContent),
  atalho: document.querySelector('.ex-atalho')?.textContent || '',
}));
conferir(juntos.exames > 0, 'os valores do exame continuam inteiros: ' + juntos.exames + ' linhas');
conferir(juntos.cartoes.length === 2,
  'e moram junto com o documento de onde saem: ' + juntos.cartoes.join(' · '));
conferir(/Hemograma/.test(juntos.atalho),
  'o exame guardado vira atalho para abrir ao lado: ' + juntos.atalho);

await aba('relatorio');
const rel = await p.evaluate(() => !!document.getElementById('relatorio'));
conferir(rel, 'e o relatório também');

/* --------------------------------------------------------------- fim ----- */
console.log('');
ok(ruim.length === 0, ruim.length ? 'ERRO DE JS: ' + ruim[0] : 'sem erro de JS');
if (ruim.length) falhou = true;
await nav.close();
process.exit(falhou ? 1 : 0);
