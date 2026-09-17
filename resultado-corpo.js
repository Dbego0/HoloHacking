/* ===========================================================================
   SÍNTESES DO MÓDULO CORPO
   ===========================================================================

   A Especificação Mestre pede (§3.3) que toda ferramenta gere alguma síntese.
   Este arquivo produz essa síntese a partir das respostas — e só dela.

   TRÊS REGRAS QUE GOVERNAM TUDO AQUI

   1. Recalculável. Nada é guardado que não saia das respostas (§4.1). Se a
      resposta mudar, a síntese muda junto; se a fórmula mudar, a síntese
      antiga pode ser refeita sobre a resposta antiga.

   2. Observação, nunca causa (§21.3, §21.7). Estas funções contam, ordenam e
      comparam. Elas dizem "a energia caiu depois do almoço em 4 de 5 dias".
      Não dizem por quê. A linguagem é sempre "observado", "recorrente",
      "junto com" — jamais "causado por", "indica" ou "significa".

   3. **Nenhum limiar clínico sem fonte.** Onde não há faixa validada, não há
      classificação: a síntese mostra a medida e para. Oito classificadores
      saíram daqui por não terem fonte nenhuma —

        · o estado do Momentum pela média das seis dimensões;
        · os três níveis dos indicadores de sono;
        · o "candidato a aprofundamento" dos sinais;
        · o disparo de "redesenhe a ação" por confiança abaixo de 7;
        · o intervalo entre refeições só exibido a partir de 5h;
        · fome e estresse marcados a partir de 8;
        · a "janela mais carregada" pela soma de fome com estresse;
        · "há padrão para ler" a partir de 5 registros do diário,
          e os cortes de manhã, tarde e noite que o acompanhavam.

      Nenhum foi trocado por outro número. Todos viraram campo profissional
      ou medida bruta.

      O ÚNICO limiar que resta neste arquivo é MIN_OBS_ESTABILIDADE = 3, e ele
      não é meu: veio de uma decisão explícita sobre o método. Fora dele, toda
      função aqui conta, ordena, formata — e nada mais.

   O que é clínico não mora aqui: mora em corpo-bancos.js, como dado com
   `provenance` e `status`. Esta camada só aplica o que aquele arquivo declara.
   =========================================================================== */

