/* ===========================================================================
   ONDE OS ARQUIVOS DO PACIENTE FICAM
   ===========================================================================

   PDF de exame e foto de laudo sao arquivos de verdade: 1 a 5 MB cada. O
   localStorage tem ~5 MB no total e guarda texto, entao um unico exame o
   estouraria — e ele quebra calado quando enche. O IndexedDB do mesmo
   navegador oferece ~10 GB e guarda o arquivo inteiro, sem converter.

   Por enquanto isso vive so na maquina de quem usa. Nao e o ideal — troca de
   computador e perde —, mas para dado de saude e mais seguro do que o
   Supabase esta hoje, que grava com chave publica e sem login.

   Quando o Supabase Storage entrar, as funcoes daqui sao as unicas que mudam:
   salvar, listar, abrir e remover. Nada mais no app conhece o IndexedDB.

   LGPD: exame e laudo sao dado pessoal sensivel (art. 5 II e art. 11).
   Nao sai do navegador, nao vai para lugar nenhum, e some com o botao remover.
   =========================================================================== */

(function () {
  "use strict";

  var BANCO = "holohacking";
  var LOJA = "arquivos";
  var VERSAO = 1;
  var bd = null;

  function abrir() {
    if (bd) return Promise.resolve(bd);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(BANCO, VERSAO);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(LOJA)) {
          var loja = d.createObjectStore(LOJA, { keyPath: "id" });
          loja.createIndex("paciente", "paciente", { unique: false });
        }
      };
      req.onsuccess = function () { bd = req.result; resolve(bd); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function transacao(modo) {
    return abrir().then(function (d) {
      return d.transaction(LOJA, modo).objectStore(LOJA);
    });
  }

  function promessa(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /** Guarda o arquivo inteiro, sem converter para texto. */
  function salvar(paciente, arquivo, meta) {
    var id = "arq-" + Date.now() + "-" + Math.abs(hash(arquivo.name + arquivo.size));
    var registro = {
      id: id,
      paciente: paciente,
      nome: meta.nome || arquivo.name,
      tipo: meta.tipo || "Outro",
      data: meta.data || "",
      mime: arquivo.type || "application/octet-stream",
      tamanho: arquivo.size,
      arquivo: arquivo
    };
    return transacao("readwrite")
      .then(function (loja) { return promessa(loja.add(registro)); })
      .then(function () { return registro; })
      .catch(function (e) {
        // QuotaExceededError e o unico erro que a pessoa precisa entender
        if (e && /quota/i.test(e.name || "")) {
          throw new Error("Não há espaço no navegador para este arquivo. " +
                          "Remova algum documento antigo e tente de novo.");
        }
        throw e;
      });
  }

  function listar(paciente) {
    return transacao("readonly").then(function (loja) {
      return promessa(loja.index("paciente").getAll(paciente));
    }).then(function (itens) {
      // sem o blob: a lista nao precisa carregar megabytes na memoria
      return itens.map(function (i) {
        return { id: i.id, nome: i.nome, tipo: i.tipo, data: i.data,
                 mime: i.mime, tamanho: i.tamanho };
      }).sort(function (a, b) { return (b.data || "").localeCompare(a.data || ""); });
    }).catch(function () { return []; });
  }

  function pegar(id) {
    return transacao("readonly").then(function (loja) {
      return promessa(loja.get(id));
    });
  }

  function remover(id) {
    return transacao("readwrite").then(function (loja) {
      return promessa(loja.delete(id));
    });
  }

  function espaco() {
    if (!navigator.storage || !navigator.storage.estimate) {
      return Promise.resolve(null);
    }
    return navigator.storage.estimate().then(function (e) {
      return { usado: e.usage || 0, total: e.quota || 0 };
    });
  }

  function hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return h;
  }

  function tamanhoLegivel(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  window.ArquivoStore = {
    salvar: salvar,
    listar: listar,
    pegar: pegar,
    remover: remover,
    espaco: espaco,
    tamanhoLegivel: tamanhoLegivel
  };
})();
