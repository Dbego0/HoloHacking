/**
 * Os passos 4 e 5 do metodo: APROFUNDAR e FORMULAR HIPOTESES.
 *
 * "O HOLOSCOPE nao e uma lista de perguntas." O app era 84 perguntas, uma nota
 * e uma ferramenta — pulava direto do mapa para a conduta. Faltavam a pergunta
 * que vem depois da resposta alta, e a distincao entre hipotese e achado.
 *
 * O conteudo — as 84 perguntas de aprofundamento, o que investigar em cada
 * hipotese, e as regras de encaminhamento — esta escrito como RASCUNHO e
 * espera a revisao do Rodrigo. O que este teste trava e o comportamento: a
 * resposta alta abre a pergunta seguinte, a hipotese diz o que conferir antes
 * de concluir, e o que sai do escopo da nutricao aparece separado e na frente.
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const caso = JSON.parse(readFileSync(new URL('caso.json', import.meta.url), 'utf8'));

const nav = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--hide-scrollbars'] });
const p = await nav.newPage();
await p.setViewport({ width: 1500, height: 1200 });
const ruim = []; p.on('pageerror', e => ruim.push(e.message));
await p.goto('http://127.0.0.1:5500/', { waitUntil: 'networkidle2' });
await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
await p.waitForFunction(() => window.pacientesCarregados && window.pacientesCarregados());
let falhou = false;
const ok = (c, t) => {
  if (!c) falhou = true;
  console.log((c ? '  ok    ' : '  FALHA ') + t);
};

// --- o aprofundamento, a partir do caso de exemplo ----------------------
const hoje = await p.evaluate((respostas) => {
  document.querySelector('.nav-item[data-secao="holoscope"]').click();
  const r = HOLOSCOPE.calcular(respostas);
  window.aplicarPontuacao(r);
  return {
    doMotor: r.aprofundamentos.length,
    naTela: document.querySelectorAll('.leitura-aprofundar li').length,
    primeira: document.querySelector('.leitura-aprofundar b')?.textContent,
    titulos: [...document.querySelectorAll('.leitura-titulo')].map(e => e.textContent),
    encaminhar: document.querySelectorAll('.leitura-encaminhar .leitura-item').length,
  };
}, caso.respostas);
ok(hoje.doMotor > 0 && hoje.naTela === hoje.doMotor,
   hoje.doMotor + ' perguntas de aprofundamento abertas pelas respostas altas');
console.log('          primeira: ' + hoje.primeira);
/* Revisao clinica do HOLOSCOPE (decisao 1): nenhuma CMB aparece na
   interface clinica nesta rodada — nem "Hipótese a investigar" nem "Fora do
   escopo da nutrição" — mesmo quando o caso de exemplo dispara encaminhamento
   e hipotese no motor. cmbParaExibir() (app.js) sempre devolve lista vazia;
   o aprofundamento (que NAO depende de combinacao nenhuma) continua intacto,
   como as duas asserções acima provam. */
ok(hoje.encaminhar === 0,
   'nenhum encaminhamento aparece na tela, mesmo o caso disparando no motor: ' + hoje.encaminhar);
ok(!hoje.titulos.includes('Hipótese a investigar') &&
   !hoje.titulos.includes('Fora do escopo da nutrição') &&
   !hoje.titulos.includes('Leitura combinada'),
   'nenhum bloco de combinação aparece: ' + hoje.titulos.join(' · '));

// --- amanha: com aprofundamento e encaminhamento -------------------------
const amanha = await p.evaluate((respostas) => {
  const r = HOLOSCOPE.calcular(respostas);
  r.aprofundamentos = [
    { marcador_id: 'SNT-501', rotulo: 'sono não reparador', origem: 'sintoma',
      resposta: 3, pergunta: 'O que normalmente acontece nos dias em que você dorme pior?' },
    { marcador_id: 'SNT-304', rotulo: 'compulsão à noite', origem: 'sintoma',
      resposta: 2, pergunta: 'O que muda no seu comportamento alimentar nesses dias?' },
  ];
  r.combinacoes = [
    { id: 'CMB-001', leitura: 'Paciente vivendo em estado crônico de ameaça',
      tipo: 'leitura', investigar: 'cortisol salivar e rotina de sono',
      prioridade: 1, condicao: 'metabolico <= 3', fonte: 'material' },
    { id: 'CMB-900', leitura: 'Quadro sugere avaliação médica',
      tipo: 'encaminhar', investigar: 'encaminhar antes de qualquer conduta nutricional',
      prioridade: 1, condicao: 'marcador.SNT-210 >= 2', fonte: 'material' },
  ];
  window.aplicarPontuacao(r);

  const lin = document.querySelectorAll('.leitura-aprofundar li');
  return {
    perguntas: [...lin].map(l => ({
      de: l.querySelector('.apro-de').textContent,
      pergunta: l.querySelector('b').textContent,
    })),
    encaminhar: [...document.querySelectorAll('.leitura-encaminhar .leitura-item b')]
      .map(e => e.textContent),
    hipoteses: [...document.querySelectorAll('.leitura-combinada b')].map(e => e.textContent),
    investigar: document.querySelector('.leitura-investigar')?.textContent,
    ordemTitulos: [...document.querySelectorAll('.leitura-titulo')].map(e => e.textContent),
  };
}, caso.respostas);

