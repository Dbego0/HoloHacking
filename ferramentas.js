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

  /* ------------------------------- CORPO -------------------------------- */

  {
    id: "mapa_rotina", modulo: "corpo", numero: "02",
    titulo: "Mapa da Rotina",
    chamada: "as 24 horas do dia alimentar",
    descricao: "Mapeamento das 24 horas do dia alimentar: horarios, contextos e as janelas reais onde cabe mudanca.",
    campos: [
      { id: "acorda", rotulo: "Que horas acorda", tipo: "texto", dica: "ex: 6h30" },
      { id: "manha", rotulo: "A manha dele", tipo: "textarea", dica: "o que come, onde, com quem, com quanta pressa" },
      { id: "almoco", rotulo: "O almoco", tipo: "textarea" },
      { id: "tarde", rotulo: "A tarde", tipo: "textarea" },
      { id: "noite", rotulo: "A noite", tipo: "textarea" },
      { id: "dorme", rotulo: "Que horas dorme", tipo: "texto" },
      { id: "janelas", rotulo: "Onde cabe mudanca de verdade", tipo: "textarea", dica: "os momentos do dia em que ele realmente consegue fazer diferente" }
    ]
  },

  {
    id: "energia_vital", modulo: "corpo", numero: "03",
    titulo: "Escala de Energia Vital",
    chamada: "a energia ao longo do dia",
    descricao: "Registro da energia física ao longo do dia e sua relação com alimentacao e descanso.",
    campos: [
      { id: "acordar", rotulo: "Ao acordar", tipo: "nota" },
      { id: "meio_manha", rotulo: "Meio da manha", tipo: "nota" },
      { id: "pos_almoco", rotulo: "Depois do almoco", tipo: "nota" },
      { id: "fim_tarde", rotulo: "Fim da tarde", tipo: "nota" },
      { id: "noite", rotulo: "A noite", tipo: "nota" },
      { id: "derruba", rotulo: "O que derruba a energia dele", tipo: "textarea" }
    ]
  },

  {
    id: "leitura_sinais", modulo: "corpo", numero: "04",
    titulo: "Leitura de Sinais — O Corpo que Fala",
    chamada: "traduzir sintoma em conduta",
    descricao: "Tradução de sintomas físicos em informações clínicas para a conduta.",
    campos: [
      { id: "sinais", rotulo: "Sinais que ele traz", tipo: "textarea", dica: "o que ele conta e o que você observa" },
      { id: "recorrentes", rotulo: "Quais se repetem", tipo: "textarea" },
      { id: "leitura", rotulo: "O que o corpo esta dizendo", tipo: "textarea", dica: "a leitura clínica por trás do sintoma" },
      { id: "prioridade", rotulo: "Por onde começar", tipo: "texto" }
    ]
  },

  {
    id: "diario_corporal", modulo: "corpo", numero: "05",
    titulo: "Diário Corporal",
    chamada: "fome, saciedade e sensações",
    descricao: "Registro de fome, saciedade e sensações corporais entre as consultas.",
    campos: [
      { id: "data", rotulo: "Dia", tipo: "data" },
      { id: "fome_acordar", rotulo: "Acordou com fome?", tipo: "escala" },
      { id: "saciedade", rotulo: "Percebeu a saciedade nas refeicoes?", tipo: "escala" },
      { id: "desconforto", rotulo: "Sentiu desconforto depois de comer?", tipo: "escala" },
      { id: "sensacoes", rotulo: "O que o corpo mostrou hoje", tipo: "textarea" }
    ]
  },

  {
    id: "ritmo_sono", modulo: "corpo", numero: "06",
    titulo: "Ritmo & Sono",
    chamada: "descanso como pilar do plano",
    descricao: "Avaliação do sono, descanso e recuperação como pilares do plano alimentar.",
    campos: [
      { id: "hora_dormir", rotulo: "Costuma dormir as", tipo: "texto" },
      { id: "hora_acordar", rotulo: "Costuma acordar as", tipo: "texto" },
      { id: "qualidade", rotulo: "Qualidade do sono", tipo: "nota" },
      { id: "despertares", rotulo: "Acorda de madrugada?", tipo: "escala" },
      { id: "acorda_como", rotulo: "Como acorda", tipo: "textarea", dica: "descansado, pesado, já cansado" },
      { id: "ritual", rotulo: "O que faz na hora antes de dormir", tipo: "textarea" }
    ]
  },

  {
    id: "inventario_habitos", modulo: "corpo", numero: "07",
    titulo: "Inventário de Hábitos",
    chamada: "o que sustenta e o que sabota",
    descricao: "Identificação dos hábitos que sustentam ou sabotam a transformação.",
    campos: [
      { id: "sustentam", rotulo: "Hábitos que sustentam", tipo: "textarea", dica: "o que ele já faz bem e nem percebe" },
      { id: "sabotam", rotulo: "Hábitos que sabotam", tipo: "textarea" },
      { id: "automatico", rotulo: "Qual e o mais automatico deles", tipo: "texto" },
      { id: "primeiro", rotulo: "Por qual começar", tipo: "texto", dica: "um só — o que tem mais chance de pegar" }
    ]
  },

  {
    id: "hidratacao_movimento", modulo: "corpo", numero: "08",
    titulo: "Termômetro de Hidratação & Movimento",
    chamada: "água, movimento e pausas",
    descricao: "Check rápido de água, movimento e pausas ao longo do dia.",
    campos: [
      { id: "agua", rotulo: "Copos de água por dia", tipo: "numero" },
      { id: "movimento", rotulo: "Se movimenta durante o dia?", tipo: "escala" },
      { id: "pausas", rotulo: "Faz pausas?", tipo: "escala" },
      { id: "sedentario", rotulo: "Quantas horas sentado por dia", tipo: "numero" },
      { id: "observacao", rotulo: "Observacao", tipo: "textarea" }
    ]
  },

  {
    id: "linha_momentum", modulo: "corpo", numero: "09",
    titulo: "Linha do Momentum",
    chamada: "o que ele consegue sustentar agora",
    descricao: "Leitura do momento de vida e do que o corpo consegue sustentar.",
    campos: [
      { id: "momento", rotulo: "Que momento de vida ele esta vivendo", tipo: "textarea" },
      { id: "sustenta", rotulo: "O que ele consegue sustentar hoje", tipo: "textarea" },
      { id: "nao_pedir", rotulo: "O que NAO e hora de pedir", tipo: "textarea", dica: "tao importante quanto o que pedir" },
      { id: "energia_disponivel", rotulo: "Energia disponível para mudanca", tipo: "nota" }
    ]
  },

  {
    id: "check_comprometimento", modulo: "corpo", numero: "10",
    titulo: "Check-in de Comprometimento",
    chamada: "o declarado e o real",
    descricao: "Medida do nível de comprometimento prático com a jornada.",
    campos: [
      { id: "declarado", rotulo: "Comprometimento que ele declara", tipo: "nota" },
      { id: "observado", rotulo: "Comprometimento que você observa", tipo: "nota", dica: "a diferença entre os dois e a conversa" },
      { id: "atrapalha", rotulo: "O que atrapalha", tipo: "textarea" },
      { id: "acordo", rotulo: "Acordo até a próxima consulta", tipo: "texto", dica: "um só, pequeno, verificavel" }
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
    titulo: "Roda da Vida Integral",
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
    titulo: "Ritual de Presença a Mesa",
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
    id: "carta_futuro", modulo: "espirito", numero: "04",
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
