/* ===========================================================================
   RENDERIZADOR DE FERRAMENTAS
   ===========================================================================

   Le uma ferramenta do CATALOGO_FERRAMENTAS e monta a tela dela.
   Uma tela so serve as 27 — nao existe HTML escrito a mao por ferramenta.

   ONDE AS RESPOSTAS FICAM
   Hoje: no proprio navegador (localStorage).
   Depois: no Supabase, tabela ferramentas_respostas. Sao as duas funcoes
   marcadas com [SUPABASE] la embaixo — nada mais no arquivo precisa mudar.
   =========================================================================== */

(function () {
  "use strict";

  var CHAVE = "holohacking.ferramentas";
  var ESCALA = ["Nunca", "As vezes", "Frequente", "Sempre"];
  var MODULOS = { corpo: "Corpo", mente: "Mente", espirito: "Espírito" };

  function catalogo(id) {
    var lista = window.CATALOGO_FERRAMENTAS || [];
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === id) return lista[i];
    }
    return null;
  }

  /* ---------- [SUPABASE] guardar e buscar -------------------------------

     As respostas sao guardadas por PACIENTE. Antes ficavam numa chave unica,
     entao preencher a mesma ferramenta para o segundo paciente apagava o
     primeiro — sem barulho nenhum, porque a tela nao mostrava de quem era.

     Formato:
       { "<paciente_id>": { "<ferramenta_id>": { campo: valor } } }

     Quem nao tem paciente selecionado cai em SEM_PACIENTE. Isso mantem a
     ferramenta utilizavel solta e o modo demonstracao funcionando.

     Na ida para o Supabase, a tabela ferramentas_respostas ja nasce com a
     coluna paciente_id e estas tres funcoes sao as unicas que mudam.
     --------------------------------------------------------------------- */

  var SEM_PACIENTE = "_sem_paciente";

  function pacienteAtual() {
    try {
      return (window.pacienteAtivoId && window.pacienteAtivoId()) || SEM_PACIENTE;
    } catch (e) {
      return SEM_PACIENTE;
    }
  }

  function tudo() {
    var bruto;
    try {
      bruto = JSON.parse(localStorage.getItem(CHAVE)) || {};
    } catch (e) {
      return {};
    }
    // formato antigo era { ferramenta_id: {...} }; recolhe para SEM_PACIENTE
    var conhecidas = (window.CATALOGO_FERRAMENTAS || []).map(function (f) { return f.id; });
    var antigo = Object.keys(bruto).some(function (k) { return conhecidas.indexOf(k) !== -1; });
    if (antigo) {
      var migrado = {};
      migrado[SEM_PACIENTE] = bruto;
      localStorage.setItem(CHAVE, JSON.stringify(migrado));
      return migrado;
    }
    return bruto;
  }

  function lerRespostas(ferramentaId) {
    var t = tudo();
    return (t[pacienteAtual()] || {})[ferramentaId] || {};
  }

  function gravarRespostas(ferramentaId, dados) {
    var t = tudo();
    var chave = pacienteAtual();
    if (!t[chave]) t[chave] = {};
    t[chave][ferramentaId] = dados;
    localStorage.setItem(CHAVE, JSON.stringify(t));
  }

  /* ---------- desenhar um campo ----------------------------------------- */

  function escapar(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function campoHTML(campo, valor) {
    var nome = "campo-" + campo.id;
    var dica = campo.dica ? '<span class="dica">' + escapar(campo.dica) + "</span>" : "";
    var ctrl = "";
    var i;

    if (campo.tipo === "textarea") {
      ctrl = '<textarea id="' + nome + '" rows="' + (campo.grande ? 12 : 4) + '">' + escapar(valor) + "</textarea>";

    } else if (campo.tipo === "escala") {
      ctrl = '<div class="grupo-escala" data-campo="' + campo.id + '">';
      for (i = 0; i < ESCALA.length; i++) {
        ctrl += '<button type="button" class="btn-escala' + (String(valor) === String(i) ? " marcado" : "") +
                '" data-valor="' + i + '"><b>' + i + "</b>" + ESCALA[i] + "</button>";
      }
      ctrl += "</div>";

    } else if (campo.tipo === "nota") {
      var n = (valor === "" || valor == null) ? 5 : valor;
      ctrl = '<div class="grupo-nota">' +
             '<input type="range" id="' + nome + '" min="0" max="10" step="1" value="' + escapar(n) + '">' +
             '<output data-para="' + nome + '">' + escapar(n) + "</output></div>";

    } else if (campo.tipo === "opcoes") {
      ctrl = '<div class="grupo-opcoes" data-campo="' + campo.id + '">';
      for (i = 0; i < campo.opcoes.length; i++) {
        ctrl += '<button type="button" class="btn-opcao' + (valor === campo.opcoes[i] ? " marcado" : "") +
                '" data-valor="' + escapar(campo.opcoes[i]) + '">' + escapar(campo.opcoes[i]) + "</button>";
      }
      ctrl += "</div>";

    } else if (campo.tipo === "data") {
      ctrl = '<input type="date" id="' + nome + '" value="' + escapar(valor) + '">';

    } else if (campo.tipo === "numero") {
      ctrl = '<input type="number" id="' + nome + '" value="' + escapar(valor) + '">';

    } else {
      ctrl = '<input type="text" id="' + nome + '" value="' + escapar(valor) + '">';
    }

    return '<div class="grupo tipo-' + campo.tipo + '">' +
           '<label for="' + nome + '">' + escapar(campo.rotulo) + "</label>" +
           dica + ctrl + "</div>";
  }

  /** Sem isto, quem preenche nao sabe para quem esta preenchendo. */
  function faixaPaciente() {
    var nome = null;
    try { nome = window.pacienteAtivoNome && window.pacienteAtivoNome(); } catch (e) {}
    if (nome) {
      return '<p class="form-sub">Preenchendo para <b class="form-paciente">' +
             escapar(nome) + "</b>. Preencha durante ou logo após o atendimento.</p>";
    }
    return '<p class="form-sub form-sem-paciente">Nenhum paciente selecionado — ' +
           "as respostas ficam soltas. Escolha um paciente em Pacientes para " +
           "guardar na ficha dele.</p>";
  }

  /* ---------- desenhar a ferramenta inteira ------------------------------ */

  function desenhar(ferramenta, alvo) {
    var r = lerRespostas(ferramenta.id);
    var campos = "";
    for (var i = 0; i < ferramenta.campos.length; i++) {
      var c = ferramenta.campos[i];
      campos += campoHTML(c, r[c.id] || "");
    }

    alvo.innerHTML =
      '<button class="btn-voltar" type="button">&larr; Voltar as ferramentas</button>' +
      '<div class="secao-cabeca">' +
        '<span class="eyebrow">' + MODULOS[ferramenta.modulo] + " - Ferramenta " + ferramenta.numero + "</span>" +
        "<h2>" + escapar(ferramenta.titulo) + " &mdash; <em>" + escapar(ferramenta.chamada) + "</em></h2>" +
        "<p>" + escapar(ferramenta.descricao) + "</p>" +
      "</div>" +
      '<div class="form-ferramenta">' +
        faixaPaciente() +
        '<div class="campos">' + campos + "</div>" +
        '<div class="acoes-form">' +
          '<button class="btn-verde" type="button" data-acao="salvar">Salvar</button>' +
          '<span class="aviso-salvo" data-papel="aviso"></span>' +
        "</div>" +
      "</div>";

    ligar(ferramenta, alvo);
  }

  /* ---------- comportamento --------------------------------------------- */

  function ligar(ferramenta, alvo) {
    // escala e opcoes: um botao marcado por grupo
    var grupos = alvo.querySelectorAll(".grupo-escala, .grupo-opcoes");
    for (var g = 0; g < grupos.length; g++) {
      grupos[g].addEventListener("click", function (ev) {
        var b = ev.target.closest("button");
        if (!b) return;
        var irmaos = this.querySelectorAll("button");
        for (var k = 0; k < irmaos.length; k++) irmaos[k].classList.remove("marcado");
        b.classList.add("marcado");
      });
    }

    // regua: o numero ao lado acompanha
    var reguas = alvo.querySelectorAll('input[type="range"]');
    for (var s = 0; s < reguas.length; s++) {
      reguas[s].addEventListener("input", function () {
        var saida = alvo.querySelector('output[data-para="' + this.id + '"]');
        if (saida) saida.textContent = this.value;
      });
    }

    alvo.querySelector(".btn-voltar").addEventListener("click", function () {
      var vistas = document.querySelectorAll(".vista-ferramenta");
      for (var v = 0; v < vistas.length; v++) vistas[v].classList.add("hidden");
      var secao = alvo.closest(".secao");
      var gal = secao.querySelector(".galeria-ferramentas");
      if (gal) gal.classList.remove("hidden");
      var cab = secao.querySelector(".cabeca-modulo");
      if (cab) cab.classList.remove("hidden");
      var bus = secao.querySelector(".barra-busca");
      if (bus) bus.classList.remove("hidden");
      aberta = null;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    alvo.querySelector('[data-acao="salvar"]').addEventListener("click", function () {
      gravarRespostas(ferramenta.id, colher(ferramenta, alvo));
      var aviso = alvo.querySelector('[data-papel="aviso"]');
      aviso.textContent = "Salvo.";
      marcarCard(ferramenta.id);
      setTimeout(function () { aviso.textContent = ""; }, 2600);
    });
  }

  function colher(ferramenta, alvo) {
    var dados = {};
    for (var i = 0; i < ferramenta.campos.length; i++) {
      var c = ferramenta.campos[i];
      var v = "";
      if (c.tipo === "escala" || c.tipo === "opcoes") {
        var m = alvo.querySelector('[data-campo="' + c.id + '"] .marcado');
        v = m ? m.dataset.valor : "";
      } else {
        var el = alvo.querySelector("#campo-" + c.id);
        v = el ? el.value : "";
      }
      dados[c.id] = v;
    }
    return dados;
  }

  /* ---------- selo de preenchida na galeria ------------------------------ */

  function preenchida(id) {
    var r = lerRespostas(id);
    for (var k in r) {
      if (r[k] !== "" && r[k] != null) return true;
    }
    return false;
  }

  function marcarCard(id) {
    var card = document.querySelector('[data-ferramenta="' + id + '"]');
    if (!card) return;
    var selo = card.querySelector(".ferr-status");
    if (!selo) return;
    if (preenchida(id)) {
      selo.textContent = "Preenchida";
      selo.className = "ferr-status preenchida";
    } else {
      selo.textContent = "Disponível";
      selo.className = "ferr-status disponivel";
    }
  }

  /* ---------- abrir ------------------------------------------------------ */

  var aberta = null;   // ficha aberta agora, para redesenhar se o paciente mudar

  /* app.js chama isto toda vez que o paciente ativo muda. Sem isso a tela
     continuaria mostrando as respostas do paciente anterior. */
  window.aoTrocarPaciente = function () {
    var cards = document.querySelectorAll("[data-ferramenta]");
    for (var i = 0; i < cards.length; i++) marcarCard(cards[i].dataset.ferramenta);
    if (aberta && !aberta.alvo.classList.contains("hidden")) {
      desenhar(aberta.f, aberta.alvo);
    }
  };

  /* Abre uma ferramenta de qualquer lugar do app — e o que permite o mapa
     mandar direto para a conduta, sem a pessoa procurar na galeria. */
  window.abrirFerramentaPorId = function (id) {
    var f = catalogo(id);
    var card = document.querySelector('[data-ferramenta="' + id + '"]');
    if (f && card) {
      var nav = document.querySelector('.nav-item[data-secao="' + f.modulo + '"]');
      if (nav) nav.click();
      card.click();
      return true;
    }
    // as tres ancoras (OQ3, PQQ, Mapa do Proposito) tem tela propria
    var ancora = document.querySelector('[data-vista="vista-' + id + '"]');
    if (ancora) { ancora.click(); return true; }
    return false;
  };

  document.addEventListener("DOMContentLoaded", function () {
    var cards = document.querySelectorAll("[data-ferramenta]");
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        marcarCard(card.dataset.ferramenta);
        card.addEventListener("click", function () {
          var f = catalogo(card.dataset.ferramenta);
          if (!f) return;
          var alvo = document.getElementById("vista-gen-" + f.modulo);
          if (!alvo) return;
          aberta = { f: f, alvo: alvo };
          desenhar(f, alvo);
          window.abrirFerramenta("vista-gen-" + f.modulo);
        });
      })(cards[i]);
    }
  });
})();
