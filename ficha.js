/* ===========================================================================
   A FICHA DO PACIENTE
   ===========================================================================

   Tudo o que o app sabe sobre uma pessoa já estava guardado — o mapa, as
   ferramentas preenchidas, os exames, os documentos — mas espalhado. Esta tela
   reúne, e ACUSA o que ninguém via: respondeu e nunca teve conduta, parou o
   questionário no meio, exame alterado onde ele não se queixa, reavaliação
   vencida.

   A ficha tem quatro partes, nesta ordem, porque é a ordem das perguntas que
   se faz antes de atender:

     FAIXA          quando foi a última, quando é a próxima, o que está aberto
     VISÃO CLÍNICA  o mapa mais recente e o que ele diz
     LINHA DO TEMPO o que aconteceu com esta pessoa, em ordem
     FORMULÁRIOS    o que foi respondido — e o que dá para reler

   Sobre Formulários: no método, o HOLOSCOPE É um formulário — 84 perguntas
   respondidas numa escala de 0 a 3. O OQ³, o PQQ e o Mapa do Propósito também
   são. O que faltava era poder RELER o que a pessoa respondeu: o app calculava
   a nota e jogava as respostas numa caixa que nenhuma tela abria. A janela de
   respostas abre essa caixa, agrupada por sistema, com o peso de cada uma.

   Nada aqui calcula: lê o que o motor e as telas já gravaram.
   =========================================================================== */

