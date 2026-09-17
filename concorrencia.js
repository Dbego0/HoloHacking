/* ============================================================================
   CONCORRENCIA — duas abas do mesmo app, e o dado no meio.

   Este arquivo e puramente tecnico: nao sabe o que e um sistema, um marcador,
   um paciente ou o HOLOSCOPE. Sabe que existem varios contextos escrevendo no
   mesmo disco e que um nao pode apagar o trabalho do outro sem ninguem notar.

   ---------------------------------------------------------------------------
   O QUE A AUDITORIA DAS ESCRITAS ENCONTROU — e vale dizer, porque muda o
   desenho:

   Toda escrita das 8 tabelas passa por dados.js, e ele NAO escreve a partir de
   um cache: cada insert/update/delete faz ler(tabela) do localStorage, mexe, e
   escreve de volta — tudo no MESMO turno sincrono. JavaScript e single-thread
   e localStorage e sincrono, entao nenhuma outra aba consegue se enfiar entre
   a leitura e a escrita. As tres caixas de mapa (questionario, pontuacao,
   exames) fazem igual: releem o mapa inteiro imediatamente antes de gravar.

   Ou seja: o "lost update" classico, em que B reescreve o array e o item de A
   desaparece, NAO existe hoje para o caminho normal. O que existe e:

     1. CACHE VELHO NA TELA. aplicacoes.js guarda um cache de leitura e
        app.js guarda estado.pacientes. Eles nao corrompem escrita, mas mostram
        o passado — e uma decisao clinica tomada sobre a tela errada e pior do
        que um erro de gravacao.

     2. MESMO CAMPO, DUAS ABAS. gravar() faz update apenas dos campos mexidos,
        entao alteracoes em campos DIFERENTES da mesma linha convivem. Mas se
        as duas abas mexem no MESMO campo, a ultima vence em silencio.

     3. OPERACAO CRITICA. Restauracao, recuperacao pos-crash e apagar tudo
        reescrevem colecoes INTEIRAS. Ai sim uma escrita normal no meio vira
        estado hibrido — e e o caso grave.

   Entao sao dois mecanismos, para dois problemas diferentes:

   REVISAO GLOBAL + storage event  ->  resolve (1) e expoe (2): quem tem cache
   velho descobre, e passa a poder recusar em vez de escrever as cegas.

   WEB LOCKS  ->  resolve (3): exclusao mutua de verdade, dada pelo navegador,
   liberada sozinha se a aba morrer. Sem TTL inventado e sem lock preso.

   E quando navigator.locks nao existe, a operacao critica RECUSA. Nao ha
   fallback "quase seguro": um lock de mentira daria a sensacao de protecao
   sem a protecao, que e pior do que nao ter.
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- armazenamento operacional, nao dado do modelo ---------------
     Duas chaves. Nenhuma delas e dado clinico, nenhuma entra no manifesto dos
     13, nenhuma viaja em backup. */

  var CHAVE_REVISAO = "holohacking.revisao";
  /* O ANUNCIO: existe enquanto uma aba VIVA esta numa operacao critica, e some
     quando ela termina. Renomeado de "operacao-critica" para nao se confundir
     com o MARCADOR abaixo, que tem outro tempo de vida e outra pergunta. */
  var CHAVE_ANUNCIO = "holohacking.operacao-em-curso";
  /* O MARCADOR: existe a partir do momento em que uma operacao critica pode
     ter MUTADO alguma coisa, e so sai quando o desfecho estiver confirmado.
     Ele sobrevive a um crash de proposito — e a unica coisa que sobrevive. */
  var CHAVE_MARCADOR = "holohacking.operacao_critica";
  var NOME_LOCK = "holohacking-escrita-global";

  var OPERACIONAIS = [
    {
      id: "revisao", chave: CHAVE_REVISAO, backend: "localStorage",
      categoria: "operacional", temporario: false,
      exportar: false, importar: false, pacienteScoped: false,
      sensivel: false, limparTudo: true,
      descricao: "Um inteiro que cresce a cada mutacao confirmada. E o que " +
                 "permite uma aba saber que outra escreveu. Nao e dado: e " +
                 "relogio."
    },
    {
      id: "operacao_em_curso", chave: CHAVE_ANUNCIO, backend: "localStorage",
      categoria: "operacional", temporario: true,
      exportar: false, importar: false, pacienteScoped: false,
      sensivel: false, limparTudo: true,
      descricao: "Existe enquanto uma aba VIVA esta numa operacao critica. " +
                 "Serve para a escrita normal, que e sincrona, poder recusar " +
                 "sem virar assincrona. A exclusao mutua de verdade e do Web " +
                 "Locks; isto aqui e o aviso que as outras leem."
    },
    {
      id: "operacao_critica", chave: CHAVE_MARCADOR, backend: "localStorage",
      categoria: "operacional", temporario: true,
      exportar: false, importar: false, pacienteScoped: false,
      /* Nao guarda conteudo clinico — so id, tipo, fase e o id do snapshot —
         mas guarda a informacao de que ha dado clinico num estado incerto. */
      sensivel: false, limparTudo: true,
      descricao: "Existe a partir do momento em que uma operacao critica pode " +
                 "ter mutado alguma coisa, e so sai quando o desfecho esta " +
                 "confirmado. SOBREVIVE A UM CRASH de proposito: e ele que " +
                 "responde 'ficou alguma coisa pela metade?' depois que o Web " +
                 "Lock ja foi liberado pelo navegador."
    }
  ];

  /* ---------- identidade da aba -------------------------------------------
     So em memoria. Nao persiste, nao viaja, e some quando a aba fecha — que e
     exatamente o tempo de vida que ela precisa ter. */

  var EU = (function () {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "aba-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  })();

  /* ---------- a revisao ---------------------------------------------------- */

  function lerRevisao() {
    try {
      var v = parseInt(localStorage.getItem(CHAVE_REVISAO), 10);
      return isFinite(v) && v >= 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  /* O que esta aba acredita ser a revisao atual. Comeca no que o disco diz. */
  var revisaoConhecida = lerRevisao();
  var desatualizado = false;
  var ouvintes = [];

  function avisar(evento) {
    ouvintes.slice().forEach(function (fn) {
      try { fn(evento); } catch (e) { /* um ouvinte ruim nao derruba os outros */ }
    });
  }

  /** Avanca a revisao. So deve ser chamado DEPOIS da escrita estar confirmada:
      no localStorage, depois do setItem; no IndexedDB, depois do
      transaction.oncomplete. Avancar antes seria prometer o que ainda pode
      falhar. */
  function avancarRevisao(motivo) {
    var nova = lerRevisao() + 1;
    try {
      localStorage.setItem(CHAVE_REVISAO, String(nova));
    } catch (e) {
      /* Sem conseguir gravar a revisao, o dado JA foi escrito. Dizer que
         falhou seria mentira; o que da para fazer e nao fingir que as outras
         abas foram avisadas. */
      return { ok: false, revisao: revisaoConhecida, erro: "nao foi possivel gravar a revisao" };
    }
    revisaoConhecida = nova;
    desatualizado = false;
    avisar({ tipo: "revisao_avancada", revisao: nova, motivo: motivo || null, minha: true });
    return { ok: true, revisao: nova };
  }

  /** Esta aba esta olhando para o estado atual? */
  function estaAtualizado() {
    return lerRevisao() === revisaoConhecida;
  }

  /** Aceita a revisao do disco como conhecida. Quem chama esta dizendo "acabei
      de reler a fonte" — o modulo nao recarrega dado por conta propria, porque
      nao sabe o que sao os dados. */
  function marcarAtualizado() {
    revisaoConhecida = lerRevisao();
    desatualizado = false;
    avisar({ tipo: "atualizado", revisao: revisaoConhecida });
    return revisaoConhecida;
  }

  function estado() {
    var noDisco = lerRevisao();
    return {
      aba: EU,
      revisao_conhecida: revisaoConhecida,
      revisao_no_disco: noDisco,
      desatualizado: desatualizado || noDisco !== revisaoConhecida,
      operacao_critica: operacaoEmAndamento(),
      recuperacao_pendente: !!lerMarcador(),
      marcador: lerMarcador(),
      web_locks: temWebLocks()
    };
  }

  /* ---------- storage event ------------------------------------------------
     O navegador so dispara `storage` em OUTRAS abas, nunca na que escreveu —
     que e justamente o que se quer aqui. Marcar e avisar; nao redesenhar nada:
     este modulo nao sabe o que existe na tela. */

  window.addEventListener("storage", function (ev) {
    if (!ev) return;

    if (ev.key === CHAVE_REVISAO) {
      var nova = lerRevisao();
      if (nova !== revisaoConhecida) {
        desatualizado = true;
        avisar({ tipo: "estado_desatualizado", revisao: nova,
                 revisao_conhecida: revisaoConhecida, minha: false });
      }
      return;
    }

    if (ev.key === CHAVE_MARCADOR) {
      var m = lerMarcador();
      avisar({ tipo: m ? "recuperacao_pendente" : "recuperacao_encerrada",
               marcador: m });
      return;
    }

    if (ev.key === CHAVE_ANUNCIO) {
      var op = operacaoEmAndamento();
      avisar({ tipo: op ? "operacao_critica_iniciada" : "operacao_critica_terminada",
               operacao: op });
      return;
    }

    /* Uma chave de dado mudou sem a revisao ter avancado: e escrita de uma
       versao do app anterior a isto, ou de codigo que nao passou pelo funil.
       Nao da para saber o que mudou, mas da para nao fingir que nada mudou. */
    if (ev.key && ev.key.indexOf("holohacking.") === 0 &&
        ev.key !== "holohacking.aparencia") {
      desatualizado = true;
      avisar({ tipo: "escrita_externa_sem_revisao", chave: ev.key });
    }
  });

  /* ---------- o marcador de operacao incompleta ---------------------------
     POR QUE O WEB LOCK NAO BASTA.

     O lock resolve "quem escreve agora". Ele e liberado pelo navegador quando
     a aba morre — que e uma virtude, e tambem o problema: se a aba morreu NO
     MEIO de uma restauracao, o lock some e o estado fica pela metade. A
     proxima aba pede o lock, consegue na hora, e escreve em cima de um disco
     que ninguem sabe em que estado esta.

     O lock protege o INSTANTE. O marcador protege o INTERVALO entre o crash e
     a recuperacao — e por isso ele e persistente e o lock nao.

     ORDEM, que e o que da sentido as verificacoes:

        1. pegar o lock
        2. validar, conferir revisao
        3. gravar e COMMITAR o snapshot
        4. gravar o marcador          <- daqui em diante pode haver mutacao
        5. primeira mutacao

     Crash antes do passo 4: nada foi mutado, e nao ha marcador. Crash depois:
     ha marcador, e qualquer escrita normal descobre.

     E por isso que "marcador sem snapshot" e grave: nessa ordem, ele nao
     deveria conseguir existir. */

  function lerMarcador() {
    try {
      var cru = localStorage.getItem(CHAVE_MARCADOR);
      if (!cru) return null;
      var o = JSON.parse(cru);
      return (o && o.id) ? o : null;
    } catch (e) {
      /* JSON corrompido na chave do marcador tambem e estado operacional
         incerto — devolver null diria "esta tudo bem", e nao esta. */
      return { id: "ilegivel", tipo: null, fase: null, snapshot_id: null,
               ilegivel: true };
    }
  }

  /** Grava o marcador. Chamado DEPOIS do commit do snapshot e ANTES da
      primeira mutacao. Sem conteudo clinico: so o suficiente para uma
      recuperacao saber o que procurar. */
  function marcarOperacaoIncompleta(dados) {
    var m = {
      id: dados.id,
      tipo: dados.tipo,
      iniciado_em: new Date().toISOString(),
      fase: dados.fase || null,
      snapshot_id: dados.snapshot_id || null,
      aba: EU
    };
    try {
      localStorage.setItem(CHAVE_MARCADOR, JSON.stringify(m));
    } catch (e) {
      return { ok: false, erro: "nao foi possivel gravar o marcador" };
    }
    avisar({ tipo: "operacao_incompleta_marcada", marcador: m });
    return { ok: true, marcador: m };
  }

  function atualizarFaseMarcador(fase) {
    var m = lerMarcador();
    if (!m || m.ilegivel) return { ok: false };
    m.fase = fase;
    try { localStorage.setItem(CHAVE_MARCADOR, JSON.stringify(m)); }
    catch (e) { return { ok: false }; }
    return { ok: true, marcador: m };
  }

  /** So depois do desfecho CONFIRMADO: sucesso verificado, rollback
      verificado, ou recuperacao verificada — sempre com o snapshot ja
      removido. Nunca antes. */
  function limparMarcador() {
    try { localStorage.removeItem(CHAVE_MARCADOR); }
    catch (e) { return false; }
    avisar({ tipo: "operacao_incompleta_encerrada" });
    return true;
  }

  /* ---------- operacao critica --------------------------------------------- */

  /* esta aba esta, neste instante, executando uma operacao critica? */
  var emOperacaoCritica = false;

  function temWebLocks() {
    return !!(navigator.locks && typeof navigator.locks.request === "function");
  }

  function operacaoEmAndamento() {
    try {
      var cru = localStorage.getItem(CHAVE_ANUNCIO);
      if (!cru) return null;
      var o = JSON.parse(cru);
      return (o && o.aba) ? o : null;
    } catch (e) {
      return null;
    }
  }

  function anunciarOperacao(nome) {
    try {
      localStorage.setItem(CHAVE_ANUNCIO, JSON.stringify({
        aba: EU, nome: nome, desde: new Date().toISOString()
      }));
    } catch (e) { /* o lock ja garante a exclusao; isto e o aviso */ }
  }

  function encerrarAnuncio() {
    try {
      var o = operacaoEmAndamento();
      /* so apaga o proprio anuncio: uma aba nao desanuncia a operacao de outra */
      if (!o || o.aba === EU) localStorage.removeItem(CHAVE_ANUNCIO);
    } catch (e) { /* idem */ }
  }

  /** Roda `tarefa` com exclusividade de verdade entre abas.

      Sem navigator.locks, RECUSA. Nao ha fallback: um lock montado com
      "se nao existe a chave, crio a chave" tem corrida entre o teste e a
      criacao, e duas abas passam. Isso daria a sensacao de protecao sem a
      protecao — e numa operacao que reescreve o prontuario inteiro, a
      sensacao errada e pior do que a recusa. */
  function comExclusividade(nome, tarefa, opcoes) {
    opcoes = opcoes || {};
    if (!temWebLocks()) {
      return Promise.resolve({
        ok: false,
        codigo: "EXCLUSIVIDADE_NAO_SUPORTADA",
        mensagem: "navigator.locks nao existe neste navegador. Uma operacao " +
                  "que reescreve tudo nao roda sem exclusao mutua de verdade, " +
                  "e um lock improvisado nao e exclusao mutua.",
        escreveu: false
      });
    }

    var pedido = { mode: "exclusive" };
    if (opcoes.naoEsperar) pedido.ifAvailable = true;

    return navigator.locks.request(NOME_LOCK, pedido, function (lock) {
      if (!lock) {
        /* so acontece com ifAvailable: outra aba esta com o lock */
        return {
          ok: false, codigo: "OPERACAO_CRITICA_EM_ANDAMENTO",
          mensagem: "outra aba esta com uma operacao critica em curso",
          operacao: operacaoEmAndamento(), escreveu: false
        };
      }
      anunciarOperacao(nome);
      /* Enquanto ESTA aba executa a operacao critica, as escritas internas
         dela sao parte da operacao — nao podem ser barradas pela guarda que
         existe para barrar as escritas de FORA. E memoria, nao disco: some
         com a aba, que e o tempo de vida certo. */
      emOperacaoCritica = true;
      return Promise.resolve()
        .then(function () { return tarefa(); })
        .then(function (r) {
          emOperacaoCritica = false;
          encerrarAnuncio();
          return { ok: true, resultado: r };
        }, function (e) {
          emOperacaoCritica = false;
          encerrarAnuncio();
          throw e;
        });
    });
    /* O lock e liberado pelo navegador quando a funcao termina OU quando a aba
       morre. E por isso que nao ha TTL aqui: nao existe lock preso para
       expirar. */
  }

  /* ---------- a guarda das escritas normais --------------------------------
     As escritas normais sao SINCRONAS (dados.js devolve promessa ja resolvida)
     e estao espalhadas por dez arquivos. Transforma-las em assincronas para
     participarem do Web Lock quebraria todos os chamadores — e o custo nao se
     justifica, porque o que elas precisam e mais simples: nao escrever
     enquanto uma operacao critica esta reescrevendo tudo.

     Entao a guarda e sincrona e le o anuncio. A exclusao mutua de verdade
     continua sendo do Web Locks, entre operacoes criticas; isto aqui impede o
     caso que importa — escrita normal entrando no meio de uma restauracao.

     A JANELA QUE SOBRA, dita em voz alta: entre esta verificacao e o setItem
     que vem logo depois, no mesmo turno sincrono, nada roda — JavaScript e
     single-thread. O que pode acontecer e a operacao critica anunciar DEPOIS
     da verificacao de outra aba e ANTES da escrita dela. Essa escrita passa. E
     por isso que a restauracao tambem confere a revisao antes de aplicar e
     verifica o estado no fim: se algo entrou no meio, ela desfaz. */

  function podeEscrever(opcoes) {
    opcoes = opcoes || {};

    /* As escritas internas da operacao critica desta aba passam: elas SAO a
       operacao. Quem barra o resto e a guarda abaixo. */
    if (emOperacaoCritica || opcoes.ehOperacaoCritica) return { ok: true };

    /* PRIMEIRO o marcador, antes de qualquer outra coisa. Uma operacao que
       ficou pela metade deixa o disco num estado que ninguem sabe descrever;
       comparar revisao com esse estado nao quer dizer nada, e escrever em
       cima dele e o pior desfecho possivel. */
    var marcador = lerMarcador();
    if (marcador) {
      return {
        ok: false, codigo: "RECUPERACAO_PENDENTE",
        mensagem: "uma operacao critica anterior nao terminou de forma " +
                  "segura. Rode recuperarRestauracaoPendente() antes de " +
                  "escrever qualquer coisa.",
        marcador: marcador
      };
    }

    var op = operacaoEmAndamento();
    if (op && op.aba !== EU) {
      return {
        ok: false, codigo: "OPERACAO_CRITICA_EM_ANDAMENTO",
        mensagem: "outra aba esta restaurando ou apagando tudo; escrever " +
                  "agora produziria estado hibrido",
        operacao: op
      };
    }
    if (!opcoes.ignorarRevisao && !estaAtualizado()) {
      return {
        ok: false, codigo: "ESTADO_DESATUALIZADO",
        mensagem: "outra aba escreveu desde a ultima vez que esta leu. " +
                  "Releia a fonte e chame marcarAtualizado() antes de gravar.",
        revisao_conhecida: revisaoConhecida, revisao_no_disco: lerRevisao()
      };
    }
    return { ok: true };
  }

  function aoMudar(fn) {
    if (typeof fn === "function") ouvintes.push(fn);
    return function () {
      var i = ouvintes.indexOf(fn);
      if (i >= 0) ouvintes.splice(i, 1);
    };
  }

  /* ---------- diagnostico --------------------------------------------------- */

  function diagnosticar() {
    return {
      aba: EU,
      web_locks: temWebLocks(),
      revisao_no_disco: lerRevisao(),
      revisao_conhecida: revisaoConhecida,
      desatualizado: !estaAtualizado(),
      operacao_critica: operacaoEmAndamento(),
      recuperacao_pendente: !!lerMarcador(),
      marcador: lerMarcador(),
      chaves_operacionais: OPERACIONAIS.map(function (o) { return o.chave; }),
      /* dito em voz alta: nada disto e dado do modelo */
      no_manifesto: false,
      exportavel: false
    };
  }

  /** Limpa as chaves operacionais. Para o apagar tudo. */
  function limpar() {
    try {
      localStorage.removeItem(CHAVE_REVISAO);
      localStorage.removeItem(CHAVE_ANUNCIO);
      localStorage.removeItem(CHAVE_MARCADOR);
    } catch (e) { /* idem */ }
    revisaoConhecida = 0;
    desatualizado = false;
  }

  window.Concorrencia = {
    ABA: EU,
    CHAVE_REVISAO: CHAVE_REVISAO,
    CHAVE_ANUNCIO: CHAVE_ANUNCIO,
    CHAVE_MARCADOR: CHAVE_MARCADOR,
    NOME_LOCK: NOME_LOCK,
    OPERACIONAIS: OPERACIONAIS,

    lerRevisao: lerRevisao,
    avancarRevisao: avancarRevisao,
    estaAtualizado: estaAtualizado,
    marcarAtualizado: marcarAtualizado,
    estado: estado,

    temWebLocks: temWebLocks,
    comExclusividade: comExclusividade,
    operacaoEmAndamento: operacaoEmAndamento,

    lerMarcador: lerMarcador,
    marcarOperacaoIncompleta: marcarOperacaoIncompleta,
    atualizarFaseMarcador: atualizarFaseMarcador,
    limparMarcador: limparMarcador,
    emOperacaoCriticaAgora: function () { return emOperacaoCritica; },

    podeEscrever: podeEscrever,
    aoMudar: aoMudar,
    diagnosticar: diagnosticar,
    limpar: limpar
  };
})();
