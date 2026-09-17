/* ===========================================================================
   CATALOGO DAS FERRAMENTAS CLINICAS
   ===========================================================================

   Cada ferramenta e DADO, nao codigo. Para criar uma nova, acrescente um
   objeto aqui — nao precisa tocar em HTML nem em JS.

   Tipos de campo:
     texto      linha unica
     textarea   texto longo
     escala     0 a 3   (nunca / as vezes / frequente / sempre)
     nota       0 a 10  (regua)
     numero     numero livre
     data       data
     opcoes     escolha unica entre as opcoes dadas

   As tres ferramentas ancora (OQ3, PQQ, Mapa do Proposito) NAO estao aqui:
   elas ja tem tela propria, escrita a mao, e continuam como estao.
   =========================================================================== */

window.CATALOGO_FERRAMENTAS = [

  /* ------------------------------- CORPO --------------------------------

     Reestruturado conforme a Especificacao Mestre do Modulo Corpo v1.

     Cada ferramenta agora declara, alem dos campos:
       papel           estrutural | investigacao | monitoramento | implementacao
       objetivo        a pergunta clinica que ela responde
       quando_usar     em que momento faz sentido aplicar
       duracao         estimativa em minutos, para quem esta na consulta
       resultado       qual sintese ela produz (o calculo vive em
                       resultado-corpo.js; aqui so o nome dela)
       reaplicar_dias  de quanto em quanto tempo pede nova aplicacao.
                       null = o metodo ainda nao definiu prazo, e a ferramenta
                       nunca pede reaplicacao sozinha. So a 08 tem prazo (§13.9).
       grupos          quando a ferramenta tem secoes (Momentum, Sono)
       lista           quando a ferramenta e uma lista de itens repetiveis
                       (Sinais, Habitos, Rotina, Diario, Compromissos)

     NENHUM campo tem valor padrao. A especificacao (§4.1, §8.8) e explicita:
     "nenhum slider pode comecar preenchido; null significa nao respondido".
     Antes a regua nascia em 5 e era gravada como resposta de quem nao
     respondeu nada.
     ---------------------------------------------------------------------- */

  {
    id: "mapa_rotina", modulo: "corpo", numero: "02",
    papel: "estrutural",
    titulo: "Mapa da Rotina",
    chamada: "as 24 horas do dia real",
    descricao: "As 24 horas reais do paciente, evento a evento: onde a saude acontece, onde quebra e onde cabe mudanca.",
    objetivo: "Enxergar o dia como ele e, e nao como ele deveria ser.",
    quando_usar: "Na primeira consulta, e sempre que a rotina mudar de forma relevante.",
    duracao: 15,
    resultado: "rotina",
    lista: {
      id: "eventos", rotulo: "Eventos do dia", minimo: 1,
      titulo_item: "Evento",
      campos: [
        { id: "inicio", rotulo: "Comeca", tipo: "hora" },
        { id: "fim", rotulo: "Termina", tipo: "hora" },
        { id: "tipo", rotulo: "Tipo", tipo: "opcoes", opcoes_de: "rotina_eventos" },
        { id: "titulo", rotulo: "O que e", tipo: "texto", dica: "ex: cafe da manha em pe, na cozinha" },
        { id: "onde", rotulo: "Onde", tipo: "texto" },
        { id: "fome", rotulo: "Fome", tipo: "nota" },
        { id: "energia", rotulo: "Energia", tipo: "nota" },
        { id: "estresse", rotulo: "Estresse", tipo: "nota" },
        { id: "observacao", rotulo: "Observacao", tipo: "texto" }
      ]
    },
    campos: [
      { id: "barreira", rotulo: "Principal barreira pratica", tipo: "textarea" },
      { id: "comecar", rotulo: "Melhor ponto para comecar", tipo: "texto",
        dica: "um so — o que tem mais chance de pegar" }
    ]
  },

  {
    id: "energia_vital", modulo: "corpo", numero: "03",
    papel: "monitoramento",
    titulo: "Escala de Energia Vital",
    chamada: "a disposicao ao longo do dia",
    descricao: "Percepcao subjetiva de disposicao, vigor e capacidade funcional ao longo do dia. Nao e medida bioenergetica nem diagnostico fisiologico.",
    objetivo: "Ver as oscilacoes de disposicao no dia e em que contexto elas acontecem.",
    quando_usar: "Quando a queixa e cansaco, ou para acompanhar resposta a uma mudanca.",
    duracao: 5,
    resultado: "energia",
    // §8.5 da o tamanho da janela de coleta, nao a cadencia de reaplicacao
    reaplicar_dias: null,
    lista: {
      id: "dias", rotulo: "Dias registrados", minimo: 1,
      titulo_item: "Dia",
      campos: [
        { id: "data", rotulo: "Dia", tipo: "data" },
        { id: "acordar", rotulo: "Ao acordar", tipo: "nota" },
        { id: "meio_manha", rotulo: "Meio da manha", tipo: "nota" },
        { id: "pos_almoco", rotulo: "Depois do almoco", tipo: "nota" },
        { id: "fim_tarde", rotulo: "Fim da tarde", tipo: "nota" },
        { id: "noite", rotulo: "A noite", tipo: "nota" },
        { id: "sono_anterior", rotulo: "Sono da noite anterior", tipo: "nota" },
        { id: "cafeina", rotulo: "Cafeina no dia", tipo: "texto" },
        { id: "observacao", rotulo: "Observacao do dia", tipo: "texto" }
      ]
    },
    campos: [
      { id: "derruba", rotulo: "O que derruba a energia dele", tipo: "textarea" }
    ]
  },

  {
    id: "leitura_sinais", modulo: "corpo", numero: "04",
    papel: "investigacao",
    titulo: "Leitura de Sinais — O Corpo que Fala",
    chamada: "transformar relato em investigacao",
    descricao: "Organiza o relato corporal em investigacao clinica. Nao diagnostica: separa o que foi relatado do que precisa ser aprofundado.",
    objetivo: "Saber o que este conjunto de sinais pede para investigar.",
    quando_usar: "Quando o paciente traz varios sintomas soltos e e preciso ordena-los.",
    duracao: 15,
    resultado: "sinais",
    lista: {
      id: "sinais", rotulo: "Sinais relatados", minimo: 1,
      titulo_item: "Sinal",
      campos: [
        { id: "nome", rotulo: "Sinal", tipo: "texto", dica: "como o paciente descreve" },
        { id: "categoria", rotulo: "Categoria", tipo: "opcoes", opcoes_de: "sinais_categorias" },
        { id: "frequencia", rotulo: "Com que frequencia", tipo: "opcoes", opcoes_de: "sinais_frequencia" },
        { id: "intensidade", rotulo: "Intensidade", tipo: "nota" },
        { id: "desde", rotulo: "Desde quando", tipo: "texto" },
        { id: "contexto", rotulo: "Em que contexto aparece", tipo: "texto" },
        { id: "piora", rotulo: "Piora com", tipo: "texto" },
        { id: "melhora", rotulo: "Melhora com", tipo: "texto" }
      ]
    },
    campos: [
      { id: "investigar", rotulo: "O que este conjunto me pede para investigar", tipo: "textarea",
        dica: "a pergunta clinica, nao a conclusao" },
      { id: "prioridade_sinais", rotulo: "Prioridade", tipo: "opcoes", opcoes_de: "sinais_prioridade" }
    ]
  },

  {
    id: "diario_corporal", modulo: "corpo", numero: "05",
    papel: "monitoramento",
    titulo: "Diário Corporal",
    chamada: "o corpo entre as consultas",
    descricao: "Registro curto e repetido de fome, saciedade, energia e conforto digestivo — para ver como o corpo responde ao cotidiano.",
    objetivo: "Acompanhar a resposta do corpo entre uma consulta e a proxima.",
    quando_usar: "Entre consultas. Serve quando ha muitos registros, nao quando ha um.",
    duracao: 1,
    resultado: "diario",
    reaplicar_dias: null,        // sem prazo definido no metodo
    lista: {
      id: "registros", rotulo: "Registros", minimo: 1,
      titulo_item: "Registro",
      campos: [
        { id: "quando", rotulo: "Quando", tipo: "data" },
        { id: "hora", rotulo: "Hora", tipo: "hora" },
        { id: "fome", rotulo: "Fome", tipo: "nota" },
        { id: "saciedade", rotulo: "Saciedade", tipo: "nota" },
        { id: "energia", rotulo: "Energia", tipo: "nota" },
        { id: "digestao", rotulo: "Conforto digestivo", tipo: "nota" },
        { id: "emocao", rotulo: "Emocao", tipo: "texto" },
        { id: "refeicao", rotulo: "Refeicao", tipo: "texto" },
        { id: "sintoma", rotulo: "Sintoma", tipo: "texto" },
        { id: "observacao", rotulo: "Observacao", tipo: "texto" }
      ]
    },
    campos: []
  },

  {
    id: "ritmo_sono", modulo: "corpo", numero: "06",
    papel: "investigacao",
    titulo: "Ritmo & Sono",
    chamada: "duracao, regularidade, continuidade, recuperacao",
    descricao: "Avalia quatro dimensoes do sono separadamente, sem juntar tudo num numero so.",
    objetivo: "Descobrir qual das quatro dimensoes e a oportunidade desta fase.",
    quando_usar: "Quando o sono aparece na queixa, ou quando o corpo se mantem em alerta.",
    duracao: 10,
    resultado: "sono",
    reaplicar_dias: null,        // sem prazo definido no metodo
    grupos: [
      { id: "horarios", titulo: "Horarios", campos: [
        { id: "deita", rotulo: "Costuma deitar as", tipo: "hora" },
        { id: "dorme", rotulo: "Pega no sono por volta das", tipo: "hora" },
        { id: "acorda", rotulo: "Acorda as", tipo: "hora" },
        { id: "variacao", rotulo: "Quanto os horarios variam de um dia para o outro", tipo: "opcoes",
          opcoes: ["Menos de 1 hora", "De 1 a 2 horas", "Mais de 2 horas"] }
      ]},
      { id: "continuidade", titulo: "Continuidade", campos: [
        { id: "latencia", rotulo: "Quanto tempo leva para pegar no sono", tipo: "opcoes",
          opcoes: ["Ate 20 minutos", "De 20 a 30 minutos", "Mais de 30 minutos"] },
        { id: "despertares", rotulo: "Acorda de madrugada?", tipo: "escala" },
        { id: "cochilos", rotulo: "Cochila durante o dia?", tipo: "escala" }
      ]},
      { id: "recuperacao", titulo: "Recuperacao", campos: [
        { id: "qualidade", rotulo: "Qualidade percebida do sono", tipo: "nota" },
        { id: "acorda_como", rotulo: "Como acorda", tipo: "opcoes",
          opcoes: ["Descansada", "Parcialmente descansada", "Cansada"] }
      ]},
      { id: "contexto", titulo: "O que cerca o sono", campos: [
        { id: "cafeina", rotulo: "Cafeina — quanto e ate que horas", tipo: "texto" },
        { id: "telas", rotulo: "Telas a noite", tipo: "escala" },
        { id: "ritual", rotulo: "O que faz na hora antes de dormir", tipo: "textarea" },
        { id: "exercicio", rotulo: "Atividade fisica — quando", tipo: "texto" }
      ]}
    ],
    campos: []
  },

  {
    id: "inventario_habitos", modulo: "corpo", numero: "07",
    papel: "investigacao",
    titulo: "Inventário de Hábitos",
    chamada: "impacto contra viabilidade",
    descricao: "Levanta os habitos que sustentam e os que dificultam, e ordena candidatos pela combinacao de impacto e viabilidade.",
    objetivo: "Ver os habitos no plano impacto x viabilidade — nao a lista dos ruins.",
    quando_usar: "Depois de enxergar a rotina, quando e hora de escolher por onde comecar.",
    duracao: 20,
    resultado: "habitos",
    lista: {
      id: "habitos", rotulo: "Habitos levantados", minimo: 1,
      titulo_item: "Habito",
      campos: [
        { id: "habito", rotulo: "Habito", tipo: "texto", dica: "como ele acontece hoje, sem julgamento" },
        { id: "categoria", rotulo: "Categoria", tipo: "opcoes", opcoes_de: "habitos_categorias" },
        { id: "consistencia", rotulo: "Acontece", tipo: "opcoes", opcoes_de: "habitos_consistencia" },
        { id: "impacto", rotulo: "Impacto estimado", tipo: "nota" },
        { id: "viabilidade", rotulo: "Viabilidade de mudanca", tipo: "nota" },
        { id: "observacao", rotulo: "Observacao", tipo: "texto" }
      ]
    },
    campos: [
      { id: "testar", rotulo: "Habito prioritario para testar", tipo: "texto" }
    ]
  },

  {
    id: "hidratacao_movimento", modulo: "corpo", numero: "08",
    papel: "monitoramento",
    titulo: "Termômetro de Hidratação & Movimento",
    chamada: "agua, movimento e recuperacao",
    descricao: "Check rapido dos fundamentos da rotina corporal. Tres leituras separadas, sem nota unica misturando as tres.",
    objetivo: "Achar qual dos tres fundamentos tem mais espaco de mudanca agora.",
    quando_usar: "Como check rapido, e para acompanhar semana a semana.",
    duracao: 5,
    resultado: "hidratacao",
    reaplicar_dias: 7,           // §13.9: "pode ser reaplicada semanalmente"
    grupos: [
      { id: "hidratacao", titulo: "Hidratacao", campos: [
        { id: "copos", rotulo: "Copos de agua por dia", tipo: "numero" },
        { id: "sede", rotulo: "Sente sede ao longo do dia?", tipo: "escala" },
        { id: "acesso", rotulo: "Tem agua por perto onde passa o dia?", tipo: "escala" },
        { id: "distribuicao", rotulo: "Como se distribui no dia", tipo: "texto" }
      ]},
      { id: "movimento", titulo: "Movimento", campos: [
        { id: "sentado", rotulo: "Horas sentado por dia", tipo: "numero" },
        { id: "pausas", rotulo: "Faz pausas para levantar?", tipo: "escala" },
        { id: "cotidiano", rotulo: "Movimento no dia a dia", tipo: "escala",
          dica: "escada, caminhada ate o trabalho, tarefas de casa" },
        { id: "exercicio", rotulo: "Exercicio estruturado", tipo: "texto" },
        { id: "mobilidade", rotulo: "Mobilidade percebida", tipo: "nota" }
      ]},
      { id: "recuperacao", titulo: "Recuperacao", campos: [
        { id: "cansaco", rotulo: "Cansaco fisico no fim do dia", tipo: "nota" },
        { id: "recupera", rotulo: "Sensacao de recuperacao ao acordar", tipo: "nota" }
      ]}
    ],
    campos: [
      { id: "observacao", rotulo: "Observacao", tipo: "textarea" }
    ]
  },

  {
    id: "linha_momentum", modulo: "corpo", numero: "02",
    papel: "estrutural",
    titulo: "Linha do Momentum",
    chamada: "o quanto de mudanca cabe agora",
    descricao: "Momentum e a capacidade atual da pessoa de mobilizar recursos fisicos, mentais e praticos para sustentar mudanca. Nao e forca de vontade, motivacao, obediencia nem comprometimento moral.",
    objetivo: "Definir a intensidade de plano que cabe na vida dela agora.",
    quando_usar: "Antes de montar conduta, e sempre que a vida mudar de fase.",
    duracao: 10,
    resultado: "momentum",
    reaplicar_dias: null,        // sem prazo definido no metodo
    grupos: [
      { id: "dimensoes", titulo: "As seis dimensoes", origem: "momentum_dimensoes" }
    ],
    campos: [
      { id: "sustenta", rotulo: "O que sustenta esta pessoa agora", tipo: "textarea" },
      { id: "limita", rotulo: "O que limita", tipo: "textarea" },
      { id: "nao_pedir", rotulo: "O que NAO e hora de pedir", tipo: "textarea",
        dica: "tao importante quanto o que pedir" },
      /* O sistema NAO sugere estado (§14.6): quem decide e quem atende, e a
         justificativa fica junto para que a decisao seja auditavel depois. */
      { id: "estado_confirmado", rotulo: "Estado de Momentum", tipo: "opcoes",
        opcoes_de: "momentum_estados",
        dica: "o sistema nao sugere — a leitura e sua" },
      { id: "justificativa_estado", rotulo: "Por que este estado", tipo: "textarea",
        dica: "o que nas seis dimensoes sustenta esta leitura" }
    ]
  },

  {
    id: "check_comprometimento", modulo: "corpo", numero: "10",
    papel: "implementacao",
    titulo: "Check-in de Comprometimento",
    chamada: "o quanto este acordo cabe na vida dela",
    descricao: "Avalia cada acao combinada: importancia, confianca e dificuldade. A pergunta nao e se a pessoa e comprometida — e o quanto e possivel cumprir este acordo.",
    objetivo: "Saber se o acordo cabe, e redesenha-lo enquanto ha tempo.",
    quando_usar: "Ao fechar a consulta, para cada acao combinada.",
    duracao: 5,
    resultado: "compromisso",
    // §15.9 diz que o acordo reaparece na proxima consulta — nao em N dias
    reaplicar_dias: null,
    lista: {
      id: "acordos", rotulo: "Acordos ate a proxima consulta", minimo: 1,
      titulo_item: "Acordo",
      campos: [
        { id: "acao", rotulo: "Acao combinada", tipo: "texto", dica: "pequena, concreta, verificavel" },
        { id: "importancia", rotulo: "Importancia para ela", tipo: "nota" },
        { id: "confianca", rotulo: "Confianca de que consegue", tipo: "nota" },
        { id: "dificuldade", rotulo: "Dificuldade percebida", tipo: "nota" },
        { id: "barreira", rotulo: "Principal barreira", tipo: "texto" },
        { id: "plano_b", rotulo: "Plano B", tipo: "texto", dica: "o que fazer no dia em que nao der" },
        { id: "prazo", rotulo: "Ate quando", tipo: "data" },
        { id: "resultado_acordo", rotulo: "O que aconteceu", tipo: "opcoes",
          opcoes: ["Ainda nao verificado", "Realizado", "Parcialmente realizado", "Nao realizado"] },
        { id: "aprendizado", rotulo: "O que aconteceu de fato", tipo: "texto",
          dica: "preencher na consulta seguinte" }
      ]
    },
    campos: [
      { id: "aumentar_confianca", rotulo: "O que faria a confianca dela aumentar um ponto", tipo: "textarea" }
    ]
  },

  /* ------------------------------- MENTE -------------------------------- */

  {
    id: "mapa_crencas", modulo: "mente", numero: "02",
    titulo: "Mapa de Crenças Alimentares",
    chamada: "o que ele acredita sobre comida",
    descricao: "Levantamento das crenças limitantes sobre a comida e o corpo.",
    campos: [
      { id: "crencas", rotulo: "Crenças que ele carrega", tipo: "textarea", dica: "uma por linha — 'carboidrato engorda', 'eu não tenho força de vontade'" },
      { id: "origem", rotulo: "De onde vieram", tipo: "textarea", dica: "familia, dieta antiga, algo que alguém disse" },
      { id: "mais_atrapalha", rotulo: "Qual mais atrapalha hoje", tipo: "texto" },
      { id: "alternativa", rotulo: "Crenca alternativa possível", tipo: "texto", dica: "não a oposta — a que ele conseguiria acreditar" }
    ]
  },

  {
    id: "diario_emocoes", modulo: "mente", numero: "03",
    titulo: "Diário de Emoções & Comida",
    chamada: "a fome que não e do corpo",
    descricao: "Registro da fome emocional: o que sente antes, durante e depois de comer.",
    campos: [
      { id: "data", rotulo: "Dia", tipo: "data" },
      { id: "antes", rotulo: "O que sentia antes", tipo: "texto" },
      { id: "comeu", rotulo: "O que comeu", tipo: "texto" },
      { id: "durante", rotulo: "O que sentiu comendo", tipo: "texto" },
      { id: "depois", rotulo: "O que sentiu depois", tipo: "texto" },
      { id: "fome_real", rotulo: "Era fome do corpo?", tipo: "opcoes", opcoes: ["Sim", "Não", "Não sei dizer"] }
    ]
  },

  {
    id: "historia_alimentar", modulo: "mente", numero: "04",
    titulo: "Linha da História Alimentar",
    chamada: "o padrão que se repete",
    descricao: "Memórias e padrões que se repetem na relação com o alimento.",
    campos: [
      { id: "infancia", rotulo: "Infancia", tipo: "textarea", dica: "como era a comida na casa dele" },
      { id: "adolescencia", rotulo: "Adolescencia", tipo: "textarea" },
      { id: "adulta", rotulo: "Vida adulta", tipo: "textarea" },
      { id: "primeira_dieta", rotulo: "A primeira dieta", tipo: "texto", dica: "quantos anos tinha e o que aconteceu" },
      { id: "padrao", rotulo: "O padrão que se repete", tipo: "textarea" }
    ]
  },

  {
    id: "gatilhos_respostas", modulo: "mente", numero: "05",
    titulo: "Gatilhos & Respostas",
    chamada: "o que dispara o automatico",
    descricao: "Mapeamento das situações que disparam comportamentos automaticos.",
    campos: [
      { id: "gatilho1", rotulo: "Gatilho 1", tipo: "texto" },
      { id: "resposta1", rotulo: "O que ele faz hoje", tipo: "texto" },
      { id: "escolha1", rotulo: "O que poderia fazer", tipo: "texto" },
      { id: "gatilho2", rotulo: "Gatilho 2", tipo: "texto" },
      { id: "resposta2", rotulo: "O que ele faz hoje", tipo: "texto" },
      { id: "escolha2", rotulo: "O que poderia fazer", tipo: "texto" },
      { id: "gatilho3", rotulo: "Gatilho 3", tipo: "texto" },
      { id: "resposta3", rotulo: "O que ele faz hoje", tipo: "texto" },
      { id: "escolha3", rotulo: "O que poderia fazer", tipo: "texto" }
    ]
  },

  {
    id: "roda_valores", modulo: "mente", numero: "06",
    titulo: "Roda dos Valores Essenciais",
    chamada: "o que orienta as decisões dele",
    descricao: "Clarificação dos valores que orientam decisões e prioridades.",
    campos: [
      { id: "valor1", rotulo: "Valor 1", tipo: "texto" },
      { id: "valor2", rotulo: "Valor 2", tipo: "texto" },
      { id: "valor3", rotulo: "Valor 3", tipo: "texto" },
      { id: "valor4", rotulo: "Valor 4", tipo: "texto" },
      { id: "valor5", rotulo: "Valor 5", tipo: "texto" },
      { id: "negligenciado", rotulo: "Qual esta sendo negligenciado", tipo: "texto" },
      { id: "coerência", rotulo: "Coerencia entre valores e rotina", tipo: "nota" }
    ]
  },

  {
    id: "reenquadramento", modulo: "mente", numero: "07",
    titulo: "Reenquadramento de Pensamentos",
    chamada: "de sabotador para possível",
    descricao: "Transformação de pensamentos sabotadores em narrativas possíveis.",
    campos: [
      { id: "pensamento", rotulo: "O pensamento sabotador", tipo: "texto", dica: "com as palavras dele" },
      { id: "quando", rotulo: "Quando ele aparece", tipo: "texto" },
      { id: "evidencia_contra", rotulo: "O que contradiz esse pensamento", tipo: "textarea" },
      { id: "nova", rotulo: "A narrativa possível", tipo: "textarea", dica: "que ele acredite de verdade, não a positiva de fachada" }
    ]
  },

  {
    id: "ancoras_motivacao", modulo: "mente", numero: "08",
    titulo: "Âncoras de Motivação",
    chamada: "o que sustenta quando a vontade cai",
    descricao: "Construção de lembretes e âncoras que sustentam a constância.",
    campos: [
      { id: "porque", rotulo: "O porque dele, em uma frase", tipo: "texto" },
      { id: "imagem", rotulo: "Uma imagem que representa isso", tipo: "texto" },
      { id: "onde", rotulo: "Onde ele vai ver essa âncora", tipo: "texto", dica: "geladeira, celular, espelho" },
      { id: "quando_cair", rotulo: "O que fazer quando a vontade cair", tipo: "textarea" }
    ]
  },

  {
    id: "autocompaixao", modulo: "mente", numero: "09",
    titulo: "Escala de Autocompaixão",
    chamada: "como ele fala consigo",
    descricao: "Avaliação do diálogo interno e da forma como o paciente trata a si mesmo.",
    campos: [
      { id: "nota", rotulo: "Como ele se trata, de 0 a 10", tipo: "nota" },
      { id: "frase_dura", rotulo: "A frase mais dura que ele diz a si mesmo", tipo: "texto" },
      { id: "diria_amigo", rotulo: "Ele diria isso a um amigo?", tipo: "opcoes", opcoes: ["Nunca", "Talvez", "Diria"] },
      { id: "quando_erra", rotulo: "O que acontece quando ele sai da linha", tipo: "textarea" }
    ]
  },

  {
    id: "autoestima", modulo: "mente", numero: "10",
    titulo: "Termômetro de Autoestima",
    chamada: "o que ele reconhece em si",
    descricao: "Acompanhamento da autoimagem e do reconhecimento das próprias conquistas.",
    campos: [
      { id: "autoimagem", rotulo: "Autoimagem hoje", tipo: "nota" },
      { id: "conquista", rotulo: "Uma conquista que ele reconhece", tipo: "texto" },
      { id: "nao_reconhece", rotulo: "Uma que ele ainda não reconhece", tipo: "texto", dica: "e que você ve" },
      { id: "espelho", rotulo: "O que ele ve no espelho", tipo: "textarea" }
    ]
  },

  /* ------------------------------ ESPIRITO ------------------------------ */

  {
    id: "roda_vida", modulo: "espirito", numero: "02",
    titulo: "Roda Holística da Vida",
    chamada: "o equilibrio entre as áreas",
    descricao: "Visão panorâmica das áreas da vida e do equilibrio entre elas.",
    campos: [
      { id: "saude", rotulo: "Saúde", tipo: "nota" },
      { id: "relacoes", rotulo: "Relacoes", tipo: "nota" },
      { id: "trabalho", rotulo: "Trabalho", tipo: "nota" },
      { id: "financas", rotulo: "Financas", tipo: "nota" },
      { id: "espiritualidade", rotulo: "Espiritualidade", tipo: "nota" },
      { id: "lazer", rotulo: "Lazer", tipo: "nota" },
      { id: "desenvolvimento", rotulo: "Desenvolvimento pessoal", tipo: "nota" },
      { id: "proposito", rotulo: "Propósito", tipo: "nota" },
      { id: "puxa", rotulo: "Qual área esta puxando as outras para baixo", tipo: "texto" }
    ]
  },

  {
    id: "ritual_mesa", modulo: "espirito", numero: "03",
    titulo: "Ritual de Presença à Mesa",
    chamada: "comer com presença",
    descricao: "Prática de comer consciente: presença, gratidão e conexão.",
    campos: [
      { id: "como_come", rotulo: "Como ele come hoje", tipo: "textarea", dica: "em pe, no celular, com pressa, acompanhado" },
      { id: "ritual", rotulo: "O ritual escolhido", tipo: "textarea", dica: "três respiracoes, agradecer, desligar a tela" },
      { id: "refeicoes", rotulo: "Em quantas refeicoes por semana", tipo: "numero" },
      { id: "diferenca", rotulo: "Que diferença ele notou", tipo: "textarea" }
    ]
  },

  {
    id: "carta_futuro", modulo: "espirito", numero: "03",
    titulo: "Carta ao Futuro Eu",
    chamada: "escrever para quem ele quer ser",
    descricao: "Escrita guiada para conectar o paciente a pessoa que deseja se tornar.",
    campos: [
      { id: "para_quando", rotulo: "Para quando", tipo: "data", dica: "a data em que ele vai reler" },
      { id: "carta", rotulo: "A carta", tipo: "textarea", grande: true, dica: "escrita por ele, na primeira pessoa, para quem ele sera" }
    ]
  },

  {
    id: "inventario_gratidao", modulo: "espirito", numero: "05",
    titulo: "Inventário de Gratidão",
    chamada: "o que nutre além do prato",
    descricao: "Registro diário do que nutre além do prato.",
    campos: [
      { id: "data", rotulo: "Dia", tipo: "data" },
      { id: "g1", rotulo: "Sou grato por", tipo: "texto" },
      { id: "g2", rotulo: "Sou grato por", tipo: "texto" },
      { id: "g3", rotulo: "Sou grato por", tipo: "texto" },
      { id: "corpo", rotulo: "Uma coisa que meu corpo fez por mim hoje", tipo: "texto" }
    ]
  },

  {
    id: "conexao_pertencimento", modulo: "espirito", numero: "06",
    titulo: "Conexão & Pertencimento",
    chamada: "quem sustenta a jornada",
    descricao: "Mapeamento das relações que sustentam a jornada.",
    campos: [
      { id: "sustentam", rotulo: "Quem sustenta", tipo: "textarea" },
      { id: "drenam", rotulo: "Quem drena", tipo: "textarea" },
      { id: "pertence", rotulo: "Onde ele se sente pertencendo", tipo: "texto" },
      { id: "sozinho", rotulo: "Ele esta fazendo isso sozinho?", tipo: "opcoes", opcoes: ["Sozinho", "Com alguém", "Com uma rede"] }
    ]
  },

  {
    id: "circulo_sentido", modulo: "espirito", numero: "07",
    titulo: "Círculo de Sentido",
    chamada: "o que da significado",
    descricao: "Investigação do que da significado a vida do paciente.",
    campos: [
      { id: "da_sentido", rotulo: "O que da sentido hoje", tipo: "textarea" },
      { id: "perdeu", rotulo: "O que perdeu o sentido", tipo: "textarea" },
      { id: "resgatar", rotulo: "O que ele quer resgatar", tipo: "texto" },
      { id: "vazio", rotulo: "Onde mora o vazio", tipo: "textarea", dica: "se houver" }
    ]
  },

  {
    id: "praticas_contemplativas", modulo: "espirito", numero: "08",
    titulo: "Práticas Contemplativas",
    chamada: "respiração, silêncio e presença",
    descricao: "Repertório de respiração, silêncio e presença.",
    campos: [
      { id: "pratica", rotulo: "Prática escolhida", tipo: "opcoes", opcoes: ["Respiracao consciente", "Meditação", "Caminhada silenciosa", "Journaling", "Oração", "Contato com a natureza"] },
      { id: "frequência", rotulo: "Com que frequência", tipo: "opcoes", opcoes: ["Todo dia", "Alguns dias", "Uma vez por semana", "Quando lembra"] },
      { id: "quando", rotulo: "Em que momento do dia", tipo: "texto" },
      { id: "depois", rotulo: "Como ele se sente depois", tipo: "textarea" }
    ]
  },

  {
    id: "legado", modulo: "espirito", numero: "09",
    titulo: "Legado & Transcendência",
    chamada: "o que ele quer deixar",
    descricao: "Reflexão sobre o que o paciente quer deixar e a quem quer servir.",
    campos: [
      { id: "deixar", rotulo: "O que ele quer deixar", tipo: "textarea" },
      { id: "servir", rotulo: "A quem quer servir", tipo: "texto" },
      { id: "lembrado", rotulo: "Como quer ser lembrado", tipo: "texto" },
      { id: "hoje", rotulo: "O que precisa mudar hoje para isso ser verdade", tipo: "textarea" }
    ]
  },

  {
    id: "alinhamento", modulo: "espirito", numero: "10",
    titulo: "Alinhamento Corpo · Mente · Espírito",
    chamada: "as três dimensões em equilibrio",
    descricao: "Check de equilibrio entre as três dimensões.",
    campos: [
      { id: "corpo", rotulo: "Corpo", tipo: "nota" },
      { id: "mente", rotulo: "Mente", tipo: "nota" },
      { id: "espirito", rotulo: "Espírito", tipo: "nota" },
      { id: "puxando", rotulo: "Qual esta puxando as outras", tipo: "opcoes", opcoes: ["Corpo", "Mente", "Espírito"] },
      { id: "diferenca", rotulo: "O que faria diferença agora", tipo: "textarea" }
    ]
  }
];
