/* ============================================================================
   BACKUP V1 — restaurar um formato que nunca guardou tudo.

   O V1 e o que `DadosLocais.exportar()` produz: as 8 tabelas da fachada, e
   so isso. Ele NUNCA guardou o questionario, a serie de pontuacoes, os exames
   nem os documentos — nao e que a pessoa nao tivesse esses dados; e que o
   formato nao os levava. Foi esse buraco que o P0.3 fechou com o V2.

   ---------------------------------------------------------------------------
   A DECISAO QUE DEFINE ESTA ETAPA
   ---------------------------------------------------------------------------

   Ha um jeito obvio e errado de importar um V1: escrever as 8 tabelas e
   deixar questionario, exames e documentos como estao. Ele parece
   conservador — "nao mexi no que o backup nao trazia" — e produz exatamente
   o defeito que o P0.1 documentou: ESTADO HIBRIDO. Os cadastros passam a ser
   os do backup; as respostas continuam sendo as da instalacao. Cada resposta
   fica pendurada num paciente que talvez nem exista mais, e nenhuma tela
   mostra isso.

   Entao o unico modo oferecido aqui e a SUBSTITUICAO LIMPA:

       8 tabelas  ->  vem do V1
       questionario, pontuacao, exames, arquivos  ->  vazios
       aparencia  ->  fica local, como sempre

   E preciso dizer com clareza o que esse vazio significa, porque e facil ler
   errado: ele NAO quer dizer que o V1 afirmou "nao havia exames". Quer dizer
   que o formato nunca carregou exames, e que preservar os da instalacao atual
   seria fingir que pertenciam ao backup. Vazio aqui e honestidade sobre o
   limite do formato, nao dado inventado.

   Por isso o nome, em todo lugar: BACKUP PARCIAL LEGADO. Nunca "completo".

   ---------------------------------------------------------------------------
   E NAO HA UM SEGUNDO MOTOR DE RESTAURACAO
   ---------------------------------------------------------------------------

   Este arquivo valida, planeja e CONVERTE. Quem escreve e o P0.4b:

       V1 -> validar -> planejar -> confirmar a perda -> converter para um
       alvo V2 limpo -> validar esse V2 -> aplicarBackupV2()

   Dali em diante, snapshot, ordem de escrita, verificacao por hash, rollback,
   recuperacao pos-crash e exclusividade entre abas sao os mesmos, ja testados.
   Escrever um caminho proprio para o V1 seria manter dois motores, e o
   segundo nunca recebe as correcoes do primeiro.
   ========================================================================== */

