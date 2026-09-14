/* ============================================================================
   MOTOR DE RESTAURACAO — aplicar um Backup V2 sem deixar o app pela metade.

   Restaurar e a operacao mais perigosa deste app: ela apaga o que existe para
   por outra coisa no lugar. Se ela parar no meio — erro de cota, aba fechada,
   maquina desligada — o que sobra nao e o estado antigo nem o novo, e sim um
   terceiro estado que ninguem projetou e ninguem sabe ler.

   Entao o desenho e o de sempre para esse tipo de coisa: antes de tocar em
   qualquer dado, guarda-se uma copia completa do que sera tocado, num lugar
   que sobrevive a um crash. So depois se escreve. No fim, confere-se. Se algo
   falhar em qualquer ponto, volta-se para a copia.

       validar → snapshot → marcar fase → IndexedDB → localStorage
              → verificar → confirmar → apagar o snapshot

   Tres decisoes que valem explicar:

   O SNAPSHOT VAI PARA UM BANCO SEPARADO. Nao para o localStorage, que tem 5 MB
   e nao aguenta um laudo; nao para o banco principal, cujo schema nao deve
   mudar por causa de uma operacao. Um banco proprio guarda blobs, sobrevive a
   reload, e nao se mistura com o dado do produto.

   ELE NAO E O 14o DADO DO MODELO. O STORAGE_MANIFEST continua descrevendo os
   13 armazenamentos do produto. Este aqui e OPERACIONAL e TEMPORARIO: existe
   durante a operacao e some no fim. Mas enquanto existe ele carrega dado
   clinico sensivel inteiro — entao e local, nao exporta, nao sincroniza, e
   `apagarTudo` passa a alcanca-lo.

   A ORDEM E IndexedDB ANTES DE localStorage. O IndexedDB tem transacao de
   verdade: ou os documentos entram todos, ou nenhum. Se essa parte falhar, o
   localStorage ainda nem foi tocado, e nao ha o que desfazer nele.

   NESTA RODADA NADA DISTO ESTA LIGADO A INTERFACE. Nenhum botao chama
   aplicarBackupV2, e a deteccao de restauracao pendente nao roda no boot.
   Falta o P0.7 — sem trava entre abas, duas abas restaurando ao mesmo tempo
   se atropelam. Por isso o retorno carrega `requer_exclusividade: true`.
   ========================================================================== */