(function () {
  "use strict";

  var SEM_PACIENTE = "_sem_paciente";
  var CAIXA_Q = "holohacking.questionario";

  var ESCALAS = {
    frequencia:  ["Nunca", "Às vezes", "Frequente", "Sempre"],
    intensidade: ["Nada", "Um pouco", "Bastante", "Muito"]
  };

  var NOME_ORIGEM = {
    sintoma: "Raízes físicas",
    emocao: "Padrões emocionais",
    espiritual: "Terreno Espiritual"
  };

  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
               "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  var abaAtual = "visao";

  function paciente() {
    try { return (window.pacienteAtivoId && window.pacienteAtivoId()) || SEM_PACIENTE; }
    catch (e) { return SEM_PACIENTE; }
  }
  function pacienteObj() {
    var todos = (window.pacientesTodos && window.pacientesTodos()) || [];
    var id = paciente();
    for (var i = 0; i < todos.length; i++) if (todos[i].id === id) return todos[i];
    return null;
  }
  function escapar(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function dataBR(iso) { return iso ? iso.split("-").reverse().join("/") : ""; }

  /** O dia do calendário de um instante, no fuso de quem está olhando. */
  function diaLocal(iso) {
    if (!iso) return "";
    if (iso.length <= 10) return iso;          // já é uma data, não um instante
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function diasDesde(iso) {
    if (!iso) return null;
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return null;
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return Math.round((hoje - d) / 86400000);
  }
  function haQuantoTempo(dias) {
    if (dias === null) return "";
    if (dias <= 0) return "hoje";
    if (dias === 1) return "ontem";
    if (dias < 30) return "há " + dias + " dias";
    var m = Math.round(dias / 30);
    if (m < 12) return "há " + m + (m === 1 ? " mês" : " meses");
    var a = Math.floor(dias / 365);
    return "há " + a + (a === 1 ? " ano" : " anos");
  }
  function emQuantoTempo(dias) {
    if (dias === null) return "";
    if (dias === 0) return "hoje";
    if (dias === 1) return "amanhã";
    return dias < 0 ? haQuantoTempo(-dias) : "em " + dias + " dias";
  }

  function reunir() { return window.Panorama.doPaciente(paciente()); }
  function alertas(d) { return window.Panorama.alertas(d); }

  function nomeFerramenta(id) {
    var fixos = { oq3: "OQ³", pqq: "PQQ", mapa: "Mapa do Propósito" };
    if (fixos[id]) return fixos[id];
    var lista = window.CATALOGO_FERRAMENTAS || [];
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i].titulo;
    return id;
  }

  /* ======================================================= A FAIXA ======== */

  /* As quatro perguntas que se faz antes de abrir qualquer aba. Cada uma tem
     resposta em algum lugar do app — o problema era ter que ir aos quatro. */
  function desenharFaixa() {
    var alvo = document.getElementById("ficha-faixa");
    if (!alvo) return;
    var d = reunir();
    var pid = paciente();

    var ultima = d.pontuacao && d.pontuacao.quando
      ? dataBR(d.pontuacao.quando) + " &middot; " + haQuantoTempo(diasDesde(d.pontuacao.quando))
      : null;

    var prox = window.Agenda && window.Agenda.proxima ? window.Agenda.proxima(pid) : null;
    var proxTexto = prox
      ? dataBR(prox.data) + " às " + prox.hora + " &middot; " + emQuantoTempo(-diasDesde(prox.data))
      : null;

    var abertas = alertas(d).length;

    var itens = [
      { rot: "Última aplicação", valor: ultima, vazio: "nenhuma", acao: "holoscope" },
      { rot: "Próxima consulta", valor: proxTexto, vazio: "não agendada", acao: "agenda" },
      { rot: "Em aberto",
        valor: abertas === 0 ? "tudo em dia" : abertas + (abertas === 1 ? " pendência" : " pendências"),
        alerta: abertas > 0, acao: "aba:visao" },
      { rot: "Exames", valor: d.exames > 0 ? d.exames + " preenchidos" : null,
        vazio: "nenhum valor", acao: "aba:documentos" },
      { rot: "Documentos", valor: null, vazio: "carregando…", id: "fic-faixa-docs",
        acao: "aba:documentos" }
    ];

    alvo.innerHTML = itens.map(function (i) {
      return '<button type="button" class="fic-pilula' +
        (i.valor ? "" : " vazia") + (i.alerta ? " alerta" : "") + '"' +
        (i.id ? ' id="' + i.id + '"' : "") +
        ' data-ir="' + i.acao + '">' +
        '<span class="fic-pilula-rot">' + i.rot + "</span>" +
        '<b>' + (i.valor || i.vazio) + "</b></button>";
    }).join("");

    if (window.ArquivoStore) {
      window.ArquivoStore.listar(pid).then(function (itens) {
        var el = document.getElementById("fic-faixa-docs");
        if (!el) return;
        el.classList.toggle("vazia", itens.length === 0);
        el.querySelector("b").textContent = itens.length === 0
          ? "nenhum" : itens.length + (itens.length === 1 ? " arquivo" : " arquivos");
      });
    }
  }

  /* ================================================= ABA: VISÃO CLÍNICA === */

  /* Exames: resumo compacto, nao duplica o HOLOSCAN — so diz quantos valores
     ja foram lancados (mesmo d.exames que a faixa e o panorama ja contam) e
     manda para onde eles moram ou para o confronto em si. */
  function blocoExames(d) {
    return '<div class="dash-bloco dash-bloco-compacto">' +
      '<h3 class="dash-titulo">Exames</h3>' +
      (d.exames > 0
        ? '<p class="dash-sub">' + d.exames +
          (d.exames === 1 ? " valor registrado." : " valores registrados.") + "</p>" +
          '<button type="button" class="dash-ir" data-ir="holoscan">Ver HOLOSCAN ' +
          '<span aria-hidden="true">&rarr;</span></button>'
        : '<p class="dash-vazio">Nenhum exame registrado.</p>' +
          '<button type="button" class="dash-ir" data-ir="aba:documentos">Registrar exames ' +
          '<span aria-hidden="true">&rarr;</span></button>') +
      "</div>";
  }

  function blocoDocumentosPlaceholder() {
    return '<div class="dash-bloco dash-bloco-compacto">' +
      '<h3 class="dash-titulo">Documentos recentes</h3>' +
      '<div id="fic-visao-docs"><p class="dash-vazio">Carregando…</p></div>' +
      "</div>";
  }

  /* Os 3 mais recentes — mesmo ArquivoStore que a faixa e a aba Documentos ja
     usam, nao e fonte de dado nova. Confere se #fic-visao-docs ainda existe
     antes de escrever: a promise pode resolver depois de trocar de aba ou
     de paciente. */
  function preencherDocumentosRecentes(pid) {
    if (!window.ArquivoStore) return;
    window.ArquivoStore.listar(pid).then(function (itens) {
      var alvo = document.getElementById("fic-visao-docs");
      if (!alvo) return;
      if (!itens.length) {
        alvo.innerHTML = '<p class="dash-vazio">Nenhum documento.</p>' +
          '<button type="button" class="dash-ir" data-ir="aba:documentos">Adicionar documento ' +
          '<span aria-hidden="true">&rarr;</span></button>';
        return;
      }
      var recentes = itens.slice()
        .sort(function (a, b) { return (b.data || "").localeCompare(a.data || ""); })
        .slice(0, 3);
      alvo.innerHTML = '<ul class="dash-pendentes" id="fic-lista-docs">' +
        recentes.map(function (a) {
          // .dash-pendente e grade de 3 colunas (avatar/conteudo/botao); sem
          // o avatar o botao caia na coluna do meio e esticava.
          return '<li class="dash-pendente">' +
            '<span class="pac-avatar">' + escapar((a.tipo || "Documento").charAt(0).toUpperCase()) + "</span>" +
            '<span class="dash-quem"><b>' + escapar(a.nome) + "</b>" +
              '<span class="dash-porque">' + escapar(a.tipo || "Documento") +
                (a.data ? " &middot; " + escapar(dataBR(a.data)) : "") + "</span></span>" +
            '<button type="button" class="dash-ir" data-ir="aba:documentos">Ver ' +
              '<span aria-hidden="true">&rarr;</span></button>' +
          "</li>";
        }).join("") + "</ul>";
    });
  }

  function desenharVisao() {
    var alvo = document.getElementById("aba-visao");
    if (!alvo) return;
    var d = reunir();
    var pid = paciente();
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

    if (!d.pontuacao) {
      html += '<div class="dash-vazio">Sem HOLOSCOPE aplicado. O mapa é o que ' +
        "transforma o que ela conta em leitura — e é dele que sai tudo o que " +
        "aparece nesta aba.</div>";
      html += blocoDocumentosPlaceholder() + blocoExames(d);
      alvo.innerHTML = html;
      ligar(alvo);
      preencherDocumentosRecentes(pid);
      return;
    }

    var p = d.pontuacao;
    html += '<div class="fic-mapa"><div class="fic-indice">' +
      '<span class="fic-rot">Índice HOLOS</span>' +
      "<b>" + p.indice + '</b><span class="fic-de">de ' + p.indice_maximo + "</span>" +
      (p.quando ? '<span class="fic-quando">' + escapar(dataBR(p.quando)) + "</span>" : "") +
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
        return '<span class="fic-sis">' + escapar(s.nome) + " <b>" + s.nota.toFixed(1) + "</b></span>";
      }).join("") + "</div></div>";

    /* Os cinco sistemas, do mais carregado ao mais equilibrado. Antes só os
       dois piores apareciam aqui, e quem quisesse o resto ia para o relatório. */
    html += '<div class="fic-sistemas"><span class="fic-rot">Os cinco sistemas</span>' +
      p.sistemas.slice().sort(function (a, b) { return a.nota - b.nota; })
        .map(function (s) {
          var largura = Math.round(s.nota / 10 * 100);
          return '<div class="fic-barra' + (s.avaliavel === false ? " sem-dado" : "") + '">' +
            '<span class="fic-barra-nome">' + escapar(s.nome) + "</span>" +
            '<span class="fic-barra-trilho"><i style="width:' + largura + '%"></i></span>' +
            '<span class="fic-barra-n">' + s.nota.toFixed(1) + "</span>" +
            '<span class="fic-barra-faixa">' + escapar(s.faixa || "") + "</span></div>";
        }).join("") + "</div>";

    // Revisao clinica do HOLOSCOPE: nenhuma CMB aparece na interface clinica
    // nesta rodada (ver app.js, cmbParaExibir()) — inclusive a CMB-001.
    var combinacoesParaExibir = window.cmbParaExibir ? window.cmbParaExibir(p.combinacoes) : [];
    if (combinacoesParaExibir.length > 0) {
      html += '<div class="fic-leituras"><span class="fic-rot">Leitura combinada</span>' +
        combinacoesParaExibir.map(function (c) {
          return '<p class="fic-combinada">&ldquo;' + escapar(c.leitura) + "&rdquo;</p>";
        }).join("") + "</div>";
    }

    // Espelho somente-leitura da Interpretacao profissional (escrita na aba
    // Relatorio) — nunca editada aqui, e nunca gerada automaticamente.
    var interpretacao = window.interpretacaoDe ? window.interpretacaoDe() : null;
    if (interpretacao && interpretacao.texto) {
      html += '<div class="fic-leituras"><span class="fic-rot">Interpretação profissional</span>' +
        "<p class=\"fic-combinada\">" + escapar(interpretacao.texto).replace(/\n/g, "<br>") + "</p></div>";
    }

    html += blocoDocumentosPlaceholder() + blocoExames(d);

    alvo.innerHTML = html;
    ligar(alvo);
    preencherDocumentosRecentes(pid);
  }

  /* ==================================================== ABA: CONSULTAS === */

  /* Continuidade discreta: o mesmo encadeamento do bloco Jornada clinica (ja
     visivel acima das abas), so que como uma linha fina — nao repete o
     bloco inteiro, so lembra o proximo passo depois da consulta. */
  function blocoContinuidade() {
    return '<div class="fic-continuidade">' +
      '<span class="fic-rot">Depois da consulta</span>' +
      '<button type="button" class="fic-chip" data-ir="holoscope">HOLOSCOPE</button>' +
      '<span class="fic-continuidade-seta" aria-hidden="true">&rarr;</span>' +
      '<button type="button" class="fic-chip" data-ir="holoscan">HOLOSCAN</button>' +
      '<span class="fic-continuidade-seta" aria-hidden="true">&rarr;</span>' +
      '<button type="button" class="fic-chip" data-ir="aba:documentos">Documentos</button>' +
    "</div>";
  }

  function linhaConsulta(c, destaque) {
    // .dash-pendente e grade de 3 colunas (avatar/conteudo/botao); sem o
    // avatar o botao caia na coluna do meio e esticava. Aqui o "avatar" e
    // o dia do mes — a mesma ideia de uma folhinha de calendario.
    return '<li class="dash-pendente' + (destaque ? " abrir" : "") + '">' +
      '<span class="pac-avatar">' + escapar((c.data || "").slice(8, 10) || "?") + "</span>" +
      '<span class="dash-quem"><b>' + escapar(dataBR(c.data)) + " às " + escapar(c.hora) + "</b>" +
        '<span class="dash-porque">' + escapar(c.tipo || "Consulta") +
          (c.nota ? " &middot; " + escapar(c.nota) : "") + "</span></span>" +
      '<button type="button" class="dash-ir" data-ir="agenda">Ver na agenda ' +
        '<span aria-hidden="true">&rarr;</span></button>' +
    "</li>";
  }

  /* So consulta MARCADA de verdade (window.Agenda) entra aqui — a data
     derivada da reavaliacao de 4 semanas e uma sugestao, nao um compromisso,
     e nao pode aparecer como se fosse uma consulta. */
  function desenharConsultas() {
    var alvo = document.getElementById("aba-consultas");
    if (!alvo) return;
    var pid = paciente();

    var proxima = window.Agenda && window.Agenda.proxima ? window.Agenda.proxima(pid) : null;
    var todas = window.Agenda && window.Agenda.todas ? window.Agenda.todas(pid) : [];
    // "anterior" e o que ja passou — nao so "o que nao e a proxima", porque
    // pode haver mais de uma consulta futura marcada.
    var anteriores = todas.filter(function (c) { return diasDesde(c.data) > 0; });

    var topo = '<div class="fic-consultas-topo">' +
      '<button type="button" class="btn-verde" data-ir="nova-consulta">Nova consulta</button>' +
    "</div>";

    if (!todas.length) {
      alvo.innerHTML = topo +
        '<div class="lista-vazia"><strong>Nenhuma consulta registrada</strong>' +
        "<span>Registre uma consulta para iniciar o acompanhamento deste paciente.</span></div>" +
        blocoContinuidade();
      ligar(alvo);
      return;
    }

    var html = topo;

    if (proxima) {
      html += '<div class="dash-bloco dash-bloco-compacto">' +
        '<h3 class="dash-titulo">Próxima consulta</h3>' +
        '<ul class="dash-pendentes">' + linhaConsulta(proxima, true) + "</ul></div>";
    }

    html += '<div class="dash-bloco dash-bloco-compacto">' +
      '<h3 class="dash-titulo">Consultas anteriores</h3>' +
      (anteriores.length === 0
        ? '<p class="dash-vazio">Nenhuma consulta anterior.</p>'
        : '<ul class="dash-pendentes">' + anteriores.map(function (c) {
            return linhaConsulta(c, false);
          }).join("") + "</ul>") +
      "</div>";

    html += blocoContinuidade();

    alvo.innerHTML = html;
    ligar(alvo);
  }

  /* ==================================================== ABA: HOLOSCOPE === */

  /* HOLOSCOPE e mapa de investigacao e prioridade, nao diagnostico — o
     mesmo texto que ja existe no rodape da aba Visao Geral (holo-fronteira,
     index.html). Nada aqui calcula, reordena sistema ou toca na Triade:
     so le d.pontuacao/d.historico, que Panorama.doPaciente() ja monta a
     partir do que o motor e a tela do HOLOSCOPE ja gravaram. */
  function blocoContinuidadeHoloscan() {
    return '<div class="fic-continuidade">' +
      '<span class="fic-rot">Depois do mapa</span>' +
      '<button type="button" class="fic-chip" data-ir="holoscan">Confrontar no HOLOSCAN</button>' +
    "</div>";
  }

  function linhaHoloscope(p, destaque, acaoExtra) {
    return '<li class="dash-pendente' + (destaque ? " abrir" : "") + '">' +
      '<span class="pac-avatar">' + escapar((p.quando || "").slice(8, 10) || "?") + "</span>" +
      '<span class="dash-quem"><b>' + escapar(dataBR(p.quando)) + "</b>" +
        '<span class="dash-porque">Índice ' + escapar(p.indice) + " de " + escapar(p.indice_maximo) +
          (acaoExtra ? " &middot; " + escapar(acaoExtra) : "") + "</span></span>" +
      (destaque
        // so a ultima tem detalhe guardado (respostas) para reabrir de verdade
        ? '<button type="button" class="dash-ir" data-ver="holoscope">Abrir resultado ' +
          '<span aria-hidden="true">&rarr;</span></button>'
        : '<button type="button" class="dash-ir" data-ir="holoscope">Ver HOLOSCOPE ' +
          '<span aria-hidden="true">&rarr;</span></button>') +
    "</li>";
  }

  function desenharHolo() {
    var alvo = document.getElementById("aba-holoscope");
    if (!alvo) return;
    var d = reunir(); // d.pontuacao = mais recente; d.historico = tudo, do mais antigo ao mais novo

    var topo = '<div class="fic-consultas-topo">' +
      '<button type="button" class="btn-verde" data-ir="holoscope">' +
        (d.pontuacao ? "Nova aplicação" : "Iniciar HOLOSCOPE") +
      "</button></div>";

    if (!d.historico.length) {
      alvo.innerHTML = topo +
        '<div class="lista-vazia"><strong>Nenhuma aplicação HOLOSCOPE</strong>' +
        "<span>Faça a primeira aplicação para mapear prioridades de investigação.</span></div>" +
        blocoContinuidadeHoloscan();
      ligar(alvo);
      return;
    }

    var html = topo;

    if (d.pontuacao) {
      // "de preenchimento" e o mesmo estado que o cartao HOLOSCOPE da aba
      // Formularios ja mostra (d.respondidas/d.totalPerguntas) — nao recalcula.
      var estado = d.respondidas === 0 ? "não iniciado"
        : d.respondidas + " de " + d.totalPerguntas + " respondidas";
      var sistemas = d.pontuacao.sistemas.map(function (s) {
        return '<span class="fic-sis">' + escapar(s.nome) + " <b>" + s.nota.toFixed(1) + "</b></span>";
      }).join("");
      html += '<div class="dash-bloco dash-bloco-compacto">' +
        '<h3 class="dash-titulo">Última aplicação</h3>' +
        '<ul class="dash-pendentes">' + linhaHoloscope(d.pontuacao, true, estado) + "</ul>" +
        '<div class="fic-piores-caixa"><div class="fic-piores">' + sistemas + "</div></div>" +
      "</div>";
    }

    // historico e ascendente; tira a ultima (ja mostrada acima) e inverte
    var anteriores = d.historico.slice(0, -1).reverse();
    html += '<div class="dash-bloco dash-bloco-compacto">' +
      '<h3 class="dash-titulo">Histórico de aplicações</h3>' +
      (anteriores.length === 0
        ? '<p class="dash-vazio">Nenhuma aplicação anterior.</p>'
        : '<ul class="dash-pendentes">' + anteriores.map(function (p) {
            return linhaHoloscope(p, false, null);
          }).join("") + "</ul>") +
    "</div>";

    html += blocoContinuidadeHoloscan();

    alvo.innerHTML = html;
    ligar(alvo);
  }

  /* ================================================ ABA: LINHA DO TEMPO === */

  /* O que aconteceu com esta pessoa, em ordem. O app guardava os pedaços com
     data — aplicação do mapa, consulta marcada, arquivo entregue — mas nunca
     os tinha posto na mesma régua.

     Ferramenta preenchida NÃO entra: ela não guarda data. Botá-la aqui com a
     data de hoje seria inventar quando aconteceu. */
  function desenharLinha() {
    var alvo = document.getElementById("aba-linha");
    if (!alvo) return;
    var pid = paciente();
    var d = reunir();
    var eventos = [];

    (d.historico || []).forEach(function (p, i) {
      eventos.push({
        quando: p.quando, tipo: "mapa", selo: "HOLOSCOPE",
        titulo: (i + 1) + "ª aplicação do HOLOSCOPE",
        detalhe: "Índice " + p.indice + " de " + p.indice_maximo,
        acao: "aba:visao"
      });
    });

    /* Cada aplicacao de ferramenta agora tem data, entao ela entra na linha do
       tempo — era o registro que faltava, e por isso a nota dizia que nao
       entrava. Rascunho nao entra: nao aconteceu ainda. */
    if (window.Aplicacoes) {
      window.Aplicacoes.doPaciente(pid)
        .filter(function (a) { return a.status !== "rascunho"; })
        .forEach(function (a) {
          eventos.push({
            quando: diaLocal(a.concluida_em || a.iniciada_em),
            tipo: "ferramenta", selo: nomeFerramenta(a.ferramenta_id),
            titulo: nomeFerramenta(a.ferramenta_id) + " aplicada",
            detalhe: a.leitura ? escapar(a.leitura) : "sem leitura registrada",
            acao: "aba:formularios"
          });
        });
    }

    if (window.Agenda && window.Agenda.todas) {
      window.Agenda.todas(pid).forEach(function (c) {
        eventos.push({
          quando: c.data, hora: c.hora, tipo: "consulta", selo: c.tipo || "Consulta",
          titulo: (diasDesde(c.data) < 0 ? "Consulta marcada" : "Consulta"),
          detalhe: c.hora + " &middot; " + (c.duracao || 60) + " min" +
                   (c.nota ? " &middot; " + escapar(c.nota) : ""),
          acao: "agenda"
        });
      });
    }

    var pintar = function (arquivos) {
      arquivos.forEach(function (a) {
        eventos.push({
          quando: a.data || "", tipo: "documento", selo: a.tipo || "Documento",
          titulo: a.nome, detalhe: window.ArquivoStore.tamanhoLegivel(a.tamanho),
          acao: "aba:documentos"
        });
      });

      eventos.sort(function (a, b) { return (b.quando || "").localeCompare(a.quando || ""); });

      if (!eventos.length) {
        alvo.innerHTML = '<div class="dash-vazio">Nada aconteceu ainda. ' +
          "A linha do tempo se enche sozinha conforme você aplica o mapa, " +
          "marca consultas e guarda documentos.</div>";
        return;
      }

      var html = '<p class="dash-sub">' + eventos.length +
        (eventos.length === 1 ? " registro" : " registros") +
        ", do mais recente para o mais antigo.</p><div class=\"fic-tempo\">";

      var mesCorrente = null;
      eventos.forEach(function (e) {
        var mes = (e.quando || "").slice(0, 7);
        if (mes !== mesCorrente) {
          mesCorrente = mes;
          var p = (e.quando || "").split("-");
          html += '<div class="fic-tempo-mes">' +
            (p.length === 3 ? MESES[Number(p[1]) - 1] + " de " + p[0] : "sem data") +
            "</div>";
        }
        var futuro = diasDesde(e.quando) < 0;
        html += '<button type="button" class="fic-evento ' + e.tipo +
          (futuro ? " futuro" : "") + '" data-ir="' + e.acao + '">' +
          '<span class="fic-evento-marca" aria-hidden="true"></span>' +
          '<span class="fic-evento-corpo">' +
            '<span class="fic-evento-topo"><b>' + escapar(e.titulo) + "</b>" +
              '<span class="fic-selo">' + escapar(e.selo) + "</span></span>" +
            '<span class="fic-evento-quando">' + dataBR(e.quando) +
              (e.quando ? " &middot; " + (futuro ? emQuantoTempo(-diasDesde(e.quando))
                                                : haQuantoTempo(diasDesde(e.quando))) : "") +
              " &middot; " + e.detalhe + "</span>" +
          "</span></button>";
      });

      alvo.innerHTML = html + "</div>";
      ligar(alvo);
    };

    if (window.ArquivoStore) window.ArquivoStore.listar(pid).then(pintar);
    else pintar([]);
  }

  /* ================================================== ABA: FORMULÁRIOS ==== */

  function respostasGuardadas() {
    try { return (JSON.parse(localStorage.getItem(CAIXA_Q)) || {})[paciente()] || {}; }
    catch (e) { return {}; }
  }

  function perguntasDoMotor() {
    try {
      return (window.HOLOSCOPE && window.HOLOSCOPE.questionario)
        ? window.HOLOSCOPE.questionario() : [];
    } catch (e) { return []; }
  }

  function temConteudo(o) {
    return window.Panorama.temConteudo(o);
  }

  /* Os quatro formulários do método, mais as 30 ferramentas. Cada um diz o que
     é, o que já foi respondido, e o que dá para fazer com ele agora.

     SOBRE O CAMPO `extra`: ele é uma string MISTA — texto autoral com entidades
     de propósito (o separador "&middot;", o "&reg;" do nome) somado a respostas
     guardadas do paciente. Por isso o escape fica aqui, em cada pedaço que vem
     do dado, e NÃO num `escapar(f.extra)` lá embaixo na montagem do HTML:
     escapar a string inteira transformaria os separadores em texto literal.

     O valor persistido não muda — nada é removido da resposta. Só a SAÍDA é
     escapada, que é o mesmo que o histórico do OQ³/PQQ em app.js faz. */
  function desenharFormularios() {
    var alvo = document.getElementById("aba-formularios");
    if (!alvo) return;
    var d = reunir();
    var p = pacienteObj() || {};

    var fichas = [
      {
        id: "holoscope",
        nome: "HOLOSCOPE&reg; &mdash; questionário integral",
        sub: "84 perguntas em três blocos: raízes físicas, padrões emocionais e " +
             "Terreno Espiritual. É dele que sai o Índice e os cinco sistemas.",
        estado: d.respondidas === 0
          ? "não iniciado"
          : d.respondidas + " de " + d.totalPerguntas + " respondidas",
        pronto: d.respondidas >= d.totalPerguntas,
        comeco: d.respondidas > 0,
        extra: d.pontuacao
          ? "Mapa gerado em " + escapar(dataBR(d.pontuacao.quando)) +
            " &middot; Índice " + escapar(d.pontuacao.indice)
          : (d.respondidas > 0 ? "Respondido e ainda sem mapa gerado." : ""),
        ver: d.respondidas > 0 ? "questionario" : null,
        abrir: "holoscope"
      },
      {
        id: "oq3", nome: "OQ³ &mdash; O Que Quer, Precisa, Consegue",
        sub: "Clareza clínica entre desejo, necessidade e capacidade prática.",
        estado: temConteudo(p.oq3) ? "preenchido" : "não aplicado",
        pronto: temConteudo(p.oq3), comeco: temConteudo(p.oq3),
        extra: temConteudo(p.oq3)
          ? [p.oq3.quer && "Quer: " + escapar(p.oq3.quer),
             p.oq3.precisa && "Precisa: " + escapar(p.oq3.precisa),
             p.oq3.consegue && "Consegue: " + escapar(p.oq3.consegue)]
              .filter(Boolean).join(" &middot; ")
          : "",
        abrir: "corpo"
      },
      {
        id: "pqq", nome: "PQQ &mdash; Pra Que Que?",
        sub: "A chave dos porquês profundos: o propósito por trás do objetivo.",
        estado: temConteudo(p.pqq) ? "preenchido" : "não aplicado",
        pronto: temConteudo(p.pqq), comeco: temConteudo(p.pqq),
        extra: temConteudo(p.pqq)
          ? [p.pqq.objetivo && "Objetivo: " + escapar(p.pqq.objetivo),
             p.pqq.verdadeiro && "Pra que: " + escapar(p.pqq.verdadeiro)]
              .filter(Boolean).join(" &middot; ")
          : "",
        abrir: "mente"
      },
      /* O Mapa do Propósito NAO e uma ferramenta do catalogo: e uma tela que
         compoe OQ³ e PQQ e nao guarda nada. O card procurava uma aplicacao com
         ferramenta_id "mapa", que nenhuma parte do sistema cria — entao ele
         ficava "nao aplicado" para sempre, inclusive com as duas metades
         prontas.

         CRITERIO TECNICO: o estado do card e derivado do que ja existe, sem
         inventar dado nenhum —

           nenhuma das duas metades  ->  "não aplicado"
           so o OQ³                  ->  "falta o PQQ"
           so o PQQ                  ->  "falta o OQ³"
           as duas                   ->  "pronto para montar"

         "pronto" e "comeco" seguem a mesma leitura: da para montar o Mapa
         quando as duas metades existem; da para comecar quando existe uma.

         Nao foi criada aplicacao, persistencia nem historico do Mapa: isso e
         decisao metodologica em aberto. */
      (function () {
        var temOQ3 = temConteudo(p.oq3);
        var temPQQ = temConteudo(p.pqq);
        var estado = temOQ3 && temPQQ ? "pronto para montar"
                   : temOQ3 ? "falta o PQQ"
                   : temPQQ ? "falta o OQ³"
                   : "não aplicado";
        return {
          id: "mapa", nome: "Mapa do Propósito",
          sub: "Síntese do OQ³ e do PQQ: direção e um plano que pode ser vivido.",
          estado: estado,
          pronto: temOQ3 && temPQQ,
          comeco: temOQ3 || temPQQ,
          extra: temOQ3 && temPQQ
            ? "As duas metades estão preenchidas."
            : (temOQ3 || temPQQ ? "O Mapa se monta com o OQ³ e o PQQ juntos." : ""),
          abrir: "espirito"
        };
      })()
    ];

    var html = '<p class="dash-sub">No método, o HOLOSCOPE é um formulário: 84 ' +
      "respostas numa escala de 0 a 3. Aqui estão os quatro do método e o que " +
      "já foi respondido em cada um.</p>";

    html += '<div class="fic-forms">' + fichas.map(function (f) {
      return '<div class="fic-form' + (f.pronto ? " pronto" : f.comeco ? " comecado" : "") + '">' +
        '<div class="fic-form-topo">' +
          '<span class="fic-form-quem"><b>' + f.nome + "</b>" +
            "<span>" + f.sub + "</span></span>" +
          '<span class="fic-form-estado">' + escapar(f.estado) + "</span>" +
        "</div>" +
        (f.extra ? '<p class="fic-form-extra">' + f.extra + "</p>" : "") +
        '<div class="fic-form-acoes">' +
          (f.ver ? '<button type="button" class="perf-botao" data-ver="' + f.ver +
            '">Ver respostas</button>' : "") +
          '<button type="button" class="fic-ir-min" data-ir="' + f.abrir + '">' +
            (f.comeco ? "Abrir" : "Preencher agora") + "</button>" +
        "</div></div>";
    }).join("") + "</div>";

    html += '<div class="fic-forms-rodape">' +
      '<div class="fic-form-topo"><span class="fic-form-quem">' +
        "<b>Ferramentas do método</b><span>As 30 ferramentas de Corpo, Mente e " +
        "Espírito. Não são formulário do paciente: são conduta.</span></span>" +
        '<span class="fic-form-estado">' +
          (d.ferramentas.length === 0 ? "nenhuma aplicada"
            : d.ferramentas.length + " de 30 aplicadas") + "</span></div>" +
      (d.ferramentas.length > 0
        ? '<div class="fic-ferramentas">' + d.ferramentas.map(function (id) {
            return '<button type="button" class="fic-chip" data-ferr="' + escapar(id) + '">' +
              escapar(nomeFerramenta(id)) + "</button>";
          }).join("") + "</div>"
        : "") +
      "</div>";

    alvo.innerHTML = html;
    ligar(alvo);
  }

  /* ============================================ A JANELA DE RESPOSTAS ===== */

  /* O app calculava a nota e guardava as 84 respostas numa caixa que nenhuma
     tela abria. Isso quer dizer que, depois de aplicar, ninguém conseguia
     reler o que a pessoa tinha respondido — nem para conferir, nem para
     explicar de onde a nota saiu. Esta janela abre a caixa. */
  function abrirRespostas() {
    var perguntas = perguntasDoMotor();
    var dadas = respostasGuardadas();
    var d = reunir();
    var p = pacienteObj();

    var respondidas = perguntas.filter(function (q) {
      return dadas[q.id] !== undefined && dadas[q.id] !== null;
    });

    document.getElementById("fic-janela-titulo").innerHTML =
      "HOLOSCOPE&reg; &mdash; respostas de " + escapar(p ? p.nome : "paciente");
    document.getElementById("fic-janela-sub").textContent =
      respondidas.length + " de " + perguntas.length + " perguntas respondidas. " +
      "O número ao lado de cada uma é o que ela vale na escala, de 0 a 3.";

    var html = "";

    /* O resultado vem primeiro, como no papel: a conta, e depois as respostas
       que a produziram. Sem mapa gerado, diz isso em vez de mostrar nada. */
    if (d.pontuacao) {
      html += '<div class="fic-res"><div class="fic-res-topo">' +
        "<b>Índice HOLOS " + d.pontuacao.indice + "</b>" +
        "<span>de " + d.pontuacao.indice_maximo + " &middot; mapa de " +
        dataBR(d.pontuacao.quando) + "</span></div>" +
        '<div class="fic-res-grade">' + d.pontuacao.sistemas.map(function (s) {
          return '<div class="fic-res-sis"><span>' + escapar(s.nome) + "</span><b>" +
            s.nota.toFixed(1) + "</b></div>";
        }).join("") + "</div></div>";
    } else if (respondidas.length > 0) {
      html += '<div class="dash-vazio">Respondido, e o mapa ainda não foi gerado. ' +
        "As respostas estão aqui; a leitura sai quando você calcular.</div>";
    }

    // agrupado por bloco, que e como a pessoa respondeu
    var porOrigem = {};
    respondidas.forEach(function (q) {
      var o = q.origem || "sintoma";
      (porOrigem[o] = porOrigem[o] || []).push(q);
    });

    ["sintoma", "emocao", "espiritual"].forEach(function (origem) {
      var lista = porOrigem[origem];
      if (!lista || !lista.length) return;
      html += '<h4 class="fic-bloco-titulo">' + (NOME_ORIGEM[origem] || origem) +
        ' <span>' + lista.length + "</span></h4>";
      html += '<div class="fic-respostas">' + lista.map(function (q) {
        var valor = dadas[q.id];
        var escala = ESCALAS[q.escala] || ESCALAS.frequencia;
        /* Sentido invertido quer dizer que a resposta alta é a boa. Mostrar a
           carga sem dizer isso faria "Sempre = 3" parecer ruim onde é ótimo. */
        var invertido = q.sentido === "invertido";
        return '<div class="fic-resposta">' +
          '<span class="fic-pergunta">' + escapar(q.pergunta) +
            (invertido ? '<i title="Nesta pergunta, responder alto é sinal bom">sentido invertido</i>' : "") +
          "</span>" +
          '<span class="fic-valor-resposta"><b>' + valor + "</b>" +
          "<span>" + escapar(escala[valor] || "") + "</span></span>" +
          "</div>";
      }).join("") + "</div>";
    });

    if (!respondidas.length) {
      html = '<div class="dash-vazio">Nenhuma resposta guardada para esta pessoa.</div>';
    } else {
      html += '<div class="fic-janela-acoes">' +
        '<button type="button" class="perf-botao" data-ir="holoscope">' +
        "Abrir o questionário para corrigir</button></div>";
    }

    document.getElementById("fic-janela-corpo").innerHTML = html;
    var janela = document.getElementById("fic-janela");
    janela.classList.remove("hidden");
    document.getElementById("fic-janela-fechar").focus();
  }

  function fecharJanela() {
    var j = document.getElementById("fic-janela");
    if (j) j.classList.add("hidden");
  }

  /* ---------- ligar --------------------------------------------------------- */

  var ligados = [];

  function ligar(alvo) {
    if (ligados.indexOf(alvo) >= 0) return;
    ligados.push(alvo);

    alvo.addEventListener("click", function (ev) {
      var ver = ev.target.closest("[data-ver]");
      if (ver) { abrirRespostas(); return; }

      var ir = ev.target.closest("[data-ir]");
      if (ir) {
        fecharJanela();
        // "aba:x" abre uma aba aqui mesmo; o resto e secao do menu
        if (ir.dataset.ir.indexOf("aba:") === 0) {
          var aba = document.querySelector('[data-aba="' + ir.dataset.ir.slice(4) + '"]');
          if (aba) { aba.click(); aba.scrollIntoView({ block: "center" }); }
          return;
        }
        // Mesmo atalho do cabecalho (data-atalho="agenda"): ir para a agenda
        // e abrir o formulario, ja com esta pessoa (agenda.js le pacienteAtivoId()).
        if (ir.dataset.ir === "nova-consulta") {
          var secaoAgenda = document.querySelector('.nav-item[data-secao="agenda"]');
          if (secaoAgenda) secaoAgenda.click();
          var novo = document.querySelector('[data-novo="consulta"]');
          if (novo) novo.click();
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

  /* ---------- desenhar o que está à vista ---------------------------------- */

  var DESENHOS = {
    visao: desenharVisao,
    consultas: desenharConsultas,
    holoscope: desenharHolo,
    linha: desenharLinha,
    formularios: desenharFormularios
  };

  /** Chamada por arquivos.js quando a aba muda: só a aba aberta é desenhada. */
  window.desenharAbaDaFicha = function (nome) {
    abaAtual = nome;
    if (DESENHOS[nome]) DESENHOS[nome]();
  };

  function desenhar() {
    if (!document.getElementById("ficha-faixa")) return;
    desenharFaixa();
    if (DESENHOS[abaAtual]) DESENHOS[abaAtual]();
  }

  window.redesenharFicha = desenhar;

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.getElementById("ficha-faixa")) return;

    ligar(document.getElementById("ficha-faixa"));
    ligar(document.getElementById("fic-janela-corpo"));

    document.getElementById("fic-janela-fechar")
      .addEventListener("click", fecharJanela);
    // clicar fora da caixa fecha; dentro, não
    document.getElementById("fic-janela").addEventListener("click", function (ev) {
      if (ev.target.id === "fic-janela") fecharJanela();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") fecharJanela();
    });

    desenhar();

    var anterior = window.aoTrocarPaciente;
    window.aoTrocarPaciente = function () {
      if (typeof anterior === "function") anterior();
      desenhar();
    };
  });
})();
