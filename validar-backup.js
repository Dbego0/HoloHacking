/* ============================================================================
   VALIDAR BACKUP — ler um pacote de fora e dizer se daria para restaurar.

   Este arquivo RESPONDE UMA PERGUNTA e nao faz mais nada:

     "este pacote e estruturalmente valido, e seria seguro tentar restaurar?"

   Ele nao escreve em localStorage, nao escreve no IndexedDB, nao toca no DOM,
   nao muda estado global e nao importa nada. Validacao e APLICACAO sao coisas
   separadas: a aplicacao vive em restaurar-backup.js e chama ESTE validador
   antes de escrever o primeiro byte. "Nao importa nada" e sobre esta funcao,
   nunca sobre o app.

   POR QUE SEPARAR
     Um importador que valida enquanto escreve ja escreveu metade quando
     descobre o problema. Separar deixa o "descobrir" inteiro acontecer antes
     do primeiro byte — e e o que permite o dry-run: dizer o que ACONTECERIA
     sem que nada aconteca.

   O QUE ELE NAO CONFIA
     Nada do que o pacote afirma sobre si mesmo. O hash e recalculado, as
     contagens sao recalculadas, o diagnostico e recalculado sobre o conteudo
     do PACOTE (nunca sobre o disco local). Um pacote que mente sobre as
     proprias contagens e exatamente o caso que precisa ser pego.

   O QUE ELE NAO E
     Nao e um schema clinico. Ele nao sabe o que e um marcador, um score ou
     uma ferramenta, e nao opina sobre conteudo: valida o suficiente para uma
     restauracao ser segura, e para em texto livre.
   ========================================================================== */

