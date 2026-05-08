-- =============================================================
-- COMPLEXO DMC · Plataforma EAD — Schema Supabase
-- Rodar UMA VEZ no SQL Editor do Supabase.
-- Idempotente: pode rodar de novo sem quebrar.
-- =============================================================

-- =============================================================
-- 1. PROFILES (espelho de auth.users + flag is_admin)
-- =============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  nome        text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Trigger: cria profile automaticamente quando user é criado em auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================================
-- 2. CURSOS / MÓDULOS / AULAS
-- =============================================================
create table if not exists public.cursos (
  id             text primary key,
  titulo         text not null,
  subtitulo      text,
  descricao      text,
  carga_horaria  text,
  modalidade     text default 'Online',
  icone_key      text default 'graduation',
  preco          numeric(10,2) default 0,
  link_checkout  text,
  beneficios     jsonb default '[]'::jsonb,
  ordem          int default 0,
  is_ativo       boolean default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.modulos (
  id          text primary key,
  curso_id    text not null references public.cursos(id) on delete cascade,
  numero      text,
  titulo      text not null,
  resumo      text,
  duracao     text,
  ordem       int default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.aulas (
  id          text primary key,
  modulo_id   text not null references public.modulos(id) on delete cascade,
  titulo      text not null,
  duracao     text,
  video_url   text,
  ordem       int default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_modulos_curso on public.modulos(curso_id);
create index if not exists idx_aulas_modulo  on public.aulas(modulo_id);

-- =============================================================
-- 3. LIBERAÇÕES (acesso de aluno a curso)
-- =============================================================
create table if not exists public.liberacoes (
  user_id     uuid not null references auth.users(id) on delete cascade,
  curso_id    text not null references public.cursos(id) on delete cascade,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references auth.users(id) on delete set null,
  primary key (user_id, curso_id)
);

create index if not exists idx_liberacoes_curso on public.liberacoes(curso_id);

-- =============================================================
-- 4. PROGRESSO (aulas concluídas por aluno)
-- =============================================================
create table if not exists public.progresso (
  user_id       uuid not null references auth.users(id) on delete cascade,
  aula_id       text not null references public.aulas(id) on delete cascade,
  completed_at  timestamptz not null default now(),
  primary key (user_id, aula_id)
);

-- =============================================================
-- 5. RLS — Row Level Security
-- =============================================================
alter table public.profiles    enable row level security;
alter table public.cursos      enable row level security;
alter table public.modulos     enable row level security;
alter table public.aulas       enable row level security;
alter table public.liberacoes  enable row level security;
alter table public.progresso   enable row level security;

-- Helper: is_admin() — checa se o usuário logado é admin
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------- profiles ----------
drop policy if exists "profiles_select"      on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_admin_all"   on public.profiles;

-- aluno vê o próprio profile; admin vê todos
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

-- aluno atualiza só o próprio nome (não pode mudar is_admin)
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and is_admin = (select is_admin from public.profiles where id = auth.uid()));

-- admin pode tudo em profiles
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- cursos / modulos / aulas ----------
drop policy if exists "cursos_read"        on public.cursos;
drop policy if exists "cursos_admin_write" on public.cursos;
drop policy if exists "modulos_read"        on public.modulos;
drop policy if exists "modulos_admin_write" on public.modulos;
drop policy if exists "aulas_read"          on public.aulas;
drop policy if exists "aulas_admin_write"   on public.aulas;

-- só usuários autenticados leem o catálogo
create policy "cursos_read" on public.cursos
  for select using (auth.role() = 'authenticated');
create policy "cursos_admin_write" on public.cursos
  for all using (public.is_admin()) with check (public.is_admin());

create policy "modulos_read" on public.modulos
  for select using (auth.role() = 'authenticated');
create policy "modulos_admin_write" on public.modulos
  for all using (public.is_admin()) with check (public.is_admin());

create policy "aulas_read" on public.aulas
  for select using (auth.role() = 'authenticated');
create policy "aulas_admin_write" on public.aulas
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- liberacoes ----------
drop policy if exists "liberacoes_select"      on public.liberacoes;
drop policy if exists "liberacoes_admin_write" on public.liberacoes;

-- aluno vê só as próprias liberações; admin vê tudo
create policy "liberacoes_select" on public.liberacoes
  for select using (auth.uid() = user_id or public.is_admin());

-- só admin libera/revoga
create policy "liberacoes_admin_write" on public.liberacoes
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- progresso ----------
drop policy if exists "progresso_self"       on public.progresso;
drop policy if exists "progresso_admin_read" on public.progresso;

-- aluno faz CRUD do próprio progresso
create policy "progresso_self" on public.progresso
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- admin lê progresso de todos (pra relatórios futuros)
create policy "progresso_admin_read" on public.progresso
  for select using (public.is_admin());

-- =============================================================
-- 6. updated_at automático
-- =============================================================
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists set_updated_at on public.cursos;
create trigger set_updated_at before update on public.cursos
  for each row execute procedure public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.modulos;
create trigger set_updated_at before update on public.modulos
  for each row execute procedure public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.aulas;
create trigger set_updated_at before update on public.aulas
  for each row execute procedure public.tg_set_updated_at();
