/* ============================================================================
   EXCLUIR UM PACIENTE — e tudo o que era dele, e nada do que não era.

   ---------------------------------------------------------------------------
   O BUG QUE ISTO FECHA
   ---------------------------------------------------------------------------

   Ate aqui, remover um paciente apagava UMA coisa: a linha dele na tabela
   `pacientes`. As respostas do questionario, a serie de pontuacoes, os exames,
   os documentos, as aplicacoes, as consultas e os mapas gravados continuavam
   no disco, ligados a um id que nao existia mais.

   Nove destinos. Invisiveis em toda tela, fora do backup V1, e alcancaveis
   so pelo "apagar tudo" — que apaga tambem o de todo mundo. O P0.1 travou
   esse comportamento por teste, para ele nao sumir do mapa antes de ser
   consertado; e este arquivo e o conserto.

   Para quem le isto de fora do codigo: e o direito de exclusao. Pedir para
   apagar e receber "pronto" enquanto o prontuario continua no disco nao e
   uma falha tecnica pequena.

   ---------------------------------------------------------------------------
   TRES DECISOES
   ---------------------------------------------------------------------------

   OS DESTINOS SAEM DO MANIFESTO. Nenhuma lista escrita aqui: sao as entradas
   com excluirComPaciente:true. Uma lista a mais e uma lista que um dia
   diverge, e foi exatamente isso que produziu o bug.

   OS FILHOS PRIMEIRO, A RAIZ POR ULTIMO. Enquanto o cadastro existe, os
   filhos sao identificaveis: da para perguntar "de quem e esta linha?".
   Apagada a raiz antes, o que sobra vira orfao anonimo — que e como o bug
   original se comportava.

   NAO E SOFT DELETE. Nada de bandeira "apagado", nada de sumir so da tela. O
   dado sai do disco.

   E nao ha motor proprio: snapshot, marcador, rollback, recuperacao pos-crash
   e exclusividade sao os MESMOS do P0.4b/P0.7, pelo andaime comum. Escrever
   um segundo motor seria manter dois, e o segundo nunca recebe as correcoes
   do primeiro.
   ========================================================================== */

