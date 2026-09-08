/* ===========================================================================
   O CASO DA MARINA — paciente ficticia da demonstracao
   ===========================================================================

   So carrega em ?demo=1. Nada disto entra no produto.

   Marina Alves, 34 anos. Cinco dietas, todas funcionaram por tres semanas.
   Compulsao por doce a noite, corpo travado ao acordar, magoa antiga, e a
   sensacao de que a vida perdeu direcao.

   O caso e coerente de ponta a ponta: as respostas do questionario produzem
   as notas que justificam a leitura combinada, que aponta as ferramentas que
   ela preencheu, que conversam com os exames que ela trouxe. Nao e um monte
   de tela bonita — e uma pessoa so, contada em todas as telas.

   As respostas da SEGUNDA aplicacao sao as mesmas, com a intensidade reduzida
   onde o trabalho foi feito. O ganho no Indice nao e inventado: sai do motor.
   =========================================================================== */

(function () {
  "use strict";
  if (!/[?&]demo=1/.test(location.search)) return;

  var PACIENTE = "_sem_paciente";

  /* ---------- as respostas ------------------------------------------------ */

  /**
   * Perfil da primeira consulta. Por origem do marcador:
   *   sintoma    intensidade 1  — queixas fisicas presentes, mas nao severas
   *   emocao     intensidade 3  — e onde ela esta pior
   *   espiritual intensidade 3  — desconexao e falta de direcao
   * Isso derruba o Metabolico e o Mental-Emocional, que e o quadro dela.
   */
  var PRIMEIRA = { sintoma: 1, emocao: 3, espiritual: 3 };

  /** Doze semanas depois: o trabalho emocional e de proposito rendeu. */
  var SEGUNDA = { sintoma: 1, emocao: 1, espiritual: 1 };

  /**
   * Resposta uniforme por origem daria a mesma nota nos cinco sistemas — todos
   * terminando em 6,7 e a Triada em 0,0 redondo. Paciente nenhum fica assim, e
   * numero redondo demais parece defeito na tela.
   *
   * A variacao vem do proprio id do marcador, entao e a mesma toda vez: dois
   * de cada cinco respondem um ponto acima, um de cada sete um ponto abaixo.
   * O resultado sai irregular como um caso de verdade, sem deixar de ser
   * reproduzivel.
   */
  function variar(base, id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff;
    var v = base;
    if (h % 5 < 2) v += 1;
    else if (h % 7 === 0) v -= 1;
    return Math.max(0, Math.min(3, v));
  }

  function respostas(perfil) {
    if (!window.HOLOSCOPE) return [];
    return window.HOLOSCOPE.questionario().map(function (q) {
      return { marcador_id: q.id, intensidade: variar(perfil[q.origem], q.id) };
    });
  }

  /* ---------- o que ela preencheu ---------------------------------------- */

  var FERRAMENTAS = {
    gatilhos_respostas: {
      gatilho1: "Briga em casa no fim do dia",
      resposta1: "Come doce até passar",
      escolha1: "Sair para caminhar dez minutos",
      gatilho2: "Reunião difícil no trabalho",
      resposta2: "Belisca a tarde inteira",
      escolha2: "Beber água e respirar antes de decidir",
      gatilho3: "Domingo à noite",
      resposta3: "Come de pé, olhando o celular",
      escolha3: "Sentar à mesa, sem tela"
    },
    circulo_sentido: {
      da_sentido: "As filhas. E o trabalho, quando não é só correria.",
      perdeu: "Cozinhar. Virou obrigação depois que virou dieta.",
      resgatar: "Cozinhar por prazer de novo, uma vez por semana",
      vazio: "Nos domingos à noite, quando a casa fica quieta"
    },
    autocompaixao: {
      nota: "3",
      frase_dura: "Você não tem força de vontade nenhuma",
      diria_amigo: "Nunca",
      quando_erra: "Desisto do dia inteiro. Se comi um doce, o dia já era."
    },
    roda_vida: {
      saude: "4", relacoes: "7", trabalho: "6", financas: "6",
      espiritualidade: "2", lazer: "3", desenvolvimento: "5", proposito: "3",
      puxa: "Propósito. Sem direção, o resto vira só tarefa."
    },
    diario_corporal: {
      data: "2026-09-05",
      fome_acordar: "0", saciedade: "1", desconforto: "2",
      sensacoes: "Barriga estufada depois do almoço quase todo dia"
    }
  };

  /** Exames da primeira consulta: confirmam o metabólico, e um diverge. */
  var EXAMES = {
    "EXA-005": 108,   // glicemia acima
    "EXA-007": 3.1,   // HOMA-IR acima
    "EXA-009": 168,   // triglicerideos acima
    "EXA-015": 62,    // GGT acima — e ela NAO se queixa do detox: diverge
    "EXA-019": 22,    // vitamina D baixa
    "EXA-002": 0.6    // PCR normal
  };

  var DOCUMENTOS = [
    { nome: "Hemograma completo — agosto", tipo: "Exame laboratorial", data: "2026-08-22" },
    { nome: "Perfil metabólico — agosto", tipo: "Exame laboratorial", data: "2026-08-22" },
    { nome: "Termo de consentimento assinado", tipo: "Termo de consentimento", data: "2026-09-01" }
  ];

  /* ---------- montar --------------------------------------------------- */

  function guardar(chave, valor) {
    var t;
    try { t = JSON.parse(localStorage.getItem(chave)) || {}; } catch (e) { t = {}; }
    t[PACIENTE] = valor;
    localStorage.setItem(chave, JSON.stringify(t));
  }

  function doze(semanasAtras) {
    var d = new Date();
    d.setDate(d.getDate() - semanasAtras * 7);
    return d.toISOString().slice(0, 10);
  }

  /** Monta o caso inteiro. Devolve as duas Pontuacoes, na ordem. */
  function montar(comEvolucao) {
    if (!window.HOLOSCOPE) return null;

    window.pacienteAtivoId = function () { return PACIENTE; };
    window.pacienteAtivoNome = function () { return "Marina Alves"; };

    var mapa = {};
    respostas(PRIMEIRA).forEach(function (x) { mapa[x.marcador_id] = x.intensidade; });
    guardar("holohacking.questionario", mapa);
    guardar("holohacking.exames", EXAMES);
    guardar("holohacking.ferramentas", FERRAMENTAS);

    // as duas aplicacoes, calculadas pelo motor
    var p1 = window.HOLOSCOPE.calcular(respostas(PRIMEIRA));
    var lista = [Object.assign({}, p1, { quando: doze(12) })];
    if (comEvolucao) {
      var p2 = window.HOLOSCOPE.calcular(respostas(SEGUNDA));
      lista.push(Object.assign({}, p2, { quando: doze(0) }));
    }
    guardar("holohacking.pontuacao", lista);

    // documentos: so metadado, o arquivo de verdade nao cabe numa demo
    if (window.ArquivoStore) {
      DOCUMENTOS.forEach(function (d) {
        var blob = new Blob(["documento de demonstração"], { type: "text/plain" });
        blob.name = d.nome;
        window.ArquivoStore.salvar(PACIENTE, blob, d).catch(function () {});
      });
    }
    return lista;
  }

  /** Mostra na tela a aplicacao pedida (0 = primeira, 1 = a de agora). */
  function mostrar(qual) {
    var h = window.historicoPontuacao ? window.historicoPontuacao() : [];
    var p = h[qual === undefined ? h.length - 1 : Math.min(qual, h.length - 1)];
    if (p && window.aplicarPontuacao) {
      // aplicarPontuacao regravaria com a data de hoje; desenha sem regravar
      window.desenharPontuacao ? window.desenharPontuacao(p) : window.aplicarPontuacao(p);
    }
    return p;
  }

  window.CasoMarina = {
    montar: montar,
    mostrar: mostrar,
    ferramentas: FERRAMENTAS,
    documentos: DOCUMENTOS
  };
})();
