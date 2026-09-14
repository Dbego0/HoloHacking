/** Subir PDF e foto de exame, listar, abrir e remover. */
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('amostras', { recursive: true });
// PDF minimo valido e um PNG 1x1
writeFileSync('amostras/exame.pdf', '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
writeFileSync('amostras/laudo.png', Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));

const nav = await puppeteer.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:'new', args:['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({width:1400,height:1000});
const ruim=[]; p.on('pageerror',e=>ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/',{waitUntil:'networkidle2'});
let falhou = false;
const ok = (c,t) => {
  if (!c) falhou = true;
  console.log((c?'  ok    ':'  FALHA ')+t);
};

await p.evaluate(() => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('vista-lista-pacientes').classList.add('hidden');
  document.getElementById('vista-ficha').classList.remove('hidden');
  document.querySelector('[data-aba="documentos"]').click();
});
ok(await p.$('#doc-solta') !== null, 'a area de arrastar existe');

const campo = await p.$('#doc-arquivo');
await campo.uploadFile('amostras/exame.pdf', 'amostras/laudo.png');
await new Promise(r => setTimeout(r, 900));

const dep = await p.evaluate(() => ({
  itens: document.querySelectorAll('.doc-item').length,
  nomes: [...document.querySelectorAll('.doc-item b')].map(e=>e.textContent),
  tamanhos: [...document.querySelectorAll('.doc-tam')].map(e=>e.textContent),
  aviso: document.querySelector('.doc-ok')?.textContent,
  espaco: document.getElementById('doc-espaco')?.textContent.slice(0,60),
}));
ok(dep.itens === 2, dep.itens + ' arquivos guardados: ' + dep.nomes.join(', '));
ok(dep.tamanhos.every(t => /B|KB|MB/.test(t)), 'mostra o tamanho: ' + dep.tamanhos.join(' / '));
ok(/guardado/.test(dep.aviso||''), 'confirma o guardado');

// sobrevive a recarregar
await p.reload({waitUntil:'networkidle2'});
await new Promise(r => setTimeout(r, 700));
const vivo = await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('vista-lista-pacientes').classList.add('hidden');
  document.getElementById('vista-ficha').classList.remove('hidden');
  document.querySelector('[data-aba="documentos"]').click();
  await new Promise(r => setTimeout(r, 500));
  return document.querySelectorAll('.doc-item').length;
});
ok(vivo === 2, 'sobrevivem a recarregar a pagina: ' + vivo);

// o arquivo guardado e o mesmo que entrou
const conteudo = await p.evaluate(async () => {
  const itens = await window.ArquivoStore.listar(window.pacienteAtivoId() || '_sem_paciente');
  const pdf = itens.find(i => /pdf/i.test(i.nome));
  const r = await window.ArquivoStore.pegar(pdf.id);
  return { mime: r.mime, texto: (await r.arquivo.text()).slice(0, 8) };
});
ok(conteudo.texto.startsWith('%PDF'), 'o PDF volta intacto: ' + conteudo.texto);
ok(/pdf/.test(conteudo.mime), 'tipo reconhecido: ' + conteudo.mime);

// remover
const rem = await p.evaluate(async () => {
  document.querySelector('[data-tirar]').click();
  await new Promise(r => setTimeout(r, 500));
  return document.querySelectorAll('.doc-item').length;
});
ok(rem === 1, 'remover apaga de verdade: sobrou ' + rem);

await nav.close();
console.log(ruim.length?'\n  ERRO: '+ruim[0]:'\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
