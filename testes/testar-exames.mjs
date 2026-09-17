/** A regra que governa tudo: exame confronta, nunca pontua. */
import puppeteer from 'puppeteer-core';
const nav = await puppeteer.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:'new' });
const p = await nav.newPage();
await p.setContent('<!doctype html><meta charset="utf-8">');
await p.addScriptTag({ url:'http://127.0.0.1:5500/holoscope.js' });
let falhou = false;
const ok = (c,t) => {
  if (!c) falhou = true;
  console.log((c?'  ok    ':'  FALHA ')+t);
};

const r = await p.evaluate(() => {
  const g = window.HOLOSCOPE;
  const lista = g.listaDeExames();

  // paciente que se queixa do metabolico E tem exame alterado -> confirma
  const notasRuins = { fungico:7, acido_inflamatorio:7, metabolico:1,
                       detox_linfatico:7, mental_emocional_espiritual:2 };
  const confirma = g.lerExames({ 'EXA-005':115, 'EXA-007':3.4 }, notasRuins);

  // paciente que NAO se queixa, mas o sangue mostra -> diverge
  const notasBoas = { fungico:8, acido_inflamatorio:8, metabolico:8,
                      detox_linfatico:8, mental_emocional_espiritual:8 };
  const diverge = g.lerExames({ 'EXA-021':12, 'EXA-019':14 }, notasBoas);

  // valor dentro da faixa
  const dentro = g.lerExames({ 'EXA-005':82 }, notasBoas);

  return {
    total: lista.length,
    porSistema: lista.reduce((a,e)=>{a[e.sistema]=(a[e.sistema]||0)+1;return a;},{}),
    confirma: confirma.confronto.find(c=>c.sistema==='metabolico'),
    alteradosConfirma: confirma.alterados,
    diverge: diverge.confronto.find(c=>c.sistema==='mental_emocional_espiritual'),
    dentroSituacao: dentro.exames[0].situacao,
    semExame: diverge.confronto.find(c=>c.sistema==='fungico').concordancia,
    leituraAlto: confirma.exames.find(e=>e.id==='EXA-005').leitura,
  };
});

ok(r.total === 24, r.total + ' exames no banco');
ok(r.porSistema.fungico === 1, 'Funfico com 1 so — o sistema quase nao tem exame de rotina');
ok(r.confirma.concordancia === 'confirma', 'queixa + exame alterado = CONFIRMA');
ok(r.alteradosConfirma === 2, r.alteradosConfirma + ' exames fora da faixa');
ok(r.diverge.concordancia === 'diverge', 'sem queixa + exame alterado = DIVERGE');
ok(r.dentroSituacao === 'ok', 'valor dentro da faixa fica ok');
ok(r.semExame === 'sem_exame', 'sistema sem exame preenchido nao inventa conclusao');
console.log('\n  divergencia:', r.diverge.leitura);
console.log('  leitura do exame alto:', r.leituraAlto);

// A REGRA: o Indice nao pode mudar por causa de exame
const indice = await p.evaluate(() => {
  const n = { fungico:7, acido_inflamatorio:7, metabolico:1, detox_linfatico:7, mental_emocional_espiritual:2 };
  return { antes: HOLOSCOPE.indiceDeNotas(n),
           depois: (HOLOSCOPE.lerExames({'EXA-005':115,'EXA-007':3.4}, n), HOLOSCOPE.indiceDeNotas(n)) };
});
ok(indice.antes === indice.depois, 'o Indice nao muda com exame: ' + indice.antes + ' -> ' + indice.depois);
await nav.close();
process.exit(falhou ? 1 : 0);
