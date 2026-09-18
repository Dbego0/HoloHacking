/* ===========================================================================
   SUPABASE-CLIENT — o unico lugar que conhece a URL e a chave do projeto
   ===========================================================================

   O app continua HTML/CSS/JS estatico, sem build. A biblioteca @supabase/
   supabase-js entra por CDN (build UMD, expõe window.supabase) num <script>
   antes deste arquivo — mesmo padrao dos outros scripts do projeto.

   PROJECT_URL e PUBLISHABLE_KEY NAO SAO SEGREDO. A Publishable Key (o antigo
   "anon key") e feita para viver no navegador: quem decide o que ela pode
   fazer e a Row Level Security no banco, nao o sigilo da chave. Por isso ela
   pode ficar neste arquivo, versionado.

   O QUE NUNCA ENTRA AQUI NEM EM NENHUM ARQUIVO SERVIDO AO NAVEGADOR:
   - service_role key
   - senha do banco / connection string do Postgres
   - qualquer chave descrita como "secret" no painel do Supabase

   A checagem de placeholder abaixo fica no arquivo mesmo depois de preenchido:
   e a mesma guarda que evita um deploy futuro com valor esquecido em branco.
   =========================================================================== */

(function () {
  "use strict";

  var PROJECT_URL = "https://sllhyymeeyoozokgbnuv.supabase.co";
  var PUBLISHABLE_KEY = "sb_publishable_vq17LUTsVBjLChCa5XjArw_IJ7c432Q";

  if (PROJECT_URL.indexOf("COLOQUE_AQUI") === 0 || PUBLISHABLE_KEY.indexOf("COLOQUE_AQUI") === 0) {
    console.error(
      "[supabase-client] Project URL e/ou Publishable Key ainda não foram " +
      "preenchidos em supabase-client.js. O app não vai conseguir falar " +
      "com o Supabase até isso ser feito."
    );
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error(
      "[supabase-client] a biblioteca @supabase/supabase-js não carregou " +
      "(confira o <script> do CDN antes deste arquivo)."
    );
    return;
  }

  /* auth.persistSession usa localStorage por padrão — é a sessão da pessoa
     que usa o app, não um segredo do servidor. autoRefreshToken mantém a
     sessão viva sem exigir login de novo a cada expiração do access token. */
  window.supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
})();
