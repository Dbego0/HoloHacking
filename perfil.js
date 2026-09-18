/* ===========================================================================
   PERFIL — quem assina o que sai daqui
   ===========================================================================

   O app sabia tudo sobre o paciente e nada sobre quem o atende. O relatorio
   impresso saía com "HoloHacking" no topo e uma frase generica no rodape: o
   nome da nutricionista, o CRN dela, o telefone do consultorio — nada disso
   existia em lugar nenhum, e receita sem registro profissional nao vale.

   Quatro abas, e cada uma existe por um motivo:

     PERFIL        o que sai impresso: nome, registro, especialidade, contato
     MARCA         a cara do documento: cores, logo, assinatura, carimbo
     PREFERENCIAS  como o app se comporta: modulos do menu e aparencia
     CONTA         onde os dados estao, como levar embora, como apagar

   O que NAO esta aqui, e por que: o app de referencia tem "Plano e Pagamento"
   e um bloco de troca de senha em Seguranca. Este app nao tem cobranca, e a
   troca de senha (fluxo de recuperacao com pagina de redirect) ainda nao
   chegou na Fase 1 do Supabase — um campo "nova senha" pela metade e pior do
   que nenhum. O que a Fase 1 trouxe (quem esta logado, e sair) esta na aba
   Conta, abaixo.

   Onde as coisas ficam: os campos de texto vao para a tabela `perfil` (uma
   linha so) e viajam no exportar/importar junto com os pacientes. As imagens
   — foto, logo, assinatura, carimbo — vao para o IndexedDB, como os exames,
   porque localStorage nao aguenta binario.
   =========================================================================== */

