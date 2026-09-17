/* ============================================================================
   ARMAZENAMENTO — o mapa do que este app guarda, e onde.

   Este arquivo e PURAMENTE TECNICO. Ele nao sabe o que e um sistema, um
   marcador, um score, uma ferramenta ou o HOLOSCOPE. Nao le o DOM, nao sabe
   qual paciente esta aberto na tela, e nao decide nada de clinica. Ele sabe
   uma coisa so: QUAIS CAIXAS EXISTEM, que forma cada uma tem, e que operacoes
   estruturais fazem sentido em cada forma.

   POR QUE ELE EXISTE
     O universo persistente estava espalhado. dados.js conhecia 8 tabelas;
     questionario.js, app.js e arquivos.js abriam caixas de localStorage por
     conta propria; arquivo-store.js falava com o IndexedDB. Ninguem tinha a
     lista inteira. O resultado auditado: o backup leva 8 dos 13, a exclusao
     de um paciente apaga 1 destino e deixa 9 com dado clinico orfao.

     O manifesto e a lista inteira, num lugar so, para que export, import,
     exclusao, apagar tudo e diagnostico possam um dia derivar dela em vez de
     cada um manter a sua.

   O QUE ELE NAO FAZ NESTA RODADA (P0.2)
     Nada. Ele DESCREVE. Os fluxos reais do app continuam exatamente como
     estavam: o export continua incompleto, o import continua produzindo
     estado hibrido, a exclusao continua deixando orfaos. Corrigir isso e
     P0.3 em diante. O unico consumidor do manifesto hoje e dados.js, que
     deriva dele a lista de tabelas que ja tinha — e um teste prova que a
     lista derivada e identica, nome por nome e na mesma ordem.

     Os adaptadores e o diagnostico existem, sao somente-leitura, e sao usados
     por teste. Nenhum fluxo do app passa por eles.
   ========================================================================== */

