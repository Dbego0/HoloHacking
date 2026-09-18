/* ===========================================================================
   LOGIN — a tela de entrada da plataforma
   ===========================================================================

   Autenticacao real via Supabase Auth (signInWithPassword). AuthService
   continua sendo o unico ponto que fala com o mundo — so que agora o corpo
   de entrar() de fato conversa com o Supabase, em vez de devolver
   SEM_SERVIDOR sempre. A View (o resto deste arquivo) nao mudou de forma:
   ainda le { ok, motivo, mensagem } e nao sabe (nem precisa saber) que virou
   uma chamada de rede de verdade.

   A SESSAO
   supabase-js guarda o token em localStorage por conta propria (chave
   sb-<ref>-auth-token) e cuida de renovar sozinho (autoRefreshToken). Este
   arquivo nao le nem escreve esse token — so reage a onAuthStateChange e a
   getSession() no carregamento da pagina.

   A SENHA
   Continua sem sair daqui: vai direto de campoSenha.value para
   signInWithPassword, nunca para localStorage, dataset ou console.

   O BYPASS DE DESENVOLVIMENTO
   So funciona em localhost/127.0.0.1 — tanto na aparencia (o bloco some do
   HTML fora desses hosts) quanto no clique (o handler recusa mesmo que
   alguem reative o botao via devtools). Em producao a unica porta e uma
   sessao Supabase valida.
   =========================================================================== */