(function () {
  "use strict";

  var A = window.Armazenamento;
  if (!A) return;

  /* ---------- o banco operacional ---------------------------------------- */

  var BANCO_REC = "holohacking-recuperacao";
  var LOJA_REC = "snapshots";
  var VERSAO_REC = 1;
  var ID_SNAPSHOT = "restauracao-atual";   /* uma operacao por vez */
  var bdRec = null;

  var FASE = {
    SNAPSHOT_CRIADO: "snapshot_criado",
    APLICANDO_INDEXEDDB: "aplicando_indexeddb",
    APLICANDO_LOCALSTORAGE: "aplicando_localstorage",
    VERIFICANDO: "verificando",
    ROLLBACK: "rollback",
    ROLLBACK_FALHOU: "rollback_falhou",
    CONCLUIDO: "concluido"
  };

  /** O armazenamento operacional, declarado a parte dos 13 do produto. */
  var OPERACIONAIS = [
    {
      id: "recuperacao",
      backend: "indexedDB",
      chave: BANCO_REC + "/" + LOJA_REC,
      forma: "objectStore",
      categoria: "operacional",
      escopo: "global",
      pacienteScoped: false,
      exportar: false,
      importar: false,
      excluirComPaciente: false,
      limparTudo: true,
      derivavel: false,
      /* Contem dado clinico inteiro ENQUANTO a operacao dura. E por isso que
         ele e local, nao viaja, e some no fim — nao porque seja inofensivo. */
      sensivel: true,
      temporario: true,
      versao: VERSAO_REC,
      descricao: "Copia do estado anterior durante uma restauracao. Existe " +
                 "so entre o inicio e o fim da operacao; some no sucesso e no " +
                 "rollback. NAO e dado do modelo: nao entra em backup, nao e " +
                 "por paciente, e nao aparece em nenhuma tela."
    }
  ];

  function abrirRec() {
    if (bdRec) return Promise.resolve(bdRec);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(BANCO_REC, VERSAO_REC);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(LOJA_REC)) {
          d.createObjectStore(LOJA_REC, { keyPath: "id" });
        }
      };
      req.onsuccess = function () {
        bdRec = req.result;
        bdRec.onversionchange = function () {
          try { bdRec.close(); } catch (e) {}
          bdRec = null;
        };
        bdRec.onclose = function () { bdRec = null; };
        resolve(bdRec);
      };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () {
        reject(new Error("o banco de recuperacao esta bloqueado por outra aba"));
      };
    });
  }

  function pedido(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function commit(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error || new Error("transacao falhou")); };
      tx.onabort = function () { reject(tx.error || new Error("transacao abortada")); };
    });
  }

  /** Grava o snapshot. So resolve no COMMIT: uma fase que nao commitou nao
      aconteceu, e e nisso que a recuperacao pos-crash se apoia. */
  function gravarSnapshot(snap) {
    return abrirRec().then(function (d) {
      var tx = d.transaction(LOJA_REC, "readwrite");
      var p = pedido(tx.objectStore(LOJA_REC).put(snap));
      return Promise.all([p, commit(tx)]);
    }).then(function () { return snap; });
  }

  function lerSnapshot() {
    return abrirRec().then(function (d) {
      var tx = d.transaction(LOJA_REC, "readonly");
      var p = pedido(tx.objectStore(LOJA_REC).get(ID_SNAPSHOT));
      return Promise.all([p, commit(tx)]);
    }).then(function (par) { return par[0] || null; });
  }

  function apagarSnapshot() {
    return abrirRec().then(function (d) {
      var tx = d.transaction(LOJA_REC, "readwrite");
      var p = pedido(tx.objectStore(LOJA_REC).delete(ID_SNAPSHOT));
      return Promise.all([p, commit(tx)]);
    }).then(function () { return true; });
  }

  function marcarFase(snap, fase, extra) {
    snap.fase = fase;
    snap.fase_em = new Date().toISOString();
    if (extra) Object.keys(extra).forEach(function (k) { snap[k] = extra[k]; });
    return gravarSnapshot(snap);
  }

  /* ---------- failpoints — SO PARA TESTE, NAO E PRODUTO -------------------
     Um ponto nomeado em que a operacao para de proposito, para que se possa
     provar que a recuperacao pos-crash funciona sem precisar matar o processo
     na hora certa. Nenhuma tela chama isto, nenhuma UI o expoe, e em operacao
     normal o valor e null e nao custa nada. */
  var _failpointDeTeste = null;
  var _travarDeTeste = null;

  function talvezFalhar(ponto) {
    /* modo TRAVAR: a operacao para ali e NAO faz rollback, que e o que
       acontece quando a aba morre de verdade — a fase ja commitou no banco de
       recuperacao e ninguem mais mexe em nada. E o unico jeito de provar a
       recuperacao pos-crash sem matar o processo na hora exata. */
    if (_travarDeTeste && _travarDeTeste === ponto) {
      var t = new Error("TRAVA DE TESTE: " + ponto);
      t.failpoint = ponto;
      t.nome = "TravaDeTeste";
      t.travar = true;
      throw t;
    }
    if (_failpointDeTeste && _failpointDeTeste === ponto) {
      var e = new Error("FAILPOINT DE TESTE: " + ponto);
      e.failpoint = ponto;
      e.nome = "FailpointDeTeste";
      throw e;
    }
  }

  /* ---------- o que a operacao toca --------------------------------------
     Alem dos 12 exportaveis, uma restauracao mexe em coisas que NAO sao dado
     do pacote mas cujo valor antigo nao pode sobreviver a ela:

       as marcas de migracao, que precisam ser reavaliadas sobre as tabelas
       legadas que acabaram de chegar;

       as caixas legadas ja consumidas, que sao locais e nao vem no pacote —
       se ficassem, dado antigo reapareceria depois da restauracao.

     O snapshot guarda o valor previo das quatro, para o rollback devolver
     exatamente o que havia. */

  function chavesAuxiliares() {
    return A.MARCAS_DE_MIGRACAO.map(function (m) { return m.chave; })
      .concat(A.CAIXAS_LEGADAS_CONSUMIDAS.map(function (x) { return x.chave; }));
  }

  /** Todas as chaves de localStorage que a aplicacao vai escrever ou apagar. */
  function chavesTocadas() {
    var doPacote = A.exportaveis()
      .filter(function (e) { return e.backend !== "indexedDB"; })
      .map(function (e) { return e.chave; });
    return doPacote.concat(chavesAuxiliares());
  }

  /** O valor de cada chave HOJE, distinguindo "existe com valor" de "nao
      existe". Sem essa distincao o rollback escreveria a string "null" onde
      antes nao havia chave nenhuma — e isso nao e o estado anterior. */
  function lerChaves(chaves) {
    var saida = {};
    chaves.forEach(function (k) {
      var v = localStorage.getItem(k);
      saida[k] = v === null ? { existia: false } : { existia: true, valor: v };
    });
    return saida;
  }

  function escreverChaves(mapa) {
    Object.keys(mapa).forEach(function (k) {
      if (mapa[k].existia) localStorage.setItem(k, mapa[k].valor);
      else localStorage.removeItem(k);
    });
  }

  /* ---------- base64 → blob ---------------------------------------------- */

  function bytesDeBase64(b64) {
    var bin = atob(b64 || "");
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  /** O documento do pacote de volta ao formato do banco: o base64 vira Blob e
      TODO o resto passa como veio — id inclusive, e tambem os campos que este
      codigo nao conhece, que e como um backup de amanha sobrevive. */
  function registroDeDocumento(doc) {
    var r = {};
    Object.keys(doc).forEach(function (k) {
      if (k !== "conteudo_base64" && k !== "sha256" && k !== "bytes" &&
          k !== "conteudo_ausente") {
        r[k] = doc[k];
      }
    });
    var bytes = bytesDeBase64(doc.conteudo_base64);
    r.arquivo = new Blob([bytes], { type: doc.mime || "application/octet-stream" });
    return r;
  }

  /* ---------- snapshot ----------------------------------------------------
     Reutiliza o proprio Backup V2 para o dado principal — ele ja captura os
     12 armazenamentos com blobs e hash — e acrescenta as auxiliares, que o
     backup nao leva porque nao sao dado. */

  function montarSnapshot(pacoteNovo) {
    return A.gerarBackupV2().then(function (backupAtual) {
      return {
        id: ID_SNAPSHOT,
        criado_em: new Date().toISOString(),
        fase: FASE.SNAPSHOT_CRIADO,
        fase_em: new Date().toISOString(),
        /* o estado ANTERIOR, inteiro */
        backup_atual: backupAtual,
        /* e o que o backup nao leva, mas a operacao toca */
        auxiliares: lerChaves(chavesAuxiliares()),
        /* todas as chaves de localStorage que serao escritas ou apagadas,
           com o valor de antes e se existiam */
        chaves_antes: lerChaves(chavesTocadas()),
        /* para conferir, depois, que foi este pacote que se tentou aplicar */
        alvo: {
          criado_em: pacoteNovo.criado_em,
          sha256_conteudo: pacoteNovo.integridade &&
                           pacoteNovo.integridade.sha256_conteudo
        }
      };
    });
  }

  /* ---------- aplicacao ---------------------------------------------------
     Tudo o que pode dar errado por SERIALIZACAO acontece antes da primeira
     mutacao: as strings finais sao montadas em memoria, e so depois escritas.
     Assim um JSON que nao serializa nao deixa metade das chaves trocadas. */

  function prepararLocalStorage(pacote) {
    var plano = {};
    var dados = pacote.conteudo.dados;

    A.exportaveis().forEach(function (e) {
      if (e.backend === "indexedDB") return;
      var v = dados[e.id];
      /* Substituicao, nao merge: o que existia e que nao vem no pacote tem
         que sumir. Import V2 e troca do armazenamento inteiro. */
      plano[e.chave] = { existia: true, valor: JSON.stringify(v) };
    });

    /* As marcas de migracao saem: as tabelas legadas que acabaram de chegar
       precisam poder ser reavaliadas no proximo boot. A protecao contra
       duplicar esta em `origem_legada`, nos dados, nao nesta marca. */
    A.MARCAS_DE_MIGRACAO.forEach(function (m) {
      plano[m.chave] = { existia: false };
    });
    /* As caixas legadas locais tambem: elas nao vem no pacote, e se ficassem
       dado antigo reapareceria depois de uma restauracao. */
    A.CAIXAS_LEGADAS_CONSUMIDAS.forEach(function (x) {
      plano[x.chave] = { existia: false };
    });

    return plano;
  }

  /* ---------- verificacao -------------------------------------------------
     Gera um Backup V2 do estado restaurado e compara com o pacote importado
     pelo que E o conteudo: o hash, as contagens, os hashes dos documentos e o
     conjunto de armazenamentos. Nao se compara criado_em, diagnostico nem
     tamanho do envelope — nenhum dos tres e o dado restaurado. */

  function verificar(pacote) {
    return A.gerarBackupV2().then(function (agora) {
      var problemas = [];
      var esperado = pacote.integridade || {};
      var obtido = agora.integridade || {};

      if (esperado.sha256_conteudo && obtido.sha256_conteudo !== esperado.sha256_conteudo) {
        problemas.push({
          codigo: "HASH_RESTAURADO_DIVERGENTE",
          esperado: esperado.sha256_conteudo, obtido: obtido.sha256_conteudo
        });
      }
      Object.keys(esperado.contagens || {}).forEach(function (k) {
        if ((obtido.contagens || {})[k] !== esperado.contagens[k]) {
          problemas.push({
            codigo: "CONTAGEM_RESTAURADA_DIVERGENTE", chave: k,
            esperado: esperado.contagens[k], obtido: (obtido.contagens || {})[k]
          });
        }
      });
      if ((pacote.armazenamentos || []).slice().sort().join(",") !==
          (agora.armazenamentos || []).slice().sort().join(",")) {
        problemas.push({ codigo: "ARMAZENAMENTOS_RESTAURADOS_DIVERGENTES" });
      }
      /* documento por documento, pelo hash dos bytes */
      var shaEsperado = {};
      (pacote.conteudo.arquivos || []).forEach(function (d) { shaEsperado[d.id] = d.sha256; });
      (agora.conteudo.arquivos || []).forEach(function (d) {
        if (!Object.prototype.hasOwnProperty.call(shaEsperado, d.id)) {
          problemas.push({ codigo: "DOCUMENTO_INESPERADO", id: d.id });
        } else if (shaEsperado[d.id] !== d.sha256) {
          problemas.push({ codigo: "DOCUMENTO_SHA_RESTAURADO_DIVERGENTE", id: d.id,
                           esperado: shaEsperado[d.id], obtido: d.sha256 });
        }
        delete shaEsperado[d.id];
      });
      Object.keys(shaEsperado).forEach(function (id) {
        problemas.push({ codigo: "DOCUMENTO_FALTANDO", id: id });
      });

      return { ok: problemas.length === 0, problemas: problemas, estado: agora };
    });
  }

  /* ---------- rollback ---------------------------------------------------- */

  function desfazer(snap) {
    /* IndexedDB primeiro, pelo mesmo motivo da ida: e o que tem transacao. */
    var docs = (snap.backup_atual.conteudo.arquivos || []).map(registroDeDocumento);
    return window.ArquivoStore.substituirTudoEstrito(docs).then(function () {
      /* e as chaves exatamente como estavam — inclusive as que NAO existiam */
      escreverChaves(snap.chaves_antes);
      return verificarRollback(snap);
    });
  }

  function verificarRollback(snap) {
    return A.gerarBackupV2().then(function (agora) {
      var esperado = snap.backup_atual.integridade || {};
      var obtido = agora.integridade || {};
      var problemas = [];
      if (esperado.sha256_conteudo && obtido.sha256_conteudo !== esperado.sha256_conteudo) {
        problemas.push({ codigo: "ROLLBACK_HASH_DIVERGENTE",
                         esperado: esperado.sha256_conteudo,
                         obtido: obtido.sha256_conteudo });
      }
      /* as auxiliares tambem: elas nao entram no hash do backup */
      Object.keys(snap.auxiliares).forEach(function (k) {
        var antes = snap.auxiliares[k];
        var agoraValor = localStorage.getItem(k);
        var voltou = antes.existia ? agoraValor === antes.valor : agoraValor === null;
        if (!voltou) {
          problemas.push({ codigo: "ROLLBACK_AUXILIAR_DIVERGENTE", chave: k });
        }
      });
      return { ok: problemas.length === 0, problemas: problemas };
    });
  }

  /* ======================================================================
     A OPERACAO
     ====================================================================== */

  function resultado(campos) {
    var base = {
      aplicado: false,
      revertido: false,
      /* Ate o P0.7 existir nao ha trava entre abas: duas abas restaurando ao
         mesmo tempo se atropelam. Quem chamar precisa garantir exclusividade
         por fora — e e por isso que nenhuma tela chama isto ainda. */
      requer_exclusividade: true,
      /* As telas em memoria nao sabem que o disco mudou. Esta rodada NAO
         recarrega nada; quem ligar isto a UI vai precisar recarregar. */
      precisa_recarregar: false,
      erros: [],
      avisos: []
    };
    Object.keys(campos).forEach(function (k) { base[k] = campos[k]; });
    return base;
  }

  /** Aplica um Backup V2. Valida primeiro, pelo MESMO validador do P0.4a —
      nao ha caminho rapido e nao ha segunda validacao. Se o pacote nao for
      valido, nada e escrito e nenhum snapshot e criado. */
  function aplicarBackupV2(pacote, opcoes) {
    opcoes = opcoes || {};
    _failpointDeTeste = opcoes.failpointDeTeste || null;
    _travarDeTeste = opcoes.travarDeTeste || null;

    return A.validarBackupV2(pacote).then(function (v) {
      if (!v.valido) {
        _failpointDeTeste = null;
        _travarDeTeste = null;
        return resultado({
          fase: null,
          motivo: "PACOTE_INVALIDO",
          escreveu: false,
          validacao: v,
          erros: v.erros
        });
      }

      var snap = null;
      var plano = null;

      return montarSnapshot(pacote)
        .then(function (s) { snap = s; return gravarSnapshot(snap); })
        .then(function () {
          talvezFalhar("apos_snapshot");

          /* TUDO o que pode falhar por serializacao acontece aqui, antes da
             primeira mutacao. */
          plano = prepararLocalStorage(pacote);
          return marcarFase(snap, FASE.APLICANDO_INDEXEDDB);
        })
        .then(function () {
          var docs = (pacote.conteudo.arquivos || []).map(registroDeDocumento);
          return window.ArquivoStore.substituirTudoEstrito(docs);
        })
        .then(function () {
          talvezFalhar("apos_indexeddb");
          return marcarFase(snap, FASE.APLICANDO_LOCALSTORAGE);
        })
        .then(function () {
          /* A escrita propriamente dita: so setItem/removeItem, nenhuma
             transformacao. Um failpoint pode parar no meio, e e justamente o
             estado que a recuperacao pos-crash precisa saber desfazer. */
          var chaves = Object.keys(plano);
          for (var i = 0; i < chaves.length; i++) {
            talvezFalhar("apos_localstorage_" + i);
            var alvo = plano[chaves[i]];
            if (alvo.existia) localStorage.setItem(chaves[i], alvo.valor);
            else localStorage.removeItem(chaves[i]);
          }
          return marcarFase(snap, FASE.VERIFICANDO);
        })
        .then(function () {
          talvezFalhar("antes_da_verificacao");
          return verificar(pacote);
        })
        .then(function (conf) {
          if (!conf.ok) {
            var e = new Error("a verificacao do estado restaurado falhou");
            e.verificacao = conf;
            throw e;
          }
          return marcarFase(snap, FASE.CONCLUIDO);
        })
        .then(function () { return apagarSnapshot(); })
        .then(function () {
          _failpointDeTeste = null;
          _travarDeTeste = null;
          return resultado({
            fase: FASE.CONCLUIDO,
            aplicado: true,
            escreveu: true,
            precisa_recarregar: true,
            snapshot_ativo: false,
            armazenamentos: pacote.armazenamentos.slice(),
            documentos: (pacote.conteudo.arquivos || []).length
          });
        })
        .catch(function (erroOriginal) {
          _failpointDeTeste = null;   /* o rollback nao pode falhar por failpoint */
          _travarDeTeste = null;
          /* TRAVA DE TESTE: a promessa fica pendente para sempre, como se a
             aba tivesse morrido ali. Nada de rollback, nada de limpeza — o
             snapshot fica no disco com a fase que commitou por ultimo, que e
             exatamente o estado que detectarRestauracaoPendente() encontra. */
          if (erroOriginal && erroOriginal.travar) {
            return new Promise(function () {});
          }
          if (!snap) {
            /* falhou antes de haver snapshot: nada foi escrito */
            return resultado({
              fase: null, motivo: "FALHA_ANTES_DO_SNAPSHOT", escreveu: false,
              erros: [descreverErro("erro_original", erroOriginal)]
            });
          }
          return rollback(snap, erroOriginal);
        });
    });
  }

  function descreverErro(papel, e) {
    return {
      papel: papel,
      nome: (e && (e.nome || e.name)) || "Error",
      mensagem: (e && e.message) || String(e),
      failpoint: (e && e.failpoint) || undefined,
      verificacao: (e && e.verificacao) || undefined
    };
  }

  /** Volta ao estado do snapshot. NUNCA engole a causa original: ela viaja
      junto com o que acontecer aqui. */
  function rollback(snap, erroOriginal) {
    return marcarFase(snap, FASE.ROLLBACK, {
      erro_original: descreverErro("erro_original", erroOriginal)
    }).then(function () {
      return desfazer(snap);
    }).then(function (conf) {
      if (!conf.ok) {
        var e = new Error("o rollback terminou mas o estado nao confere");
        e.verificacao = conf;
        throw e;
      }
      return apagarSnapshot().then(function () {
        return resultado({
          fase: FASE.ROLLBACK,
          revertido: true,
          escreveu: true,
          motivo: "REVERTIDO",
          snapshot_ativo: false,
          erros: [descreverErro("erro_original", erroOriginal)]
        });
      });
    }).catch(function (erroRollback) {
      /* O caso mais grave. O snapshot NAO e apagado: ele e a unica copia do
         estado anterior, e joga-lo fora aqui seria destruir a saida. */
      return marcarFase(snap, FASE.ROLLBACK_FALHOU, {
        erro_rollback: descreverErro("erro_rollback", erroRollback)
      }).catch(function () { /* nem a marca deu: o snapshot ainda esta la */ })
        .then(function () {
          return resultado({
            fase: FASE.ROLLBACK_FALHOU,
            motivo: "RECUPERACAO_MANUAL_NECESSARIA",
            escreveu: true,
            snapshot_ativo: true,
            /* os dois erros, separados e nomeados: confundi-los seria perder
               a informacao de por que a operacao comecou a dar errado */
            erros: [
              descreverErro("erro_original", erroOriginal),
              descreverErro("erro_rollback", erroRollback)
            ]
          });
        });
    });
  }

  /* ---------- recuperacao pos-crash --------------------------------------
     Se existe snapshot cuja fase nao e `concluido`, uma operacao comecou e
     nao terminou — a aba morreu, a maquina desligou, a pagina foi embora. O
     estado no disco pode estar em qualquer ponto do meio.

     Nesta rodada isto NAO roda no boot: so existe e e testado. */

  function detectarRestauracaoPendente() {
    return lerSnapshot().then(function (snap) {
      if (!snap) return { pendente: false };
      return {
        pendente: snap.fase !== FASE.CONCLUIDO,
        fase: snap.fase,
        criado_em: snap.criado_em,
        fase_em: snap.fase_em,
        alvo: snap.alvo,
        erro_original: snap.erro_original || null,
        erro_rollback: snap.erro_rollback || null,
        /* rollback_falhou quer dizer que uma tentativa ja aconteceu e nao
           deu certo: quem recuperar precisa saber disso antes de tentar. */
        ja_tentou_rollback: snap.fase === FASE.ROLLBACK ||
                            snap.fase === FASE.ROLLBACK_FALHOU
      };
    }, function (e) {
      return { pendente: false, indisponivel: true,
               erro: descreverErro("erro_leitura", e) };
    });
  }

  /** Devolve o app ao estado guardado no snapshot. */
  function recuperarRestauracaoPendente() {
    return lerSnapshot().then(function (snap) {
      if (!snap) {
        return resultado({ fase: null, motivo: "NADA_PENDENTE", escreveu: false });
      }
      if (snap.fase === FASE.CONCLUIDO) {
        /* operacao terminou bem e o snapshot sobrou: e lixo, nao pendencia */
        return apagarSnapshot().then(function () {
          return resultado({ fase: FASE.CONCLUIDO, motivo: "NADA_A_DESFAZER",
                             escreveu: false, snapshot_ativo: false });
        });
      }
      return marcarFase(snap, FASE.ROLLBACK)
        .then(function () { return desfazer(snap); })
        .then(function (conf) {
          if (!conf.ok) {
            var e = new Error("a recuperacao terminou mas o estado nao confere");
            e.verificacao = conf;
            throw e;
          }
          return apagarSnapshot().then(function () {
            return resultado({
              fase: FASE.ROLLBACK, revertido: true, escreveu: true,
              motivo: "RECUPERADO", snapshot_ativo: false,
              precisa_recarregar: true,
              fase_interrompida: snap.fase
            });
          });
        })
        .catch(function (e) {
          return marcarFase(snap, FASE.ROLLBACK_FALHOU, {
            erro_rollback: descreverErro("erro_rollback", e)
          }).catch(function () {}).then(function () {
            return resultado({
              fase: FASE.ROLLBACK_FALHOU,
              motivo: "RECUPERACAO_MANUAL_NECESSARIA",
              escreveu: true, snapshot_ativo: true,
              erros: [descreverErro("erro_rollback", e)]
            });
          });
        });
    });
  }

  /** Apaga o banco operacional inteiro. Existe para o `apagar tudo` poder
      alcanca-lo: enquanto um snapshot existe, ele guarda dado clinico. */
  function limparRecuperacao() {
    if (bdRec) { try { bdRec.close(); } catch (e) {} bdRec = null; }
    return new Promise(function (resolve) {
      var req = indexedDB.deleteDatabase(BANCO_REC);
      req.onsuccess = function () { resolve(true); };
      req.onerror = function () { resolve(false); };
      req.onblocked = function () { resolve(false); };
    });
  }

  /* ---------- publicacao -------------------------------------------------- */

  A.OPERACIONAIS = OPERACIONAIS;
  A.FASES_RESTAURACAO = FASE;
  A.BANCO_RECUPERACAO = { banco: BANCO_REC, loja: LOJA_REC, versao: VERSAO_REC,
                          id: ID_SNAPSHOT };

  A.aplicarBackupV2 = aplicarBackupV2;
  A.detectarRestauracaoPendente = detectarRestauracaoPendente;
  A.recuperarRestauracaoPendente = recuperarRestauracaoPendente;
  A.limparRecuperacao = limparRecuperacao;

  /* leitura pura, para teste e diagnostico */
  A.lerSnapshotOperacional = lerSnapshot;
})();
