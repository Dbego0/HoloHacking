-- ============================================================================
-- FASE 1 DO SUPABASE — profiles + patients, com RLS desde o inicio
-- ============================================================================
--
-- Escopo desta migration, e so isto: a carteira basica de pacientes e quem
-- assina cada um deles. NADA de HOLOSCOPE, HOLOSCAN, exames, documentos,
-- consultas, agenda, relatorios ou storage — isso continua 100% local
-- (localStorage/IndexedDB) ate uma fase futura decidir migrar.
--
-- Projeto: sllhyymeeyoozokgbnuv (confirme o project_ref antes de aplicar).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. PROFILES — quem assina os documentos (o profissional que usa o app)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Um profile por usuario Supabase Auth. So o minimo desta fase — nome. '
  'Nao tem papel/permissao aqui: se surgir essa necessidade real, ela entra '
  'numa migration propria, documentada antes.';

alter table public.profiles enable row level security;

-- usuario autenticado so enxerga o proprio profile
create policy "profiles_select_proprio"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- usuario autenticado so altera o proprio profile
create policy "profiles_update_proprio"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- defesa em profundidade: o trigger abaixo (security definer) ja cria o
-- profile no signup, mas se algum dia existir um fluxo client-side, o
-- INSERT so pode criar a propria linha.
create policy "profiles_insert_proprio"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- Sem policy de DELETE: apagar o profile so acontece via cascade quando o
-- proprio auth.users e apagado (painel do Supabase ou Admin API).


-- Bootstrap automatico: toda vez que um usuario novo nasce em auth.users,
-- ganha uma linha em profiles. Assim a criacao do primeiro usuario (painel
-- do Supabase, ou convite) nao depende de nenhum codigo do frontend rodar
-- primeiro.
create or replace function public.lidar_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.lidar_novo_usuario();


-- ---------------------------------------------------------------------------
-- 2. PATIENTS — a carteira basica (equivalente a `pacientes` do localStorage)
-- ---------------------------------------------------------------------------
--
-- Campos e tipos espelham exatamente o formulario de cadastro atual
-- (index.html #painel-novo / app.js) para nao quebrar compatibilidade:
--   nome        <input type="text">           -> text, obrigatorio
--   nascimento  <input type="date">            -> date, opcional
--   telefone    <input type="tel"> (livre)     -> text, opcional
--   email       <input type="email">           -> text, opcional
--   sexo        <select> "" | "F" | "M"        -> text, opcional, com check
--   inicio      <input type="date">            -> date, opcional
--   queixa      <textarea> (livre)             -> text, opcional
--   status      "ativo" | "inativo", nasce ativo -> text, com check e default

create table if not exists public.patients (
  id               uuid primary key default gen_random_uuid(),
  nutritionist_id  uuid not null default auth.uid() references auth.users(id),
  nome             text not null,
  nascimento       date,
  telefone         text,
  email            text,
  sexo             text,
  inicio           date,
  queixa           text,
  status           text not null default 'ativo',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint patients_sexo_valido check (sexo is null or sexo in ('F', 'M')),
  constraint patients_status_valido check (status in ('ativo', 'inativo'))
);

comment on table public.patients is
  'Carteira basica de pacientes (Fase 1). Mapas HOLOSCOPE/HOLOSCAN, exames, '
  'documentos, consultas e agenda ainda NAO estao aqui — continuam em '
  'localStorage/IndexedDB ate uma fase futura migra-los.';

comment on column public.patients.nutritionist_id is
  'Dono do cadastro. Default auth.uid() para o cliente nao precisar enviar '
  'nada; a policy de INSERT abaixo confere de novo — nunca confia soh no '
  'valor default, mesmo que o cliente tente sobrescreve-lo.';

create index if not exists patients_nutritionist_id_idx
  on public.patients (nutritionist_id);

alter table public.patients enable row level security;

create policy "patients_select_proprios"
  on public.patients for select
  to authenticated
  using (nutritionist_id = auth.uid());

create policy "patients_insert_proprios"
  on public.patients for insert
  to authenticated
  with check (nutritionist_id = auth.uid());

create policy "patients_update_proprios"
  on public.patients for update
  to authenticated
  using (nutritionist_id = auth.uid())
  with check (nutritionist_id = auth.uid());

create policy "patients_delete_proprios"
  on public.patients for delete
  to authenticated
  using (nutritionist_id = auth.uid());

-- Nenhuma policy para o papel `anon`: sem sessao, patients e completamente
-- inacessivel — nem leitura. Sem policy de "using (true)" em lugar nenhum.


-- updated_at anda sozinho a cada UPDATE — nenhuma tela precisa lembrar de
-- mandar esse campo.
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists patients_tocar_updated_at on public.patients;
create trigger patients_tocar_updated_at
  before update on public.patients
  for each row execute function public.tocar_updated_at();
