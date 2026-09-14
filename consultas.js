/* ===========================================================================
   CONSULTAS — o que ja aconteceu, em ordem de tempo
   ===========================================================================

   O app guardava cada aplicacao do HOLOSCOPE dentro do paciente. Isso responde
   "como a Marina evoluiu", e responde bem. Mas nao responde "o que eu atendi
   este mes" — e essa e a pergunta de quem precisa saber se a semana rendeu,
   quem sumiu, e ha quanto tempo nao aparece ninguem.

   Aqui cada linha e uma aplicacao: a data, quem, qual aplicacao daquele
   paciente foi, o Indice e para onde ele andou desde a anterior.

   O que esta tela NAO faz, de proposito: inventar consulta. Se nao houve
   aplicacao do mapa, nao houve atendimento registrado — e aparecer uma linha
   ali diria que houve. Ferramenta preenchida tambem nao entra: ela nao guarda
   data, entao ninguem consegue dizer a que dia ela pertence.

   Nada e calculado aqui. Panorama.consultas() monta a lista a partir do mesmo
   historico que a tela de evolucao le.
   =========================================================================== */

(function () {
  "use strict";

  var alvo = null;

  function escapar(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function inicial(nome) {
    return (nome || "?").trim().charAt(0).toUpperCase();
  }

  function dataBR(iso) {
    return iso ? iso.split("-").reverse().join("/") : "—";
  }

  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
               "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  /** "setembro de 2026" — o titulo de cada faixa da lista. */
  function mesPorExtenso(iso) {
    if (!iso) return "sem data";
    var p = iso.split("-");
    return MESES[Number(p[1]) - 1] + " de " + p[0];
  }

  function ordinal(n) {
    return n + "ª aplicação";
  }

  /* ---------- os numeros do topo ----------------------------------------- */

  function blocoNumeros(lista) {
    var mesAtual = new Date().toISOString().slice(0, 7);
    var neste = lista.filter(function (c) {
      return (c.quando || "").slice(0, 7) === mesAtual;
    }).length;

    var pessoas = {};
    lista.forEach(function (c) { pessoas[c.paciente.id] = true; });
    var atendidas = Object.keys(pessoas).length;

    /* Quantos voltaram: quem tem mais de uma aplicacao. E o unico numero
       desta tela que fala de metodo e nao de volume — reavaliar em 4 semanas
       e a promessa, e este e o numero que diz se ela esta sendo cumprida. */
    var contagem = {};
    lista.forEach(function (c) {
      contagem[c.paciente.id] = (contagem[c.paciente.id] || 0) + 1;
    });
    var voltaram = Object.keys(contagem).filter(function (k) {
      return contagem[k] > 1;
    }).length;

    var tiles = [
      { n: lista.length, r: lista.length === 1 ? "atendimento" : "atendimentos" },
      { n: neste, r: "neste mês" },
      { n: atendidas, r: atendidas === 1 ? "paciente atendida" : "pacientes atendidas" },
      { n: voltaram, r: voltaram === 1 ? "voltou para reavaliar" : "voltaram para reavaliar" }
    ];

    return '<div class="dash-numeros">' + tiles.map(function (t) {
      return '<div class="dash-tile"><b>' + escapar(t.n) + "</b><span>" +
        escapar(t.r) + "</span></div>";
    }).join("") + "</div>";
  }

  /* ---------- uma linha --------------------------------------------------- */

  function linha(c) {
    /* A variacao so existe da segunda aplicacao em diante. Na primeira nao ha
       com o que comparar, e escrever "+0" ali seria afirmar que nada mudou. */
    var variacao = "";
    if (c.variacao !== null) {
      var sinal = c.variacao > 0 ? "subiu" : c.variacao < 0 ? "desceu" : "igual";
      var texto = c.variacao === 0 ? "sem mudança"
                : (c.variacao > 0 ? "+" : "") + Math.round(c.variacao * 10) / 10;
      variacao = '<span class="con-var ' + sinal + '">' + escapar(texto) + "</span>";
    }

    var baixos = c.maisBaixos.map(function (s) {
      return escapar(s.nome) + " " + (Math.round(s.nota * 10) / 10);
    }).join(" · ");

    return '<li class="con-linha">' +
      '<span class="con-dia">' + escapar(dataBR(c.quando)) + "</span>" +
      '<span class="pac-avatar">' + escapar(inicial(c.paciente.nome)) + "</span>" +
      '<span class="con-quem">' +
        "<b>" + escapar(c.paciente.nome) + "</b>" +
        '<span class="con-detalhe">' + escapar(ordinal(c.numero)) +
          (baixos ? " &middot; mais baixos: " + baixos : "") + "</span>" +
      "</span>" +
      '<span class="con-indice">' + Math.round(c.indice) +
        '<i>Índice</i></span>' +
      variacao +
      '<button type="button" class="dash-ir" data-paciente="' +
        escapar(c.paciente.id) + '">Abrir ficha <span aria-hidden="true">&rarr;</span></button>' +
      "</li>";
  }

  /* ---------- desenhar ---------------------------------------------------- */

  function desenhar() {
    if (!alvo || !window.Panorama || !window.Panorama.consultas) return;

    var lista;
    try { lista = window.Panorama.consultas(); }
    catch (e) { alvo.innerHTML = ""; return; }

    var cabeca =
      '<div class="secao-cabeca">' +
        '<span class="eyebrow">Atendimento &mdash; histórico</span>' +
        "<h2>Suas <em>consultas</em></h2>" +
        "<p>Cada aplicação do HOLOSCOPE® é um atendimento registrado. " +
        "Esta é a linha do tempo da sua carteira inteira, da mais recente para a mais antiga.</p>" +
      "</div>";

    if (lista.length === 0) {
      alvo.innerHTML = cabeca +
        '<p class="dash-vazio">Nenhum atendimento registrado ainda. ' +
        "A primeira consulta aparece aqui assim que você aplicar o HOLOSCOPE® em alguém.</p>" +
        '<div class="dash-primeiro">' +
          "<p>O mapa é o que transforma a conversa em registro.</p>" +
          '<button type="button" class="btn-verde" data-secao-destino="holoscope">' +
          "Aplicar o HOLOSCOPE®</button>" +
        "</div>";
      ligar();
      return;
    }

    // agrupado por mes: e assim que quem atende procura ("o que fiz em agosto?")
    var html = cabeca + blocoNumeros(lista);
    var mesCorrente = null;

    lista.forEach(function (c) {
      var mes = (c.quando || "").slice(0, 7);
      if (mes !== mesCorrente) {
        if (mesCorrente !== null) html += "</ul></div>";
        mesCorrente = mes;
        html += '<div class="dash-bloco"><h3 class="dash-titulo">' +
                escapar(mesPorExtenso(c.quando)) + "</h3>" +
                '<ul class="con-lista">';
      }
      html += linha(c);
    });
    if (mesCorrente !== null) html += "</ul></div>";

    alvo.innerHTML = html;
    ligar();
  }

  function ligar() {
    alvo.querySelectorAll("[data-paciente]").forEach(function (b) {
      b.addEventListener("click", function () {
        var pid = b.dataset.paciente;
        if (window.definirPacienteAtivo) window.definirPacienteAtivo(pid);
        if (window.abrirFichaDe) window.abrirFichaDe(pid);
      });
    });
    alvo.querySelectorAll("[data-secao-destino]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (window.irParaSecao) window.irParaSecao(b.dataset.secaoDestino);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    alvo = document.getElementById("consultas-corpo");
    if (!alvo) return;

    // derivada da carteira: muda quando a carteira muda
    var anterior = window.aoTrocarPaciente;
    window.aoTrocarPaciente = function () {
      if (typeof anterior === "function") anterior();
      desenhar();
    };
    desenhar();
  });

  window.redesenharConsultas = desenhar;
})();
