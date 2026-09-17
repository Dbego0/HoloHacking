/* ===========================================================================
   AGENDA — o calendário do consultório
   ===========================================================================

   A primeira versão desta tela era uma lista de retornos calculados: última
   aplicação + 28 dias, e um campo de data para quem quisesse marcar outro dia.
   Resolvia a pergunta "quem sumiu" e não resolvia a que vem logo depois dela,
   que é "quando eu atendo essa pessoa" — porque uma data solta não tem hora,
   não tem duração, não convive com as outras do mesmo dia e não sabe que a
   terça à tarde está bloqueada.

   Agora são três camadas sobre o mesmo calendário:

     CONSULTAS   o atendimento marcado: paciente, dia, hora, duração
     BLOQUEIOS   o tempo que não está disponível — almoço, aula, viagem
     SUGESTÕES   o retorno de 4 semanas que o método promete, calculado,
                 aparecendo só para quem ainda não tem consulta marcada

   As duas primeiras são dado que alguém escreveu. A terceira é cálculo, e por
   isso se veste diferente na tela: é um convite para marcar, não um
   compromisso assumido. Confundir as duas faria o app dizer que há consulta
   onde não há.

   A data que a versão anterior guardava (holohacking.agenda) vira consulta na
   primeira carga — ver migrar(). Ninguém perde o que já tinha marcado.

   O que NÃO está aqui: "Conectar Google Calendar". Isso pede OAuth, um
   servidor para guardar o token e uma chave de API. Este app não tem nenhum
   dos três: roda inteiro no navegador. Um botão que abre e não conecta seria
   pior do que botão nenhum.
   =========================================================================== */

