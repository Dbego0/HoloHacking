/* ===========================================================================
   A FICHA DO PACIENTE
   ===========================================================================

   Tudo o que o app sabe sobre uma pessoa ja estava guardado — o mapa, as
   ferramentas preenchidas, os exames, os documentos — mas espalhado por cinco
   telas. Para saber onde a Marina esta, era preciso passear por todas.

   Isto reune. E, principalmente, ACUSA o que ninguem via:

     . respondeu o questionario e nunca teve ferramenta aplicada  -> abandono
     . questionario comecado e parado no meio
     . exame alterado em sistema de que ele nao se queixa
     . mais de 4 semanas desde a ultima aplicacao (a reavaliacao venceu)

   Nada aqui calcula: le o que o motor e as telas ja gravaram.
   =========================================================================== */

(function () {
  "use strict";

  var SEM_PACIENTE = "_sem_paciente";
  var DIAS_REAVALIACAO = 28;

  var NOME_SISTEMA = {
    fungico: "Fúngico",
    acido_inflamatorio: "Ácido-Inflamatório",
    metabolico: "Metabólico",
    detox_linfatico: "Detox + Linfático",
    mental_emocional_espiritual: "Mental–Emocional–Espiritual"
  };

  function paciente() {
    try { return (window.pacienteAtivoId && window.pacienteAtivoId()) || SEM_PACIENTE; }
    catch (e) { return SEM_PACIENTE; }
  }
  function caixa(chave) {
    try { return (JSON.parse(localStorage.getItem(chave)) || {})[paciente()] || null; }
    catch (e) { return null; }
  }
  function escapar(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function diasDesde(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  /* ---------- juntar o que existe ---------------------------------------- */

  function reunir() {
    var pont = window.ultimaPontuacao ? window.ultimaPontuacao() : null;
    var historico = window.historicoPontuacao ? window.historicoPontuacao() : [];
    var ferr = caixa("holohacking.ferramentas") || {};
    var quest = caixa("holohacking.questionario") || {};
    var exames = caixa("holohacking.exames") || {};

    var preenchidas = Object.keys(ferr).filter(function (id) {
      var campos = ferr[id];
      return Object.keys(campos).some(function (k) {
        return campos[k] !== "" && campos[k] != null;
      });
    });

    var totalPerguntas = 87;
    try {
      if (window.HOLOSCOPE && window.HOLOSCOPE.questionario) {
        totalPerguntas = window.HOLOSCOPE.questionario().length;
      }
    } catch (e) { /* fica em 87 */ }

    return {
      pontuacao: pont,
      historico: historico,
      respondidas: Object.keys(quest).length,
      totalPerguntas: totalPerguntas,
      ferramentas: preenchidas,
      exames: Object.keys(exames).length,
      valoresExames: exames
    };
  }

  function nomeFerramenta(id) {
    var fixos = { oq3: "OQ³", pqq: "PQQ", mapa: "Mapa do Propósito" };
    if (fixos[id]) return fixos[id];
    var lista = window.CATALOGO_FERRAMENTAS || [];
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === id) return lista[i].titulo;
    }
    return id;
  }

  /* ---------- o que precisa de atencao ----------------------------------- */

  function alertas(d) {
    var saida = [];

    if (!d.pontuacao && d.respondidas === 0) {
      saida.push({ grau: "abrir", texto: "Sem HOLOSCOPE aplicado.",
                   acao: "holoscope", botao: "Aplicar agora" });
    } else if (!d.pontuacao && d.respondidas > 0) {
      saida.push({ grau: "aviso",
                   texto: "Questionário parado em " + d.respondidas + " de " +
                          d.totalPerguntas + " — o mapa não foi gerado.",
                   acao: "holoscope", botao: "Continuar" });
    }

    // o achado que ninguem via: mapeado e nunca conduzido
    if (d.pontuacao && d.ferramentas.length === 0) {
      saida.push({ grau: "aviso",
                   texto: "O mapa foi feito e nenhuma ferramenta foi aplicada. " +
                          "Sem conduta, o diagnóstico não vira jornada.",
                   acao: "holoscope", botao: "Ver por onde começar" });
    }

    if (d.pontuacao && d.pontuacao.quando) {
      var dias = diasDesde(d.pontuacao.quando);
      if (dias !== null && dias >= DIAS_REAVALIACAO) {
        saida.push({ grau: "aviso",
                     texto: "Última aplicação há " + dias + " dias. " +
                            "A reavaliação de 4 semanas venceu.",
                     acao: "holoscope", botao: "Reaplicar" });
      }
    }

    // exame alterado onde ele nao se queixa
    if (d.exames > 0 && d.pontuacao && window.HOLOSCOPE && window.HOLOSCOPE.lerExames) {
      var notas = {};
      d.pontuacao.sistemas.forEach(function (s) { notas[s.sistema] = s.nota; });
      try {
        var r = window.HOLOSCOPE.lerExames(d.valoresExames, notas);
        var divergem = r.confronto.filter(function (c) { return c.concordancia === "diverge"; });
        divergem.forEach(function (c) {
          saida.push({ grau: "aviso",
                       texto: "Sistema " + (NOME_SISTEMA[c.sistema] || c.sistema) +
                              ": relato e exame não batem.",
                       acao: "aba:exames", botao: "Ver exames" });
        });
      } catch (e) { /* sem alerta e melhor do que alerta errado */ }
    }

    return saida;
  }

  /* ---------- desenhar ---------------------------------------------------- */

  function desenhar() {
    var alvo = document.getElementById("ficha-resumo");
    if (!alvo) return;
    var d = reunir();
    var html = "";

    // --- alertas primeiro: e o que ela precisa ver ---
    var av = alertas(d);
    if (av.length > 0) {
      html += '<div class="fic-alertas">';
      av.forEach(function (a) {
        html += '<div class="fic-alerta ' + a.grau + '">' +
          "<span>" + escapar(a.texto) + "</span>" +
          '<button type="button" class="fic-ir" data-ir="' + a.acao + '">' +
          escapar(a.botao) + "</button></div>";
      });
      html += "</div>";
    }

    // --- o mapa ---
    if (d.pontuacao) {
      var p = d.pontuacao;
      html += '<div class="fic-mapa"><div class="fic-indice">' +
        '<span class="fic-rot">Índice HOLOS</span>' +
        '<b>' + p.indice + "</b><span class=\"fic-de\">de " + p.indice_maximo + "</span>" +
        (p.quando ? '<span class="fic-quando">' +
          escapar(p.quando.split("-").reverse().join("/")) + "</span>" : "") +
        "</div>";

      if (p.triada) {
        html += '<div class="fic-triada">' +
          ["fisico", "mental", "espiritual"].map(function (e) {
            return "<span><i>" + e[0].toUpperCase() + e.slice(1) + "</i>" +
                   p.triada[e].toFixed(1) + "</span>";
          }).join("") + "</div>";
      }

      var piores = p.sistemas.slice().sort(function (a, b) { return a.nota - b.nota; }).slice(0, 2);
      html += '<div class="fic-piores"><span class="fic-rot">Mais baixos</span>' +
        piores.map(function (s) {
          return "<span class=\"fic-sis\">" + escapar(s.nome) +
                 " <b>" + s.nota.toFixed(1) + "</b></span>";
        }).join("") + "</div>";
      html += "</div>";

      if (p.combinacoes && p.combinacoes.length > 0) {
        html += '<p class="fic-combinada">&ldquo;' +
          escapar(p.combinacoes[0].leitura) + "&rdquo;</p>";
      }
    }

    // --- o que ja foi feito ---
    html += '<div class="fic-linhas">';
    html += linha("Questionário",
      d.respondidas === 0 ? "não aplicado"
        : d.respondidas + " de " + d.totalPerguntas + " respondidas",
      d.respondidas >= d.totalPerguntas, "holoscope");
    html += linha("Ferramentas aplicadas",
      d.ferramentas.length === 0 ? "nenhuma"
        : d.ferramentas.length + " de 30",
      d.ferramentas.length > 0, "corpo");
    html += linha("Exames",
      d.exames === 0 ? "nenhum valor" : d.exames + " preenchidos",
      d.exames > 0, "aba:exames");
    html += '<div class="fic-linha" id="fic-docs">' +
      '<span class="fic-nome">Documentos</span>' +
      '<span class="fic-valor">carregando…</span></div>';
    html += "</div>";

    if (d.ferramentas.length > 0) {
      html += '<div class="fic-ferramentas"><span class="fic-rot">O que já foi aplicado</span>' +
        d.ferramentas.map(function (id) {
          return '<button type="button" class="fic-chip" data-ferr="' + escapar(id) + '">' +
                 escapar(nomeFerramenta(id)) + "</button>";
        }).join("") + "</div>";
    }

    alvo.innerHTML = html;
    contarDocumentos();
    ligar(alvo);
  }

  function linha(nome, valor, feito, ir) {
    return '<div class="fic-linha' + (feito ? " feito" : "") + '">' +
      '<span class="fic-nome">' + nome + "</span>" +
      '<span class="fic-valor">' + valor + "</span>" +
      '<button type="button" class="fic-ir-min" data-ir="' + ir + '">abrir</button></div>';
  }

  function contarDocumentos() {
    var el = document.getElementById("fic-docs");
    if (!el || !window.ArquivoStore) return;
    window.ArquivoStore.listar(paciente()).then(function (itens) {
      el.classList.toggle("feito", itens.length > 0);
      el.innerHTML = '<span class="fic-nome">Documentos</span>' +
        '<span class="fic-valor">' +
        (itens.length === 0 ? "nenhum" : itens.length + " arquivo(s)") + "</span>" +
        '<button type="button" class="fic-ir-min" data-ir="aba:documentos">abrir</button>';
    });
  }

  function ligar(alvo) {
    alvo.addEventListener("click", function (ev) {
      var ir = ev.target.closest("[data-ir]");
      if (ir) {
        // "aba:x" abre uma aba aqui mesmo; o resto e secao do menu
        if (ir.dataset.ir.indexOf("aba:") === 0) {
          var aba = document.querySelector('[data-aba="' + ir.dataset.ir.slice(4) + '"]');
          if (aba) { aba.click(); aba.scrollIntoView({ block: "center" }); }
          return;
        }
        var b = document.querySelector('.nav-item[data-secao="' + ir.dataset.ir + '"]');
        if (b) b.click();
        return;
      }
      var f = ev.target.closest("[data-ferr]");
      if (f && window.abrirFerramentaPorId) window.abrirFerramentaPorId(f.dataset.ferr);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var ficha = document.querySelector("#vista-ficha .ficha-grade");
    if (!ficha) return;
    var caixaNova = document.createElement("div");
    caixaNova.id = "ficha-resumo";
    caixaNova.className = "ficha-resumo";
    ficha.parentNode.insertBefore(caixaNova, ficha);

    desenhar();
    var anterior = window.aoTrocarPaciente;
    window.aoTrocarPaciente = function () {
      if (typeof anterior === "function") anterior();
      desenhar();
    };
    // abrir a ficha de alguem redesenha
    document.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-paciente], .card-paciente, .pac-item")) {
        setTimeout(desenhar, 60);
      }
    });
  });

  window.redesenharFicha = desenhar;
})();
