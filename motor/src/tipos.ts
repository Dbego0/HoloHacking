/** Tipos do motor HOLOS. Nenhuma regra clínica vive aqui — só formato. */

export type SistemaId = string;
export type Faixa = 'baixo' | 'medio' | 'alto';
export type Registro = 'nutri' | 'paciente';
export type Origem = 'sintoma' | 'emocao' | 'espiritual';
export type EixoTriada = 'fisico' | 'mental' | 'espiritual';

export interface Sistema {
  id: SistemaId;
  nome: string;
  cor: string;
  padrao_emocional: string;
  impacto_espiritual: string;
}

export interface Regra {
  sistema: SistemaId;
  formula: string;
  faixa_baixa_ate: number;
  faixa_media_ate: number;
  peso_indice: number;
}

/**
 * Uma linha de marcador já normalizada. Um mesmo `id` pode gerar várias linhas
 * (o mesmo sintoma pesando em dois sistemas). A resposta do paciente é dada
 * uma vez por `id` e conta em todas as linhas daquele `id`.
 */
export interface Marcador {
  id: string;
  origem: Origem;
  rotulo: string;
  pergunta: string;
  sistema: SistemaId;
  peso: number;
  fonte: string;
  status: string;
  sinonimos: string[];
  dimensao?: string;
  leitura?: string;
  padrao_emocional?: string;
  secundario: boolean;
}

export interface Combinacao {
  id: string;
  condicao: string;
  leitura: string;
  prioridade: number;
  fonte: string;
  status: string;
}

export interface Mensagem {
  sistema: SistemaId;
  faixa: Faixa;
  registro: Registro;
  texto: string;
  primeiros_passos: string;
  fonte: string;
  status: string;
}

export interface Politica {
  id: string;
  padrao: string;
  motivo: string;
  gravidade: 'bloqueio' | 'aviso';
  resposta: string;
}

export interface Config {
  escala_max: number;
  /** Teto do Indice HOLOS. 10 = escala 0..10 (decidido 27/08). 100 volta ao 0..100. */
  indice_maximo: number;
  indice_casas: number;
  nota_casas: number;
  peso_secundario_fator: number;
}

export interface Bancos {
  config: Config;
  sistemas: Sistema[];
  regras: Map<SistemaId, Regra>;
  marcadores: Marcador[];
  combinacoes: Combinacao[];
  mensagens: Mensagem[];
  politicas: Politica[];
}

export interface Resposta {
  /** id do marcador (SNT-001, EMO-003, ESP-002...) */
  marcador_id: string;
  /** 0..escala_max */
  intensidade: number;
}

export interface Contribuicao {
  marcador_id: string;
  rotulo: string;
  origem: Origem;
  peso: number;
  intensidade: number;
  pontos: number;
  fonte: string;
}

export interface NotaSistema {
  sistema: SistemaId;
  nome: string;
  /** 0..10, 10 = muito bom. E o numero do metodo, o que aparece para as pessoas. */
  nota: number;
  /** 0..10, 10 = mais marcadores presentes. Espelho da nota, so para auditoria. */
  carga: number;
  faixa: Faixa;
  obtido: number;
  maximo: number;
  respondidos: number;
  total_marcadores: number;
  dominantes: Contribuicao[];
}

export interface CombinacaoDisparada {
  id: string;
  leitura: string;
  prioridade: number;
  condicao: string;
  fonte: string;
}

export interface Pontuacao {
  /** 0..indice_maximo, quanto maior melhor */
  indice: number;
  indice_maximo: number;
  nota_media: number;
  sistemas: NotaSistema[];
  triada: Record<EixoTriada, number>;
  frequencias: { chacra: string; nota: number; leitura: string }[];
  combinacoes: CombinacaoDisparada[];
  cobertura: { respondidos: number; total: number; percentual: number };
  auditoria: Contribuicao[];
}
