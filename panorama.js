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
    var quest = caixa("holohacking.questionario", id) || {};
    var exames = caixa("holohacking.exames", id) || {};

    var preenchidas = window.Aplicacoes
      ? window.Aplicacoes.preenchidas(id)
      : [];

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
        // Revisao clinica do HOLOSCOPE (Holoscan): "nao batem" sugeria que um
        // dos dois lados esta errado. Divergencia e convite a aprofundar, nao
        // veredito. window.Holoscan (arquivos.js) e quem decide o estado —
        // se ainda nao carregou, nao alertamos nada (fail-safe, nao inventa).
        if (window.Holoscan) {
          r.confronto.filter(function (c) { return window.Holoscan.estado(c) === "DIVERGENTE"; })
            .forEach(function (c) {
              var nome = NOME_SISTEMA[c.sistema] || c.sistema;
              saida.push({ peso: 2, grau: "aviso",
                           curto: "relato e exames divergem no " + nome,
                           texto: "Sistema " + nome + ": relato e exames laboratoriais divergem — aprofundar.",
                           acao: "aba:documentos", botao: "Ver exames" });
            });
        }
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
    if (window.Aplicacoes) {
      window.Aplicacoes.preenchidas(id).forEach(function (fid) {
        var app = window.Aplicacoes.ultima(fid, id);
        if (!app || !app.respostas) return;
        var numericos = {};
        Object.keys(app.respostas).forEach(function (c) {
          var v = app.respostas[c];
          // lista de itens nao entra: uma condicao le um valor, nao um array
          if (v === "" || v == null || Array.isArray(v) || typeof v === "object") return;
          var n = Number(v);
          if (isFinite(n)) numericos[c] = n;
        });
        if (Object.keys(numericos).length) ferramentas[fid] = numericos;
      });
    }

    return { exames: exames, ferramentas: ferramentas };
  }

  /* ---------- a situacao de cada paciente na lista -----------------------

     Os filtros da lista de pacientes precisam de uma leitura por pessoa que
     nao existia: ha quanto tempo ela nao aparece, se a ficha esta vazia, se
     ela e nova, se foi marcada como inativa. Fica aqui pelo mesmo motivo que
     o resto: sao regras sobre o estado clinico, e a lista nao pode discordar
     da ficha nem do dashboard sobre a mesma pessoa.                          */

  var DIAS_SEM_CONTATO = 90;   // o silencio que ja e longo demais
  var DIAS_NOVO = 30;          // o primeiro mes, em que a ficha ainda enche

  /** Uma caixa de formulario (oq3, pqq) tem conteudo de verdade? */
  function temConteudo(obj) {
    if (!obj) return false;
    return Object.keys(obj).some(function (k) {
      return k !== "id" && k !== "paciente_id" && k !== "created_at" &&
             k !== "score_holos" && obj[k];
    });
  }

  function situacao(p) {
    var d = doPaciente(p.id);
    var ultimo = d.pontuacao && d.pontuacao.quando ? d.pontuacao.quando : null;
    var cadastro = (p.created_at || "").slice(0, 10);

    /* O silencio conta do ultimo atendimento; quem nunca teve conta do
       cadastro. Cadastrar alguem e nunca ver e justamente o caso que nao
       pode escapar da lista — e sem esta linha ele escapava, porque nao
       havia data nenhuma de onde contar. */
    var dias = diasDesde(ultimo || cadastro);
    var desdeCadastro = diasDesde(cadastro);

    /* "Alguma coisa" e qualquer sinal de que a ficha comecou a existir: uma
       resposta, um exame, uma ferramenta, um OQ3. Sem nenhum deles, o
       cadastro e so um nome. */
    var comecou = d.respondidas > 0 || d.ferramentas.length > 0 || d.exames > 0 ||
                  temConteudo(p.oq3) || temConteudo(p.pqq);

    return {
      ultimoContato: ultimo,
      diasDeSilencio: dias,
      nuncaAtendido: !ultimo,
      novo: desdeCadastro !== null && desdeCadastro <= DIAS_NOVO,
      semContato: dias !== null && dias >= DIAS_SEM_CONTATO,
      vazia: !d.pontuacao && !comecou,
      inativo: p.status === "inativo",
      /* Respondeu alguma coisa e ainda nao virou mapa: e o unico "esperando
         por voce" que o app conhecia so como uma linha de alerta solta. */
      aguardandoMapa: !d.pontuacao && comecou,
      dados: d
    };
  }

  /* ---------- as consultas: o que ja aconteceu ---------------------------

     Cada aplicacao do HOLOSCOPE e um atendimento, e o app ja guardava todas,
     por paciente, para poder comparar 4, 8 e 12 semanas. O que faltava era
     poder olhar isso de FORA do paciente: o que foi atendido, em ordem de
     tempo, na carteira inteira.

     Nao inventa atendimento: sem aplicacao nao ha consulta aqui. E ferramenta
     preenchida nao guarda data — entao nao da para dizer que ela pertence a
     este dia, e por isso ela nao entra na linha.                            */

  function consultas() {
    var pacientes = (window.pacientesTodos && window.pacientesTodos()) || [];
    var saida = [];

    pacientes.forEach(function (p) {
      var h = (window.historicoPontuacao && window.historicoPontuacao(p.id)) || [];
      h.forEach(function (pont, i) {
        var maisBaixos = (pont.sistemas || [])
          .filter(function (s) { return s.avaliavel !== false; })
          .slice()
          .sort(function (a, b) { return a.nota - b.nota; })
          .slice(0, 2)
          .map(function (s) {
            return { sistema: s.sistema, nome: NOME_SISTEMA[s.sistema] || s.sistema,
                     nota: s.nota };
          });

        saida.push({
          paciente: p,
          quando: pont.quando,
          numero: i + 1,
          total: h.length,
          indice: pont.indice,
          // so ha variacao a partir da segunda: a primeira nao tem com o que comparar
          variacao: i > 0 ? pont.indice - h[i - 1].indice : null,
          maisBaixos: maisBaixos
        });
      });
    });

    saida.sort(function (a, b) {
      return (b.quando || "").localeCompare(a.quando || "") ||
             a.paciente.nome.localeCompare(b.paciente.nome);
    });
    return saida;
  }

  /* ---------- a agenda: quando cada um precisa voltar --------------------

     O metodo promete reavaliacao em 4 semanas. Ate aqui isso so existia como
     alerta DEPOIS de vencido. A data derivada — ultima aplicacao + 28 dias —
     diz antes, que e quando ainda da para fazer alguma coisa a respeito.

     E quem atende marca o dia de verdade, que nem sempre e o derivado: a
     paciente viaja, a agenda enche. Por isso a data marcada, quando existe,
     manda sobre a derivada. A tela mostra as duas, para ninguem confundir o
     que o sistema calculou com o que uma pessoa combinou.                   */

  /* A caixa antiga guardava {pid: {data}} — um retorno sem hora. Ela virou a
     tabela de consultas, e agenda.js migra o que houver na primeira carga.
     Aqui so se le o que ja virou consulta, pela porta que agenda.js abre. */
  function marcado(pid) {
    if (!window.Agenda || !window.Agenda.proxima) return null;
    var c = window.Agenda.proxima(pid);
    return c ? { data: c.data, hora: c.hora, nota: c.nota || "" } : null;
  }

  function somarDias(iso, dias) {
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return null;
    d.setDate(d.getDate() + dias);
    return d.getFullYear() + "-" +
           String(d.getMonth() + 1).padStart(2, "0") + "-" +
           String(d.getDate()).padStart(2, "0");
  }

  /** Dias daqui ate a data. Negativo quer dizer que ja passou. */
  function faltam(iso) {
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return null;
    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - hoje.getTime()) / 86400000);
  }

  function agenda() {
    var pacientes = (window.pacientesTodos && window.pacientesTodos()) || [];

    var linhas = pacientes.map(function (p) {
      var d = doPaciente(p.id);
      var ultima = d.pontuacao && d.pontuacao.quando ? d.pontuacao.quando : null;
      var derivada = ultima ? somarDias(ultima, DIAS_REAVALIACAO) : null;
      var consulta = marcado(p.id);
      var quando = (consulta && consulta.data) || derivada;
      var dias = quando ? faltam(quando) : null;

      return {
        paciente: p,
        ultima: ultima,
        derivada: derivada,
        marcada: consulta ? consulta.data : null,
        hora: consulta ? consulta.hora : null,
        nota: consulta ? consulta.nota : "",
        quando: quando,
        faltam: dias,
        grupo: quando === null ? "sem"
             : dias < 0 ? "vencida"
             : dias <= 7 ? "semana"
             : "depois"
      };
    });

    linhas.sort(function (a, b) {
      if (!a.quando && !b.quando) return a.paciente.nome.localeCompare(b.paciente.nome);
      if (!a.quando) return 1;
      if (!b.quando) return -1;
      return a.quando.localeCompare(b.quando) ||
             a.paciente.nome.localeCompare(b.paciente.nome);
    });

    function doGrupo(g) {
      return linhas.filter(function (l) { return l.grupo === g; });
    }

    return {
      linhas: linhas,
      vencidas: doGrupo("vencida"),
      semana: doGrupo("semana"),
      depois: doGrupo("depois"),
      sem: doGrupo("sem")
    };
  }

  window.Panorama = {
    doPaciente: doPaciente,
    contexto: contexto,
    alertas: alertas,
    carteira: carteira,
    consultas: consultas,
    agenda: agenda,
    situacao: situacao,
    temConteudo: temConteudo,
    DIAS_SEM_CONTATO: DIAS_SEM_CONTATO,
    DIAS_NOVO: DIAS_NOVO,
    NOME_SISTEMA: NOME_SISTEMA,
    DIAS_REAVALIACAO: DIAS_REAVALIACAO
  };
})();
