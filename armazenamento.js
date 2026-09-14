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
      return !!(window.ArquivoStore && window.ArquivoStore.listarTudo);
    },
    lerTudo: function () {
      if (!adaptadorLoja.disponivel()) return Promise.resolve([]);
      return window.ArquivoStore.listarTudo().then(function (itens) {
        return itens || [];
      }, function () { return []; });
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

    diagnosticarIntegridade: diagnosticarIntegridade
  };
})();
