/* ===========================================================================
   BANCOS DO MÓDULO CORPO
   ===========================================================================

   O conteúdo clínico do Módulo Corpo, como dado — nunca como código.

   PROCEDÊNCIA É OBRIGATÓRIA E NUNCA É CHUTE
   -----------------------------------------
   Cada entrada carrega DOIS campos que não se confundem:

     provenance  DE ONDE o conteúdo veio.
                 especificacao          está escrito, literalmente, na
                                        Especificação Mestre Módulo Corpo v1
                 projeto_legado         já existia no HoloHacking antes dela
                 decisao_implementacao  fui eu, o código, que decidi
                 decisao_rodrigo        o autor do método decidiu
                 literatura_validada    há referência externa verificável

     status      se PODE RODAR no produto, e sob que ressalva.
                 confirmado             validado por quem escreve o método
                 rascunho               em uso, aguardando validação
                 legado_nao_validado    herdado do projeto anterior. Roda, mas
                                        nenhuma tela pode chamá-lo de oficial
                 rascunho_nao_validado  NÃO roda; fica cadastrado para
                                        rastreabilidade e nada mais

   Hoje NENHUMA entrada deste arquivo está confirmada.

   A regra que governa este arquivo: **nunca atribuir à Especificação Mestre
   conteúdo que ela não contém.** Uma versão anterior deste arquivo marcava os
   cortes do Momentum e as faixas de sono como vindos da especificação. Não
   vinham: eu os inventei. O campo `provenance` existe para que esse tipo de
   coisa seja pesquisável, e não uma opinião escondida num comentário.

   O QUE FOI SUSPENSO E POR QUÊ
   ----------------------------
   Três blocos de números clínicos saíram deste arquivo porque não tinham
   fonte: os cortes de estado do Momentum, as faixas dos quatro indicadores
   de sono, e o limiar de confiança do Check-in. Eles não foram substituídos
   por outros números — foram removidos. O que resta é o que pode ser medido
   sem juízo clínico. O histórico do git guarda o que havia.

   Por que aqui e não em motor/bancos/: o motor calcula o Índice, e nada deste
   arquivo entra nessa conta. Pôr aqui mantém a fronteira que o método pede —
   ferramenta do Corpo não altera a pontuação do HOLOSCOPE.
   =========================================================================== */

