/**
 * HISTÓRICO ANTIGO — a revisão clínica do HOLOSCOPE acrescentou campos
 * opcionais ao snapshot de Pontuação (interpretacao, versao_estrutura) e
 * mudou como a tela lê `combinacoes`. Nenhum snapshot já salvo antes desta
 * rodada tem esses campos, e este teste trava que isso não quebra nada:
 *
 *   - um snapshot "v1" (sem status em combinacoes, sem interpretacao, sem
 *     versao_estrutura) renderiza sem erro de JS na ficha e no relatório;
 *   - a seção C do relatório diz "Sem interpretação registrada" para ele,
 *     em vez de inventar uma ou quebrar;
 *   - o snapshot fica byte a byte igual no disco depois de ser lido/exibido
 *     — nada é migrado, recalculado ou reescrito silenciosamente.
 */
import puppeteer from 'puppeteer-core';

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
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? '  ok    ' : '  FALHA ') + t); };

await p.evaluate(async () => {
  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('btn-abrir-novo').click();
  document.getElementById('np-nome').value = 'Paciente Legado';
  document.getElementById('btn-salvar-paciente').click();
  await new Promise(r => setTimeout(r, 400));
});

const resultado = await p.evaluate(async () => {
  const pid = window.pacienteAtivoId();

  /* Um snapshot exatamente como o app gravava antes desta rodada: sem
     status em combinacoes, sem dominantes/respondidos/total_marcadores em
     alguns sistemas (simulando um formato ainda mais antigo), sem
     interpretacao, sem versao_estrutura. */
  const v1 = {
    quando: '2024-06-01',
    indice: 61, indice_maximo: 100, avaliavel: true,
    cobertura: { respondidos: 84, total: 84, percentual: 100 },
    sistemas: [
      { sistema: 'fungico', nome: 'Sistema Fúngico', nota: 7.2, carga: 2.8,
        faixa: 'alto', obtido: 10, maximo: 30, avaliavel: true },
      { sistema: 'acido_inflamatorio', nome: 'Sistema Ácido-Inflamatório', nota: 6.0, carga: 4.0,
        faixa: 'medio', obtido: 12, maximo: 30, avaliavel: true },
      { sistema: 'metabolico', nome: 'Sistema Metabólico', nota: 5.5, carga: 4.5,
        faixa: 'medio', obtido: 14, maximo: 30, avaliavel: true },
      { sistema: 'detox_linfatico', nome: 'Sistema Detox + Linfático', nota: 6.8, carga: 3.2,
        faixa: 'alto', obtido: 9, maximo: 30, avaliavel: true },
      { sistema: 'mental_emocional_espiritual', nome: 'Sistema Mental-Emocional-Espiritual',
        nota: 5.0, carga: 5.0, faixa: 'medio', obtido: 15, maximo: 30, avaliavel: true },
    ],
    triada: { fisico: 6.5, mental: 5.0, espiritual: 4.5 },
    triada_com_dado: { fisico: true, mental: true, espiritual: true },
    combinacoes: [
      { id: 'CMB-001', leitura: 'Paciente vivendo em estado crônico de ameaça',
        tipo: 'leitura', investigar: '', prioridade: 1, condicao: 'metabolico <= 3', fonte: 'material' },
    ],
  };

  const tudo = JSON.parse(localStorage.getItem('holohacking.pontuacao') || '{}');
  tudo[pid] = [v1];
  localStorage.setItem('holohacking.pontuacao', JSON.stringify(tudo));
  if (window.Concorrencia) window.Concorrencia.avancarRevisao('pontuacao');
  const antesDoDisco = localStorage.getItem('holohacking.pontuacao');

  document.querySelector('.nav-item[data-secao="pacientes"]').click();
  document.getElementById('vista-lista-pacientes').classList.add('hidden');
  document.getElementById('vista-ficha').classList.remove('hidden');
  document.querySelector('[data-aba="visao"]').click();
  window.redesenharFicha();
  await new Promise(r => setTimeout(r, 350));
  const indiceNaFicha = document.querySelector('#aba-visao .fic-indice b')?.textContent;
  const triadaNaFicha = [...document.querySelectorAll('#aba-visao .fic-triada span')].length;

  document.querySelector('[data-aba="relatorio"]').click();
  await new Promise(r => setTimeout(r, 350));
  const rel = document.getElementById('relatorio');
  const partes = [...rel.querySelectorAll('.rel-parte')].map(s => s.dataset.origem);
  // registro "nutri" (padrão) mostra um textarea vazio, editável; "paciente"
  // mostra o texto so-leitura ou o aviso de "sem interpretação".
  const interpretacaoNutri = rel.querySelector('#rel-interpretacao')?.value ?? null;
  document.querySelector('[data-registro="paciente"]')?.click();
  await new Promise(r => setTimeout(r, 250));
  const relPaciente = document.getElementById('relatorio');
  const interpretacaoPaciente = relPaciente.querySelector('[data-origem="profissional"] .rel-vazio')?.textContent || '';
  const indiceNoRelatorio = rel.querySelector('.rel-indice b')?.textContent;

  const depoisDoDisco = localStorage.getItem('holohacking.pontuacao');

  return {
    indiceNaFicha, triadaNaFicha, partes, interpretacaoNutri, interpretacaoPaciente,
    indiceNoRelatorio, inalterado: antesDoDisco === depoisDoDisco,
  };
});

ok(resultado.indiceNaFicha === '61', 'ficha mostra o Índice do snapshot v1: ' + resultado.indiceNaFicha);
ok(resultado.triadaNaFicha === 3, 'e a Tríade completa, com os campos que o v1 tinha');
ok(resultado.partes.join(',') === 'automatico,automatico,profissional',
   'relatório separa A/B/C mesmo para um snapshot v1: ' + resultado.partes.join(','));
ok(resultado.interpretacaoNutri === '',
   'registro "nutri": campo de interpretação vem vazio, não inventado: "' + resultado.interpretacaoNutri + '"');
ok(/Sem interpretação registrada/.test(resultado.interpretacaoPaciente),
   'registro "paciente": diz que não há interpretação — não inventa nem quebra: "' +
   resultado.interpretacaoPaciente + '"');
ok(resultado.indiceNoRelatorio === '61', 'Índice no relatório também é o do snapshot v1: ' + resultado.indiceNoRelatorio);
ok(resultado.inalterado, 'o snapshot v1 continua byte a byte igual no disco depois de exibido');

await nav.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
