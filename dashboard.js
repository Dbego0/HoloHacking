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

  function dataBR(iso) {
    return iso ? String(iso).split("-").reverse().join("/") : "";
  }

  /* ---------- os blocos --------------------------------------------------- */

  /* O cabecalho operacional e os atalhos do dia. Os quatro numeros do resumo
     ficam neutros (0/0/-/0) enquanto consultas de hoje e proxima consulta
     nao tem fonte propria no dashboard — entram na Etapa 2, junto com
     "proximos atendimentos". Pacientes/pendencias ja tem numero real logo
     abaixo, em blocoNumeros/blocoPendencias; duplicar aqui so com dado de
     verdade e trabalho da mesma etapa. */
  function blocoCabecalho(ativo) {
    return '<div class="secao-cabeca dash-cabeca">' +
        '<span class="eyebrow">Plataforma clínica</span>' +
        "<h2>Bom dia, <em>Nutricionista</em></h2>" +
        // Rodada de consistencia: Pacientes e a ficha ja tinham titulo +
        // subtitulo curto; o Dashboard so tinha o titulo.
        "<p>Resumo do seu dia e acesso rápido às ferramentas.</p>" +
        (ativo ? '<p>Paciente aberta: <b>' + escapar(ativo) + "</b>.</p>" : "") +
      "</div>" +
      '<div class="dash-numeros dash-resumo">' +
        '<div class="dash-tile"><b>0</b><span>Pacientes ativos</span></div>' +
        '<div class="dash-tile"><b>0</b><span>Consultas hoje</span></div>' +
        '<div class="dash-tile"><b>&mdash;</b><span>Próxima consulta</span></div>' +
        '<div class="dash-tile"><b>0</b><span>Avaliações pendentes</span></div>' +
      "</div>" +
      '<div class="dash-acoes-rapidas">' +
        '<button type="button" class="perf-botao" data-destino="novo">Novo paciente</button>' +
        '<button type="button" class="perf-botao" data-destino="nova-consulta">Nova consulta</button>' +
        '<button type="button" class="perf-botao" data-destino="holoscope">Abrir HOLOSCOPE</button>' +
        '<button type="button" class="perf-botao" data-destino="documentos">Registrar exames</button>' +
      "</div>";
  }

  /* So consulta MARCADA de verdade (Agenda) entra aqui — a data derivada da
     reavaliacao de 4 semanas e uma sugestao, nao um compromisso na agenda, e
     "Proximos atendimentos" promete o que ja esta marcado. */
  function blocoProximosAtendimentos(agenda) {
    var proximas = ((agenda && agenda.linhas) || []).filter(function (l) {
      return l.marcada && l.faltam !== null && l.faltam >= 0;
    }).slice(0, 3);

    var corpo;
    if (proximas.length === 0) {
      corpo = '<p class="dash-vazio">Nenhuma consulta agendada.</p>' +
        '<button type="button" class="perf-botao" data-destino="nova-consulta">Agendar consulta</button>';
    } else {
      corpo = '<ul class="dash-pendentes" id="dash-lista-atendimentos">' + proximas.map(function (l) {
        var quando = dataBR(l.marcada) + (l.hora ? " às " + l.hora : "");
        return '<li class="dash-pendente">' +
          '<span class="pac-avatar">' + escapar(inicial(l.paciente.nome)) + "</span>" +
          '<span class="dash-quem">' +
            "<b>" + escapar(l.paciente.nome) + "</b>" +
            '<span class="dash-porque">' + escapar(quando) + "</span>" +
          "</span>" +
          '<button type="button" class="dash-ir" data-paciente="' + escapar(l.paciente.id) +
            '" data-destino="ficha">Ver <span aria-hidden="true">&rarr;</span></button>' +
          "</li>";
      }).join("") + "</ul>";
    }

    return '<div class="dash-bloco dash-bloco-compacto">' +
      '<h3 class="dash-titulo">Próximos atendimentos</h3>' + corpo + "</div>";
  }

  /* Os 3 cadastros mais novos — mesmo criterio (created_at) que a lista de
     pacientes ja usa para "mais recente primeiro". Nao e fonte de dado nova,
     e o mesmo pacientesTodos() de sempre, so cortado e ordenado aqui. */
  function blocoPacientesRecentes() {
    var recentes = ((window.pacientesTodos && window.pacientesTodos()) || [])
      .slice()
      .sort(function (a, b) { return (b.created_at || "").localeCompare(a.created_at || ""); })
      .slice(0, 3);

    var corpo;
    if (recentes.length === 0) {
      corpo = '<p class="dash-vazio">Nenhum paciente cadastrado ainda.</p>' +
        '<button type="button" class="btn-verde" data-destino="novo">Cadastrar paciente</button>';
    } else {
      corpo = '<ul class="dash-pendentes" id="dash-lista-recentes">' + recentes.map(function (p) {
        return '<li class="dash-pendente">' +
          '<span class="pac-avatar">' + escapar(inicial(p.nome)) + "</span>" +
          '<span class="dash-quem"><b>' + escapar(p.nome) + "</b></span>" +
          '<button type="button" class="dash-ir" data-paciente="' + escapar(p.id) +
            '" data-destino="ficha">Abrir <span aria-hidden="true">&rarr;</span></button>' +
          "</li>";
      }).join("") + "</ul>";
    }

    return '<div class="dash-bloco dash-bloco-compacto">' +
      '<h3 class="dash-titulo">Pacientes recentes</h3>' + corpo + "</div>";
  }

  /* HOLOSCOPE mapeia, HOLOSCAN confronta sem corrigir, Documentos consolida —
     so o encadeamento visual do metodo que ja existe. Nenhum texto aqui
     chama HOLOSCOPE de diagnostico nem diz que o HOLOSCAN muda nota. */
  function blocoJornadaClinica() {
    var etapas = [
      { nome: "HOLOSCOPE", texto: "Mapear prioridades de investigação.", destino: "holoscope" },
      { nome: "HOLOSCAN", texto: "Confrontar o mapa com exames.", destino: "holoscan" },
      { nome: "Documentos", texto: "Consolidar registros e materiais da jornada.", destino: "documentos" }
    ];

    var passos = etapas.map(function (e, i) {
      var seta = i > 0 ? '<div class="dash-jornada-seta" aria-hidden="true">&darr;</div>' : "";
      return seta + '<div class="dash-jornada-passo">' +
        '<span class="dash-quem"><b>' + escapar(e.nome) + "</b>" +
          '<span class="dash-porque">' + escapar(e.texto) + "</span></span>" +
        '<button type="button" class="dash-ir" data-destino="' + e.destino + '">Abrir <span aria-hidden="true">&rarr;</span></button>' +
      "</div>";
    }).join("");

    return '<div class="dash-bloco dash-bloco-compacto">' +
      '<h3 class="dash-titulo">Jornada clínica</h3>' +
      '<div class="dash-jornada">' + passos + "</div></div>";
  }

  function blocoPendencias(c) {
    if (c.pendentes.length === 0) {
      return '<div class="dash-bloco">' +
        '<h3 class="dash-titulo">Precisa de você</h3>' +
        '<p class="dash-vazio">Nada pendente. Todas as fichas estão em dia.</p>' +
        "</div>";
    }

    var html = '<div class="dash-bloco">' +
      '<h3 class="dash-titulo">Precisa de você <em>' + c.pendentes.length + "</em></h3>" +
      '<ul class="dash-pendentes" id="dash-lista-pendentes">';

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

    var agenda = null;
    try { if (window.Panorama.agenda) agenda = window.Panorama.agenda(); }
    catch (e) { agenda = null; }

    var metodo = document.getElementById("dash-metodo");

    // Bloco operacional: sempre a mesma primeira dobra, com ou sem carteira —
    // "Proximos atendimentos" e "Pacientes recentes" ja tem seu proprio
    // estado vazio, entao nao precisam do convite grande que existia aqui.
    var operacional =
      blocoCabecalho(c.total === 0 ? null : (window.pacienteAtivoNome ? window.pacienteAtivoNome() : null)) +
      blocoProximosAtendimentos(agenda) +
      blocoPacientesRecentes() +
      blocoJornadaClinica();

    if (c.total === 0) {
      // Primeira visita: o metodo e a resposta certa, e continua a vista.
      if (metodo) metodo.classList.remove("hidden");
      alvo.innerHTML = operacional;
      ligar();
      return;
    }

    if (metodo) metodo.classList.add("hidden");

    alvo.innerHTML = operacional + blocoPendencias(c) + blocoNumeros(c) + blocoTerreno(c);

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

        // Mesmo atalho que perfil.js usa (data-atalho="agenda"): ir para a
        // agenda e abrir o formulario que ja existe la.
        if (destino === "nova-consulta") {
          if (window.irParaSecao) window.irParaSecao("agenda");
          var novaConsulta = document.querySelector('[data-novo="consulta"]');
          if (novaConsulta) novaConsulta.click();
          return;
        }

        // A ficha (#vista-ficha) mora dentro de secao-pacientes: sem ir para
        // la primeiro, abrirFichaDe() ate desenha, mas fica escondida atras
        // da secao que estava aberta.
        if (destino === "ficha") {
          if (window.irParaSecao) window.irParaSecao("pacientes");
          if (pid && window.abrirFichaDe) window.abrirFichaDe(pid);
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
