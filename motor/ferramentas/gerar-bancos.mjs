/**
 * CSV dos bancos -> build/bancos.json, que vai embutido no pacote do navegador.
 * Artefato gerado: nao entra no versionamento, sai deste comando.
 *
 *   npm run bancos
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { lerCSV } from '../src/csv.ts';

const ARQUIVOS = {
  config: 'bancos/config.csv',
  sistemas: 'bancos/sistemas.csv',
  chacras: 'bancos/chacras.csv',
  territorios: 'bancos/territorios.csv',
  eixos: 'bancos/eixos.csv',
  regras: 'bancos/regras.csv',
  sintomas: 'bancos/sintomas.csv',
  emocoes: 'bancos/emocoes.csv',
  espiritual: 'bancos/espiritual.csv',
  combinacoes: 'bancos/combinacoes.csv',
  mensagens: 'bancos/mensagens.csv',
  exames: 'bancos/exames.csv',
  escopo: 'politicas/escopo.csv',
};

const bruto = {};
for (const [chave, arquivo] of Object.entries(ARQUIVOS)) {
  bruto[chave] = lerCSV(readFileSync(arquivo, 'utf8'), arquivo);
}

mkdirSync('build', { recursive: true });
writeFileSync('build/bancos.json', JSON.stringify(bruto));
console.log(
  'build/bancos.json  ' +
  Object.entries(bruto).map(([k, v]) => k + '=' + v.length).join('  ')
);
