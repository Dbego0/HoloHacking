/* ===========================================================================
   RENDERIZADOR DE FERRAMENTAS
   ===========================================================================

   Lê uma ferramenta do CATALOGO_FERRAMENTAS e monta a tela dela. Uma tela só
   serve as 27 — não existe HTML escrito à mão por ferramenta.

   O QUE MUDOU COM A ESPECIFICAÇÃO MESTRE DO MÓDULO CORPO

   1. Cabeçalho completo (§3.1): objetivo, quando usar, duração, papel.
   2. Nenhum campo nasce preenchido (§4.1, §8.8). A régua só vale como resposta
      depois que alguém a move. Antes ela nascia em 5 e gravava 5 de quem não
      tinha respondido nada.
   3. Três formas de campo, e não uma: campos soltos, grupos com título, e
      listas de itens repetíveis (eventos da rotina, dias de energia, sinais,
      registros do diário, hábitos, acordos).
   4. Síntese (§3.3): ao concluir, a ferramenta devolve uma leitura derivada
      das respostas — observação, nunca causa.
   5. Leitura profissional e próximo passo (§3.4, §3.5).
   6. Rascunho → concluída → revisada (§5), com histórico de verdade: cada
      aplicação é um registro, nada é sobrescrito (ver aplicacoes.js).

   ONDE AS RESPOSTAS FICAM
   Na tabela `aplicacoes`, via dados.js. Hoje isso é localStorage; amanhã é
   Supabase, e só dados.js muda.
   =========================================================================== */

