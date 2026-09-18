-- ============================================================================
-- FASE 1 DO SUPABASE — endurece as duas funcoes criadas na migration anterior
-- ============================================================================
--
-- O advisor de seguranca (mcp get_advisors) apontou dois achados reais logo
-- apos aplicar 20260918181315_fase1_profiles_patients.sql:
--
--  1. tocar_updated_at tinha search_path mutavel (esqueci o `set search_path`
--     que lidar_novo_usuario ja tinha) — um search_path nao fixado permite,
--     em teoria, que alguem com permissao de criar objetos no schema public
--     sequestre a resolucao de nomes dentro da funcao.
--
--  2. lidar_novo_usuario() e SECURITY DEFINER e, por ser uma funcao comum no
--     schema public, o PostgREST expoe ela como RPC publico
--     (/rest/v1/rpc/lidar_novo_usuario), chamavel por anon e authenticated.
--     Ela so faz sentido rodando como trigger de auth.users (usa NEW, que so
--     existe em contexto de trigger) — nao precisa e nao deve ser chamavel
--     direto pela API.
-- ============================================================================

alter function public.tocar_updated_at() set search_path = public;

revoke execute on function public.lidar_novo_usuario() from public;
revoke execute on function public.lidar_novo_usuario() from anon;
revoke execute on function public.lidar_novo_usuario() from authenticated;
-- O trigger continua funcionando: um trigger roda com o dono da funcao,
-- independente de grants de EXECUTE para outros papeis.