ok(amanha.perguntas.length === 2, amanha.perguntas.length + ' perguntas de aprofundamento na tela');
amanha.perguntas.forEach(q => console.log('          ' + q.de + ' → ' + q.pergunta));
ok(/dorme pior/.test(amanha.perguntas[0].pergunta),
   'a que pesou mais vem primeiro');

/* Revisao clinica do HOLOSCOPE (decisao 1): mesmo com CMB-001 (status
   implicito confirmado neste objeto forjado) e um encaminhamento manufaturado
   os dois — de proposito, para prova de fogo do H4 (item H): nenhuma CMB
   pode aparecer como conclusao automatica, nem a "confirmada". */
ok(amanha.encaminhar.length === 0,
   'o encaminhamento manufaturado nao aparece na tela: ' + amanha.encaminhar.length);
ok(amanha.hipoteses.length === 0,
   'nenhuma hipotese aparece na tela, nem a CMB-001: ' + amanha.hipoteses.length);
ok(!amanha.investigar,
   'sem bloco de hipotese, tambem nao ha "conferir antes de concluir": ' + amanha.investigar);
ok(!amanha.ordemTitulos.some(t => /Fora do escopo|Hipótese/.test(t)),
   'nenhum titulo de combinacao aparece: ' + amanha.ordemTitulos.join(' · '));

// --- territorios do olhar: cobertura, nao mais uma nota ------------------
const terr = await p.evaluate((respostas) => {
  const r = HOLOSCOPE.calcular(respostas);
  const antes = {
    doMotor: r.territorios.length,
    escondido: document.getElementById('holo-territorios').classList.contains('hidden'),
  };
  r.territorios = [
    { territorio: 'corpo', leitura: 'o que o corpo mostra', ordem: 1,
      respondidos: 49, total: 49, nota: 6.7 },
    { territorio: 'emoções', leitura: 'o que ela sente', ordem: 3,
      respondidos: 19, total: 19, nota: 3.3 },
    { territorio: 'ambiente', leitura: 'o que torna difícil', ordem: 6,
      respondidos: 0, total: 0, nota: null },
  ];
  window.aplicarPontuacao(r);
  const linhas = [...document.querySelectorAll('.terr-linha')];
  return {
    antes,
    linhas: linhas.map(l => ({
      nome: l.querySelector('.terr-nome').childNodes[0].textContent.trim(),
      conta: l.querySelector('.terr-conta').textContent,
      nota: l.querySelector('.terr-nota').textContent,
      vazio: l.classList.contains('sem-dado'),
    })),
    buraco: document.querySelector('.terr-buraco')?.textContent.replace(/\s+/g, ' ').trim(),
  };
}, caso.respostas);

console.log('');
ok(terr.antes.doMotor === 0 && terr.antes.escondido,
   'parados por decisão, os territórios não saem do motor e o painel fica escondido');
ok(terr.linhas.length === 3, terr.linhas.length + ' territórios na tela');
ok(terr.linhas[2].vazio && /nenhuma pergunta/.test(terr.linhas[2].conta),
   'o território sem pergunta vem marcado: ' + terr.linhas[2].nome + ' — ' + terr.linhas[2].conta);
ok(terr.linhas[2].nota === '—',
   'e não recebe nota: um traço, não um 10 que passaria por equilíbrio');
ok(/não é equilíbrio/i.test(terr.buraco || ''),
   'e a tela diz o que aquilo significa: ' + (terr.buraco || '').slice(0, 88));

await nav.close();
console.log(ruim.length ? '\n  ERRO: ' + ruim[0] : '\n  sem erro de JS');
process.exit(falhou ? 1 : 0);
