/* ===========================================================================
   QUESTIONARIO DO HOLOSCOPE — as 87 perguntas
   ===========================================================================

   As perguntas NAO estao escritas aqui. Vem de HOLOSCOPE.questionario(), que
   as le do banco de marcadores. Quando o Rodrigo corrigir uma pergunta no CSV,
   ela muda na tela sem ninguem tocar em codigo.

   Tres blocos, que sao as tres subferramentas do material:
     BioRoot    sintomas do corpo      51
     NeuroScan  emocoes e padroes      20
     SoulIndex  terreno espiritual     16

   Escala 0 a 3, quatro botoes. Nao e campo de digitar: consulta de 15 minutos
   nao comporta escrever 87 vezes.

   As respostas sao guardadas a cada toque, por paciente. Fechar no meio e
   voltar depois nao perde nada — 15 minutos de consulta nao podem ir embora
   por um clique errado.

   Ao calcular, quem pontua e o motor: HOLOSCOPE.calcular() devolve indice,
   notas, Triada e combinacoes. Esta tela nao decide nada.
   =========================================================================== */

(function () {
  "use strict";

  var CHAVE = "holohacking.questionario";
  var ESCALA = ["Nunca", "Às vezes", "Frequente", "Sempre"];
  var SEM_PACIENTE = "_sem_paciente";

  var BLOCOS = [
    { origem: "sintoma",    sigla: "BioRoot",   titulo: "Raízes físicas",
      sub: "inflamação, metabolismo, detox, microbiota" },
    { origem: "emocao",     sigla: "NeuroScan", titulo: "Padrões emocionais",
      sub: "ansiedade, sabotadores, gatilhos" },
    { origem: "espiritual", sigla: "SoulIndex", titulo: "Terreno espiritual",
      sub: "alinhamento, propósito, energia vital" }
  ];

  var perguntas = null;      // as 87, carregadas do motor uma vez
  var caixa = null;

  function motorPronto() {
    return !!(window.HOLOSCOPE && window.HOLOSCOPE.questionario);
  }

  function pacienteAtual() {
    try {
      return (window.pacienteAtivoId && window.pacienteAtivoId()) || SEM_PACIENTE;
    } catch (e) { return SEM_PACIENTE; }
  }

  /* ---------- guardar (hoje no navegador; depois no Supabase) ------------ */

  function tudo() {
    try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; }
    catch (e) { return {}; }
  }
  function respostasDoPaciente() {
    return tudo()[pacienteAtual()] || {};
  }
  function gravar(marcadorId, valor) {
    var t = tudo(), p = pacienteAtual();
    if (!t[p]) t[p] = {};
    t[p][marcadorId] = valor;
    localStorage.setItem(CHAVE, JSON.stringify(t));
  }
  function limpar() {
    var t = tudo();
    delete t[pacienteAtual()];
    localStorage.setItem(CHAVE, JSON.stringify(t));
  }

  /* ---------- desenhar --------------------------------------------------- */

  function escapar(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function desenhar() {
    if (!motorPronto()) {
      caixa.innerHTML = '<p class="q-erro">O motor não carregou. ' +
        "Sem ele não há perguntas — confira se holoscope.js está sendo servido.</p>";
      return;
    }
    if (!perguntas) perguntas = window.HOLOSCOPE.questionario();

    var dadas = respostasDoPaciente();
    var html = '<div class="q-topo">' +
      '<div class="q-progresso"><i></i></div>' +
      '<div class="q-linha"><span class="q-conta"></span>' +
      '<span class="q-acoes">' +
      '<button type="button" class="btn-fantasma" data-acao="limpar">Limpar</button>' +
      '<button type="button" class="btn-verde" data-acao="calcular">Gerar o mapa</button>' +
      "</span></div></div>";

    for (var b = 0; b < BLOCOS.length; b++) {
      var bloco = BLOCOS[b];
      var doBloco = perguntas.filter(function (p) { return p.origem === bloco.origem; });
      html += '<div class="q-bloco"><div class="q-bloco-cabeca">' +
        "<b>" + bloco.sigla + "</b><span>" + bloco.titulo + " &middot; " + bloco.sub + "</span>" +
        '<em>' + doBloco.length + " perguntas</em></div>";

      for (var i = 0; i < doBloco.length; i++) {
        var q = doBloco[i];
        var v = dadas[q.id];
        html += '<div class="q-item" data-marcador="' + q.id + '">' +
          '<p class="q-pergunta">' + escapar(q.pergunta) + "</p>" +
          '<div class="q-botoes">';
        for (var k = 0; k < 4; k++) {
          html += '<button type="button" class="q-btn' +
            (String(v) === String(k) ? " marcado" : "") +
            '" data-valor="' + k + '"><b>' + k + "</b>" + ESCALA[k] + "</button>";
        }
        html += "</div></div>";
      }
      html += "</div>";
    }

    html += '<div class="q-resultado" id="q-resultado"></div>';
    caixa.innerHTML = html;
    ligar();
    atualizarProgresso();
  }

  function atualizarProgresso() {
    if (!perguntas) return;
    var n = Object.keys(respostasDoPaciente()).length;
    var pc = Math.round(n / perguntas.length * 100);
    var barra = caixa.querySelector(".q-progresso i");
    if (barra) barra.style.width = pc + "%";
    var conta = caixa.querySelector(".q-conta");
    if (conta) {
      conta.innerHTML = "<b>" + n + "</b> de " + perguntas.length + " respondidas" +
        (n === perguntas.length ? " &middot; completo" : "");
    }
  }

  function ligar() {
    caixa.addEventListener("click", function (ev) {
      var b = ev.target.closest(".q-btn");
      if (b) {
        var item = b.closest(".q-item");
        item.querySelectorAll(".q-btn").forEach(function (x) { x.classList.remove("marcado"); });
        b.classList.add("marcado");
        gravar(item.dataset.marcador, Number(b.dataset.valor));
        atualizarProgresso();
        return;
      }
      var acao = ev.target.closest("[data-acao]");
      if (!acao) return;
      if (acao.dataset.acao === "limpar") {
        limpar();
        desenhar();
      } else if (acao.dataset.acao === "calcular") {
        calcular();
      }
    });
  }

  /* ---------- calcular: daqui em diante quem manda e o motor ------------- */

  function calcular() {
    var dadas = respostasDoPaciente();
    var respostas = Object.keys(dadas).map(function (id) {
      return { marcador_id: id, intensidade: dadas[id] };
    });
    if (respostas.length === 0) {
      mostrarAviso("Responda ao menos uma pergunta para gerar o mapa.");
      return;
    }

    var r;
    try {
      r = window.HOLOSCOPE.calcular(respostas);
    } catch (e) {
      mostrarAviso("O motor recusou as respostas: " + e.message);
      return;
    }

    if (typeof window.aplicarPontuacao !== "function") {
      mostrarAviso("A tela do mapa não esta pronta para receber o resultado.");
      return;
    }
    // aplicarPontuacao desenha o mapa e fecha o questionario
    window.aplicarPontuacao(r);
    var radar = document.querySelector("#secao-holoscope #radar-svg");
    if (radar) radar.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function mostrarAviso(txt) {
    var alvo = document.getElementById("q-resultado");
    if (alvo) alvo.innerHTML = '<p class="q-erro">' + escapar(txt) + "</p>";
  }

  /* ---------- abrir e fechar --------------------------------------------- */

  function abrir() {
    document.getElementById("holoscope-manual").classList.add("hidden");
    document.getElementById("holoscope-questionario").classList.remove("hidden");
    desenhar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function fechar() {
    document.getElementById("holoscope-questionario").classList.add("hidden");
    document.getElementById("holoscope-manual").classList.remove("hidden");
  }

  document.addEventListener("DOMContentLoaded", function () {
    caixa = document.getElementById("q-lista");
    if (!caixa) return;
    var abrirBtn = document.getElementById("btn-abrir-questionario");
    if (abrirBtn) abrirBtn.addEventListener("click", abrir);
    var voltar = document.getElementById("btn-voltar-manual");
    if (voltar) voltar.addEventListener("click", fechar);

    // trocar de paciente troca o questionario inteiro
    var anterior = window.aoTrocarPaciente;
    window.aoTrocarPaciente = function () {
      if (typeof anterior === "function") anterior();
      if (!document.getElementById("holoscope-questionario").classList.contains("hidden")) {
        desenhar();
      }
    };
  });
})();
