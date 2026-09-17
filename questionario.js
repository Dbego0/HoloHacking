/* ===========================================================================
   QUESTIONARIO DO HOLOSCOPE — as 84 perguntas
   ===========================================================================

   As perguntas NAO estao escritas aqui. Vem de HOLOSCOPE.questionario(), que
   as le do banco de marcadores. Quando o Rodrigo corrigir uma pergunta no CSV,
   ela muda na tela sem ninguem tocar em codigo.

   Tres blocos, que sao as tres subferramentas do material:
     BioRoot             sintomas do corpo      49
     NeuroScan           emocoes e padroes      19
     Terreno Espiritual  proposito, valor, fe   16

   Eram 87. Tres perguntas saiam repetidas — a mesma frase em dois marcadores,
   respondida duas vezes e contada duas vezes. Ver o relatorio de revisao.

   Quatro botoes, e os rotulos deles vem do marcador:

     frequencia    Nunca / As vezes / Frequente / Sempre
     intensidade   Nada / Um pouco / Bastante / Muito

   Porque "sua gordura se concentra na barriga?" nao tem frequencia: responder
   "as vezes" ali nao quer dizer nada. Nao e campo de digitar — consulta de 15
   minutos nao comporta escrever 84 vezes.

   O SENTIDO da pergunta (se o 3 e a pior ou a melhor resposta) tambem vem do
   banco, e quem aplica e o motor. Esta tela nao converte nada: ela mostra o
   que a pessoa marcou.

   As respostas sao guardadas a cada toque, por paciente. Fechar no meio e
   voltar depois nao perde nada — 15 minutos de consulta nao podem ir embora
   por um clique errado.

   Ao calcular, quem pontua e o motor: HOLOSCOPE.calcular() devolve indice,
   notas, Triada e combinacoes. Esta tela nao decide nada.
   =========================================================================== */

