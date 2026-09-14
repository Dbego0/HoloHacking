/* ===========================================================================
   DASHBOARD — o trabalho de hoje
   ===========================================================================

   Era a apresentacao do metodo: "Bem-vinda a plataforma", os tres passos, a
   citacao. Texto de venda, e correto uma vez — na primeira visita. Quem abre
   isto todo dia de manha precisa de outra coisa: quem esta esperando por ela.

   Tres perguntas, nesta ordem, porque e a ordem em que elas aparecem na
   cabeca de quem vai atender:

     1. Quem precisa de mim?     as pendencias da carteira, da mais urgente
     2. Quantos sao?             o tamanho do que ela carrega
     3. O que se repete?         o terreno que mais aparece entre os pacientes

   Nada aqui calcula regra clinica: quem decide o que e pendencia e
   panorama.js, que e o mesmo codigo que a ficha usa. Se as duas telas
   discordarem sobre um paciente, e porque alguem escreveu a regra duas vezes.

   Sem paciente nenhum cadastrado o metodo continua aparecendo — ali ele e a
   resposta certa, junto com o convite para cadastrar o primeiro.
   =========================================================================== */

(function () {
  "use strict";

  /* Abaixo disto nao ha padrao, ha coincidencia: tres pacientes nao formam o
     "terreno de uma carteira". Melhor dizer que ainda e cedo do que desenhar
     um grafico que convida a concluir. */
  var MINIMO_PARA_TERRENO = 3;

  var alvo = null;

  function escapar(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function inicial(nome) {
    return (nome || "?").trim().charAt(0).toUpperCase();
  }

  function primeiroNome(nome) {
    return (nome || "").split(" ")[0];
  }

  /* ---------- os blocos --------------------------------------------------- */

  function blocoPendencias(c) {
    if (c.pendentes.length === 0) {
      return '<div class="dash-bloco">' +
        '<h3 class="dash-titulo">Precisa de você</h3>' +
        '<p class="dash-vazio">Nada pendente. Todas as fichas estão em dia.</p>' +
        "</div>";
    }

    var html = '<div class="dash-bloco">' +
      '<h3 class="dash-titulo">Precisa de você <em>' + c.pendentes.length + "</em></h3>" +
      '<ul class="dash-pendentes">';

    c.pendentes.forEach(function (l) {
      var primeiro = l.alertas[0];
      // o primeiro alerta vira o botao; os outros viram a linha de contexto
      var restantes = l.alertas.slice(1).map(function (a) { return a.curto; });
      html += '<li class="dash-pendente ' + primeiro.grau + '">' +
        '<span class="pac-avatar">' + escapar(inicial(l.paciente.nome)) + "</span>" +
        '<span class="dash-quem">' +
          "<b>" + escapar(l.paciente.nome) + "</b>" +
          '<span class="dash-porque">' + escapar(primeiro.curto) +
            (restantes.length ? " &middot; " + escapar(restantes.join(" · ")) : "") +
          "</span>" +
        "</span>" +
        '<button type="button" class="dash-ir" data-paciente="' + escapar(l.paciente.id) +
          '" data-destino="' + escapar(primeiro.acao) + '">' +
          escapar(primeiro.botao) + ' <span aria-hidden="true">&rarr;</span></button>' +
        "</li>";
    });

    return html + "</ul></div>";
  }

  function blocoNumeros(c) {
    var vencidas = c.linhas.filter(function (l) {
      return l.alertas.some(function (a) { return /reavalia/.test(a.curto); });
    }).length;

    var tiles = [
      { n: c.total, r: c.total === 1 ? "paciente" : "pacientes" },
      { n: c.comMapa, r: c.comMapa === 1 ? "com HOLOSCOPE" : "com HOLOSCOPE" },
      { n: vencidas, r: vencidas === 1 ? "reavaliação vencida" : "reavaliações vencidas" },
      { n: c.indiceMedio === null ? "—" : c.indiceMedio, r: "Índice HOLOS médio" }
    ];

    return '<div class="dash-numeros">' + tiles.map(function (t) {
      return '<div class="dash-tile"><b>' + escapar(t.n) + "</b><span>" +
        escapar(t.r) + "</span></div>";
    }).join("") + "</div>";
  }

  /* O terreno da carteira.

     Uma serie so — quantas vezes cada sistema aparece entre os dois mais
     baixos dos pacientes mapeados. Serie unica nao pede cor por categoria: o
     nome do sistema ja esta escrito ao lado de cada barra, e pintar cada uma
     de um tom so repetiria em cor o que o rotulo ja diz. As cores dos cinco
     sistemas tambem nao passariam aqui — o azul do Mental-Emocional da 1,19:1
     contra este verde, o que e o mesmo que nao desenhar a barra. */
  function blocoTerreno(c) {
    if (c.comMapa < MINIMO_PARA_TERRENO) {
      if (c.comMapa === 0) return "";
      return '<div class="dash-bloco">' +
        '<h3 class="dash-titulo">O terreno da sua carteira</h3>' +
        '<p class="dash-vazio">Com ' + c.comMapa +
        (c.comMapa === 1 ? " paciente mapeado" : " pacientes mapeados") +
        " ainda não há padrão para ler — a partir de " + MINIMO_PARA_TERRENO +
        " o que se repete começa a aparecer aqui.</p></div>";
    }

    var maior = c.terreno[0].vezes;
    var linhas = c.terreno.map(function (t) {
      var largura = Math.round(t.vezes / maior * 100);
      var frase = t.vezes + " de " + c.comMapa + " pacientes mapeados";
      return '<li class="dash-barra" title="' + escapar(t.nome + ": " + frase) + '">' +
        '<span class="dash-barra-nome">' + escapar(t.nome) + "</span>" +
        '<span class="dash-barra-trilho"><i style="width:' + largura + '%"></i></span>' +
        '<span class="dash-barra-n">' + t.vezes + "</span>" +
        "</li>";
    }).join("");

    return '<div class="dash-bloco">' +
      '<h3 class="dash-titulo">O terreno da sua carteira</h3>' +
      '<p class="dash-sub">Quantas vezes cada sistema aparece entre os dois mais baixos ' +
      "dos seus " + c.comMapa + " pacientes mapeados.</p>" +
      '<ul class="dash-terreno">' + linhas + "</ul></div>";
  }

  /* ---------- desenhar ---------------------------------------------------- */

  function desenhar() {
    if (!alvo || !window.Panorama) return;

    var c;
    try { c = window.Panorama.carteira(); }
    catch (e) { alvo.innerHTML = ""; return; }

    var metodo = document.getElementById("dash-metodo");

    if (c.total === 0) {
      // Primeira visita: o metodo e a resposta certa, e o convite vem junto.
      if (metodo) metodo.classList.remove("hidden");
      alvo.innerHTML = '<div class="dash-primeiro">' +
        '<p>Nenhum paciente cadastrado ainda. A jornada começa por aqui.</p>' +
        '<button type="button" class="btn-verde" data-destino="novo">Cadastrar o primeiro paciente</button>' +
        "</div>";
      ligar();
      return;
    }

    if (metodo) metodo.classList.add("hidden");

    var ativo = window.pacienteAtivoNome ? window.pacienteAtivoNome() : null;

    alvo.innerHTML =
      '<div class="secao-cabeca dash-cabeca">' +
        '<span class="eyebrow">Plataforma clínica</span>' +
        "<h2>Sua clínica <em>hoje</em></h2>" +
        (ativo ? '<p>Paciente aberta: <b>' + escapar(ativo) + "</b>.</p>" : "") +
      "</div>" +
      blocoPendencias(c) +
      blocoNumeros(c) +
      blocoTerreno(c);

    ligar();
  }

  function ligar() {
    alvo.querySelectorAll("[data-destino]").forEach(function (b) {
      b.addEventListener("click", function () {
        var destino = b.dataset.destino;
        var pid = b.dataset.paciente;

        if (destino === "novo") {
          if (window.irParaSecao) window.irParaSecao("pacientes");
          var abrir = document.getElementById("btn-abrir-novo");
          if (abrir) abrir.click();
          return;
        }

        if (pid && window.definirPacienteAtivo) window.definirPacienteAtivo(pid);

        // "aba:exames" leva para a ficha, na aba certa; o resto e secao
        if (destino.indexOf("aba:") === 0) {
          if (window.abrirFichaDe) window.abrirFichaDe(pid);
          var aba = document.querySelector('[data-aba="' + destino.slice(4) + '"]');
          if (aba) aba.click();
          return;
        }
        if (window.irParaSecao) window.irParaSecao(destino);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    alvo = document.getElementById("dash-trabalho");
    if (!alvo) return;

    // o dashboard e derivado: muda quando a carteira muda
    var anterior = window.aoTrocarPaciente;
    window.aoTrocarPaciente = function () {
      if (typeof anterior === "function") anterior();
      desenhar();
    };
    desenhar();
  });

  window.redesenharDashboard = desenhar;
})();