(function () {
  "use strict";

  /* A versao do MANIFESTO, nao do app e nao do backup. Ela e explicita de
     proposito: inferi-la da quantidade de entradas faria "acrescentei uma
     caixa" e "mudei a forma de descrever as caixas" virarem a mesma coisa, e
     sao coisas diferentes. Incrementa quando a ESTRUTURA muda — um campo novo
     obrigatorio, um vocabulario novo, uma forma nova — e nao quando uma
     entrada e acrescentada. O Backup V2 grava este numero para que uma
     restauracao futura saiba com que gramatica o pacote foi escrito. */
  var MANIFESTO_VERSAO = 1;

  var PREFIXO_TABELA = "holohacking.dados.";

  /* O valor que as caixas por paciente usam como chave quando NAO ha paciente
     ativo. Nao e um paciente: e o deposito de tudo que foi respondido fora de
     um cadastro. Fica registrado aqui para que nenhuma operacao futura o trate
     como id de gente — uma cascata que aceitasse "_sem_paciente" como
     pacienteId apagaria o deposito inteiro de uma vez. */
  var SEM_PACIENTE = "_sem_paciente";

  /* ---------- vocabularios ---------------------------------------------- */

  var BACKEND = {
    TABELA: "tabela",        // localStorage, via a fachada de dados.js
    LOCAL: "localStorage",   // localStorage, aberto direto pelo modulo dono
    INDEXEDDB: "indexedDB"
  };

  var FORMA = {
    LISTA: "lista",                       // array de linhas, cada uma com id
    MAPA: "mapaPorPaciente",              // objeto { pacienteId: conteudo }
    LOJA: "objectStore"                   // IndexedDB, keyPath + index
  };

  var CATEGORIA = {
    FONTE: "fonte",                  // dado original, nao regeneravel
    SNAPSHOT: "snapshot",            // gravado por acao explicita; so o ultimo
                                     // seria recalculavel, e ainda assim
                                     // dependeria de bancos que mudam
    LEGADO: "legado",                // caixa de origem de uma migracao
    CONFIGURACAO: "configuracao"     // preferencia de quem usa o app
  };

  /* Como cada caixa diz de quem e a linha. Sao tres estrategias reais, nao
     uma so — e por isso que uma cascata generica precisa do manifesto. */
  var ESCOPO = {
    RAIZ: "raiz",                    // a tabela de pacientes: e o pai, nao filho
    CAMPO: "campo_paciente_id",      // a linha tem paciente_id
    CHAVE: "chave_do_mapa",          // o pacienteId E a chave do objeto
    INDICE: "index_paciente",        // IndexedDB, campo `paciente` + index
    GLOBAL: "global"                 // nao pertence a paciente nenhum
  };

  /* ---------- o manifesto ------------------------------------------------
     Treze armazenamentos. Cada entrada declara o que ela e e o que se pode
     fazer com ela — sem opinar sobre clinica, e sem esconder nenhum defeito
     atual atras de um campo bonito. Os campos `exportar` e `excluirComPaciente`
     dizem o que DEVE acontecer; o que acontece hoje esta em `hoje`, para que a
     distancia entre os dois seja legivel e testavel. */

  var STORAGE_MANIFEST = [
    /* ---- T1..T8: as oito tabelas da fachada de dados.js ---------------- */
    {
      id: "pacientes", backend: BACKEND.TABELA, chave: PREFIXO_TABELA + "pacientes",
      ordemFachada: 0,
      forma: FORMA.LISTA, categoria: CATEGORIA.FONTE,
      escopo: ESCOPO.RAIZ, pacienteScoped: false, campoPaciente: null,
      exportar: true, importar: true, excluirComPaciente: true, limparTudo: true,
      derivavel: false, sensivel: true, versao: 1,
      descricao: "O cadastro. E a raiz da qual todo o resto pende.",
      hoje: { exportado: true, excluido: true }
    },
    {
      id: "aplicacoes", backend: BACKEND.TABELA, chave: PREFIXO_TABELA + "aplicacoes",
      ordemFachada: 7,
      forma: FORMA.LISTA, categoria: CATEGORIA.FONTE,
      escopo: ESCOPO.CAMPO, pacienteScoped: true, campoPaciente: "paciente_id",
      exportar: true, importar: true, excluirComPaciente: true, limparTudo: true,
      derivavel: false, sensivel: true, versao: 1,
      descricao: "Cada vez que uma ferramenta foi aplicada a alguem. Versionada.",
      hoje: { exportado: true, excluido: false }
    },
    {
      id: "consultas", backend: BACKEND.TABELA, chave: PREFIXO_TABELA + "consultas",
      ordemFachada: 5,
      forma: FORMA.LISTA, categoria: CATEGORIA.FONTE,
      escopo: ESCOPO.CAMPO, pacienteScoped: true, campoPaciente: "paciente_id",
      exportar: true, importar: true, excluirComPaciente: true, limparTudo: true,
      derivavel: false, sensivel: true, versao: 1,
      descricao: "A agenda: o atendimento marcado.",
      hoje: { exportado: true, excluido: false }
    },
    {
      id: "bloqueios", backend: BACKEND.TABELA, chave: PREFIXO_TABELA + "bloqueios",
      ordemFachada: 6,
      forma: FORMA.LISTA, categoria: CATEGORIA.FONTE,
      escopo: ESCOPO.GLOBAL, pacienteScoped: false, campoPaciente: null,
      exportar: true, importar: true, excluirComPaciente: false, limparTudo: true,
      derivavel: false, sensivel: false, versao: 1,
      descricao: "O tempo que nao esta disponivel: almoco, aula, viagem. " +
                 "E da agenda de quem atende, nao de um paciente.",
      hoje: { exportado: true, excluido: false }
    },
    {
      id: "holoscope", backend: BACKEND.TABELA, chave: PREFIXO_TABELA + "holoscope",
      ordemFachada: 3,
      forma: FORMA.LISTA, categoria: CATEGORIA.SNAPSHOT,
      escopo: ESCOPO.CAMPO, pacienteScoped: true, campoPaciente: "paciente_id",
      exportar: true, importar: true, excluirComPaciente: true, limparTudo: true,
      derivavel: false, sensivel: true, versao: 1,
      descricao: "O mapa gravado por acao explicita. Recalculavel so para a " +
                 "ultima aplicacao, e ainda assim dependente dos bancos do " +
                 "motor, que mudam: trata-se como fonte.",
      hoje: { exportado: true, excluido: false }
    },
    {
      id: "oq3", backend: BACKEND.TABELA, chave: PREFIXO_TABELA + "oq3",
      ordemFachada: 1,
      forma: FORMA.LISTA, categoria: CATEGORIA.LEGADO,
      escopo: ESCOPO.CAMPO, pacienteScoped: true, campoPaciente: "paciente_id",
      exportar: true, importar: true, excluirComPaciente: true, limparTudo: true,
      derivavel: false, sensivel: true, versao: 1,
      descricao: "Caixa de origem do OQ3, anterior ao modelo versionado. " +
                 "Nao e apagada depois de migrada, de proposito.",
      migradaPara: "aplicacoes",
      hoje: { exportado: true, excluido: false }
    },
    {
      id: "pqq", backend: BACKEND.TABELA, chave: PREFIXO_TABELA + "pqq",
      ordemFachada: 2,
      forma: FORMA.LISTA, categoria: CATEGORIA.LEGADO,
      escopo: ESCOPO.CAMPO, pacienteScoped: true, campoPaciente: "paciente_id",
      exportar: true, importar: true, excluirComPaciente: true, limparTudo: true,
      derivavel: false, sensivel: true, versao: 1,
      descricao: "Idem, para o PQQ.",
      migradaPara: "aplicacoes",
      hoje: { exportado: true, excluido: false }
    },
    {
      id: "perfil", backend: BACKEND.TABELA, chave: PREFIXO_TABELA + "perfil",
      ordemFachada: 4,
      forma: FORMA.LISTA, categoria: CATEGORIA.CONFIGURACAO,
      escopo: ESCOPO.GLOBAL, pacienteScoped: false, campoPaciente: null,
      exportar: true, importar: true, excluirComPaciente: false, limparTudo: true,
      derivavel: false, sensivel: false, versao: 1,
      descricao: "Quem usa o app: nome, registro no conselho, assinatura. " +
                 "Viaja junto porque relatorio sem rodape nao vale.",
      hoje: { exportado: true, excluido: false }
    },

    /* ---- X1..X4: caixas de localStorage fora da fachada ---------------- */
    {
      id: "questionario", backend: BACKEND.LOCAL, chave: "holohacking.questionario",
      forma: FORMA.MAPA, categoria: CATEGORIA.FONTE,
      escopo: ESCOPO.CHAVE, pacienteScoped: true, campoPaciente: null,
      exportar: true, importar: true, excluirComPaciente: true, limparTudo: true,
      derivavel: false, sensivel: true, versao: 1,
      descricao: "As respostas do paciente. E a fonte de tudo o que se calcula " +
                 "— e guarda UM estado por paciente, sobrescrito a cada vez.",
      hoje: { exportado: false, excluido: false }
    },
    {
      id: "pontuacao", backend: BACKEND.LOCAL, chave: "holohacking.pontuacao",
      forma: FORMA.MAPA, categoria: CATEGORIA.FONTE,
      escopo: ESCOPO.CHAVE, pacienteScoped: true, campoPaciente: null,
      exportar: true, importar: true, excluirComPaciente: true, limparTudo: true,
      derivavel: false, sensivel: true, versao: 1,
      descricao: "A serie historica de mapas. NAO e recalculavel do " +
                 "questionario: o questionario guarda um estado so, esta caixa " +
                 "guarda a linha do tempo. Perdida, a comparacao 4/8/12 " +
                 "semanas vai junto.",
      hoje: { exportado: false, excluido: false }
    },
    {
      id: "exames", backend: BACKEND.LOCAL, chave: "holohacking.exames",
      forma: FORMA.MAPA, categoria: CATEGORIA.FONTE,
      escopo: ESCOPO.CHAVE, pacienteScoped: true, campoPaciente: null,
      exportar: true, importar: true, excluirComPaciente: true, limparTudo: true,
      derivavel: false, sensivel: true, versao: 1,
      descricao: "Os valores laboratoriais digitados a partir do laudo.",
      hoje: { exportado: false, excluido: false }
    },
    {
      id: "aparencia", backend: BACKEND.LOCAL, chave: "holohacking.aparencia",
      forma: FORMA.MAPA, categoria: CATEGORIA.CONFIGURACAO,
      escopo: ESCOPO.GLOBAL, pacienteScoped: false, campoPaciente: null,
      exportar: false, importar: false, excluirComPaciente: false, limparTudo: true,
      derivavel: true, sensivel: false, versao: 1,
      descricao: "Claro, escuro ou o que o sistema disser. E preferencia de " +
                 "quem usa ESTE navegador: regeneravel, e a unica das cinco " +
                 "caixas fora do backup cuja ausencia la esta CERTA. Trazer a " +
                 "aparencia de outra maquina junto com o dado clinico seria " +
                 "importar a decoracao junto com o prontuario.",
      hoje: { exportado: false, excluido: false }
    },

    /* ---- I1: o IndexedDB ---------------------------------------------- */
    {
      id: "arquivos", backend: BACKEND.INDEXEDDB, chave: "holohacking/arquivos",
      forma: FORMA.LOJA, categoria: CATEGORIA.FONTE,
      escopo: ESCOPO.INDICE, pacienteScoped: true, campoPaciente: "paciente",
      exportar: true, importar: true, excluirComPaciente: true, limparTudo: true,
      derivavel: false, sensivel: true, versao: 1,
      descricao: "Laudos e fotos de exame. Binario nao cabe no localStorage.",
      loja: { banco: "holohacking", nome: "arquivos", keyPath: "id", indice: "paciente" },
      hoje: { exportado: false, excluido: false }
    }
  ];

  /* ---------- o que NAO e armazenamento principal -------------------------
     Existe no disco, mas nao e dado: sao marcas de controle e caixas ja
     consumidas por migracao. Ficam registradas aqui para que "nao esta no
     manifesto" nunca queira dizer "ninguem sabia que existia". */

  var MARCAS_DE_MIGRACAO = [
    {
      id: "oq3.migrado", chave: "holohacking.oq3.migrado",
      exportar: false, importar: false, limparTudo: true,
      /* Uma restauracao futura precisa limpar isto: se a marca viajar com o
         pacote, a migracao nao roda no destino; se ficar para tras enquanto as
         tabelas legadas chegam, ela roda de novo. A protecao contra duplicar
         esta nos dados (origem_legada), nao nesta marca — mas a marca ainda
         decide se o passo e tentado. */
      observacao: "limpar ou reavaliar numa restauracao"
    },
    {
      id: "pqq.migrado", chave: "holohacking.pqq.migrado",
      exportar: false, importar: false, limparTudo: true,
      observacao: "limpar ou reavaliar numa restauracao"
    }
  ];

  var CAIXAS_LEGADAS_CONSUMIDAS = [
    {
      id: "ferramentas", chave: "holohacking.ferramentas",
      consumidaPor: "aplicacoes", limparTudo: true,
      observacao: "um registro por ferramenta por paciente, sobrescrito. " +
                  "Ja migrada; perfil.js ainda a limpa no apagar tudo."
    },
    {
      id: "agenda", chave: "holohacking.agenda",
      consumidaPor: "consultas", limparTudo: true,
      observacao: "a data solta da versao anterior. Ja virou consulta."
    }
  ];

  /* ---------- consultas ao manifesto ------------------------------------ */

  function todos() { return STORAGE_MANIFEST.slice(); }

  function porId(id) {
    for (var i = 0; i < STORAGE_MANIFEST.length; i++) {
      if (STORAGE_MANIFEST[i].id === id) return STORAGE_MANIFEST[i];
    }
    return null;
  }

  function filtrar(fn) { return STORAGE_MANIFEST.filter(fn); }

  function exportaveis() { return filtrar(function (e) { return e.exportar; }); }
  function sensiveis() { return filtrar(function (e) { return e.sensivel; }); }
  function porPaciente() { return filtrar(function (e) { return e.pacienteScoped; }); }
  function porForma(f) { return filtrar(function (e) { return e.forma === f; }); }

  /** As tabelas da fachada, na ORDEM DA FACHADA — que nao e a ordem em que o
      manifesto as declara, e nao poderia ser.

      O manifesto lista na ordem da auditoria: T1 pacientes, T2 aplicacoes,
      T3 consultas... A fachada sempre iterou noutra ordem, e essa ordem e
      OBSERVAVEL: ela decide a ordem das chaves em pacote.tabelas, que e o
      JSON que a pessoa baixa no botao de exportar. Derivar a lista na ordem
      do manifesto mudaria esse arquivo — comportamento publico, e esta
      rodada nao muda comportamento nenhum.

      Entao ordemFachada guarda o segundo fato, e ele manda aqui. Quem
      quiser a ordem da auditoria le o array direto. */
  function tabelasDaFachada() {
    return filtrar(function (e) { return e.backend === BACKEND.TABELA; })
      .slice()
      .sort(function (a, b) { return a.ordemFachada - b.ordemFachada; })
      .map(function (e) { return e.id; });
  }

  /* ---------- os tres adaptadores ----------------------------------------
     Uma forma, um adaptador. Todos SOMENTE LEITURA nesta rodada: o que eles
     produzem "sem paciente" e um VALOR NOVO, devolvido a quem chamou. Nada e
     gravado. Quem for escrever isso de volta e o P0.6, e ainda nao existe. */

  function lerLocal(chave, vazio) {
    try {
      var cru = localStorage.getItem(chave);
      if (!cru) return vazio;
      var v = JSON.parse(cru);
      return v == null ? vazio : v;
    } catch (e) {
      return vazio;
    }
  }

  /* --- forma `lista` ---------------------------------------------------- */
  var adaptadorLista = {
    forma: FORMA.LISTA,
    lerTudo: function (entrada) {
      var v = lerLocal(entrada.chave, []);
      return Array.isArray(v) ? v : [];
    },
    /** As linhas de um paciente. Para a tabela raiz, a linha do proprio. */
    doPaciente: function (entrada, pacienteId) {
      var linhas = adaptadorLista.lerTudo(entrada);
      if (entrada.escopo === ESCOPO.RAIZ) {
        return linhas.filter(function (l) { return l.id === pacienteId; });
      }
      if (!entrada.campoPaciente) return [];
      return linhas.filter(function (l) { return l[entrada.campoPaciente] === pacienteId; });
    },
    /** A lista que sobraria se este paciente saisse. Nao grava. */
    semOPaciente: function (entrada, pacienteId) {
      var linhas = adaptadorLista.lerTudo(entrada);
      if (entrada.escopo === ESCOPO.RAIZ) {
        return linhas.filter(function (l) { return l.id !== pacienteId; });
      }
      if (!entrada.campoPaciente) return linhas;
      return linhas.filter(function (l) { return l[entrada.campoPaciente] !== pacienteId; });
    },
    /** Os ids de paciente citados por esta caixa, sem repetir. */
    pacientesCitados: function (entrada) {
      var linhas = adaptadorLista.lerTudo(entrada);
      var campo = entrada.escopo === ESCOPO.RAIZ ? "id" : entrada.campoPaciente;
      if (!campo) return [];
      var vistos = {};
      linhas.forEach(function (l) { if (l[campo] != null) vistos[l[campo]] = true; });
      return Object.keys(vistos);
    }
  };

  /* --- forma `mapaPorPaciente` ------------------------------------------ */
  var adaptadorMapa = {
    forma: FORMA.MAPA,
    lerTudo: function (entrada) {
      var v = lerLocal(entrada.chave, {});
      return (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
    },
    doPaciente: function (entrada, pacienteId) {
      var mapa = adaptadorMapa.lerTudo(entrada);
      return Object.prototype.hasOwnProperty.call(mapa, pacienteId)
        ? mapa[pacienteId] : null;
    },
    semOPaciente: function (entrada, pacienteId) {
      var mapa = adaptadorMapa.lerTudo(entrada);
      var saida = {};
      Object.keys(mapa).forEach(function (k) {
        if (k !== pacienteId) saida[k] = mapa[k];
      });
      return saida;
    },
    pacientesCitados: function (entrada) {
      /* Numa caixa global a chave nao e paciente — e configuracao. */
      if (!entrada.pacienteScoped) return [];
      return Object.keys(adaptadorMapa.lerTudo(entrada));
    }
  };

  /* --- forma `objectStore` ----------------------------------------------
     Assincrono, e so leitura. A remocao real por paciente NAO esta aqui de
     proposito: implementa-la mudaria o comportamento do app, e esta rodada
     nao muda comportamento. O adaptador DESCREVE como se chegaria la
     (`loja`) e sabe identificar as chaves de um paciente — que e o que o
     diagnostico precisa e o que o P0.6 vai usar. */
  var adaptadorLoja = {
    forma: FORMA.LOJA,
    /** Depende de window.ArquivoStore, que e quem abre o banco. */
    disponivel: function () {
      return !!(window.ArquivoStore && window.ArquivoStore.listarTudoEstrito);
    },
    /* ESTRITA de proposito. A versao tolerante devolve [] quando a leitura
       falha, e um diagnostico que confunde "falhou" com "nao ha documento"
       diria que esta tudo certo justamente quando nao esta. Aqui o erro sobe. */
    lerTudo: function () {
      if (!adaptadorLoja.disponivel()) return Promise.resolve([]);
      return window.ArquivoStore.listarTudoEstrito().then(function (itens) {
        return itens || [];
      });
    },
    doPaciente: function (entrada, pacienteId) {
      return adaptadorLoja.lerTudo().then(function (itens) {
        return itens.filter(function (i) {
          return i[entrada.campoPaciente] === pacienteId;
        });
      });
    },
    /** So as chaves — e o que uma transacao futura precisaria. */
    chavesDoPaciente: function (entrada, pacienteId) {
      return adaptadorLoja.doPaciente(entrada, pacienteId).then(function (itens) {
        return itens.map(function (i) { return i[entrada.loja.keyPath]; });
      });
    },
    pacientesCitados: function (entrada) {
      return adaptadorLoja.lerTudo().then(function (itens) {
        var vistos = {};
        itens.forEach(function (i) {
          if (i[entrada.campoPaciente] != null) vistos[i[entrada.campoPaciente]] = true;
        });
        return Object.keys(vistos);
      });
    }
  };

  var ADAPTADORES = {};
  ADAPTADORES[FORMA.LISTA] = adaptadorLista;
  ADAPTADORES[FORMA.MAPA] = adaptadorMapa;
  ADAPTADORES[FORMA.LOJA] = adaptadorLoja;

  function adaptador(entrada) { return ADAPTADORES[entrada.forma] || null; }

  /* ---------- diagnostico -------------------------------------------------
     SOMENTE LEITURA. Nao apaga, nao corrige, nao grava. Varre cada caixa por
     paciente e pergunta: este id existe na raiz? O que nao existe e orfao —
     dado clinico de alguem que ja foi removido do cadastro, ou que veio de um
     import com ids diferentes. O sentinela `_sem_paciente` sai em lista
     propria: ele NAO e orfao, e o deposito legitimo do que foi respondido
     fora de um cadastro. */

  function diagnosticarIntegridade() {
    var raiz = porId("pacientes");
    var vivos = {};
    adaptadorLista.lerTudo(raiz).forEach(function (p) { if (p.id) vivos[p.id] = true; });

    var orfaos = [];
    var semPaciente = [];
    var totais = { pacientes: Object.keys(vivos).length, armazenamentos: {} };

    function registrar(entrada, ids, contar) {
      ids.forEach(function (id) {
        var quantidade = contar(id);
        var linha = { armazenamento: entrada.id, paciente_id: id, quantidade: quantidade };
        if (id === SEM_PACIENTE) semPaciente.push(linha);
        else if (!vivos[id]) orfaos.push(linha);
      });
    }

    porPaciente().forEach(function (entrada) {
      if (entrada.forma === FORMA.LISTA) {
        var linhas = adaptadorLista.lerTudo(entrada);
        totais.armazenamentos[entrada.id] = linhas.length;
        registrar(entrada, adaptadorLista.pacientesCitados(entrada), function (id) {
          return adaptadorLista.doPaciente(entrada, id).length;
        });
      } else if (entrada.forma === FORMA.MAPA) {
        var mapa = adaptadorMapa.lerTudo(entrada);
        var chaves = Object.keys(mapa);
        totais.armazenamentos[entrada.id] = chaves.length;
        registrar(entrada, chaves, function () { return 1; });
      }
      /* A loja e assincrona: entra pelo complemento, abaixo. */
    });

    var base = {
      ok: orfaos.length === 0,
      orfaos: orfaos,
      sem_paciente: semPaciente,
      totais: totais,
      /* Dito em voz alta para que ninguem leia este retorno como uma acao: */
      alterou_dado: false
    };

    var loja = porId("arquivos");
    if (!adaptadorLoja.disponivel()) {
      base.indexeddb = "indisponivel";
      return Promise.resolve(base);
    }
    return adaptadorLoja.lerTudo().then(function (itens) {
      base.totais.armazenamentos[loja.id] = itens.length;
      var porDono = {};
      itens.forEach(function (i) {
        var id = i[loja.campoPaciente];
        if (id == null) return;
        porDono[id] = (porDono[id] || 0) + 1;
      });
      Object.keys(porDono).forEach(function (id) {
        var linha = { armazenamento: loja.id, paciente_id: id, quantidade: porDono[id] };
        if (id === SEM_PACIENTE) base.sem_paciente.push(linha);
        else if (!vivos[id]) base.orfaos.push(linha);
      });
      base.ok = base.orfaos.length === 0;
      return base;
    });
  }

  /* ========================================================================
     BACKUP V2 — a copia completa, verificavel

     O V1 leva 8 dos 13 armazenamentos. Os quatro que ele deixa para tras tem
     dado clinico que ninguem consegue regerar: as respostas, a serie de
     pontuacoes, os exames e os documentos. O V2 leva as 12 entradas que o
     manifesto marca com exportar:true — e le essa lista do manifesto, nao de
     uma segunda lista escrita aqui, que seria a mesma divergencia de novo.

     BACKUP E CAPTURA, NAO TRANSFORMACAO. Nada e recalculado, normalizado,
     migrado, reordenado ou limpo. Se ha dado orfao hoje, ele VAI no pacote:
     e justamente o dado que so o backup pode salvar, ja que nenhuma tela o
     mostra. Quem quiser saber que ele existe le o diagnostico, que viaja no
     pacote como resumo tecnico e nao decide nada.

     Nesta rodada o V2 e SO GERADOR. Nao existe importador, e o botao de
     exportar da interface continua chamando o V1. Gerar e 100% leitura.
     ===================================================================== */

  var FORMATO_BACKUP = "holohacking-backup";
  var VERSAO_BACKUP = 2;

  /* ---------- serializacao canonica ---------------------------------------
     Duas copias do mesmo conteudo tem que produzir o mesmo hash, e a ordem em
     que as propriedades foram escritas num objeto e acidente de implementacao
     — nao e informacao. Entao as chaves saem ordenadas. Arrays NAO sao
     ordenados: neles a ordem e o dado (a serie de pontuacoes e cronologica).
     Primitivas passam como estao, inclusive null, 0, false e "". */
  function canonicalizar(v) {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(canonicalizar);
    var saida = {};
    Object.keys(v).sort().forEach(function (k) { saida[k] = canonicalizar(v[k]); });
    return saida;
  }

  function textoCanonico(v) { return JSON.stringify(canonicalizar(v)); }

  /* ---------- sha-256 -----------------------------------------------------
     crypto.subtle existe em contexto seguro — https e tambem 127.0.0.1, que e
     onde os testes rodam. Se faltar, o pacote sai com o hash nulo e diz por
     que, em vez de sair com um hash falso. */
  function temCrypto() {
    return !!(window.crypto && window.crypto.subtle && window.crypto.subtle.digest);
  }

  function hexDe(buffer) {
    var b = new Uint8Array(buffer), h = "";
    for (var i = 0; i < b.length; i++) h += b[i].toString(16).padStart(2, "0");
    return h;
  }

  function sha256DeBytes(bytes) {
    if (!temCrypto()) return Promise.resolve(null);
    return window.crypto.subtle.digest("SHA-256", bytes).then(hexDe);
  }

  function sha256DeTexto(texto) {
    return sha256DeBytes(new TextEncoder().encode(texto));
  }

  /* ---------- base64 ------------------------------------------------------
     btoa nao aceita uma string enorme de uma vez em todo navegador, e
     String.fromCharCode.apply estoura a pilha com arrays grandes. Em blocos
     nao estoura nem um nem outro. */
  function base64De(buffer) {
    var b = new Uint8Array(buffer), bloco = 0x8000, partes = [];
    for (var i = 0; i < b.length; i += bloco) {
      partes.push(String.fromCharCode.apply(null, b.subarray(i, i + bloco)));
    }
    return btoa(partes.join(""));
  }

  /* ---------- os documentos ----------------------------------------------
     listarTudo() devolve so sete campos de metadado; pegar(id) devolve o
     registro inteiro. E do registro inteiro que se tira o backup, para que um
     campo acrescentado no futuro viaje junto sem ninguem lembrar de vir aqui.
     O blob sai do registro e vira conteudo_base64; todo o resto passa como
     esta. Cada documento leva o SHA-256 dos SEUS bytes, para que uma
     restauracao possa conferir arquivo por arquivo, e nao so o pacote todo. */
  function lerDocumentos() {
    if (!(window.ArquivoStore && window.ArquivoStore.listarTudoEstrito)) {
      return Promise.resolve({ arquivos: [], indisponivel: true, bytes: 0, bytesBase64: 0 });
    }
    /* ESTRITA: nao da para fazer copia de seguranca de uma lista que pode ter
       vindo vazia por engano. Se a leitura falhar, o backup falha — e e muito
       melhor do que um pacote que diz "zero documentos" com alegria. */
    return window.ArquivoStore.listarTudoEstrito().then(function (lista) {
      var ids = (lista || []).map(function (i) { return i.id; });
      return ids.reduce(function (cadeia, id) {
        return cadeia.then(function (acc) {
          return window.ArquivoStore.pegarEstrito(id).then(function (registro) {
            if (!registro) return acc;
            var blob = registro.arquivo;
            if (!blob || typeof blob.arrayBuffer !== "function") {
              /* Registro sem blob: guarda o metadado e diz que o conteudo
                 faltava, em vez de fingir um arquivo vazio. */
              var semBlob = {};
              Object.keys(registro).forEach(function (k) {
                if (k !== "arquivo") semBlob[k] = registro[k];
              });
              semBlob.conteudo_base64 = null;
              semBlob.sha256 = null;
              semBlob.conteudo_ausente = true;
              acc.arquivos.push(semBlob);
              return acc;
            }
            return blob.arrayBuffer().then(function (buffer) {
              return sha256DeBytes(buffer).then(function (sha) {
                var saida = {};
                Object.keys(registro).forEach(function (k) {
                  if (k !== "arquivo") saida[k] = registro[k];
                });
                var b64 = base64De(buffer);
                saida.conteudo_base64 = b64;
                saida.bytes = buffer.byteLength;
                saida.sha256 = sha;
                acc.arquivos.push(saida);
                acc.bytes += buffer.byteLength;
                acc.bytesBase64 += b64.length;
                return acc;
              });
            });
          });
        });
      }, Promise.resolve({ arquivos: [], indisponivel: false, bytes: 0, bytesBase64: 0 }));
    });
    /* Sem catch aqui, de proposito. Havia um que transformava falha de leitura
       em "zero documentos": o backup sairia bonitinho, com um pacote que diz
       que a pessoa nao tem laudo nenhum. Backup que mente sobre o que nao
       conseguiu ler e pior do que backup que falha. Agora falha.

       O caminho "indisponivel" acima continua, e e outra coisa: e o ambiente
       que nao TEM IndexedDB, nao o IndexedDB que deu erro. */
  }

  /* ---------- contagens ---------------------------------------------------
     Derivadas do conteudo que ACABOU de ser montado, nunca do disco de novo:
     contar duas vezes fontes diferentes e como uma restauracao passa sem
     ninguem notar que faltou alguma coisa. Sao numeros tecnicos — nenhum
     deles quer dizer nada de clinica. */
  function contar(conteudo, docs) {
    var c = {};
    Object.keys(conteudo.dados).forEach(function (id) {
      var v = conteudo.dados[id];
      c[id] = Array.isArray(v) ? v.length : Object.keys(v || {}).length;
    });
    c.arquivos = conteudo.arquivos.length;
    c.bytes_documentos = docs.bytes;
    /* A serie de pontuacoes e um array por paciente: o numero de pacientes
       com serie nao diz quantas medidas existem. */
    var pont = conteudo.dados.pontuacao || {};
    c.pontuacoes_total = Object.keys(pont).reduce(function (n, k) {
      return n + (Array.isArray(pont[k]) ? pont[k].length : 1);
    }, 0);
    return c;
  }

  /** Monta o pacote inteiro. Assincrono por causa do IndexedDB e do SHA-256.
      Nao toca no DOM e nao escreve nada — e leitura, do comeco ao fim. */
  function gerarBackupV2() {
    var entradas = exportaveis();
    var conteudo = { dados: {}, arquivos: [] };

    entradas.forEach(function (e) {
      if (e.forma === FORMA.LISTA) {
        conteudo.dados[e.id] = adaptadorLista.lerTudo(e);
      } else if (e.forma === FORMA.MAPA) {
        /* O mapa INTEIRO, chaves orfas incluidas. O exportador nao limpa
           estado inconsistente: o dado orfao e justamente o que so o backup
           alcanca, ja que nenhuma tela o mostra. */
        conteudo.dados[e.id] = adaptadorMapa.lerTudo(e);
      }
      /* A loja entra por lerDocumentos(), abaixo. */
    });

    return lerDocumentos().then(function (docs) {
      conteudo.arquivos = docs.arquivos;
      return diagnosticarIntegridade().then(function (diag) {
        return finalizarPacoteV2(conteudo, docs, diag,
          entradas.map(function (e) { return e.id; }));
      });
    });
  }

  /** Monta o envelope V2 em volta de um conteudo ja pronto.

      Existe separado porque ha DOIS produtores de pacote V2: este modulo,
      lendo o disco, e o conversor de backups V1. Os dois precisam do mesmo
      envelope, do mesmo hash canonico e das mesmas contagens — escrever isso
      duas vezes seria ter duas verdades sobre o que e um Backup V2, e a
      segunda sempre atrasa em relacao a primeira.

      O parametro docs traz os numeros dos documentos ({bytes, bytesBase64,
      indisponivel}); o diag e o diagnostico ja calculado sobre o conteudo que
      vai no pacote — nunca sobre o disco de quem chama. */
  function finalizarPacoteV2(conteudo, docs, diag, armazenamentos) {
    var texto = textoCanonico(conteudo);
    return sha256DeTexto(texto).then(function (sha) {
      var pacote = {
            formato: FORMATO_BACKUP,
            versao: VERSAO_BACKUP,
            criado_em: new Date().toISOString(),
            manifesto_versao: MANIFESTO_VERSAO,
            /* Quais armazenamentos este pacote diz carregar. Uma restauracao
               confere isto contra o manifesto dela antes de tocar em disco. */
            armazenamentos: armazenamentos.slice(),
            integridade: {
              contagens: contar(conteudo, docs),
              sha256_conteudo: sha,
              /* O hash e do campo conteudo serializado canonicamente, e nao
                 do pacote: incluir o proprio hash no que se faz hash nao
                 fecha. Fica dito aqui para quem for conferir do outro lado. */
              algoritmo: "sha256(json-canonico(conteudo))"
              /* sha_indisponivel entra abaixo, e SO quando ha o que dizer:
                 uma chave com valor undefined desaparece no JSON.stringify,
                 mas fica no objeto em memoria — e nao e um valor JSON. */
            },
            /* Resumo TECNICO. Nao impede o export, nao descarta nada, e nao
               carrega informacao clinica: so diz se o estado esta coerente. */
            diagnostico: {
              ok: diag.ok,
              quantidade_orfaos: diag.orfaos.length,
              quantidade_sem_paciente: diag.sem_paciente.length
            },
            /* Numeros para decidirmos DEPOIS se precisa de aviso, limite, zip
               ou export em varios arquivos. Nenhum limiar e imposto aqui:
               inventar um MB de corte seria inventar regra.

               PENDENCIA CONHECIDA — TAMANHO DO PACOTE (R3)
               Desde que o botao Exportar passou a chamar este V2, o que antes
               era medida tecnica virou o backup real, e vale registrar o que
               ja se sabe:

                 · cada documento viaja em base64 dentro do JSON, o que infla
                   o binario em ~33% (4 bytes de texto para cada 3 de dado);
                 · o pacote e montado INTEIRO em memoria — o objeto, depois o
                   texto canonico para o sha256, depois o JSON.stringify final.
                   Chegam a coexistir mais de uma copia do mesmo conteudo;
                 · nao ha limite oficial, nem aqui nem no validador
                   (LIMITE_TECNICO_BYTES e null de proposito, e diz por que);
                 · o app tambem nao impoe limite no upload, entao nao ha teto
                   natural a montante.

               Quem tiver muitos laudos pode chegar a um pacote grande o
               bastante para pesar no navegador. NAO ha numero aqui porque
               nenhum foi medido: o teto entra quando houver uma falha real de
               plataforma para calibra-lo, e nao antes. Ate la, os tres campos
               abaixo sao o que permite medir. */
            tamanho: {
              bytes_documentos_originais: docs.bytes,
              bytes_documentos_base64: docs.bytesBase64,
              bytes_conteudo_json: texto.length
            },
            conteudo: conteudo
          };
          if (sha === null) {
            pacote.integridade.sha_indisponivel = "crypto.subtle ausente";
          }
          if (docs.indisponivel) pacote.integridade.indexeddb = "indisponivel";
          /* O tamanho do pacote inteiro so da para medir depois de monta-lo. */
          pacote.tamanho.bytes_pacote_json = JSON.stringify(pacote).length;
      return pacote;
    });
  }

  /** O pacote como texto. Separado da geracao de proposito: quem so quer
      inspecionar o objeto nao precisa pagar a serializacao. */
  function serializarBackupV2(pacote) {
    return JSON.stringify(pacote, null, 2);
  }

  /** Converte em Blob e pede o download. E o unico ponto deste arquivo que
      toca no documento, e ele NAO TEM CONSUMIDOR nesta rodada: o botao de
      Exportar da interface continua chamando o V1, porque ainda nao existe
      importador V2 e um backup que ninguem sabe restaurar e pior do que um
      backup incompleto — da a sensacao de estar salvo. */
  function baixarBackupV2(pacote) {
    var texto = serializarBackupV2(pacote);
    var blob = new Blob([texto], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "holohacking-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return { bytes: texto.length, nome: a.download };
  }

  /* ---------- a interface publica --------------------------------------- */

  window.Armazenamento = {
    MANIFESTO: STORAGE_MANIFEST,
    MARCAS_DE_MIGRACAO: MARCAS_DE_MIGRACAO,
    CAIXAS_LEGADAS_CONSUMIDAS: CAIXAS_LEGADAS_CONSUMIDAS,
    SEM_PACIENTE: SEM_PACIENTE,
    PREFIXO_TABELA: PREFIXO_TABELA,

    BACKEND: BACKEND,
    FORMA: FORMA,
    CATEGORIA: CATEGORIA,
    ESCOPO: ESCOPO,

    todos: todos,
    porId: porId,
    filtrar: filtrar,
    exportaveis: exportaveis,
    sensiveis: sensiveis,
    porPaciente: porPaciente,
    porForma: porForma,
    tabelasDaFachada: tabelasDaFachada,

    adaptador: adaptador,
    adaptadores: ADAPTADORES,

    diagnosticarIntegridade: diagnosticarIntegridade,

    MANIFESTO_VERSAO: MANIFESTO_VERSAO,
    FORMATO_BACKUP: FORMATO_BACKUP,
    VERSAO_BACKUP: VERSAO_BACKUP,
    gerarBackupV2: gerarBackupV2,
    finalizarPacoteV2: finalizarPacoteV2,
    contarConteudo: contar,
    serializarBackupV2: serializarBackupV2,
    baixarBackupV2: baixarBackupV2,
    canonicalizar: canonicalizar,
    textoCanonico: textoCanonico,
    sha256DeTexto: sha256DeTexto
  };
})();