(function () {
  "use strict";

  var A = window.Armazenamento;
  if (!A) return;

  /* Versoes de manifesto que este validador entende. Uma lista, nao um
     ">=": aceitar um numero maior do que qualquer coisa que ja exista e
     aceitar um formato que ninguem escreveu ainda. */
  var MANIFESTO_SUPORTADOS = [1];

  /* Chaves que nunca podem aparecer num pacote vindo de fora, em profundidade
     nenhuma. JSON.parse define __proto__ como propriedade PROPRIA (nao mexe no
     prototipo), entao Object.keys as enxerga — e e por isso que a varredura
     funciona. Quem for aplicar o pacote depois pode estar usando Object.assign
     ou spread, e ai a chave deixa de ser inofensiva. */
  var CHAVES_PERIGOSAS = ["__proto__", "prototype", "constructor"];

  /* Profundidade maxima de aninhamento. Nao e limite de tamanho: e protecao
     contra um JSON montado para estourar a pilha. O dado real do app tem
     profundidade de um digito. */
  var PROFUNDIDADE_MAXIMA = 64;

  /* Comprimento acima do qual uma string usada como IDENTIFICADOR deixa de ser
     plausivel. Os ids reais deste repositorio sao UUID (36), o fallback
     "id-<base36>-<base36>" (~20), "arq-<ms>-<hash>" (~25) e o sentinela
     "_sem_paciente" (13). 512 nao invalida nenhum deles nem os ids arbitrarios
     de um pacote de terceiro — so barra o absurdo. NAO ha padrao imposto:
     impor UUID invalidaria backup legitimo antigo. */
  var ID_MAXIMO = 512;

  /* Teto tecnico do pacote. NULO de proposito: nao ha base para escolher um
     numero, e um "maximo 10 MB" inventado agora rejeitaria backup legitimo de
     quem tem muitos laudos. O tamanho e MEDIDO e reportado; quando houver
     evidencia (uma falha real de plataforma), este e o lugar de por o teto. */
  var LIMITE_TECNICO_BYTES = null;

  /* Campos do envelope V2. Desconhecido aqui e ERRO: o envelope e nosso e
     esta inteiramente especificado, entao campo que ninguem escreveu ou e
     contrabando ou e de uma versao que este validador nao entende — e
     "versao que nao entendo" ja tem codigo proprio. */
  var CAMPOS_ENVELOPE = {
    formato: "string", versao: "number", criado_em: "string",
    manifesto_versao: "number", armazenamentos: "array",
    integridade: "object", diagnostico: "object", tamanho: "object",
    conteudo: "object"
  };

  /* ---------- o coletor ---------------------------------------------------
     Erros e avisos saem com codigo ESTAVEL (da para programar em cima),
     caminho (da para achar), mensagem tecnica (da para ler) e severidade. */

  function Coletor() {
    this.erros = [];
    this.avisos = [];
  }
  Coletor.prototype.erro = function (codigo, caminho, mensagem, extra) {
    this.erros.push(montar("erro", codigo, caminho, mensagem, extra));
  };
  Coletor.prototype.aviso = function (codigo, caminho, mensagem, extra) {
    this.avisos.push(montar("aviso", codigo, caminho, mensagem, extra));
  };
  function montar(severidade, codigo, caminho, mensagem, extra) {
    var o = { severidade: severidade, codigo: codigo, caminho: caminho,
              mensagem: mensagem };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }

  /* ---------- utilitarios de tipo ---------------------------------------- */

  function tipoDe(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v;
  }

  /** Objeto simples, vindo de JSON — nao Date, Map, Set, funcao ou classe. */
  function objetoSimples(v) {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
    var proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  }

  /** So o que sobrevive a uma ida e volta por JSON. */
  function valorJSON(v) {
    var t = typeof v;
    if (v === null || t === "string" || t === "boolean") return true;
    if (t === "number") return isFinite(v);
    if (Array.isArray(v)) return true;
    return objetoSimples(v);
  }

  function ehISO(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(s)) {
      return false;
    }
    var d = new Date(s);
    return !isNaN(d.getTime());
  }

  /** Identificador plausivel — sem impor formato, so barrando o improprio. */
  function idPlausivel(v) {
    if (typeof v !== "string") return { ok: false, porque: "nao e string" };
    if (v.length === 0) return { ok: false, porque: "string vazia" };
    if (v.length > ID_MAXIMO) {
      return { ok: false, porque: "comprimento absurdo (" + v.length + ")" };
    }
    /* Caracteres de controle quebram chave de localStorage, nome de arquivo e
       comparacao — sao risco tecnico, nao estetica. */
    if (/[\u0000-\u001F\u007F]/.test(v)) {
      return { ok: false, porque: "contem caractere de controle" };
    }
    return { ok: true };
  }

  /* ---------- varredura recursiva ----------------------------------------
     Uma passada so, iterativa (recursao estoura a pilha justamente no JSON
     que foi feito para estourar a pilha), colhendo tres coisas: chave
     perigosa, valor que nao e JSON, e profundidade excessiva. */

  function varrer(raiz, caminhoRaiz, c) {
    var pilha = [{ v: raiz, caminho: caminhoRaiz, nivel: 0 }];
    var vistos = new Set();
    var estourou = false;

    while (pilha.length) {
      var atual = pilha.pop();
      var v = atual.v;

      if (atual.nivel > PROFUNDIDADE_MAXIMA) {
        if (!estourou) {
          estourou = true;
          c.erro("ANINHAMENTO_EXCESSIVO", atual.caminho,
                 "aninhamento passa de " + PROFUNDIDADE_MAXIMA + " niveis");
        }
        continue;
      }
      if (v === null || typeof v !== "object") {
        if (!valorJSON(v)) {
          c.erro("VALOR_NAO_JSON", atual.caminho,
                 "valor de tipo " + tipoDe(v) + " nao sobrevive a JSON");
        }
        continue;
      }
      /* ciclo: JSON nao tem, mas um objeto passado direto pode ter */
      if (vistos.has(v)) {
        c.erro("REFERENCIA_CICLICA", atual.caminho, "o pacote tem um ciclo");
        continue;
      }
      vistos.add(v);

      if (!Array.isArray(v) && !objetoSimples(v)) {
        c.erro("VALOR_NAO_JSON", atual.caminho,
               "objeto nao-simples (" +
               (Object.getPrototypeOf(v) && Object.getPrototypeOf(v).constructor
                 ? Object.getPrototypeOf(v).constructor.name : "?") +
               "): backup e JSON, nao Date/Map/Set/funcao");
        continue;
      }

      if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) {
          pilha.push({ v: v[i], caminho: atual.caminho + "[" + i + "]",
                       nivel: atual.nivel + 1 });
        }
        continue;
      }

      var chaves = Object.getOwnPropertyNames(v);
      for (var k = 0; k < chaves.length; k++) {
        var chave = chaves[k];
        if (CHAVES_PERIGOSAS.indexOf(chave) >= 0) {
          c.erro("CHAVE_PERIGOSA", atual.caminho + "." + chave,
                 'chave "' + chave + '" pode poluir prototipo na aplicacao',
                 { chave: chave });
          continue;   /* nao desce nela */
        }
        pilha.push({ v: v[chave], caminho: atual.caminho + "." + chave,
                     nivel: atual.nivel + 1 });
      }
    }
  }

  /* ---------- reconhecimento ---------------------------------------------
     Antes de validar, dizer QUE COISA e isto. O V1 nao e um erro: e um
     formato anterior, legitimo, que esta etapa so reconhece — converter e
     P0.5. Tratar V1 como "JSON qualquer" faria a tela dizer a coisa errada
     para quem tem um backup de verdade na mao. */

  function reconhecer(pacote) {
    if (pacote === null || typeof pacote !== "object" || Array.isArray(pacote)) {
      return { tipo: "desconhecido",
               porque: "a raiz nao e um objeto (" + tipoDe(pacote) + ")" };
    }
    if (pacote.formato === A.FORMATO_BACKUP) {
      return { tipo: "v2", porque: "discriminador `formato` presente" };
    }
    /* V1: nao tem discriminador nenhum. E reconhecido pela forma — versao 1 e
       um objeto `tabelas`. E frouxo de proposito: e assim que ele e. */
    if (pacote.versao === 1 && objetoSimples(pacote.tabelas)) {
      return { tipo: "v1_legado",
               porque: "versao 1 com `tabelas`, sem discriminador `formato`" };
    }
    if (pacote.formato !== undefined) {
      return { tipo: "desconhecido",
               porque: 'formato "' + String(pacote.formato) + '" nao e deste app' };
    }
    return { tipo: "desconhecido",
             porque: "sem discriminador `formato` e sem a forma do V1" };
  }

  /* ---------- envelope --------------------------------------------------- */

  function validarEnvelope(pacote, c) {
    Object.keys(CAMPOS_ENVELOPE).forEach(function (campo) {
      var esperado = CAMPOS_ENVELOPE[campo];
      if (!Object.prototype.hasOwnProperty.call(pacote, campo)) {
        c.erro("CAMPO_AUSENTE", "" + campo, "campo obrigatorio do envelope");
        return;
      }
      var t = tipoDe(pacote[campo]);
      if (t !== esperado) {
        /* Sem coercao silenciosa: "2" nao e 2, e um pacote que traz string
           onde devia trazer numero e um pacote gerado por outra coisa. */
        c.erro("CAMPO_TIPO_INVALIDO", "" + campo,
               "esperado " + esperado + ", veio " + t,
               { esperado: esperado, recebido: t });
      }
    });

    Object.keys(pacote).forEach(function (campo) {
      if (!Object.prototype.hasOwnProperty.call(CAMPOS_ENVELOPE, campo)) {
        c.erro("CAMPO_DESCONHECIDO_ENVELOPE", "" + campo,
               "campo que o envelope V2 nao define");
      }
    });

    if (pacote.versao !== undefined && typeof pacote.versao === "number") {
      if (!Number.isInteger(pacote.versao)) {
        c.erro("VERSAO_INVALIDA", "versao", "versao nao e inteiro");
      } else if (pacote.versao !== A.VERSAO_BACKUP) {
        c.erro(pacote.versao > A.VERSAO_BACKUP ? "VERSAO_FUTURA" : "VERSAO_ANTIGA",
               "versao",
               "este app le a versao " + A.VERSAO_BACKUP + ", o pacote diz " +
               pacote.versao, { recebida: pacote.versao, suportada: A.VERSAO_BACKUP });
      }
    }

    if (typeof pacote.manifesto_versao === "number") {
      if (MANIFESTO_SUPORTADOS.indexOf(pacote.manifesto_versao) === -1) {
        c.erro("MANIFESTO_VERSAO_NAO_SUPORTADA", "manifesto_versao",
               "manifesto " + pacote.manifesto_versao + " fora das versoes que " +
               "este validador entende (" + MANIFESTO_SUPORTADOS.join(", ") + ")",
               { recebida: pacote.manifesto_versao,
                 suportadas: MANIFESTO_SUPORTADOS.slice() });
      }
    }

    if (pacote.criado_em !== undefined && !ehISO(pacote.criado_em)) {
      c.erro("CRIADO_EM_INVALIDO", "criado_em",
             "nao e um timestamp ISO valido: " + JSON.stringify(pacote.criado_em));
    }

    if (objetoSimples(pacote.conteudo)) {
      if (!objetoSimples(pacote.conteudo.dados)) {
        c.erro("CAMPO_TIPO_INVALIDO", "conteudo.dados",
               "esperado objeto, veio " + tipoDe(pacote.conteudo.dados));
      }
      if (!Array.isArray(pacote.conteudo.arquivos)) {
        c.erro("CAMPO_TIPO_INVALIDO", "conteudo.arquivos",
               "esperado array, veio " + tipoDe(pacote.conteudo.arquivos));
      }
    }
  }

  /* ---------- armazenamentos: a consistencia dos tres lados ---------------
     manifesto exportavel  <->  o que o pacote DECLARA  <->  o que ele TRAZ.
     Dizer que traz "arquivos" sem `conteudo.arquivos` e tao errado quanto
     trazer uma caixa que nao declarou. */

  function validarArmazenamentos(pacote, c) {
    var esperados = A.exportaveis().map(function (e) { return e.id; });
    var declarados = Array.isArray(pacote.armazenamentos) ? pacote.armazenamentos : [];
    var conteudo = objetoSimples(pacote.conteudo) ? pacote.conteudo : { dados: {}, arquivos: null };
    var dados = objetoSimples(conteudo.dados) ? conteudo.dados : {};

    var vistos = {};
    declarados.forEach(function (id, i) {
      if (typeof id !== "string") {
        c.erro("ARMAZENAMENTO_ID_INVALIDO", "armazenamentos[" + i + "]",
               "id nao e string: " + tipoDe(id));
        return;
      }
      if (vistos[id]) {
        c.erro("ARMAZENAMENTO_DUPLICADO", "armazenamentos[" + i + "]",
               'armazenamento "' + id + '" declarado mais de uma vez', { id: id });
        return;
      }
      vistos[id] = true;
      if (esperados.indexOf(id) === -1) {
        var entrada = A.porId(id);
        if (entrada && !entrada.exportar) {
          /* aparencia e o caso real: existe no manifesto e NAO deve viajar */
          c.erro("ARMAZENAMENTO_PROIBIDO", "armazenamentos[" + i + "]",
                 '"' + id + '" existe no manifesto mas nao e exportavel', { id: id });
        } else {
          c.erro("ARMAZENAMENTO_DESCONHECIDO", "armazenamentos[" + i + "]",
                 '"' + id + '" nao esta no manifesto deste app', { id: id });
        }
      }
    });

    /* A ORDEM nao e requisito: comparar como conjunto. Fazer da ordem um
       requisito acidental do formato quebraria um pacote semanticamente
       identico so por ter sido montado noutra sequencia. */
    esperados.forEach(function (id) {
      if (!vistos[id]) {
        c.erro("ARMAZENAMENTO_FALTANDO", "armazenamentos",
               '"' + id + '" e exportavel no manifesto e o pacote nao o declara',
               { id: id });
      }
    });

    /* declarado <-> presente, nos dois sentidos */
    esperados.forEach(function (id) {
      var presente = id === "arquivos"
        ? Array.isArray(conteudo.arquivos)
        : Object.prototype.hasOwnProperty.call(dados, id);
      if (vistos[id] && !presente) {
        c.erro("ARMAZENAMENTO_DECLARADO_SEM_CONTEUDO",
               id === "arquivos" ? "conteudo.arquivos" : "conteudo.dados." + id,
               '"' + id + '" foi declarado e nao tem conteudo', { id: id });
      }
      if (!vistos[id] && presente) {
        c.erro("ARMAZENAMENTO_NAO_DECLARADO",
               id === "arquivos" ? "conteudo.arquivos" : "conteudo.dados." + id,
               '"' + id + '" tem conteudo e nao foi declarado', { id: id });
      }
    });

    /* caixa estranha dentro de conteudo.dados */
    Object.keys(dados).forEach(function (id) {
      if (esperados.indexOf(id) >= 0) return;
      var entrada = A.porId(id);
      if (entrada && !entrada.exportar) {
        c.erro("ARMAZENAMENTO_PROIBIDO", "conteudo.dados." + id,
               '"' + id + '" nao deve viajar num backup clinico', { id: id });
      } else {
        c.erro("ARMAZENAMENTO_DESCONHECIDO", "conteudo.dados." + id,
               '"' + id + '" nao esta no manifesto deste app', { id: id });
      }
    });

    /* marcas de migracao e legado consumido nao entram */
    var proibidas = A.MARCAS_DE_MIGRACAO.map(function (m) { return m.id; })
      .concat(A.CAIXAS_LEGADAS_CONSUMIDAS.map(function (x) { return x.id; }));
    proibidas.forEach(function (id) {
      if (Object.prototype.hasOwnProperty.call(dados, id) || vistos[id]) {
        c.erro("MARCA_OU_LEGADO_NO_PACOTE", "conteudo.dados." + id,
               '"' + id + '" e marca de migracao ou caixa ja consumida: nao ' +
               "viaja em backup", { id: id });
      }
    });
  }

  /* ---------- formas ------------------------------------------------------ */

  function validarFormas(pacote, c) {
    var conteudo = objetoSimples(pacote.conteudo) ? pacote.conteudo : {};
    var dados = objetoSimples(conteudo.dados) ? conteudo.dados : {};

    A.exportaveis().forEach(function (e) {
      if (e.id === "arquivos") {
        if (conteudo.arquivos !== undefined && !Array.isArray(conteudo.arquivos)) {
          c.erro("FORMA_INVALIDA", "conteudo.arquivos",
                 "forma objectStore pede array de documentos, veio " +
                 tipoDe(conteudo.arquivos), { esperado: "array" });
        }
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(dados, e.id)) return;
      var v = dados[e.id];
      var caminho = "conteudo.dados." + e.id;

      if (e.forma === A.FORMA.LISTA) {
        if (!Array.isArray(v)) {
          c.erro("FORMA_INVALIDA", caminho,
                 'forma "lista" pede array, veio ' + tipoDe(v),
                 { esperado: "array", recebido: tipoDe(v) });
        }
      } else if (e.forma === A.FORMA.MAPA) {
        if (!objetoSimples(v)) {
          c.erro("FORMA_INVALIDA", caminho,
                 'forma "mapaPorPaciente" pede objeto simples, veio ' + tipoDe(v),
                 { esperado: "objeto", recebido: tipoDe(v) });
        }
      }
    });
  }

  /* ---------- registros e referencias -------------------------------------
     POLITICA DE CAMPO EXTRA, dita em voz alta:

       envelope  ->  desconhecido e ERRO. O envelope e nosso e esta inteiro
                     especificado; campo que ninguem escreveu e contrabando.

       registros ->  campo extra e ACEITO, em silencio. Um registro clinico
                     ganha campo com o tempo, e um backup de amanha tem que
                     poder ser lido por um app de hoje. O P0.3 preserva de
                     proposito tudo o que ArquivoStore.pegar() devolve; um
                     validador rigido aqui destruiria essa compatibilidade.
                     Os nomes encontrados saem no resumo, para dar para OLHAR
                     sem ter que recusar.

     O que se cobra no registro e o minimo estrutural: ser objeto, ter id
     plausivel, e ter paciente_id plausivel quando a forma pede. Texto livre
     passa como esta — inclusive com <, >, &, aspas, acento e emoji: escapar
     e responsabilidade da SAIDA, e transformar dado aqui seria perder dado. */

  function validarRegistros(pacote, c, resumo) {
    var conteudo = objetoSimples(pacote.conteudo) ? pacote.conteudo : {};
    var dados = objetoSimples(conteudo.dados) ? conteudo.dados : {};
    /* Campos VISTOS, nao "extras": um registro de lista nao tem esquema
       declarado, entao nao ha o que chamar de irregular. Serve para OLHAR
       o que chegou — e o que permite aceitar campo novo sem recusar nada. */
    var vistos = {};

    function anotarCampos(id, obj) {
      Object.keys(obj).forEach(function (k) {
        vistos[id] = vistos[id] || {};
        vistos[id][k] = (vistos[id][k] || 0) + 1;
      });
    }

    A.exportaveis().forEach(function (e) {
      if (e.forma === A.FORMA.LISTA && Array.isArray(dados[e.id])) {
        dados[e.id].forEach(function (linha, i) {
          var caminho = "conteudo.dados." + e.id + "[" + i + "]";
          if (!objetoSimples(linha)) {
            c.erro("REGISTRO_INVALIDO", caminho,
                   "linha deveria ser objeto, veio " + tipoDe(linha));
            return;
          }
          var idOk = idPlausivel(linha.id);
          if (!idOk.ok) {
            c.erro("ID_INVALIDO", caminho + ".id", "id impróprio: " + idOk.porque);
          }
          if (e.escopo === A.ESCOPO.CAMPO) {
            var pid = linha[e.campoPaciente];
            var pOk = idPlausivel(pid);
            if (!pOk.ok) {
              c.erro("PACIENTE_ID_INVALIDO", caminho + "." + e.campoPaciente,
                     "paciente_id impróprio: " + pOk.porque);
            }
          }
          anotarCampos(e.id, linha);
        });
      } else if (e.forma === A.FORMA.MAPA && objetoSimples(dados[e.id])) {
        Object.keys(dados[e.id]).forEach(function (chave) {
          var caminho = "conteudo.dados." + e.id + "[" + JSON.stringify(chave) + "]";
          var ok = idPlausivel(chave);
          if (!ok.ok) {
            c.erro("CHAVE_DE_MAPA_INVALIDA", caminho,
                   "a chave do mapa e um id de paciente: " + ok.porque);
          }
          if (!valorJSON(dados[e.id][chave])) {
            c.erro("VALOR_NAO_JSON", caminho, "valor nao sobrevive a JSON");
          }
        });
      }
    });

    resumo.campos_vistos = vistos;
  }

  /* ---------- referencias de paciente -------------------------------------
     ORFAO NAO INVALIDA O BACKUP. O V2 preserva orfaos de proposito: e o dado
     que so o backup alcanca, ja que nenhuma tela o mostra. Recusar o pacote
     por causa dele seria recusar justamente a copia que o salvaria.

     Entao: AVISO, com codigo proprio. E `_sem_paciente` nao e nem erro nem
     orfao — e o deposito de quem respondeu fora de um cadastro, e tem
     contagem separada. */

  function conferirReferencias(conteudo, c, resumo) {
    var dados = objetoSimples(conteudo.dados) ? conteudo.dados : {};
    var raiz = Array.isArray(dados.pacientes) ? dados.pacientes : [];
    var vivos = {};
    raiz.forEach(function (p) { if (p && typeof p.id === "string") vivos[p.id] = true; });

    var orfaos = [];
    var semPaciente = [];

    function registrar(armazenamento, caminho, pid, quantidade) {
      var linha = { armazenamento: armazenamento, caminho: caminho,
                    paciente_id: pid, quantidade: quantidade };
      if (pid === A.SEM_PACIENTE) semPaciente.push(linha);
      else if (!vivos[pid]) orfaos.push(linha);
    }

    A.exportaveis().forEach(function (e) {
      if (!e.pacienteScoped || e.escopo === A.ESCOPO.RAIZ) return;

      if (e.forma === A.FORMA.LISTA && Array.isArray(dados[e.id])) {
        var contagem = {};
        dados[e.id].forEach(function (linha) {
          if (!objetoSimples(linha)) return;
          var pid = linha[e.campoPaciente];
          if (typeof pid !== "string") return;
          contagem[pid] = (contagem[pid] || 0) + 1;
        });
        Object.keys(contagem).forEach(function (pid) {
          registrar(e.id, "conteudo.dados." + e.id, pid, contagem[pid]);
        });
      } else if (e.forma === A.FORMA.MAPA && objetoSimples(dados[e.id])) {
        Object.keys(dados[e.id]).forEach(function (pid) {
          registrar(e.id, "conteudo.dados." + e.id, pid, 1);
        });
      }
    });

    /* documentos */
    if (Array.isArray(conteudo.arquivos)) {
      var porDono = {};
      conteudo.arquivos.forEach(function (d) {
        if (!objetoSimples(d) || typeof d.paciente !== "string") return;
        porDono[d.paciente] = (porDono[d.paciente] || 0) + 1;
      });
      Object.keys(porDono).forEach(function (pid) {
        registrar("arquivos", "conteudo.arquivos", pid, porDono[pid]);
      });
    }

    orfaos.forEach(function (o) {
      c.aviso("ORFAO_PRESERVADO", o.caminho,
              'dado de "' + o.paciente_id + '", que nao existe em ' +
              "conteudo.dados.pacientes: " + o.quantidade + " registro(s). " +
              "O backup preserva isto de proposito — nao e motivo para recusar",
              { armazenamento: o.armazenamento, paciente_id: o.paciente_id,
                quantidade: o.quantidade });
    });
    semPaciente.forEach(function (o) {
      c.aviso("SEM_PACIENTE_PRESERVADO", o.caminho,
              "deposito do que foi respondido fora de um cadastro: " +
              o.quantidade + " registro(s). Nao e orfao e nao e paciente",
              { armazenamento: o.armazenamento, quantidade: o.quantidade });
    });

    resumo.orfaos = orfaos;
    resumo.sem_paciente = semPaciente;
    return { ok: orfaos.length === 0, orfaos: orfaos, sem_paciente: semPaciente };
  }

  /* ---------- documentos -------------------------------------------------- */

  var OBRIGATORIOS_DOC = ["id", "paciente", "nome", "mime", "tamanho",
                          "conteudo_base64", "sha256"];

  function bytesDeBase64(b64) {
    var bin = atob(b64);
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function validarDocumentos(conteudo, c, resumo) {
    var lista = Array.isArray(conteudo.arquivos) ? conteudo.arquivos : [];
    var bytesTotais = 0;
    var extras = {};

    var cadeia = lista.reduce(function (antes, doc, i) {
      return antes.then(function () {
        var caminho = "conteudo.arquivos[" + i + "]";
        if (!objetoSimples(doc)) {
          c.erro("DOCUMENTO_INVALIDO", caminho,
                 "documento deveria ser objeto, veio " + tipoDe(doc));
          return;
        }
        OBRIGATORIOS_DOC.forEach(function (campo) {
          if (!Object.prototype.hasOwnProperty.call(doc, campo)) {
            c.erro("DOCUMENTO_CAMPO_AUSENTE", caminho + "." + campo,
                   "campo obrigatorio do documento");
          }
        });
        Object.keys(doc).forEach(function (k) {
          if (OBRIGATORIOS_DOC.indexOf(k) === -1 &&
              ["tipo", "data", "bytes", "conteudo_ausente"].indexOf(k) === -1) {
            extras[k] = (extras[k] || 0) + 1;
          }
        });

        var idOk = idPlausivel(doc.id);
        if (!idOk.ok) c.erro("ID_INVALIDO", caminho + ".id", "id impróprio: " + idOk.porque);
        var pOk = idPlausivel(doc.paciente);
        if (!pOk.ok) {
          c.erro("PACIENTE_ID_INVALIDO", caminho + ".paciente",
                 "paciente impróprio: " + pOk.porque);
        }
        if (typeof doc.nome !== "string") {
          c.erro("DOCUMENTO_TIPO_INVALIDO", caminho + ".nome",
                 "nome deveria ser string, veio " + tipoDe(doc.nome));
        }
        if (typeof doc.mime !== "string") {
          c.erro("DOCUMENTO_TIPO_INVALIDO", caminho + ".mime",
                 "mime deveria ser string, veio " + tipoDe(doc.mime));
        }

        if (doc.conteudo_ausente === true && doc.conteudo_base64 === null) {
          c.aviso("DOCUMENTO_SEM_CONTEUDO", caminho,
                  "o registro de origem nao tinha blob: so metadado viajou");
          return;
        }
        if (typeof doc.conteudo_base64 !== "string") {
          c.erro("DOCUMENTO_TIPO_INVALIDO", caminho + ".conteudo_base64",
                 "esperado string base64, veio " + tipoDe(doc.conteudo_base64));
          return;
        }

        var bytes;
        try {
          bytes = bytesDeBase64(doc.conteudo_base64);
        } catch (e) {
          c.erro("BASE64_INVALIDO", caminho + ".conteudo_base64",
                 "nao decodifica: " + (e && e.name ? e.name : "erro"));
          return;
        }
        bytesTotais += bytes.length;

        /* `bytes` e o que o gerador mediu do buffer; `tamanho` e o que o
           IndexedDB guardou do blob. Os dois tem que bater com o que voltou. */
        if (typeof doc.bytes === "number" && doc.bytes !== bytes.length) {
          c.erro("DOCUMENTO_BYTES_DIVERGENTE", caminho + ".bytes",
                 "declarado " + doc.bytes + ", decodificado " + bytes.length,
                 { declarado: doc.bytes, real: bytes.length });
        }
        if (typeof doc.tamanho === "number" && doc.tamanho !== bytes.length) {
          c.erro("DOCUMENTO_TAMANHO_DIVERGENTE", caminho + ".tamanho",
                 "tamanho original " + doc.tamanho + ", decodificado " + bytes.length,
                 { declarado: doc.tamanho, real: bytes.length });
        }

        if (doc.sha256 === null || doc.sha256 === undefined) {
          c.aviso("DOCUMENTO_SHA_AUSENTE", caminho + ".sha256",
                  "sem hash: o conteudo deste documento nao pode ser conferido");
          return;
        }
        if (typeof doc.sha256 !== "string") {
          c.erro("DOCUMENTO_TIPO_INVALIDO", caminho + ".sha256",
                 "sha256 deveria ser string, veio " + tipoDe(doc.sha256));
          return;
        }
        if (!window.crypto || !window.crypto.subtle) {
          c.aviso("SHA_NAO_VERIFICAVEL", caminho + ".sha256",
                  "crypto.subtle ausente neste ambiente: hash nao conferido");
          return;
        }
        return window.crypto.subtle.digest("SHA-256", bytes).then(function (buf) {
          var b = new Uint8Array(buf), hex = "";
          for (var j = 0; j < b.length; j++) hex += b[j].toString(16).padStart(2, "0");
          if (hex !== doc.sha256) {
            c.erro("DOCUMENTO_SHA_DIVERGENTE", caminho + ".sha256",
                   "declarado " + doc.sha256.slice(0, 16) + "…, recalculado " +
                   hex.slice(0, 16) + "…", { declarado: doc.sha256, real: hex });
          }
        });
      });
    }, Promise.resolve());

    return cadeia.then(function () {
      resumo.documentos = lista.length;
      resumo.bytes_documentos_reais = bytesTotais;
      resumo.campos_extras_documentos = extras;
      return bytesTotais;
    });
  }

  /* ---------- contagens ---------------------------------------------------
     Recalculadas do conteudo do PACOTE. Nada do que ele afirma sobre si mesmo
     e aceito: um pacote que mente sobre as proprias contagens e exatamente o
     caso que isto existe para pegar. */

  function recontar(conteudo, bytesReais) {
    var dados = objetoSimples(conteudo.dados) ? conteudo.dados : {};
    var c = {};
    Object.keys(dados).forEach(function (id) {
      var v = dados[id];
      c[id] = Array.isArray(v) ? v.length
            : (objetoSimples(v) ? Object.keys(v).length : 0);
    });
    c.arquivos = Array.isArray(conteudo.arquivos) ? conteudo.arquivos.length : 0;
    c.bytes_documentos = bytesReais;
    var pont = objetoSimples(dados.pontuacao) ? dados.pontuacao : {};
    c.pontuacoes_total = Object.keys(pont).reduce(function (n, k) {
      return n + (Array.isArray(pont[k]) ? pont[k].length : 1);
    }, 0);
    return c;
  }

  function validarContagens(pacote, conteudo, bytesReais, c, resumo) {
    var real = recontar(conteudo, bytesReais);
    resumo.contagens_recalculadas = real;

    var declaradas = objetoSimples(pacote.integridade) &&
                     objetoSimples(pacote.integridade.contagens)
      ? pacote.integridade.contagens : null;
    if (!declaradas) {
      c.erro("CONTAGENS_AUSENTES", "integridade.contagens",
             "o pacote nao declara contagens: nao ha o que conferir");
      return;
    }
    Object.keys(real).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(declaradas, k)) {
        c.erro("CONTAGEM_AUSENTE", "integridade.contagens." + k,
               "contagem nao declarada para " + k, { chave: k, real: real[k] });
        return;
      }
      if (declaradas[k] !== real[k]) {
        c.erro("CONTAGEM_DIVERGENTE", "integridade.contagens." + k,
               "declarado " + declaradas[k] + ", recalculado " + real[k],
               { chave: k, declarado: declaradas[k], real: real[k] });
      }
    });
    Object.keys(declaradas).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(real, k)) {
        c.erro("CONTAGEM_INESPERADA", "integridade.contagens." + k,
               "contagem declarada para algo que nao esta no conteudo",
               { chave: k });
      }
    });
  }

  /* ---------- hash global ------------------------------------------------- */

  function validarHash(pacote, conteudo, c, resumo) {
    var declarado = objetoSimples(pacote.integridade)
      ? pacote.integridade.sha256_conteudo : undefined;

    if (declarado === null || declarado === undefined) {
      /* O P0.3 permite hash nulo quando o ambiente que gerou nao tinha
         crypto.subtle. Isso NAO e um pacote invalido — mas tambem nao pode
         sair daqui como "integridade verificada". Aviso explicito. */
      c.aviso("HASH_GLOBAL_AUSENTE", "integridade.sha256_conteudo",
              "o pacote nao traz hash do conteudo: a integridade NAO foi " +
              "verificada. Provavelmente foi gerado sem crypto.subtle");
      resumo.hash_conferido = false;
      return Promise.resolve();
    }
    if (typeof declarado !== "string" || !/^[0-9a-f]{64}$/.test(declarado)) {
      c.erro("HASH_GLOBAL_INVALIDO", "integridade.sha256_conteudo",
             "nao e um SHA-256 em hex: " + JSON.stringify(declarado));
      resumo.hash_conferido = false;
      return Promise.resolve();
    }
    if (!window.crypto || !window.crypto.subtle) {
      c.aviso("SHA_NAO_VERIFICAVEL", "integridade.sha256_conteudo",
              "crypto.subtle ausente neste ambiente: hash nao conferido");
      resumo.hash_conferido = false;
      return Promise.resolve();
    }
    return A.sha256DeTexto(A.textoCanonico(conteudo)).then(function (real) {
      resumo.hash_declarado = declarado;
      resumo.hash_recalculado = real;
      if (real !== declarado) {
        c.erro("HASH_GLOBAL_DIVERGENTE", "integridade.sha256_conteudo",
               "declarado " + declarado.slice(0, 16) + "…, recalculado " +
               real.slice(0, 16) + "… — o conteudo nao e o que o pacote diz ser",
               { declarado: declarado, real: real });
        resumo.hash_conferido = false;
      } else {
        resumo.hash_conferido = true;
      }
    });
  }

  /* ---------- diagnostico ------------------------------------------------- */

  function validarDiagnostico(pacote, recalculado, c, resumo) {
    var meu = {
      ok: recalculado.orfaos.length === 0,
      quantidade_orfaos: recalculado.orfaos.length,
      quantidade_sem_paciente: recalculado.sem_paciente.length
    };
    resumo.diagnostico_recalculado = meu;

    var dito = objetoSimples(pacote.diagnostico) ? pacote.diagnostico : null;
    if (!dito) return;
    resumo.diagnostico_declarado = dito;

    ["ok", "quantidade_orfaos", "quantidade_sem_paciente"].forEach(function (k) {
      if (dito[k] !== undefined && dito[k] !== meu[k]) {
        /* Aviso, nao erro: o diagnostico e informativo, e a diferenca pode ser
           so uma versao anterior do gerador contando de outro jeito. Mas nao
           passa em silencio — e ele que diz o que sera restaurado. */
        c.aviso("DIAGNOSTICO_DIVERGENTE", "diagnostico." + k,
                "declarado " + JSON.stringify(dito[k]) + ", recalculado sobre o " +
                "conteudo do pacote " + JSON.stringify(meu[k]),
                { chave: k, declarado: dito[k], real: meu[k] });
      }
    });
  }

  /* ---------- tamanho ----------------------------------------------------- */

  function medirTamanho(pacote, resumo, c) {
    var bytes;
    try {
      bytes = JSON.stringify(pacote).length;
    } catch (e) {
      c.erro("PACOTE_NAO_SERIALIZAVEL", "",
             "o pacote nao serializa em JSON: " + (e && e.message ? e.message : ""));
      return;
    }
    resumo.bytes_pacote = bytes;
    resumo.limite_tecnico = LIMITE_TECNICO_BYTES;
    if (LIMITE_TECNICO_BYTES !== null && bytes > LIMITE_TECNICO_BYTES) {
      c.erro("PACOTE_ACIMA_DO_LIMITE_TECNICO", "",
             bytes + " bytes passa do teto tecnico configurado",
             { bytes: bytes, limite: LIMITE_TECNICO_BYTES });
    }
  }

  /* ======================================================================
     AS TRES PORTAS DE ENTRADA
     ====================================================================== */

  /** Estrutura, sem hash e sem documentos — sincrono, barato, para quando so
      se quer saber se a forma fecha. */
  function analisarBackupV2(pacote) {
    var c = new Coletor();
    var resumo = {};
    var quem = reconhecer(pacote);

    if (quem.tipo !== "v2") {
      c.erro(quem.tipo === "v1_legado" ? "FORMATO_V1_LEGADO" : "FORMATO_NAO_RECONHECIDO",
             "", quem.porque);
      return { valido: false, tipo: quem.tipo, porque: quem.porque,
               erros: c.erros, avisos: c.avisos, resumo: resumo };
    }

    varrer(pacote, "", c);
    validarEnvelope(pacote, c);
    validarArmazenamentos(pacote, c);
    validarFormas(pacote, c);
    validarRegistros(pacote, c, resumo);
    medirTamanho(pacote, resumo, c);

    return { valido: c.erros.length === 0, tipo: "v2", porque: quem.porque,
             erros: c.erros, avisos: c.avisos, resumo: resumo };
  }

  /** A validacao inteira: estrutura + referencias + documentos + contagens +
      hash + diagnostico. Assincrona por causa do SHA-256. NAO ESCREVE NADA. */
  function validarBackupV2(pacote) {
    var c = new Coletor();
    var resumo = {};
    var quem = reconhecer(pacote);

    if (quem.tipo !== "v2") {
      /* V1 nao e erro generico: e um formato anterior, reconhecido, cuja
         conversao e a etapa seguinte. Quem chama precisa poder dizer isso a
         quem esta olhando a tela. */
      c.erro(quem.tipo === "v1_legado" ? "FORMATO_V1_LEGADO" : "FORMATO_NAO_RECONHECIDO",
             "", quem.porque);
      return Promise.resolve({
        valido: false, tipo: quem.tipo, porque: quem.porque,
        /* validar NAO escreve. Antes isto se dizia com
           `importavel_nesta_versao:false`, que passou a ser mentira quando o
           importador nasceu: a frase misturava "esta funcao nao importa" com
           "o app nao sabe importar". Sao coisas diferentes, e so a primeira
           era verdade. O vocabulario agora e o mesmo do restaurador. */
        aplicado: false, escreveu: false,
        erros: c.erros, avisos: c.avisos, resumo: resumo
      });
    }

    varrer(pacote, "", c);
    validarEnvelope(pacote, c);
    validarArmazenamentos(pacote, c);
    validarFormas(pacote, c);
    validarRegistros(pacote, c, resumo);
    medirTamanho(pacote, resumo, c);

    var conteudo = objetoSimples(pacote.conteudo)
      ? pacote.conteudo : { dados: {}, arquivos: [] };

    var refs = conferirReferencias(conteudo, c, resumo);
    validarDiagnostico(pacote, refs, c, resumo);

    return validarDocumentos(conteudo, c, resumo).then(function (bytesReais) {
      validarContagens(pacote, conteudo, bytesReais, c, resumo);
      return validarHash(pacote, conteudo, c, resumo);
    }).then(function () {
      return {
        valido: c.erros.length === 0,
        tipo: "v2",
        porque: quem.porque,
        aplicado: false, escreveu: false,   /* validar nao escreve */
        erros: c.erros,
        avisos: c.avisos,
        resumo: resumo
      };
    });
  }

  /** O texto cru, vindo de um arquivo. So JSON.parse — nunca eval. */
  function analisarTextoBackup(texto) {
    if (typeof texto !== "string") {
      return Promise.resolve({
        valido: false, tipo: "desconhecido",
        porque: "esperado texto, veio " + tipoDe(texto),
        erros: [montar("erro", "ENTRADA_NAO_E_TEXTO", "", "esperado string")],
        avisos: [], resumo: {}
      });
    }
    if (texto.trim() === "") {
      return Promise.resolve({
        valido: false, tipo: "desconhecido", porque: "texto vazio",
        erros: [montar("erro", "JSON_VAZIO", "", "nao ha nada para ler")],
        avisos: [], resumo: {}
      });
    }
    var obj;
    try {
      obj = JSON.parse(texto);
    } catch (e) {
      return Promise.resolve({
        valido: false, tipo: "desconhecido",
        porque: "JSON invalido",
        erros: [montar("erro", "JSON_INVALIDO", "",
                       "nao e JSON: " + (e && e.message ? e.message : ""))],
        avisos: [], resumo: { bytes_texto: texto.length }
      });
    }
    return validarBackupV2(obj).then(function (r) {
      r.resumo.bytes_texto = texto.length;
      return r;
    });
  }

  /* ---------- dry-run -----------------------------------------------------
     "O que aconteceria se eu mandasse restaurar isto?" — respondido sem que
     nada aconteca. Nenhuma escrita, em lugar nenhum. */

  function simularImportacaoV2(pacote) {
    return validarBackupV2(pacote).then(function (v) {
      var conteudo = (v.tipo === "v2" && objetoSimples(pacote.conteudo))
        ? pacote.conteudo : { dados: {}, arquivos: [] };
      var dados = objetoSimples(conteudo.dados) ? conteudo.dados : {};

      var substituidos = [];
      var preservados = [];
      A.todos().forEach(function (e) {
        var noPacote = e.id === "arquivos"
          ? Array.isArray(conteudo.arquivos)
          : Object.prototype.hasOwnProperty.call(dados, e.id);
        if (noPacote && e.exportar) {
          substituidos.push({
            id: e.id, forma: e.forma,
            registros: e.id === "arquivos" ? conteudo.arquivos.length
              : (Array.isArray(dados[e.id]) ? dados[e.id].length
                 : Object.keys(dados[e.id] || {}).length)
          });
        } else {
          /* aparencia e as caixas que o pacote nao traz: ficam como estao */
          preservados.push({ id: e.id, porque: e.exportar
            ? "nao veio no pacote" : "nao e exportavel (configuracao local)" });
        }
      });

      return {
        valido: v.valido,
        tipo: v.tipo,
        /* dito em voz alta: isto NAO importou nada */
        aplicado: false,
        escreveu: false,

        pacientes: Array.isArray(dados.pacientes) ? dados.pacientes.length : 0,
        aplicacoes: Array.isArray(dados.aplicacoes) ? dados.aplicacoes.length : 0,
        documentos: Array.isArray(conteudo.arquivos) ? conteudo.arquivos.length : 0,
        orfaos: (v.resumo.orfaos || []).length,
        registros_orfaos: (v.resumo.orfaos || []).reduce(function (n, o) {
          return n + o.quantidade;
        }, 0),
        sem_paciente: (v.resumo.sem_paciente || []).length,

        substituidos: substituidos,
        preservados: preservados,

        tamanho: {
          bytes_pacote: v.resumo.bytes_pacote,
          bytes_documentos: v.resumo.bytes_documentos_reais,
          limite_tecnico: v.resumo.limite_tecnico
        },
        hashes: {
          global_conferido: v.resumo.hash_conferido === true,
          global_declarado: v.resumo.hash_declarado || null,
          global_recalculado: v.resumo.hash_recalculado || null,
          documentos_conferidos: v.erros.filter(function (e) {
            return e.codigo === "DOCUMENTO_SHA_DIVERGENTE";
          }).length === 0
        },
        contagens_recalculadas: v.resumo.contagens_recalculadas || null,
        diagnostico_recalculado: v.resumo.diagnostico_recalculado || null,

        erros: v.erros,
        avisos: v.avisos
      };
    });
  }

  /* ---------- publicacao --------------------------------------------------
     Estende o Armazenamento em vez de criar outro global: quem valida um
     pacote esta falando da mesma coisa que quem le o manifesto. */

  A.MANIFESTO_SUPORTADOS = MANIFESTO_SUPORTADOS.slice();
  A.CHAVES_PERIGOSAS = CHAVES_PERIGOSAS.slice();
  A.LIMITE_TECNICO_BYTES = LIMITE_TECNICO_BYTES;
  /** O diagnostico calculado sobre o CONTEUDO de um pacote, nao sobre o
      disco. E a mesma varredura que a validacao usa — quem monta um pacote
      novo (o conversor de V1, por exemplo) precisa declarar o diagnostico
      certo, e recalcular orfaos por conta propria seria uma segunda verdade
      sobre o que e um orfao. */
  A.diagnosticarConteudo = function (conteudo) {
    var c = new Coletor();
    var resumo = {};
    var r = conferirReferencias(conteudo || { dados: {}, arquivos: [] }, c, resumo);
    return { ok: r.ok, orfaos: r.orfaos, sem_paciente: r.sem_paciente };
  };

  A.reconhecerBackup = reconhecer;
  A.analisarBackupV2 = analisarBackupV2;
  A.validarBackupV2 = validarBackupV2;
  A.analisarTextoBackup = analisarTextoBackup;
  A.simularImportacaoV2 = simularImportacaoV2;
})();
