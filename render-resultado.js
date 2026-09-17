/* ===========================================================================
   COMO A SÍNTESE APARECE NA TELA
   ===========================================================================

   resultado-corpo.js calcula. Este arquivo desenha. Separados de propósito:
   a conta tem que poder ser testada sem navegador, e o desenho tem que poder
   mudar sem tocar na conta.

   A REGRA DE LINGUAGEM (Especificação §21.7): tudo aqui é observação. Os
   textos dizem "observado", "recorrente", "apareceu em N de M". Nenhum diz
   "por causa de", "indica" ou "significa".

   E A REGRA NOVA: onde não há critério validado, a tela mostra a medida e
   diz que não classifica. Não existe mais selo verde/amarelo/vermelho no
   sono, nem estado sugerido no Momentum, nem sinal eleito para aprofundar —
   porque não existe fonte para nenhum dos três. O lugar da decisão clínica é
   o campo profissional, e a tela diz isso em voz alta.
   =========================================================================== */

(function () {
  "use strict";

  function escapar(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function caixa(titulo, corpo, rascunho) {
    return '<section class="res-caixa">' +
      '<h4 class="res-titulo">' + escapar(titulo) +
        (rascunho ? '<i class="res-rascunho">critério em revisão</i>' : "") + "</h4>" +
      corpo + "</section>";
  }

  function listaDeFrases(frases) {
    return '<ul class="res-frases">' + frases.filter(Boolean).map(function (f) {
      return "<li>" + escapar(f) + "</li>";
    }).join("") + "</ul>";
  }

  function tiles(itens) {
    return '<div class="res-tiles">' + itens.map(function (t) {
      return '<div class="res-tile"><b>' + escapar(t.valor) + "</b><span>" +
        escapar(t.rotulo) + "</span></div>";
    }).join("") + "</div>";
  }

  /** Uma data ISO em dd/mm. Formato de tela, nada mais. */
  function dataBR(iso) {
    if (!iso) return "—";
    var d = String(iso).slice(0, 10).split("-");
    return d.length === 3 ? d[2] + "/" + d[1] : String(iso);
  }

  function chips(itens) {
    return '<div class="res-chips">' + itens.map(function (c) {
      return '<span class="res-chip">' + escapar(c.nome) + " <b>" + c.quantos + "</b></span>";
    }).join("") + "</div>";
  }

  /* A nota de rodapé que explica por que o sistema não classificou. Ela existe
     para que a ausência de selo não seja lida como "está tudo bem". */
  function semCriterio(texto) {
    return '<p class="res-nota res-sem-criterio">' + escapar(texto) + "</p>";
  }

  /* Barra 0–10 usada pela energia e pelo momentum. O número fica ao lado —
     a barra é o desenho, não a medida. */
  function barra(rotulo, valor, extra) {
    var pct = Math.max(0, Math.min(100, Math.round((Number(valor) || 0) / 10 * 100)));
    return '<div class="res-barra">' +
      '<span class="res-barra-nome">' + escapar(rotulo) + "</span>" +
      '<span class="res-barra-trilho"><i style="width:' + pct + '%"></i></span>' +
      '<span class="res-barra-n">' + escapar(valor) + "</span>" +
      (extra ? '<span class="res-barra-extra">' + escapar(extra) + "</span>" : "") +
      "</div>";
  }

  /* ---------------------------------------------------------- por ferramenta */

  var DESENHO = {

    rotina: function (r) {
      var corpo = tiles([
        { valor: r.eventos, rotulo: r.eventos === 1 ? "evento" : "eventos" },
        { valor: r.refeicoes, rotulo: r.refeicoes === 1 ? "refeição" : "refeições" },
        { valor: r.media_fome === null ? "—" : r.media_fome, rotulo: "fome média" },
        { valor: r.media_estresse === null ? "—" : r.media_estresse, rotulo: "estresse médio" }
      ]);

      /* Fome e estresse lado a lado, e nunca somados: são duas escalas, e a
         soma delas era uma terceira que ninguém definiu. */
      if (r.pico_fome || r.pico_estresse) {
        corpo += '<div class="res-indicadores">' +
          (r.pico_fome
            ? '<div class="res-indicador"><b>Maior fome registrada</b>' +
              '<span class="res-medida">' + r.pico_fome.valor + "/10</span>" +
              '<span class="res-explica">em ' + escapar(r.pico_fome.quando.join(", ")) +
              "</span></div>"
            : "") +
          (r.pico_estresse
            ? '<div class="res-indicador"><b>Maior estresse registrado</b>' +
              '<span class="res-medida">' + r.pico_estresse.valor + "/10</span>" +
              '<span class="res-explica">em ' + escapar(r.pico_estresse.quando.join(", ")) +
              "</span></div>"
            : "") + "</div>";
      }

      corpo += r.observacoes.length
        ? listaDeFrases(r.observacoes)
        : '<p class="res-vazio">Nada a contar com os horários preenchidos até agora.</p>';

      corpo += semCriterio("Tudo acima é medida do dia registrado. O sistema não diz " +
        "que um intervalo é longo nem que uma nota é alta: não há faixa validada " +
        "para nenhuma das duas coisas.");
      return caixa("O que se lê no dia", corpo);
    },

    energia: function (r) {
      /* A série inteira, inclusive os momentos sem registro. Esconder um
         buraco é o que fazia dois momentos distantes parecerem vizinhos. */
      var corpo = '<div class="res-barras">' + r.serie.map(function (m) {
        if (m.media === null) {
          return '<div class="res-barra vazia">' +
            '<span class="res-barra-nome">' + escapar(m.nome) + "</span>" +
            '<span class="res-barra-trilho"></span>' +
            '<span class="res-barra-n">—</span>' +
            '<span class="res-barra-extra">sem registro</span></div>';
        }
        return barra(m.nome, m.media,
          m.registros + (m.registros === 1 ? " dia" : " dias") +
          (m.desvio !== null ? " · dp " + m.desvio : ""));
      }).join("") + "</div>" + listaDeFrases(r.frases);

      if (!r.estabilidade) {
        corpo += semCriterio("Estabilidade é variação baixa entre os registros de um " +
          "mesmo momento, medida por desvio-padrão. Nenhum momento chegou a " +
          r.min_observacoes + " observações válidas.");
      }
      return caixa("Disposição ao longo do dia · " +
        r.dias + (r.dias === 1 ? " dia" : " dias") + " registrados", corpo);
    },

    sinais: function (r) {
      var corpo = tiles([
        { valor: r.total, rotulo: r.total === 1 ? "sinal" : "sinais" },
        { valor: r.intensidade_media === null ? "—" : r.intensidade_media,
          rotulo: "intensidade média" },
        { valor: r.intensidade_maxima === null ? "—" : r.intensidade_maxima,
          rotulo: "intensidade máxima" }
      ]);

      corpo += '<p class="res-sub">Por categoria</p>' + chips(r.categorias);

      if (r.por_frequencia.length) {
        corpo += '<p class="res-sub">Por frequência</p>' + chips(r.por_frequencia);
      }

      corpo += '<table class="res-tabela"><thead><tr><th>Sinal</th>' +
        "<th>Frequência</th><th>Intensidade</th></tr></thead><tbody>" +
        r.relatados.map(function (s) {
          return "<tr><td>" + escapar(s.nome) + "</td><td>" +
            escapar(s.frequencia || "—") + "</td><td>" +
            (s.intensidade === null ? "—" : s.intensidade) + "</td></tr>";
        }).join("") + "</tbody></table>";

      if (r.prioridade) {
        corpo += '<p class="res-destaque"><em>Prioridade definida por você</em>' +
          escapar(r.prioridade) + "</p>";
      }

      corpo += semCriterio("Tudo acima é relato organizado, não achado. O sistema não " +
        "elege sinal para aprofundar: a prioridade do método — acompanhar, " +
        "aprofundar, correlacionar, encaminhar — é sua.");
      return caixa("O conjunto de sinais", corpo);
    },

    diario: function (r) {
      var corpo = tiles([
        { valor: r.registros, rotulo: r.registros === 1 ? "registro" : "registros" },
        { valor: r.dias, rotulo: r.dias === 1 ? "dia" : "dias" }
      ]);
      corpo += '<div class="res-barras">' + r.medias.map(function (m) {
        return barra(m.nome, m.media);
      }).join("") + "</div>";

      /* Os horários como foram dados, em ordem de relógio. Sem manhã, tarde e
         noite: esses cortes eram meus, e agrupar é onde o padrão nasce. */
      corpo += '<table class="res-tabela"><thead><tr><th>Dia</th><th>Hora</th>' +
        "<th>Fome</th><th>Saciedade</th><th>Energia</th><th>Digestão</th>" +
        "</tr></thead><tbody>" +
        r.por_hora.map(function (x) {
          return "<tr><td>" + escapar(dataBR(x.quando)) + "</td><td>" +
            escapar(x.hora || "—") + "</td><td>" +
            (x.fome === null ? "—" : x.fome) + "</td><td>" +
            (x.saciedade === null ? "—" : x.saciedade) + "</td><td>" +
            (x.energia === null ? "—" : x.energia) + "</td><td>" +
            (x.digestao === null ? "—" : x.digestao) + "</td></tr>";
        }).join("") + "</tbody></table>";

      corpo += semCriterio("O sistema não diz se isto é pouco ou bastante: " +
        "quantos registros bastam para falar de padrão, e como agrupá-los por " +
        "período do dia, são decisões do método que ainda não foram tomadas.");
      return caixa("O corpo entre as consultas", corpo);
    },

    sono: function (r) {
      /* Sem selo de nível: cada indicador mostra a medida observada, e os que
         ficaram sem resposta dizem isso em vez de sumir. */
      var corpo = '<div class="res-indicadores">' + r.indicadores.map(function (i) {
        return '<div class="res-indicador' + (i.observado ? "" : " sem-dado") + '">' +
          "<b>" + escapar(i.nome) + "</b>" +
          '<span class="res-medida">' +
            escapar(i.observado ? i.medida : "sem resposta") + "</span>" +
          '<span class="res-explica">' + escapar(i.explica) + "</span></div>";
      }).join("") + "</div>";

      corpo += '<p class="res-destaque"><em>Nesta aplicação</em>' + escapar(r.frase) + "</p>";
      corpo += semCriterio(r.nota);
      return caixa("As quatro dimensões do sono", corpo, true);
    },

    habitos: function (r) {
      var corpo = tiles([
        { valor: r.total, rotulo: r.total === 1 ? "hábito" : "hábitos" },
        { valor: r.matriz.length, rotulo: "com impacto e viabilidade" }
      ]);

      if (r.por_consistencia.length) {
        corpo += '<p class="res-sub">Consistência relatada</p>' + chips(r.por_consistencia);
      }

      if (r.matriz.length) {
        corpo += '<p class="res-sub">Impacto × viabilidade — cada hábito no plano, ' +
          "sem ordem e sem nota.</p>" + matrizHTML(r.matriz);
      }

      corpo += '<table class="res-tabela"><thead><tr><th>Hábito</th>' +
        "<th>Acontece</th><th>Impacto</th><th>Viabilidade</th></tr></thead><tbody>" +
        r.registrados.map(function (h) {
          return "<tr><td>" + escapar(h.habito) + "</td><td>" +
            escapar(h.consistencia || "—") + "</td><td>" +
            (h.impacto === null ? "—" : h.impacto) + "</td><td>" +
            (h.viabilidade === null ? "—" : h.viabilidade) + "</td></tr>";
        }).join("") + "</tbody></table>";

      if (r.prioritario) {
        corpo += '<p class="res-destaque"><em>Prioritário para testar, escolhido por você</em>' +
          escapar(r.prioritario) + "</p>";
      }

      corpo += semCriterio("A matriz distribui; ela não ordena nem escolhe. E nenhum " +
        "campo registra se um hábito sustenta ou dificulta a mudança — por isso " +
        "a tela não separa os hábitos entre bons e ruins: mostra a consistência " +
        "relatada e as duas notas, como vieram.");
      return caixa("Impacto × viabilidade", corpo);
    },

    hidratacao: function (r) {
      var corpo = '<div class="res-indicadores">' + r.blocos.map(function (b) {
        return '<div class="res-indicador">' +
          "<b>" + escapar(b.nome) + "</b>" +
          (b.medida ? '<span class="res-medida">' + escapar(b.medida) + "</span>" : "") +
          (b.sinais.length
            ? '<span class="res-explica">' + escapar(b.sinais.join(" · ")) + "</span>"
            : "") + "</div>";
      }).join("") + "</div>" +
      '<p class="res-nota">Três leituras separadas, de propósito: juntar água, ' +
      "movimento e recuperação numa nota só esconderia qual dos três está pedindo atenção.</p>";
      return caixa("Os três fundamentos", corpo);
    },

    momentum: function (r) {
      var corpo = "";

      if (r.estado_confirmado) {
        corpo += '<div class="res-estado estado-' + escapar(r.estado_confirmado.id) + '">' +
          '<span class="res-estado-rot">Estado confirmado por você</span>' +
          "<b>" + escapar(r.estado_confirmado.nome) + "</b>" +
          "<span>" + escapar(r.estado_confirmado.resumo) + "</span>" +
          '<span class="res-estado-media">' + r.respondidas + " de " +
            r.total_dimensoes + " dimensões respondidas</span>" +
          "</div>";
      } else {
        corpo += '<div class="res-estado aguardando">' +
          '<span class="res-estado-rot">Estado</span>' +
          "<b>Ainda não definido</b>" +
          "<span>O sistema não sugere estado. Escolha um na leitura profissional.</span>" +
          '<span class="res-estado-media">' + r.respondidas + " de " +
            r.total_dimensoes + " dimensões respondidas</span>" +
          "</div>";
      }

      corpo += '<div class="res-barras">' + r.dimensoes.map(function (d) {
        return barra(d.rotulo, d.valor);
      }).join("") + "</div>";

      if (r.estado_confirmado) {
        corpo += '<p class="res-sub">Conduta que este estado pede: ' +
          escapar(r.estado_confirmado.conduta.join(" · ")) + ".</p>";
      }
      if (r.justificativa) {
        corpo += '<p class="res-destaque"><em>Por que este estado</em>' +
          escapar(r.justificativa) + "</p>";
      }

      corpo += semCriterio(r.aviso);
      return caixa("Momentum", corpo, true);
    },

    compromisso: function (r) {
      var corpo = tiles([
        { valor: r.total, rotulo: r.total === 1 ? "acordo" : "acordos" },
        { valor: r.media_confianca === null ? "—" : r.media_confianca, rotulo: "confiança média" },
        { valor: r.media_importancia === null ? "—" : r.media_importancia, rotulo: "importância média" }
      ]);

      corpo += '<table class="res-tabela"><thead><tr><th>Ação</th>' +
        "<th>Importância</th><th>Confiança</th><th>Dificuldade</th></tr></thead><tbody>" +
        r.acordos.map(function (a) {
          return "<tr><td>" + escapar(a.acao) + "</td><td>" +
            (a.importancia === null ? "—" : a.importancia) + "</td><td>" +
            (a.confianca === null ? "—" : a.confianca) + "</td><td>" +
            (a.dificuldade === null ? "—" : a.dificuldade) + "</td></tr>";
        }).join("") + "</tbody></table>";

      if (r.verificados) {
        corpo += chips([
          { nome: "Realizados", quantos: r.realizados },
          { nome: "Parciais", quantos: r.parciais },
          { nome: "Não realizados", quantos: r.nao_realizados }
        ]);
      }

      corpo += semCriterio("As notas aparecem como foram dadas. O sistema não marca " +
        "acordo nenhum como frágil: não há limiar de confiança validado.");
      return caixa("Os acordos desta fase", corpo);
    }
  };

  /* ---------- a matriz impacto × viabilidade -------------------------------

     §12.6 pede uma matriz de dois eixos, e uma matriz precisa de duas
     dimensões na tela. Cada hábito é um ponto: X é viabilidade, Y é impacto,
     ambos 0–10. Não há quadrante nomeado, porque nomear quadrante seria
     escrever método — o desenho mostra onde as coisas caíram, e só. */
  function matrizHTML(pontos) {
    var L = 300, M = 34;                      // lado do plano e margem
    var pos = function (n) { return M + (Number(n) / 10) * (L - M - 12); };

    var grade = "";
    var i;
    for (i = 0; i <= 10; i += 5) {
      var x = pos(i), y = L - pos(i);
      grade += '<line class="mx-grade" x1="' + x + '" y1="0" x2="' + x + '" y2="' + (L - M) + '"/>' +
               '<line class="mx-grade" x1="' + M + '" y1="' + y + '" x2="' + L + '" y2="' + y + '"/>';
    }

    var marcas = "";
    for (i = 0; i <= 10; i += 5) {
      marcas += '<text class="mx-tick" x="' + pos(i) + '" y="' + (L - M + 16) +
                '" text-anchor="middle">' + i + "</text>" +
                '<text class="mx-tick" x="' + (M - 8) + '" y="' + (L - pos(i) + 4) +
                '" text-anchor="end">' + i + "</text>";
    }

    var bolas = pontos.map(function (h) {
      return '<g class="mx-ponto"><title>' + escapar(h.habito) + " — impacto " +
        h.impacto + ", viabilidade " + h.viabilidade + "</title>" +
        '<circle cx="' + pos(h.viabilidade) + '" cy="' + (L - pos(h.impacto)) +
        '" r="6"/></g>';
    }).join("");

    return '<div class="res-matriz"><svg viewBox="0 0 ' + L + " " + L +
      '" role="img" aria-label="Hábitos distribuídos por impacto e viabilidade">' +
      grade +
      '<line class="mx-eixo" x1="' + M + '" y1="0" x2="' + M + '" y2="' + (L - M) + '"/>' +
      '<line class="mx-eixo" x1="' + M + '" y1="' + (L - M) + '" x2="' + L + '" y2="' + (L - M) + '"/>' +
      marcas + bolas +
      '<text class="mx-eixo-rot" x="' + ((L + M) / 2) + '" y="' + (L - 2) +
        '" text-anchor="middle">viabilidade</text>' +
      '<text class="mx-eixo-rot" x="12" y="' + ((L - M) / 2) +
        '" text-anchor="middle" transform="rotate(-90 12 ' + ((L - M) / 2) + ')">impacto</text>' +
      "</svg></div>";
  }

  window.RenderResultado = {
    desenhar: function (ferramenta, resultado) {
      if (!resultado || !ferramenta || !ferramenta.resultado) return "";
      var f = DESENHO[ferramenta.resultado];
      if (!f) return "";
      try { return f(resultado); } catch (e) { return ""; }
    }
  };
})();
