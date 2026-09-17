/* ===========================================================================
   LOGIN — a tela de entrada da plataforma
   ===========================================================================

   O QUE ESTA RODADA E
   Interface e arquitetura visual, so. NAO existe autenticacao aqui: nao ha
   servidor, nao ha tabela de usuarios, nao ha sessao. Nada nesta tela protege
   o que esta atras dela, e o codigo nao finge o contrario.

   POR QUE NAO HA LOGIN FALSO
   Um `autenticado=true` no localStorage, uma senha fixa no fonte ou uma
   comparacao de e-mail no navegador dariam a sensacao de porta trancada com a
   chave na fechadura. Qualquer pessoa abre o devtools e entra. Pior do que
   nao ter porta e achar que tem.

   A COSTURA PARA O BACKEND
   AuthService e o unico ponto que fala com o mundo. Hoje ele responde sempre
   SEM_SERVIDOR. Quando a autenticacao real existir, o corpo de entrar() vira
   um fetch para POST /api/auth/login e mais nada nesta tela muda:

       LoginView  ->  AuthService  ->  (futuro) POST /api/auth/login

   A SENHA
   Nunca sai daqui. Nao vai para localStorage, nem para dataset, nem para a
   URL, nem para o console. Ela vive no value do input enquanto a pessoa
   digita e e lida uma vez, no submit, para ser entregue ao AuthService.
   =========================================================================== */

(function () {
  "use strict";

  /* =========================================================== AUTHSERVICE ==
     A fronteira com o servidor que ainda nao existe. Devolve sempre a mesma
     forma de resposta — { ok, motivo, mensagem } — para que a View nao precise
     saber se veio de um fetch ou desta funcao. */

  var SEM_SERVIDOR = "SEM_SERVIDOR";

  window.AuthService = {
    /* A assinatura ja e a do futuro: recebe o que um POST /api/auth/login
       receberia. `manterConectado` viaja junto porque e decisao de sessao, do
       servidor — nao de tela. Nesta rodada e ignorado por quem recebe. */
    entrar: function (credenciais) {
      return Promise.resolve({
        ok: false,
        motivo: SEM_SERVIDOR,
        mensagem: "Autenticação ainda não conectada ao servidor."
      });
      /* Quando o backend existir, o corpo acima vira algo como:

         return fetch("/api/auth/login", {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           credentials: "same-origin",
           body: JSON.stringify(credenciais)
         }).then(...)

         A sessao vem em cookie HttpOnly do servidor. Token no localStorage
         nao entra aqui: XSS le localStorage, e nao le cookie HttpOnly. */
    },

    recuperarSenha: function (email) {
      return Promise.resolve({
        ok: false,
        motivo: SEM_SERVIDOR,
        mensagem: "A recuperação de senha será disponibilizada quando a " +
                  "autenticação da plataforma estiver conectada."
      });
    }
  };

  /* ============================================================= LOGINVIEW ==
     So tela: le campos, valida formato, mostra estado. Nenhuma decisao sobre
     quem pode entrar e tomada aqui — nem poderia ser. */

  var form, campoEmail, campoSenha, btnOlho, btnEntrar, areaMensagem,
      erroEmail, erroSenha, linkEsqueci, camada, saidaDev;
  var enviando = false;

  /* Formato, nao existencia: isto so evita um POST obviamente vazio. Quem
     decide se o e-mail existe e o servidor. Deliberadamente permissivo — um
     regex severo aqui rejeita endereco valido e trava quem tem direito. */
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

  /* textContent, nunca innerHTML: mensagem nenhuma desta tela passa por
     interpretador de HTML, venha ela do servidor ou daqui. */
  function mensagem(texto, tipo) {
    /* Ordem importa: a regiao precisa estar RENDERIZADA antes do texto mudar.
       Escrever com hidden ainda ligado e so entao revelar faz parte dos
       leitores de tela perder o anuncio — a mutacao aconteceu fora da arvore. */
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

  function aoEnviar(e) {
    e.preventDefault();
    // A trava real contra submit duplo. `disabled` sozinho nao basta: Enter
    // repetido chega antes do navegador repintar o botao.
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
        // Sem servidor, nao ha caminho de sucesso — e nao inventamos um.
        mensagem(r.mensagem, r.ok ? "ok" : "aviso");
      })
      .catch(function () {
        mensagem("Não foi possível falar com o servidor.", "aviso");
      })
      .then(function () {
        carregando(false);
        // A credencial some da memoria do JS junto com o escopo desta funcao.
        // O que sobra e o value do input, que e do navegador, nao nosso.
        credenciais = null;
      });
  }

  function alternarSenha() {
    var escondida = campoSenha.type === "password";
    campoSenha.type = escondida ? "text" : "password";
    btnOlho.setAttribute("aria-pressed", escondida ? "true" : "false");
    btnOlho.setAttribute("aria-label", escondida ? "Ocultar senha" : "Mostrar senha");
    btnOlho.classList.toggle("revelada", escondida);
    /* Trocar o type faz o navegador reconstruir o campo e o cursor ia para o
       fim. Quem revela a senha esta conferindo o que digitou, e costuma voltar
       a digitar: devolvemos o foco e a posicao do cursor. */
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

  /* A saida de desenvolvimento. Nao e login: nao verifica nada, nao guarda
     nada, nao cria sessao. Descobre a camada para que o app continue
     alcancavel enquanto a autenticacao nao existe — e diz isso na propria
     etiqueta, para ninguem confundir com uma porta. */
  function sairParaOApp(e) {
    if (e) e.preventDefault();
    camada.hidden = true;
    document.body.classList.remove("login-aberto");
    document.getElementById("app").removeAttribute("aria-hidden");
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

    form.addEventListener("submit", aoEnviar);
    btnOlho.addEventListener("click", alternarSenha);
    linkEsqueci.addEventListener("click", aoEsquecer);
    saidaDev.addEventListener("click", sairParaOApp);

    // Digitar limpa o erro do proprio campo: manter "informe o e-mail" embaixo
    // de um e-mail ja digitado e so ruido.
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
    campoEmail.focus();
  }

  /* Exposto para os testes e para a proxima etapa — nao para esconder atalho:
     o botao da saida esta visivel na tela, com o nome do que ele faz. */
  window.LoginView = { abrirApp: sairParaOApp };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