(function () {
  "use strict";

  /* ---------- o vocabulário de procedência -------------------------------- */

  var PROVENIENCIA = {
    especificacao:         "Especificação Mestre Módulo Corpo v1 — texto literal",
    projeto_legado:        "herdado_do_projeto_nao_validado",
    decisao_implementacao: "decisao_implementacao_nao_validada",
    decisao_rodrigo:       "decidido por Rodrigo Mendanha",
    literatura_validada:   "literatura com referência verificável"
  };

  /** O texto legível de uma procedência — para a tela e para o relatório. */
  function fonteDe(provenance) {
    return PROVENIENCIA[provenance] || "procedência não declarada";
  }

  /* Os três estados que um item de banco pode ter. `rascunho_nao_validado`
     é o único que o motor de recomendação se recusa a executar. */
  var STATUS = {
    confirmado: "confirmado",
    rascunho: "rascunho",
    /* Herdado do HoloHacking anterior a esta especificacao. Executa, porque e
       o comportamento que o app ja tinha — mas ninguem do metodo o validou, e
       nenhuma tela pode chama-lo de oficial. */
    legado: "legado_nao_validado",
    /* Escrito pela implementacao. NAO executa. */
    nao_validado: "rascunho_nao_validado"
  };

  /* ---------- o papel de cada ferramenta no método ------------------------
     Especificação §16. Define a hierarquia: o que estrutura, o que investiga,
     o que monitora e o que implementa. */
  var PAPEIS = {
    estrutural:    { nome: "Estrutural",    ordem: 1,
                     explica: "Organiza a leitura e orienta a direção da fase." },
    investigacao:  { nome: "Investigação",  ordem: 2,
                     explica: "Aprofunda um sinal, uma rotina ou um conjunto de hábitos." },
    monitoramento: { nome: "Monitoramento", ordem: 3,
                     explica: "Acompanha ao longo do tempo. Pede reaplicação." },
    implementacao: { nome: "Implementação", ordem: 4,
                     explica: "Transforma decisão em acordo verificável." }
  };

  /* ---------- o Momentum ---------------------------------------------------

     ALGORITMO AUTOMÁTICO SUSPENSO.

     O que havia aqui: média das seis dimensões, com "carga de vida" invertida,
     e cortes em 3.4 / 5.9 / 7.9 separando os quatro estados. Nada disso está
     na especificação — §14.4 dá a escala 0–10 e §14.5 dá os quatro estados,
     e o §14.6 diz o contrário do que o algoritmo fazia:

       "O estado não deve ser definido por um único número. Ele deve ser
        derivado de múltiplas dimensões + validação profissional."

     Enquanto não houver regra multi-dimensional validada, o sistema não
     sugere estado nenhum. Ele mostra o perfil das seis dimensões e pede que
     quem atende escolha o estado e diga por quê.

     O que sobreviveu é o que a especificação escreve: as seis dimensões, a
     escala, as perguntas qualitativas, os nomes dos quatro estados e a
     conduta que cada um pede. */
  var MOMENTUM = {
    definicao: "Momentum é a capacidade atual da pessoa de mobilizar recursos " +
               "físicos, mentais e práticos para sustentar mudança.",
    nao_e: "Não é força de vontade, motivação, obediência nem comprometimento moral.",
    provenance: "especificacao",
    fonte: PROVENIENCIA.especificacao,
    status: STATUS.rascunho,

    /* §14.6 — sem critério validado, não há sugestão automática. */
    classificacao_automatica: false,
    por_que_sem_sugestao:
      "O estado do Momentum não é sugerido pelo sistema: a especificação (§14.6) " +
      "pede derivação multi-dimensional com validação profissional, e essa regra " +
      "ainda não foi escrita. Escolha o estado e registre a justificativa.",

    /* As seis dimensões — §14.3. Cada uma é 0–10 — §14.4.
       Nenhuma é marcada como invertida: a especificação não marca nenhuma, e
       inverter "carga de vida" era decisão de implementação a serviço de uma
       média que não existe mais. */
    dimensoes: [
      { id: "energia",      rotulo: "Energia disponível",
        pergunta: "Quanta energia sobra no dia depois do que é obrigatório?" },
      { id: "carga",        rotulo: "Carga de vida",
        pergunta: "O quanto a vida está pesada agora?" },
      { id: "controle",     rotulo: "Controle sobre a rotina",
        pergunta: "O quanto do próprio dia ela consegue decidir?" },
      { id: "suporte",      rotulo: "Suporte",
        pergunta: "Quem ajuda de verdade quando aperta?" },
      { id: "espaco",       rotulo: "Espaço mental",
        pergunta: "Sobra cabeça para pensar em mudança?" },
      { id: "estabilidade", rotulo: "Estabilidade atual",
        pergunta: "O momento está estável ou em transição?" }
    ],

    /* Os quatro estados — §14.5, nome, resumo e conduta transcritos.
       Não há `ate`: nenhum deles tem faixa numérica, porque a especificação
       não dá nenhuma. Servem como as opções que quem atende escolhe. */
    estados: [
      { id: "preservar",   nome: "Preservar",
        resumo: "Baixa disponibilidade.",
        conduta: ["proteger o essencial", "evitar múltiplas mudanças", "reduzir complexidade"],
        provenance: "especificacao", fonte: PROVENIENCIA.especificacao,
        status: STATUS.rascunho },
      { id: "reorganizar", nome: "Reorganizar",
        resumo: "Capacidade limitada, mas presente.",
        conduta: ["retirar barreiras", "criar estrutura", "poucas ações"],
        provenance: "especificacao", fonte: PROVENIENCIA.especificacao,
        status: STATUS.rascunho },
      { id: "construir",   nome: "Construir",
        resumo: "Boa disponibilidade.",
        conduta: ["implementar progressivamente", "monitorar resposta"],
        provenance: "especificacao", fonte: PROVENIENCIA.especificacao,
        status: STATUS.rascunho },
      { id: "expandir",    nome: "Expandir",
        resumo: "Alta disponibilidade e estabilidade.",
        conduta: ["consolidar", "ampliar", "sofisticar"],
        provenance: "especificacao", fonte: PROVENIENCIA.especificacao,
        status: STATUS.rascunho }
    ]
  };

  /* ---------- os quatro indicadores do sono -------------------------------

     CLASSIFICAÇÃO POR FAIXA SUSPENSA.

     §11.5 dá os quatro nomes e diz que cada indicador "pode ser" adequado,
     atenção ou prioridade de investigação. Não dá uma única faixa numérica.
     As que existiam aqui — 7 a 9 horas, varia menos de 1 hora, dorme em até
     20 minutos — eram minhas, e estavam marcadas como sendo da especificação.

     Foram removidas, não substituídas. O que a tela mostra agora é a medida
     observada: as horas calculadas, a variação relatada, a latência e os
     despertares como vieram, e como a pessoa diz que acorda. */
  var SONO = {
    provenance: "especificacao",
    fonte: PROVENIENCIA.especificacao,
    status: STATUS.rascunho,
    classificacao_automatica: false,
    por_que_sem_niveis:
      "Os três níveis do §11.5 — adequado, atenção, prioridade — existem no " +
      "método, mas nenhuma faixa numérica foi definida. Até que sejam, o sistema " +
      "mostra a medida observada e não a classifica.",
    indicadores: [
      { id: "duracao",      nome: "Duração",
        explica: "Horas entre pegar no sono e acordar." },
      { id: "regularidade", nome: "Regularidade",
        explica: "O quanto os horários variam de um dia para o outro." },
      { id: "continuidade", nome: "Continuidade",
        explica: "Tempo para pegar no sono e despertares durante a noite." },
      { id: "recuperacao",  nome: "Recuperação",
        explica: "Como a pessoa acorda, independentemente das horas." }
    ]
  };

  /* ---------- categorias de sinal corporal --------------------------------
     Especificação §9.4.

     ATENÇÃO — sobreposição conhecida: motor/bancos/sintomas.csv já tem 49
     marcadores de sintoma organizados pelos 5 sistemas, cada um com a sua
     pergunta de aprofundamento. Estas categorias são um SEGUNDO eixo (região
     do corpo) sobre o mesmo território. É a decisão nº 1 do documento de
     pendências — enquanto ela não vier, a ferramenta usa as categorias só
     para organizar o que quem atende digita, sem catálogo fechado de sintoma. */
  var SINAIS_CATEGORIAS = [
    { id: "gastro",     nome: "Gastrointestinal" },
    { id: "intestinal", nome: "Intestinal" },
    { id: "fome",       nome: "Fome e saciedade" },
    { id: "energia",    nome: "Energia" },
    { id: "sono",       nome: "Sono" },
    { id: "dor",        nome: "Dor" },
    { id: "pele",       nome: "Pele" },
    { id: "fluidos",    nome: "Edema e fluidos" },
    { id: "ciclo",      nome: "Ciclo menstrual" },
    { id: "outro",      nome: "Outro" }
  ];

  /* §9.5, literal. Uma versão anterior trocava dois dos quatro rótulos por
     "Às vezes" e "Sempre" — e "Sempre" não é "Quase diário": um é totalidade,
     o outro é frequência, e o paciente responde diferente a cada um. */
  var SINAIS_FREQUENCIA = ["Nunca", "Ocasional", "Frequente", "Quase diário"];

  /* A prioridade que quem atende atribui ao conjunto — §9.6.
     Nunca é derivada: não existe, e não deve existir enquanto não houver
     critério validado, regra automática que eleja sinal para aprofundamento. */
  var SINAIS_PRIORIDADE = [
    { id: "acompanhar",    nome: "Acompanhar" },
    { id: "aprofundar",    nome: "Aprofundar" },
    { id: "correlacionar", nome: "Correlacionar" },
    { id: "encaminhar",    nome: "Encaminhar" }
  ];

  /* §9.7 permite que o sistema tenha alertas de segurança, mas não lista
     nenhum. Nenhum foi inventado. A lista aguarda definição metodológica. */
  var SINAIS_RED_FLAGS = [];

  /* ---------- categorias de hábito ----------------------------------------
     Especificação §12.3. A lista dos hábitos DENTRO de cada categoria não
     existe: quem atende escreve os que aparecerem. A especificação não a traz,
     e inventá-la seria escrever método. */
  var HABITOS_CATEGORIAS = [
    { id: "alimentacao", nome: "Alimentação" },
    { id: "sono",        nome: "Sono" },
    { id: "movimento",   nome: "Movimento" },
    { id: "hidratacao",  nome: "Hidratação" },
    { id: "organizacao", nome: "Organização" },
    { id: "pausas",      nome: "Pausas" },
    { id: "telas",       nome: "Telas" },
    { id: "cafeina",     nome: "Cafeína" },
    { id: "alcool",      nome: "Álcool" },
    { id: "autocuidado", nome: "Autocuidado" },
    { id: "preparo",     nome: "Preparo alimentar" }
  ];

  var HABITOS_CONSISTENCIA = ["Não acontece", "Raramente", "Às vezes", "Consistente"];

  /* ---------- tipos de evento da rotina -----------------------------------
     Especificação §7.4. */
  var ROTINA_EVENTOS = [
    { id: "sono",         nome: "Sono" },
    { id: "refeicao",     nome: "Refeição" },
    { id: "trabalho",     nome: "Trabalho" },
    { id: "deslocamento", nome: "Deslocamento" },
    { id: "exercicio",    nome: "Exercício" },
    { id: "pausa",        nome: "Pausa" },
    { id: "cuidado",      nome: "Cuidado" },
    { id: "outro",        nome: "Outro" }
  ];

  /* ---------- as regras de recomendação ------------------------------------
     Especificação §17 e §18: o sistema sugere, a nutricionista decide.

     O esquema é o do §18 — `source` é a ORIGEM FUNCIONAL do gatilho (de onde
     vem o dado que dispara a regra) e `provenance` é DE ONDE A REGRA VEIO.
     São coisas diferentes: uma regra pode disparar pelo HOLOSCOPE (source)
     e ter sido inventada pela implementação (provenance).

       source:     holoscope | oq3 | momentum | ferramenta | decisao_profissional
       condition:  { tipo: "sistema", sistema: "<id>" }
                   { tipo: "momentum", estado: "<id>" }

     REC-001 a REC-015 vieram do objeto CONDUTA que já existia em app.js.
     Procedência rastreável não é validação: continuam `rascunho`.

     REC-016 a REC-023 foram escritas por mim. Seis das oito não têm apoio
     nenhum na especificação; duas têm apoio parcial (§14.8 cita Inventário de
     Hábitos e Check-in como pontos de integração do Momentum, mas não os
     vincula a estado nenhum). Todas estão `rascunho_nao_validado` e o motor
     não as executa. */
  var RECOMENDACOES = [
    // ---- Fúngico
    { id: "REC-001", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "fungico" },
      recommended_tool_id: "gatilhos_respostas",
      rationale: "compulsão por doce responde a gatilho, não a força de vontade",
      priority: 1, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },
    { id: "REC-002", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "fungico" },
      recommended_tool_id: "diario_corporal",
      rationale: "separar fome do corpo de vontade da cabeça",
      priority: 2, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },
    { id: "REC-003", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "fungico" },
      recommended_tool_id: "mapa_rotina",
      rationale: "onde do dia a compulsão aparece",
      priority: 3, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },

    // ---- Ácido-Inflamatório
    { id: "REC-004", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "acido_inflamatorio" },
      recommended_tool_id: "reenquadramento",
      rationale: "a reatividade começa num pensamento",
      priority: 1, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },
    { id: "REC-005", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "acido_inflamatorio" },
      recommended_tool_id: "ritmo_sono",
      rationale: "sono ruim mantém o corpo em alerta",
      priority: 2, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },
    { id: "REC-006", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "acido_inflamatorio" },
      recommended_tool_id: "autocompaixao",
      rationale: "irritação consigo alimenta a de fora",
      priority: 3, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },

    // ---- Metabólico
    { id: "REC-007", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "metabolico" },
      recommended_tool_id: "pqq",
      rationale: "o vazio pede propósito, não dieta",
      priority: 1, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },
    { id: "REC-008", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "metabolico" },
      recommended_tool_id: "circulo_sentido",
      rationale: "o que ainda dá sentido",
      priority: 2, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },
    { id: "REC-009", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "metabolico" },
      recommended_tool_id: "ancoras_motivacao",
      rationale: "o que sustenta quando a vontade cai",
      priority: 3, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },

    // ---- Detox + Linfático
    { id: "REC-010", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "detox_linfatico" },
      recommended_tool_id: "historia_alimentar",
      rationale: "mágoa antiga tem data de início",
      priority: 1, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },
    { id: "REC-011", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "detox_linfatico" },
      recommended_tool_id: "diario_emocoes",
      rationale: "o que é engolido junto com a comida",
      priority: 2, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },
    { id: "REC-012", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "detox_linfatico" },
      recommended_tool_id: "conexao_pertencimento",
      rationale: "quem sustenta e quem drena",
      priority: 3, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },

    // ---- Mental-Emocional-Espiritual
    { id: "REC-013", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "mental_emocional_espiritual" },
      recommended_tool_id: "autocompaixao",
      rationale: "como ela fala consigo é o terreno",
      priority: 1, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },
    { id: "REC-014", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "mental_emocional_espiritual" },
      recommended_tool_id: "roda_vida",
      rationale: "qual área está puxando as outras",
      priority: 2, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },
    { id: "REC-015", version: 1, source: "holoscope",
      condition: { tipo: "sistema", sistema: "mental_emocional_espiritual" },
      recommended_tool_id: "praticas_contemplativas",
      rationale: "religar antes de mudar",
      priority: 3, provenance: "projeto_legado", fonte: PROVENIENCIA.projeto_legado,
      status: STATUS.legado },

    /* ---- A partir do Momentum.

       NÃO EXECUTAM. Estão aqui para não sumirem sem rastro — foram escritas
       pela implementação, não pelo método. O §14.8 da especificação lista
       quatro pontos de integração do Momentum (OQ³, Inventário de Hábitos,
       Check-in, Plano da consulta); ele não mapeia estado para ferramenta.
       REC-019 e REC-020 tocam duas ferramentas que o §14.8 cita; as outras
       seis não têm apoio nenhum. Nenhuma delas foi substituída por outra
       regra: enquanto o método não disser qual ferramenta cada estado pede,
       o sistema não recomenda por Momentum. */
    { id: "REC-016", version: 1, source: "momentum",
      condition: { tipo: "momentum", estado: "preservar" },
      recommended_tool_id: "linha_momentum",
      rationale: "antes de pedir qualquer coisa, medir o que cabe",
      priority: 1, provenance: "decisao_implementacao",
      fonte: PROVENIENCIA.decisao_implementacao, status: STATUS.nao_validado },
    { id: "REC-017", version: 1, source: "momentum",
      condition: { tipo: "momentum", estado: "preservar" },
      recommended_tool_id: "hidratacao_movimento",
      rationale: "o básico sustenta quando o resto não cabe",
      priority: 2, provenance: "decisao_implementacao",
      fonte: PROVENIENCIA.decisao_implementacao, status: STATUS.nao_validado },
    { id: "REC-018", version: 1, source: "momentum",
      condition: { tipo: "momentum", estado: "reorganizar" },
      recommended_tool_id: "mapa_rotina",
      rationale: "retirar barreira começa por enxergar o dia",
      priority: 1, provenance: "decisao_implementacao",
      fonte: PROVENIENCIA.decisao_implementacao, status: STATUS.nao_validado },
    { id: "REC-019", version: 1, source: "momentum",
      condition: { tipo: "momentum", estado: "reorganizar" },
      recommended_tool_id: "inventario_habitos",
      rationale: "achar o hábito de maior alavancagem antes de somar outros",
      priority: 2, provenance: "decisao_implementacao",
      fonte: PROVENIENCIA.decisao_implementacao + " (§14.8 cita a ferramenta " +
             "como integração do Momentum, mas não a vincula a este estado)",
      status: STATUS.nao_validado },
    { id: "REC-020", version: 1, source: "momentum",
      condition: { tipo: "momentum", estado: "construir" },
      recommended_tool_id: "check_comprometimento",
      rationale: "implementar pede acordo verificável",
      priority: 1, provenance: "decisao_implementacao",
      fonte: PROVENIENCIA.decisao_implementacao + " (§14.8 cita a ferramenta " +
             "como integração do Momentum, mas não a vincula a este estado)",
      status: STATUS.nao_validado },
    { id: "REC-021", version: 1, source: "momentum",
      condition: { tipo: "momentum", estado: "construir" },
      recommended_tool_id: "energia_vital",
      rationale: "monitorar a resposta ao que foi implementado",
      priority: 2, provenance: "decisao_implementacao",
      fonte: PROVENIENCIA.decisao_implementacao, status: STATUS.nao_validado },
    { id: "REC-022", version: 1, source: "momentum",
      condition: { tipo: "momentum", estado: "expandir" },
      recommended_tool_id: "leitura_sinais",
      rationale: "com estabilidade, dá para investigar o que ficou de fora",
      priority: 1, provenance: "decisao_implementacao",
      fonte: PROVENIENCIA.decisao_implementacao, status: STATUS.nao_validado },
    { id: "REC-023", version: 1, source: "momentum",
      condition: { tipo: "momentum", estado: "expandir" },
      recommended_tool_id: "diario_corporal",
      rationale: "consolidar pede percepção fina do próprio corpo",
      priority: 2, provenance: "decisao_implementacao",
      fonte: PROVENIENCIA.decisao_implementacao, status: STATUS.nao_validado }
  ];

  /* ---------- como a conduta é montada -------------------------------------

     Isto morava dentro de app.js: duas ferramentas do sistema mais baixo, uma
     do segundo, uma do estado de Momentum, teto de quatro. São números de
     conduta clínica, e regra clínica em JavaScript é exatamente o que a §18 e
     a regra do projeto proíbem. Agora são dado, com procedência e status,
     como qualquer outra decisão não validada.

     Ninguém aprovou o 2, o 1, o 1 nem o 4. Estão em uso porque é o
     comportamento que já existia; mudá-los para outros números inventados não
     seria melhor. O que mudou é que agora dá para encontrá-los. */
  var SELECAO = {
    id: "SEL-001",
    version: 1,
    descricao: "Quantas ferramentas entram na conduta, e de qual origem.",
    do_pior_sistema: 2,
    do_segundo_sistema: 1,
    /* Nenhuma regra de Momentum e executavel hoje. A vaga NAO foi
       redistribuida: ela fica vazia, declarada, ate que o metodo diga qual
       ferramenta cada estado pede. Com isso a conduta devolve no maximo 3. */
    do_momentum: null,
    momentum_aguarda_definicao: true,
    maximo: 4,
    provenance: "decisao_implementacao",
    fonte: PROVENIENCIA.decisao_implementacao,
    status: STATUS.rascunho
  };

  /* ---------- o que o motor pode executar ---------------------------------- */

  /** Uma regra entra na conduta se não foi escrita pela implementação.
      O status legado_nao_validado executa — é o comportamento que o app já tinha —
      mas nunca deve ser apresentado como regra validada do método. */
  function executavel(regra) {
    return !!regra && regra.status !== STATUS.nao_validado;
  }

  /** Uma regra que o método confirmou. Hoje: nenhuma. */
  function validada(regra) {
    return !!regra && regra.status === STATUS.confirmado;
  }

  /** As regras que o motor de recomendação pode usar hoje. */
  function regrasAtivas() {
    return RECOMENDACOES.filter(executavel);
  }

  /** As regras que podem aparecer na interface clínica hoje — não confundir
      com regrasAtivas(): executavel() só exclui nao_validado, e deixa passar
      legado (procedência rastreável não é validação). Além disso, a maioria
      dos recommended_tool_id aponta para ferramentas que a revisão clínica de
      Corpo/Mente/Espírito já retirou da galeria — apresentar essas regras
      reabriria uma porta que foi fechada de propósito. Hoje: nenhuma. */
  function regrasApresentaveis() {
    return RECOMENDACOES.filter(validada);
  }

  /* ---------- quanto disto já passou pelo autor ---------------------------- */

  function pendencias() {
    var itens = [];

    itens.push("Momentum · a regra multi-dimensional que o §14.6 pede " +
               "(hoje não há sugestão automática)");
    MOMENTUM.estados.forEach(function (e) {
      if (e.status !== STATUS.confirmado) itens.push("Momentum · estado " + e.nome);
    });
    if (MOMENTUM.status !== STATUS.confirmado) {
      itens.push("Momentum · definição e dimensões");
    }

    itens.push("Ritmo & Sono · as faixas dos quatro indicadores " +
               "(hoje não há classificação automática)");
    if (SONO.status !== STATUS.confirmado) {
      itens.push("Ritmo & Sono · os quatro indicadores");
    }

    itens.push("Leitura de Sinais · a lista de red flags do §9.7 " +
               "(hoje não existe nenhuma)");
    itens.push("Leitura de Sinais · se existe critério automático de " +
               "aprofundamento, e qual (hoje a prioridade é só profissional)");
    itens.push("Check-in de Compromisso · o limiar de confiança que dispara " +
               "“redesenhe a ação” (hoje não há disparo automático)");
    itens.push("Inventário de Hábitos · como ler a matriz impacto × viabilidade, " +
               "e se há campo que diga se um hábito sustenta ou dificulta");
    itens.push("Hidratação & Movimento · a “principal oportunidade” do §13.8 " +
               "(hoje não é produzida, por falta de critério)");
    itens.push("Conduta · as cotas de SEL-001 (2 do pior sistema + 1 do segundo; " +
               "a vaga do Momentum está vazia)");
    itens.push("Mapa da Rotina · o que conta como intervalo longo entre refeições " +
               "(hoje o intervalo é só exibido)");
    itens.push("Mapa da Rotina · o que conta como fome ou estresse alto " +
               "(hoje só o máximo registrado é exibido)");
    itens.push("Mapa da Rotina · se existe leitura combinada de fome e estresse, " +
               "e qual (a soma das duas escalas foi removida)");
    itens.push("Diário Corporal · quantos registros bastam para falar de padrão " +
               "(hoje o sistema só conta registros e dias)");
    itens.push("Diário Corporal · como agrupar os registros por período do dia " +
               "(hoje os horários aparecem como foram dados)");
    itens.push("Reaplicação · o intervalo de cada ferramenta " +
               "(só Hidratação & Movimento tem prazo, do §13.9)");

    RECOMENDACOES.forEach(function (r) {
      if (r.status === STATUS.nao_validado) {
        itens.push("Recomendação " + r.id + " · não executa até ser validada");
      } else if (r.status === STATUS.legado) {
        itens.push("Recomendação " + r.id + " · herdada do projeto, nunca validada");
      } else if (r.status !== STATUS.confirmado) {
        itens.push("Recomendação " + r.id);
      }
    });

    return itens;
  }

  window.CorpoBancos = {
    PROVENIENCIA: PROVENIENCIA,
    STATUS: STATUS,
    fonteDe: fonteDe,
    PAPEIS: PAPEIS,
    MOMENTUM: MOMENTUM,
    SONO: SONO,
    SINAIS_CATEGORIAS: SINAIS_CATEGORIAS,
    SINAIS_FREQUENCIA: SINAIS_FREQUENCIA,
    SINAIS_PRIORIDADE: SINAIS_PRIORIDADE,
    SINAIS_RED_FLAGS: SINAIS_RED_FLAGS,
    HABITOS_CATEGORIAS: HABITOS_CATEGORIAS,
    HABITOS_CONSISTENCIA: HABITOS_CONSISTENCIA,
    ROTINA_EVENTOS: ROTINA_EVENTOS,
    RECOMENDACOES: RECOMENDACOES,
    SELECAO: SELECAO,
    executavel: executavel,
    regrasAtivas: regrasAtivas,
    regrasApresentaveis: regrasApresentaveis,
    validada: validada,
    pendencias: pendencias
  };
})();