(function () {
  "use strict";

  var A = window.Armazenamento;
  if (!A) return;

  /** Os destinos, derivados do manifesto. A raiz sai da lista: ela nao e
      filha de si mesma, e e apagada por ultimo, em separado. */
  function destinosFilhos() {
    return A.MANIFESTO.filter(function (e) {
      return e.excluirComPaciente && e.escopo !== A.ESCOPO.RAIZ;
    });
  }

  function raiz() { return A.porId("pacientes"); }

  /* ---------- a guarda do id ----------------------------------------------
     O sentinela NUNCA entra numa cascata. Ele e a chave usada quando nao ha
     paciente ativo — o deposito de tudo o que foi respondido fora de um
     cadastro. Aceita-lo aqui apagaria esse deposito inteiro de uma vez, e o
     pedido teria sido "apague este paciente". */

  function conferirId(pid) {
    if (pid === null || pid === undefined) {
      return { ok: false, codigo: "ID_AUSENTE", mensagem: "nenhum id foi dado" };
    }
    if (typeof pid !== "string" || pid === "") {
      return { ok: false, codigo: "ID_INVALIDO",
               mensagem: "id precisa ser uma string nao vazia, veio " +
                         (pid === "" ? "string vazia" : typeof pid) };
    }
    if (pid === A.SEM_PACIENTE) {
      return {
        ok: false, codigo: "SENTINELA_RECUSADA",
        mensagem: '"' + A.SEM_PACIENTE + '" nao e um paciente: e o deposito do ' +
                  "que foi respondido fora de um cadastro. Apaga-lo aqui " +
                  "destruiria o dado de todos os que nunca tiveram ficha."
      };
    }
    var lista = A.adaptador(raiz()).lerTudo(raiz());
    var existe = lista.some(function (p) { return p && p.id === pid; });
    if (!existe) {
      return { ok: false, codigo: "PACIENTE_NAO_EXISTE",
               mensagem: 'nao ha paciente com id "' + pid + '"' };
    }
    return { ok: true };
  }

  /* ---------- o inventario, sem tocar em nada ----------------------------- */

  function contarDoPaciente(entrada, pid) {
    if (entrada.forma === A.FORMA.LISTA) {
      return A.adaptador(entrada).doPaciente(entrada, pid).length;
    }
    if (entrada.forma === A.FORMA.MAPA) {
      return A.adaptador(entrada).doPaciente(entrada, pid) === null ? 0 : 1;
    }
    return null;   /* a loja e assincrona: entra depois */
  }

  /** Somente leitura. Nenhum dado e apagado aqui. */
  function planejarExclusaoPaciente(pid) {
    var v = conferirId(pid);
    var plano = {
      paciente_id: pid,
      existe: v.ok,
      pode: v.ok,
      motivo: v.ok ? null : v.codigo,
      mensagem: v.ok ? null : v.mensagem,
      /* a ordem em que serao apagados, como sera feito de verdade */
      ordem: ["arquivos"].concat(
        destinosFilhos()
          .filter(function (e) { return e.id !== "arquivos"; })
          .map(function (e) { return e.id; })
      ).concat(["pacientes"]),
      destinos: {},
      total_registros: 0,
      exige_confirmacao: true,
      confirmacao: "confirmado"
    };
    if (!v.ok) return Promise.resolve(plano);

    destinosFilhos().forEach(function (e) {
      if (e.forma === A.FORMA.LOJA) return;
      var n = contarDoPaciente(e, pid);
      plano.destinos[e.id] = n;
      plano.total_registros += n;
    });

    var loja = A.porId("arquivos");
    return A.adaptador(loja).doPaciente(loja, pid).then(function (docs) {
      plano.destinos.arquivos = docs.length;
      plano.total_registros += docs.length;
      plano.nome = (A.adaptador(raiz()).lerTudo(raiz())
        .filter(function (p) { return p.id === pid; })[0] || {}).nome || null;
      return plano;
    }, function () {
      plano.destinos.arquivos = null;
      plano.aviso_indexeddb = "nao foi possivel contar os documentos";
      return plano;
    });
  }

  /* ---------- a exclusao ---------------------------------------------------
     A mutacao propriamente dita. Ela roda DENTRO do andaime, entao nao cuida
     de snapshot, marcador nem rollback: cuida de apagar na ordem certa. */

  /* Os pontos de parada DESTA operacao. So para teste, como os do andaime:
     em operacao normal nao custam nada, e nenhuma tela os expoe. */
  function talvez(ponto) {
    if (A.talvezFalharDeTeste) A.talvezFalharDeTeste(ponto);
  }

  function apagarFilhos(pids) {
    var loja = A.porId("arquivos");

    /* 1. Documentos primeiro. E o unico destino com transacao de verdade: se
       ele falhar, nada do localStorage foi tocado ainda. */
    return pids.reduce(function (cadeia, pid) {
      return cadeia.then(function () {
        return window.ArquivoStore.removerDoPacienteEstrito(pid);
      });
    }, Promise.resolve()).then(function () {
      talvez("apos_documentos");
      /* 2. Os filhos de localStorage. Cada armazenamento e reescrito uma vez
         so, com todos os pacientes da operacao ja fora — e nao uma vez por
         paciente, que multiplicaria as janelas de crash sem ganhar nada. */
      destinosFilhos().forEach(function (e) {
        if (e.forma === A.FORMA.LOJA) return;
        if (e.forma === A.FORMA.LISTA) {
          var linhas = A.adaptador(e).lerTudo(e);
          var sobraram = linhas.filter(function (l) {
            return pids.indexOf(l && l[e.campoPaciente]) === -1;
          });
          localStorage.setItem(e.chave, JSON.stringify(sobraram));
        } else if (e.forma === A.FORMA.MAPA) {
          /* so a chave do paciente sai. Os outros nao sao recriados, nem
             normalizados, nem reordenados: eles passam como estavam. */
          var mapa = A.adaptador(e).lerTudo(e);
          var mexeu = false;
          pids.forEach(function (pid) {
            if (Object.prototype.hasOwnProperty.call(mapa, pid)) {
              delete mapa[pid];
              mexeu = true;
            }
          });
          if (mexeu) localStorage.setItem(e.chave, JSON.stringify(mapa));
        }
        talvez("apos_" + e.id);
      });
    });
  }

  function apagarRaiz(pids) {
    var e = raiz();
    var linhas = A.adaptador(e).lerTudo(e);
    var sobraram = linhas.filter(function (p) {
      return pids.indexOf(p && p.id) === -1;
    });
    localStorage.setItem(e.chave, JSON.stringify(sobraram));
  }

  /* ---------- a verificacao ----------------------------------------------- */

  function verificarSaida(pids, antes) {
    var problemas = [];

    /* a raiz sumiu? */
    var noCadastro = A.adaptador(raiz()).lerTudo(raiz());
    pids.forEach(function (pid) {
      if (noCadastro.some(function (p) { return p && p.id === pid; })) {
        problemas.push({ codigo: "PACIENTE_AINDA_EXISTE", paciente_id: pid });
      }
    });

    /* e nenhum dos destinos ainda cita o id? */
    destinosFilhos().forEach(function (e) {
      if (e.forma === A.FORMA.LOJA) return;
      pids.forEach(function (pid) {
        var n = contarDoPaciente(e, pid);
        if (n > 0) {
          problemas.push({ codigo: "RESTOU_DADO", armazenamento: e.id,
                           paciente_id: pid, quantidade: n });
        }
      });
    });

    /* os outros pacientes continuam identicos? */
    Object.keys(antes.outros).forEach(function (chave) {
      var agora = localStorage.getItem(chave);
      if (agora === antes.outros[chave]) return;
      problemas.push({ codigo: "OUTRO_DADO_MEXIDO", chave: chave });
    });

    var loja = A.porId("arquivos");
    return pids.reduce(function (cadeia, pid) {
      return cadeia.then(function () {
        return A.adaptador(loja).doPaciente(loja, pid).then(function (docs) {
          if (docs.length) {
            problemas.push({ codigo: "RESTOU_DOCUMENTO", paciente_id: pid,
                             quantidade: docs.length });
          }
        });
      });
    }, Promise.resolve()).then(function () {
      return { ok: problemas.length === 0, problemas: problemas };
    });
  }

  /** As chaves que a operacao NAO deve tocar, fotografadas antes. Se alguma
      mudar, a verificacao acusa — e a exclusao volta atras. */
  function fotografarIntocaveis() {
    var naoTocar = A.MANIFESTO
      .filter(function (e) {
        return !e.excluirComPaciente && e.backend !== "indexedDB";
      })
      .map(function (e) { return e.chave; });
    var saida = {};
    naoTocar.forEach(function (k) { saida[k] = localStorage.getItem(k); });
    return { outros: saida, chaves: naoTocar };
  }

  /* ---------- a porta publica ---------------------------------------------- */

  /** Exclui um paciente, ou varios de uma vez.

      SOBRE VARIOS DE UMA VEZ: a tela ja permite selecao multipla, e o codigo
      antigo fazia um laco chamando a remocao N vezes. Repetir a operacao
      critica N vezes seria N snapshots, N marcadores e N janelas de crash —
      e um crash no meio deixaria metade dos selecionados apagada e metade
      nao, sem nada que dissesse qual era qual. Entao e UMA operacao: um lock,
      um snapshot, um marcador, e ou todos saem ou nenhum sai. */
  function excluirPaciente(alvo, opcoes) {
    opcoes = opcoes || {};
    var pids = Array.isArray(alvo) ? alvo.slice() : [alvo];

    if (!pids.length) {
      return Promise.resolve(A.resultadoOperacao({
        fase: null, motivo: "ID_AUSENTE", escreveu: false,
        erros: [{ codigo: "ID_AUSENTE", mensagem: "nenhum paciente foi dado" }]
      }));
    }

    /* toda a validacao de id antes de qualquer coisa — inclusive antes do
       lock, porque nao ha por que disputar exclusividade para recusar */
    var recusa = null;
    pids.forEach(function (pid) {
      if (recusa) return;
      var v = conferirId(pid);
      if (!v.ok) recusa = { pid: pid, v: v };
    });
    if (recusa) {
      return Promise.resolve(A.resultadoOperacao({
        fase: null, motivo: recusa.v.codigo, escreveu: false,
        paciente_id: recusa.pid,
        erros: [{ codigo: recusa.v.codigo, mensagem: recusa.v.mensagem,
                  paciente_id: recusa.pid }]
      }));
    }

    /* A API se protege sozinha. Confiar so na confirmacao da tela deixaria
       uma exclusao definitiva a um clique de distancia de qualquer chamador
       futuro — e este e o tipo de funcao que ninguem chama por engano duas
       vezes. */
    if (opcoes.confirmado !== true) {
      return Promise.resolve(A.resultadoOperacao({
        fase: null, motivo: "CONFIRMACAO_OBRIGATORIA", escreveu: false,
        pacientes: pids.slice(),
        mensagem: "esta operacao apaga o dado de verdade, sem soft delete e " +
                  "sem desfazer depois. Chame de novo com { confirmado: true }.",
        erros: []
      }));
    }

    var C = window.Concorrencia;
    if (!C) return executar(pids, opcoes);

    var revisaoNoInicio = C.lerRevisao();

    return C.comExclusividade("exclusao_paciente", function () {
      var marcador = C.lerMarcador();
      if (marcador) {
        return A.resultadoOperacao({
          fase: null, motivo: "RECUPERACAO_PENDENTE", escreveu: false,
          marcador: marcador,
          avisos: [{ codigo: "RECUPERACAO_PENDENTE",
                     mensagem: "uma operacao critica anterior nao terminou. " +
                               "Recupere antes de excluir." }]
        });
      }
      if (C.lerRevisao() !== revisaoNoInicio) {
        return A.resultadoOperacao({
          fase: null, motivo: "ESTADO_DESATUALIZADO", escreveu: false,
          revisao_no_inicio: revisaoNoInicio, revisao_agora: C.lerRevisao(),
          avisos: [{ codigo: "ESTADO_DESATUALIZADO",
                     mensagem: "outra aba escreveu enquanto esta esperava o " +
                               "lock; releia a fonte e tente de novo" }]
        });
      }
      return executar(pids, opcoes);
    }, opcoes).then(function (r) {
      if (r && r.ok === false) {
        return A.resultadoOperacao({
          fase: null, motivo: r.codigo, escreveu: false,
          operacao_em_andamento: r.operacao || null,
          avisos: [{ codigo: r.codigo, mensagem: r.mensagem }]
        });
      }
      var saida = r.resultado;
      if ((saida.aplicado || saida.revertido || saida.escreveu) && C) {
        C.avancarRevisao(saida.aplicado ? "exclusao_paciente" : "rollback");
        saida.revisao = C.lerRevisao();
      }
      return saida;
    });
  }

  function executar(pids, opcoes) {
    var antes = fotografarIntocaveis();
    var contagens = null;

    return Promise.all(pids.map(planejarExclusaoPaciente)).then(function (planos) {
      contagens = planos;

      return A.executarComSnapshot({
        tipo: "exclusao_paciente",
        /* o descritor do snapshot: sem conteudo clinico, so o que basta para
           quem encontrar uma pendencia saber do que se tratava */
        alvo: { tipo: "exclusao_paciente", pacientes: pids.slice() },
        aplicar: function (snap) {
          return A.marcarFaseOperacao(snap, A.FASE_OPERACAO.APLICANDO_INDEXEDDB)
            .then(function () { return apagarFilhos(pids); })
            .then(function () {
              return A.marcarFaseOperacao(snap, A.FASE_OPERACAO.APLICANDO_LOCALSTORAGE);
            })
            .then(function () {
              /* A RAIZ POR ULTIMO. Enquanto o cadastro existe, os filhos sao
                 identificaveis; apagada antes, o que sobrasse viraria orfao
                 anonimo — que e exatamente o bug que isto conserta. */
              talvez("antes_da_raiz");
              apagarRaiz(pids);
              talvez("apos_a_raiz");
            });
        },
        verificar: function () { return verificarSaida(pids, antes); }
      }, opcoes).then(function (r) {
        if (r.ok) {
          return A.resultadoOperacao({
            fase: A.FASE_OPERACAO.CONCLUIDO,
            aplicado: true, escreveu: true, precisa_recarregar: true,
            snapshot_ativo: false,
            pacientes: pids.slice(),
            destinos: contagens.map(function (p) {
              return { paciente_id: p.paciente_id, destinos: p.destinos,
                       total: p.total_registros };
            }),
            ordem: contagens[0] ? contagens[0].ordem : null
          });
        }
        if (r.semSnapshot) {
          return A.resultadoOperacao({
            fase: null, motivo: "FALHA_ANTES_DO_SNAPSHOT", escreveu: false,
            erros: [A.descreverErroOperacao("erro_original", r.erro)]
          });
        }
        return r.resultadoRollback;
      });
    });
  }

  A.planejarExclusaoPaciente = planejarExclusaoPaciente;
  A.excluirPaciente = excluirPaciente;
  A.destinosDaExclusao = function () {
    return destinosFilhos().map(function (e) { return e.id; });
  };
})();
