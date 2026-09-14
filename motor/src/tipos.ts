/** Tipos do motor HOLOS. Nenhuma regra clínica vive aqui — só formato. */

export type SistemaId = string;
export type Faixa = 'baixo' | 'medio' | 'alto';
export type Registro = 'nutri' | 'paciente';
export type Origem = 'sintoma' | 'emocao' | 'espiritual';
export type EixoTriada = 'fisico' | 'mental' | 'espiritual';

/**
 * Que regua o paciente ve na tela.
 *   frequencia   Nunca / As vezes / Frequente / Sempre   "com que frequencia acontece"
 *   intensidade  Nada / Um pouco / Bastante / Muito      "o quanto isso e verdade hoje"
 *
 * Um estado que simplesmente e — gordura abdominal, clareza sobre os proprios
 * valores — nao tem frequencia: responder "as vezes" ali nao quer dizer nada.
 */
export type Escala = 'frequencia' | 'intensidade';

/**
 * Para que lado a resposta alta puxa.
 *   direto     3 = mais carga   "Voce sente dor nas articulacoes?"
 *   invertido  3 = menos carga  "Voce sente que sua vida tem uma direcao clara?"
 *
 * Sem isto, uma pergunta escrita no positivo pontua o paciente inteiro como o
 * mais bloqueado de todos — e em silencio, que e o pior jeito de errar.
 */
export type Sentido = 'direto' | 'invertido';

export interface Sistema {
  id: SistemaId;
  nome: string;
  cor: string;
  padrao_emocional: string;
  impacto_espiritual: string;
  /**
   * O que este sistema E. Ficou vazio ate 13/09: havia o nome, o par
   * emocional/espiritual e a lista de marcadores, e nenhuma frase dizendo o
   * que o sistema significa. A nutricionista lia "Fungico 0,7" e nao tinha
   * como explicar aquilo a paciente.
   */
  definicao: string;
  fonte_definicao: string;
  status_definicao: string;
}

/**
 * Um eixo terapeutico de um sistema — a ENTREGA do HOLOSCOPE.
 *
 * Os tres eixos do material (Neuroregulacao, Reprogramacao Metabolica,
 * Inteligencia Espiritual) estavam escritos dentro do app.js, como leitura de
 * quem programou, sem fonte e fora do alcance do Rodrigo. Regra clinica em
 * codigo e regra que o autor do metodo nao consegue corrigir.
 */
export interface Eixo {
  sistema: SistemaId;
  eixo: string;
  /** as praticas daquele eixo para aquele sistema, separadas por virgula */
  praticas: string;
  ordem: number;
  fonte: string;
  status: string;
}

/**
 * Um territorio do olhar — corpo, mente, emocoes, comportamento, sistema
 * nervoso, ambiente, historia.
 *
 * Nao e mais um numero: e COBERTURA. A promessa do metodo e "ampliar e
 * organizar o olhar", e o que ela pede da ferramenta nao e outra nota — e
 * saber o que ficou de fora. Um territorio sem nenhuma pergunta apontando
 * para ele e um buraco no olhar, e a tela diz isso.
 */
export interface Territorio {
  id: string;
  nome: string;
  leitura: string;
  ordem: number;
  fonte: string;
  status: string;
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
  escala: Escala;
  sentido: Sentido;
  /** id do chacra a que este marcador responde, quando responde a algum. */
  chacra?: string;
  /** id do territorio do olhar a que este marcador responde. */
  territorio?: string;
  /**
   * A pergunta que vem DEPOIS, quando a resposta veio alta.
   *
   * "O HOLOSCOPE nao e uma lista de perguntas": o metodo encadeia — "como tem
   * sido seu sono?" e, se veio mal, "o que acontece nos dias em que voce dorme
   * pior?" e entao "o que muda no seu comportamento alimentar nesses dias?".
   * Sem isto as 84 sao planas: cada uma pergunta e passa adiante.
   */
  aprofundar?: string;
}

/**
 * Um chacra do Mapa de Frequencias.
 *
 * O mapa nao tem perguntas proprias: ele le as MESMAS respostas do
 * questionario por um segundo recorte. Cada marcador diz, na coluna `chacra`,
 * a qual deles ele responde — e um marcador pode nao responder a nenhum.
 *
 * Este banco existe para o nome do chacra ter um lugar so. Sem ele, um erro
 * de digitacao em "plexo solar" criaria um oitavo chacra em silencio.
 */
export interface Chacra {
  id: string;
  nome: string;
  leitura: string;
  /** posicao anatomica, da base para o topo. So ordena; nao entra em conta. */
  ordem: number;
  fonte: string;
  status: string;
}

/**
 * O que uma combinacao disparada e.
 *
 *   leitura      uma HIPOTESE a investigar — nunca um achado fechado
 *   encaminhar   isto aqui sai do escopo da nutricao e pede outro profissional
 *
 * A distincao e do metodo: "o Holoscope nao deve interpretar sintomas como
 * diagnostico definitivo" e "deve dizer quando sugerir encaminhamento".
 */
export type TipoCombinacao = 'leitura' | 'encaminhar';