(function () {
  "use strict";

  var CHAVE = "holohacking.questionario";
  var SEM_PACIENTE = "_sem_paciente";

  var ESCALAS = {
    frequencia:  ["Nunca", "Às vezes", "Frequente", "Sempre"],
    intensidade: ["Nada", "Um pouco", "Bastante", "Muito"]
  };

  var BLOCOS = [
    { origem: "sintoma",    sigla: "BioRoot",   titulo: "Raízes físicas",
      sub: "inflamação, metabolismo, detox, microbiota" },
    { origem: "emocao",     sigla: "NeuroScan", titulo: "Padrões emocionais",
      sub: "ansiedade, sabotadores, gatilhos" },
    { origem: "espiritual", sigla: "Terreno Espiritual", titulo: "Propósito, valores e fé",
      sub: "alinhamento, pertencimento, bloqueios" }
  ];

  var perguntas = null;      // as 84, carregadas do motor uma vez
  var caixa = null;
  var ligado = false;        // o ouvinte de clique e um so, para sempre

  function motorPronto() {
    return !!(window.HOLOSCOPE && window.HOLOSCOPE.questionario);
  }

  /* ---------- de quem sao estas respostas -------------------------------- */

  /* A lista de pacientes vem do banco por uma chamada assincrona. Enquanto ela
     nao chega, pacienteAtivoId() e null — e foi assim que as respostas se
     perdiam: as primeiras iam para "_sem_paciente" e, quando a lista chegava,
     passavam a ser procuradas debaixo do id do paciente. Ninguem apagou nada;
     elas foram gravadas com uma chave e lidas com outra.

     Por isso a tela so desenha depois que a lista chegou. */
  function pacientesProntos() {
    try {
      return typeof window.pacientesCarregados !== "function" ||
             window.pacientesCarregados();
    } catch (e) { return true; }
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
  /* O mapa inteiro e RELIDO aqui, imediatamente antes de gravar, e tudo isto
     acontece num turno sincrono so: outra aba nao consegue se enfiar entre a
     leitura e a escrita. Entao a resposta que a outra aba acabou de dar nao se
     perde. O que se acrescenta e o aviso: depois de gravar, a revisao avanca,
     e as outras abas descobrem que o que elas tem na tela envelheceu. */
  function gravar(marcadorId, valor) {
    var t = tudo(), p = pacienteAtual();
    if (!t[p]) t[p] = {};
    t[p][marcadorId] = valor;
    localStorage.setItem(CHAVE, JSON.stringify(t));
    if (window.Concorrencia) window.Concorrencia.avancarRevisao("questionario");
  }
  function limpar() {
    var t = tudo();
    delete t[pacienteAtual()];
    localStorage.setItem(CHAVE, JSON.stringify(t));
    if (window.Concorrencia) window.Concorrencia.avancarRevisao("questionario");
  }

  /* Respostas que ainda existem no banco de hoje. Marcador removido numa
     revisao deixa resposta orfa guardada; ela nao pode contar no progresso
     nem ir para o motor, que a recusaria. */
  function respostasValidas() {
    var dadas = respostasDoPaciente();
    var validas = {};
    if (!perguntas) return validas;
    for (var i = 0; i < perguntas.length; i++) {
      var id = perguntas[i].id;
      if (dadas[id] !== undefined) validas[id] = dadas[id];
    }
    return validas;
  }

  /* ---------- desenhar --------------------------------------------------- */

  function escapar(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function rotulos(q) {
    return ESCALAS[q.escala] || ESCALAS.frequencia;
  }

  function desenhar() {
    if (!motorPronto()) {
      caixa.innerHTML = '<p class="q-erro">O motor não carregou. ' +
        "Sem ele não há perguntas — confira se holoscope.js está sendo servido.</p>";
      return;
    }
    if (!pacientesProntos()) {
      caixa.innerHTML = '<p class="q-aviso">Carregando o paciente…</p>';
      return;
    }
    if (!perguntas) perguntas = window.HOLOSCOPE.questionario();

    var dadas = respostasValidas();
    var html = "";

    if (pacienteAtual() === SEM_PACIENTE) {
      html += '<p class="q-aviso">Nenhum paciente selecionado. As respostas ficam ' +
        "guardadas neste navegador, mas não entram na ficha de ninguém — " +
        "escolha um paciente antes de aplicar o questionário.</p>";
    }

    html += '<div class="q-topo">' +
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
        var escala = rotulos(q);
        html += '<div class="q-item" data-marcador="' + q.id + '">' +
          '<p class="q-pergunta">' + escapar(q.pergunta) + "</p>" +
          '<div class="q-botoes">';
        for (var k = 0; k < 4; k++) {
          html += '<button type="button" class="q-btn' +
            (String(v) === String(k) ? " marcado" : "") +
            '" data-valor="' + k + '"><b>' + k + "</b>" + escala[k] + "</button>";
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
    var n = Object.keys(respostasValidas()).length;
    var pc = Math.round(n / perguntas.length * 100);
    var barra = caixa.querySelector(".q-progresso i");
    if (barra) barra.style.width = pc + "%";
    var conta = caixa.querySelector(".q-conta");
    if (conta) {
      conta.innerHTML = "<b>" + n + "</b> de " + perguntas.length + " respondidas" +
        (n === perguntas.length ? " &middot; completo" : "");
    }
  }

  /* Um ouvinte so, no container, para a vida inteira da pagina. Ele estava
     sendo pendurado a cada desenho: trocar de paciente tres vezes fazia o
     mesmo clique gravar tres vezes. */
  function ligar() {
    if (ligado) return;
    ligado = true;
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
    var dadas = respostasValidas();
    var respostas = Object.keys(dadas).map(function (id) {
      return { marcador_id: id, intensidade: dadas[id] };
    });
    if (respostas.length === 0) {
      mostrarAviso("Responda ao menos uma pergunta para gerar o mapa.");
      return;
    }

    /* O que o paciente tem alem do questionario: exames lancados e o que as
       ferramentas mediram. Nao muda nota nenhuma — serve para as combinacoes
       poderem cruzar relato com exame, que e a leitura sistemica do metodo. */
    var contexto = {};
    try {
      if (window.Panorama && window.Panorama.contexto) contexto = window.Panorama.contexto();
    } catch (e) { /* sem contexto o mapa sai igual, so com menos cruzamento */ }

    var r;
    try {
      r = window.HOLOSCOPE.calcular(respostas, contexto);
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

  function aberto() {
    var tela = document.getElementById("holoscope-questionario");
    return tela && !tela.classList.contains("hidden");
  }

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

  /* O botao anunciava "87 perguntas" escrito na mao no HTML, e continuou
     anunciando 87 depois que passaram a ser 84. Quem sabe quantas sao e o
     motor. */
  function rotularBotao(botao) {
    if (!botao || !motorPronto()) return;
    if (!perguntas) perguntas = window.HOLOSCOPE.questionario();
    botao.innerHTML = "Aplicar question\u00e1rio &mdash; " + perguntas.length + " perguntas";
  }

  document.addEventListener("DOMContentLoaded", function () {
    caixa = document.getElementById("q-lista");
    if (!caixa) return;
    var abrirBtn = document.getElementById("btn-abrir-questionario");
    if (abrirBtn) abrirBtn.addEventListener("click", abrir);
    rotularBotao(abrirBtn);
    var voltar = document.getElementById("btn-voltar-manual");
    if (voltar) voltar.addEventListener("click", fechar);

    // trocar de paciente troca o questionario inteiro — e a chegada da lista
    // de pacientes conta como troca, porque ate ali nao se sabia de quem era
    var anterior = window.aoTrocarPaciente;
    window.aoTrocarPaciente = function () {
      if (typeof anterior === "function") anterior();
      if (aberto()) desenhar();
    };
  });
})();