(function () {
  "use strict";

  var DONO = "_perfil";          // as imagens do perfil no ArquivoStore
  var LINHA = "eu";              // a unica linha da tabela perfil

  var perfil = null;
  var aba = "perfil";
  var urls = {};                 // id do arquivo -> objectURL ja criado
  var desenhando = false;        // a assinatura desenhada a mao esta aberta?

  var PADRAO = {
    id: LINHA,
    nome: "", email: "", profissao: "Nutricionista", registro: "",
    especialidade: "", cidade: "", instagram: "", telefone: "",
    email_resposta: "", fuso: "America/Sao_Paulo",
    cor_primaria: "#0b3325", cor_secundaria: "#c9a35a",
    foto_id: "", logo_id: "", assinatura_id: "", carimbo_id: "",
    modulos: { consultas: true, agenda: true, documentos: true }
  };

  /* Fusos do Brasil, e mais nada: o app atende aqui. Uma lista mundial de 400
     entradas para escolher entre quatro seria um campo pior. */
  var FUSOS = [
    { id: "America/Sao_Paulo", nome: "Brasília (BRT, UTC-3)" },
    { id: "America/Manaus", nome: "Manaus (AMT, UTC-4)" },
    { id: "America/Rio_Branco", nome: "Rio Branco (ACT, UTC-5)" },
    { id: "America/Noronha", nome: "Fernando de Noronha (UTC-2)" }
  ];

  var MODULOS = [
    { id: "consultas", nome: "Consultas",
      resumo: "O histórico de atendimentos da carteira inteira",
      texto: "Cada aplicação do HOLOSCOPE vira uma linha, em ordem de tempo. " +
             "Se você só olha paciente por paciente, pela ficha, pode deixar desativado." },
    { id: "agenda", nome: "Agenda",
      resumo: "Quem precisa voltar, e quando",
      texto: "Calcula o retorno de 4 semanas a partir da última aplicação e deixa " +
             "você marcar o dia combinado. Se a sua agenda vive em outro lugar, " +
             "pode deixar desativado." },
    { id: "documentos", nome: "Documentos",
      resumo: "Os arquivos de todos os pacientes num lugar só",
      texto: "Os mesmos exames e laudos que aparecem na ficha de cada um, reunidos " +
             "para procurar sem saber de quem era. A aba da ficha continua existindo " +
             "com ou sem isto." }
  ];

  var APARENCIAS = [
    { id: "claro", nome: "Claro" },
    { id: "escuro", nome: "Escuro" },
    { id: "sistema", nome: "Seguir o sistema" }
  ];

  /* O que faz um perfil estar pronto. A ordem e a da tela, e o peso e igual:
     nenhum destes campos e mais opcional que o outro na hora de imprimir. */
  var CHECKLIST = [
    { campo: "nome", rotulo: "Nome completo" },
    { campo: "foto_id", rotulo: "Foto de perfil" },
    { campo: "profissao", rotulo: "Profissão" },
    { campo: "registro", rotulo: "Registro/Conselho" },
    { campo: "especialidade", rotulo: "Especialidade" },
    { campo: "cidade", rotulo: "Cidade/UF" },
    { campo: "logo_id", rotulo: "Logo" },
    { campo: "assinatura_id", rotulo: "Assinatura" },
    { campo: "telefone", rotulo: "Telefone" }
  ];

  function escapar(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* O dia de hoje no fuso de quem usa: toISOString() é UTC, e depois das 21h
     no Brasil ele já virou amanhã. */
  function hojeISO() {
    var d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  /* ---------- ler e gravar ------------------------------------------------ */

  function banco() {
    return window.DadosLocais || null;
  }

  function carregar() {
    var b = banco();
    if (!b) { perfil = Object.assign({}, PADRAO); return Promise.resolve(perfil); }
    return Promise.resolve(b.from("perfil").select("*")).then(function (r) {
      var linha = (r.data || [])[0] || null;
      perfil = Object.assign({}, PADRAO, linha || {});
      // modulos pode vir de um export antigo sem o campo
      perfil.modulos = Object.assign({}, PADRAO.modulos, perfil.modulos || {});
      perfil.id = LINHA;
      return perfil;
    });
  }

  function gravar() {
    var b = banco();
    if (!b) return Promise.resolve({ error: null });
    var copia = Object.assign({}, perfil);
    delete copia.created_at;
    return Promise.resolve(b.from("perfil").select("*")).then(function (r) {
      var existe = (r.data || []).length > 0;
      return existe
        ? b.from("perfil").update(copia).eq("id", LINHA)
        : b.from("perfil").insert(copia).select().single();
    });
  }

  function salvar(mensagem) {
    return Promise.resolve(gravar()).then(function (r) {
      if (r && r.error) { aviso(r.error.message, true); return false; }
      espalhar();
      if (mensagem && window.avisar) window.avisar(mensagem);
      return true;
    });
  }

  /* Quem mais precisa saber que o perfil mudou: o rodape da sidebar, o menu
     (modulos ligados e desligados) e o relatorio, que e o consumidor final. */
  function espalhar() {
    desenharRodape();
    aplicarModulos();
    if (typeof window.redesenharRelatorio === "function") window.redesenharRelatorio();
  }

  function aviso(texto, ruim) {
    var alvo = document.getElementById("perfil-aviso");
    if (!alvo) { if (window.avisar) window.avisar(texto); return; }
    alvo.textContent = texto;
    alvo.className = ruim ? "perfil-aviso ruim" : "perfil-aviso";
  }

  /* ---------- as imagens -------------------------------------------------- */

  function urlDe(id) {
    if (!id) return Promise.resolve("");
    if (urls[id]) return Promise.resolve(urls[id]);
    if (!window.ArquivoStore) return Promise.resolve("");
    return window.ArquivoStore.pegar(id).then(function (r) {
      if (!r || !r.arquivo) return "";
      urls[id] = URL.createObjectURL(r.arquivo);
      return urls[id];
    }).catch(function () { return ""; });
  }

  /** Troca a imagem de um campo, apagando a anterior: guardar as duas encheria
      o navegador de logos velhos que ninguem mais vai ver. */
  function guardarImagem(campo, arquivo, tipo) {
    if (!window.ArquivoStore) return Promise.resolve(false);
    var antiga = perfil[campo];
    return window.ArquivoStore.salvar(DONO, arquivo, {
      nome: tipo, tipo: tipo, data: hojeISO()
    }).then(function (reg) {
      perfil[campo] = reg.id;
      if (antiga) {
        if (urls[antiga]) { URL.revokeObjectURL(urls[antiga]); delete urls[antiga]; }
        return window.ArquivoStore.remover(antiga).catch(function () {});
      }
    }).then(function () {
      return salvar(tipo + " atualizado.");
    }).then(function () { desenhar(); return true; })
      .catch(function (e) { aviso(e.message || "Não foi possível guardar a imagem.", true); return false; });
  }

  function tirarImagem(campo) {
    var id = perfil[campo];
    if (!id) return;
    perfil[campo] = "";
    if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; }
    (window.ArquivoStore ? window.ArquivoStore.remover(id) : Promise.resolve())
      .catch(function () {})
      .then(function () { return salvar("Imagem removida."); })
      .then(desenhar);
  }

  /* ---------- a completude ------------------------------------------------ */

  function completude() {
    var feitos = CHECKLIST.filter(function (i) { return !!perfil[i.campo]; });
    return {
      itens: CHECKLIST.map(function (i) {
        return { rotulo: i.rotulo, feito: !!perfil[i.campo] };
      }),
      feitos: feitos.length,
      total: CHECKLIST.length,
      pct: Math.round(feitos.length / CHECKLIST.length * 100)
    };
  }

  function desenharCompletude() {
    var alvo = document.getElementById("perfil-completude");
    if (!alvo) return;
    var c = completude();

    alvo.innerHTML = '<div class="perf-completo">' +
      '<div class="perf-completo-topo">' +
        "<b>Perfil " + (c.pct === 100 ? "completo" : c.pct + "% completo") + "</b>" +
        '<span>' + c.feitos + " de " + c.total + "</span>" +
      "</div>" +
      '<ul class="perf-lista">' + c.itens.map(function (i) {
        return '<li class="' + (i.feito ? "feito" : "") + '">' +
          '<span class="perf-marca" aria-hidden="true"></span>' +
          escapar(i.rotulo) + "</li>";
      }).join("") + "</ul>" +
      (c.pct === 100 ? "" :
        '<p class="perf-porque">O que falta aqui é o que some do papel: sem registro ' +
        "profissional e sem assinatura, o documento impresso não identifica quem o emitiu.</p>") +
      "</div>";
  }

  /* ---------- o rodape da sidebar ----------------------------------------- */

  function desenharRodape() {
    var nome = document.getElementById("sr-nome");
    if (!nome) return;
    var c = completude();
    nome.textContent = perfil.nome || "Profissional";
    document.getElementById("sr-papel").textContent =
      perfil.profissao || "Nutricionista";
    document.getElementById("sr-barra").style.width = c.pct + "%";
    document.getElementById("sr-pct").textContent = c.pct + "%";

    var av = document.getElementById("sr-avatar");
    urlDe(perfil.foto_id).then(function (u) {
      if (u) {
        av.innerHTML = '<img src="' + u + '" alt="">';
        av.classList.add("com-foto");
      } else {
        av.textContent = (perfil.nome || "P").trim().charAt(0).toUpperCase();
        av.classList.remove("com-foto");
      }
    });
  }

  /* ---------- os modulos do menu ------------------------------------------ */

  function aplicarModulos() {
    MODULOS.forEach(function (m) {
      var ligado = perfil.modulos[m.id] !== false;
      var botao = document.querySelector('.nav-item[data-secao="' + m.id + '"]');
      if (botao) botao.classList.toggle("hidden", !ligado);
      /* Desligar o modulo que esta aberto deixaria a pessoa numa tela sem
         volta pelo menu. Ela vai para o Dashboard, que existe sempre. */
      var secao = document.getElementById("secao-" + m.id);
      if (!ligado && secao && secao.classList.contains("ativa")) {
        if (window.irParaSecao) window.irParaSecao("dashboard");
      }
    });
  }

  /* ---------- peças de formulário ----------------------------------------- */

  function campo(o) {
    return '<div class="perf-campo' + (o.largo ? " largo" : "") + '">' +
      '<label for="pf-' + o.id + '">' +
        (o.icone ? '<span class="perf-ico">' + o.icone + "</span>" : "") +
        escapar(o.rotulo) + "</label>" +
      '<input id="pf-' + o.id + '" type="' + (o.tipo || "text") +
        '" value="' + escapar(perfil[o.id] || "") + '"' +
        (o.dica ? ' placeholder="' + escapar(o.dica) + '"' : "") +
        (o.auto ? ' autocomplete="' + o.auto + '"' : "") + ">" +
      (o.ajuda ? '<p class="perf-ajuda">' + o.ajuda + "</p>" : "") +
      "</div>";
  }

  function cartao(titulo, sub, corpo, icone) {
    return '<section class="perf-cartao">' +
      '<h3 class="perf-titulo">' + (icone ? '<span class="perf-ico">' + icone + "</span>" : "") +
        escapar(titulo) + "</h3>" +
      (sub ? '<p class="perf-sub">' + sub + "</p>" : "") +
      corpo + "</section>";
  }

  /* ======================================================= ABA: PERFIL ==== */

  function painelPerfil() {
    var alvo = document.getElementById("painel-perfil");

    var foto = cartao("Foto de perfil",
      "Aparece no canto da tela e identifica quem está usando o app.",
      '<div class="perf-foto">' +
        '<span class="perf-foto-alvo" id="perf-foto-alvo">' +
          (perfil.nome || "P").trim().charAt(0).toUpperCase() + "</span>" +
        '<div class="perf-foto-acoes">' +
          '<button type="button" class="perf-botao" data-enviar="foto_id">Trocar foto</button>' +
          (perfil.foto_id
            ? '<button type="button" class="perf-tirar" data-tirar="foto_id">remover</button>'
            : "") +
        "</div>" +
      "</div>");

    var pessoais =
      '<div class="perf-grade">' +
        campo({ id: "nome", rotulo: "Nome completo", dica: "Como você assina", auto: "name" }) +
        campo({ id: "email", rotulo: "E-mail", tipo: "email", dica: "seu@email.com", auto: "email" }) +
        campo({ id: "profissao", rotulo: "Profissão", dica: "Nutricionista" }) +
        campo({ id: "registro", rotulo: "Registro profissional", dica: "Ex: CRN-3 12345",
                ajuda: "Sai impresso no rodapé dos relatórios, embaixo da sua assinatura. " +
                       "Sem ele o documento não identifica quem o emitiu." }) +
        campo({ id: "especialidade", rotulo: "Especialidade/Atuação", dica: "Nutrição Holística" }) +
        campo({ id: "cidade", rotulo: "Cidade/UF", dica: "Ex: Goiânia/GO ou Atendimento online" }) +
      "</div>" +
      campo({ id: "instagram", rotulo: "Instagram", dica: "@seu_perfil", largo: true,
              ajuda: "Aparece no rodapé dos materiais que você imprime para os pacientes." }) +
      campo({ id: "telefone", rotulo: "Telefone / WhatsApp", tipo: "tel",
              dica: "(11) 99999-9999", largo: true, auto: "tel",
              ajuda: "Aparece no rodapé dos documentos gerados." }) +
      '<div class="perf-campo largo">' +
        '<label for="pf-fuso">Fuso horário</label>' +
        '<select id="pf-fuso">' + FUSOS.map(function (f) {
          return '<option value="' + f.id + '"' +
            (f.id === perfil.fuso ? " selected" : "") + ">" + escapar(f.nome) + "</option>";
        }).join("") + "</select>" +
        '<p class="perf-ajuda">Usado para as datas de aplicação e para o cálculo do ' +
        "retorno de 4 semanas na Agenda.</p>" +
      "</div>" +
      '<div class="perf-acoes">' +
        '<p class="perf-aviso" id="perfil-aviso"></p>' +
        '<button type="button" class="btn-verde" id="btn-salvar-perfil">Salvar alterações</button>' +
      "</div>";

    alvo.innerHTML = foto +
      cartao("Informações Pessoais", "Dados básicos do seu perfil profissional.", pessoais);

    urlDe(perfil.foto_id).then(function (u) {
      var el = document.getElementById("perf-foto-alvo");
      if (el && u) { el.innerHTML = '<img src="' + u + '" alt="">'; el.classList.add("com-foto"); }
    });
  }

  function lerFormulario() {
    ["nome", "email", "profissao", "registro", "especialidade", "cidade",
     "instagram", "telefone"].forEach(function (c) {
      var el = document.getElementById("pf-" + c);
      if (el) perfil[c] = el.value.trim();
    });
    var f = document.getElementById("pf-fuso");
    if (f) perfil.fuso = f.value;
  }

  /* ======================================================== ABA: MARCA ==== */

  function painelMarca() {
    var alvo = document.getElementById("painel-marca");

    var cores =
      '<div class="perf-grade">' +
        corCampo("cor_primaria", "Cor primária") +
        corCampo("cor_secundaria", "Cor secundária") +
      "</div>" +
      '<div class="perf-campo largo">' +
        "<label>Logo</label>" +
        '<div class="perf-foto">' +
          '<span class="perf-logo-alvo" id="perf-logo-alvo">sem logo</span>' +
          '<div class="perf-foto-acoes">' +
            '<button type="button" class="perf-botao" data-enviar="logo_id">Trocar logo</button>' +
            (perfil.logo_id
              ? '<button type="button" class="perf-tirar" data-tirar="logo_id">remover</button>'
              : "") +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="perf-campo largo">' +
        "<label>Pré-visualização</label>" +
        previa() +
      "</div>" +
      '<div class="perf-acoes">' +
        '<button type="button" class="btn-verde" id="btn-salvar-marca">Salvar alterações</button>' +
      "</div>";

    var assinatura =
      '<div class="perf-imagem">' +
        '<div class="perf-imagem-topo"><b>Assinatura</b></div>' +
        '<div class="perf-imagem-corpo">' +
          '<span class="perf-imagem-alvo" id="perf-assinatura-alvo">nenhuma</span>' +
          '<div class="perf-imagem-lado">' +
            "<p>Envie um PNG com fundo transparente, ou desenhe aqui mesmo &mdash; " +
            "é o que resolve para quem não tem a assinatura digitalizada.</p>" +
            '<div class="perf-foto-acoes">' +
              '<button type="button" class="perf-botao" data-enviar="assinatura_id">Enviar</button>' +
              '<button type="button" class="perf-botao" id="btn-desenhar">Desenhar</button>' +
              (perfil.assinatura_id
                ? '<button type="button" class="perf-tirar" data-tirar="assinatura_id">remover</button>'
                : "") +
            "</div>" +
          "</div>" +
        "</div>" +
        (desenhando ? prancheta() : "") +
      "</div>" +
      '<div class="perf-imagem">' +
        '<div class="perf-imagem-topo"><b>Carimbo profissional</b></div>' +
        '<div class="perf-imagem-corpo">' +
          '<span class="perf-imagem-alvo" id="perf-carimbo-alvo">nenhum</span>' +
          '<div class="perf-imagem-lado">' +
            "<p>A imagem do seu carimbo, de preferência em PNG com fundo transparente.</p>" +
            '<div class="perf-foto-acoes">' +
              '<button type="button" class="perf-botao" data-enviar="carimbo_id">Enviar</button>' +
              (perfil.carimbo_id
                ? '<button type="button" class="perf-tirar" data-tirar="carimbo_id">remover</button>'
                : "") +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +
      /* O app de referencia diz "bucket privado". Aqui nao ha bucket: ha o
         IndexedDB desta maquina. Dizer a mesma frase seria mentir sobre onde
         a assinatura da pessoa esta. */
      '<p class="perf-nota">As imagens ficam guardadas <b>neste navegador</b>, como os ' +
      "exames dos pacientes, e só são usadas para montar os documentos que você imprime. " +
      "Não constituem assinatura digital ICP-Brasil e podem ser removidas a qualquer momento.</p>";

    alvo.innerHTML =
      cartao("Personalização de Materiais",
        "As cores e o logo dos relatórios que você imprime para os pacientes.", cores) +
      cartao("Assinatura e carimbo",
        "Imagens opcionais usadas no rodapé dos relatórios.", assinatura);

    urlDe(perfil.logo_id).then(function (u) {
      var el = document.getElementById("perf-logo-alvo");
      if (el && u) el.innerHTML = '<img src="' + u + '" alt="">';
      var pv = document.getElementById("previa-logo");
      if (pv && u) pv.innerHTML = '<img src="' + u + '" alt="">';
    });
    urlDe(perfil.assinatura_id).then(function (u) {
      var el = document.getElementById("perf-assinatura-alvo");
      if (el && u) el.innerHTML = '<img src="' + u + '" alt="">';
    });
    urlDe(perfil.carimbo_id).then(function (u) {
      var el = document.getElementById("perf-carimbo-alvo");
      if (el && u) el.innerHTML = '<img src="' + u + '" alt="">';
    });
    if (desenhando) ligarPrancheta();
  }

  function corCampo(id, rotulo) {
    return '<div class="perf-campo">' +
      '<label for="pf-' + id + '-texto">' + escapar(rotulo) + "</label>" +
      '<div class="perf-cor">' +
        '<input type="color" id="pf-' + id + '" value="' + escapar(perfil[id]) +
          '" aria-label="' + escapar(rotulo) + '">' +
        '<input type="text" id="pf-' + id + '-texto" value="' + escapar(perfil[id]) +
          '" spellcheck="false">' +
      "</div></div>";
  }

  /* A previa e o proprio cabecalho do relatorio, com os mesmos dados. Se ela
     mostrasse um exemplo bonito e o impresso saisse diferente, ela mentiria. */
  function previa() {
    return '<div class="perf-previa" style="--p:' + escapar(perfil.cor_primaria) +
      ";--s:" + escapar(perfil.cor_secundaria) + '">' +
      '<div class="perf-previa-topo">' +
        '<span class="perf-previa-logo" id="previa-logo">' +
          (perfil.logo_id ? "" : "sem logo") + "</span>" +
        '<span class="perf-previa-quem">' +
          "<b>" + escapar(perfil.nome || "Seu nome") + "</b>" +
          "<i>" + escapar(perfil.especialidade || "Especialidade") + "</i>" +
          "<i>" + escapar(perfil.cidade || "Cidade/UF") + "</i>" +
        "</span>" +
      "</div>" +
      '<p class="perf-previa-linha primaria">Cabeçalho de documento</p>' +
      '<p class="perf-previa-linha secundaria">Acompanhamento</p>' +
      "</div>";
  }

  /* ---------- desenhar a assinatura --------------------------------------- */

  function prancheta() {
    return '<div class="perf-prancheta">' +
      '<canvas id="perf-canvas" width="720" height="220" ' +
        'aria-label="Área para desenhar a assinatura"></canvas>' +
      '<div class="perf-foto-acoes">' +
        '<button type="button" class="btn-verde" id="btn-usar-desenho">Usar esta assinatura</button>' +
        '<button type="button" class="perf-botao" id="btn-limpar-desenho">Limpar</button>' +
        '<button type="button" class="perf-tirar" id="btn-fechar-desenho">cancelar</button>' +
      "</div></div>";
  }

  function ligarPrancheta() {
    var cv = document.getElementById("perf-canvas");
    if (!cv) return;
    var ctx = cv.getContext("2d");
    var traçou = false;
    var pondo = false;

    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";

    /* O canvas e desenhado em 720x220 mas exibido menor: sem converter a
       coordenada, o traço sai deslocado do dedo. */
    function ponto(ev) {
      var r = cv.getBoundingClientRect();
      return { x: (ev.clientX - r.left) * (cv.width / r.width),
               y: (ev.clientY - r.top) * (cv.height / r.height) };
    }
    cv.addEventListener("pointerdown", function (ev) {
      pondo = true; traçou = true;
      cv.setPointerCapture(ev.pointerId);
      var p = ponto(ev);
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
    });
    cv.addEventListener("pointermove", function (ev) {
      if (!pondo) return;
      var p = ponto(ev);
      ctx.lineTo(p.x, p.y); ctx.stroke();
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (e) {
      cv.addEventListener(e, function () { pondo = false; });
    });

    document.getElementById("btn-limpar-desenho").addEventListener("click", function () {
      ctx.clearRect(0, 0, cv.width, cv.height); traçou = false;
    });
    document.getElementById("btn-fechar-desenho").addEventListener("click", function () {
      desenhando = false; desenhar();
    });
    document.getElementById("btn-usar-desenho").addEventListener("click", function () {
      if (!traçou) { aviso("Desenhe a assinatura antes de salvar.", true); return; }
      cv.toBlob(function (blob) {
        if (!blob) return;
        var arq = new File([blob], "assinatura.png", { type: "image/png" });
        desenhando = false;
        guardarImagem("assinatura_id", arq, "Assinatura");
      }, "image/png");
    });
  }

  /* ================================================ ABA: PREFERENCIAS ==== */

  function painelPrefs() {
    var alvo = document.getElementById("painel-prefs");

    var modulos = MODULOS.map(function (m) {
      var ligado = perfil.modulos[m.id] !== false;
      return '<div class="perf-modulo">' +
        '<div class="perf-modulo-topo">' +
          '<span class="perf-modulo-quem"><b>' + escapar(m.nome) + "</b>" +
            "<span>" + escapar(m.resumo) + "</span></span>" +
          '<button type="button" class="perf-chave' + (ligado ? " ligada" : "") +
            '" role="switch" aria-checked="' + ligado + '" data-modulo="' + m.id +
            '" aria-label="' + escapar(m.nome) + '"><i></i></button>' +
        "</div>" +
        "<p>" + escapar(m.texto) + "</p>" +
        '<p class="perf-modulo-estado">' + (ligado ? "&#10003; Ativo no menu" : "Desativado") +
        "</p></div>";
    }).join("");

    var atual = window.aparenciaAtual ? window.aparenciaAtual() : "sistema";
    var aparencia = '<div class="perf-temas">' + APARENCIAS.map(function (a) {
      return '<button type="button" class="perf-tema' + (a.id === atual ? " ativo" : "") +
        '" data-aparencia="' + a.id + '" aria-pressed="' + (a.id === atual) + '">' +
        '<span class="perf-tema-amostra ' + a.id + '" aria-hidden="true">' +
          "<i></i><i></i><i></i></span>" +
        "<b>" + escapar(a.nome) + "</b></button>";
    }).join("") + "</div>";

    alvo.innerHTML =
      cartao("Módulos do menu",
        "Telas que você pode desligar se não usa. Desligar esconde do menu e não " +
        "apaga nada: o que já foi registrado continua lá, e volta quando você religar.",
        modulos) +
      cartao("Aparência",
        "Como o app é exibido. A escolha fica salva neste navegador &mdash; é " +
        "preferência de quem olha a tela, não um dado da clínica.",
        aparencia);
  }

  /* ========================================================= ABA: CONTA === */

  function painelConta() {
    var alvo = document.getElementById("painel-conta");
    var b = banco();
    var r = b ? b.resumo() : {};
    var onde = b ? b.onde : "neste navegador";

    var linhas = [
      { n: r.pacientes || 0, r: (r.pacientes === 1 ? "paciente" : "pacientes") },
      { n: r.holoscope || 0, r: "mapas guardados" },
      { n: (r.oq3 || 0) + (r.pqq || 0), r: "formulários" },
      { n: "—", r: "arquivos", id: "conta-arquivos" }
    ];

    var dados =
      '<p class="perf-onde">Tudo o que você registrou está <b>' + escapar(onde) +
        "</b>. Não há servidor no meio: nada sai daqui sozinho, e nada chega " +
        "de outro computador.</p>" +
      '<div class="dash-numeros">' + linhas.map(function (l) {
        return '<div class="dash-tile"' + (l.id ? ' id="' + l.id + '"' : "") + "><b>" +
          escapar(l.n) + "</b><span>" + escapar(l.r) + "</span></div>";
      }).join("") + "</div>" +
      '<p class="perf-ajuda">Isso quer dizer duas coisas ao mesmo tempo: os dados dos ' +
      "seus pacientes não estão expostos em lugar nenhum, e ninguém faz cópia deles " +
      "por você. Limpar os dados do navegador apaga tudo. <b>Exporte de vez em quando.</b></p>" +
      '<p class="perf-ajuda">O backup completo leva <b>tudo</b>: cadastro, mapas ' +
      "HOLOSCOPE, respostas do questionário, valores de exame, consultas, ferramentas " +
      "aplicadas, seu perfil — e os arquivos (laudos, fotos, sua assinatura). Fica de " +
      "fora só a aparência clara/escura, que é preferência deste navegador.</p>" +
      '<div class="perf-foto-acoes">' +
        '<button type="button" class="btn-verde" id="btn-exportar">Exportar backup completo</button>' +
        '<button type="button" class="perf-botao" id="btn-importar">Importar backup</button>' +
        '<input type="file" id="arq-importar" accept=".json,application/json" class="hidden">' +
      "</div>" +
      '<p class="perf-aviso" id="conta-aviso"></p>';

    var perigo =
      '<p>Apaga os pacientes, os mapas, os formulários e este perfil deste navegador. ' +
      "Os arquivos guardados (exames, laudos, sua assinatura) também vão junto. " +
      "Não dá para desfazer.</p>" +
      '<div class="perf-foto-acoes">' +
        '<button type="button" class="perf-tirar forte" id="btn-apagar-tudo">Apagar todos os dados</button>' +
      "</div>";

    /* Fase 1 do Supabase: a conta existe de verdade agora. Sem campo de nova
       senha ainda — so o que a Fase 1 pediu: quem esta logado, e sair. */
    var usuario = window.HoloAuth && window.HoloAuth.usuarioAtual && window.HoloAuth.usuarioAtual();
    var acesso = usuario
      ? '<p>Você está conectado como <b>' + escapar(usuario.email || "") + "</b>.</p>" +
        '<p class="perf-ajuda">A sessão fica neste navegador. Se for sair de uma máquina ' +
        "compartilhada, encerre a sessão em vez de só fechar a aba.</p>" +
        '<div class="perf-foto-acoes">' +
          '<button type="button" class="perf-tirar" id="btn-sair">Sair da conta</button>' +
        "</div>"
      : '<p>Nenhuma sessão do Supabase ativa neste navegador — normal se você ' +
        "entrou pelo atalho de desenvolvimento local. Fora de localhost, isto " +
        "deveria ter te levado para a tela de entrada.</p>";

    alvo.innerHTML =
      cartao("Onde ficam os seus dados", "", dados) +
      cartao("Acesso", "", acesso) +
      cartao("Apagar tudo", "", perigo);

    if (window.ArquivoStore && window.ArquivoStore.listarTudo) {
      window.ArquivoStore.listarTudo().then(function (itens) {
        var el = document.getElementById("conta-arquivos");
        if (el) el.querySelector("b").textContent = itens.length;
      });
    }
  }

  /* ---------- exportar e importar -----------------------------------------

     O BOTAO PASSOU A CHAMAR O BACKUP V2.

     Ate aqui, "Exportar" chamava DadosLocais.exportar(), que empacota as OITO
     tabelas da fachada e mais nada. Ficavam de fora quatro armazenamentos que
     ninguem consegue regerar — as respostas do questionario, a serie historica
     de mapas, os valores de exame — e TODOS os arquivos do IndexedDB: laudo em
     PDF, foto de exame, a assinatura da nutricionista. Um backup que nao leva
     isso nao e um backup incompleto: e um backup que mente, porque a pessoa
     guarda o arquivo achando que guardou o prontuario.

     O motor V2 ja existia inteiro em armazenamento.js, validar-backup.js,
     restaurar-backup.js e importar-v1.js — com hash canonico, snapshot,
     rollback, verificacao pos-escrita e recuperacao pos-crash. O que faltava
     era so o fio ate o botao. Esta rodada e o fio. Nenhuma linha do motor
     mudou.

     DadosLocais.exportar() continua existindo: dados.js e a fachada, e outras
     coisas dependem dela. O que deixou de existir e trata-la como backup. */

  function armaz() { return window.Armazenamento || null; }

  function exportar() {
    var A = armaz();
    if (!A || !A.gerarBackupV2) {
      contaAviso("O módulo de backup não carregou. Recarregue a página.", true);
      return;
    }
    var botao = document.getElementById("btn-exportar");
    if (botao) botao.disabled = true;
    contaAviso("Gerando o backup completo — os arquivos entram junto, pode demorar.");

    /* gerarBackupV2 le as 12 caixas exportaveis MAIS os documentos do
       IndexedDB, calcula o sha256 do conteudo canonico e devolve o pacote. */
    A.gerarBackupV2().then(function (pacote) {
      var r = A.baixarBackupV2(pacote);
      var docs = (pacote.conteudo.arquivos || []).length;
      var mb = (r.bytes / 1048576).toFixed(1);
      contaAviso("Backup completo gerado: " + pacote.armazenamentos.length +
                 " armazenamentos e " + docs + (docs === 1 ? " documento" : " documentos") +
                 " · " + mb + " MB. Guarde o arquivo fora deste computador.");
    }).catch(function (e) {
      /* O gerador e ESTRITO com o IndexedDB de proposito: se a leitura dos
         documentos falhar, ele rejeita em vez de entregar um pacote que diz
         "zero documentos" com alegria. Aqui isso vira recusa visivel — nunca
         um download pela metade. */
      contaAviso("O backup NÃO foi gerado: " + (e && e.message ? e.message : "falha ao ler os arquivos") +
                 ". Nada foi salvo — tente de novo.", true);
    }).then(function () {
      if (botao) botao.disabled = false;
    });
  }

  /* Os quatro grupos que um V1 nunca carregou, em portugues de gente. */
  var NOME_CAIXA = {
    questionario: "as respostas do questionário",
    pontuacao: "o histórico de mapas HOLOSCOPE",
    exames: "os valores de exame",
    arquivos: "os arquivos (laudos, fotos, assinatura)"
  };
  function listarCaixas(ids) {
    return (ids || []).map(function (id) { return NOME_CAIXA[id] || id; }).join(", ");
  }

  function importar(arquivo) {
    var A = armaz();
    if (!A || !A.reconhecerBackup) {
      contaAviso("O módulo de backup não carregou. Recarregue a página.", true);
      return;
    }
    var leitor = new FileReader();
    leitor.onerror = function () {
      contaAviso("Não foi possível ler o arquivo do disco.", true);
    };
    leitor.onload = function () {
      var pacote;
      try { pacote = JSON.parse(leitor.result); }
      catch (e) { contaAviso("Esse arquivo não é um backup do HoloHacking.", true); return; }

      var qual = A.reconhecerBackup(pacote);
      if (qual.tipo === "v2") return importarV2(pacote);
      if (qual.tipo === "v1_legado") return importarV1(pacote);
      contaAviso("Esse arquivo não é um backup do HoloHacking: " + qual.porque, true);
    };
    leitor.readAsText(arquivo);
  }

  /** V2: valida, simula, mostra o que vai ser substituido, e so entao aplica. */
  function importarV2(pacote) {
    var A = armaz();
    contaAviso("Conferindo o arquivo...");
    /* O DRY-RUN e obrigatorio, nao cortesia: e a unica chance de a pessoa ver
       o tamanho do que vai ser substituido ANTES de perder o que tem. Ele nao
       escreve nada — simularImportacaoV2 devolve escreveu:false sempre. */
    A.simularImportacaoV2(pacote).then(function (sim) {
      if (!sim.valido) {
        contaAviso("Backup inválido — NADA foi alterado. " +
                   primeiroErro(sim) , true);
        return;
      }
      var linhas = sim.substituidos.map(function (s) {
        return "  · " + (NOME_CAIXA[s.id] || s.id) + ": " + s.registros;
      }).join("\n");
      var alerta = sim.orfaos > 0
        ? "\n\nAVISO: o pacote traz " + sim.registros_orfaos + " registro(s) de " +
          "paciente que não existe mais no cadastro. Eles serão restaurados assim mesmo."
        : "";
      if (!confirm("Restaurar SUBSTITUI tudo o que está neste navegador.\n\n" +
                   "O backup traz:\n" + linhas + "\n  · " + sim.documentos + " documento(s)" +
                   alerta + "\n\nSe algo falhar no meio, o estado anterior é restaurado " +
                   "automaticamente.\n\nContinuar?")) {
        contaAviso("Importação cancelada. Nada foi alterado.");
        return;
      }
      aplicar(A.aplicarBackupV2(pacote));
    }).catch(function (e) {
      contaAviso("Não foi possível conferir o arquivo: " + descrever(e) +
                 ". Nada foi alterado.", true);
    });
  }

  /** V1 legado: restauracao PARCIAL, e o motor exige confirmacao explicita. */
  function importarV1(pacote) {
    var A = armaz();
    contaAviso("Conferindo o arquivo...");
    var plano;
    try { plano = A.planejarImportacaoV1(pacote); }
    catch (e) { contaAviso("Não foi possível ler esse backup antigo: " + descrever(e), true); return; }

    if (!plano.valido) {
      contaAviso("Backup antigo inválido — NADA foi alterado.", true);
      return;
    }
    /* A API recusa sem confirmarRestauracaoParcial:true justamente para que
       esta frase exista. Nao e burocracia: o V1 nunca guardou estes quatro
       grupos, e restaurar um V1 ESVAZIA o que houver deles aqui. */
    if (!confirm("Este é um BACKUP PARCIAL LEGADO (formato antigo).\n\n" +
                 "Ele traz: " + plano.pacientes + " paciente(s), " +
                 plano.consultas + " consulta(s), " + plano.aplicacoes + " aplicação(ões).\n\n" +
                 "Ele NÃO contém " + listarCaixas(plano.limpa_por_ausencia_no_formato) +
                 ".\nRestaurar APAGA esses grupos deste navegador — não porque o backup " +
                 "disse que estão vazios, mas porque o formato antigo nunca os guardou.\n\n" +
                 "Continuar mesmo assim?")) {
      contaAviso("Importação cancelada. Nada foi alterado.");
      return;
    }
    aplicar(A.aplicarBackupV1(pacote, { confirmarRestauracaoParcial: true }));
  }

  /** O desfecho, igual para os dois formatos: o V1 passa pelo motor do V2. */
  function aplicar(promessa) {
    contaAviso("Restaurando — não feche esta aba.");
    promessa.then(function (r) {
      if (r.aplicado) {
        contaAviso("Restaurado: " + (r.armazenamentos || []).length + " armazenamentos e " +
                   (r.documentos || 0) + " documento(s). Recarregando...");
        /* O motor diz precisa_recarregar: as telas em memoria nao sabem que o
           disco inteiro mudou embaixo delas. */
        if (r.precisa_recarregar) setTimeout(function () { location.reload(); }, 1200);
        return;
      }
      if (r.revertido) {
        contaAviso("A restauração falhou no meio e o estado anterior foi DEVOLVIDO por " +
                   "completo. Seus dados continuam como estavam.", true);
        return;
      }
      contaAviso(explicarRecusa(r), true);
    }).catch(function (e) {
      contaAviso("A restauração não pôde ser concluída: " + descrever(e), true);
    });
  }

  /** Por que o motor recusou — em vez de "erro". Cada motivo tem uma saida. */
  function explicarRecusa(r) {
    var nada = " NADA foi alterado.";
    switch (r.motivo) {
      case "RECUPERACAO_PENDENTE":
        return "Há uma restauração anterior que não terminou neste navegador. " +
               "Recupere-a antes de restaurar outra coisa." + nada;
      case "ESTADO_DESATUALIZADO":
        return "Outra aba do HoloHacking escreveu enquanto esta esperava. " +
               "Feche as outras abas e tente de novo." + nada;
      case "PACOTE_INVALIDO":
        return "O arquivo não passou na verificação de integridade." + nada;
      case "FALHA_ANTES_DO_SNAPSHOT":
        return "A restauração parou antes de começar a escrever." + nada;
      case "RECUPERACAO_MANUAL_NECESSARIA":
        return "A restauração falhou E a volta automática também falhou. " +
               "NÃO feche esta aba: use a recuperação pendente.";
      default:
        return "A restauração não foi aplicada" +
               (r.motivo ? " (" + r.motivo + ")" : "") + "." + nada;
    }
  }

  function primeiroErro(sim) {
    var e = (sim.erros || [])[0];
    return e ? (e.codigo + (e.onde ? " em " + e.onde : "")) : "";
  }
  function descrever(e) {
    return (e && e.message) ? e.message : String(e);
  }

  /* Encerra a sessao Supabase de verdade (auth.signOut). login.js escuta
     onAuthStateChange e bloqueia o app sozinho quando o evento chega — esta
     funcao nao mexe em tela nenhuma diretamente. */
  function sair() {
    if (!window.HoloAuth) return;
    window.HoloAuth.sair();
  }

  function apagarTudo() {
    var frase = "APAGAR";
    var dito = prompt("Isto apaga tudo deste navegador e não dá para desfazer.\n\n" +
                      'Escreva ' + frase + " para confirmar:");
    if (dito !== frase) { contaAviso("Nada foi apagado."); return; }
    /* O que vem abaixo e exatamente o que ja acontecia; o que muda e o
       envelope. Se outra aba estiver restaurando, esta espera a vez — e se o
       navegador nao tiver Web Locks, nao ha exclusividade honesta a oferecer,
       entao segue como sempre seguiu, que e o comportamento que ja existia. */
    var C = window.Concorrencia;
    var comProtecao = (C && C.temWebLocks())
      ? function (fn) { return C.comExclusividade("apagar_tudo", fn); }
      : function (fn) { return Promise.resolve().then(fn); };

    /* HA UMA RECUPERACAO PENDENTE?

       Apagar tudo e a unica operacao que pode seguir mesmo assim, e a razao e
       simples: ela nao precisa do estado anterior para nada — vai destruir o
       estado anterior de qualquer jeito. Recuperar antes seria restaurar um
       dado para apaga-lo no segundo seguinte.

       O que NAO pode acontecer e apagar o marcador e seguir em silencio, como
       se a pendencia nunca tivesse existido: a pessoa precisa saber que havia
       uma restauracao pela metade. Entao o aviso e explicito, o marcador e o
       banco operacional saem JUNTO com o resto, e so no fim. */
    var pendente = C && C.lerMarcador();
    if (pendente) {
      contaAviso("Havia uma restauração incompleta neste navegador. " +
                 "Apagar tudo remove também o que ela tinha guardado para " +
                 "poder desfazer — não haverá como recuperar depois.");
    }

    comProtecao(function () { return apagarTudoAgora(); });
  }

  function apagarTudoAgora() {
    banco().apagarTudo();
    var limpar = [];
    if (window.ArquivoStore && window.ArquivoStore.listarTudo) {
      limpar.push(window.ArquivoStore.listarTudo().then(function (itens) {
        return Promise.all(itens.map(function (i) {
          return window.ArquivoStore.remover(i.id).catch(function () {});
        }));
      }));
    }
    ["holohacking.pontuacao", "holohacking.questionario", "holohacking.ferramentas",
     "holohacking.exames", "holohacking.agenda", "holohacking.aparencia"].forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) { /* idem */ }
    });
    /* O banco de recuperacao guarda uma copia inteira do estado enquanto uma
       restauracao acontece — dado clinico, portanto. Se uma operacao tiver
       sido interrompida, ele ainda esta la. "Apagar tudo" tem que alcanca-lo,
       senao volta a ficar incompleto como estava antes do P0.2. */
    if (window.Armazenamento && window.Armazenamento.limparRecuperacao) {
      limpar.push(window.Armazenamento.limparRecuperacao());
    }
    /* A revisao e o anuncio tambem sao operacionais e tambem vao embora. A
       limpeza vem por ultimo: enquanto as outras chaves somem, a revisao ainda
       serve para avisar as outras abas do que esta acontecendo. */
    return Promise.all(limpar).then(function () {
      if (window.Concorrencia) window.Concorrencia.limpar();
      location.reload();
    });
  }

  function contaAviso(texto, ruim) {
    var el = document.getElementById("conta-aviso");
    if (!el) { if (window.avisar) window.avisar(texto); return; }
    el.textContent = texto;
    el.className = ruim ? "perf-aviso ruim" : "perf-aviso";
  }

  /* ---------- desenhar e ligar -------------------------------------------- */

  function desenhar() {
    if (!document.getElementById("painel-perfil")) return;
    desenharCompletude();
    painelPerfil();
    painelMarca();
    painelPrefs();
    painelConta();
    desenharRodape();
    aplicarModulos();
    ligar();
  }

  function trocarAba(qual) {
    aba = qual;
    document.querySelectorAll("[data-aba-perfil]").forEach(function (b) {
      var meu = b.dataset.abaPerfil === qual;
      b.classList.toggle("ativa", meu);
      b.setAttribute("aria-selected", meu ? "true" : "false");
    });
    ["perfil", "marca", "prefs", "conta"].forEach(function (n) {
      document.getElementById("painel-" + n).classList.toggle("hidden", n !== qual);
    });
  }

  var ligado = false;

  function ligar() {
    if (ligado) return;
    ligado = true;

    document.querySelectorAll("[data-aba-perfil]").forEach(function (b) {
      b.addEventListener("click", function () { trocarAba(b.dataset.abaPerfil); });
    });

    var secao = document.getElementById("secao-perfil");

    secao.addEventListener("click", function (ev) {
      var enviar = ev.target.closest("[data-enviar]");
      if (enviar) { pedirArquivo(enviar.dataset.enviar); return; }

      var tirar = ev.target.closest("[data-tirar]");
      if (tirar) { tirarImagem(tirar.dataset.tirar); return; }

      var chave = ev.target.closest("[data-modulo]");
      if (chave) {
        var id = chave.dataset.modulo;
        perfil.modulos[id] = perfil.modulos[id] === false;
        salvar(perfil.modulos[id] ? "Módulo ativado." : "Módulo desativado.")
          .then(function () { painelPrefs(); });
        return;
      }

      var tema = ev.target.closest("[data-aparencia]");
      if (tema) {
        if (window.definirAparencia) window.definirAparencia(tema.dataset.aparencia);
        painelPrefs();
        return;
      }

      if (ev.target.closest("#btn-salvar-perfil")) {
        lerFormulario();
        salvar("Perfil salvo.").then(function () { desenharCompletude(); painelMarca(); });
        aviso("");
        return;
      }
      if (ev.target.closest("#btn-salvar-marca")) {
        salvar("Marca salva.");
        return;
      }
      if (ev.target.closest("#btn-desenhar")) {
        desenhando = true;
        painelMarca();
        return;
      }
      if (ev.target.closest("#btn-exportar")) { exportar(); return; }
      if (ev.target.closest("#btn-importar")) {
        document.getElementById("arq-importar").click();
        return;
      }
      if (ev.target.closest("#btn-apagar-tudo")) { apagarTudo(); return; }
      if (ev.target.closest("#btn-sair")) { sair(); return; }
    });

    // as cores andam em par: mexer no seletor escreve no texto, e vice-versa
    secao.addEventListener("input", function (ev) {
      var alvo = ev.target;
      ["cor_primaria", "cor_secundaria"].forEach(function (c) {
        if (alvo.id === "pf-" + c) {
          perfil[c] = alvo.value;
          document.getElementById("pf-" + c + "-texto").value = alvo.value;
          atualizarPrevia();
        } else if (alvo.id === "pf-" + c + "-texto") {
          var v = alvo.value.trim();
          if (/^#[0-9a-fA-F]{6}$/.test(v)) {
            perfil[c] = v;
            document.getElementById("pf-" + c).value = v;
            atualizarPrevia();
          }
        }
      });
    });

    secao.addEventListener("change", function (ev) {
      if (ev.target.id === "arq-importar" && ev.target.files[0]) {
        importar(ev.target.files[0]);
        ev.target.value = "";
      }
    });
  }

  function atualizarPrevia() {
    var pv = document.querySelector(".perf-previa");
    if (!pv) return;
    pv.style.setProperty("--p", perfil.cor_primaria);
    pv.style.setProperty("--s", perfil.cor_secundaria);
  }

  /** Um <input type=file> descartavel: mais simples do que manter quatro no
      HTML, um por campo, e sem risco de o arquivo de um cair no outro. */
  function pedirArquivo(campo) {
    var tipos = { foto_id: "Foto", logo_id: "Logo",
                  assinatura_id: "Assinatura", carimbo_id: "Carimbo" };
    var entrada = document.createElement("input");
    entrada.type = "file";
    entrada.accept = "image/png,image/jpeg,image/webp,image/svg+xml";
    entrada.addEventListener("change", function () {
      var arq = entrada.files[0];
      if (!arq) return;
      if (arq.size > 4 * 1024 * 1024) {
        aviso("Imagem muito grande (máximo 4 MB).", true);
        return;
      }
      guardarImagem(campo, arq, tipos[campo] || "Imagem");
    });
    entrada.click();
  }

  /* ---------- o que o relatorio precisa saber ------------------------------ */

  /** O perfil, para quem monta documento. Devolve sempre um objeto: quem
      imprime nao pode ter que checar se o perfil existe. */
  window.PerfilProfissional = {
    dados: function () { return Object.assign({}, PADRAO, perfil || {}); },
    imagem: urlDe,
    modulo: function (id) {
      return !perfil || perfil.modulos[id] !== false;
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    carregar().then(function () {
      desenhar();
      trocarAba(aba);
      /* a aba Conta le window.HoloAuth.usuarioAtual() — que so tem valor de
         verdade depois que getSession() resolve. Sem isto, um refresh com
         sessao restaurada desenhava a aba antes da sessao ser conhecida, e
         o botao "Sair da conta" nunca aparecia ate a pessoa trocar de aba
         na mao. aoMudarEstado ja avisa na hora se o estado ja resolveu. */
      if (window.HoloAuth && window.HoloAuth.aoMudarEstado) {
        window.HoloAuth.aoMudarEstado(function (estado) {
          if (estado !== "pendente") window.redesenharPerfil();
        });
      }
    });
  });

  window.redesenharPerfil = function () {
    if (perfil) { desenhar(); trocarAba(aba); }
  };
})();