(function () {
  "use strict";

  var CAIXA_ANTIGA = "holohacking.agenda";

  /* A faixa de horas desenhada. Não é o horário de ninguém: é o intervalo em
     que a grade existe. */
  var HORA_INICIO = 7;
  var HORA_FIM = 21;
  var ALTURA_HORA = 52;          // px por hora, igual em Dia e Semana

  var TIPOS = ["Primeira consulta", "Retorno", "Reavaliação HOLOSCOPE", "Online"];
  var DURACOES = [30, 45, 60, 90];

  var DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
               "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var MESES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun",
                     "jul", "ago", "set", "out", "nov", "dez"];

  var alvo = null;
  var vista = "semana";          // dia | semana | mes
  var foco = hoje();             // a data que ancora o período mostrado
  var filtros = { consultas: true, bloqueios: true, sugestoes: true };
  var consultas = [];
  var bloqueios = [];
  var editando = null;           // {tipo:"consulta"|"bloqueio", dado:{...}} ou null
  var ligado = false;

  /* ---------- datas, sem biblioteca -------------------------------------- */

  function hoje() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function iso(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function deIso(s) {
    var p = String(s || "").split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function somar(d, n) {
    var x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function somarMes(d, n) {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
  }
  /** Domingo da semana de d: o calendário brasileiro começa no domingo. */
  function inicioDaSemana(d) {
    return somar(d, -d.getDay());
  }
  function mesmoDia(a, b) { return iso(a) === iso(b); }
  function dataBR(s) { return s ? s.split("-").reverse().join("/") : ""; }

  function minutos(hhmm) {
    var p = String(hhmm || "0:0").split(":");
    return Number(p[0]) * 60 + Number(p[1]);
  }
  function paraHora(min) {
    return String(Math.floor(min / 60)).padStart(2, "0") + ":" +
           String(min % 60).padStart(2, "0");
  }

  function escapar(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- ler e gravar ------------------------------------------------ */

  function banco() { return window.DadosLocais || null; }

  function carregar() {
    var b = banco();
    if (!b) return Promise.resolve();
    return Promise.all([
      Promise.resolve(b.from("consultas").select("*").order("data", { ascending: true })),
      Promise.resolve(b.from("bloqueios").select("*").order("data", { ascending: true }))
    ]).then(function (r) {
      consultas = r[0].data || [];
      bloqueios = r[1].data || [];
    });
  }

  /* A versão anterior guardava {pid: {data, nota}} numa caixa do localStorage:
     um retorno marcado sem hora nenhuma. Vira consulta às 9h — e a caixa some,
     para a migração não rodar de novo e duplicar tudo. */
  function migrar() {
    var cru;
    try { cru = JSON.parse(localStorage.getItem(CAIXA_ANTIGA) || "null"); }
    catch (e) { cru = null; }
    if (!cru || !Object.keys(cru).length) return Promise.resolve(false);

    var b = banco();
    if (!b) return Promise.resolve(false);

    var novas = Object.keys(cru).filter(function (pid) {
      return cru[pid] && cru[pid].data;
    }).map(function (pid) {
      return Promise.resolve(b.from("consultas").insert({
        paciente_id: pid, data: cru[pid].data, hora: "09:00",
        duracao: 60, tipo: "Retorno",
        nota: cru[pid].nota || "Retorno marcado na versão anterior da agenda."
      }).select().single());
    });

    return Promise.all(novas).then(function () {
      try { localStorage.removeItem(CAIXA_ANTIGA); } catch (e) { /* idem */ }
      return carregar();
    }).then(function () { return true; });
  }

  function gravarConsulta(d) {
    var b = banco();
    var campos = {
      paciente_id: d.paciente_id, data: d.data, hora: d.hora,
      duracao: Number(d.duracao) || 60, tipo: d.tipo, nota: d.nota || ""
    };
    return Promise.resolve(d.id
      ? b.from("consultas").update(campos).eq("id", d.id)
      : b.from("consultas").insert(campos).select().single());
  }

  function gravarBloqueio(d) {
    var b = banco();
    var campos = {
      data: d.data, inicio: d.inicio, fim: d.fim,
      dia_todo: !!d.dia_todo, motivo: d.motivo || ""
    };
    return Promise.resolve(d.id
      ? b.from("bloqueios").update(campos).eq("id", d.id)
      : b.from("bloqueios").insert(campos).select().single());
  }

  function apagar(tabela, id) {
    return Promise.resolve(banco().from(tabela).delete().eq("id", id));
  }

  /* ---------- quem é quem ------------------------------------------------- */

  function nomeDe(pid) {
    var todos = (window.pacientesTodos && window.pacientesTodos()) || [];
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].id === pid) return todos[i].nome;
    }
    return "paciente removido";
  }

  /* ---------- as três camadas de um dia ----------------------------------- */

  function consultasDe(dia) {
    if (!filtros.consultas) return [];
    return consultas.filter(function (c) { return c.data === dia; })
      .sort(function (a, b) { return minutos(a.hora) - minutos(b.hora); });
  }

  function bloqueiosDe(dia) {
    if (!filtros.bloqueios) return [];
    return bloqueios.filter(function (b) { return b.data === dia; })
      .sort(function (a, b) { return minutos(a.inicio) - minutos(b.inicio); });
  }

  /* O retorno de 4 semanas de quem ainda não tem nada marcado daqui para a
     frente. Quem já foi agendado sai da lista na hora — senão a tela
     continuaria pedindo o que já foi feito. */
  function sugestoes() {
    if (!filtros.sugestoes || !window.Panorama || !window.Panorama.agenda) return [];
    var a;
    try { a = window.Panorama.agenda(); } catch (e) { return []; }
    var deHoje = iso(hoje());
    return a.linhas.filter(function (l) {
      if (!l.derivada) return false;
      return !consultas.some(function (c) {
        return c.paciente_id === l.paciente.id && c.data >= deHoje;
      });
    });
  }

  function sugestoesDe(dia) {
    return sugestoes().filter(function (l) { return l.derivada === dia; });
  }

  function vazioNoPeriodo(dias) {
    return dias.every(function (d) {
      return consultasDe(d).length === 0 && bloqueiosDe(d).length === 0 &&
             sugestoesDe(d).length === 0;
    });
  }

  /* ---------- o período mostrado ------------------------------------------ */

  function diasDoPeriodo() {
    if (vista === "dia") return [iso(foco)];
    if (vista === "semana") {
      var d0 = inicioDaSemana(foco);
      return [0, 1, 2, 3, 4, 5, 6].map(function (i) { return iso(somar(d0, i)); });
    }
    // mes: da primeira celula da grade ate a ultima, seis semanas cheias
    var primeiro = new Date(foco.getFullYear(), foco.getMonth(), 1);
    var inicio = inicioDaSemana(primeiro);
    var saida = [];
    for (var i = 0; i < 42; i++) saida.push(iso(somar(inicio, i)));
    return saida;
  }

  function rotuloDoPeriodo() {
    if (vista === "dia") {
      return DIAS[foco.getDay()] + ", " + foco.getDate() + " de " + MESES[foco.getMonth()];
    }
    if (vista === "semana") {
      var a = inicioDaSemana(foco), b = somar(a, 6);
      return a.getDate() + " " + MESES_CURTO[a.getMonth()] + " – " +
             b.getDate() + " " + MESES_CURTO[b.getMonth()];
    }
    return MESES[foco.getMonth()] + " de " + foco.getFullYear();
  }

  function andar(passo) {
    if (vista === "dia") foco = somar(foco, passo);
    else if (vista === "semana") foco = somar(foco, passo * 7);
    else foco = somarMes(foco, passo);
    desenhar();
  }

  /* ---------- o cabeçalho -------------------------------------------------- */

  function ico(d, t) {
    return '<svg width="' + (t || 15) + '" height="' + (t || 15) + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }

  function cabecalho() {
    return '<div class="secao-cabeca cal-cabeca">' +
        "<div>" +
          '<span class="eyebrow">Atendimento &mdash; calendário</span>' +
          "<h2>Sua <em>agenda</em></h2>" +
        "</div>" +
        '<div class="cal-acoes">' +
          '<button type="button" class="perf-botao" data-novo="bloqueio">' +
            ico('<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M9 15l6-6"/>') +
            " Bloquear</button>" +
          '<button type="button" class="btn-verde" data-novo="consulta">+ Nova consulta</button>' +
        "</div>" +
      "</div>";
  }

  function navegacao() {
    var botoes = [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]];
    return '<div class="cal-barra">' +
      '<div class="cal-andar">' +
        '<button type="button" class="cal-seta" data-andar="-1" aria-label="Período anterior">&lsaquo;</button>' +
        '<b class="cal-rotulo">' + escapar(rotuloDoPeriodo()) + "</b>" +
        '<button type="button" class="cal-seta" data-andar="1" aria-label="Próximo período">&rsaquo;</button>' +
        '<button type="button" class="perf-botao cal-hoje" data-hoje="1">Hoje</button>' +
        '<input type="date" id="cal-data" value="' + iso(foco) + '" aria-label="Ir para a data">' +
      "</div>" +
      '<div class="cal-vistas" role="group" aria-label="Como ver o período">' +
        botoes.map(function (b) {
          return '<button type="button" class="cal-vista' + (vista === b[0] ? " ativa" : "") +
            '" data-vista="' + b[0] + '" aria-pressed="' + (vista === b[0]) + '">' +
            b[1] + "</button>";
        }).join("") +
      "</div></div>";
  }

  function chips() {
    var quais = [
      { id: "consultas", nome: "Consultas" },
      { id: "bloqueios", nome: "Bloqueios" },
      { id: "sugestoes", nome: "Retornos sugeridos" }
    ];
    return '<div class="cal-chips" role="group" aria-label="O que mostrar">' +
      quais.map(function (q) {
        var on = filtros[q.id];
        return '<button type="button" class="cal-chip ' + q.id + (on ? " ativo" : "") +
          '" data-camada="' + q.id + '" aria-pressed="' + on + '">' +
          '<span class="cal-chip-marca" aria-hidden="true"></span>' +
          escapar(q.nome) + "</button>";
      }).join("") +
      '<span class="cal-chips-nota">Sugestão é cálculo, não compromisso: o retorno de ' +
      "4 semanas de quem ainda não tem consulta marcada.</span></div>";
  }

  /* ---------- a grade de horas (Dia e Semana) ----------------------------- */

  function faixaDeHoras() {
    var linhas = "";
    for (var h = HORA_INICIO; h <= HORA_FIM; h++) {
      linhas += '<span class="cal-hora">' + String(h).padStart(2, "0") + ":00</span>";
    }
    return '<div class="cal-horas">' + linhas + "</div>";
  }

  /** Onde o evento cai dentro da coluna, em px, a partir de HORA_INICIO. */
  function posicao(inicioMin, duracaoMin) {
    var topo = (inicioMin - HORA_INICIO * 60) / 60 * ALTURA_HORA;
    var alt = Math.max(duracaoMin / 60 * ALTURA_HORA, 22);
    return "top:" + topo + "px;height:" + alt + "px";
  }

  function eventosDoDia(dia) {
    var html = "";

    bloqueiosDe(dia).filter(function (b) { return !b.dia_todo; }).forEach(function (b) {
      var dur = minutos(b.fim) - minutos(b.inicio);
      html += '<button type="button" class="cal-evento bloqueio" ' +
        'style="' + posicao(minutos(b.inicio), Math.max(dur, 30)) + '" ' +
        'data-abrir="bloqueio" data-id="' + escapar(b.id) + '">' +
        "<b>" + escapar(b.motivo || "Bloqueado") + "</b>" +
        "<span>" + escapar(b.inicio + "–" + b.fim) + "</span>" +
        "</button>";
    });

    consultasDe(dia).forEach(function (c) {
      html += '<button type="button" class="cal-evento consulta" ' +
        'style="' + posicao(minutos(c.hora), Number(c.duracao) || 60) + '" ' +
        'data-abrir="consulta" data-id="' + escapar(c.id) + '">' +
        "<b>" + escapar(nomeDe(c.paciente_id)) + "</b>" +
        "<span>" + escapar(c.hora) + " &middot; " + escapar(c.tipo || "Consulta") + "</span>" +
        "</button>";
    });

    return html;
  }

  /** O que não tem hora: bloqueio de dia inteiro e retorno sugerido. */
  function semHoraDe(dia) {
    var itens = bloqueiosDe(dia).filter(function (b) { return b.dia_todo; })
      .map(function (b) {
        return '<button type="button" class="cal-faixa-item bloqueio" ' +
          'data-abrir="bloqueio" data-id="' + escapar(b.id) + '">' +
          escapar(b.motivo || "Bloqueado") + "</button>";
      });

    /* A sugestão é cálculo, não compromisso — por isso ela é tracejada e diz
       de onde veio. Clicar nela abre a consulta já com o paciente escolhido. */
    itens = itens.concat(sugestoesDe(dia).map(function (l) {
      return '<button type="button" class="cal-faixa-item sugestao" ' +
        'data-sugerir="' + escapar(l.paciente.id) + '" data-dia="' + dia + '" ' +
        'title="Retorno de 4 semanas de ' + escapar(l.paciente.nome) +
        '. Ninguém marcou ainda.">' + escapar(l.paciente.nome) + "</button>";
    }));

    return itens.join("");
  }

  function grade(dias) {
    var cabeca = dias.map(function (d) {
      var dt = deIso(d);
      return '<div class="cal-cabeca-dia' + (mesmoDia(dt, hoje()) ? " hoje" : "") + '">' +
        "<span>" + DIAS[dt.getDay()] + "</span><b>" + dt.getDate() + "</b></div>";
    }).join("");

    var colunas = dias.map(function (d) {
      var dt = deIso(d);
      return '<div class="cal-coluna' + (mesmoDia(dt, hoje()) ? " hoje" : "") +
        '" data-dia="' + d + '">' + eventosDoDia(d) + "</div>";
    }).join("");

    var semHora = dias.map(semHoraDe);
    var faixa = semHora.some(Boolean)
      ? '<div class="cal-faixa">' +
          '<span class="cal-faixa-rotulo">sem hora</span>' +
          '<div class="cal-faixa-dias">' + semHora.map(function (conteudo, i) {
            return '<div class="cal-faixa-dia" data-dia="' + dias[i] + '">' +
              conteudo + "</div>";
          }).join("") + "</div>" +
        "</div>"
      : "";

    var altura = (HORA_FIM - HORA_INICIO) * ALTURA_HORA;

    return '<div class="cal-grade ' + vista + '">' +
      '<div class="cal-grade-cabeca"><span class="cal-canto"></span>' +
        '<div class="cal-cabeca-dias">' + cabeca + "</div></div>" +
      faixa +
      '<div class="cal-grade-corpo" style="--alt-hora:' + ALTURA_HORA + 'px">' +
        faixaDeHoras() +
        '<div class="cal-colunas" style="height:' + altura + 'px">' + colunas + "</div>" +
      "</div></div>";
  }

  /* ---------- a grade do mês ---------------------------------------------- */

  function gradeDoMes(dias) {
    var mesAtual = foco.getMonth();
    var celulas = dias.map(function (d) {
      var dt = deIso(d);
      var cs = consultasDe(d), bs = bloqueiosDe(d), ss = sugestoesDe(d);

      var itens = bs.map(function (b) {
        return '<button type="button" class="cal-pilula bloqueio" data-abrir="bloqueio" ' +
          'data-id="' + escapar(b.id) + '">' +
          escapar(b.dia_todo ? "dia todo" : b.inicio) + " " +
          escapar(b.motivo || "Bloqueado") + "</button>";
      }).concat(cs.map(function (c) {
        return '<button type="button" class="cal-pilula consulta" data-abrir="consulta" ' +
          'data-id="' + escapar(c.id) + '">' + escapar(c.hora) + " " +
          escapar(nomeDe(c.paciente_id)) + "</button>";
      })).concat(ss.map(function (l) {
        return '<button type="button" class="cal-pilula sugestao" data-sugerir="' +
          escapar(l.paciente.id) + '" data-dia="' + d + '">' +
          escapar(l.paciente.nome) + "</button>";
      }));

      return '<div class="cal-celula' + (dt.getMonth() !== mesAtual ? " fora" : "") +
        (mesmoDia(dt, hoje()) ? " hoje" : "") + '" data-dia="' + d + '">' +
        '<span class="cal-numero">' + dt.getDate() + "</span>" +
        itens.slice(0, 3).join("") +
        (itens.length > 3 ? '<span class="cal-mais">+' + (itens.length - 3) + "</span>" : "") +
        "</div>";
    }).join("");

    return '<div class="cal-mes">' +
      '<div class="cal-mes-cabeca">' + DIAS.map(function (d) {
        return "<span>" + d + "</span>";
      }).join("") + "</div>" +
      '<div class="cal-mes-corpo">' + celulas + "</div></div>";
  }

  /* ---------- o vazio ------------------------------------------------------ */

  function vazio() {
    var quando = vista === "dia" ? "neste dia"
               : vista === "semana" ? "esta semana" : "neste mês";
    return '<div class="cal-vazio">' +
      '<span class="cal-vazio-ico">' +
        ico('<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>', 26) +
      "</span>" +
      "<b>Nenhuma consulta " + quando + "</b>" +
      "<p>A agenda está livre neste período.</p>" +
      '<button type="button" class="btn-verde" data-novo="consulta">+ Criar consulta</button>' +
      "</div>";
  }

  /* ---------- o formulário -------------------------------------------------- */

  function formulario() {
    if (!editando) return "";
    return editando.tipo === "consulta" ? formConsulta() : formBloqueio();
  }

  function formConsulta() {
    var c = editando.dado;
    var pacientes = (window.pacientesTodos && window.pacientesTodos()) || [];

    if (!pacientes.length) {
      return '<div class="cal-form">' +
        '<div class="cal-form-topo"><h3>Nova consulta</h3>' +
          '<button type="button" class="perf-tirar" data-fechar="1">fechar</button></div>' +
        '<p class="dash-vazio">Não há paciente cadastrado. Consulta é com alguém — ' +
        "cadastre a pessoa primeiro.</p>" +
        '<div class="perf-foto-acoes">' +
          '<button type="button" class="perf-botao" data-ir-pacientes="1">Ir para Pacientes</button>' +
        "</div></div>";
    }

    return '<div class="cal-form">' +
      '<div class="cal-form-topo">' +
        "<h3>" + (c.id ? "Editar consulta" : "Nova consulta") + "</h3>" +
        '<button type="button" class="perf-tirar" data-fechar="1">fechar</button>' +
      "</div>" +
      '<div class="perf-grade">' +
        '<div class="perf-campo"><label for="cf-paciente">Paciente</label>' +
          '<select id="cf-paciente">' + pacientes.map(function (p) {
            return '<option value="' + escapar(p.id) + '"' +
              (p.id === c.paciente_id ? " selected" : "") + ">" + escapar(p.nome) + "</option>";
          }).join("") + "</select></div>" +
        '<div class="perf-campo"><label for="cf-tipo">Tipo</label>' +
          '<select id="cf-tipo">' + TIPOS.map(function (t) {
            return "<option" + (t === c.tipo ? " selected" : "") + ">" + t + "</option>";
          }).join("") + "</select></div>" +
        '<div class="perf-campo"><label for="cf-data">Dia</label>' +
          '<input type="date" id="cf-data" value="' + escapar(c.data) + '"></div>' +
        '<div class="perf-campo"><label for="cf-hora">Hora</label>' +
          '<input type="time" id="cf-hora" value="' + escapar(c.hora) + '" step="300"></div>' +
        '<div class="perf-campo"><label for="cf-duracao">Duração</label>' +
          '<select id="cf-duracao">' + DURACOES.map(function (d) {
            return '<option value="' + d + '"' +
              (Number(c.duracao) === d ? " selected" : "") + ">" + d + " minutos</option>";
          }).join("") + "</select></div>" +
      "</div>" +
      '<div class="perf-campo largo"><label for="cf-nota">Observação</label>' +
        '<input type="text" id="cf-nota" value="' + escapar(c.nota || "") +
        '" placeholder="O que precisa lembrar sobre este atendimento"></div>' +
      '<p class="perf-aviso" id="cal-aviso"></p>' +
      '<div class="cal-form-acoes">' +
        (c.id ? '<button type="button" class="perf-tirar forte" data-apagar="consulta">Desmarcar</button>' : "") +
        '<button type="button" class="btn-verde" data-salvar="consulta">' +
          (c.id ? "Salvar" : "Marcar consulta") + "</button>" +
      "</div></div>";
  }

  function formBloqueio() {
    var b = editando.dado;
    return '<div class="cal-form">' +
      '<div class="cal-form-topo">' +
        "<h3>" + (b.id ? "Editar bloqueio" : "Bloquear um horário") + "</h3>" +
        '<button type="button" class="perf-tirar" data-fechar="1">fechar</button>' +
      "</div>" +
      '<p class="perf-ajuda">Tempo que não está disponível para atender: almoço, aula, ' +
      "viagem. Não é consulta de ninguém &mdash; é o contrário disso.</p>" +
      '<div class="perf-grade">' +
        '<div class="perf-campo"><label for="bf-data">Dia</label>' +
          '<input type="date" id="bf-data" value="' + escapar(b.data) + '"></div>' +
        '<div class="perf-campo"><label for="bf-inicio">Das</label>' +
          '<input type="time" id="bf-inicio" value="' + escapar(b.inicio) +
          '" step="300"' + (b.dia_todo ? " disabled" : "") + "></div>" +
        '<div class="perf-campo"><label for="bf-fim">Até</label>' +
          '<input type="time" id="bf-fim" value="' + escapar(b.fim) +
          '" step="300"' + (b.dia_todo ? " disabled" : "") + "></div>" +
      "</div>" +
      '<label class="cal-dia-todo"><input type="checkbox" id="bf-dia-todo"' +
        (b.dia_todo ? " checked" : "") + "> Dia todo</label>" +
      '<div class="perf-campo largo"><label for="bf-motivo">Motivo</label>' +
        '<input type="text" id="bf-motivo" value="' + escapar(b.motivo || "") +
        '" placeholder="Almoço, aula, viagem..."></div>' +
      '<p class="perf-aviso" id="cal-aviso"></p>' +
      '<div class="cal-form-acoes">' +
        (b.id ? '<button type="button" class="perf-tirar forte" data-apagar="bloqueio">Remover</button>' : "") +
        '<button type="button" class="btn-verde" data-salvar="bloqueio">' +
          (b.id ? "Salvar" : "Bloquear") + "</button>" +
      "</div></div>";
  }

  /* ---------- desenhar ----------------------------------------------------- */

  function desenhar() {
    if (!alvo) return;
    var dias = diasDoPeriodo();

    var corpo;
    if (vista === "mes") corpo = gradeDoMes(dias);
    else if (vazioNoPeriodo(dias)) corpo = vazio();
    else corpo = grade(dias);

    alvo.innerHTML = cabecalho() + navegacao() + chips() + formulario() + corpo;

    marcarNoMenu();
    ligar();
    rolarParaOTrabalho();
  }

  /* A grade começa às 7h, mas quem abre quer ver o dia de trabalho. Sem isto,
     a primeira coisa na tela é a madrugada vazia. */
  function rolarParaOTrabalho() {
    var corpo = alvo.querySelector(".cal-grade-corpo");
    if (corpo) corpo.scrollTop = Math.max(0, (8 - HORA_INICIO) * ALTURA_HORA - 8);
  }

  /** O número ao lado de "Agenda" no menu: quantas consultas há HOJE. É o que
      a pessoa quer de relance, e não some quando o mês está cheio. */
  function marcarNoMenu() {
    var tag = document.getElementById("nav-agenda-venc");
    if (!tag) return;
    var n = consultas.filter(function (c) { return c.data === iso(hoje()); }).length;
    tag.textContent = n;
    tag.classList.toggle("hidden", n === 0);
  }

  /* ---------- abrir os formulários ----------------------------------------- */

  function novaConsulta(dia, hora, pid) {
    var pacientes = (window.pacientesTodos && window.pacientesTodos()) || [];
    editando = { tipo: "consulta", dado: {
      paciente_id: pid || (pacientes[0] ? pacientes[0].id : ""),
      data: dia || iso(foco), hora: hora || "09:00",
      duracao: 60, tipo: pid ? "Reavaliação HOLOSCOPE" : "Retorno", nota: ""
    } };
    desenhar();
  }

  function novoBloqueio(dia, hora) {
    editando = { tipo: "bloqueio", dado: {
      data: dia || iso(foco), inicio: hora || "12:00",
      fim: paraHora(minutos(hora || "12:00") + 60), dia_todo: false, motivo: ""
    } };
    desenhar();
  }

  function abrir(tipo, id) {
    var lista = tipo === "consulta" ? consultas : bloqueios;
    var achado = lista.filter(function (x) { return x.id === id; })[0];
    if (!achado) return;
    editando = { tipo: tipo, dado: Object.assign({}, achado) };
    desenhar();
  }

  function avisar(texto) {
    var el = document.getElementById("cal-aviso");
    if (el) { el.textContent = texto; el.className = "perf-aviso ruim"; }
    else if (window.avisar) window.avisar(texto);
  }

  /* ---------- salvar -------------------------------------------------------- */

  function salvarConsulta() {
    var d = editando.dado;
    var pid = document.getElementById("cf-paciente");
    if (!pid) return;
    d.paciente_id = pid.value;
    d.tipo = document.getElementById("cf-tipo").value;
    d.data = document.getElementById("cf-data").value;
    d.hora = document.getElementById("cf-hora").value;
    d.duracao = Number(document.getElementById("cf-duracao").value);
    d.nota = document.getElementById("cf-nota").value.trim();

    if (!d.data || !d.hora) { avisar("Informe o dia e a hora."); return; }

    /* Duas consultas no mesmo horário é quase sempre engano de digitação, e
       descobrir isso na hora da consulta é tarde. Avisa e deixa passar: às
       vezes é de propósito — remarcou e vai cancelar a outra em seguida. */
    var choque = consultas.filter(function (c) {
      if (c.id === d.id || c.data !== d.data) return false;
      var a1 = minutos(d.hora), a2 = a1 + d.duracao;
      var b1 = minutos(c.hora), b2 = b1 + (Number(c.duracao) || 60);
      return a1 < b2 && b1 < a2;
    })[0];

    gravarConsulta(d).then(function (r) {
      if (r && r.error) { avisar(r.error.message); return; }
      editando = null;
      foco = deIso(d.data);
      return carregar().then(function () {
        desenhar();
        if (window.avisar) {
          window.avisar(choque
            ? "Marcado — mas já havia consulta às " + choque.hora + " neste dia."
            : "Consulta marcada para " + dataBR(d.data) + " às " + d.hora + ".");
        }
      });
    });
  }

  function salvarBloqueio() {
    var d = editando.dado;
    d.data = document.getElementById("bf-data").value;
    d.dia_todo = document.getElementById("bf-dia-todo").checked;
    d.inicio = document.getElementById("bf-inicio").value;
    d.fim = document.getElementById("bf-fim").value;
    d.motivo = document.getElementById("bf-motivo").value.trim();

    if (!d.data) { avisar("Informe o dia."); return; }
    if (!d.dia_todo) {
      if (!d.inicio || !d.fim) { avisar("Informe o início e o fim."); return; }
      if (minutos(d.fim) <= minutos(d.inicio)) {
        avisar("O fim tem que ser depois do início.");
        return;
      }
    }

    gravarBloqueio(d).then(function (r) {
      if (r && r.error) { avisar(r.error.message); return; }
      editando = null;
      foco = deIso(d.data);
      return carregar().then(desenhar);
    });
  }

  function apagarAtual(tipo) {
    var d = editando.dado;
    if (!d.id) return;
    if (!confirm(tipo === "consulta" ? "Desmarcar esta consulta?" : "Remover este bloqueio?")) return;
    apagar(tipo === "consulta" ? "consultas" : "bloqueios", d.id).then(function () {
      editando = null;
      return carregar().then(desenhar);
    });
  }

  /* ---------- ligar --------------------------------------------------------- */

  function ligar() {
    if (ligado) return;
    ligado = true;

    alvo.addEventListener("click", function (ev) {
      var andarBtn = ev.target.closest("[data-andar]");
      if (andarBtn) { andar(Number(andarBtn.dataset.andar)); return; }

      if (ev.target.closest("[data-hoje]")) { foco = hoje(); desenhar(); return; }

      var v = ev.target.closest("[data-vista]");
      if (v) { vista = v.dataset.vista; desenhar(); return; }

      var camada = ev.target.closest("[data-camada]");
      if (camada) {
        filtros[camada.dataset.camada] = !filtros[camada.dataset.camada];
        desenhar();
        return;
      }

      var novo = ev.target.closest("[data-novo]");
      if (novo) {
        // Quem chega aqui do cabecalho da ficha ou da aba Consultas ja tem
        // um paciente ativo — o formulario nasce com ele, em vez de cair no
        // primeiro nome da lista e pedir para escolher de novo.
        if (novo.dataset.novo === "consulta") {
          novaConsulta(null, null, window.pacienteAtivoId ? window.pacienteAtivoId() : null);
        } else novoBloqueio();
        return;
      }

      var sugerir = ev.target.closest("[data-sugerir]");
      if (sugerir) {
        novaConsulta(sugerir.dataset.dia, "09:00", sugerir.dataset.sugerir);
        return;
      }

      var abrirBtn = ev.target.closest("[data-abrir]");
      if (abrirBtn) { abrir(abrirBtn.dataset.abrir, abrirBtn.dataset.id); return; }

      if (ev.target.closest("[data-fechar]")) { editando = null; desenhar(); return; }

      var salvar = ev.target.closest("[data-salvar]");
      if (salvar) {
        if (salvar.dataset.salvar === "consulta") salvarConsulta();
        else salvarBloqueio();
        return;
      }

      var apagarBtn = ev.target.closest("[data-apagar]");
      if (apagarBtn) { apagarAtual(apagarBtn.dataset.apagar); return; }

      if (ev.target.closest("[data-ir-pacientes]")) {
        if (window.irParaSecao) window.irParaSecao("pacientes");
        return;
      }

      /* Clicar no vazio marca ali. Na grade a hora sai de onde o clique caiu;
         no mês não há hora nenhuma, então vale o padrão. */
      var celula = ev.target.closest(".cal-celula");
      if (celula) { novaConsulta(celula.dataset.dia); return; }

      var faixaDia = ev.target.closest(".cal-faixa-dia");
      if (faixaDia) { novaConsulta(faixaDia.dataset.dia); return; }

      var coluna = ev.target.closest(".cal-coluna");
      if (coluna) {
        var caixa = coluna.getBoundingClientRect();
        var min = HORA_INICIO * 60 +
                  Math.floor((ev.clientY - caixa.top) / ALTURA_HORA * 60);
        novaConsulta(coluna.dataset.dia, paraHora(Math.round(min / 30) * 30));
      }
    });

    alvo.addEventListener("change", function (ev) {
      if (ev.target.id === "cal-data") {
        foco = deIso(ev.target.value);
        desenhar();
        return;
      }
      if (ev.target.id === "bf-dia-todo" && editando) {
        editando.dado.dia_todo = ev.target.checked;
        editando.dado.inicio = document.getElementById("bf-inicio").value;
        editando.dado.fim = document.getElementById("bf-fim").value;
        editando.dado.motivo = document.getElementById("bf-motivo").value;
        desenhar();
      }
    });
  }

  /* ---------- o que o resto do app pode perguntar --------------------------- */

  window.Agenda = {
    /** A próxima consulta de alguém, daqui para a frente. */
    proxima: function (pid) {
      var deHoje = iso(hoje());
      return consultas.filter(function (c) {
        return c.paciente_id === pid && c.data >= deHoje;
      }).sort(function (a, b) {
        return a.data.localeCompare(b.data) || minutos(a.hora) - minutos(b.hora);
      })[0] || null;
    },
    doDia: function (dia) { return consultasDe(dia); },
    /** Todas as consultas de alguém, da mais recente para a mais antiga. */
    todas: function (pid) {
      return consultas.filter(function (c) { return c.paciente_id === pid; })
        .sort(function (a, b) {
          return b.data.localeCompare(a.data) || minutos(b.hora) - minutos(a.hora);
        });
    },
    recarregar: function () { return carregar().then(desenhar); }
  };

  document.addEventListener("DOMContentLoaded", function () {
    alvo = document.getElementById("agenda-corpo");
    if (!alvo) return;

    carregar().then(migrar).then(function () {
      desenhar();
      var anterior = window.aoTrocarPaciente;
      window.aoTrocarPaciente = function () {
        if (typeof anterior === "function") anterior();
        desenhar();
      };
    });
  });

  window.redesenharAgenda = function () {
    if (alvo) carregar().then(desenhar);
  };
})();
