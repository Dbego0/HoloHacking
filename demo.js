/* ===========================================================================
   MODO DEMONSTRACAO — roteiro para evento, 3 minutos
   ===========================================================================

   So liga com ?demo=1 na URL. Sem isso este arquivo nao faz nada.

   Diferenca para a versao anterior: quase tudo virou PRODUTO DE VERDADE.
   Quando o primeiro video foi gravado, metade das cenas era maquete. Hoje o
   questionario, o mapa, a Triada, a leitura combinada, a indicacao de
   ferramenta, os exames, o relatorio e a ficha sao o app rodando.

   AINDA E MAQUETE, e so isto:
     . as telas de texto da abertura e do fecho

   A comparacao 4/8/12 semanas deixou de ser maquete: o app passou a guardar
   o historico, e a evolucao que aparece no video e a tela de verdade, com o
   ganho calculado pelo motor a partir das respostas da segunda aplicacao.

   A demo e deterministica: DEMO.irPara(t) desenha o estado exato no segundo t.
   preparar() monta o estado do paciente de uma vez, para que cada cena so
   precise navegar — nenhuma cena depende de outra ter rodado antes.
   =========================================================================== */

(function () {
  "use strict";
  if (!/[?&]demo=1/.test(location.search)) return;

  /* ---------------------------------------------------------------- palco */

  var palco = document.createElement("div");
  palco.id = "palco-demo";
  palco.innerHTML = '<div class="palco-painel"></div>' +
                    '<div class="palco-veu"></div>' +
                    '<div class="palco-legenda"><span></span></div>';
  document.body.appendChild(palco);

  var painel = palco.querySelector(".palco-painel");
  var veu = palco.querySelector(".palco-veu");
  var legenda = palco.querySelector(".palco-legenda");
  var legendaTxt = legenda.querySelector("span");

  var estilo = document.createElement("style");
  estilo.textContent = [
    "#palco-demo{position:fixed;inset:0;z-index:9000;pointer-events:none;font-family:var(--fonte-corpo)}",
    ".palco-painel{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;",
    "  background:var(--verde-noite,#06231a);opacity:0}",
    ".palco-painel.on{opacity:1}",
    ".palco-veu{position:absolute;inset:0;background:#04160f;opacity:0}",
    ".palco-legenda{position:absolute;left:0;right:0;bottom:0;padding:38px 60px 42px;",
    "  background:linear-gradient(transparent,rgba(6,35,26,.93) 45%);text-align:center}",
    ".palco-legenda span{display:inline-block;color:#f4efe3;font-size:1.18rem;font-weight:400;",
    "  line-height:1.5;max-width:40ch;letter-spacing:.16em;text-transform:uppercase;",
    "  color:var(--dourado);text-shadow:0 2px 20px rgba(0,0,0,.75)}",
    /* nos tres momentos a frase e a cena: cresce, perde o caixa-alta, e a
       locucao cala. Sem isso, ler e ouvir competem e a pessoa perde os dois. */
    /* sem um fundo forte a frase fica ilegivel: o conteudo do app aparece
       atras dela. No momento, a tela escurece quase toda e a frase manda. */
    ".palco-legenda.momento{inset:0;display:flex;align-items:center;",
    "  justify-content:center;padding:0 60px;",
    "  background:radial-gradient(ellipse 90% 70% at 50% 50%,",
    "    rgba(6,35,26,.97) 30%, rgba(6,35,26,.86) 70%, rgba(6,35,26,.72))}",
    ".palco-legenda.momento span{font-family:var(--fonte-display);font-size:2.5rem;",
    "  font-weight:300;letter-spacing:normal;text-transform:none;color:#f4efe3;",
    "  max-width:26ch;line-height:1.36}",

    ".cena{width:min(880px,88vw);color:#ede8da;text-align:center}",
    ".t-linha{font-family:var(--fonte-display);font-size:2.5rem;font-weight:300;line-height:1.42;",
    "  color:#f4efe3;margin:0 0 26px;opacity:0}",
    ".t-linha.forte{color:var(--dourado)}",

    ".cena-capa{text-align:center}",
    ".cena-capa .apresenta{font-size:.66rem;letter-spacing:.44em;text-transform:uppercase;",
    "  color:var(--dourado);display:block;margin-bottom:34px}",
    ".cena-capa h1{font-family:var(--fonte-display);font-size:3.4rem;font-weight:600;",
    "  color:#f4efe3;letter-spacing:.02em;margin:24px 0 12px}",
    ".cena-capa p{font-size:.7rem;letter-spacing:.32em;text-transform:uppercase;color:var(--dourado)}",
    ".cena-capa p.f-frase{font-family:var(--fonte-display);font-size:2.2rem;font-weight:300;",
    "  line-height:1.42;letter-spacing:normal;text-transform:none;color:var(--dourado);margin:0 0 46px}",

    ".d-pergunta{font-family:var(--fonte-display);font-size:2.75rem;font-weight:300;",
    "  line-height:1.36;color:#f4efe3;max-width:20ch;margin:0 auto}",

    ".d-pergunta em{font-style:normal;color:var(--dourado)}",

    /* O app trava o conteudo em 1080px e centra. Numa tela 21:9 isso deixa
       faixas vazias dos dois lados. So na demo, e so quando a tela e mesmo
       larga, o conteudo se alarga para acompanhar — o produto nao muda. */
    "@media (min-aspect-ratio: 2/1){",
    "  .conteudo{max-width:1560px;padding-left:56px;padding-right:56px}",
    "  .secao-cabeca{max-width:1000px}",
    "  .holo-resultado{gap:56px}",
    "}"
  ].join("\n");
  document.head.appendChild(estilo);

  /* --------------------------------------------------------------- ajudas */

  function mostrarPainel(l) { painel.classList.toggle("on", !!l); }
  function irSecao(n) {
    var b = document.querySelector('.nav-item[data-secao="' + n + '"]');
    if (b) b.click();
  }
  function suave(p, a, b) {
    if (p <= a) return 0;
    if (p >= b) return 1;
    var x = (p - a) / (b - a);
    return x * x * (3 - 2 * x);
  }
  function pulso(p, a, b, c, d) { return suave(p, a, b) * (1 - suave(p, c, d)); }

  /**
   * Rolagem continua. Antes ela ia de ZERO ate o alvo, entao toda cena nova
   * pulava de volta ao topo da pagina e descia de novo — parecia outro take.
   * Agora parte de onde a pagina esta e segue para o alvo: a tela do HOLOSCOPE
   * vira uma descida so, do radar ate a conduta.
   */
  /**
   * Rolagem de velocidade quase constante: acelera na primeira fracao, anda
   * parelho no meio, freia no fim. A curva "suave" que servia as opacidades
   * acelerava no miolo e chegava a 1,5x a velocidade media — e e velocidade
   * de pico que borra o texto na compressao. Esta fica em 1,22x.
   *
   * As tres partes se encontram no mesmo valor: sem isso a pagina daria um
   * salto na emenda, que foi o que aconteceu na primeira tentativa.
   */
  function andar(p, ini, fim) {
    var x = Math.max(0, Math.min(1, (p - ini) / (fim - ini)));
    var B = 0.18;                 // fracao gasta acelerando e freando
    var v = 1 / (1 - B);          // velocidade do trecho parelho
    if (x < B) return v * x * x / (2 * B);
    if (x > 1 - B) { var y = 1 - x; return 1 - v * y * y / (2 * B); }
    return v * (B / 2 + (x - B));
  }

  function rolarAte(sel, p, ini, fim) {
    var el = document.querySelector(sel);
    if (!el) return;
    if (palco.dataset.rolSel !== sel) {
      palco.dataset.rolSel = sel;
      palco.dataset.rolBase = window.scrollY;
    }
    var base = Number(palco.dataset.rolBase) || 0;
    var c = el.getBoundingClientRect();
    var alvo = Math.max(0, c.top + window.scrollY - (window.innerHeight - c.height) / 2);
    window.scrollTo(0, base + (alvo - base) * andar(p, ini, fim));
  }
  function telaTexto(linhas) {
    return '<div class="cena">' + linhas.map(function (l) {
      return '<p class="t-linha' + (l[1] ? " forte" : "") + '">' + l[0] + "</p>";
    }).join("") + "</div>";
  }
  function animarLinhas(p, ini, passo) {
    painel.querySelectorAll(".t-linha").forEach(function (el, i) {
      el.style.opacity = suave(p, ini + i * passo, ini + i * passo + .16);
    });
  }
  function umaVez(chave, cond, acao) {
    if (cond && palco.dataset[chave] !== "1") { palco.dataset[chave] = "1"; acao(); }
    if (!cond) delete palco.dataset[chave];
  }

  /* --------------------------------------------- o caso da Marina */

  /* O caso inteiro vive em caso-marina.js: as respostas das duas aplicacoes,
     as ferramentas que ela preencheu, os exames e os documentos. Aqui so se
     escolhe QUAL momento mostrar. */

  function limparPacientesReais() {
    document.querySelectorAll(".seletor-paciente").forEach(function (s) {
      s.innerHTML = '<option value="_sem_paciente">Marina Alves</option>';
    });
    var fn = document.getElementById("ficha-nome");
    if (fn) fn.textContent = "Marina Alves";
    var fa = document.getElementById("ficha-avatar");
    if (fa) fa.textContent = "M";
    var fm = document.getElementById("ficha-meta");
    if (fm) fm.textContent = "34 anos · cinco dietas anteriores";
    var fq = document.getElementById("ficha-queixa");
    if (fq && !fq.dataset.demo) {
      fq.dataset.demo = "1";
      fq.classList.remove("vazio");
      fq.textContent = "Compulsão por doce à noite. Já fez cinco dietas — " +
                       "todas funcionaram por três semanas.";
    }
  }

  /** Abre a ficha do paciente: e onde exames, documentos e relatorio moram. */
  function abrirFicha() {
    irSecao("pacientes");
    var lista = document.getElementById("vista-lista-pacientes");
    var ficha = document.getElementById("vista-ficha");
    if (lista && ficha) { lista.classList.add("hidden"); ficha.classList.remove("hidden"); }
    if (window.redesenharFicha) window.redesenharFicha();
  }

  /** So a primeira aplicacao: e o que a maior parte do video mostra. */
  function prepararPrimeira() {
    if (!window.CasoMarina) return;
    window.CasoMarina.montar(false);
    limparPacientesReais();
    window.CasoMarina.mostrar(0);
  }

  /** As duas: a cena da evolucao precisa do historico completo. */
  function prepararEvolucao() {
    if (!window.CasoMarina) return;
    window.CasoMarina.montar(true);
    limparPacientesReais();
    window.CasoMarina.mostrar(1);
  }

  var DESTAQUE = [
    "Você come depois do jantar mesmo sem fome real?",
    "Você costuma aceitar o que não quer para evitar conflito?",
    "Existe alguma mágoa que você carrega há anos?"
  ];

  /** Uma cena de galeria por modulo: os cards reais, com nome e descricao. */
  function catalogo(modulo, titulo, total) {
    return {
      dur: 10,
      legenda: titulo + " · " + total + " ferramentas",
      entrar: function () {
        mostrarPainel(false);
        irSecao(modulo);
        window.scrollTo(0, 0);
      },
      quadro: function (p) { window.scrollTo(0, 360 * andar(p, .18, .96)); }
    };
  }

  /* ---------------------------------------------------------------- cenas */

  var CENAS = [

    /* 1 — Holos Company apresenta */
    { dur: 6, legenda: "",
      entrar: function () {
        mostrarPainel(true);
        painel.innerHTML =
          '<div class="cena-capa">' +
          '<span class="apresenta">Holos Company apresenta</span>' +
          '<svg width="104" height="97" viewBox="0 0 64 60" style="color:var(--dourado)">' +
          '<use href="#logo-simbolo"/></svg>' +
          "<h1>HoloHacking</h1>" +
          "<p>Plataforma clínica da Nutrição Holística</p></div>";
      },
      quadro: function (p) {
        painel.firstChild.style.opacity = suave(p, .04, .32) * (1 - suave(p, .9, 1));
      } },

    /* 2 — a dor dela: momento, a voz cala e a tela conta */
    { dur: 10, momento: true, legenda: "",
      entrar: function () {
        mostrarPainel(true);
        painel.innerHTML = telaTexto([
          ["Marina já fez cinco dietas.", 0],
          ["Todas funcionaram por três semanas.", 0],
          ["Ela acha que o problema é ela.", 1]
        ]);
      },
      quadro: function (p) { animarLinhas(p, .05, .27); } },

    /* 3 — a dor da nutricionista */
    { dur: 7, legenda: "",
      entrar: function () {
        mostrarPainel(true);
        // a cena anterior falava da Marina; aqui o assunto vira a
        // nutricionista, e isso precisa aparecer — senao o "ela" da locucao
        // fica sem dono e a plateia acha que ainda e a paciente.
        painel.innerHTML = telaTexto([
          ["Do outro lado, a nutricionista.", 0],
          ["Quarenta minutos de anamnese.", 1]
        ]);
      },
      quadro: function (p) { animarLinhas(p, .04, .2); } },

    /* 3 — o questionario, respondendo de verdade */
    { dur: 13, legenda: "84 perguntas · 15 minutos",
      entrar: function () {
        mostrarPainel(false);
        try { localStorage.removeItem("holohacking.questionario"); } catch (e) {}
        irSecao("holoscope");
        window.scrollTo(0, 0);
        var b = document.getElementById("btn-abrir-questionario");
        if (b) b.click();
      },
      quadro: function (p) {
        var itens = document.querySelectorAll(".q-item");
        var quantas = Math.floor(suave(p, .08, .9) * 12);
        for (var i = 0; i < quantas && i < itens.length; i++) {
          if (!itens[i].querySelector(".q-btn.marcado")) {
            var b = itens[i].querySelectorAll(".q-btn")[i % 2 === 0 ? 3 : 2];
            if (b) b.click();
          }
        }
        window.scrollTo(0, 240 + 520 * andar(p, .2, .96));
      } },

    /* 4 — as perguntas que ninguem faz: em silencio, para pesarem */
    { dur: 9, momento: true, legenda: "",
      entrar: function () {
        mostrarPainel(true);
        painel.innerHTML = '<div class="cena"><div class="d-pergunta"></div></div>';
      },
      quadro: function (p) {
        var i = Math.min(2, Math.floor(p * 3)), loc = p * 3 - i;
        var el = painel.querySelector(".d-pergunta");
        el.textContent = DESTAQUE[i];
        el.style.opacity = pulso(loc, 0, .22, .8, 1);
      } },

    /* 5 — o mapa, app de verdade */
    { dur: 13, legenda: "5 sistemas · Índice HOLOS",
      entrar: function () {
        mostrarPainel(false);
        irSecao("holoscope");
        window.scrollTo(0, 0);
        var sel = document.getElementById("sel-holoscope");
        if (sel) sel.innerHTML = "<option>Marina Alves</option>";
        var av = document.querySelector("#secao-holoscope .aviso");
        if (av) av.textContent = "Primeira aplicação";
        prepararPrimeira();
      },
      quadro: function (p) { rolarAte("#radar-svg", p, .12, .6); } },

    /* 6 — a Triada, app de verdade */
    { dur: 9, continua: true, legenda: "Triada HOLOS",
      entrar: function () { mostrarPainel(false); },
      quadro: function (p) { rolarAte("#holo-triada", p, .05, .55); } },

    /* 7 — a virada, app de verdade */
    { dur: 9, continua: true, momento: true, legenda: "Não era disciplina. Era terreno.",
      entrar: function () { mostrarPainel(false); },
      quadro: function (p) { rolarAte(".leitura-combinada", p, .05, .5); } },

    /* 8 — por onde comecar, app de verdade */
    { dur: 8, continua: true, legenda: "Por onde começar",
      entrar: function () { mostrarPainel(false); },
      quadro: function (p) { rolarAte(".leitura-conduta", p, .05, .5); } },

    /* 9 — a ferramenta abre, app de verdade */
    { dur: 10, legenda: "Ferramenta indicada",
      entrar: function () { mostrarPainel(false); delete palco.dataset.abriu; },
      quadro: function (p) {
        umaVez("abriu", p > .1, function () {
          var b = document.querySelector("[data-abrir]");
          if (b) b.click();
        });
        window.scrollTo(0, 0);
      } },

    /* 10, 11, 12 — o catalogo dos tres modulos */
    catalogo("corpo", "Corpo", 2),
    catalogo("mente", "Mente", 2),
    catalogo("espirito", "Espírito", 3),

    /* 13 — exames: o confronto, app de verdade */
    { dur: 13, legenda: "Relato × laboratório",
      entrar: function () {
        mostrarPainel(false);
        abrirFicha();
        var a = document.querySelector('[data-aba="exames"]');
        if (a) a.click();
        window.scrollTo(0, 0);
      },
      quadro: function (p) {
        rolarAte("#ex-confronto", p, .15, .6);
      } },

    /* 14 — o relatorio, app de verdade */
    { dur: 12, legenda: "Dois registros",
      entrar: function () {
        mostrarPainel(false);
        var a = document.querySelector('[data-aba="relatorio"]');
        if (a) a.click();
        window.scrollTo(0, 0);
        delete palco.dataset.trocou;
      },
      quadro: function (p) {
        window.scrollTo(0, 420 * andar(p, .08, .62));
        umaVez("trocou", p > .66, function () {
          var b = document.querySelector('[data-registro="paciente"]');
          if (b) b.click();
        });
      } },

    /* 15 — a ficha acusa, app de verdade */
    { dur: 11, legenda: "Ficha do paciente",
      entrar: function () {
        mostrarPainel(false);
        abrirFicha();
        window.scrollTo(0, 0);
      },
      quadro: function (p) { rolarAte(".fic-alertas", p, .08, .45); } },

    /* 16 — a evolucao, agora app de verdade */
    { dur: 12, legenda: "12 semanas depois",
      entrar: function () {
        mostrarPainel(false);
        prepararEvolucao();
        irSecao("holoscope");
        window.scrollTo(0, 0);
      },
      quadro: function (p) {
        if (p > .45) legendaTxt.textContent = "E dá para mostrar isso para ela.";
        rolarAte("#holo-evolucao", p, .1, .55);
      } },

    /* 17 — fecho */
    { dur: 8, legenda: "",
      entrar: function () {
        mostrarPainel(true);
        painel.innerHTML =
          '<div class="cena-capa">' +
          '<p class="f-frase">Quando você enxerga o que está por trás,<br>tudo muda.</p>' +
          '<svg width="92" height="86" viewBox="0 0 64 60" style="color:var(--dourado)">' +
          '<use href="#logo-simbolo"/></svg>' +
          "<h1>HoloHacking</h1><p>Plataforma clínica da Nutrição Holística</p></div>";
      },
      quadro: function (p) { painel.firstChild.style.opacity = suave(p, 0, .3); } }
  ];

  /* ------------------------------------------------------------ transporte */

  var LIMITES = [], acc = 0;
  CENAS.forEach(function (c) { LIMITES.push(acc); acc += c.dur; });
  var DURACAO = acc, MEIO_VEU = .2, atual = -1;

  function irPara(t) {
    t = Math.max(0, Math.min(DURACAO - .001, t));
    var i = 0;
    while (i < CENAS.length - 1 && LIMITES[i + 1] <= t) i++;
    var cena = CENAS[i], p = (t - LIMITES[i]) / cena.dur;

    if (i !== atual) {
      atual = i;
      delete palco.dataset.rolSel;   // a proxima rolagem parte da posicao atual
      cena.entrar();
      legendaTxt.textContent = cena.legenda;
      legenda.style.opacity = cena.legenda ? 1 : 0;
      legenda.classList.toggle("momento", !!cena.momento);
    }
    if (cena.quadro) cena.quadro(p);
    // o app recarrega os seletores quando troca de secao; limpa de novo
    if (!painel.classList.contains("on")) limparPacientesReais();

    // Corte so onde a tela realmente muda. Entre cenas marcadas com
    // continua:true a pagina e a mesma e o movimento e um so — escurecer ali
    // partiria ao meio a descida que a rolagem acabou de costurar.
    var d = Infinity;
    for (var k = 1; k < LIMITES.length; k++) {
      if (CENAS[k].continua) continue;
      d = Math.min(d, Math.abs(t - LIMITES[k]));
    }
    veu.style.opacity = d < MEIO_VEU ? (1 - d / MEIO_VEU).toFixed(3) : 0;
  }

  window.DEMO = { duracao: DURACAO, irPara: irPara, cenas: CENAS.length, limites: LIMITES };

  // O estado do caso e montado assim que o motor esta de pe, e nao dentro de
  // uma cena. Assim DEMO.irPara(120) desenha certo mesmo sem ter passado pelas
  // cenas anteriores — o que importa para conferir um trecho isolado.
  (function esperarMotor(tentativas) {
    if (window.HOLOSCOPE && window.aplicarPontuacao && window.CasoMarina) {
      prepararPrimeira(); return;
    }
    if ((tentativas || 0) > 40) return;
    setTimeout(function () { esperarMotor((tentativas || 0) + 1); }, 50);
  })(0);

  if (!/[?&]passo=1/.test(location.search)) {
    var t0 = Date.now();
    (function laco() {
      irPara(((Date.now() - t0) / 1000) % DURACAO);
      requestAnimationFrame(laco);
    })();
  } else {
    irPara(0);
  }
})();
