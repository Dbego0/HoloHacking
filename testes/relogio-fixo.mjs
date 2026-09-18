/**
 * Congela Date() e Date.now() no navegador a partir de um instante fixo,
 * para que testes de data (semana, retorno de 4 semanas, virada de mes/ano)
 * nao dependam do relogio real da maquina que roda o teste.
 *
 * new Date(...) COM argumentos continua parseando normalmente — so
 * new Date() SEM argumento (e Date.now()) passam a devolver o instante
 * congelado. Aplicado antes de qualquer navegacao (evaluateOnNewDocument),
 * entao vale tambem para os scripts do proprio app (agenda.js, panorama.js),
 * nao so para o que o teste escreve — e por isso resolve a flakiness sem
 * mudar nenhum calculo de producao.
 */
export async function congelarRelogio(page, isoFixo) {
  await page.evaluateOnNewDocument((iso) => {
    const fixo = new Date(iso).getTime();
    const RealDate = Date;
    class DataFixa extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(fixo);
        else super(...args);
      }
      static now() { return fixo; }
    }
    window.Date = DataFixa;
  }, isoFixo);
}
