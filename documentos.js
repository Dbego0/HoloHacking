/* ===========================================================================
   DOCUMENTOS — todos os arquivos da carteira, num lugar so
   ===========================================================================

   A ficha ja tem uma aba de documentos, e ela esta certa: quando a conversa e
   sobre a Marina, o que importa e o exame DA Marina.

   Mas ha uma pergunta que essa aba nunca responde, porque ela e de fora do
   paciente: "onde esta aquele laudo?". Para achar um arquivo sem lembrar de
   quem ele era, era preciso abrir ficha por ficha.

   Esta tela le o mesmo IndexedDB — nao existe segunda copia de nada. O que ela
   acrescenta e a travessia: todos os pacientes de uma vez, filtro por tipo, e
   o quanto de espaco isso tudo ja ocupa neste navegador.

   LGPD: exame e laudo sao dado pessoal sensivel. Continuam sem sair daqui,
   como em arquivo-store.js — esta tela so os lista, e remover remove de vez.
   =========================================================================== */

(function () {
  "use strict";

  /* As imagens do perfil profissional moram no mesmo armazem dos exames, sob
     este dono. Elas nao sao documento de paciente e nao entram nesta tela. */
  var DONO_PERFIL = "_perfil";

  var alvo = null;
  var filtroTipo = "";       // "" = todos
  var filtroTexto = "";
  var ligado = false;

  function escapar(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function dataBR(iso) {
    return iso ? iso.split("-").reverse().join("/") : "sem data";
  }

  /** Nome de quem o arquivo e. Paciente apagado deixa arquivo orfao, e a tela
      precisa dizer isso em vez de mostrar um id cru. */
  function nomeDe(pid) {
    if (!pid || pid === "_sem_paciente") return "sem paciente";
    var todos = (window.pacientesTodos && window.pacientesTodos()) || [];
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].id === pid) return todos[i].nome;
    }
    return "paciente removido";
  }

  /* ---------- desenhar ---------------------------------------------------- */

  function desenhar() {
    if (!alvo || !window.ArquivoStore || !window.ArquivoStore.listarTudo) return;

    window.ArquivoStore.listarTudo().then(function (todos) {
      var itens = todos.filter(function (d) { return d.paciente !== DONO_PERFIL; });
      window.ArquivoStore.espaco().then(function (e) {
        pintar(itens, e);
      });
    });
  }

  /** Quanto do navegador isto ocupa, sem fingir precisao que nao existe. */
  function pedaco(bytes, espaco) {
    if (!espaco || !espaco.total) return "—";
    var pct = bytes / espaco.total * 100;
    if (pct > 0 && pct < 0.1) return "< 0,1%";
    return String(Math.round(pct * 10) / 10).replace(".", ",") + "%";
  }

  function pintar(todos, espaco) {
    var cabeca =
      '<div class="secao-cabeca">' +
        '<span class="eyebrow">Atendimento &mdash; arquivos</span>' +
        "<h2>Seus <em>documentos</em></h2>" +
        "<p>Exames, laudos e receitas de todos os pacientes. " +
        "Os mesmos arquivos que aparecem na ficha de cada um &mdash; aqui dá para " +
        "procurar sem saber de quem era.</p>" +
      "</div>";

    if (todos.length === 0) {
      alvo.innerHTML = cabeca +
        '<p class="dash-vazio">Nenhum documento guardado ainda. ' +
        "Os arquivos entram pela ficha do paciente, na aba Documentos.</p>";
      return;
    }

    var tipos = {};
    todos.forEach(function (d) { tipos[d.tipo || "Outro"] = true; });

    var busca = filtroTexto.toLowerCase();
    var lista = todos.filter(function (d) {
      if (filtroTipo && (d.tipo || "Outro") !== filtroTipo) return false;
      if (!busca) return true;
      return (d.nome || "").toLowerCase().indexOf(busca) >= 0 ||
             nomeDe(d.paciente).toLowerCase().indexOf(busca) >= 0;
    });

    var bytes = todos.reduce(function (a, d) { return a + (d.tamanho || 0); }, 0);
    var pessoas = {};
    todos.forEach(function (d) { pessoas[d.paciente] = true; });

    var tiles = [
      { n: todos.length, r: todos.length === 1 ? "documento" : "documentos" },
      { n: Object.keys(pessoas).length, r: "pacientes com arquivo" },
      { n: window.ArquivoStore.tamanhoLegivel(bytes), r: "ocupados" },
      { n: pedaco(bytes, espaco), r: "do espaço deste navegador" }
    ];

    var opcoes = '<option value="">Todos os tipos</option>' +
      Object.keys(tipos).sort().map(function (t) {
        return '<option value="' + escapar(t) + '"' +
               (t === filtroTipo ? " selected" : "") + ">" + escapar(t) + "</option>";
      }).join("");

    var html = cabeca +
      '<div class="dash-numeros">' + tiles.map(function (t) {
        return '<div class="dash-tile"><b>' + escapar(t.n) + "</b><span>" +
          escapar(t.r) + "</span></div>";
      }).join("") + "</div>" +

      '<div class="acoes-topo doc-filtros">' +
        '<div class="campo-busca" style="max-width:320px">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
          '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
          '<input type="search" id="busca-documentos" placeholder="Buscar por arquivo ou paciente..." ' +
          'aria-label="Buscar documento" autocomplete="off" value="' + escapar(filtroTexto) + '">' +
        "</div>" +
        '<select id="filtro-tipo-doc" aria-label="Filtrar por tipo">' + opcoes + "</select>" +
      "</div>";

    if (lista.length === 0) {
      html += '<p class="dash-vazio">Nenhum documento com esse filtro.</p>';
    } else {
      html += '<ul class="doc-todos">' + lista.map(function (d) {
        return '<li class="doc-todos-item">' +
          '<span class="doc-tipo">' + escapar(d.tipo || "Outro") + "</span>" +
          '<span class="doc-todos-nome"><b>' + escapar(d.nome) + "</b>" +
            '<span class="doc-todos-dono">' + escapar(nomeDe(d.paciente)) + "</span></span>" +
          '<span class="doc-data">' + escapar(dataBR(d.data)) + "</span>" +
          '<span class="doc-tam">' + window.ArquivoStore.tamanhoLegivel(d.tamanho) + "</span>" +
          '<button type="button" class="doc-abrir" data-abrir="' + escapar(d.id) + '">abrir</button>' +
          '<button type="button" class="doc-tirar" data-tirar="' + escapar(d.id) +
            '" aria-label="Remover ' + escapar(d.nome) + '">&times;</button>' +
          "</li>";
      }).join("") + "</ul>";
    }

    alvo.innerHTML = html;
    ligar();
  }

  /* ---------- ligar ------------------------------------------------------- */

  function ligar() {
    var busca = alvo.querySelector("#busca-documentos");
    if (busca) {
      busca.addEventListener("input", function () {
        filtroTexto = busca.value;
        desenhar();
        // redesenhar troca o campo: devolver o cursor para quem esta digitando
        var novo = alvo.querySelector("#busca-documentos");
        if (novo) { novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); }
      });
    }

    var tipo = alvo.querySelector("#filtro-tipo-doc");
    if (tipo) {
      tipo.addEventListener("change", function () {
        filtroTipo = tipo.value;
        desenhar();
      });
    }

    // Os campos sao recriados a cada desenho e precisam ser religados; o
    // clique e delegado no container, que NAO e recriado — ligar de novo
    // empilharia um listener por redesenho, e um clique abriria o arquivo
    // tantas vezes quantas a tela tivesse sido pintada.
    if (ligado) return;
    ligado = true;

    alvo.addEventListener("click", function (ev) {
      var abrir = ev.target.closest("[data-abrir]");
      if (abrir) {
        window.ArquivoStore.pegar(abrir.dataset.abrir).then(function (r) {
          if (!r || !r.arquivo) return;
          var url = URL.createObjectURL(r.arquivo);
          window.open(url, "_blank");
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        });
        return;
      }
      var tirar = ev.target.closest("[data-tirar]");
      if (tirar) {
        window.ArquivoStore.remover(tirar.dataset.tirar).then(desenhar);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    alvo = document.getElementById("documentos-corpo");
    if (!alvo) return;

    var anterior = window.aoTrocarPaciente;
    window.aoTrocarPaciente = function () {
      if (typeof anterior === "function") anterior();
      desenhar();
    };
    desenhar();
  });

  window.redesenharDocumentos = desenhar;
})();
