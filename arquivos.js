/* ===========================================================================
   ARQUIVOS — exames, documentos e relatorio
   ===========================================================================

   EXAMES
   Opcionais por construcao: na primeira consulta o paciente normalmente ainda
   nao tem nenhum. E — a regra que governa tudo — exame NUNCA mexe no Indice
   HOLOS. Se mexesse, um paciente que chega sem exame e volta com exame teria
   dois numeros que nao sao a mesma medida, e a comparacao de 4, 8 e 12 semanas
   morreria. O exame confronta o relato com o sangue; a divergencia entre os
   dois e o achado que uma anamnese sozinha nao pega.

   DOCUMENTOS
   Recebem o arquivo de verdade — PDF do exame, foto do laudo — guardado no
   IndexedDB do navegador (~10 GB, contra ~5 MB do localStorage, que um unico
   exame estouraria). Ver arquivo-store.js. Vive so nesta maquina: trocar de
   computador nao leva junto. Para dado de saude isso e mais seguro do que o
   Supabase esta hoje, que grava com chave publica e sem login.

   RELATORIO
   Montado dos bancos, sem IA: as mensagens de mensagens.csv em dois registros,
   nutri e paciente. Quando a chave da API entrar, o Holos AI escreve por cima
   disto — nao no lugar.
   =========================================================================== */