(function () {
  "use strict";

  /* ================================================================ AMBIENTE ==
     Onde o atalho de desenvolvimento pode existir. Checado duas vezes: uma
     vez para decidir se o bloco aparece, outra vez dentro do proprio clique
     — a segunda e a que importa de verdade, porque HTML escondido nao
     protege nada de quem abre o devtools. */

  function ambienteLocal() {
    var h = window.location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "";
  }

  /* =========================================================== AUTHSERVICE ==
     A fronteira com o Supabase. Devolve sempre a mesma forma de resposta —
     { ok, motivo, mensagem } — para que a View nunca precise saber se veio
     de uma chamada real ou (nos testes) de um stub. */

  function mensagemDeErro(error) {
    var msg = (error && error.message) || "";
    if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
    if (/email not confirmed/i.test(msg)) return "Esta conta ainda não confirmou o e-mail.";
    if (/too many requests|rate limit/i.test(msg)) return "Muitas tentativas seguidas. Aguarde um instante e tente de novo.";
    return "Não foi possível entrar. Tente novamente.";
  }

  window.AuthService = {
    /* Recebe o que um signInWithPassword receberia: { email, senha,
       manterConectado }. manterConectado viaja junto por compatibilidade,
       mas a sessao do Supabase ja persiste por padrao (persistSession, em
       supabase-client.js) — nao ha um modo "nao lembrar" implementado ainda. */
    entrar: function (credenciais) {
      if (!window.supabaseClient) {
        return Promise.resolve({
          ok: false,
          motivo: "SEM_CLIENTE",
          mensagem: "Autenticação não está configurada neste ambiente."
        });
      }
      return window.supabaseClient.auth
        .signInWithPassword({ email: credenciais.email, password: credenciais.senha })
        .then(function (r) {
          if (r.error) {
            return { ok: false, motivo: r.error.name || "ERRO_AUTH", mensagem: mensagemDeErro(r.error) };
          }
          return { ok: true, motivo: null, mensagem: "", sessao: r.data.session };
        });
    },

    /* Ainda nao entrou nesta fase: exigiria uma pagina que trate o link de
       recuperacao (redirectTo), que nao existe ainda. Dizer isso e melhor do
       que fingir enviar um e-mail que a pessoa nunca vai poder usar. */
    recuperarSenha: function (email) {
      return Promise.resolve({
        ok: false,
        motivo: "NAO_DISPONIVEL",
        mensagem: "A recuperação de senha ainda não está disponível nesta etapa."
      });
    }
  };

  /* =============================================================== HOLOAUTH ==
     O estado de sessao, para quem mais no app precisar saber "existe uma
     pessoa autenticada agora?" sem falar com o Supabase diretamente —
     dados-router.js usa isto para decidir se a tabela `pacientes` vai para o
     Supabase ou continua local. */

  var sessaoAtual = null;   // objeto Session do supabase-js, ou null
  var prontoParaAvisar = false;

  window.HoloAuth = {
    sessaoAtiva: function () { return !!sessaoAtual; },
    usuarioAtual: function () { return sessaoAtual ? sessaoAtual.user : null; },
    sair: function () {
      if (!window.supabaseClient) return Promise.resolve({ ok: false });
      return window.supabaseClient.auth.signOut().then(function (r) {
        return { ok: !r.error, error: r.error || null };
      });
    }
  };

  /* ============================================================= LOGINVIEW ==
     So tela: le campos, valida formato, mostra estado. A decisao de quem
     pode entrar e do Supabase (signInWithPassword + RLS do outro lado) —
     aqui so se reage ao resultado. */

  var form, campoEmail, campoSenha, btnOlho, btnEntrar, areaMensagem,
      erroEmail, erroSenha, linkEsqueci, camada, saidaDev, blocoDev;
  var enviando = false;

  function pareceEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function limparErros() {
    [[campoEmail, erroEmail], [campoSenha, erroSenha]].forEach(function (par) {
      par[0].removeAttribute("aria-invalid");
      par[1].textContent = "";
      par[1].hidden = true;
    });
  }

  function marcarErro(campo, alvo, texto) {
    campo.setAttribute("aria-invalid", "true");
    alvo.textContent = texto;
    alvo.hidden = false;
  }

  function mensagem(texto, tipo) {
    areaMensagem.className = "login-mensagem" + (tipo ? " " + tipo : "");
    areaMensagem.hidden = !texto;
    areaMensagem.textContent = texto || "";
  }

  function validar() {
    limparErros();
    var email = campoEmail.value.trim();
    var senha = campoSenha.value;
    var primeiro = null;

    if (!email) {
      marcarErro(campoEmail, erroEmail, "Informe o e-mail.");
      primeiro = primeiro || campoEmail;
    } else if (!pareceEmail(email)) {
      marcarErro(campoEmail, erroEmail, "Informe um e-mail válido.");
      primeiro = primeiro || campoEmail;
    }
    if (!senha) {
      marcarErro(campoSenha, erroSenha, "Informe a senha.");
      primeiro = primeiro || campoSenha;
    }
    if (primeiro) {
      primeiro.focus();
      return null;
    }
    return { email: email, senha: senha, manterConectado: !!form.manter.checked };
  }

  function carregando(ligado) {
    enviando = ligado;
    btnEntrar.disabled = ligado;
    btnEntrar.setAttribute("aria-busy", ligado ? "true" : "false");
    camada.classList.toggle("enviando", ligado);
  }

  /* ---------- abrir/fechar o app --------------------------------------- */

  function liberarApp() {
    camada.hidden = true;
    document.body.classList.remove("login-aberto");
    document.getElementById("app").removeAttribute("aria-hidden");
  }

  function bloquearApp() {
    camada.hidden = false;
    document.body.classList.add("login-aberto");
    document.getElementById("app").setAttribute("aria-hidden", "true");
    mensagem("", null);
    if (campoSenha) campoSenha.value = "";
    if (campoEmail) campoEmail.focus();
  }

  function aoEnviar(e) {
    e.preventDefault();
    if (enviando) return;

    var credenciais = validar();
    if (!credenciais) {
      mensagem("", null);
      return;
    }

    mensagem("", null);
    carregando(true);

    window.AuthService.entrar(credenciais)
      .then(function (r) {
        if (r.ok) {
          mensagem("", null);
          liberarApp();
        } else {
          mensagem(r.mensagem, "aviso");
        }
      })
      .catch(function () {
        mensagem("Não foi possível falar com o servidor.", "aviso");
      })
      .then(function () {
        carregando(false);
        credenciais = null;
      });
  }

  function alternarSenha() {
    var escondida = campoSenha.type === "password";
    campoSenha.type = escondida ? "text" : "password";
    btnOlho.setAttribute("aria-pressed", escondida ? "true" : "false");
    btnOlho.setAttribute("aria-label", escondida ? "Ocultar senha" : "Mostrar senha");
    btnOlho.classList.toggle("revelada", escondida);
    var fim = campoSenha.value.length;
    campoSenha.focus();
    try { campoSenha.setSelectionRange(fim, fim); } catch (e) { /* type=text nem sempre aceita */ }
  }

  function aoEsquecer(e) {
    e.preventDefault();
    window.AuthService.recuperarSenha(campoEmail.value.trim()).then(function (r) {
      mensagem(r.mensagem, "aviso");
    });
  }

  /* A saida de desenvolvimento. So existe (visivel e funcional) em
     localhost/127.0.0.1 — ambienteLocal() decide os dois. Fora dali o clique
     nao faz nada, mesmo que o bloco seja reexibido via devtools. */
  function sairParaOApp(e) {
    if (e) e.preventDefault();
    if (!ambienteLocal()) return;
    liberarApp();
  }

  /* ---------- sessao: restaurar, reagir a mudanca ----------------------- */

  function verificarSessaoInicial() {
    if (!window.supabaseClient) { campoEmail.focus(); return; }
    window.supabaseClient.auth.getSession().then(function (r) {
      var sessao = r && r.data && r.data.session;
      sessaoAtual = sessao || null;
      prontoParaAvisar = true;
      if (sessao) liberarApp();
      else campoEmail.focus();
    });
  }

  function ligarOuvinteDeSessao() {
    if (!window.supabaseClient) return;
    window.supabaseClient.auth.onAuthStateChange(function (evento, sessao) {
      sessaoAtual = sessao || null;
      if (!prontoParaAvisar) return; // INITIAL_SESSION ja tratado por verificarSessaoInicial
      if (evento === "SIGNED_OUT") {
        bloquearApp();
      } else if (sessao && (evento === "SIGNED_IN" || evento === "TOKEN_REFRESHED" || evento === "USER_UPDATED")) {
        liberarApp();
      }
    });
  }

  function iniciar() {
    camada = document.getElementById("tela-login");
    if (!camada) return;
    form = document.getElementById("form-login");
    campoEmail = document.getElementById("login-email");
    campoSenha = document.getElementById("login-senha");
    btnOlho = document.getElementById("btn-olho");
    btnEntrar = document.getElementById("btn-entrar");
    areaMensagem = document.getElementById("login-mensagem");
    erroEmail = document.getElementById("erro-email");
    erroSenha = document.getElementById("erro-senha");
    linkEsqueci = document.getElementById("link-esqueci");
    saidaDev = document.getElementById("saida-dev");
    blocoDev = document.querySelector(".login-dev");

    form.addEventListener("submit", aoEnviar);
    btnOlho.addEventListener("click", alternarSenha);
    linkEsqueci.addEventListener("click", aoEsquecer);
    if (saidaDev) saidaDev.addEventListener("click", sairParaOApp);

    if (blocoDev && !ambienteLocal()) blocoDev.hidden = true;

    [campoEmail, campoSenha].forEach(function (c) {
      c.addEventListener("input", function () {
        if (c.getAttribute("aria-invalid")) {
          c.removeAttribute("aria-invalid");
          var alvo = c === campoEmail ? erroEmail : erroSenha;
          alvo.textContent = "";
          alvo.hidden = true;
        }
      });
    });

    document.body.classList.add("login-aberto");
    document.getElementById("app").setAttribute("aria-hidden", "true");

    ligarOuvinteDeSessao();
    verificarSessaoInicial();
  }

  /* Exposto para os testes e para telas que precisem forcar a entrada (ex.:
     N de testar-login.mjs, que confere que as telas clinicas nao mudaram) —
     nao para esconder atalho: o botao da saida esta visivel na tela, com o
     nome do que ele faz, e so existe em ambiente local. */
  window.LoginView = { abrirApp: liberarApp };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
