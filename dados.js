/* ===========================================================================
   DADOS — a camada de persistencia do app
   ===========================================================================

   Hoje guarda no navegador. Amanha guarda no Supabase. O resto do app nao
   sabe a diferenca, e e esse o ponto.

   O app.js falava direto com um cliente Supabase real, com URL e chave
   escritas nele — e app.js e servido aberto para quem abrir a pagina. Isso
   queria dizer tres coisas que ninguem tinha pedido: nao dava para trabalhar
   sem rede, cada rodada de teste gravava paciente num banco de verdade, e a
   credencial estava publicada.

   Este arquivo implementa o PEDACO da interface do Supabase que o app usa —
   exatamente tres chamadas, nem uma a mais:

     from(tabela).select("*").order(coluna, { ascending })   ->  { data, error }
     from(tabela).insert(obj).select().single()              ->  { data, error }
     from(tabela).update(obj).eq("id", id)                   ->  { data, error }
     from(tabela).delete().eq("id", id)                      ->  { data, error }

   Trocar por Supabase de verdade e trocar a linha que define `sb` no app.js.
   Nenhuma tela muda, nenhuma funcao muda.

   O update foi a quarta operacao, e ela entrou aqui — nao espalhada pelas
   telas. Chegou quando o paciente ganhou estado que muda depois do cadastro
   (ativo/inativo): ate ali tudo o que o app sabia de uma pessoa ou nascia com
   ela ou morava em outra caixa.

   NAO guarda arquivo: exame em PDF e foto de laudo vivem no IndexedDB, em
   arquivo-store.js, porque localStorage nao aguenta binario.
   =========================================================================== */

