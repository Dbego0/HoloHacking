/**
 * Normalizacao de texto em portugues para a busca.
 *
 * Sem dependencia e sem rede. As escolhas aqui sao conservadoras de proposito:
 * numa base de vocabulario controlado como a do metodo, errar para menos
 * (nao agrupar duas palavras que sao a mesma) atrapalha menos do que errar
 * para mais (agrupar duas que nao sao).
 */

/** Palavras que aparecem em tudo e nao ajudam a distinguir um trecho do outro. */
const VAZIAS = new Set([
  'a', 'ao', 'aos', 'as', 'ate', 'com', 'como', 'da', 'das', 'de', 'dela', 'delas',
  'dele', 'deles', 'depois', 'do', 'dos', 'e', 'ela', 'elas', 'ele', 'eles', 'em',
  'entre', 'era', 'essa', 'essas', 'esse', 'esses', 'esta', 'estao', 'estas', 'este',
  'estes', 'eu', 'foi', 'foram', 'ha', 'isso', 'isto', 'ja', 'lhe', 'lhes', 'mais',
  'mas', 'me', 'mesmo', 'meu', 'meus', 'minha', 'minhas', 'muito', 'muitos', 'na',
  'nao', 'nas', 'nem', 'no', 'nos', 'nossa', 'nosso', 'num', 'numa', 'o', 'os', 'ou',
  'para', 'pela', 'pelas', 'pelo', 'pelos', 'por', 'porque', 'qual', 'quando',
  'quanto', 'que', 'quem', 'sao', 'se', 'seja', 'sem', 'sendo', 'ser', 'seu', 'seus',
  'so', 'sobre', 'sua', 'suas', 'tambem', 'tem', 'ter', 'teu', 'toda', 'todas',
  'todo', 'todos', 'tudo', 'um', 'uma', 'umas', 'uns', 'vez', 'voce', 'vocs',
]);

/** Tira acento e caixa. "Ácido-Inflamatório" -> "acido-inflamatorio". */
export function dobrar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Plural simples. Nao e stemmer: so tira o "s" final de palavras longas e
 * resolve os plurais em -oes/-aes/-ais que sao comuns no vocabulario clinico
 * ("inflamacoes" -> "inflamacao", "sinais" -> "sinal").
 */
function singular(palavra: string): string {
  if (palavra.length <= 4) return palavra;
  if (palavra.endsWith('oes')) return palavra.slice(0, -3) + 'ao';
  if (palavra.endsWith('aes')) return palavra.slice(0, -3) + 'ao';
  if (palavra.endsWith('ais')) return palavra.slice(0, -3) + 'al';
  if (palavra.endsWith('eis')) return palavra.slice(0, -3) + 'el';
  if (palavra.endsWith('ns')) return palavra.slice(0, -2) + 'm';
  if (palavra.endsWith('s')) return palavra.slice(0, -1);
  return palavra;
}

export function tokenizar(texto: string): string[] {
  return dobrar(texto)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !VAZIAS.has(t))
    .map(singular);
}
