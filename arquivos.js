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

  /* ============================================================ HOLOSCAN ===
     Camada de apresentacao sobre o confronto relato x laboratorio que o
     motor ja calcula (motor/src/exames.ts, confrontar()). O contrato do
     motor NAO muda nesta rodada — continua devolvendo
     concordancia: 'confirma'|'diverge'|'sem_exame', usado por
     testes/testar-exames.mjs, por panorama.js e pelo CSS existente (.conf-
     item.confirma/.diverge). O que muda e so como a TELA le esse resultado:
     tres estados, com texto fixo, nunca a frase `leitura` que o motor gera
     (tem tom causal — "e o que a anamnese nao pega" — e nao deve chegar a
     interface clinica nem ao relatorio do paciente).

     Regra de seguranca: qualquer caso que este mapeamento nao reconheca cai
     em DADOS_INSUFICIENTES — nunca inventa uma conclusao.

     O caso (relato sem alteracao + laboratorio sem alteracao) e CONVERGENTE
     tecnicamente (preserva o comportamento atual de concordancia), mas usa
     um texto proprio que nao conclui "saudavel"/"normal"/"sem prioridade" —
     decisao 4, redacao final PENDENTE RODRIGO. Para distinguir esse caso do
     de "relato baixo + exame alterado", usamos a MESMA nota-corte que o
     motor ja aplica por padrao dentro de confrontar() (limiteBaixo=3,
     motor/src/exames.ts) — nao e um corte novo, e o mesmo que decide
     'confirma' la dentro. */
  var HOLOSCAN_TEXTO = {
    CONVERGENTE: "Existe convergência entre o relato do paciente e os dados laboratoriais nesta dimensão.",
    CONVERGENTE_SEM_ALTERACAO: "Relato e dados laboratoriais disponíveis estão convergentes nesta dimensão.",
    DIVERGENTE: "O relato e os dados laboratoriais não estão caminhando na mesma direção neste momento.",
    DADOS_INSUFICIENTES: "Ainda não há dados laboratoriais suficientes para realizar o confronto desta dimensão."
  };
  var HOLOSCAN_ROTULO = {
    CONVERGENTE: "Convergente",
    CONVERGENTE_SEM_ALTERACAO: "Convergente",
    DIVERGENTE: "Divergente",
    DADOS_INSUFICIENTES: "Dados insuficientes"
  };
  var HOLOSCAN_LIMITE_BAIXO = 3;

  function holoscanEstado(c) {
    if (!c || c.concordancia === "sem_exame") return "DADOS_INSUFICIENTES";
    if (c.concordancia === "diverge") return "DIVERGENTE";
    if (c.concordancia === "confirma") {
      return (c.nota !== null && c.nota !== undefined && c.nota <= HOLOSCAN_LIMITE_BAIXO)
        ? "CONVERGENTE" : "CONVERGENTE_SEM_ALTERACAO";
    }
    return "DADOS_INSUFICIENTES";
  }

  window.Holoscan = {
    estado: holoscanEstado,
    rotulo: function (c) { return HOLOSCAN_ROTULO[holoscanEstado(c)]; },
    texto: function (c) { return HOLOSCAN_TEXTO[holoscanEstado(c)]; }
  };

  /* Leitura do Holoscan na sua propria secao (#secao-holoscan), logo abaixo
     do HOLOSCOPE no menu — saiu de dentro de #secao-holoscope, onde era o
     item 8 e sugeria que o mapa se corrigia com exame.
     O lancamento dos valores continua na aba Documentos da ficha (nao move
     #ex-corpo nem os listeners de ligarPainel()) — este bloco e so leitura,
     por sistema: exames disponiveis, valor lancado, unidade, faixa cadastrada,
     estado do exame e o resultado do confronto (Holoscan). Chamado por
     irPara("holoscan") e por desenharPontuacao(), ambos em app.js. */
  window.desenharHoloscan = function (alvoId) {
    var alvo = document.getElementById(alvoId || "holo-holoscan");
    if (!alvo) return;
    var g = motor();
    if (!g || !g.listaDeExames) { alvo.innerHTML = ""; return; }

    var lista = g.listaDeExames();
    var valores = ler(CHAVE_EX);
    var r = g.lerExames(valores, notasDoPaciente());
    var avaliadoPorId = {};
    r.exames.forEach(function (a) { avaliadoPorId[a.id] = a; });
    var confrontoPorSistema = {};
    r.confronto.forEach(function (c) { confrontoPorSistema[c.sistema] = c; });

    var porSistema = {};
    lista.forEach(function (e) { (porSistema[e.sistema] = porSistema[e.sistema] || []).push(e); });

    /* Sem cabeca propria: quando este bloco era o item 8 do HOLOSCOPE ele
       precisava se apresentar no meio da pagina. Agora #secao-holoscan ja
       tem titulo e subtitulo, e repetir "o que os exames acrescentam" duas
       vezes na mesma tela so empurrava o conteudo para baixo. O aviso de
       onde se lancam os valores foi para o cabecalho da secao. */
    var html = "";

    Object.keys(porSistema).forEach(function (sis) {
      var c = confrontoPorSistema[sis] || null;
      var estado = window.Holoscan.estado(c);
      html += '<div class="holo-dominante-sistema"><h5>' + NOME_SISTEMA[sis] +
        ' <span class="conf-selo ' + estado.toLowerCase() + '">' +
        escapar(window.Holoscan.rotulo(c)) + "</span></h5>";
      html += '<ul class="holo-dominante-lista">';
      porSistema[sis].forEach(function (e) {
        var v = valores[e.id];
        var a = avaliadoPorId[e.id];
        html += "<li>" + escapar(e.exame) + ": " +
          (v === undefined
            ? "sem valor lançado"
            : escapar(v) + " " + escapar(e.unidade) +
              " · faixa cadastrada " + escapar(e.faixa) +
              (a ? " · " + (a.situacao === "ok" ? "na faixa" : a.situacao === "baixo" ? "abaixo" : "acima") : "")
          ) + "</li>";
      });
      html += "</ul><p class=\"terr-conta\">" + escapar(window.Holoscan.texto(c)) + "</p></div>";
    });

    html += '<p class="arq-nota holo-fronteira">O Holoscan organiza informações laboratoriais ' +
      "para apoiar a interpretação profissional. Não realiza diagnóstico.</p>";

    alvo.innerHTML = html;
  };

  function dataBR(iso) { return iso ? String(iso).split("-").reverse().join("/") : ""; }

  /* ========================================== ABA HOLOSCAN (na ficha) =====
     Resumo compacto do mesmo confronto que window.desenharHoloscan() e
     #ex-confronto ja calculam — nao reimplementa nada, so mostra menos:
     a contagem por estado e a leitura por sistema, sem a grade de exame a
     exame que a secao HOLOSCAN completa (#secao-holoscan) ja tem.

     HISTORICO DE COLETAS: holohacking.exames guarda so {examId: valor},
     sem data nenhuma — nao ha "coleta" persistida, so o ultimo valor
     lancado (proxima aplicacao sobrescreve). Por isso nao ha historico
     real para mostrar aqui; ver o aviso fixo no bloco correspondente e
     testes/testar-ficha-holoscan.mjs, onde isso fica registrado. Historico
     de coletas por data e trabalho para quando o Supabase entrar. */
  function desenharHoloscanAba() {
    var alvo = document.getElementById("aba-holoscan");
    if (!alvo) return;
    var g = motor();
    if (!g || !g.listaDeExames || !window.Holoscan) { alvo.innerHTML = ""; return; }

    var valores = ler(CHAVE_EX);
    var quantidade = Object.keys(valores).length;
    var p = pontuacaoGuardada();
    var temMapa = Object.keys(notasDoPaciente()).length > 0;

    var topo = '<div class="fic-consultas-topo">' +
      '<button type="button" class="btn-verde" data-ir="aba:documentos">Registrar exames</button>' +
    "</div>";

    // Secao 3: nao bloqueia o registro sem HOLOSCOPE, so avisa que o
    // confronto depende de um mapa disponivel — a mesma frase que
    // #ex-confronto ja usa quando nao ha mapa (desenharConfronto()).
    var avisoSemMapa = !temMapa
      ? '<p class="dash-vazio">Sem HOLOSCOPE aplicado, o confronto ainda não tem com o que comparar — ' +
        "toda dimensão aparece como dados insuficientes até existir um mapa.</p>"
      : "";

    if (quantidade === 0) {
      alvo.innerHTML = topo +
        '<div class="lista-vazia"><strong>Nenhum exame registrado</strong>' +
        "<span>Registre exames para confrontar os dados laboratoriais com o mapa do HOLOSCOPE.</span></div>" +
        avisoSemMapa;
      ligarHoloscanAba();
      return;
    }

    var r;
    try { r = g.lerExames(valores, notasDoPaciente()); }
    catch (e) { r = { confronto: [] }; }
    var confronto = r.confronto || [];

    // Secao 4: so os tres rotulos que window.Holoscan ja expoe — nunca uma
    // contagem calculada por fora dele.
    var contagem = { Convergente: 0, Divergente: 0, "Dados insuficientes": 0 };
    confronto.forEach(function (c) {
      var rot = window.Holoscan.rotulo(c);
      contagem[rot] = (contagem[rot] || 0) + 1;
    });

    var html = topo + avisoSemMapa;

    html += '<div class="dash-bloco dash-bloco-compacto">' +
      '<h3 class="dash-titulo">Última coleta</h3>' +
      '<p class="dash-sub">' + quantidade + (quantidade === 1 ? " exame registrado" : " exames registrados") +
        (temMapa && p ? " &middot; confrontado com o mapa de " + escapar(dataBR(p.quando)) : "") + "</p>" +
      '<div class="fic-piores-caixa"><div class="fic-piores">' +
        '<span class="fic-sis">Convergentes <b>' + contagem.Convergente + "</b></span>" +
        '<span class="fic-sis">Divergentes <b>' + contagem.Divergente + "</b></span>" +
        '<span class="fic-sis">Dados insuficientes <b>' + contagem["Dados insuficientes"] + "</b></span>" +
      "</div></div>" +
      '<button type="button" class="fic-ir-min" data-ir="holoscan">Ver HOLOSCAN completo</button>' +
    "</div>";

    // Secao 5: nome + estado, com o mesmo .conf-item que #ex-confronto ja
    // usa — inclusive o mesmo window.Holoscan.texto(c) fixo, NUNCA a
    // `leitura` causal que o motor gera internamente.
    html += '<div class="dash-bloco dash-bloco-compacto">' +
      '<h3 class="dash-titulo">Leitura por sistema</h3>' +
      '<div class="conf-lista">' + confronto.map(function (c) {
        var estado = window.Holoscan.estado(c);
        return '<div class="conf-item ' + estado.toLowerCase() + '">' +
          '<span class="conf-selo">' + escapar(window.Holoscan.rotulo(c)) + "</span>" +
          "<b>" + NOME_SISTEMA[c.sistema] + "</b>" +
          '<span class="conf-nota">nota ' + (c.nota === null || c.nota === undefined ? "—" : c.nota.toFixed(1)) + "</span>" +
          '<span class="conf-leitura">' + escapar(window.Holoscan.texto(c)) + "</span></div>";
      }).join("") + "</div>" +
    "</div>";

    // Secao 6: sem coleta datada persistida, o honesto e dizer isso — nao
    // fingir um historico que nao existe.
    html += '<div class="dash-bloco dash-bloco-compacto">' +
      '<h3 class="dash-titulo">Histórico de coletas</h3>' +
      '<p class="dash-vazio">O HOLOSCAN mostra sempre o estado atual dos exames lançados — ' +
      "não há coleta por data persistida ainda. Histórico completo entra com a persistência no Supabase.</p>" +
    "</div>";

    // Secao 7: a relacao entre as duas camadas, sem linguagem de correcao.
    html += '<div class="fic-continuidade">' +
      '<span class="fic-rot">HOLOSCOPE &rarr; mapa de investigação</span>' +
      '<span class="fic-rot">HOLOSCAN &rarr; confronto com exames</span>' +
    "</div>";

    alvo.innerHTML = html;
    ligarHoloscanAba();
  }

  var holoscanAbaLigada = false;
  function ligarHoloscanAba() {
    if (holoscanAbaLigada) return;
    holoscanAbaLigada = true;
    var alvo = document.getElementById("aba-holoscan");
    if (!alvo) return;
    alvo.addEventListener("click", function (ev) {
      var ir = ev.target.closest("[data-ir]");
      if (!ir) return;
      // "aba:x" abre uma aba da mesma ficha; o resto e secao do menu — o
      // mesmo contrato que ficha.js (ligar()) e app.js ja seguem.
      if (ir.dataset.ir.indexOf("aba:") === 0) {
        var aba = document.querySelector('[data-aba="' + ir.dataset.ir.slice(4) + '"]');
        if (aba) aba.click();
        return;
      }
      var b = document.querySelector('.nav-item[data-secao="' + ir.dataset.ir + '"]');
      if (b) b.click();
    });
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
          '<span class="ex-faixa">faixa cadastrada ' + e.faixa + " " + escapar(e.unidade) + "</span>" +
          '<input type="number" step="any" inputmode="decimal" value="' +
            (v === undefined ? "" : escapar(v)) + '" placeholder="—">' +
          '<span class="ex-situacao"></span></div>';
      });
      html += "</div>";
    });

    html += '<p class="arq-nota">As faixas são as da literatura funcional, mais estreitas ' +
      'que as do laboratório de propósito: laboratório marca doença, aqui se olha terreno. ' +
      '<b>São rascunho, não homologadas clinicamente, e esperam a revisão do Rodrigo.</b></p>';

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
      // Revisao clinica do HOLOSCOPE: o tooltip deixou de mostrar o texto
      // cru de exames.csv (leitura_baixo/leitura_alto) — frases como
      // "Resistência à insulina instalada" ou "Sobrecarga hepática" vazando
      // direto no DOM. O CSV continua intacto para revisao futura; a tela
      // so descreve o numero, nao a interpretacao.
      l.title = "Valor " + a.valor + " " + a.unidade + " · faixa cadastrada " + a.faixa +
        " · " + (a.situacao === "baixo" ? "abaixo" : "acima") + " da faixa cadastrada. " +
        "Faixa em revisão — não homologada clinicamente.";
    });

    desenharConfronto(r, n);
    // #holo-holoscan (agora em #secao-holoscan) le os MESMOS exames — sem
    // isso, editar um exame aqui na aba Documentos deixava aquele bloco
    // parado na leitura de antes ate o proximo "Salvar HOLOSCOPE".
    if (window.desenharHoloscan) window.desenharHoloscan("holo-holoscan");
  }

  function desenharConfronto(r, quantos) {
    var alvo = document.getElementById("ex-confronto");
    if (!alvo) return;

    // Revisao clinica do HOLOSCOPE (Holoscan): nao esconde mais o bloco so
    // porque nenhum exame foi lancado ainda — sem exame e DADOS
    // INSUFICIENTES, um estado que a tela precisa mostrar, nao omitir.

    var temMapa = Object.keys(notasDoPaciente()).length > 0;
    if (!temMapa) {
      alvo.innerHTML = '<p class="arq-nota">Aplique o questionário do HOLOSCOPE ' +
        'para este paciente e o exame passa a ser confrontado com o mapa.</p>';
      return;
    }

    // Revisao clinica do HOLOSCOPE (Holoscan): os tres estados aparecem
    // sempre, incluindo DADOS INSUFICIENTES — antes a linha simplesmente
    // sumia quando nao havia exame do sistema, e a ausencia de dado nao
    // pode virar ausencia de linha na tela. O texto e sempre o do Holoscan,
    // nunca a `leitura` que o motor gera internamente (ver window.Holoscan).
    var html = '<h4 class="leitura-titulo">Relato e laboratório (Holoscan)</h4>' +
               '<div class="conf-lista">';
    r.confronto.forEach(function (c) {
      var estado = window.Holoscan.estado(c);
      html += '<div class="conf-item ' + estado.toLowerCase() + '">' +
        '<span class="conf-selo">' + escapar(window.Holoscan.rotulo(c)) + "</span>" +
        "<b>" + NOME_SISTEMA[c.sistema] + "</b>" +
        '<span class="conf-nota">nota ' + (c.nota === null ? "—" : c.nota.toFixed(1)) + "</span>" +
        '<span class="conf-leitura">' + escapar(window.Holoscan.texto(c)) + "</span></div>";
    });
    html += "</div>";
    var divergem = r.confronto.filter(function (c) { return window.Holoscan.estado(c) === "DIVERGENTE"; }).length;
    if (divergem > 0) {
      html += '<p class="arq-nota conf-alerta">' + divergem +
        ' dimensão(ões) com divergência — aprofundar na consulta.</p>';
    }
    html += '<p class="arq-nota holo-fronteira">O Holoscan organiza informações ' +
      'laboratoriais para apoiar a interpretação profissional. Não realiza diagnóstico.</p>';
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
        // O botao do topo e o do estado vazio so abrem o MESMO seletor de
        // arquivo que a zona de arrastar ja usa — nao e um fluxo novo.
        if (a.dataset.acao === "adicionar-documento") {
          var campoArq = document.getElementById("doc-arquivo");
          if (campoArq) campoArq.click();
        }
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
      '<div class="fic-consultas-topo">' +
        '<button type="button" class="btn-verde" data-acao="adicionar-documento">Adicionar documento</button>' +
      "</div>" +

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
        '<div id="doc-aviso"></div>' +
        '<p class="dash-sub" id="doc-total"></p>' +
        '<div id="doc-lista"></div>' +
        '<p class="arq-nota" id="doc-espaco"></p>' +
      "</section>" +

      '<section class="arq-cartao">' +
        '<h4 class="arq-titulo">Os valores do exame</h4>' +
        '<p class="fluxo-clinico">História &rarr; HOLOSCOPE &rarr; <b>Holoscan</b> &rarr; Aprofundamento &rarr; Interpretação &rarr; Conduta &rarr; Evolução</p>' +
        '<p class="arq-sub">Opcional. Na primeira consulta o paciente costuma não ter ' +
        "exame nenhum, e o mapa não depende disto. O exame <b>não altera o Índice</b> " +
        "&mdash; ele confronta o que o paciente relatou com o que o sangue mostra.</p>" +
        '<div id="ex-atalhos"></div>' +
        '<div id="ex-corpo"></div>' +
      "</section>" +

      '<div class="fic-continuidade">' +
        '<span class="fic-rot">Consulta &rarr; HOLOSCOPE &rarr; HOLOSCAN &rarr; Documentos</span>' +
      "</div>";

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
      var total = document.getElementById("doc-total");
      // ArquivoStore.listar() ja devolve em ordem decrescente de data (e sem
      // data, por ultimo) — e a mesma lista que ja serve de "documentos
      // recentes": nao ha por que destacar um segundo bloco so com os
      // primeiros itens dela.
      if (itens.length === 0) {
        if (total) total.textContent = "";
        // Rodada de consistencia: o CTA do topo (.fic-consultas-topo) ja
        // cobre o "Adicionar documento" — um segundo botao igual dentro do
        // card vazio so duplicava (era a unica aba assim; Consultas/
        // HOLOSCOPE/HOLOSCAN ja usavam um so).
        alvo.innerHTML = '<div class="lista-vazia"><strong>Nenhum documento adicionado</strong>' +
          "<span>Adicione arquivos e materiais relacionados à jornada deste paciente.</span></div>";
        desenharAtalhosDeExame(itens);
      } else {
        if (total) total.textContent = itens.length + (itens.length === 1 ? " documento" : " documentos");
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
      alvo.innerHTML = '<div class="lista-vazia"><strong>Relatório ainda sem dados suficientes</strong>' +
        "<span>Conclua etapas da jornada clínica para gerar uma consolidação mais completa.</span></div>";
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
      /* Mesma defesa de app.js: snapshot antigo pode nao ter `cobertura`, e o
         relatorio nao pode quebrar por causa disso. Sem o dado, o segmento
         simplesmente nao aparece — a data continua. */
      '<p class="rel-meta">' + hoje() +
        (p.cobertura && typeof p.cobertura.percentual === "number"
          ? " &middot; cobertura " + p.cobertura.percentual + "%" : "") + "</p>" +
      '<p class="rel-fronteira">Avaliação nutricional integral construída a partir ' +
        "do que o paciente relata. Não é exame, não é diagnóstico médico e não " +
        "substitui avaliação clínica.</p>" +
      "</header>";

    /* ====================================================================
       A. HOLOSCOPE — autorrelato, prioridades, sistemas, triade, cobertura.
       O Indice entra no FIM desta secao, como informacao secundaria — nao
       no cabecalho — e as CMB/textos interpretativos nao confirmados nao
       aparecem (ver decisoes 1 e 2 da revisao clinica do HOLOSCOPE). */
    html += '<section class="rel-parte" data-origem="automatico">' +
      "<h3>A. HOLOSCOPE — o que o paciente relatou</h3>" +
      // Secao 3 da Etapa 6: a data da APLICACAO, nao a de hoje (.rel-meta do
      // cabecalho ja mostra quando o relatorio foi gerado — sao datas
      // diferentes, e a antiga faltava aqui).
      (p.quando ? '<p class="rel-meta">Aplicado em ' + escapar(dataBR(p.quando)) + "</p>" : "");

    var ordenados = p.sistemas.slice().sort(function (a, b) { return a.nota - b.nota; });
    html += '<div class="rel-bloco"><h4>Mapa de prioridades</h4>';
    ordenados.forEach(function (s) {
      var semDado = s.avaliavel === false;
      // respondidos/total_marcadores podem faltar num snapshot bem antigo —
      // nao inventa numero quando o campo nao existe.
      var temContagem = typeof s.respondidos === "number" && typeof s.total_marcadores === "number";
      var partes = [
        semDado ? "nenhuma pergunta respondida" : (temContagem ? s.respondidos + " de " + s.total_marcadores + " respondidas" : ""),
        s.faixa ? "faixa " + escapar(s.faixa) : ""
      ].filter(Boolean);
      html += '<p class="rel-prioridade"><b>' + escapar(s.nome) + "</b> — " +
        (semDado ? "—" : s.nota.toFixed(1)) +
        (partes.length ? " &middot; " + partes.join(" &middot; ") : "") +
        "</p>";
    });
    html += "</div>";

    var comDominantes = p.sistemas.filter(function (s) { return s.dominantes && s.dominantes.length; });
    if (comDominantes.length > 0) {
      html += '<div class="rel-bloco"><h4>Sinais dominantes</h4>';
      comDominantes.forEach(function (s) {
        html += "<p><b>" + escapar(s.nome) + "</b> — " +
          s.dominantes.map(function (d) { return escapar(d.rotulo || d.marcador_id); }).join(", ") +
          "</p>";
      });
      html += "</div>";
    }

    if (p.triada) {
      html += '<div class="rel-bloco"><h4>Triada</h4><p class="rel-triada">' +
        "Físico <b>" + p.triada.fisico.toFixed(1) + "</b> &middot; " +
        "Mental <b>" + p.triada.mental.toFixed(1) + "</b> &middot; " +
        "Espiritual <b>" + p.triada.espiritual.toFixed(1) + "</b></p></div>";
    }

    // Revisao clinica do HOLOSCOPE: nenhuma CMB aparece no relatorio nesta
    // rodada (ver app.js, cmbParaExibir()) — inclusive a CMB-001, e nos dois
    // registros ("nutricionista" e "paciente"). Bloco so nasce se houver algo.
    var combinacoesParaExibir = window.cmbParaExibir ? window.cmbParaExibir(p.combinacoes) : [];
    if (combinacoesParaExibir.length > 0) {
      html += '<div class="rel-bloco"><h4>Leitura combinada</h4>';
      combinacoesParaExibir.forEach(function (c) {
        html += '<p class="rel-combinada">&ldquo;' + escapar(c.leitura) + "&rdquo;</p>";
      });
      html += "</div>";
    }

    // Revisao clinica do HOLOSCOPE (decisao 2): o paragrafo interpretativo de
    // mensagens.csv (status=rascunho nas 30 linhas) sai da saida clinica; a
    // secao "Os cinco sistemas" continua, so com dado objetivo/calculado.
    html += '<div class="rel-bloco"><h4>Os cinco sistemas</h4>';
    ordenados.forEach(function (s) {
      html += '<div class="rel-sistema"><div class="rel-sistema-topo">' +
        "<b>" + escapar(s.nome) + "</b>" +
        '<span class="rel-nota">' + (s.avaliavel === false ? "—" : s.nota.toFixed(1)) + "</span>" +
        '<span class="rel-faixa">' + escapar(s.faixa || "") + "</span></div>" +
        '<p class="rel-passos">Área do mapa. Investigar com mais profundidade na consulta.</p>' +
        "</div>";
    });
    html += '<p class="rel-fronteira">Os cinco sistemas são categorias de organização do mapa, ' +
      "não categorias de doença.</p></div>";

    html += '<div class="rel-bloco rel-indice"><h4>Índice HOLOS (informação secundária)</h4>' +
      "<p><b>" + p.indice + "</b> de " + p.indice_maximo + "</p>" +
      '<p class="rel-fronteira">O Índice HOLOS resume as respostas deste mapa e não ' +
      "representa percentual de saúde.</p></div>";

    html += "</section>";

    /* ====================================================================
       B. HOLOSCAN — exames disponiveis e confronto por area. Aparece
       sempre, mesmo sem nenhum exame lancado (dados insuficientes e um
       estado a mostrar, nao motivo para a secao sumir). */
    var ex = ler(CHAVE_EX);
    var rExames = g.lerExames(ex, notasDoPaciente());
    html += '<section class="rel-parte" data-origem="automatico">' +
      "<h3>B. HOLOSCAN — o que os exames acrescentam</h3><div class=\"rel-bloco\">";
    rExames.confronto.forEach(function (c) {
      html += "<p><b>" + NOME_SISTEMA[c.sistema] + "</b> — " +
        escapar(window.Holoscan.rotulo(c)) + ". " + escapar(window.Holoscan.texto(c)) + "</p>";
    });
    html += '<p class="rel-fronteira">O Holoscan organiza informações laboratoriais para ' +
      "apoiar a interpretação profissional. Não realiza diagnóstico.</p></div></section>";

    /* ====================================================================
       C. CONSULTAS E ACOMPANHAMENTO — window.Agenda.todas() ja e a mesma
       lista, em ordem decrescente, que a aba Consultas da ficha usa. Aparece
       sempre, como a B: "nenhuma consulta" tambem e informacao da jornada. */
    var consultas = (window.Agenda && window.Agenda.todas) ? window.Agenda.todas(paciente()) : [];
    html += '<section class="rel-parte" data-origem="automatico">' +
      "<h3>C. Consultas e acompanhamento</h3><div class=\"rel-bloco\">";
    if (consultas.length === 0) {
      html += '<p class="rel-vazio">Nenhuma consulta registrada até o momento.</p>';
    } else {
      html += "<p>" + consultas.length +
        (consultas.length === 1 ? " consulta registrada." : " consultas registradas.") + "</p>";
      consultas.forEach(function (c) {
        html += '<p class="rel-prioridade"><b>' + escapar(dataBR(c.data)) + "</b> &middot; " +
          escapar(c.hora) + " &middot; " + escapar(c.tipo || "Consulta") + "</p>";
      });
    }
    html += "</div></section>";

    /* ====================================================================
       D. DOCUMENTOS E MATERIAIS — mesmo ArquivoStore.listar() que a aba
       Documentos ja usa, ja em ordem decrescente de data. IndexedDB e
       assincrono: a secao nasce com "carregando" e preencherDocumentosRelatorio()
       troca pelo conteudo real quando a promessa resolve, sem travar o
       resto do relatorio (que e todo sincrono) esperando por isto. */
    html += '<section class="rel-parte" data-origem="automatico">' +
      "<h3>D. Documentos e materiais</h3>" +
      '<div class="rel-bloco" id="rel-documentos-corpo"><p class="rel-vazio">Carregando…</p></div></section>';

    /* ====================================================================
       E. INTERPRETACAO PROFISSIONAL — texto que a nutricionista escreveu,
       nunca gerado automaticamente. Nunca misturado com A/B/C/D sem etiqueta.
       Editavel so no registro "nutri"; no registro "paciente" e so leitura,
       exatamente com o que foi escrito — sem gerar nada em cima. */
    var interpretacao = window.interpretacaoDe ? window.interpretacaoDe() : null;
    var textoInterpretacao = (interpretacao && interpretacao.texto) || "";
    html += '<section class="rel-parte" data-origem="profissional">' +
      "<h3>E. Interpretação profissional</h3><div class=\"rel-bloco\">";
    if (registroAtual === "nutri") {
      html += '<textarea id="rel-interpretacao" class="rel-interpretacao-campo" ' +
        'placeholder="Registre aqui a leitura profissional deste mapa.">' +
        escapar(textoInterpretacao) + "</textarea>" +
        '<div class="acoes-form"><button type="button" class="btn-verde" ' +
        'data-acao="salvar-interpretacao">Salvar interpretação</button>' +
        '<span class="rel-interpretacao-aviso" id="rel-interpretacao-aviso"></span></div>';
    } else {
      html += (textoInterpretacao
        ? "<p>" + escapar(textoInterpretacao).replace(/\n/g, "<br>") + "</p>"
        : '<p class="rel-vazio">Sem interpretação registrada.</p>');
    }
    html += "</div></section>";

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
    preencherDocumentosRelatorio(paciente());
  }

  /* Mesmo padrao de pintarImagensDoPerfil(): o HTML sincrono ja foi escrito
     com um "carregando", e o real entra no buraco quando a promessa do
     ArquivoStore resolve. Confere se a secao ainda existe — trocar de aba
     ou de paciente antes da promise resolver nao pode escrever por cima da
     tela errada. */
  function preencherDocumentosRelatorio(pid) {
    if (!window.ArquivoStore) return;
    window.ArquivoStore.listar(pid).then(function (itens) {
      var alvo = document.getElementById("rel-documentos-corpo");
      if (!alvo) return;
      if (!itens.length) {
        alvo.innerHTML = '<p class="rel-vazio">Nenhum documento registrado até o momento.</p>';
        return;
      }
      alvo.innerHTML = "<p>" + itens.length +
        (itens.length === 1 ? " documento registrado." : " documentos registrados.") + "</p>" +
        itens.map(function (d) {
          return '<p class="rel-prioridade"><b>' + escapar(d.nome) + "</b> &middot; " + escapar(d.tipo) +
            (d.data ? " &middot; " + escapar(dataBR(d.data)) : "") + "</p>";
        }).join("");
    });
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
    ["visao", "consultas", "holoscope", "holoscan", "linha", "formularios", "documentos", "relatorio"]
      .forEach(function (n) {
        var painel = document.getElementById("aba-" + n);
        if (painel) painel.classList.toggle("hidden", n !== nome);
      });
    document.querySelectorAll("#ficha-arquivos .aba").forEach(function (b) {
      b.classList.toggle("ativa", b.dataset.aba === nome);
    });
    if (nome === "documentos") desenharDocumentos();
    if (nome === "relatorio") desenharRelatorio();
    if (nome === "holoscan") desenharHoloscanAba();
    // as tres novas sao da ficha; ela desenha quando a aba abre
    if (window.desenharAbaDaFicha) window.desenharAbaDaFicha(nome);
  }

  function ligarRelatorio() {
    var alvo = document.getElementById("aba-relatorio");
    if (!alvo) return;
    alvo.addEventListener("click", function (ev) {
      var r = ev.target.closest("[data-registro]");
      if (r) { registroAtual = r.dataset.registro; desenharRelatorio(); return; }
      if (ev.target.closest('[data-acao="imprimir"]')) { window.print(); return; }
      if (ev.target.closest('[data-acao="salvar-interpretacao"]')) {
        var campo = document.getElementById("rel-interpretacao");
        var aviso = document.getElementById("rel-interpretacao-aviso");
        if (!campo) return;
        var salvou = window.guardarInterpretacao && window.guardarInterpretacao(campo.value);
        if (aviso) {
          aviso.textContent = salvou
            ? "Salvo."
            : "Aplique o HOLOSCOPE hoje antes de registrar a interpretação.";
        }
        return;
      }
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