(function () {
  "use strict";

  var PREFIXO = "holohacking.dados.";
  // "perfil" e uma linha so, a de quem usa o app. Entra aqui para viajar
  // junto no exportar/importar: levar os pacientes sem levar quem os assina
  // deixaria os relatorios sem rodape do outro lado.
  /* "consultas" e "bloqueios" sao a agenda: o atendimento marcado e o tempo
     que nao esta disponivel. Entram aqui para viajar no exportar — levar os
     pacientes sem levar a agenda deixaria a semana vazia do outro lado. */
  /* "aplicacoes" e cada vez que uma ferramenta foi aplicada a alguem. Nasceu
     versionada de proposito: a caixa anterior guardava um registro por
     ferramenta por paciente e sobrescrevia, entao reaplicar apagava a leitura
     de tres meses atras — que e justamente a que serve para comparar. */
  /* Esta lista era escrita aqui e repetida no manifesto. Agora ela SAI do
     manifesto (armazenamento.js), que e a fonte tecnica de verdade sobre o
     que este app guarda — as oito entradas de backend "tabela", na ordem em
     que ele as declara. Um teste compara a lista derivada com a lista
     literal abaixo, item por item e na mesma ordem: se divergirem, ele falha.

     O literal continua aqui como fallback, nao como segunda fonte. Ele so
     entra em cena se armazenamento.js nao tiver carregado — o que, no app,
     nao acontece: a tag vem antes desta no index.html. Serve ao teste que
     roda dados.js isolado e a nao transformar uma ordem de <script> errada
     num app que nao abre. */
  var TABELAS_LITERAIS = ["pacientes", "oq3", "pqq", "holoscope", "perfil",
                          "consultas", "bloqueios", "aplicacoes"];

  var TABELAS = (window.Armazenamento && window.Armazenamento.tabelasDaFachada)
    ? window.Armazenamento.tabelasDaFachada()
    : TABELAS_LITERAIS;

  /* ---------- o disco de hoje ------------------------------------------- */

  function ler(tabela) {
    try {
      var cru = localStorage.getItem(PREFIXO + tabela);
      var v = cru ? JSON.parse(cru) : [];
      return Array.isArray(v) ? v : [];
    } catch (e) {
      // Navegador anonimo, cota estourada, JSON corrompido: devolver lista
      // vazia e melhor do que derrubar a tela inteira.
      return [];
    }
  }

  /* TODA escrita das 8 tabelas passa por aqui — insert, update, delete,
     importar e apagarTudo. E por isso que a revisao global e avancada neste
     ponto, e nao em dez lugares: um funil so, que nao da para esquecer.

     A ordem importa: primeiro o setItem, depois a revisao. Avancar antes
     seria prometer as outras abas uma escrita que ainda pode falhar. */
  function escrever(tabela, linhas) {
    try {
      localStorage.setItem(PREFIXO + tabela, JSON.stringify(linhas));
    } catch (e) {
      return { message: "não foi possível gravar neste navegador (" + e.name + ")" };
    }
    if (window.Concorrencia) window.Concorrencia.avancarRevisao("tabela:" + tabela);
    return null;
  }

  /** A guarda desta camada. Sincrona porque as escritas sao sincronas: torna-las
      assincronas para entrarem no Web Lock quebraria todos os chamadores, e o
      que elas precisam e mais simples — nao escrever enquanto outra aba
      reescreve tudo. Devolve null quando pode seguir. */
  function barrado(acao, tabela) {
    if (!window.Concorrencia) return null;
    var v = window.Concorrencia.podeEscrever({ ignorarRevisao: true });
    if (v.ok) return null;
    return { message: v.mensagem, codigo: v.codigo, acao: acao, tabela: tabela };
  }

  function novoId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    // Fallback para navegador antigo ou pagina servida sem https.
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  /* ---------- a consulta -------------------------------------------------

     Acumula o que foi pedido e so executa quando alguem espera o resultado.
     E o que permite escrever a chamada na mesma ordem do Supabase.          */

  function Consulta(tabela) {
    this.tabela = tabela;
    this.acao = null;        // "select" | "insert" | "delete"
    this.valores = null;
    this.ordem = null;
    this.filtro = null;
    this.umSo = false;
  }

  Consulta.prototype.select = function () {
    // Depois de insert(), .select() so diz "me devolva a linha gravada".
    if (this.acao !== "insert") this.acao = "select";
    return this;
  };

  Consulta.prototype.order = function (coluna, opcoes) {
    this.ordem = { coluna: coluna, crescente: !!(opcoes && opcoes.ascending) };
    return this;
  };

  Consulta.prototype.insert = function (valores) {
    this.acao = "insert";
    this.valores = valores;
    return this;
  };

  Consulta.prototype.update = function (valores) {
    this.acao = "update";
    this.valores = valores;
    return this;
  };

  Consulta.prototype.delete = function () {
    this.acao = "delete";
    return this;
  };

  Consulta.prototype.eq = function (coluna, valor) {
    this.filtro = { coluna: coluna, valor: valor };
    return this;
  };

  Consulta.prototype.single = function () {
    this.umSo = true;
    return this;
  };

  Consulta.prototype.executar = function () {
    var linhas = ler(this.tabela);

    var impedido = barrado(this.acao, this.tabela);
    if (impedido) return { data: null, error: impedido };

    if (this.acao === "insert") {
      var linha = {};
      for (var k in this.valores) {
        if (Object.prototype.hasOwnProperty.call(this.valores, k)) linha[k] = this.valores[k];
      }
      linha.id = linha.id || novoId();
      linha.created_at = linha.created_at || new Date().toISOString();
      linhas.push(linha);
      var erroEscrita = escrever(this.tabela, linhas);
      if (erroEscrita) return { data: null, error: erroEscrita };
      return { data: this.umSo ? linha : [linha], error: null };
    }

    if (this.acao === "update") {
      var alvo = this.filtro;
      if (!alvo) return { data: null, error: { message: "update sem eq(): recusado" } };
      var mexidas = [];
      linhas.forEach(function (l) {
        if (l[alvo.coluna] !== alvo.valor) return;
        for (var c in this.valores) {
          if (Object.prototype.hasOwnProperty.call(this.valores, c)) l[c] = this.valores[c];
        }
        mexidas.push(l);
      }, this);
      var erroUpdate = escrever(this.tabela, linhas);
      if (erroUpdate) return { data: null, error: erroUpdate };
      return { data: this.umSo ? (mexidas[0] || null) : mexidas, error: null };
    }

    if (this.acao === "delete") {
      var f = this.filtro;
      var sobraram = f
        ? linhas.filter(function (l) { return l[f.coluna] !== f.valor; })
        : [];
      var erroApagar = escrever(this.tabela, sobraram);
      if (erroApagar) return { data: null, error: erroApagar };
      return { data: null, error: null };
    }

    // select
    var saida = linhas.slice();
    if (this.filtro) {
      var g = this.filtro;
      saida = saida.filter(function (l) { return l[g.coluna] === g.valor; });
    }
    if (this.ordem) {
      var col = this.ordem.coluna;
      var sinal = this.ordem.crescente ? 1 : -1;
      saida.sort(function (a, b) {
        var x = a[col], y = b[col];
        if (x === y) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x > y ? 1 : -1) * sinal;
      });
    }
    if (this.umSo) return { data: saida[0] || null, error: saida.length ? null : { message: "nada encontrado" } };
    return { data: saida, error: null };
  };

  /* Thenable: `await consulta` e `Promise.all([...consultas])` funcionam sem
     ninguem precisar chamar .executar() na mao. */
  Consulta.prototype.then = function (aoResolver, aoFalhar) {
    var resultado;
    try {
      resultado = this.executar();
    } catch (e) {
      return Promise.resolve().then(function () {
        var r = { data: null, error: { message: String(e && e.message || e) } };
        return aoResolver ? aoResolver(r) : r;
      });
    }
    return Promise.resolve(resultado).then(aoResolver, aoFalhar);
  };

  /* ---------- a interface publica --------------------------------------- */

  window.DadosLocais = {
    from: function (tabela) { return new Consulta(tabela); },

    /** Onde os dados estao, em uma frase — para a tela poder dizer ao usuario. */
    onde: "neste navegador",

    /** Tudo o que existe, para levar embora ou trazer de volta. E por aqui que
        a migracao para o Supabase vai passar quando ela acontecer. */
    exportar: function () {
      var pacote = { versao: 1, quando: new Date().toISOString(), tabelas: {} };
      TABELAS.forEach(function (t) { pacote.tabelas[t] = ler(t); });
      return pacote;
    },

    importar: function (pacote) {
      if (!pacote || !pacote.tabelas) throw new Error("pacote sem tabelas");
      TABELAS.forEach(function (t) {
        if (Array.isArray(pacote.tabelas[t])) escrever(t, pacote.tabelas[t]);
      });
    },

    /** Quantas linhas em cada tabela. Util no console e na tela de ajuste. */
    resumo: function () {
      var r = {};
      TABELAS.forEach(function (t) { r[t] = ler(t).length; });
      return r;
    },

    apagarTudo: function () {
      TABELAS.forEach(function (t) { localStorage.removeItem(PREFIXO + t); });
    },

    /* Nao faz parte da API que as telas usam: existe para o teste conseguir
       provar que derivar do manifesto nao mudou nada. Leitura pura. */
    _tabelas: function () {
      return { usadas: TABELAS.slice(), literais: TABELAS_LITERAIS.slice() };
    }
  };
})();
