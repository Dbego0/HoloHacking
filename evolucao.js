/* ===========================================================================
   EVOLUCAO — a comparacao entre duas aplicacoes
   ===========================================================================

   Era a promessa central do produto desde o primeiro material — "um indice
   HOLOS que rastreia evolucao em 4, 8 e 12 semanas" — e a unica peca grande
   que nunca existiu. Ela nao existia por um motivo simples: o app guardava a
   ultima pontuacao sobrescrevendo a anterior, e sem duas nao ha o que comparar.

   Agora o historico e guardado, e isto o le. Nao calcula nada: as duas
   Pontuacoes ja vieram prontas do motor. Aqui so se faz a subtracao.

   Aparece na tela do HOLOSCOPE quando houver mais de uma aplicacao. Com uma
   so, nao aparece — comparar um ponto consigo mesmo nao diz nada.
   =========================================================================== */

(function () {
  "use strict";

  function historico() {
    return window.historicoPontuacao ? window.historicoPontuacao() : [];
  }
  function escapar(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function dataBonita(iso) {
    if (!iso) return "";
    var meses = ["jan", "fev", "mar", "abr", "mai", "jun",
                 "jul", "ago", "set", "out", "nov", "dez"];
    var p = iso.split("-");
    return p[2] + " " + meses[Number(p[1]) - 1] + " " + p[0];
  }
  function semanasEntre(a, b) {
    var d = (new Date(b) - new Date(a)) / 86400000;
    return isNaN(d) ? null : Math.round(d / 7);
  }

  /** Nome curto de cada vertice: sem eles o pentagono nao diz o que e o quê. */
  var ROTULO = {
    fungico: "Fúngico",
    acido_inflamatorio: "Inflamatório",
    metabolico: "Metabólico",
    detox_linfatico: "Detox",
    mental_emocional_espiritual: "Mental"
  };

  /** Pentagono com os dois momentos sobrepostos: o antes fica fantasma. */
  function radarDuplo(antes, depois, tam, rotulos) {
    var C = tam / 2, R = tam * .36, i, a, moldura = "", eixos = "", nomes = "";
    function pontos(valores) {
      var p = [];
      for (var k = 0; k < 5; k++) {
        var ang = -Math.PI / 2 + k * 2 * Math.PI / 5;
        var r = R * valores[k] / 10;
        p.push((C + r * Math.cos(ang)).toFixed(1) + "," + (C + r * Math.sin(ang)).toFixed(1));
      }
      return p.join(" ");
    }
    [.25, .5, .75, 1].forEach(function (f) {
      var q = [];
      for (var k = 0; k < 5; k++) {
        var g = -Math.PI / 2 + k * 2 * Math.PI / 5;
        q.push((C + R * f * Math.cos(g)).toFixed(1) + "," + (C + R * f * Math.sin(g)).toFixed(1));
      }
      moldura += '<polygon points="' + q.join(" ") + '" fill="none" ' +
                 'stroke="rgba(201,163,90,.12)" stroke-width="1"/>';
    });
    for (i = 0; i < 5; i++) {
      a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      eixos += '<line x1="' + C + '" y1="' + C + '" x2="' + (C + R * Math.cos(a)).toFixed(1) +
               '" y2="' + (C + R * Math.sin(a)).toFixed(1) +
               '" stroke="rgba(201,163,90,.14)" stroke-width="1"/>';

      // o rotulo de cada vertice, empurrado para fora e alinhado pelo lado
      var lx = C + (R + 16) * Math.cos(a), ly = C + (R + 16) * Math.sin(a);
      var ancora = Math.abs(Math.cos(a)) < .3 ? "middle" : (Math.cos(a) > 0 ? "start" : "end");
      var dy = Math.sin(a) < -.7 ? -4 : (Math.sin(a) > .7 ? 11 : 4);
      nomes += '<text x="' + lx.toFixed(1) + '" y="' + (ly + dy).toFixed(1) +
               '" text-anchor="' + ancora + '" class="evo-eixo">' +
               ((rotulos && rotulos[i]) || "") + "</text>";

      // e o ponto de agora em cada vertice, para o olho achar o valor
      var rr = R * depois[i] / 10;
      nomes += '<circle cx="' + (C + rr * Math.cos(a)).toFixed(1) + '" cy="' +
               (C + rr * Math.sin(a)).toFixed(1) + '" r="3.5" fill="var(--dourado)"/>';
    }
    return '<svg width="' + (tam + 60) + '" height="' + tam + '" viewBox="' +
           (-30) + ' 0 ' + (tam + 60) + ' ' + tam + '" class="evo-radar">' + moldura + eixos + nomes +
      '<polygon points="' + pontos(antes) + '" fill="none" ' +
      'stroke="rgba(201,163,90,.45)" stroke-width="1.5" stroke-dasharray="4 3"/>' +
      '<polygon points="' + pontos(depois) + '" fill="rgba(201,163,90,.2)" ' +
      'stroke="var(--dourado)" stroke-width="2.5" stroke-linejoin="round"/></svg>';
  }

  function desenhar() {
    var alvo = document.getElementById("holo-evolucao");
    if (!alvo) return;
    var h = historico();
    if (h.length < 2) { alvo.classList.add("hidden"); alvo.innerHTML = ""; return; }

    var antes = h[0], depois = h[h.length - 1];
    var ganho = depois.indice - antes.indice;
    var sem = semanasEntre(antes.quando, depois.quando);

    var porSistema = {};
    antes.sistemas.forEach(function (s) { porSistema[s.sistema] = { nome: s.nome, antes: s.nota }; });
    depois.sistemas.forEach(function (s) {
      if (porSistema[s.sistema]) porSistema[s.sistema].depois = s.nota;
    });
    var linhas = Object.keys(porSistema).map(function (k) {
      var x = porSistema[k];
      return { nome: x.nome, antes: x.antes, depois: x.depois,
               delta: +(x.depois - x.antes).toFixed(1) };
    }).sort(function (a, b) { return b.delta - a.delta; });

    var vAntes = antes.sistemas.map(function (s) { return s.nota; });
    var vDepois = depois.sistemas.map(function (s) { return s.nota; });

    var html =
      '<h4 class="leitura-titulo">Evolução</h4>' +
      '<div class="evo-corpo">' +
      radarDuplo(vAntes, vDepois, 250,
                 antes.sistemas.map(function (s) { return ROTULO[s.sistema] || s.nome; })) +
      '<div class="evo-numeros">' +
      '<div class="evo-indice">' +
      '<span class="evo-um"><i>' + escapar(dataBonita(antes.quando)) + "</i><b>" +
        antes.indice + "</b></span>" +
      '<span class="evo-seta">&rarr;</span>' +
      '<span class="evo-um agora"><i>' + escapar(dataBonita(depois.quando)) + "</i><b>" +
        depois.indice + "</b></span>" +
      '<span class="evo-ganho ' + (ganho >= 0 ? "sobe" : "desce") + '">' +
        (ganho >= 0 ? "+" : "") + ganho + "</span></div>" +
      '<p class="evo-frase">' +
        (sem ? "Em <b>" + sem + " semanas</b>, " : "") +
        (ganho > 0 ? "o Índice subiu <b>" + ganho + " pontos</b>."
         : ganho < 0 ? "o Índice caiu <b>" + Math.abs(ganho) + " pontos</b>."
         : "o Índice ficou igual.") +
      "</p>" +
      '<div class="evo-linhas">' +
      linhas.map(function (l) {
        var cls = l.delta > 0 ? "sobe" : l.delta < 0 ? "desce" : "igual";
        return '<div class="evo-linha"><span class="evo-nome">' + escapar(l.nome) + "</span>" +
          '<span class="evo-de">' + l.antes.toFixed(1) + "</span>" +
          '<span class="evo-para">' + l.depois.toFixed(1) + "</span>" +
          '<span class="evo-delta ' + cls + '">' +
            (l.delta > 0 ? "+" : "") + l.delta.toFixed(1) + "</span></div>";
      }).join("") +
      "</div></div></div>" +
      '<p class="evo-nota">Linha pontilhada: a primeira aplicação. ' +
      'Área cheia: a de agora.' +
      (h.length > 2 ? " Há " + h.length + " aplicações no histórico." : "") + "</p>";

    alvo.innerHTML = html;
    alvo.classList.remove("hidden");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var triada = document.getElementById("holo-triada");
    if (!triada) return;
    var caixa = document.createElement("div");
    caixa.id = "holo-evolucao";
    caixa.className = "holo-evolucao hidden";
    triada.parentNode.insertBefore(caixa, triada);

    desenhar();
    var anterior = window.aoTrocarPaciente;
    window.aoTrocarPaciente = function () {
      if (typeof anterior === "function") anterior();
      desenhar();
    };
  });

  window.redesenharEvolucao = desenhar;
})();
