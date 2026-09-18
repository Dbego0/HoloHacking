/* ===========================================================================
   DADOS-ROUTER — o unico lugar que decide onde cada tabela mora
   ===========================================================================

   Fase 1 do Supabase migra SO a carteira basica de pacientes. Todo o resto
   (oq3, pqq, holoscope, consultas, bloqueios, aplicacoes, perfil) continua
   em dados.js/localStorage, sem mudar uma linha.

   app.js trocou `const sb = window.DadosLocais` por `const sb =
   window.DadosRouter` — a costura que dados.js ja previa desde o inicio
   ("trocar por Supabase de verdade e trocar a linha que define `sb`"). Esta
   troca acontece so aqui, tabela por tabela, em vez de de uma vez so.

   POR QUE SO COM SESSAO ATIVA
   Sem uma sessao Supabase valida, a RLS de `patients` recusa qualquer leitura
   ou escrita mesmo assim — entao rotear para la sem sessao so trocaria um
   erro silencioso por outro. Caindo para o DadosLocais quando nao ha sessao,
   o atalho de desenvolvimento (login.js, so em localhost) e a suite de
   testes inteira continuam funcionando exatamente como antes, 100% locais,
   sem precisar de rede nem de um usuario Supabase de teste.

   `pacientes` (local) vira `patients` (Supabase) so na troca de tabela — os
   nomes de campo sao os mesmos dos dois lados, entao nenhuma tela precisa
   traduzir nada. */

(function () {
  "use strict";

  window.DadosRouter = {
    from: function (tabela) {
      var temSessao = window.HoloAuth && window.HoloAuth.sessaoAtiva();
      if (tabela === "pacientes" && window.supabaseClient && temSessao) {
        return window.supabaseClient.from("patients");
      }
      return window.DadosLocais.from(tabela);
    }
  };
})();