(function () {
  "use strict";

  function bancos() { return window.CorpoBancos || null; }

  /** Números de verdade, ignorando o que não foi respondido. */
  function numeros(lista, campo) {
    return (lista || []).map(function (i) {
      var v = i && i[campo];
      return v === "" || v == null ? null : Number(v);
    }).filter(function (n) { return n !== null && isFinite(n); });
  }

  /** Um valor só conta como resposta se existe e é número. */
  function respondido(v) {
    return v !== "" && v != null && isFinite(Number(v));
  }

  function media(ns) {
    if (!ns.length) return null;
    return Math.round(ns.reduce(function (a, b) { return a + b; }, 0) / ns.length * 10) / 10;
  }

  /* Desvio-padrão populacional. É medida descritiva de dispersão: quanto mais
     baixo, menos os registros daquele momento variaram entre si. Não diz nada
     sobre causa, e não é nota. */
  function desvio(ns) {
    if (ns.length < 2) return null;
    var m = ns.reduce(function (a, b) { return a + b; }, 0) / ns.length;
    var v = ns.reduce(function (s, n) { return s + (n - m) * (n - m); }, 0) / ns.length;
    return Math.round(Math.sqrt(v) * 10) / 10;
  }

  function minutos(hhmm) {
    if (!hhmm) return null;
    var p = String(hhmm).split(":");
    if (p.length < 2) return null;
    var n = Number(p[0]) * 60 + Number(p[1]);
    return isFinite(n) ? n : null;
  }

  function plural(n, um, muitos) { return n + " " + (n === 1 ? um : muitos); }

  /** Minutos em "5h30" ou "45min". Formato, não juízo. */
  function duracaoBR(min) {
    var h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + "min";
    return h + "h" + (m ? String(m).padStart(2, "0") : "");
  }

  /* Conta quantos itens de uma lista responderam cada valor de uma escala,
     na ordem da própria escala. Puramente descritivo. */
  function contarPor(lista, campo, escala) {
    return (escala || []).map(function (v) {
      return {
        nome: v,
        quantos: lista.filter(function (i) { return i[campo] === v; }).length
      };
    }).filter(function (x) { return x.quantos > 0; });
  }

  /* ====================================================== MAPA DA ROTINA === */

  /* Fatos objetivos sobre o dia — §7.6. Todos contáveis a partir dos horários
     e dos tipos declarados. Nenhum deles conclui nada.

     ZERO LIMIAR. Havia aqui quatro decisões clínicas que eu tinha escrito:
     só mostrar o intervalo entre refeições a partir de 5h, marcar fome e
     estresse a partir de 8, e chamar de "janela mais carregada" o momento de
     maior soma fome + estresse. Nenhuma vinha do método.

     O que ficou mede e mostra. O intervalo aparece sempre, sem adjetivo. Os
     picos aparecem com o valor e o horário em que ocorreram — sem dizer que
     são altos. E fome e estresse não são somados: são duas escalas
     diferentes, e somá-las inventava uma terceira. */
  function rotina(r) {
    var eventos = (r.eventos || []).filter(function (e) {
      return e && (e.inicio || e.titulo);
    });
    if (!eventos.length) return null;

    var comHora = eventos.filter(function (e) { return minutos(e.inicio) !== null; })
      .sort(function (a, b) { return minutos(a.inicio) - minutos(b.inicio); });

    var observacoes = [];
    var i;

    /* O maior intervalo entre duas refeições seguidas. Sempre exibido quando
       há duas ou mais, e sem adjetivo: "maior intervalo observado" é um fato
       do dia; "intervalo longo" seria um juízo. */
    var refeicoes = comHora.filter(function (e) { return e.tipo === "Refeição"; });
    var maiorIntervalo = null;
    for (i = 1; i < refeicoes.length; i++) {
      var dif = minutos(refeicoes[i].inicio) - minutos(refeicoes[i - 1].inicio);
      if (maiorIntervalo === null || dif > maiorIntervalo.min) {
        maiorIntervalo = { min: dif, de: refeicoes[i - 1].inicio, ate: refeicoes[i].inicio };
      }
    }
    if (maiorIntervalo) {
      maiorIntervalo.texto = duracaoBR(maiorIntervalo.min);
      observacoes.push("Maior intervalo observado entre refeições: " +
        maiorIntervalo.texto + ", das " + maiorIntervalo.de +
        " às " + maiorIntervalo.ate + ".");
    }

    // ausência de pausas: contagem, não avaliação
    if (!eventos.some(function (e) { return e.tipo === "Pausa"; })) {
      observacoes.push("Nenhum evento do tipo Pausa foi registrado.");
    }

    /* Os picos de fome e de estresse, separados. Cada um traz o valor e TODOS
       os momentos em que ele apareceu — sem desempate arbitrário, e sem dizer
       que o valor é alto. Quem desenha é o render; aqui só sai a medida. */
    var pico = function (campo) {
      var comValor = eventos.filter(function (e) { return respondido(e[campo]); });
      if (!comValor.length) return null;
      var max = Math.max.apply(null, comValor.map(function (e) { return Number(e[campo]); }));
      return {
        valor: max,
        quando: comValor.filter(function (e) { return Number(e[campo]) === max; })
          .map(function (e) { return e.inicio || e.titulo || e.tipo || "sem horário"; })
      };
    };

    var picoFome = pico("fome");
    var picoEstresse = pico("estresse");

    return {
      eventos: eventos.length,
      refeicoes: refeicoes.length,
      maior_intervalo: maiorIntervalo,
      pico_fome: picoFome,
      pico_estresse: picoEstresse,
      observacoes: observacoes,
      media_fome: media(numeros(eventos, "fome")),
      media_energia: media(numeros(eventos, "energia")),
      media_estresse: media(numeros(eventos, "estresse")),
      sem_limiar: true
    };
  }

  /* ==================================================== ENERGIA VITAL ====== */

  /* A sequência oficial do dia. A ORDEM importa: é ela que define o que é um
     par consecutivo, e um momento sem registro não pode ser removido para
     aproximar os vizinhos. */
  var MOMENTOS = [
    { id: "acordar", nome: "ao acordar" },
    { id: "meio_manha", nome: "meio da manhã" },
    { id: "pos_almoco", nome: "depois do almoço" },
    { id: "fim_tarde", nome: "fim da tarde" },
    { id: "noite", nome: "à noite" }
  ];

  /* Mínimo de observações para falar de variabilidade. Com uma ou duas
     medidas não há dispersão que signifique alguma coisa. */
  var MIN_OBS_ESTABILIDADE = 3;

  function energia(r) {
    var dias = (r.dias || []).filter(function (d) {
      return d && MOMENTOS.some(function (m) { return respondido(d[m.id]); });
    });
    if (!dias.length) return null;

    /* A série inteira, na ordem oficial, com `media: null` onde ninguém
       registrou. Nada é removido daqui — é o que garante que dois momentos
       das pontas nunca sejam tratados como vizinhos. */
    var serie = MOMENTOS.map(function (m) {
      var ns = numeros(dias, m.id);
      return {
        id: m.id, nome: m.nome, registros: ns.length,
        media: media(ns), desvio: desvio(ns)
      };
    });

    var porMomento = serie.filter(function (m) { return m.media !== null; });
    if (!porMomento.length) return null;

    var maisBaixo = porMomento.slice().sort(function (a, b) { return a.media - b.media; })[0];

    /* MAIOR QUEDA — só entre pares consecutivos da sequência oficial, e só
       quando os DOIS momentos do par têm registro. Um buraco na série
       interrompe o par; ele não é costurado. */
    var maiorQueda = null;
    var i;
    for (i = 1; i < serie.length; i++) {
      var de = serie[i - 1], para = serie[i];
      if (de.media === null || para.media === null) continue;
      var q = Math.round((de.media - para.media) * 10) / 10;
      if (q > 0 && (!maiorQueda || q > maiorQueda.queda)) {
        maiorQueda = { queda: q, de: de.nome, para: para.nome,
                       de_id: de.id, para_id: para.id };
      }
    }

    /* RECORRÊNCIA — o denominador são os dias que têm resposta nos DOIS
       momentos do par, nunca todos os dias registrados. Três dias com o par
       completo e queda nos três é "3 de 3", não "3 de 5". */
    var recorrencia = null;
    if (maiorQueda) {
      var comOPar = dias.filter(function (d) {
        return respondido(d[maiorQueda.de_id]) && respondido(d[maiorQueda.para_id]);
      });
      var vezes = comOPar.filter(function (d) {
        return Number(d[maiorQueda.para_id]) < Number(d[maiorQueda.de_id]);
      }).length;
      recorrencia = { vezes: vezes, de: comOPar.length };
    }

    /* ESTABILIDADE — é dispersão baixa, não média alta. Mede-se pelo
       desvio-padrão dos registros daquele momento, e exige um mínimo de
       observações para dizer qualquer coisa. */
    var comObservacoes = serie.filter(function (m) {
      return m.registros >= MIN_OBS_ESTABILIDADE && m.desvio !== null;
    });
    var estabilidade = comObservacoes.length
      ? comObservacoes.slice().sort(function (a, b) { return a.desvio - b.desvio; })[0]
      : null;

    var fraseEstabilidade = estabilidade
      ? "Menor variação " + estabilidade.nome + " (desvio-padrão " +
        estabilidade.desvio + " em " +
        plural(estabilidade.registros, "registro", "registros") + ")."
      : "Dados insuficientes para avaliar estabilidade.";

    return {
      dias: dias.length,
      serie: serie,
      por_momento: porMomento,
      mais_baixo: maisBaixo,
      maior_queda: maiorQueda,
      recorrencia: recorrencia,
      estabilidade: estabilidade,
      min_observacoes: MIN_OBS_ESTABILIDADE,
      frases: [
        maiorQueda
          ? "Queda observada " + maiorQueda.para + ", de " + maiorQueda.de +
            " (−" + maiorQueda.queda + ")" +
            (recorrencia ? ", em " + recorrencia.vezes + " de " +
              plural(recorrencia.de, "dia", "dias") : "") + "."
          : null,
        "Menor média " + maisBaixo.nome + " (" + maisBaixo.media + ").",
        fraseEstabilidade
      ].filter(Boolean)
    };
  }

  /* ================================================= LEITURA DE SINAIS ===== */

  /* NENHUMA PRIORIDADE AUTOMÁTICA.

     Havia aqui um `para_aprofundar` que elegia sinais por frequência alta E
     intensidade ≥ 7, com um comentário dizendo que era o critério da
     especificação. Não era: o §9.6 lista quatro prioridades — acompanhar,
     aprofundar, correlacionar, encaminhar — e quem as atribui é a
     nutricionista, no campo do §9.8.

     O que sobrou conta e agrupa o que foi relatado, na escala do §9.5. Não
     elege nada, não pontua nada, e não há red flags (§9.7 permite, mas não
     lista nenhuma — e inventar alerta de segurança seria escrever método). */
  function sinais(r) {
    var lista = (r.sinais || []).filter(function (s) { return s && s.nome; });
    if (!lista.length) return null;

    var b = bancos();

    var porCategoria = {};
    lista.forEach(function (s) {
      var c = s.categoria || "Outro";
      porCategoria[c] = (porCategoria[c] || 0) + 1;
    });

    var intensidades = numeros(lista, "intensidade");

    return {
      total: lista.length,
      categorias: Object.keys(porCategoria).map(function (c) {
        return { nome: c, quantos: porCategoria[c] };
      }).sort(function (a, b2) { return b2.quantos - a.quantos; }),

      /* Quantos sinais em cada degrau da escala do §9.5. Contagem, não juízo. */
      por_frequencia: contarPor(lista, "frequencia", (b && b.SINAIS_FREQUENCIA) || []),

      intensidade_media: media(intensidades),
      intensidade_maxima: intensidades.length ? Math.max.apply(null, intensidades) : null,

      relatados: lista.map(function (s) {
        return {
          nome: s.nome,
          categoria: s.categoria || "",
          frequencia: s.frequencia || "",
          intensidade: respondido(s.intensidade) ? Number(s.intensidade) : null
        };
      }),

      /* A prioridade do §9.6, como quem atende a escolheu. Nunca derivada. */
      prioridade: r.prioridade_sinais || null,
      sem_prioridade_automatica: true
    };
  }

  /* ==================================================== DIÁRIO CORPORAL ==== */

  /* ZERO LIMIAR, ZERO AGRUPAMENTO.

     Saíram duas decisões minhas: "a partir de 5 registros há padrão para ler",
     e os cortes de período do dia (manhã antes das 12h, tarde antes das 18h).
     A especificação não traz nem um nem outro. O §10.7 pede "padrões por
     horário" — mas não diz o que é um horário para esse efeito, e inventar o
     corte é inventar o padrão.

     O que ficou conta registros e dias, tira as médias de cada campo, e
     mostra os horários como foram dados. */
  function diario(r) {
    var regs = (r.registros || []).filter(function (x) {
      return x && (x.quando || x.hora);
    });
    if (!regs.length) return null;

    var campos = [
      { id: "fome", nome: "Fome" }, { id: "saciedade", nome: "Saciedade" },
      { id: "energia", nome: "Energia" }, { id: "digestao", nome: "Conforto digestivo" }
    ];

    var medias = campos.map(function (c) {
      return { nome: c.nome, media: media(numeros(regs, c.id)) };
    }).filter(function (c) { return c.media !== null; });

    var dias = {};
    regs.forEach(function (x) { if (x.quando) dias[x.quando] = true; });

    /* Os registros com o horário que foi dado, em ordem de relógio. Sem
       agrupamento: quem lê vê as horas reais. */
    var porHora = regs.slice().sort(function (a, b) {
      var ma = minutos(a.hora), mb = minutos(b.hora);
      if (ma === null) return 1;
      if (mb === null) return -1;
      return ma - mb;
    }).map(function (x) {
      return {
        quando: x.quando || "", hora: x.hora || "",
        fome: respondido(x.fome) ? Number(x.fome) : null,
        saciedade: respondido(x.saciedade) ? Number(x.saciedade) : null,
        energia: respondido(x.energia) ? Number(x.energia) : null,
        digestao: respondido(x.digestao) ? Number(x.digestao) : null
      };
    });

    return {
      registros: regs.length,
      dias: Object.keys(dias).length,
      medias: medias,
      por_hora: porHora,
      sem_agrupamento: true,
      sem_limiar: true
    };
  }

  /* ========================================================= RITMO & SONO == */

  /* SEM CLASSIFICAÇÃO.

     Os quatro indicadores do §11.5 continuam existindo e continuam separados
     — nenhuma nota única, como o método exige. O que saiu foram as faixas que
     os classificavam em adequado / atenção / prioridade: 7 a 9 horas, varia
     menos de 1 hora, dorme em até 20 minutos. Nenhuma delas está na
     especificação, e todas estavam marcadas como se estivessem.

     Agora cada indicador mostra a medida observada. E a frase de fechamento
     diz quantos indicadores foram observados — nunca "os quatro apareceram
     adequados" quando dois deles sequer tinham dados. */
  function sono(r) {
    var b = bancos();
    if (!b) return null;

    var dorme = minutos(r.dorme), acorda = minutos(r.acorda);
    var horas = null;
    if (dorme !== null && acorda !== null) {
      var d = acorda - dorme;
      if (d <= 0) d += 24 * 60;          // atravessou a meia-noite
      horas = Math.round(d / 60 * 10) / 10;
    }

    var despertares = respondido(r.despertares) ? Number(r.despertares) : null;
    var continuidade = [
      r.latencia || null,
      despertares !== null ? "despertares " + despertares + "/3" : null
    ].filter(Boolean).join(" · ");

    var medidas = {
      duracao:      horas !== null ? horas + "h" : null,
      regularidade: r.variacao || null,
      continuidade: continuidade || null,
      recuperacao:  r.acorda_como || null
    };

    var indicadores = b.SONO.indicadores.map(function (def) {
      return {
        id: def.id, nome: def.nome, explica: def.explica,
        medida: medidas[def.id] || null,
        observado: medidas[def.id] != null
      };
    });

    var observados = indicadores.filter(function (i) { return i.observado; }).length;
    if (!observados) return null;

    return {
      horas: horas,
      indicadores: indicadores,
      observados: observados,
      total: indicadores.length,
      classifica: false,
      frase: observados === indicadores.length
        ? "Os quatro indicadores têm dados nesta aplicação."
        : observados + " de " + indicadores.length +
          " indicadores têm dados nesta aplicação; os demais ficaram sem resposta.",
      nota: b.SONO.por_que_sem_niveis
    };
  }

  /* ================================================ INVENTÁRIO DE HÁBITOS == */

  /* MATRIZ, NÃO SCORE.

     O §12.6 fala em matriz Impacto × Viabilidade. Havia aqui uma soma dos
     dois — `alavancagem = impacto + viabilidade` — ordenando os hábitos e
     elegendo três candidatos, sob um comentário que chamava isso de "a matriz
     da especificação". Uma soma não é uma matriz: ela achata dois eixos num
     número e apaga a diferença entre (10,2) e (6,6).

     Agora a função devolve os pontos da matriz — cada hábito com as suas duas
     coordenadas — e nada mais. Quem escolhe o hábito prioritário é quem
     atende, no campo do §12.7.

     E não há mais `ausentes` entregue onde o §12.7 pede "hábitos que mais
     atrapalham": um hábito que não acontece é um hábito ausente, não um que
     atrapalha. Nenhum campo captura se um hábito sustenta ou dificulta, e
     inventar essa informação a partir da consistência seria falsificá-la. */
  function habitos(r) {
    var lista = (r.habitos || []).filter(function (h) { return h && h.habito; });
    if (!lista.length) return null;

    var b = bancos();

    var registrados = lista.map(function (h) {
      return {
        habito: h.habito,
        categoria: h.categoria || "",
        consistencia: h.consistencia || "",
        impacto: respondido(h.impacto) ? Number(h.impacto) : null,
        viabilidade: respondido(h.viabilidade) ? Number(h.viabilidade) : null,
        observacao: h.observacao || ""
      };
    });

    /* Os pontos do plano: X = viabilidade, Y = impacto. Sem ordem, sem nota,
       sem recorte — o desenho é que mostra onde cada um caiu. */
    var matriz = registrados.filter(function (h) {
      return h.impacto !== null && h.viabilidade !== null;
    });

    return {
      total: lista.length,
      registrados: registrados,
      por_consistencia: contarPor(lista, "consistencia",
                                  (b && b.HABITOS_CONSISTENCIA) || []),
      matriz: matriz,
      sem_matriz: registrados.length - matriz.length,
      /* O hábito prioritário é escolha profissional — §12.7. */
      prioritario: r.testar || null,
      sem_ordenacao_automatica: true
    };
  }

  /* ============================================ HIDRATAÇÃO & MOVIMENTO ===== */

  /* Três leituras separadas — §13.7 proíbe nota única misturando as três.

     Não há limiar nenhum nesta função, de propósito: a especificação não dá
     nenhum, e a "principal oportunidade" do §13.8 exigiria exatamente os
     limiares que não existem. Ela está na lista de pendências. */
  function hidratacao(r) {
    var blocos = [];

    var copos = r.copos === "" || r.copos == null ? null : Number(r.copos);
    if (copos !== null || r.sede !== "" && r.sede != null) {
      blocos.push({
        id: "hidratacao", nome: "Hidratação",
        medida: copos !== null ? plural(copos, "copo por dia", "copos por dia") : null,
        sinais: [
          r.sede !== "" && r.sede != null ? "sede " + r.sede + "/3" : null,
          r.acesso !== "" && r.acesso != null ? "água por perto " + r.acesso + "/3" : null
        ].filter(Boolean)
      });
    }

    var sentado = r.sentado === "" || r.sentado == null ? null : Number(r.sentado);
    if (sentado !== null || (r.pausas !== "" && r.pausas != null)) {
      blocos.push({
        id: "movimento", nome: "Movimento",
        medida: sentado !== null ? plural(sentado, "hora sentado", "horas sentado") : null,
        sinais: [
          r.pausas !== "" && r.pausas != null ? "pausas " + r.pausas + "/3" : null,
          r.cotidiano !== "" && r.cotidiano != null ? "movimento cotidiano " + r.cotidiano + "/3" : null,
          r.mobilidade !== "" && r.mobilidade != null ? "mobilidade " + r.mobilidade + "/10" : null
        ].filter(Boolean)
      });
    }

    var cansaco = r.cansaco === "" || r.cansaco == null ? null : Number(r.cansaco);
    var recupera = r.recupera === "" || r.recupera == null ? null : Number(r.recupera);
    if (cansaco !== null || recupera !== null) {
      blocos.push({
        id: "recuperacao", nome: "Recuperação",
        medida: recupera !== null ? "recuperação " + recupera + "/10" : null,
        sinais: [cansaco !== null ? "cansaço no fim do dia " + cansaco + "/10" : null].filter(Boolean)
      });
    }

    if (!blocos.length) return null;
    return { blocos: blocos };
  }

  /* =========================================================== MOMENTUM ==== */

  /* SEM ESTADO SUGERIDO.

     O §14.6 é literal: "O estado não deve ser definido por um único número.
     Ele deve ser derivado de múltiplas dimensões + validação profissional."

     O que havia aqui fazia exatamente o contrário: média das seis dimensões,
     com "carga de vida" invertida, caindo em faixas de 3.4 / 5.9 / 7.9 — três
     números que não existem na especificação e que estavam declarados como se
     existissem. A média, a inversão e os cortes foram removidos. Não há
     substituto: enquanto a regra multi-dimensional não for escrita, o sistema
     mostra o perfil e não opina.

     `estado_sugerido` é sempre null, e está aqui para ser explícito — quem lê
     o objeto vê que a ausência é deliberada, não um esquecimento. */
  function momentum(r) {
    var b = bancos();
    if (!b) return null;

    var dims = b.MOMENTUM.dimensoes.map(function (d) {
      if (!respondido(r[d.id])) return null;
      return { id: d.id, rotulo: d.rotulo, valor: Number(r[d.id]) };
    }).filter(Boolean);

    if (!dims.length) return null;

    /* O estado que quem atende confirmou — por nome ou por id. */
    var escolhido = r.estado_confirmado || "";
    var estado = b.MOMENTUM.estados.filter(function (e) {
      return e.nome === escolhido || e.id === escolhido;
    })[0] || null;

    return {
      dimensoes: dims,
      respondidas: dims.length,
      total_dimensoes: b.MOMENTUM.dimensoes.length,

      estado_sugerido: null,
      classificacao_automatica: false,

      estado_confirmado: estado
        ? { id: estado.id, nome: estado.nome, resumo: estado.resumo,
            conduta: estado.conduta }
        : null,
      justificativa: r.justificativa_estado || null,
      aguarda_confirmacao: !estado,
      aviso: b.MOMENTUM.por_que_sem_sugestao
    };
  }

  /* ========================================================= COMPROMISSO === */

  /* SEM CORTE DE CONFIANÇA.

     O §15.8 diz que, se a confiança for baixa, o sistema deve sugerir
     "Redesenhe a ação" em vez de "Aumente a motivação". Ele não diz o que é
     baixa. O código dizia 7, e o comentário atribuía esse 7 a "literatura de
     entrevista motivacional citada na especificação" — a especificação não
     cita literatura nenhuma. Nem o número nem a referência existiam.

     A frase do §15.8 continua no método e volta quando houver limiar validado.
     Enquanto isso, a síntese mostra as notas como foram dadas, e a pergunta do
     §15.7 — "o que faria sua confiança aumentar um ponto?" — é um campo fixo
     da ferramenta, que aparece sempre, independentemente de qualquer nota. */
  function compromisso(r) {
    var acordos = (r.acordos || []).filter(function (a) { return a && a.acao; });
    if (!acordos.length) return null;

    var verificados = acordos.filter(function (a) {
      return a.resultado_acordo && a.resultado_acordo !== "Ainda nao verificado";
    });

    return {
      total: acordos.length,
      media_confianca: media(numeros(acordos, "confianca")),
      media_importancia: media(numeros(acordos, "importancia")),
      media_dificuldade: media(numeros(acordos, "dificuldade")),

      /* Cada acordo com as suas notas, como foram dadas. Sem recorte. */
      acordos: acordos.map(function (a) {
        return {
          acao: a.acao,
          importancia: respondido(a.importancia) ? Number(a.importancia) : null,
          confianca: respondido(a.confianca) ? Number(a.confianca) : null,
          dificuldade: respondido(a.dificuldade) ? Number(a.dificuldade) : null,
          barreira: a.barreira || "",
          plano_b: a.plano_b || "",
          resultado: a.resultado_acordo || ""
        };
      }),

      sem_limiar_de_confianca: true,
      verificados: verificados.length,
      realizados: acordos.filter(function (a) { return a.resultado_acordo === "Realizado"; }).length,
      parciais: acordos.filter(function (a) { return a.resultado_acordo === "Parcialmente realizado"; }).length,
      nao_realizados: acordos.filter(function (a) { return a.resultado_acordo === "Nao realizado"; }).length
    };
  }

  /* ---------- a porta ------------------------------------------------------ */

  var FUNCOES = {
    rotina: rotina, energia: energia, sinais: sinais, diario: diario,
    sono: sono, habitos: habitos, hidratacao: hidratacao,
    momentum: momentum, compromisso: compromisso
  };

  window.ResultadoCorpo = {
    /** Deriva a síntese de uma ferramenta a partir das respostas dela. */
    derivar: function (ferramenta, respostas) {
      if (!ferramenta || !ferramenta.resultado) return null;
      var f = FUNCOES[ferramenta.resultado];
      if (!f) return null;
      try { return f(respostas || {}); } catch (e) { return null; }
    },
    tem: function (nome) { return !!FUNCOES[nome]; }
  };
})();
