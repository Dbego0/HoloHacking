/* ===========================================================================
   APLICAÇÕES DE FERRAMENTA
   ===========================================================================

   Cada vez que uma ferramenta é aplicada a alguém, isso é um registro. Antes
   não era: a caixa `holohacking.ferramentas` guardava UM objeto por ferramenta
   por paciente e sobrescrevia. Reaplicar o Diário Corporal em setembro apagava
   o de junho — e é justamente junho que serve para comparar.

   O modelo é o da Especificação Mestre §4, com os nomes em português do resto
   do app:

     Aplicacao {
       id, created_at        ...... do dados.js
       paciente_id           ...... de quem é
       consulta_id           ...... a qual atendimento pertence (ou null)
       ferramenta_id         ...... qual ferramenta
       versao_ferramenta     ...... a versão do catálogo quando foi aplicada
       status                ...... rascunho | concluida | revisada
       iniciada_em           ...... quando abriu
       concluida_em          ...... quando finalizou (ou null)
       atualizada_em         ...... último toque
       respostas             ...... { campo: valor }  — null = não respondido
       resultado             ...... derivado das respostas, recalculável
       leitura               ...... o que a nutricionista viu
       prioridade            ...... o que fazer com isso
       proximo_passo         ...... a ação combinada
     }

   REGRA QUE ESTE ARQUIVO GARANTE: nada é sobrescrito em silêncio. Concluir uma
   aplicação a fecha; a próxima vez que a ferramenta é aberta começa outra. Um
   rascunho aberto continua sendo o mesmo rascunho até ser concluído.

   COMO LÊ: mantém tudo em memória e recarrega a cada escrita, como agenda.js.
   Assim o resto do app pergunta de forma síncrona sem depender de dados.js ser
   síncrono por dentro — no dia em que ele virar Supabase de verdade, só
   carregar() muda.

   MIGRAÇÃO: o que estava na caixa antiga vira uma aplicação concluída, datada
   de quando a migração rodou — porque a data real nunca foi guardada, e
   inventar uma seria pior. Ver migrar().
   =========================================================================== */

