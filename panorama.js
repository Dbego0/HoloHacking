/* ===========================================================================
   PANORAMA — o estado clinico de um paciente, e o da carteira inteira
   ===========================================================================

   As regras de "o que falta neste paciente" viviam dentro de ficha.js, presas
   ao paciente ativo. O dashboard precisa das mesmas regras para TODOS os
   pacientes — e regra clinica copiada em dois lugares diverge, e sempre
   diverge do jeito que ninguem percebe.

   Entao elas moraram para ca, parametrizadas por paciente. A ficha continua
   mostrando o mesmo que mostrava; o dashboard passa a mostrar quem precisa de
   atencao antes de a nutricionista abrir ficha por ficha.

   Nao decide nada de clinico por conta propria: as notas, as combinacoes e o
   confronto com exame vem todos do motor.
   =========================================================================== */

(function () {
  "use strict";

  var SEM_PACIENTE = "_sem_paciente";
  var DIAS_REAVALIACAO = 28;          // as 4 semanas do metodo

  var NOME_SISTEMA = {
    fungico: "Fúngico",
    acido_inflamatorio: "Ácido-Inflamatório",
    metabolico: "Metabólico",
    detox_linfatico: "Detox + Linfático",
    mental_emocional_espiritual: "Mental–Emocional–Espiritual"
  };

  function caixa(chave, pid) {
    try { return (JSON.parse(localStorage.getItem(chave)) || {})[pid] || null; }
    catch (e) { return null; }
  }

  function diasDesde(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  /** As perguntas que existem hoje. Resposta orfa de marcador retirado numa
      revisao nao pode contar — senao aparece "86 de 84". */
  function perguntasDeHoje() {
    try {
      if (window.HOLOSCOPE && window.HOLOSCOPE.questionario) {
        var mapa = {};
        window.HOLOSCOPE.questionario().forEach(function (q) { mapa[q.id] = true; });
        return mapa;
      }
    } catch (e) { /* sem motor, conta tudo */ }
    return null;
  }

  function totalDePerguntas() {
    try {
      if (window.HOLOSCOPE && window.HOLOSCOPE.questionario) {
        return window.HOLOSCOPE.questionario().length;
      }
    } catch (e) { /* idem */ }
    return 84;
  }

  /* ---------- o estado de um paciente ------------------------------------ */

  function doPaciente(pid) {
    var id = pid || SEM_PACIENTE;
    var pont = window.ultimaPontuacao ? window.ultimaPontuacao(id) : null;
    var historico = window.historicoPontuacao ? window.historicoPontuacao(id) : [];
    var ferr = caixa("holohacking.ferramentas", id) || {};
    var quest = caixa("holohacking.questionario", id) || {};
    var exames = caixa("holohacking.exames", id) || {};

    var preenchidas = Object.keys(ferr).filter(function (fid) {
      var campos = ferr[fid];
      return Object.keys(campos).some(function (k) {
        return campos[k] !== "" && campos[k] != null;
      });
    });

    var conhecidas = perguntasDeHoje();
    var respondidas = Object.keys(quest).filter(function (mid) {
      return !conhecidas || conhecidas[mid];
    }).length;

    return {
      id: id,
      pontuacao: pont,
      historico: historico,
      respondidas: respondidas,
      totalPerguntas: totalDePerguntas(),
      ferramentas: preenchidas,
      exames: Object.keys(exames).length,
      valoresExames: exames
    };
  }

  /* ---------- o que precisa de atencao -----------------------------------

     `grau` ordena: quanto menor, mais cedo aparece na lista do dashboard.   */

  function alertas(d) {
    var saida = [];

    if (!d.pontuacao && d.respondidas === 0) {
      saida.push({ peso: 3, grau: "abrir", curto: "sem HOLOSCOPE",
                   texto: "Sem HOLOSCOPE aplicado.",
                   acao: "holoscope", botao: "Aplicar agora" });
    } else if (!d.pontuacao && d.respondidas > 0) {
      saida.push({ peso: 1, grau: "aviso",
                   curto: "questionário parado em " + d.respondidas + " de " + d.totalPerguntas,
                   texto: "Questionário parado em " + d.respondidas + " de " +
                          d.totalPerguntas + " — o mapa não foi gerado.",
                   acao: "holoscope", botao: "Continuar" });
    }

    // o achado que ninguem via: mapeado e nunca conduzido
    if (d.pontuacao && d.ferramentas.length === 0) {
      saida.push({ peso: 1, grau: "aviso", curto: "mapa sem conduta",
                   texto: "O mapa foi feito e nenhuma ferramenta foi aplicada. " +
                          "Sem conduta, a avaliação não vira jornada.",
                   acao: "holoscope", botao: "Ver por onde começar" });
    }

    if (d.pontuacao && d.pontuacao.quando) {
      var dias = diasDesde(d.pontuacao.quando);
      if (dias !== null && dias >= DIAS_REAVALIACAO) {
        saida.push({ peso: 2, grau: "aviso",
                     curto: "reavaliação vencida há " + (dias - DIAS_REAVALIACAO) + " dias",
                     texto: "Última aplicação há " + dias + " dias. " +
                            "A reavaliação de 4 semanas venceu.",
                     acao: "holoscope", botao: "Reaplicar" });
      }
    }

    // exame alterado onde ele nao se queixa
    if (d.exames > 0 && d.pontuacao && window.HOLOSCOPE && window.HOLOSCOPE.lerExames) {
      var notas = {};
      d.pontuacao.sistemas.forEach(function (s) { notas[s.sistema] = s.nota; });
      try {
        var r = window.HOLOSCOPE.lerExames(d.valoresExames, notas);
        r.confronto.filter(function (c) { return c.concordancia === "diverge"; })
          .forEach(function (c) {
            var nome = NOME_SISTEMA[c.sistema] || c.sistema;
            saida.push({ peso: 2, grau: "aviso",
                         curto: "relato e exame não batem no " + nome,
                         texto: "Sistema " + nome + ": relato e exame não batem.",
                         acao: "aba:exames", botao: "Ver exames" });
          });
      } catch (e) { /* sem alerta e melhor do que alerta errado */ }
    }

    return saida;
  }

  /* ---------- a carteira inteira ----------------------------------------- */

  function carteira() {
    var pacientes = (window.pacientesTodos && window.pacientesTodos()) || [];

    var linhas = pacientes.map(function (p) {
      var d = doPaciente(p.id);
      var av = alertas(d);
      av.sort(function (a, b) { return a.peso - b.peso; });
      return { paciente: p, dados: d, alertas: av };
    });

    var comMapa = linhas.filter(function (l) { return !!l.dados.pontuacao; });
    var pendentes = linhas.filter(function (l) { return l.alertas.length > 0; });
    pendentes.sort(function (a, b) {
      return a.alertas[0].peso - b.alertas[0].peso ||
             a.paciente.nome.localeCompare(b.paciente.nome);
    });

    /* O terreno da carteira: quantas vezes cada sistema aparece entre os dois
       mais baixos dos pacientes mapeados. E a leitura que so este produto
       consegue dar — nao sobre um paciente, mas sobre quem ela atende. */
    var frequencia = {};
    comMapa.forEach(function (l) {
      l.dados.pontuacao.sistemas
        .filter(function (s) { return s.avaliavel !== false; })
        .slice()
        .sort(function (a, b) { return a.nota - b.nota; })
        .slice(0, 2)
        .forEach(function (s) {
          frequencia[s.sistema] = (frequencia[s.sistema] || 0) + 1;
        });
    });
    var terreno = Object.keys(frequencia).map(function (k) {
      return { sistema: k, nome: NOME_SISTEMA[k] || k, vezes: frequencia[k] };
    }).sort(function (a, b) { return b.vezes - a.vezes || a.nome.localeCompare(b.nome); });

    var indices = comMapa.map(function (l) { return l.dados.pontuacao.indice; });
    var media = indices.length
      ? Math.round(indices.reduce(function (a, b) { return a + b; }, 0) / indices.length)
      : null;

    return {
      total: pacientes.length,
      comMapa: comMapa.length,
      semMapa: pacientes.length - comMapa.length,
      indiceMedio: media,
      pendentes: pendentes,
      terreno: terreno,
      linhas: linhas
    };
  }

  /* ---------- o contexto que as combinacoes podem ler -------------------

     Exame e ferramenta nao entram em nota nenhuma — o Indice continua saindo
     so do questionario. Eles existem aqui para uma combinacao poder dizer
     "exame.EXA-005 >= 100 E marcador.SNT-304 >= 2", que e a leitura que o
     material promete e que cinco notas sozinhas nao conseguem expressar.

     So numero entra: campo de texto de ferramenta fica de fora. */
  function contexto(pid) {
    var id = pid || (window.pacienteAtivoId && window.pacienteAtivoId()) || SEM_PACIENTE;

    var exames = {};
    var brutos = caixa("holohacking.exames", id) || {};
    Object.keys(brutos).forEach(function (k) {
      var n = Number(brutos[k]);
      if (brutos[k] !== "" && brutos[k] != null && isFinite(n)) exames[k] = n;
    });

    var ferramentas = {};
    var ferr = caixa("holohacking.ferramentas", id) || {};
    Object.keys(ferr).forEach(function (fid) {
      var campos = ferr[fid] || {};
      var numericos = {};
      Object.keys(campos).forEach(function (c) {
        var n = Number(campos[c]);
        if (campos[c] !== "" && campos[c] != null && isFinite(n)) numericos[c] = n;
      });
      if (Object.keys(numericos).length) ferramentas[fid] = numericos;
    });

    return { exames: exames, ferramentas: ferramentas };
  }

  window.Panorama = {
    doPaciente: doPaciente,
    contexto: contexto,
    alertas: alertas,
    carteira: carteira,
    NOME_SISTEMA: NOME_SISTEMA,
    DIAS_REAVALIACAO: DIAS_REAVALIACAO
  };
})();
