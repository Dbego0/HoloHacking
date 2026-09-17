/**
 * O bug: as 30 ferramentas guardavam tudo numa chave so, sem paciente.
 * Preencher a mesma ferramenta para o segundo paciente apagava o primeiro.
 * Este teste reproduz exatamente isso e confirma que parou de acontecer.
 *
 * O Supabase e dublado — nenhum paciente de verdade e criado.
 */
import puppeteer from 'puppeteer-core';

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars']
});
const p = await nav.newPage();
await p.setViewport({ width: 1500, height: 950 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));

// dois pacientes de mentira, injetados antes do app subir
await p.evaluateOnNewDocument(() => {
  window.__PACIENTES = [
    { id: 'p-marina', nome: 'Marina Alves', oq3: {}, pqq: {}, holoscope: {} },
    { id: 'p-carla', nome: 'Carla Ribeiro', oq3: {}, pqq: {}, holoscope: {} }
  ];
});
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });

let falhou = false;
const ok = (c, txt) => {
  if (!c) falhou = true;
  console.log((c ? '  ok    ' : '  FALHA ') + txt);
};

// entra na lista de pacientes que o app mantem em memoria
const entrou = await p.evaluate(async () => {
  const sel = document.querySelector('.seletor-paciente');
  if (!sel) return false;
  sel.innerHTML = window.__PACIENTES
    .map(x => '<option value="' + x.id + '">' + x.nome + '</option>').join('');
  return true;
});
ok(entrou, 'seletor de paciente encontrado');

/** Troca o paciente ativo pelo mesmo caminho que a interface usa. */
async function trocarPara(id) {
  await p.evaluate((pid) => {
    // o app guarda os pacientes no seu proprio estado; a demo injeta os nossos
    const ev = new Event('change', { bubbles: true });
    document.querySelectorAll('.seletor-paciente').forEach(s => { s.value = pid; });
    // pacienteAtivoId e o que formulario.js consulta
    window.pacienteAtivoId = () => pid;
    window.pacienteAtivoNome = () =>
      (window.__PACIENTES.find(x => x.id === pid) || {}).nome || null;
    if (window.aoTrocarPaciente) window.aoTrocarPaciente();
    document.dispatchEvent(ev);
  }, id);
}

async function preencher(texto) {
  await p.evaluate(async () => {
    document.querySelector('.nav-item[data-secao="mente"]').click();
    document.querySelector('[data-ferramenta="mapa_crencas"]').click();
  await new Promise(r => setTimeout(r, 350));
  });
  await p.evaluate((t) => {
    document.getElementById('campo-crencas').value = t;
    document.querySelector('#vista-gen-mente [data-acao="concluir"]').click();
  }, texto);
}

async function lerCampo() {
  return p.evaluate(async () => {
    document.querySelector('.nav-item[data-secao="mente"]').click();
    document.querySelector('[data-ferramenta="mapa_crencas"]').click();
  await new Promise(r => setTimeout(r, 350));
    return document.getElementById('campo-crencas').value;
  });
}

// --- Marina preenche -------------------------------------------------------
await trocarPara('p-marina');
await preencher('Briga em casa no fim do dia');
ok(await lerCampo() === 'Briga em casa no fim do dia', 'Marina: gravou e releu');

const faixa1 = await p.evaluate(() => document.querySelector('.form-paciente')?.textContent);
ok(faixa1 === 'Marina Alves', 'a ficha diz para quem e: ' + faixa1);

// --- Carla preenche a MESMA ferramenta -------------------------------------
await trocarPara('p-carla');
const vazioCarla = await lerCampo();
ok(vazioCarla === '', 'Carla abre a mesma ferramenta em branco');

await preencher('Reuniao dificil no trabalho');
ok(await lerCampo() === 'Reuniao dificil no trabalho', 'Carla: gravou e releu');

// --- e a Marina? o bug antigo apagaria aqui --------------------------------
await trocarPara('p-marina');
const marinaDepois = await lerCampo();
ok(marinaDepois === 'Briga em casa no fim do dia',
   'Marina intacta depois da Carla: "' + marinaDepois + '"');

// --- o selo da galeria segue o paciente ------------------------------------
const selo = await p.evaluate(async () => {
  document.querySelector('.btn-voltar')?.click();
  return document.querySelector('[data-ferramenta="mapa_crencas"] .ferr-status').textContent;
});
ok(selo === 'Concluída', 'selo da Marina: ' + selo);

await trocarPara('p-carla');
await p.evaluate(() => document.querySelector('.nav-item[data-secao="espirito"]').click());
const seloVazio = await p.evaluate(() =>
  document.querySelector('[data-ferramenta="roda_vida"] .ferr-status').textContent);
ok(seloVazio === 'Disponível', 'ferramenta nao preenchida pela Carla: ' + seloVazio);

// --- o que ficou guardado --------------------------------------------------
const guardado = await p.evaluate(() => {
  const apps = window.DadosLocais.exportar().tabelas.aplicacoes || [];
  return apps.map(a => ({
    paciente: a.paciente_id, ferramenta: a.ferramenta_id,
    estado: a.status, crencas: (a.respostas || {}).crencas
  }));
});
ok(guardado.length === 2, 'duas aplicacoes, uma por paciente: ' + guardado.length);
ok(guardado.every(a => a.estado === 'concluida'), 'as duas concluidas');
ok(new Set(guardado.map(a => a.paciente)).size === 2,
   'cada uma sob o seu paciente');
console.log('\n  guardado:', JSON.stringify(guardado));

await nav.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
