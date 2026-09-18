-- ============================================================================
-- FASE 1 DO SUPABASE — otimiza as policies (auth.uid() -> (select auth.uid()))
-- ============================================================================
--
-- O advisor de performance apontou que auth.uid() dentro de USING/WITH CHECK
-- e reavaliado linha a linha. Envolver em (select ...) deixa o Postgres
-- avaliar uma vez so por consulta. Recomendacao oficial do proprio linter do
-- Supabase — sem mudanca de comportamento, so de custo.
-- ============================================================================

alter policy "profiles_select_proprio" on public.profiles
  using (id = (select auth.uid()));

alter policy "profiles_update_proprio" on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "profiles_insert_proprio" on public.profiles
  with check (id = (select auth.uid()));

alter policy "patients_select_proprios" on public.patients
  using (nutritionist_id = (select auth.uid()));

alter policy "patients_insert_proprios" on public.patients
  with check (nutritionist_id = (select auth.uid()));

alter policy "patients_update_proprios" on public.patients
  using (nutritionist_id = (select auth.uid()))
  with check (nutritionist_id = (select auth.uid()));

alter policy "patients_delete_proprios" on public.patients
  using (nutritionist_id = (select auth.uid()));