export interface Combinacao {
  id: string;
  condicao: string;
  leitura: string;
  tipo: TipoCombinacao;
  /** o que conferir antes de concluir — e o que separa hipotese de achado */
  investigar: string;
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
  /** a partir de que carga a pergunta de aprofundamento e oferecida */
  aprofundar_a_partir_de: number;
  /**
   * Duas subferramentas que podem ficar PARADAS sem perder o que ja foi
   * escrito. O banco continua inteiro e validado; o motor simplesmente nao
   * devolve o resultado, e a tela nao mostra o painel.
   *
   * Desligadas em 13/09: o mapeamento de chacra e o de territorio sao
   * proposta, e o nucleo precisa ficar solido antes. Religar e trocar uma
   * celula de config.csv — nenhum dado se perde no caminho.
   */
  mapa_frequencias_ativo: boolean;
  territorios_ativo: boolean;
  /** Teto do Indice HOLOS. 10 = escala 0..10 (decidido 27/08). 100 volta ao 0..100. */
  indice_maximo: number;
  indice_casas: number;
  nota_casas: number;
  peso_secundario_fator: number;
}

export interface Bancos {
  config: Config;
  sistemas: Sistema[];
  chacras: Chacra[];
  territorios: Territorio[];
  eixos: Eixo[];
  regras: Map<SistemaId, Regra>;
  marcadores: Marcador[];
  combinacoes: Combinacao[];
  mensagens: Mensagem[];
  politicas: Politica[];
}

/**
 * O que o paciente tem ALEM do questionario, para as combinacoes poderem ler.
 *
 * A leitura sistemica do material cruza exame, sintoma e padrao emocional ao
 * mesmo tempo ("cortisol elevado + compulsao noturna + padrao de rejeicao").
 * Com so as cinco notas na mao, uma combinacao nao consegue dizer isso — ela
 * ve o reflexo agregado, nao o achado. Por isso o exame e o que as ferramentas
 * mediram entram aqui.
 */
export interface Contexto {
  /** valores lancados no Holoscan, por id de exame */
  exames?: Record<string, number>;
  /** o que as 30 ferramentas guardaram de numerico: ferramenta -> campo -> valor */
  ferramentas?: Record<string, Record<string, number>>;
}

/**
 * O que o paciente tem ALEM do questionario, para as combinacoes poderem ler.
 *
 * A leitura sistemica do material cruza exame, sintoma e padrao emocional ao
 * mesmo tempo ("cortisol elevado + compulsao noturna + padrao de rejeicao").
 * Com so as cinco notas na mao, uma combinacao nao consegue dizer isso — ela
 * ve o reflexo agregado, nao o achado. Por isso o exame e o que as ferramentas
 * mediram entram aqui.
 */
export interface Contexto {
  /** valores lancados no Holoscan, por id de exame */
  exames?: Record<string, number>;
  /** o que as 30 ferramentas guardaram de numerico: ferramenta -> campo -> valor */
  ferramentas?: Record<string, Record<string, number>>;
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
  /** O que o paciente marcou, de 0 a escala_max. */
  resposta: number;
  /** A carga que entrou na conta: igual a `resposta`, ou o espelho dela quando
   *  o marcador e `sentido=invertido`. E sempre `pontos / peso`. */
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
  /** false quando nenhum marcador do sistema foi respondido: a nota nao existe. */
  avaliavel: boolean;
  dominantes: Contribuicao[];
}

export interface CombinacaoDisparada {
  id: string;
  leitura: string;
  tipo: TipoCombinacao;
  investigar: string;
  prioridade: number;
  condicao: string;
  fonte: string;
}

export interface Pontuacao {
  /** 0..indice_maximo, quanto maior melhor */
  indice: number;
  /** false enquanto nenhum sistema foi respondido: nao ha indice, so aparencia dele. */
  avaliavel: boolean;
  indice_maximo: number;
  nota_media: number;
  sistemas: NotaSistema[];
  triada: Record<EixoTriada, number>;
  /** Quais eixos tem ao menos uma resposta. Ausencia nao e nota 10. */
  triada_com_dado: Record<EixoTriada, boolean>;
  /** Mapa de Frequencias: nota por chacra, do mais travado para o mais livre.
   *  Vazio enquanto chacras.csv nao tiver linha nenhuma. */
  frequencias: { chacra: string; nota: number; leitura: string; ordem: number;
                 respondidos: number }[];
  combinacoes: CombinacaoDisparada[];
  cobertura: { respondidos: number; total: number; percentual: number };
  /**
   * A cobertura do olhar: quanto de cada territorio este paciente respondeu.
   * `nota` so existe quando ha marcador que pontua; pergunta de contexto puro
   * (sem sistema) cobre o territorio sem dar nota a ninguem.
   */
  territorios: {
    territorio: string;
    leitura: string;
    ordem: number;
    respondidos: number;
    total: number;
    nota: number | null;
  }[];
  /**
   * As perguntas a fazer em seguida, ganhas pelas respostas que vieram altas.
   * E o passo "aprofundar" do metodo: o motor sabe o que pesou, e devolve o que
   * perguntar sobre aquilo. Vazio enquanto os marcadores nao tiverem a coluna
   * `aprofundar` preenchida.
   */
  aprofundamentos: {
    marcador_id: string;
    rotulo: string;
    origem: Origem;
    resposta: number;
    pergunta: string;
  }[];
  auditoria: Contribuicao[];
}