(function () {
  "use strict";

  var CAIXA_ANTIGA = "holohacking.ferramentas";
  var MARCA_OQ3 = "holohacking.oq3.migrado";
  var MARCA_PQQ = "holohacking.pqq.migrado";
  var SEM_PACIENTE = "_sem_paciente";

  /* Quando o catálogo de uma ferramenta muda, as aplicações antigas continuam
     dizendo com qual versão foram feitas. Sem isso, um resultado derivado hoje
     seria recalculado sobre campos que não existiam ontem. */
  var VERSAO_CATALOGO = "1";

  var cache = [];

  function agora() { return new Date().toISOString(); }

  function pacienteAtual() {
    try { return (window.pacienteAtivoId && window.pacienteAtivoId()) || SEM_PACIENTE; }
    catch (e) { return SEM_PACIENTE; }
  }

  function banco() { return window.DadosLocais || null; }

  function carregar() {
    var b = banco();
    if (!b) { cache = []; return Promise.resolve(cache); }
    return Promise.resolve(b.from("aplicacoes").select("*")).then(function (r) {
      cache = r.data || [];
      return cache;
    });
  }

  /* ---------- consultas ao cache ------------------------------------------ */

  /** Todas as aplicações de uma ferramenta para um paciente, da mais recente. */
  function historico(ferramentaId, pid) {
    var alvo = pid || pacienteAtual();
    return cache
      .filter(function (a) {
        return a.ferramenta_id === ferramentaId && a.paciente_id === alvo;
      })
      .sort(function (a, b) {
        return String(b.iniciada_em || "").localeCompare(String(a.iniciada_em || ""));
      });
  }

  /** A aplicação fechada mais recente. É ela que o card e a ficha mostram. */
  function ultima(ferramentaId, pid) {
    return historico(ferramentaId, pid).filter(function (a) {
      return a.status !== "rascunho";
    })[0] || null;
  }

  /** O rascunho em aberto. Só pode haver um por ferramenta e paciente. */
  function rascunho(ferramentaId, pid) {
    return historico(ferramentaId, pid).filter(function (a) {
      return a.status === "rascunho";
    })[0] || null;
  }

  /* ---------- a qual consulta a aplicação pertence -------------------------
     A especificação pede o vínculo (§3.1). Aqui ele é a consulta de HOJE deste
     paciente, se houver uma marcada. Não havendo, fica null — inventar um
     vínculo seria afirmar que houve atendimento. */
  function consultaDeHoje() {
    if (!window.Agenda || !window.Agenda.doDia) return null;
    var d = new Date();
    var hoje = d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
    var lista;
    try { lista = window.Agenda.doDia(hoje) || []; } catch (e) { return null; }
    var minha = lista.filter(function (c) { return c.paciente_id === pacienteAtual(); });
    return minha.length ? minha[0].id : null;
  }

  /* ---------- criar, salvar, concluir -------------------------------------- */

  /** Abre a aplicação de trabalho: o rascunho em aberto, ou a última
      concluída (para reler e corrigir), ou uma nova se não houver nenhuma.
      Começar outra aplicação é um gesto explícito — ver novaAplicacao(). */
  function abrir(ferramenta) {
    var existente = rascunho(ferramenta.id) || ultima(ferramenta.id);
    if (existente) return Promise.resolve(existente);
    return novaAplicacao(ferramenta);
  }

  /** Começa uma aplicação nova, mesmo havendo anteriores. É o que preserva o
      histórico: a de antes continua lá, fechada, com a data dela. */
  function novaAplicacao(ferramenta) {
    var b = banco();
    var nova = {
      paciente_id: pacienteAtual(),
      consulta_id: consultaDeHoje(),
      ferramenta_id: ferramenta.id,
      versao_ferramenta: VERSAO_CATALOGO,
      status: "rascunho",
      iniciada_em: agora(),
      concluida_em: null,
      atualizada_em: agora(),
      respostas: {},
      resultado: null,
      leitura: null,
      prioridade: null,
      proximo_passo: null
    };
    if (!b) return Promise.resolve(nova);

    return Promise.resolve(b.from("aplicacoes").insert(nova).select().single())
      .then(function (r) { return carregar().then(function () { return r.data || nova; }); });
  }

  function gravar(app, campos) {
    var b = banco();
    var mudanca = Object.assign({}, campos, { atualizada_em: agora() });
    Object.assign(app, mudanca);
    if (!b || !app.id) return Promise.resolve(app);
    return Promise.resolve(b.from("aplicacoes").update(mudanca).eq("id", app.id))
      .then(carregar)
      .then(function () { return app; });
  }

  function salvarRespostas(app, respostas, resultado) {
    return gravar(app, { respostas: respostas, resultado: resultado || null });
  }

  /** Fecha a aplicação. A próxima abertura da ferramenta começa outra. */
  function concluir(app, respostas, resultado) {
    return gravar(app, {
      respostas: respostas,
      resultado: resultado || null,
      status: "concluida",
      concluida_em: agora()
    });
  }

  /** A leitura profissional — é o que faz a aplicação virar "revisada". */
  function revisar(app, leitura, prioridade, proximoPasso) {
    return gravar(app, {
      leitura: leitura || null,
      prioridade: prioridade || null,
      proximo_passo: proximoPasso || null,
      status: app.status === "rascunho" ? "rascunho" : "revisada"
    });
  }

  function apagar(id) {
    var b = banco();
    if (!b) return Promise.resolve();
    return Promise.resolve(b.from("aplicacoes").delete().eq("id", id)).then(carregar);
  }

  /* ---------- o status que o card mostra ----------------------------------
     Especificação §5. "Reaplicar" não é estado guardado: é leitura da última
     aplicação contra o intervalo que a ferramenta pede — ver reaplicar(). */
  function statusDe(ferramentaId, pid) {
    if (rascunho(ferramentaId, pid)) return "em_preenchimento";
    var u = ultima(ferramentaId, pid);
    if (!u) return "disponivel";
    if (u.status === "revisada") return "revisada";
    return "concluida";
  }

  var ROTULO = {
    disponivel:       "Disponível",
    em_preenchimento: "Em preenchimento",
    concluida:        "Concluída",
    revisada:         "Revisada"
  };

  /** Passou do intervalo que a ferramenta pede? Só vale para as de
      monitoramento, que são as que a especificação manda reaplicar (§16). */
  function reaplicar(ferramenta, pid) {
    if (!ferramenta.reaplicar_dias) return false;
    var u = ultima(ferramenta.id, pid);
    if (!u || !u.concluida_em) return false;
    var dias = Math.floor((Date.now() - new Date(u.concluida_em).getTime()) / 86400000);
    return dias >= ferramenta.reaplicar_dias;
  }

  /* ---------- migração da caixa antiga ------------------------------------

     A caixa guardava { paciente: { ferramenta: { campo: "valor" } } }, sem data
     nenhuma. Cada uma vira uma aplicação concluída. A data é a da migração, e o
     registro diz isso em `leitura` — para ninguém olhar daqui a seis meses e
     achar que aquilo foi aplicado naquele dia.

     Roda uma vez: ao terminar, a caixa é removida. */
  function migrar() {
    var cru;
    try { cru = JSON.parse(localStorage.getItem(CAIXA_ANTIGA) || "null"); }
    catch (e) { cru = null; }
    if (!cru || !Object.keys(cru).length) return Promise.resolve(0);

    var b = banco();
    if (!b) return Promise.resolve(0);

    var quando = agora();
    var pendentes = [];

    Object.keys(cru).forEach(function (pid) {
      var porFerramenta = cru[pid] || {};
      Object.keys(porFerramenta).forEach(function (fid) {
        var respostas = porFerramenta[fid] || {};
        var temAlgo = Object.keys(respostas).some(function (k) {
          return respostas[k] !== "" && respostas[k] != null;
        });
        if (!temAlgo) return;
        pendentes.push(Promise.resolve(b.from("aplicacoes").insert({
          paciente_id: pid,
          consulta_id: null,
          ferramenta_id: fid,
          versao_ferramenta: "0",
          status: "concluida",
          iniciada_em: quando,
          concluida_em: quando,
          atualizada_em: quando,
          respostas: respostas,
          resultado: null,
          leitura: "Aplicação anterior ao histórico: a data original não foi guardada.",
          prioridade: null,
          proximo_passo: null
        }).select().single()));
      });
    });

    return Promise.all(pendentes).then(function () {
      try { localStorage.removeItem(CAIXA_ANTIGA); } catch (e) { /* idem */ }
      return carregar().then(function () { return pendentes.length; });
    });
  }

  /* ---------- de qual linha legada uma aplicação veio -----------------------

     A idempotência da migração do OQ³ é POR REGISTRO, nunca por paciente.

     A primeira versão desta rotina pulava o paciente que já tivesse qualquer
     aplicação de OQ³. Numa migração limpa isso funcionava por acidente — a
     lista de "quem já tem" era tirada ANTES das inserções, então as três
     linhas de uma mesma pessoa passavam juntas. Mas bastava uma migração pela
     metade, ou um contexto sem a marca do localStorage, para que as linhas
     restantes daquele paciente fossem puladas PARA SEMPRE: um paciente com
     três consultas ficava com uma, e as outras duas nunca mais entravam.

     Agora cada aplicação migrada guarda de qual linha veio, em origem_legada.
     Duas chaves resolvem os dois casos:

       oq3:<id da linha>            para tudo que esta rotina migrar daqui em
                                    diante — exato, um para um;

       oq3@<paciente>:<created_at>  para o que JÁ foi migrado por uma versão
                                    anterior, que não gravava origem_legada.
                                    Reconstrói-se a chave a partir do que
                                    aquela versão deixou: o carimbo de início é
                                    o created_at da linha, e a versão é "0".

     O localStorage continua existindo como atalho, para não reler a tabela a
     cada arranque — mas ele não é mais a proteção. Some a marca, troca-se de
     navegador, restaura-se um backup: a decisão continua saindo dos dados. */
  function chavePorId(ferramentaId, o) { return ferramentaId + ":" + o.id; }
  function chavePorCarimbo(ferramentaId, pacienteId, criadoEm) {
    return ferramentaId + "@" + pacienteId + ":" + (criadoEm || "");
  }

  /** As linhas legadas de uma ferramenta que já viraram aplicação. */
  function legadasJaMigradas(ferramentaId) {
    var vistas = {};
    cache.forEach(function (a) {
      if (a.ferramenta_id !== ferramentaId) return;
      if (a.origem_legada) vistas[a.origem_legada] = true;
      /* Migrada por uma versão que ainda não gravava a origem: ela é
         reconhecível por ser versão "0" e ter o carimbo da linha. */
      if (a.versao_ferramenta === "0") {
        vistas[chavePorCarimbo(ferramentaId, a.paciente_id, a.iniciada_em)] = true;
      }
    });
    return vistas;
  }

  /* ---------- a rotina de migração, uma só para as duas tabelas ----------

     OQ³ e PQQ tinham o mesmo desenho antigo — tabela própria, um INSERT por
     clique em salvar, e uma tela que só mostrava a linha mais recente. O
     dado nunca se perdeu; o histórico é que era invisível.

     `respostasDe` é a única coisa que difere entre as duas: qual campo da
     linha antiga vira qual campo de `respostas`. Nada é reinterpretado — é
     cópia literal, e nenhuma leitura é derivada. */
  function migrarTabelaLegada(tabela, ferramentaId, marca, respostasDe) {
    try { if (localStorage.getItem(marca)) return Promise.resolve(0); }
    catch (e) { /* sem localStorage, tenta assim mesmo */ }

    var b = banco();
    if (!b) return Promise.resolve(0);

    return Promise.resolve(b.from(tabela).select("*")).then(function (r) {
      var linhas = (r.data || []).filter(function (o) { return o && o.paciente_id; });
      if (!linhas.length) {
        try { localStorage.setItem(marca, "1"); } catch (e) { /* idem */ }
        return 0;
      }

      /* Linha por linha: a que já virou aplicação fica de fora; a que não,
         entra. Um paciente com três consultas migra as três. */
      var vistas = legadasJaMigradas(ferramentaId);

      var pendentes = linhas.filter(function (o) {
        return !vistas[chavePorId(ferramentaId, o)] &&
               !vistas[chavePorCarimbo(ferramentaId, o.paciente_id, o.created_at)];
      }).map(function (o) {
        var quando = o.created_at || agora();
        return Promise.resolve(b.from("aplicacoes").insert({
          paciente_id: o.paciente_id,
          consulta_id: null,
          ferramenta_id: ferramentaId,
          versao_ferramenta: "0",
          origem_legada: chavePorId(ferramentaId, o),
          status: "concluida",
          iniciada_em: quando,
          concluida_em: quando,
          atualizada_em: quando,
          respostas: respostasDe(o),
          resultado: null,
          leitura: null,
          prioridade: null,
          proximo_passo: null
        }).select().single());
      });

      return Promise.all(pendentes).then(function () {
        try { localStorage.setItem(marca, "1"); } catch (e) { /* idem */ }
        return carregar().then(function () { return pendentes.length; });
      });
    });
  }

  /* ---------- migração do OQ³ ---------------------------------------------

     Diferente da caixa antiga de ferramentas, aqui cada linha TEM data — o
     `created_at` do registro. Então cada uma vira uma aplicação concluída com
     a data real dela, e não com a data em que a migração rodou.

     A tabela `oq3` NÃO é apagada: continua sendo a origem, para o caso de algo
     dar errado. Os cinco campos entram em `respostas` como estavam. */
  function migrarOQ3() {
    return migrarTabelaLegada("oq3", "oq3", MARCA_OQ3, function (o) {
      return {
        data_consulta: o.data_consulta || null,
        quer: o.quer || "",
        precisa: o.precisa || "",
        consegue: o.consegue || "",
        alavancas: o.alavancas || ""
      };
    });
  }

  /* ---------- migração do PQQ ---------------------------------------------

     Os sete campos entram como estavam: o objetivo declarado, as cinco
     respostas da escada e o "pra que" verdadeiro. Nenhum é renomeado, e o
     que estiver vazio continua vazio — em particular, `verdadeiro` em branco
     NÃO é preenchido a partir de r5..r1. */
  function migrarPQQ() {
    return migrarTabelaLegada("pqq", "pqq", MARCA_PQQ, function (o) {
      return {
        objetivo: o.objetivo || "",
        r1: o.r1 || "", r2: o.r2 || "", r3: o.r3 || "",
        r4: o.r4 || "", r5: o.r5 || "",
        verdadeiro: o.verdadeiro || ""
      };
    });
  }

  /* ---------- o que o resto do app pergunta -------------------------------- */

  window.Aplicacoes = {
    carregar: carregar,
    abrir: abrir,
    nova: novaAplicacao,
    salvarRespostas: salvarRespostas,
    concluir: concluir,
    revisar: revisar,
    apagar: apagar,
    historico: historico,
    ultima: ultima,
    rascunho: rascunho,
    statusDe: statusDe,
    reaplicar: reaplicar,
    migrarOQ3: migrarOQ3,
    migrarPQQ: migrarPQQ,
    rotulo: function (s) { return ROTULO[s] || s; },

    /** Quais ferramentas esta pessoa já tem. Usado pela ficha e pelo painel. */
    preenchidas: function (pid) {
      var alvo = pid || pacienteAtual();
      var vistas = {};
      cache.forEach(function (a) {
        if (a.paciente_id === alvo && a.status !== "rascunho") vistas[a.ferramenta_id] = true;
      });
      return Object.keys(vistas);
    },

    /** Todas as aplicações de um paciente — a linha do tempo da ficha usa. */
    doPaciente: function (pid) {
      var alvo = pid || pacienteAtual();
      return cache.filter(function (a) { return a.paciente_id === alvo; })
        .sort(function (a, b) {
          return String(b.iniciada_em || "").localeCompare(String(a.iniciada_em || ""));
        });
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    /* A migração precisa da lista de pacientes carregada, senão grava sob a
       chave errada — foi assim que as respostas do questionário se perderam
       uma vez. Espera, migra, e avisa quem desenha. */
    var tentar = function () {
      if (window.pacientesCarregados && !window.pacientesCarregados()) {
        setTimeout(tentar, 120);
        return;
      }
      carregar()
        .then(migrar)
        .then(function (n) {
          return migrarOQ3().then(function (m) { return n + m; });
        })
        .then(function (n) {
          return migrarPQQ().then(function (m) { return n + m; });
        })
        .then(function (n) {
          if (n > 0 && window.avisar) {
            window.avisar(n + (n === 1
              ? " aplicação anterior entrou no histórico."
              : " aplicações anteriores entraram no histórico."));
          }
          if (typeof window.aoTrocarPaciente === "function") window.aoTrocarPaciente();
        });
    };
    tentar();
  });
})();