(function () {
  "use strict";

  var ESCALA = ["Nunca", "Às vezes", "Frequente", "Sempre"];
  var MODULOS = { corpo: "Corpo", mente: "Mente", espirito: "Espírito" };

  var aberta = null;      // { f, alvo, app } — a aplicação em edição
  var ligado = false;

  function catalogo(id) {
    var lista = window.CATALOGO_FERRAMENTAS || [];
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  function bancos() { return window.CorpoBancos || null; }

  function escapar(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function dataBR(iso) {
    if (!iso) return "";
    var d = String(iso).slice(0, 10).split("-");
    return d.length === 3 ? d[2] + "/" + d[1] + "/" + d[0] : "";
  }

  /* As listas de opções que vivem em corpo-bancos.js. Um campo diz de qual
     coleção ele tira as opções; o catálogo não as repete. */
  function opcoesDe(nome) {
    var b = bancos();
    if (!b) return [];
    var mapa = {
      rotina_eventos:      (b.ROTINA_EVENTOS || []).map(function (x) { return x.nome; }),
      sinais_categorias:   (b.SINAIS_CATEGORIAS || []).map(function (x) { return x.nome; }),
      sinais_frequencia:   b.SINAIS_FREQUENCIA || [],
      sinais_prioridade:   (b.SINAIS_PRIORIDADE || []).map(function (x) { return x.nome; }),
      habitos_categorias:  (b.HABITOS_CATEGORIAS || []).map(function (x) { return x.nome; }),
      habitos_consistencia: b.HABITOS_CONSISTENCIA || [],
      /* Os quatro estados do Momentum como OPCOES, nao como resultado: eles
         sao a escolha de quem atende, desde que a classificacao automatica
         foi suspensa por falta de criterio validado. */
      momentum_estados:    (b.MOMENTUM && b.MOMENTUM.estados || []).map(function (x) { return x.nome; })
    };
    return mapa[nome] || [];
  }

  /* ---------- um campo ----------------------------------------------------- */

  /* `prefixo` distingue o mesmo campo em linhas diferentes de uma lista:
     `eventos-2-fome` é a fome do terceiro evento. */
  function campoHTML(campo, valor, prefixo) {
    var nome = "campo-" + (prefixo ? prefixo + "-" : "") + campo.id;
    var dica = campo.dica ? '<span class="dica">' + escapar(campo.dica) + "</span>" : "";
    var vazio = valor === "" || valor == null;
    var opcoes = campo.opcoes || (campo.opcoes_de ? opcoesDe(campo.opcoes_de) : null);
    var ctrl = "";
    var i;

    if (campo.tipo === "textarea") {
      ctrl = '<textarea id="' + nome + '" rows="' + (campo.grande ? 12 : 4) + '">' +
             escapar(vazio ? "" : valor) + "</textarea>";

    } else if (campo.tipo === "escala") {
      ctrl = '<div class="grupo-escala" data-campo="' + nome + '">';
      for (i = 0; i < ESCALA.length; i++) {
        ctrl += '<button type="button" class="btn-escala' +
                (!vazio && String(valor) === String(i) ? " marcado" : "") +
                '" data-valor="' + i + '"><b>' + i + "</b>" + ESCALA[i] + "</button>";
      }
      ctrl += "</div>";

    } else if (campo.tipo === "nota") {
      /* A régua não nasce respondida. Ela abre no meio porque precisa abrir em
         algum lugar, mas só conta como resposta depois que alguém a move — e
         até lá o número ao lado mostra um traço, não um cinco. */
      ctrl = '<div class="grupo-nota" data-campo="' + nome + '" data-respondido="' +
               (vazio ? "0" : "1") + '">' +
             '<input type="range" id="' + nome + '" min="0" max="10" step="1" value="' +
               escapar(vazio ? 5 : valor) + '">' +
             '<output data-para="' + nome + '">' + (vazio ? "—" : escapar(valor)) + "</output>" +
             (vazio ? "" : '<button type="button" class="nota-limpar" data-limpar="' + nome +
               '" title="Marcar como não respondido">limpar</button>') +
             "</div>";

    } else if (campo.tipo === "opcoes") {
      ctrl = '<div class="grupo-opcoes" data-campo="' + nome + '">';
      for (i = 0; i < (opcoes || []).length; i++) {
        ctrl += '<button type="button" class="btn-opcao' +
                (!vazio && valor === opcoes[i] ? " marcado" : "") +
                '" data-valor="' + escapar(opcoes[i]) + '">' + escapar(opcoes[i]) + "</button>";
      }
      ctrl += "</div>";

    } else if (campo.tipo === "data") {
      ctrl = '<input type="date" id="' + nome + '" value="' + escapar(vazio ? "" : valor) + '">';

    } else if (campo.tipo === "hora") {
      /* Horário como `time`, e não texto. Sem isso não dá para calcular
         duração de sono nem intervalo entre refeições — §11.4. */
      ctrl = '<input type="time" id="' + nome + '" step="300" value="' +
             escapar(vazio ? "" : valor) + '">';

    } else if (campo.tipo === "numero") {
      ctrl = '<input type="number" id="' + nome + '" value="' + escapar(vazio ? "" : valor) + '">';

    } else {
      ctrl = '<input type="text" id="' + nome + '" value="' + escapar(vazio ? "" : valor) + '">';
    }

    return '<div class="grupo tipo-' + campo.tipo + '">' +
           '<label for="' + nome + '">' + escapar(campo.rotulo) + "</label>" +
           dica + ctrl + "</div>";
  }

  /* ---------- os campos de uma ferramenta ---------------------------------- */

  /** As dimensões do Momentum viram campos; elas moram no banco, não aqui. */
  function camposDeOrigem(origem) {
    var b = bancos();
    if (!b || origem !== "momentum_dimensoes") return [];
    return b.MOMENTUM.dimensoes.map(function (d) {
      return { id: d.id, rotulo: d.rotulo, tipo: "nota", dica: d.pergunta };
    });
  }

  function gruposHTML(ferramenta, r) {
    if (!ferramenta.grupos) return "";
    return ferramenta.grupos.map(function (g) {
      var campos = g.origem ? camposDeOrigem(g.origem) : (g.campos || []);
      return '<section class="ferr-grupo">' +
        '<h4 class="ferr-grupo-titulo">' + escapar(g.titulo) + "</h4>" +
        '<div class="campos">' + campos.map(function (c) {
          return campoHTML(c, r[c.id]);
        }).join("") + "</div></section>";
    }).join("");
  }

  function listaHTML(ferramenta, r) {
    var L = ferramenta.lista;
    if (!L) return "";
    var itens = Array.isArray(r[L.id]) ? r[L.id] : [];
    if (!itens.length) itens = [{}];

    var linhas = itens.map(function (item, i) {
      return '<div class="ferr-item" data-indice="' + i + '">' +
        '<div class="ferr-item-topo">' +
          "<b>" + escapar(L.titulo_item || "Item") + " " + (i + 1) + "</b>" +
          '<button type="button" class="ferr-item-tirar" data-tirar-item="' + i +
            '" aria-label="Remover">&times;</button>' +
        "</div>" +
        '<div class="campos">' + L.campos.map(function (c) {
          return campoHTML(c, item[c.id], L.id + "-" + i);
        }).join("") + "</div></div>";
    }).join("");

    return '<section class="ferr-lista" data-lista="' + L.id + '">' +
      '<h4 class="ferr-grupo-titulo">' + escapar(L.rotulo) + "</h4>" +
      '<div class="ferr-itens">' + linhas + "</div>" +
      '<button type="button" class="perf-botao" data-mais-item="1">+ Acrescentar ' +
        escapar((L.titulo_item || "item").toLowerCase()) + "</button></section>";
  }

  /* ---------- cabeçalho da ferramenta -------------------------------------- */

  function cabecalho(f, app) {
    var b = bancos();
    var papel = b && f.papel ? (b.PAPEIS[f.papel] || null) : null;

    var meta = [
      papel ? '<span class="ferr-papel">' + escapar(papel.nome) + "</span>" : "",
      f.duracao ? '<span class="ferr-meta-item">≈ ' + f.duracao + " min</span>" : "",
      app && app.status
        ? '<span class="ferr-meta-item estado-' + app.status + '">' +
          escapar(window.Aplicacoes.rotulo(
            app.status === "rascunho" ? "em_preenchimento" : app.status)) + "</span>"
        : ""
    ].filter(Boolean).join("");

    return '<button class="btn-voltar" type="button">&larr; Voltar as ferramentas</button>' +
      '<div class="secao-cabeca">' +
        '<span class="eyebrow">' + MODULOS[f.modulo] + " - Ferramenta " + f.numero + "</span>" +
        "<h2>" + escapar(f.titulo) + " &mdash; <em>" + escapar(f.chamada) + "</em></h2>" +
        "<p>" + escapar(f.descricao) + "</p>" +
        (meta ? '<div class="ferr-meta">' + meta + "</div>" : "") +
      "</div>" +
      (f.objetivo || f.quando_usar
        ? '<div class="ferr-porque">' +
            (f.objetivo ? "<p><em>Para quê</em>" + escapar(f.objetivo) + "</p>" : "") +
            (f.quando_usar ? "<p><em>Quando usar</em>" + escapar(f.quando_usar) + "</p>" : "") +
          "</div>"
        : "");
  }

  /** Sem isto, quem preenche não sabe para quem está preenchendo. */
  function faixaPaciente(app) {
    var nome = null;
    try { nome = window.pacienteAtivoNome && window.pacienteAtivoNome(); } catch (e) {}
    if (!nome) {
      return '<p class="form-sub form-sem-paciente">Nenhum paciente selecionado — ' +
             "as respostas ficam soltas. Escolha um paciente em Pacientes para " +
             "guardar na ficha dele.</p>";
    }
    var consulta = app && app.consulta_id
      ? " Vinculado à consulta de hoje."
      : "";
    return '<p class="form-sub">Preenchendo para <b class="form-paciente">' +
           escapar(nome) + "</b>." + consulta + "</p>";
  }

  /* ---------- a síntese ---------------------------------------------------- */

  function sinteseHTML(f, resultado) {
    if (!resultado || !window.RenderResultado) return "";
    return window.RenderResultado.desenhar(f, resultado);
  }

  /* ---------- desenhar a ferramenta inteira -------------------------------- */

  function desenhar(f, alvo, app) {
    var r = (app && app.respostas) || {};
    var resultado = window.ResultadoCorpo
      ? window.ResultadoCorpo.derivar(f, r) : null;

    var corpo =
      gruposHTML(f, r) +
      listaHTML(f, r) +
      (f.campos && f.campos.length
        ? '<div class="campos">' + f.campos.map(function (c) {
            return campoHTML(c, r[c.id]);
          }).join("") + "</div>"
        : "");

    var concluida = app && app.status !== "rascunho";
    var deQuando = concluida && app.concluida_em
      ? '<p class="form-sub ferr-de-quando">Você está vendo a aplicação de <b>' +
        dataBR(app.concluida_em) + "</b>. Editar corrige esta; " +
        "<b>Nova aplicação</b> começa outra e guarda esta no histórico.</p>"
      : "";

    alvo.innerHTML =
      cabecalho(f, app) +
      '<div class="form-ferramenta">' +
        faixaPaciente(app) +
        deQuando +
        corpo +
        '<div class="acoes-form">' +
          '<button class="btn-verde" type="button" data-acao="concluir">' +
            (concluida ? "Salvar alterações" : "Concluir aplicação") + "</button>" +
          (concluida
            ? '<button class="perf-botao" type="button" data-acao="nova">Nova aplicação</button>'
            : '<button class="perf-botao" type="button" data-acao="rascunho">Salvar rascunho</button>') +
          '<span class="aviso-salvo" data-papel="aviso"></span>' +
        "</div>" +
      "</div>" +
      '<div class="ferr-sintese" data-papel="sintese">' + sinteseHTML(f, resultado) + "</div>" +
      leituraHTML(f, app) +
      historicoHTML(f, app);

    ligar(f, alvo);
  }

  /* ---------- leitura profissional e próximo passo (§3.4, §3.5) ------------ */

  function leituraHTML(f, app) {
    if (!app) return "";
    var b = bancos();
    var prioridades = b ? (b.SINAIS_PRIORIDADE || []).map(function (p) { return p.nome; }) : [];

    return '<section class="ferr-leitura">' +
      '<h4 class="ferr-grupo-titulo">Leitura profissional</h4>' +
      '<p class="perf-ajuda">O que o sistema mostra acima é observação. ' +
      "A interpretação é sua, e é ela que fecha a aplicação.</p>" +
      '<div class="grupo"><label for="leit-texto">O que chamou atenção</label>' +
        '<textarea id="leit-texto" rows="3">' + escapar(app.leitura || "") + "</textarea></div>" +
      '<div class="perf-grade">' +
        '<div class="grupo"><label for="leit-prioridade">Prioridade</label>' +
          '<div class="grupo-opcoes" data-campo="leit-prioridade">' +
            prioridades.map(function (p) {
              return '<button type="button" class="btn-opcao' +
                (app.prioridade === p ? " marcado" : "") +
                '" data-valor="' + escapar(p) + '">' + escapar(p) + "</button>";
            }).join("") + "</div></div>" +
        '<div class="grupo"><label for="leit-passo">Próximo passo</label>' +
          '<input type="text" id="leit-passo" value="' + escapar(app.proximo_passo || "") +
          '" placeholder="ação, investigação, monitoramento ou encaminhamento"></div>' +
      "</div>" +
      '<div class="acoes-form">' +
        '<button class="perf-botao" type="button" data-acao="revisar">Registrar leitura</button>' +
        '<span class="aviso-salvo" data-papel="aviso-leitura"></span>' +
      "</div></section>";
  }

  /* ---------- histórico (§3.6) --------------------------------------------- */

  function historicoHTML(f, app) {
    if (!window.Aplicacoes) return "";
    var lista = window.Aplicacoes.historico(f.id).filter(function (a) {
      return !app || a.id !== app.id;
    });
    if (!lista.length) return "";

    return '<section class="ferr-historico">' +
      '<h4 class="ferr-grupo-titulo">Aplicações anteriores <span class="ferr-conta">' +
        lista.length + "</span></h4>" +
      '<div class="ferr-historico-lista">' + lista.map(function (a) {
        return '<button type="button" class="ferr-hist-item" data-ver-app="' + escapar(a.id) + '">' +
          "<b>" + dataBR(a.concluida_em || a.iniciada_em) + "</b>" +
          '<span class="ferr-hist-estado">' +
            escapar(window.Aplicacoes.rotulo(a.status === "rascunho" ? "em_preenchimento" : a.status)) +
          "</span>" +
          (a.leitura ? '<span class="ferr-hist-leitura">' + escapar(a.leitura) + "</span>" : "") +
          "</button>";
      }).join("") + "</div></section>";
  }

  /* ---------- colher as respostas ------------------------------------------ */

  function valorDe(alvo, campo, prefixo) {
    var nome = "campo-" + (prefixo ? prefixo + "-" : "") + campo.id;

    if (campo.tipo === "escala" || campo.tipo === "opcoes") {
      var m = alvo.querySelector('[data-campo="' + nome + '"] .marcado');
      return m ? m.dataset.valor : null;
    }
    if (campo.tipo === "nota") {
      var caixa = alvo.querySelector('[data-campo="' + nome + '"]');
      if (!caixa || caixa.dataset.respondido !== "1") return null;   // não respondido
      var reg = caixa.querySelector("input");
      return reg ? reg.value : null;
    }
    var el = alvo.querySelector("#" + CSS.escape(nome));
    if (!el) return null;
    var v = el.value;
    return v === "" ? null : v;
  }

  function colher(f, alvo) {
    var dados = {};

    if (f.grupos) {
      f.grupos.forEach(function (g) {
        var campos = g.origem ? camposDeOrigem(g.origem) : (g.campos || []);
        campos.forEach(function (c) { dados[c.id] = valorDe(alvo, c); });
      });
    }

    if (f.lista) {
      var L = f.lista;
      var itens = [];
      alvo.querySelectorAll('[data-lista="' + L.id + '"] .ferr-item').forEach(function (linha) {
        var i = linha.dataset.indice;
        var item = {};
        var vazio = true;
        L.campos.forEach(function (c) {
          var v = valorDe(alvo, c, L.id + "-" + i);
          item[c.id] = v;
          if (v !== null && v !== "") vazio = false;
        });
        if (!vazio) itens.push(item);        // linha em branco não vira registro
      });
      dados[L.id] = itens;
    }

    (f.campos || []).forEach(function (c) { dados[c.id] = valorDe(alvo, c); });
    return dados;
  }

  /* ---------- comportamento ------------------------------------------------ */

  function avisar(alvo, papel, texto) {
    var el = alvo.querySelector('[data-papel="' + papel + '"]');
    if (!el) return;
    el.textContent = texto;
    setTimeout(function () { el.textContent = ""; }, 2600);
  }

  function redesenharSintese(f, alvo) {
    var caixa = alvo.querySelector('[data-papel="sintese"]');
    if (!caixa || !window.ResultadoCorpo) return;
    var r = window.ResultadoCorpo.derivar(f, colher(f, alvo));
    caixa.innerHTML = sinteseHTML(f, r);
  }

  var containersLigados = [];

  function ligarContainer(alvo) {
    if (containersLigados.indexOf(alvo) >= 0) return;
    containersLigados.push(alvo);

    alvo.addEventListener("click", function (ev) {
      // a ferramenta aberta AGORA, nao a que estava aberta quando isto foi ligado
      if (!aberta || aberta.alvo !== alvo) return;
      var f = aberta.f;
      var app = aberta.app;

      var limpar = ev.target.closest("[data-limpar]");
      if (limpar) {
        var caixa = limpar.closest(".grupo-nota");
        caixa.dataset.respondido = "0";
        caixa.querySelector("output").textContent = "—";
        limpar.remove();
        redesenharSintese(f, alvo);
        return;
      }

      var mais = ev.target.closest("[data-mais-item]");
      if (mais && f.lista) {
        var dados = colher(f, alvo);
        dados[f.lista.id] = (dados[f.lista.id] || []).concat([{}]);
        if (app) app.respostas = dados;
        desenhar(f, alvo, app);
        return;
      }

      var tirar = ev.target.closest("[data-tirar-item]");
      if (tirar && f.lista) {
        var visiveis = alvo.querySelectorAll(".ferr-item").length;
        if (visiveis <= 1) { avisar(alvo, "aviso", "O primeiro item não sai."); return; }
        var i = Number(tirar.dataset.tirarItem);
        var d2 = colher(f, alvo);
        var lista = d2[f.lista.id] || [];
        lista.splice(i, 1);
        d2[f.lista.id] = lista;
        if (app) app.respostas = d2;
        desenhar(f, alvo, app);
        return;
      }

      var ver = ev.target.closest("[data-ver-app]");
      if (ver) {
        var antiga = window.Aplicacoes.historico(f.id).filter(function (a) {
          return a.id === ver.dataset.verApp;
        })[0];
        if (antiga) { aberta = { f: f, alvo: alvo, app: antiga }; desenhar(f, alvo, antiga); }
      }
    });
  }

  function ligar(f, alvo) {
    // escala e opcoes: um botao marcado por grupo
    alvo.querySelectorAll(".grupo-escala, .grupo-opcoes").forEach(function (grupo) {
      grupo.addEventListener("click", function (ev) {
        var b = ev.target.closest("button");
        if (!b) return;
        var jaMarcado = b.classList.contains("marcado");
        grupo.querySelectorAll("button").forEach(function (x) { x.classList.remove("marcado"); });
        // clicar de novo no mesmo desmarca: dá para voltar a "não respondido"
        if (!jaMarcado) b.classList.add("marcado");
        redesenharSintese(f, alvo);
      });
    });

    // a regua: mover e o que a torna uma resposta
    alvo.querySelectorAll('.grupo-nota input[type="range"]').forEach(function (reg) {
      reg.addEventListener("input", function () {
        var caixa = reg.closest(".grupo-nota");
        caixa.dataset.respondido = "1";
        var saida = caixa.querySelector("output");
        if (saida) saida.textContent = reg.value;
        if (!caixa.querySelector(".nota-limpar")) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "nota-limpar";
          b.dataset.limpar = reg.id;
          b.title = "Marcar como não respondido";
          b.textContent = "limpar";
          caixa.appendChild(b);
        }
      });
      reg.addEventListener("change", function () { redesenharSintese(f, alvo); });
    });

    ligarContainer(alvo);

    alvo.querySelector(".btn-voltar").addEventListener("click", function () {
      document.querySelectorAll(".vista-ferramenta").forEach(function (v) {
        v.classList.add("hidden");
      });
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

    var guardar = function (concluir) {
      var app = aberta && aberta.app;
      if (!app || !window.Aplicacoes) return;
      var dados = colher(f, alvo);
      var resultado = window.ResultadoCorpo
        ? window.ResultadoCorpo.derivar(f, dados) : null;
      var p = concluir
        ? window.Aplicacoes.concluir(app, dados, resultado)
        : window.Aplicacoes.salvarRespostas(app, dados, resultado);
      Promise.resolve(p).then(function () {
        marcarCard(f.id);
        if (concluir) desenhar(f, alvo, app);
        else redesenharSintese(f, alvo);
        // depois do redesenho: escrever antes apagaria junto com o elemento
        avisar(alvo, "aviso", concluir ? "Aplicação concluída." : "Rascunho salvo.");
      });
    };

    alvo.querySelector('[data-acao="concluir"]').addEventListener("click", function () {
      guardar(true);
    });
    var botaoRascunho = alvo.querySelector('[data-acao="rascunho"]');
    if (botaoRascunho) botaoRascunho.addEventListener("click", function () { guardar(false); });

    var botaoNova = alvo.querySelector('[data-acao="nova"]');
    if (botaoNova) {
      botaoNova.addEventListener("click", function () {
        Promise.resolve(window.Aplicacoes.nova(f)).then(function (nova) {
          aberta = { f: f, alvo: alvo, app: nova };
          desenhar(f, alvo, nova);
          marcarCard(f.id);
          avisar(alvo, "aviso", "Aplicação nova. A anterior ficou no histórico.");
        });
      });
    }

    var botaoRevisar = alvo.querySelector('[data-acao="revisar"]');
    if (botaoRevisar) {
      botaoRevisar.addEventListener("click", function () {
        var app = aberta && aberta.app;
        if (!app || !window.Aplicacoes) return;
        var marcada = alvo.querySelector('[data-campo="leit-prioridade"] .marcado');
        Promise.resolve(window.Aplicacoes.revisar(
          app,
          alvo.querySelector("#leit-texto").value.trim(),
          marcada ? marcada.dataset.valor : null,
          alvo.querySelector("#leit-passo").value.trim()
        )).then(function () {
          avisar(alvo, "aviso-leitura", "Leitura registrada.");
          marcarCard(f.id);
        });
      });
    }
  }

  /* ---------- o selo do card ----------------------------------------------- */

  var CLASSE = {
    disponivel: "disponivel", em_preenchimento: "rascunho",
    concluida: "preenchida", revisada: "revisada"
  };

  function marcarCard(id) {
    var card = document.querySelector('[data-ferramenta="' + id + '"]');
    if (!card || !window.Aplicacoes) return;
    var selo = card.querySelector(".ferr-status");
    if (!selo) return;

    var f = catalogo(id);
    var estado = window.Aplicacoes.statusDe(id);
    var precisa = f && window.Aplicacoes.reaplicar(f);

    selo.textContent = precisa ? "Reaplicar" : window.Aplicacoes.rotulo(estado);
    selo.className = "ferr-status " + (precisa ? "reaplicar" : CLASSE[estado] || "disponivel");
  }

  function marcarTodos() {
    document.querySelectorAll("[data-ferramenta]").forEach(function (c) {
      marcarCard(c.dataset.ferramenta);
    });
  }

  /* ---------- abrir --------------------------------------------------------- */

  function abrirFerramenta(f) {
    var alvo = document.getElementById("vista-gen-" + f.modulo);
    if (!alvo || !window.Aplicacoes) return;
    Promise.resolve(window.Aplicacoes.abrir(f)).then(function (app) {
      aberta = { f: f, alvo: alvo, app: app };
      desenhar(f, alvo, app);
      window.abrirFerramenta("vista-gen-" + f.modulo);
    });
  }

  /* app.js chama isto toda vez que o paciente ativo muda. Sem isso a tela
     continuaria mostrando a aplicação do paciente anterior. */
  var anterior = window.aoTrocarPaciente;
  window.aoTrocarPaciente = function () {
    if (typeof anterior === "function") anterior();
    marcarTodos();
    if (aberta && !aberta.alvo.classList.contains("hidden")) abrirFerramenta(aberta.f);
  };

  /* Abre uma ferramenta de qualquer lugar do app — é o que permite o mapa
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

  window.remarcarCardsDeFerramenta = marcarTodos;

  document.addEventListener("DOMContentLoaded", function () {
    if (ligado) return;
    ligado = true;
    document.querySelectorAll("[data-ferramenta]").forEach(function (card) {
      card.addEventListener("click", function () {
        var f = catalogo(card.dataset.ferramenta);
        if (f) abrirFerramenta(f);
      });
    });
    marcarTodos();
  });
})();