(function () {
  "use strict";

  var A = window.Armazenamento;
  if (!A) return;

  /* Os quatro grupos que o formato V1 nunca carregou. Nao e lista de opiniao:
     e o complemento das 8 tabelas dentro dos 12 exportaveis do manifesto. */
  function gruposAusentesNoV1() {
    var naFachada = {};
    A.tabelasDaFachada().forEach(function (id) { naFachada[id] = true; });
    return A.exportaveis()
      .map(function (e) { return e.id; })
      .filter(function (id) { return !naFachada[id]; });
  }

  /* ---------- validacao ---------------------------------------------------
     Deliberadamente mais curta que a do V2, porque o V1 tem menos a conferir:
     nao ha hash, nem contagens, nem documentos, nem manifesto declarado. O que
     da para cobrar e a forma. */

  var CHAVES_PERIGOSAS = A.CHAVES_PERIGOSAS ||
                         ["__proto__", "prototype", "constructor"];
  var PROFUNDIDADE_MAXIMA = 64;
  var ID_MAXIMO = 512;

  function tipoDe(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v;
  }
  function objetoSimples(v) {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
    var p = Object.getPrototypeOf(v);
    return p === Object.prototype || p === null;
  }
  function ehISO(s) {
    return typeof s === "string" &&
      /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(s) &&
      !isNaN(new Date(s).getTime());
  }
  function achado(sev, codigo, caminho, mensagem, extra) {
    var o = { severidade: sev, codigo: codigo, caminho: caminho, mensagem: mensagem };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }

  /** Varredura iterativa — recursao estoura a pilha justamente no JSON feito
      para estourar a pilha. Colhe chave perigosa, valor nao-JSON e
      profundidade. */
  function varrer(raiz, erros) {
    var pilha = [{ v: raiz, caminho: "", nivel: 0 }];
    var vistos = new Set();
    var estourou = false;
    while (pilha.length) {
      var at = pilha.pop();
      var v = at.v;
      if (at.nivel > PROFUNDIDADE_MAXIMA) {
        if (!estourou) {
          estourou = true;
          erros.push(achado("erro", "ANINHAMENTO_EXCESSIVO", at.caminho,
            "aninhamento passa de " + PROFUNDIDADE_MAXIMA + " niveis"));
        }
        continue;
      }
      if (v === null || typeof v !== "object") {
        if (typeof v === "number" && !isFinite(v)) {
          erros.push(achado("erro", "VALOR_NAO_JSON", at.caminho,
            "numero nao finito nao sobrevive a JSON"));
        }
        continue;
      }
      if (vistos.has(v)) {
        erros.push(achado("erro", "REFERENCIA_CICLICA", at.caminho, "ha um ciclo"));
        continue;
      }
      vistos.add(v);
      if (!Array.isArray(v) && !objetoSimples(v)) {
        erros.push(achado("erro", "VALOR_NAO_JSON", at.caminho,
          "objeto nao-simples: backup e JSON, nao Date/Map/Set/funcao"));
        continue;
      }
      if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) {
          pilha.push({ v: v[i], caminho: at.caminho + "[" + i + "]", nivel: at.nivel + 1 });
        }
        continue;
      }
      var chaves = Object.getOwnPropertyNames(v);
      for (var k = 0; k < chaves.length; k++) {
        if (CHAVES_PERIGOSAS.indexOf(chaves[k]) >= 0) {
          erros.push(achado("erro", "CHAVE_PERIGOSA", at.caminho + "." + chaves[k],
            'chave "' + chaves[k] + '" pode poluir prototipo na aplicacao',
            { chave: chaves[k] }));
          continue;
        }
        pilha.push({ v: v[chaves[k]], caminho: at.caminho + "." + chaves[k],
                     nivel: at.nivel + 1 });
      }
    }
  }

  /** As tabelas que um V1 deve ter sao as MESMAS que a fachada exporta. A
      lista sai do manifesto, nunca escrita a mao aqui: seria a terceira copia
      da mesma lista, e a terceira e sempre a que diverge. */
  function tabelasEsperadas() { return A.tabelasDaFachada(); }

  function validarBackupV1(pacote) {
    var erros = [];
    var avisos = [];
    var resumo = { linhas: {}, campos_vistos: {} };

    if (pacote === null || typeof pacote !== "object" || Array.isArray(pacote)) {
      erros.push(achado("erro", "FORMATO_NAO_RECONHECIDO", "",
        "a raiz nao e um objeto (" + tipoDe(pacote) + ")"));
      return { valido: false, tipo: "desconhecido", erros: erros, avisos: avisos, resumo: resumo };
    }
    if (pacote.formato !== undefined) {
      erros.push(achado("erro", "NAO_E_V1", "formato",
        "este pacote tem discriminador `formato` — nao e um V1, e um V2 ou " +
        "outra coisa. Use validarBackupV2()."));
      return { valido: false, tipo: "desconhecido", erros: erros, avisos: avisos, resumo: resumo };
    }
    if (pacote.versao !== 1) {
      erros.push(achado("erro",
        typeof pacote.versao === "number" ? "VERSAO_INVALIDA" : "CAMPO_TIPO_INVALIDO",
        "versao",
        'esperado o numero 1, veio ' + JSON.stringify(pacote.versao) +
        (typeof pacote.versao === "string" ? ' — "1" nao e 1' : ""),
        { recebido: pacote.versao }));
    }
    if (!objetoSimples(pacote.tabelas)) {
      erros.push(achado("erro", "TABELAS_AUSENTES", "tabelas",
        "esperado objeto de tabelas, veio " + tipoDe(pacote.tabelas)));
      return { valido: false, tipo: "v1_legado", erros: erros, avisos: avisos, resumo: resumo };
    }
    if (pacote.quando !== undefined && !ehISO(pacote.quando)) {
      /* `quando` e informativo no V1 e nunca foi obrigatorio: aviso, nao erro */
      avisos.push(achado("aviso", "QUANDO_INVALIDO", "quando",
        "nao e um timestamp ISO: " + JSON.stringify(pacote.quando)));
    }

    /* campos extras NO ENVELOPE: o V1 e um formato antigo e fechado, e campo
       que ninguem escreveu ali nao tem de onde ter vindo. Aviso forte, nao
       erro, porque recusar um backup legitimo por causa de um campo a mais
       seria pior do que aceita-lo ignorando o campo. */
    Object.keys(pacote).forEach(function (k) {
      if (["versao", "quando", "tabelas"].indexOf(k) === -1) {
        avisos.push(achado("aviso", "CAMPO_DESCONHECIDO_ENVELOPE", k,
          "o envelope V1 nao define este campo; ele sera ignorado na conversao"));
      }
    });

    varrer(pacote, erros);

    var esperadas = tabelasEsperadas();
    var presentes = Object.keys(pacote.tabelas);

    esperadas.forEach(function (t) {
      if (presentes.indexOf(t) === -1) {
        erros.push(achado("erro", "TABELA_FALTANDO", "tabelas." + t,
          'a tabela "' + t + '" nao esta no pacote', { tabela: t }));
      }
    });
    presentes.forEach(function (t) {
      if (esperadas.indexOf(t) === -1) {
        erros.push(achado("erro", "TABELA_DESCONHECIDA", "tabelas." + t,
          '"' + t + '" nao e uma tabela deste app', { tabela: t }));
      }
    });

    esperadas.forEach(function (t) {
      var v = pacote.tabelas[t];
      if (v === undefined) return;
      if (!Array.isArray(v)) {
        erros.push(achado("erro", "TABELA_NAO_E_ARRAY", "tabelas." + t,
          "toda tabela do V1 e um array, veio " + tipoDe(v),
          { tabela: t, recebido: tipoDe(v) }));
        return;
      }
      resumo.linhas[t] = v.length;
      v.forEach(function (linha, i) {
        var caminho = "tabelas." + t + "[" + i + "]";
        if (!objetoSimples(linha)) {
          erros.push(achado("erro", "REGISTRO_INVALIDO", caminho,
            "linha deveria ser objeto, veio " + tipoDe(linha)));
          return;
        }
        if (typeof linha.id !== "string" || !linha.id ||
            linha.id.length > ID_MAXIMO ||
            /[\u0000-\u001F\u007F]/.test(linha.id)) {
          erros.push(achado("erro", "ID_INVALIDO", caminho + ".id",
            "id improprio: " + JSON.stringify(
              typeof linha.id === "string" ? linha.id.slice(0, 40) : linha.id)));
        }
        /* Campos desconhecidos DENTRO das linhas passam inteiros: sao dado
           clinico historico, e reescrever o schema de um registro antigo e
           perder o que ele guardava. Ficam listados, para dar para olhar. */
        Object.keys(linha).forEach(function (c) {
          resumo.campos_vistos[t] = resumo.campos_vistos[t] || {};
          resumo.campos_vistos[t][c] = (resumo.campos_vistos[t][c] || 0) + 1;
        });
      });
    });

    /* referencias: orfao NAO invalida — mesma filosofia do V2 */
    if (Array.isArray(pacote.tabelas.pacientes)) {
      var vivos = {};
      pacote.tabelas.pacientes.forEach(function (p) {
        if (p && typeof p.id === "string") vivos[p.id] = true;
      });
      A.exportaveis().forEach(function (e) {
        if (e.escopo !== A.ESCOPO.CAMPO) return;
        var linhas = pacote.tabelas[e.id];
        if (!Array.isArray(linhas)) return;
        var por = {};
        linhas.forEach(function (l) {
          if (!objetoSimples(l)) return;
          var pid = l[e.campoPaciente];
          if (typeof pid !== "string") return;
          por[pid] = (por[pid] || 0) + 1;
        });
        Object.keys(por).forEach(function (pid) {
          if (pid === A.SEM_PACIENTE) {
            avisos.push(achado("aviso", "SEM_PACIENTE_PRESERVADO", "tabelas." + e.id,
              "deposito do que foi respondido fora de um cadastro: " +
              por[pid] + " registro(s)", { armazenamento: e.id, quantidade: por[pid] }));
          } else if (!vivos[pid]) {
            avisos.push(achado("aviso", "ORFAO_PRESERVADO", "tabelas." + e.id,
              'dado de "' + pid + '", que nao existe em tabelas.pacientes: ' +
              por[pid] + " registro(s). Nao inventamos o paciente e nao " +
              "descartamos o dado — ele viaja e o diagnostico acusa",
              { armazenamento: e.id, paciente_id: pid, quantidade: por[pid] }));
          }
        });
      });
    }

    return {
      valido: erros.length === 0,
      tipo: "v1_legado",
      erros: erros,
      avisos: avisos,
      resumo: resumo
    };
  }

  /* ---------- o plano ------------------------------------------------------
     Nao escreve nada. Existe para que a decisao de perder quatro grupos de
     dados seja tomada por alguem que os viu listados. */

  function planejarImportacaoV1(pacote) {
    var v = validarBackupV1(pacote);
    var ausentes = gruposAusentesNoV1();
    var tabelas = tabelasEsperadas();

    return {
      tipo: "v1_legado",
      valido: v.valido,
      modo_seguro: "substituicao_limpa",
      /* dito no nome, para nao virar "restaurei o backup" numa conversa */
      rotulo: "BACKUP PARCIAL LEGADO",

      restaura: tabelas.slice(),
      linhas: v.resumo.linhas,
      pacientes: (v.resumo.linhas || {}).pacientes || 0,
      aplicacoes: (v.resumo.linhas || {}).aplicacoes || 0,
      consultas: (v.resumo.linhas || {}).consultas || 0,

      /* Estes quatro NAO existem no formato. Serao esvaziados — e o motivo
         importa: nao e que o V1 tenha dito "nao ha exames", e sim que ele
         nunca carregou exames. Manter os locais seria fingir que pertenciam
         ao backup, e isso e o estado hibrido que o P0.1 documentou. */
      limpa_por_ausencia_no_formato: ausentes.slice(),

      preserva_local: ["aparencia"],

      perdas_conhecidas: ausentes.map(function (id) {
        var e = A.porId(id);
        return {
          armazenamento: id,
          porque: "o formato V1 nunca guardou este dado",
          o_que_se_perde: e ? e.descricao : null
        };
      }),

      exige_confirmacao: true,
      confirmacao: "confirmarRestauracaoParcial",

      erros: v.erros,
      avisos: v.avisos,
      resumo: v.resumo
    };
  }

  /* ---------- conversao ----------------------------------------------------
     Produz um pacote V2 de verdade — que passa no proprio validarBackupV2 —
     usando o MESMO envelope, hash e contagens do gerador do disco. */

  function converterV1ParaV2Limpo(pacoteV1) {
    var v = validarBackupV1(pacoteV1);
    if (!v.valido) {
      return Promise.resolve({ ok: false, erros: v.erros, avisos: v.avisos });
    }

    var conteudo = { dados: {}, arquivos: [] };
    tabelasEsperadas().forEach(function (t) {
      /* as linhas passam como vieram: nada e recalculado, normalizado nem
         migrado — um backup e captura, e um backup antigo tambem */
      conteudo.dados[t] = pacoteV1.tabelas[t];
    });
    gruposAusentesNoV1().forEach(function (id) {
      if (id === "arquivos") return;        /* a loja entra em conteudo.arquivos */
      var e = A.porId(id);
      conteudo.dados[id] = (e && e.forma === A.FORMA.LISTA) ? [] : {};
    });
    /* conteudo.arquivos ja e [] */

    var docs = { bytes: 0, bytesBase64: 0, indisponivel: false };
    var diag = A.diagnosticarConteudo(conteudo);
    var armazenamentos = A.exportaveis().map(function (e) { return e.id; });

    return A.finalizarPacoteV2(conteudo, docs, diag, armazenamentos)
      .then(function (pacote) {
        return { ok: true, pacote: pacote, avisos: v.avisos };
      });
  }

  /* ---------- aplicar ------------------------------------------------------ */

  function aplicarBackupV1(pacoteV1, opcoes) {
    opcoes = opcoes || {};
    var plano = planejarImportacaoV1(pacoteV1);

    if (!plano.valido) {
      return Promise.resolve({
        tipo_origem: "v1_legado", aplicado: false, escreveu: false,
        motivo: "PACOTE_V1_INVALIDO", plano: plano, erros: plano.erros
      });
    }

    /* A API se protege sozinha. Confiar so na futura UI seria deixar a
       decisao de apagar quatro grupos de dados clinicos depender de alguem
       lembrar de perguntar. */
    if (opcoes.confirmarRestauracaoParcial !== true) {
      return Promise.resolve({
        tipo_origem: "v1_legado", aplicado: false, escreveu: false,
        motivo: "CONFIRMACAO_RESTAURACAO_PARCIAL_OBRIGATORIA",
        mensagem: "este backup nao contem " +
                  plano.limpa_por_ausencia_no_formato.join(", ") +
                  ". Restaurar limpa esses quatro grupos. Chame de novo com " +
                  "{ confirmarRestauracaoParcial: true } depois de mostrar " +
                  "isso a quem decide.",
        plano: plano, erros: []
      });
    }

    return converterV1ParaV2Limpo(pacoteV1).then(function (c) {
      if (!c.ok) {
        return {
          tipo_origem: "v1_legado", aplicado: false, escreveu: false,
          motivo: "CONVERSAO_FALHOU", plano: plano, erros: c.erros
        };
      }
      /* Daqui em diante e o P0.4b inteiro: validacao V2, exclusividade,
         snapshot, ordem de escrita, verificacao por hash, rollback e
         recuperacao pos-crash. Nao ha um segundo motor. */
      return A.aplicarBackupV2(c.pacote, opcoes).then(function (r) {
        r.tipo_origem = "v1_legado";
        r.restauracao_parcial = true;
        r.modo = "substituicao_limpa";
        r.rotulo = "BACKUP PARCIAL LEGADO";
        r.restaurados = plano.restaura.slice();
        r.vazios_por_ausencia_no_formato = plano.limpa_por_ausencia_no_formato.slice();
        r.preservado_local = plano.preserva_local.slice();
        r.perdas_conhecidas = plano.perdas_conhecidas;
        r.avisos = (r.avisos || []).concat(plano.avisos, c.avisos || []);
        r.exclusividade = window.Concorrencia
          ? (window.Concorrencia.temWebLocks() ? "web_locks" : "indisponivel")
          : "modulo_ausente";
        return r;
      });
    });
  }

  A.validarBackupV1 = validarBackupV1;
  A.planejarImportacaoV1 = planejarImportacaoV1;
  A.converterV1ParaV2Limpo = converterV1ParaV2Limpo;
  A.aplicarBackupV1 = aplicarBackupV1;
  A.gruposAusentesNoV1 = gruposAusentesNoV1;
})();
