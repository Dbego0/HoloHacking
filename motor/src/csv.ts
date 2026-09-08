/**
 * Leitor de CSV mínimo, sem dependência.
 * Suporta campos entre aspas com vírgula e aspas escapadas ("").
 * Não suporta quebra de linha dentro de campo — de propósito: os bancos
 * precisam continuar legíveis linha a linha para o Rodrigo revisar.
 */

export type LinhaCSV = Record<string, string>;

function separarLinha(linha: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i++; }
        else dentroDeAspas = false;
      } else atual += c;
    } else if (c === '"') {
      dentroDeAspas = true;
    } else if (c === ',') {
      campos.push(atual); atual = '';
    } else atual += c;
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

export function lerCSV(conteudo: string, arquivo: string): LinhaCSV[] {
  const linhas = conteudo
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');

  if (linhas.length === 0) throw new Error(`${arquivo}: arquivo vazio`);

  const cabecalho = separarLinha(linhas[0]);
  const saida: LinhaCSV[] = [];

  for (let i = 1; i < linhas.length; i++) {
    const campos = separarLinha(linhas[i]);
    if (campos.length !== cabecalho.length) {
      throw new Error(
        `${arquivo} linha ${i + 1}: esperava ${cabecalho.length} colunas, veio ${campos.length}. ` +
        `Se o texto tem vírgula, envolva o campo em aspas.`
      );
    }
    const registro: LinhaCSV = {};
    cabecalho.forEach((coluna, j) => { registro[coluna] = campos[j]; });
    saida.push(registro);
  }
  return saida;
}