(function () {
  "use strict";

  var CHAVE_EX = "holohacking.exames";
  var CHAVE_PONT = "holohacking.pontuacao";
  var SEM_PACIENTE = "_sem_paciente";

  var NOME_SISTEMA = {
    fungico: "Sistema Fúngico",
    acido_inflamatorio: "Sistema Ácido-Inflamatório",
    metabolico: "Sistema Metabólico",
    detox_linfatico: "Sistema Detox + Linfático",
    mental_emocional_espiritual: "Sistema Mental–Emocional–Espiritual"
  };

  function motor() { return window.HOLOSCOPE || null; }
  function paciente() {
    try { return (window.pacienteAtivoId && window.pacienteAtivoId()) || SEM_PACIENTE; }
    catch (e) { return SEM_PACIENTE; }
  }
  function nomePaciente() {
    try { return (window.pacienteAtivoNome && window.pacienteAtivoNome()) || null; }
    catch (e) { return null; }
  }
  function ler(chave) {
    try { return (JSON.parse(localStorage.getItem(chave)) || {})[paciente()] || {}; }
    catch (e) { return {}; }
  }
  function gravar(chave, dados) {
    var t;
    try { t = JSON.parse(localStorage.getItem(chave)) || {}; } catch (e) { t = {}; }
    t[paciente()] = dados;
    localStorage.setItem(chave, JSON.stringify(t));
    if (window.Concorrencia) window.Concorrencia.avancarRevisao("caixa:" + chave);
  }
  function escapar(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function hoje() {
    var d = new Date();
    return String(d.getDate()).padStart(2, "0") + "/" +
           String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }

  /* ================================================================ EXAMES */

  function notasDoPaciente() {
    var p = window.ultimaPontuacao ? window.ultimaPontuacao() : null;
    if (!p || !p.sistemas) return {};
    var n = {};
    p.sistemas.forEach(function (s) { n[s.sistema] = s.nota; });
    return n;
  }

  function pontuacaoGuardada() {
    return window.ultimaPontuacao ? window.ultimaPontuacao() : null;
  }

  function desenharExames() {
    var alvo = document.getElementById("ex-corpo");
    if (!alvo) return;
    var g = motor();
    if (!g || !g.listaDeExames) {
      alvo.innerHTML = '<p class="q-erro">O motor não carregou — sem ele não há banco de exames.</p>';
      return;
    }

    var lista = g.listaDeExames();
    var valores = ler(CHAVE_EX);
    var porSistema = {};
    lista.forEach(function (e) {
      (porSistema[e.sistema] = porSistema[e.sistema] || []).push(e);
    });

    var html =
      '<div class="ex-acoes">' +
      '<button type="button" class="btn-verde" data-acao="conferir">Conferir com o mapa</button>' +
      '<button type="button" class="btn-fantasma" data-acao="limpar-ex">Limpar</button>' +
      '<span class="ex-conta"></span></div>' +
      '<div id="ex-confronto"></div>';

    Object.keys(porSistema).forEach(function (sis) {
      html += '<div class="ex-bloco"><h4>' + NOME_SISTEMA[sis] + "</h4>";
      porSistema[sis].forEach(function (e) {
        var v = valores[e.id];
        html += '<div class="ex-linha" data-exame="' + e.id + '">' +
          '<span class="ex-nome">' + escapar(e.exame) + "</span>" +
          '<span class="ex-faixa">ideal ' + e.faixa + " " + escapar(e.unidade) + "</span>" +
          '<input type="number" step="any" inputmode="decimal" value="' +
            (v === undefined ? "" : escapar(v)) + '" placeholder="—">' +
          '<span class="ex-situacao"></span></div>';
      });
      html += "</div>";
    });

    html += '<p class="arq-nota">As faixas são as da literatura funcional, mais estreitas ' +
      'que as do laboratório de propósito: laboratório marca doença, aqui se olha terreno. ' +
      '<b>São rascunho e esperam a revisão do Rodrigo.</b></p>';

    alvo.innerHTML = html;
    ligarPainel();
    conferir();
  }

  function colherExames() {
    var v = {};
    document.querySelectorAll("#ex-corpo .ex-linha").forEach(function (l) {
      var txt = l.querySelector("input").value.trim();
      if (txt !== "") v[l.dataset.exame] = Number(txt.replace(",", "."));
    });
    return v;
  }

  function conferir() {
    var g = motor();
    if (!g) return;
    var valores = colherExames();
    gravar(CHAVE_EX, valores);

    var conta = document.querySelector("#ex-corpo .ex-conta");
    var n = Object.keys(valores).length;
    if (conta) conta.textContent = n === 0 ? "nenhum valor preenchido"
                                           : n + " exame(s) preenchido(s)";

    var r = g.lerExames(valores, notasDoPaciente());

    // marca cada linha
    document.querySelectorAll("#ex-corpo .ex-linha").forEach(function (l) {
      var a = r.exames.filter(function (x) { return x.id === l.dataset.exame; })[0];
      var s = l.querySelector(".ex-situacao");
      l.classList.remove("alterado");
      if (!a) { s.textContent = ""; return; }
      if (a.situacao === "ok") { s.textContent = "na faixa"; s.className = "ex-situacao ok"; return; }
      s.textContent = a.situacao === "baixo" ? "abaixo" : "acima";
      s.className = "ex-situacao fora";
      l.classList.add("alterado");
      if (a.leitura) l.title = a.leitura;
    });

    desenharConfronto(r, n);
  }

  function desenharConfronto(r, quantos) {
    var alvo = document.getElementById("ex-confronto");
    if (!alvo) return;
    if (quantos === 0) { alvo.innerHTML = ""; return; }

    var temMapa = Object.keys(notasDoPaciente()).length > 0;
    if (!temMapa) {
      alvo.innerHTML = '<p class="arq-nota">Aplique o questionário do HOLOSCOPE ' +
        'para este paciente e o exame passa a ser confrontado com o mapa.</p>';
      return;
    }

    var html = '<h4 class="leitura-titulo">Relato contra laboratório</h4>' +
               '<div class="conf-lista">';
    r.confronto.forEach(function (c) {
      if (c.concordancia === "sem_exame") return;
      html += '<div class="conf-item ' + c.concordancia + '">' +
        '<span class="conf-selo">' + (c.concordancia === "confirma" ? "confirma" : "diverge") + "</span>" +
        "<b>" + NOME_SISTEMA[c.sistema] + "</b>" +
        '<span class="conf-nota">nota ' + (c.nota === null ? "—" : c.nota.toFixed(1)) + "</span>" +
        '<span class="conf-leitura">' + escapar(c.leitura) + "</span></div>";
    });
    html += "</div>";
    var divergem = r.confronto.filter(function (c) { return c.concordancia === "diverge"; }).length;
    if (divergem > 0) {
      html += '<p class="arq-nota conf-alerta">' + divergem + ' sistema(s) em divergência. ' +
        'É o achado mais valioso do exame: onde o relato e o corpo contam histórias diferentes.</p>';
    }
    alvo.innerHTML = html;
  }

  var painelLigado = false;

  /** O que é delegado no container: prende uma vez, para a vida da página. */
  function ligarPainel() {
    if (painelLigado) return;
    painelLigado = true;
    var painel = document.getElementById("aba-documentos");
    if (!painel) return;

    painel.addEventListener("input", function (ev) {
      if (ev.target.matches(".ex-linha input")) conferir();
    });

    painel.addEventListener("click", function (ev) {
      var a = ev.target.closest("[data-acao]");
      if (a) {
        if (a.dataset.acao === "conferir") conferir();
        if (a.dataset.acao === "limpar-ex") { gravar(CHAVE_EX, {}); desenharExames(); }
        return;
      }
      var abrir = ev.target.closest("[data-abrir]");
      if (abrir) {
        window.ArquivoStore.pegar(abrir.dataset.abrir).then(function (r) {
          if (!r) return;
          // o navegador abre; o endereco temporario e liberado depois
          var url = URL.createObjectURL(r.arquivo);
          window.open(url, "_blank");
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        });
        return;
      }
      var tirar = ev.target.closest("[data-tirar]");
      if (tirar) {
        window.ArquivoStore.remover(tirar.dataset.tirar).then(listarDocumentos);
      }
    });
  }

  /* =========================================================== DOCUMENTOS */

  function desenharDocumentos() {
    var alvo = document.getElementById("aba-documentos");
    if (!window.ArquivoStore) {
      alvo.innerHTML = '<p class="q-erro">O guardador de arquivos nao carregou.</p>';
      return;
    }

    alvo.innerHTML =
      '<p class="arq-intro">O papel que o paciente traz e os números que saem dele. ' +
      "São a mesma coisa em dois passos: primeiro o arquivo fica guardado, depois " +
      "você lê o que ele diz e lança aqui embaixo. " +
      "<b>O arquivo fica guardado neste navegador</b> e não vai para lugar nenhum.</p>" +

      '<section class="arq-cartao">' +
        '<h4 class="arq-titulo">O que o paciente trouxe</h4>' +
        '<p class="arq-sub">PDF do exame, foto do laudo, receita de outro ' +
        "profissional, termo de consentimento.</p>" +
        '<div class="doc-solta" id="doc-solta">' +
          '<input type="file" id="doc-arquivo" multiple ' +
          'accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.txt,.csv">' +
          '<div class="doc-solta-texto"><b>Arraste o arquivo aqui</b>' +
          "<span>ou clique para escolher &middot; PDF, foto ou texto</span></div>" +
        "</div>" +
        '<div class="doc-meta">' +
          '<input type="text" id="doc-nome" placeholder="Nome (opcional — usa o do arquivo)">' +
          '<select id="doc-tipo">' +
          ["Exame laboratorial", "Laudo", "Receita", "Termo de consentimento", "Foto", "Outro"]
            .map(function (x) { return "<option>" + x + "</option>"; }).join("") +
          '</select><input type="date" id="doc-data"></div>' +
        '<div id="doc-aviso"></div><div id="doc-lista"></div>' +
        '<p class="arq-nota" id="doc-espaco"></p>' +
      "</section>" +

      '<section class="arq-cartao">' +
        '<h4 class="arq-titulo">Os valores do exame</h4>' +
        '<p class="arq-sub">Opcional. Na primeira consulta o paciente costuma não ter ' +
        "exame nenhum, e o mapa não depende disto. O exame <b>não altera o Índice</b> " +
        "&mdash; ele confronta o que o paciente relatou com o que o sangue mostra.</p>" +
        '<div id="ex-atalhos"></div>' +
        '<div id="ex-corpo"></div>' +
      "</section>";

    ligarDocumentos();
    listarDocumentos();
    desenharExames();
  }

  /* Os exames guardados viram botão: abrir o PDF ao lado enquanto se digita é
     o gesto todo desta tela. Só aparece quando existe documento de exame —
     um botão que não abre nada seria pior do que nenhum. */
  function desenharAtalhosDeExame(itens) {
    var alvo = document.getElementById("ex-atalhos");
    if (!alvo) return;
    var deExame = itens.filter(function (d) {
      return /exame|laudo/i.test(d.tipo || "");
    });
    if (!deExame.length) { alvo.innerHTML = ""; return; }
    alvo.innerHTML = '<div class="ex-atalhos">' +
      '<span class="ex-atalhos-rot">Abrir ao lado</span>' +
      deExame.map(function (d) {
        return '<button type="button" class="ex-atalho" data-abrir="' + escapar(d.id) + '">' +
          escapar(d.nome) + "</button>";
      }).join("") + "</div>";
  }

  function listarDocumentos() {
    var alvo = document.getElementById("doc-lista");
    if (!alvo) return;
    window.ArquivoStore.listar(paciente()).then(function (itens) {
      if (itens.length === 0) {
        alvo.innerHTML = '<p class="arq-vazio">Nenhum arquivo para este paciente.</p>';
        desenharAtalhosDeExame(itens);
      } else {
        desenharAtalhosDeExame(itens);
        alvo.innerHTML = '<div class="doc-lista-itens">' + itens.map(function (d) {
          return '<div class="doc-item">' +
            '<span class="doc-tipo">' + escapar(d.tipo) + "</span>" +
            '<b>' + escapar(d.nome) + "</b>" +
            '<span class="doc-tam">' + window.ArquivoStore.tamanhoLegivel(d.tamanho) + "</span>" +
            '<span class="doc-data">' +
              (d.data ? escapar(d.data.split("-").reverse().join("/")) : "sem data") + "</span>" +
            '<button type="button" class="doc-abrir" data-abrir="' + d.id + '">abrir</button>' +
            '<button type="button" class="doc-tirar" data-tirar="' + d.id + '" ' +
            'aria-label="Remover">&times;</button></div>';
        }).join("") + "</div>";
      }
      mostrarEspaco();
    });
  }

  function mostrarEspaco() {
    var el = document.getElementById("doc-espaco");
    if (!el) return;
    window.ArquivoStore.espaco().then(function (e) {
      if (!e) { el.textContent = ""; return; }
      el.innerHTML = "Os arquivos ficam <b>neste navegador</b>, não no servidor: " +
        "trocar de computador não os leva junto. Exame e laudo são dado de saúde, " +
        "e por enquanto ficar só aqui e mais seguro do que subir sem login. " +
        "Espaço usado: " + window.ArquivoStore.tamanhoLegivel(e.usado) + " de " +
        window.ArquivoStore.tamanhoLegivel(e.total) + ".";
    });
  }

  function receberArquivos(lista) {
    if (!lista || lista.length === 0) return;
    var aviso = document.getElementById("doc-aviso");
    var nome = document.getElementById("doc-nome").value.trim();
    var meta = {
      tipo: document.getElementById("doc-tipo").value,
      data: document.getElementById("doc-data").value
    };
    var pendentes = Array.prototype.slice.call(lista);
    var erros = [];

    Promise.all(pendentes.map(function (a, i) {
      return window.ArquivoStore.salvar(paciente(), a, {
        nome: pendentes.length === 1 && nome ? nome : a.name,
        tipo: meta.tipo, data: meta.data
      }).catch(function (e) { erros.push(a.name + ": " + e.message); });
    })).then(function () {
      document.getElementById("doc-nome").value = "";
      aviso.innerHTML = erros.length
        ? '<p class="q-erro">' + erros.map(escapar).join("<br>") + "</p>"
        : '<p class="doc-ok">' + pendentes.length + " arquivo(s) guardado(s).</p>";
      if (!erros.length) setTimeout(function () { aviso.innerHTML = ""; }, 3500);
      listarDocumentos();
    });
  }

  /** O que é do elemento recriado: a zona de arrastar nasce de novo a cada
      desenho, então é religada a cada desenho. */
  function ligarDocumentos() {
    ligarPainel();
    var solta = document.getElementById("doc-solta");
    var campo = document.getElementById("doc-arquivo");
    if (!solta || !campo) return;

    campo.addEventListener("change", function () { receberArquivos(campo.files); campo.value = ""; });
    solta.addEventListener("click", function (ev) {
      if (ev.target !== campo) campo.click();
    });
    ["dragenter", "dragover"].forEach(function (e) {
      solta.addEventListener(e, function (ev) {
        ev.preventDefault(); solta.classList.add("sobre");
      });
    });
    ["dragleave", "drop"].forEach(function (e) {
      solta.addEventListener(e, function (ev) {
        ev.preventDefault(); solta.classList.remove("sobre");
      });
    });
    solta.addEventListener("drop", function (ev) {
      receberArquivos(ev.dataTransfer.files);
    });
  }

  /* ============================================================ RELATORIO */

  var registroAtual = "nutri";

  function desenharRelatorio() {
    var alvo = document.getElementById("aba-relatorio");
    var p = pontuacaoGuardada();
    var g = motor();

    if (!p || !g) {
      alvo.innerHTML = '<p class="arq-vazio">Aplique o questionário do HOLOSCOPE para ' +
        'este paciente. O relatório é montado a partir do mapa.</p>';
      return;
    }

    var nome = nomePaciente();
    var eu = window.PerfilProfissional
      ? window.PerfilProfissional.dados()
      : { nome: "", cor_primaria: "", cor_secundaria: "" };

    /* Quem imprime aparece no topo. Sem nome preenchido continua valendo a
       marca do app: melhor a marca do que um cabecalho vazio. */
    function juntar(pedacos) {
      return pedacos.filter(Boolean).map(escapar).join(" &middot; ");
    }
    var assina = juntar([eu.especialidade, eu.cidade]);

    var html =
      '<div class="rel-acoes">' +
      '<div class="rel-registro">' +
      '<button type="button" class="rel-btn' + (registroAtual === "nutri" ? " ativo" : "") +
        '" data-registro="nutri">Para a nutricionista</button>' +
      '<button type="button" class="rel-btn' + (registroAtual === "paciente" ? " ativo" : "") +
        '" data-registro="paciente">Para o paciente</button>' +
      "</div>" +
      '<button type="button" class="btn-verde" data-acao="imprimir">Imprimir ou salvar em PDF</button>' +
      "</div>" +
      '<article class="relatorio" id="relatorio"' +
        (eu.cor_primaria ? ' style="--rel-p:' + escapar(eu.cor_primaria) +
          ";--rel-s:" + escapar(eu.cor_secundaria) + '"' : "") + ">" +
      '<header class="rel-topo">' +
      '<div class="rel-emissor">' +
        '<span class="rel-logo" id="rel-logo"></span>' +
        '<span class="rel-quem">' +
          "<b>" + escapar(eu.nome || "HoloHacking") + "</b>" +
          (assina ? "<i>" + assina + "</i>" : "") +
        "</span>" +
      "</div>" +
      "<h3>Mapa HOLOS" + (nome ? " &middot; " + escapar(nome) : "") + "</h3>" +
      '<p class="rel-meta">' + hoje() + " &middot; Índice HOLOS <b>" + p.indice +
        "</b> de " + p.indice_maximo + " &middot; cobertura " + p.cobertura.percentual + "%</p>" +
      '<p class="rel-fronteira">Avaliação nutricional integral construída a partir ' +
        "do que o paciente relata. Não é exame, não é diagnóstico médico e não " +
        "substitui avaliação clínica.</p>" +
      "</header>";

    if (p.triada) {
      html += '<section class="rel-bloco"><h4>Triada</h4><p class="rel-triada">' +
        "Físico <b>" + p.triada.fisico.toFixed(1) + "</b> &middot; " +
        "Mental <b>" + p.triada.mental.toFixed(1) + "</b> &middot; " +
        "Espiritual <b>" + p.triada.espiritual.toFixed(1) + "</b></p></section>";
    }

    if (p.combinacoes && p.combinacoes.length > 0) {
      html += '<section class="rel-bloco"><h4>Leitura combinada</h4>';
      p.combinacoes.forEach(function (c) {
        html += '<p class="rel-combinada">&ldquo;' + escapar(c.leitura) + "&rdquo;</p>";
      });
      html += "</section>";
    }

    html += '<section class="rel-bloco"><h4>Os cinco sistemas</h4>';
    var ordenados = p.sistemas.slice().sort(function (a, b) { return a.nota - b.nota; });
    ordenados.forEach(function (s) {
      var m = g.mensagem(s.sistema, s.nota, registroAtual);
      html += '<div class="rel-sistema"><div class="rel-sistema-topo">' +
        "<b>" + escapar(s.nome) + "</b>" +
        '<span class="rel-nota">' + s.nota.toFixed(1) + "</span>" +
        '<span class="rel-faixa">' + escapar(s.faixa) + "</span></div>";
      if (m) {
        html += "<p>" + escapar(m.texto) + "</p>";
        if (m.primeiros_passos) {
          html += '<p class="rel-passos"><em>Primeiros passos:</em> ' +
            escapar(m.primeiros_passos) + "</p>";
        }
      }
      html += "</div>";
    });
    html += "</section>";

    var ex = ler(CHAVE_EX);
    if (Object.keys(ex).length > 0) {
      var r = g.lerExames(ex, notasDoPaciente());
      html += '<section class="rel-bloco"><h4>Exames</h4>';
      r.confronto.forEach(function (c) {
        if (c.concordancia === "sem_exame") return;
        html += "<p><b>" + NOME_SISTEMA[c.sistema] + "</b> — " + escapar(c.leitura) + "</p>";
      });
      html += "</section>";
    }

    /* A assinatura e o carimbo vem antes da identificacao, como no papel:
       a imagem, e embaixo dela quem assinou e sob qual registro. */
    var temImagem = eu.assinatura_id || eu.carimbo_id;
    var identidade = juntar([eu.nome, eu.registro]);
    var contato = juntar([eu.telefone, eu.instagram]);

    html += '<footer class="rel-rodape">';
    if (temImagem) {
      html += '<div class="rel-assinaturas">' +
        (eu.assinatura_id ? '<span class="rel-imagem" id="rel-assinatura"></span>' : "") +
        (eu.carimbo_id ? '<span class="rel-imagem" id="rel-carimbo"></span>' : "") +
        "</div>";
    }
    if (identidade) html += '<p class="rel-emitiu">' + identidade + "</p>";
    if (contato) html += '<p class="rel-contato">' + contato + "</p>";
    html += "<p>Documento gerado pelo HoloHacking. " +
      "Os marcadores e as faixas ainda estão em revisão pelo autor do método. " +
      "Queixa que sugira doença deve ser encaminhada ao médico.</p></footer></article>";

    alvo.innerHTML = html;
    pintarImagensDoPerfil(eu);
  }

  /* As imagens do perfil vivem no IndexedDB e chegam por promessa; o HTML ja
     foi escrito, entao elas entram nos buracos deixados para elas. */
  function pintarImagensDoPerfil(eu) {
    if (!window.PerfilProfissional) return;
    var por = [["logo_id", "rel-logo"], ["assinatura_id", "rel-assinatura"],
               ["carimbo_id", "rel-carimbo"]];
    por.forEach(function (par) {
      if (!eu[par[0]]) return;
      window.PerfilProfissional.imagem(eu[par[0]]).then(function (url) {
        var el = document.getElementById(par[1]);
        if (el && url) el.innerHTML = '<img src="' + url + '" alt="">';
      });
    });
  }

  /* ================================================================= abas */

  function trocarAba(nome) {
    document.querySelectorAll("#ficha-arquivos .aba").forEach(function (b) {
      b.classList.toggle("ativa", b.dataset.aba === nome);
    });
    // "exames" virou parte de "documentos"; quem ainda pedir aquilo cai aqui
    if (nome === "exames") nome = "documentos";
    ["visao", "linha", "formularios", "documentos", "relatorio"]
      .forEach(function (n) {
        var painel = document.getElementById("aba-" + n);
        if (painel) painel.classList.toggle("hidden", n !== nome);
      });
    document.querySelectorAll("#ficha-arquivos .aba").forEach(function (b) {
      b.classList.toggle("ativa", b.dataset.aba === nome);
    });
    if (nome === "documentos") desenharDocumentos();
    if (nome === "relatorio") desenharRelatorio();
    // as tres novas sao da ficha; ela desenha quando a aba abre
    if (window.desenharAbaDaFicha) window.desenharAbaDaFicha(nome);
  }

  function ligarRelatorio() {
    var alvo = document.getElementById("aba-relatorio");
    if (!alvo) return;
    alvo.addEventListener("click", function (ev) {
      var r = ev.target.closest("[data-registro]");
      if (r) { registroAtual = r.dataset.registro; desenharRelatorio(); return; }
      if (ev.target.closest('[data-acao="imprimir"]')) window.print();
    });
  }

  function atualizarAviso() {
    // a ficha inteira ja diz de quem e; nao precisa repetir aqui
  }

  document.addEventListener("DOMContentLoaded", function () {
    var secao = document.getElementById("ficha-arquivos");
    if (!secao) return;
    secao.querySelectorAll(".aba").forEach(function (b) {
      b.addEventListener("click", function () { trocarAba(b.dataset.aba); });
    });
    atualizarAviso();
    ligarRelatorio();
    trocarAba("visao");

    /* O perfil muda em outra tela. Quando muda, o cabecalho e o rodape do
       relatorio mudam junto — senao a pessoa salva o CRN e imprime sem ele. */
    window.redesenharRelatorio = function () {
      var aba = document.getElementById("aba-relatorio");
      if (aba && !aba.classList.contains("hidden")) desenharRelatorio();
    };

    var anterior = window.aoTrocarPaciente;
    window.aoTrocarPaciente = function () {
      if (typeof anterior === "function") anterior();
      atualizarAviso();
      var ativa = secao.querySelector(".aba.ativa");
      if (ativa) trocarAba(ativa.dataset.aba);
    };
  });
})();
